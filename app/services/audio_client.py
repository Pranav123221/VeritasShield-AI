import io
import json
import os
import uuid
import wave
import requests

from app.services.meta_client import (
    get_client,
    get_model,
    extract_response_text,
    parse_json_response,
    verify_claim_with_web,
    normalize_verdict,
    emit_event,
)


META_BASE_URL = "https://api.meta.ai/v1"
ASR_MODEL = "muse-voice-transcribe-1.0"

MAX_AUDIO_BYTES = 30 * 1024 * 1024
MAX_AUDIO_SECONDS = 600

ALLOWED_SAMPLE_RATES = {16000, 24000}


# ---------------------------------------------------------
# WAV VALIDATION
# ---------------------------------------------------------

def validate_wav(audio_bytes: bytes) -> dict:
    if not audio_bytes:
        raise ValueError("Audio file is empty.")

    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise ValueError("Audio file exceeds the 30 MB upload limit.")

    try:
        with wave.open(io.BytesIO(audio_bytes), "rb") as wav:
            channels = wav.getnchannels()
            sample_width = wav.getsampwidth()
            sample_rate = wav.getframerate()
            frame_count = wav.getnframes()
            compression = wav.getcomptype()

    except (wave.Error, EOFError) as exc:
        raise ValueError(
            "Invalid WAV file. Please upload a valid PCM WAV recording."
        ) from exc

    if channels != 1:
        raise ValueError("Audio must be mono (1 channel).")

    if sample_width != 2:
        raise ValueError("Audio must use 16-bit PCM encoding.")

    if sample_rate not in ALLOWED_SAMPLE_RATES:
        raise ValueError(
            "Audio sample rate must be 16000 Hz or 24000 Hz."
        )

    if compression != "NONE":
        raise ValueError("Compressed WAV audio is not supported.")

    duration = frame_count / sample_rate if sample_rate else 0

    if duration <= 0:
        raise ValueError("Audio contains no playable frames.")

    if duration > MAX_AUDIO_SECONDS:
        raise ValueError("Audio duration cannot exceed 10 minutes.")

    return {
        "channels": channels,
        "sample_width": sample_width,
        "sample_rate": sample_rate,
        "duration_seconds": round(duration, 2),
        "frame_count": frame_count,
    }


# ---------------------------------------------------------
# META AUDIO TRANSCRIPTION
# ---------------------------------------------------------

def transcribe_audio(
    audio_bytes: bytes,
    run_id: str | None = None,
) -> dict:

    audio_info = validate_wav(audio_bytes)

    api_key = os.getenv("MODEL_API_KEY")

    if not api_key:
        raise RuntimeError("MODEL_API_KEY is missing.")

    session_id = run_id or str(uuid.uuid4())

    emit_event(
        run_id,
        "audio_transcription_started",
        "Audio uploaded. Meta Voice Transcribe is processing it.",
        {
            "model": ASR_MODEL,
            "duration_seconds": audio_info["duration_seconds"],
            "size_bytes": len(audio_bytes),
        },
    )

    request_settings = {
        "model": ASR_MODEL,
        "audioEncoding": "WAV",
        "mode": "DIARIZATION",
    }

    try:
        response = requests.post(
            f"{META_BASE_URL}/asr/transcribe",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/json",
            },
            params={"sessionId": session_id},
            files={
                "request": (
                    None,
                    json.dumps(request_settings),
                    "application/json",
                ),
                "audio": (
                    "recording.wav",
                    audio_bytes,
                    "audio/wav",
                ),
            },
            timeout=(15, 240),
        )

        if not response.ok:
            try:
                error_data = response.json()
                error_message = (
                    error_data.get("message")
                    or error_data.get("error")
                    or response.text[:500]
                )
            except ValueError:
                error_message = response.text[:500]

            raise RuntimeError(
                f"Meta transcription failed ({response.status_code}): "
                f"{error_message}"
            )

        data = response.json()

    except requests.Timeout as exc:
        raise RuntimeError(
            "Audio transcription timed out. Please try a shorter recording."
        ) from exc

    except requests.RequestException as exc:
        raise RuntimeError(
            f"Could not connect to Meta transcription service: {exc}"
        ) from exc

    transcript = data.get("transcript", "")

    if not isinstance(transcript, str) or not transcript.strip():
        raise RuntimeError(
            "Meta transcription returned an empty transcript."
        )

    raw_turns = data.get("turns", [])
    turns = []

    if isinstance(raw_turns, list):
        for turn in raw_turns:
            if not isinstance(turn, dict):
                continue

            turns.append({
                "turn_id": turn.get("turnId"),
                "start_ms": turn.get("startMs"),
                "end_ms": turn.get("endMs"),
                "speaker": turn.get("speaker", "Unknown"),
                "transcript": str(turn.get("transcript") or ""),
            })

    result = {
        "transcript": transcript.strip(),
        "turns": turns,
        "audio_duration_ms": data.get(
            "audioDurationMs",
            int(audio_info["duration_seconds"] * 1000),
        ),
        "session_id": data.get("sessionId", session_id),
        "audio_info": audio_info,
        "model": ASR_MODEL,
    }

    emit_event(
        run_id,
        "audio_transcription_completed",
        "Audio transcription completed successfully.",
        {
            "model": ASR_MODEL,
            "characters": len(result["transcript"]),
            "turn_count": len(turns),
            "duration_seconds": audio_info["duration_seconds"],
        },
    )

    return result


# ---------------------------------------------------------
# CLAIM EXTRACTION FROM TRANSCRIPT
# ---------------------------------------------------------

def extract_claims_from_transcript(
    transcript: str,
    run_id: str | None = None,
) -> dict:

    if not isinstance(transcript, str) or not transcript.strip():
        raise ValueError("Transcript cannot be empty.")

    client = get_client()
    model = get_model()

    prompt = f"""
You are VeritasShield AI, an evidence-based claim extraction system.

The following text was generated by speech recognition.
It may contain transcription errors, incomplete sentences,
misheard names, or ambiguous statements.

TRANSCRIPT:
<transcript>
{transcript[:30000]}
</transcript>

TASK:
Extract factual claims that can be independently verified.

RULES:
1. Extract at most 8 claims.
2. Do not invent facts that are not stated in the transcript.
3. Do not treat opinions, predictions or personal preferences
   as objective facts.
4. Preserve the speaker's intended meaning without strengthening it.
5. Avoid extracting incomplete or unintelligible statements.
6. If a claim depends on an unclear name, number or date,
   mention that uncertainty in its context.
7. Do not treat the transcript itself as evidence that a claim is true.
8. Keep claims concise and independently understandable.
9. If there are no verifiable factual claims, return an empty array.

Return ONLY valid JSON:

{{
  "summary": "Neutral summary of the audio transcript.",
  "claims": [
    {{
      "claim": "A specific factual claim.",
      "context": "Relevant context from the transcript.",
      "transcription_uncertainty": "Any ambiguity, or None."
    }}
  ],
  "limitations": [
    "Relevant transcript limitations."
  ]
}}
"""

    emit_event(
        run_id,
        "audio_claim_extraction_started",
        "Extracting independently verifiable claims from transcript.",
        {"model": model},
    )

    response = client.responses.create(
        model=model,
        input=prompt,
        max_output_tokens=3500,
    )

    status = getattr(response, "status", "unknown")

    if status != "completed":
        raise RuntimeError(
            f"Audio claim extraction incomplete. Status: {status}"
        )

    response_text = extract_response_text(response)

    if not response_text:
        raise RuntimeError(
            "Meta returned an empty audio claim extraction response."
        )

    data = parse_json_response(response_text)

    raw_claims = data.get("claims", [])

    if not isinstance(raw_claims, list):
        raw_claims = []

    claims = []

    for item in raw_claims[:8]:
        if not isinstance(item, dict):
            continue

        claim = item.get("claim")

        if not isinstance(claim, str):
            continue

        claim = claim.strip()

        if len(claim) < 8 or len(claim) > 2000:
            continue

        claims.append({
            "claim": claim,
            "context": str(item.get("context") or "")[:1000],
            "transcription_uncertainty": str(
                item.get("transcription_uncertainty") or "None"
            )[:500],
        })

    limitations = data.get("limitations", [])

    if not isinstance(limitations, list):
        limitations = []

    result = {
        "summary": str(data.get("summary") or ""),
        "claims": claims,
        "limitations": [
            str(item)[:500]
            for item in limitations[:10]
            if isinstance(item, str)
        ],
        "model": model,
    }

    emit_event(
        run_id,
        "audio_claims_extracted",
        "Factual claims extracted from audio transcript.",
        {
            "claim_count": len(claims),
            "model": model,
        },
    )

    return result


# ---------------------------------------------------------
# COMPLETE AUDIO INVESTIGATION
# ---------------------------------------------------------

def investigate_audio(
    audio_bytes: bytes,
    run_id: str | None = None,
) -> dict:

    emit_event(
        run_id,
        "audio_investigation_started",
        "Audio investigation started.",
        {
            "transcription_model": ASR_MODEL,
            "verification_model": get_model(),
        },
    )

    # Stage 1: Transcription
    transcription = transcribe_audio(
        audio_bytes,
        run_id=run_id,
    )

    # Stage 2: Extract factual claims
    extraction = extract_claims_from_transcript(
        transcription["transcript"],
        run_id=run_id,
    )

    # Stage 3: Independently verify claims
    results = []
    total_claims = len(extraction["claims"])

    for index, item in enumerate(extraction["claims"], start=1):

        claim = item["claim"]

        emit_event(
            run_id,
            "audio_claim_verification_started",
            f"Verifying audio claim {index} of {total_claims}.",
            {
                "claim": claim[:250],
                "claim_index": index,
                "total_claims": total_claims,
            },
        )

        try:
            verification = verify_claim_with_web(
                claim,
                run_id=run_id,
            )

            data = verification.get("data", {})

            if not isinstance(data, dict):
                data = {}

            sources = data.get("sources", [])

            if not isinstance(sources, list):
                sources = []

            verdict = normalize_verdict(
                data.get("verdict", "Inconclusive")
            )

            if not sources:
                verdict = "Inconclusive"

            result = {
                "claim": claim,
                "context": item["context"],
                "transcription_uncertainty": item[
                    "transcription_uncertainty"
                ],
                "verdict": verdict,
                "assessment": str(data.get("assessment") or ""),
                "evidence_summary": str(
                    data.get("evidence_summary") or ""
                ),
                "uncertainty": str(data.get("uncertainty") or ""),
                "sources": sources,
                "model": verification.get("model", get_model()),
            }

            emit_event(
                run_id,
                "audio_claim_verification_completed",
                f"Audio claim {index} verification completed.",
                {
                    "claim": claim[:250],
                    "verdict": verdict,
                    "source_count": len(sources),
                    "claim_index": index,
                    "total_claims": total_claims,
                },
            )

        except Exception as exc:
            result = {
                "claim": claim,
                "context": item["context"],
                "transcription_uncertainty": item[
                    "transcription_uncertainty"
                ],
                "verdict": "Inconclusive",
                "assessment": (
                    "Independent verification could not be completed."
                ),
                "evidence_summary": "",
                "uncertainty": str(exc)[:500],
                "sources": [],
                "model": get_model(),
            }

            emit_event(
                run_id,
                "audio_claim_verification_failed",
                f"Audio claim {index} verification failed.",
                {
                    "claim": claim[:250],
                    "claim_index": index,
                    "total_claims": total_claims,
                },
            )

        results.append(result)

    emit_event(
        run_id,
        "audio_investigation_completed",
        "Audio investigation completed.",
        {
            "claim_count": len(results),
            "transcription_model": ASR_MODEL,
            "verification_model": extraction["model"],
        },
    )

    return {
        "status": "completed",
        "investigation_type": "audio",
        "transcript": transcription["transcript"],
        "turns": transcription["turns"],
        "audio_duration_ms": transcription["audio_duration_ms"],
        "audio_info": transcription["audio_info"],
        "transcription_model": transcription["model"],
        "page_summary": extraction["summary"],
        "claims": results,
        "limitations": extraction["limitations"],
        "verification_model": extraction["model"],
        "session_id": transcription["session_id"],
    }