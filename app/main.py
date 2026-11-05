
import asyncio
import json
import logging
from app.models import Investigation
from app.services.image_client import investigate_image_file
from uuid import UUID
from uuid import uuid4
from sqlalchemy import select
from fastapi import Response
from app.database import get_session_factory
from app.persistence import (
    create_investigation,
    add_event,
    save_result,
    mark_failed,
    save_file_metadata,
    list_history,
    get_detail,
)

from fastapi import (
    FastAPI,
    HTTPException,
    UploadFile,
    File,
    Header,
    Depends,
)

from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.persistence import _get_supabase_client
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import ValidationError

from app.schemas import (
    VerifyRequest,
    VerifyResponse,
    URLInvestigationRequest,
    URLInvestigationResponse,
)

from app.services.meta_client import (
    verify_claim_with_web,
    analyze_image_with_meta,
    investigate_url,
)

from app.services.audio_client import investigate_audio

from app.services.live_events import (
    publish_event,
    get_events,
    finish_run,
)


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("veritasshield")


MAX_IMAGE_SIZE = 10 * 1024 * 1024

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}

MAX_AUDIO_SIZE = 30 * 1024 * 1024

ALLOWED_AUDIO_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
}


app = FastAPI(
    title="VeritasShield AI API",
    description=(
        "Evidence-linked multimodal investigation "
        "powered by Meta Model API."
    ),
    version="0.6.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

bearer_scheme = HTTPBearer(auto_error=False)


def require_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
):
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
        )

    try:
        auth_response = _get_supabase_client().auth.get_user(
            credentials.credentials
        )
        user = auth_response.user

        if user is None:
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired session.",
            )

        return user

    except HTTPException:
        raise
    except Exception:
        logger.warning("Authentication failed.", exc_info=True)
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired session.",
        )


# ---------------------------------------------------------
# COMMON HELPERS
# ---------------------------------------------------------

def validate_run_id(run_id: str | None):
    if not run_id:
        return None

    try:
        UUID(run_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="Invalid investigation ID.",
        ) from exc

    return run_id


def start_investigation(
    run_id: str | None,
    investigation_type: str,
    details: dict | None = None,
):
    publish_event(
        run_id,
        "investigation_started",
        f"{investigation_type.capitalize()} investigation started.",
        {
            "investigation_type": investigation_type,
            **(details or {}),
        },
    )


# ---------------------------------------------------------
# ROOT AND HEALTH
# ---------------------------------------------------------

@app.get("/")
def root():
    return {
        "message": "VeritasShield AI API is running",
        "service": "veritasshield-api",
        "version": "0.6.0",
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "veritasshield-api",
    }


# ---------------------------------------------------------
# LIVE INVESTIGATION EVENT STREAM
# ---------------------------------------------------------

@app.get("/api/events/{run_id}")
async def investigation_events(
    run_id: str,
    user=Depends(require_user),
):

    validate_run_id(run_id)
    db = get_session_factory()()

    try:
        investigation = db.scalar(
            select(Investigation).where(
                Investigation.id == run_id,
                Investigation.user_id == str(user.id),
            )
        )
    finally:
        db.close()

    if investigation is None:
        raise HTTPException(
            status_code=404,
            detail="Investigation not found.",
        )


    async def event_stream():
        last_id = 0
        idle_checks = 0

        yield "retry: 1500\n\n"

        while idle_checks < 1200:

            events, finished = get_events(
                run_id,
                after_id=last_id,
            )

            for item in events:

                last_id = item["id"]

                payload = json.dumps(item)

                yield (
                    f"id: {last_id}\n"
                    f"event: {item['event']}\n"
                    f"data: {payload}\n\n"
                )

            if finished:
                break

            idle_checks += 1

            yield ": keep-alive\n\n"

            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------
# TEXT CLAIM INVESTIGATION
# ---------------------------------------------------------


@app.post("/api/verify", response_model=VerifyResponse)
def verify(
    request: VerifyRequest,
    response: Response,
    x_investigation_id: str | None = Header(
        default=None,
        alias="X-Investigation-ID",
    ),
        user=Depends(require_user),
):
    run_id = validate_run_id(x_investigation_id) or str(uuid4())
    claim = request.claim.strip()

    if len(claim) < 8:
        raise HTTPException(
            status_code=422,
            detail="Please enter a more specific factual claim.",
        )

    SessionLocal = get_session_factory()

    with SessionLocal() as db:
        try:
            create_investigation(
                db,
                run_id,
                "text",
                input_text=claim,
                user_id=str(user.id),
            )

            add_event(
                db, run_id, "investigation_started",
                "Text investigation started.",
                {"claim": claim[:250]},
            )

            start_investigation(
                run_id,
                "text",
                {"claim": claim[:250]},
            )

            result = verify_claim_with_web(
                claim,
                run_id=run_id,
            )

            data = result.get("data", {})
            if not isinstance(data, dict):
                raise RuntimeError("Invalid investigation data.")

            sources = [
                source for source in data.get("sources", [])
                if isinstance(source, dict) and source.get("url")
            ]

            verdict = data.get("verdict", "Inconclusive")
            if not sources:
                verdict = "Inconclusive"

            response_data = {
                **data,
                "verdict": verdict,
                "sources": sources,
                "model": result.get("model", "Unknown"),
            }

            save_result(db, run_id, response_data)

            add_event(
                db, run_id, "investigation_completed",
                "Text investigation completed.",
                {"verdict": verdict, "source_count": len(sources)},
            )

            finish_run(run_id, success=True)

            response.headers["X-Investigation-ID"] = run_id

            return VerifyResponse(
                claim=claim,
                verdict=verdict,
                assessment=data.get("assessment", ""),
                evidence_summary=data.get("evidence_summary", ""),
                uncertainty=data.get("uncertainty", ""),
                sources=sources,
                model=result.get("model", "Unknown"),
            )

        except ValidationError as exc:
            db.rollback()
            mark_failed(db, run_id)
            finish_run(run_id, success=False)
            logger.exception("Text response validation failed.")
            raise HTTPException(
                status_code=502,
                detail="Investigation provider returned invalid data.",
            ) from exc

        except Exception as exc:
            db.rollback()
            mark_failed(db, run_id)
            finish_run(run_id, success=False)
            logger.exception("Text investigation failed.")
            raise HTTPException(
                status_code=502,
                detail="Text verification or database persistence failed.",
            ) from exc






# ---------------------------------------------------------
# URL INVESTIGATION
# ---------------------------------------------------------

@app.post(
    "/api/investigate-url",
    response_model=URLInvestigationResponse,
)
def investigate_url_endpoint(
    request: URLInvestigationRequest,
    response: Response,
    x_investigation_id: str | None = Header(
        default=None,
        alias="X-Investigation-ID",
    ),
        user=Depends(require_user),
):
    run_id = validate_run_id(x_investigation_id) or str(uuid4())
    submitted_url = str(request.url)

    SessionLocal = get_session_factory()

    with SessionLocal() as db:
        try:
            create_investigation(
                db,
                run_id,
                "url",
                submitted_url=submitted_url,
                 user_id=str(user.id),
            )

            add_event(
                db,
                run_id,
                "investigation_started",
                "URL investigation started.",
                {"url": submitted_url},
            )

            start_investigation(
                run_id,
                "url",
                {"url": submitted_url},
            )

            result = investigate_url(
                submitted_url,
                run_id=run_id,
            )

            if not isinstance(result, dict):
                raise RuntimeError("Invalid URL investigation result.")

            # Validate and serialize the original API response.
            validated_response = URLInvestigationResponse(**result)
            response_data = validated_response.model_dump(mode="json")

            # URL response contains evidence inside claims[].
            claims = response_data.get("claims", [])

            all_sources = []
            seen_urls = set()

            claim_verdicts = []

            for claim_item in claims:
                if not isinstance(claim_item, dict):
                    continue

                verdict = claim_item.get(
                    "verdict",
                    "Inconclusive",
                )

                if verdict in (
                    "Supported",
                    "Contradicted",
                    "Inconclusive",
                ):
                    claim_verdicts.append(verdict)

                claim_sources = claim_item.get("sources", [])

                if not isinstance(claim_sources, list):
                    continue

                for source in claim_sources:
                    if not isinstance(source, dict):
                        continue

                    source_url = source.get("url")

                    if not source_url:
                        continue

                    source_url = str(source_url)

                    if source_url in seen_urls:
                        continue

                    seen_urls.add(source_url)

                    all_sources.append({
                        **source,
                        "url": source_url,
                    })

            # Conservative overall verdict:
            # Only unanimous supported/contradicted claims
            # produce a definitive investigation verdict.
            if (
                claim_verdicts
                and all(v == "Supported" for v in claim_verdicts)
            ):
                overall_verdict = "Supported"

            elif (
                claim_verdicts
                and all(v == "Contradicted" for v in claim_verdicts)
            ):
                overall_verdict = "Contradicted"

            else:
                overall_verdict = "Inconclusive"

            # Prepare database-compatible aggregate result.
            assessments = [
                item.get("assessment", "")
                for item in claims
                if isinstance(item, dict)
                and item.get("assessment")
            ]

            evidence_summaries = [
                item.get("evidence_summary", "")
                for item in claims
                if isinstance(item, dict)
                and item.get("evidence_summary")
            ]

            uncertainties = [
                item.get("uncertainty", "")
                for item in claims
                if isinstance(item, dict)
                and item.get("uncertainty")
            ]

            limitations = response_data.get("limitations", [])

            uncertainty_text = " ".join(
                str(item)
                for item in uncertainties
                if item
            )

            if limitations:
                uncertainty_text += " " + " ".join(
                    str(item) for item in limitations
                )

            persistence_data = {
                **response_data,
                "verdict": overall_verdict,
                "assessment": " ".join(assessments),
                "evidence_summary": " ".join(evidence_summaries),
                "uncertainty": uncertainty_text.strip(),
                "sources": all_sources,
                "model": result.get("model", "Unknown"),
            }

            save_result(
                db,
                run_id,
                persistence_data,
            )

            add_event(
                db,
                run_id,
                "investigation_completed",
                "URL investigation completed.",
                {
                    "verdict": overall_verdict,
                    "claim_count": len(claims),
                    "source_count": len(all_sources),
                },
            )

            finish_run(run_id, success=True)

            response.headers["X-Investigation-ID"] = run_id

            logger.info(
                "URL investigation persisted: id=%s verdict=%s claims=%s sources=%s",
                run_id,
                overall_verdict,
                len(claims),
                len(all_sources),
            )

            # Preserve the existing URL API response structure.
            return validated_response

        except ValueError as exc:
            db.rollback()
            mark_failed(db, run_id)
            finish_run(run_id, success=False)

            logger.warning("URL investigation rejected: %s", exc)

            raise HTTPException(
                status_code=400,
                detail=str(exc),
            ) from exc

        except ValidationError as exc:
            db.rollback()
            mark_failed(db, run_id)
            finish_run(run_id, success=False)

            logger.exception("URL response validation failed.")

            raise HTTPException(
                status_code=502,
                detail="URL investigation returned invalid data.",
            ) from exc

        except Exception as exc:
            db.rollback()
            mark_failed(db, run_id)
            finish_run(run_id, success=False)

            logger.exception("URL investigation failed.")

            raise HTTPException(
                status_code=502,
                detail="URL investigation or database persistence failed.",
            ) from exc





# ---------------------------------------------------------
# IMAGE INVESTIGATION
# ---------------------------------------------------------


@app.post("/api/investigate-image")
async def investigate_image(
    file: UploadFile = File(...),
    x_investigation_id: str | None = Header(
        default=None,
        alias="X-Investigation-ID",
    ),
        user=Depends(require_user),
):
    # Always ensure a valid investigation ID exists.
    run_id = validate_run_id(x_investigation_id) or str(uuid4())

    db = None
    investigation_created = False

    try:
        # 1. Validate image type
        if file.content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=415,
                detail="Upload a PNG, JPG, JPEG or WEBP image.",
            )

        # 2. Read and validate image size
        image_bytes = await file.read(MAX_IMAGE_SIZE + 1)

        if not image_bytes:
            raise HTTPException(
                status_code=400,
                detail="Uploaded image is empty.",
            )

        if len(image_bytes) > MAX_IMAGE_SIZE:
            raise HTTPException(
                status_code=413,
                detail="Image size must not exceed 10 MB.",
            )

        logger.info(
            "Starting image investigation. ID: %s",
            run_id,
        )

        # 3. Create database session
        SessionLocal = get_session_factory()
        db = SessionLocal()

        # 4. Create investigation record
        create_investigation(
            db,
            run_id,
            "image",
            input_text=file.filename,
             user_id=str(user.id),
        )

        investigation_created = True

        # 5. Record investigation start event
        add_event(
            db,
            run_id,
            "investigation_started",
            "Image investigation started.",
            {
                "filename": file.filename,
                "content_type": file.content_type,
                "size_bytes": len(image_bytes),
            },
        )

        # 6. Save uploaded image metadata
        save_file_metadata(
            db,
            run_id,
            file.filename,
            file.content_type,
            image_bytes,
        )

        # 7. Run image analysis
        response = await investigate_image_file(
            image_bytes=image_bytes,
            content_type=file.content_type,
            filename=file.filename,
            run_id=run_id,
        )

        # 8. Convert response into a dictionary
        if hasattr(response, "model_dump"):
            response_data = response.model_dump(mode="json")
        elif hasattr(response, "dict"):
            response_data = response.dict()
        elif isinstance(response, dict):
            response_data = response
        else:
            raise ValueError(
                "Image analysis returned an unsupported response format."
            )

        # 9. Persist image analysis result
        save_result(
            db,
            run_id,
            response_data,
        )

        # 10. Record completion event
        add_event(
            db,
            run_id,
            "investigation_completed",
            "Image investigation completed.",
            {
                "filename": file.filename,
                "model": response_data.get("model"),
                "claims_count": len(
                    response_data.get("claims", [])
                ) if isinstance(response_data.get("claims"), list) else 0,
            },
        )

        logger.info(
            "Image investigation completed. ID: %s",
            run_id,
        )

        finish_run(run_id, success=True)

        return response

    except HTTPException:
        if db:
            db.rollback()

        if investigation_created:
            mark_failed(db, run_id)

        finish_run(run_id, success=False)
        raise

    except Exception as exc:
        logger.exception(
            "Image investigation failed. ID: %s",
            run_id,
        )

        if db:
            db.rollback()

        if investigation_created:
            try:
                mark_failed(db, run_id)
            except Exception:
                logger.exception(
                    "Could not mark image investigation as failed."
                )

        finish_run(run_id, success=False)

        raise HTTPException(
            status_code=502,
            detail=(
                "Image investigation failed. "
                "Check API access and server logs."
            ),
        ) from exc

    finally:
        if db:
            db.close()

        await file.close()

# ---------------------------------------------------------
# AUDIO INVESTIGATION
# ---------------------------------------------------------

@app.post("/api/investigate-audio")
async def investigate_audio_endpoint(
    file: UploadFile = File(...),
    x_investigation_id: str | None = Header(
        default=None,
        alias="X-Investigation-ID",
    ),
        user=Depends(require_user),
):
    run_id = validate_run_id(x_investigation_id) or str(uuid4())

    db = None
    investigation_created = False

    try:
        # 1. Validate audio format
        if file.content_type not in ALLOWED_AUDIO_TYPES:
            raise HTTPException(
                status_code=415,
                detail="Only WAV audio files are currently supported.",
            )

        # 2. Read audio with size protection
        audio_bytes = await file.read(MAX_AUDIO_SIZE + 1)

        if not audio_bytes:
            raise HTTPException(
                status_code=400,
                detail="Audio file is empty.",
            )

        if len(audio_bytes) > MAX_AUDIO_SIZE:
            raise HTTPException(
                status_code=413,
                detail="Audio file exceeds the 30 MB limit.",
            )

        logger.info(
            "Starting audio investigation. ID: %s",
            run_id,
        )

        # 3. Create database session
        SessionLocal = get_session_factory()
        db = SessionLocal()

        # 4. Create investigation record
        create_investigation(
            db,
            run_id,
            "audio",
            input_text=file.filename,
             user_id=str(user.id),
        )

        investigation_created = True

        # 5. Record start event
        add_event(
            db,
            run_id,
            "investigation_started",
            "Audio investigation started.",
            {
                "filename": file.filename,
                "content_type": file.content_type,
                "size_bytes": len(audio_bytes),
            },
        )

        # 6. Save audio file metadata
        save_file_metadata(
            db,
            run_id,
            file.filename,
            file.content_type,
            audio_bytes,
        )

        # 7. Run existing audio investigation pipeline
        result = investigate_audio(
            audio_bytes=audio_bytes,
            run_id=run_id,
        )

        # 8. Convert result into a dictionary for persistence
        if hasattr(result, "model_dump"):
            result_data = result.model_dump(mode="json")
        elif hasattr(result, "dict"):
            result_data = result.dict()
        elif isinstance(result, dict):
            result_data = result
        else:
            raise ValueError(
                "Audio investigation returned an unsupported response format."
            )

        # 9. Save complete investigation result
        save_result(
            db,
            run_id,
            result_data,
        )

        # 10. Record completion event
        add_event(
            db,
            run_id,
            "investigation_completed",
            "Audio investigation completed.",
            {
                "filename": file.filename,
                "model": result_data.get("model"),
            },
        )

        logger.info(
            "Audio investigation completed. ID: %s",
            run_id,
        )

        finish_run(
            run_id,
            success=True,
        )

        return result

    except HTTPException:
        if db:
            db.rollback()

        if investigation_created:
            try:
                mark_failed(db, run_id)
            except Exception:
                logger.exception(
                    "Could not mark audio investigation as failed."
                )

        finish_run(
            run_id,
            success=False,
        )
        raise

    except ValueError as exc:
        logger.warning(
            "Audio investigation rejected: %s",
            exc,
        )

        if db:
            db.rollback()

        if investigation_created:
            try:
                mark_failed(db, run_id)
            except Exception:
                logger.exception(
                    "Could not mark audio investigation as failed."
                )

        finish_run(
            run_id,
            success=False,
        )

        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception(
            "Audio investigation failed. ID: %s",
            run_id,
        )

        if db:
            db.rollback()

        if investigation_created:
            try:
                mark_failed(db, run_id)
            except Exception:
                logger.exception(
                    "Could not mark audio investigation as failed."
                )

        finish_run(
            run_id,
            success=False,
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "Audio investigation failed. "
                "Check API access and server logs."
            ),
        ) from exc

    finally:
        if db:
            db.close()

        await file.close()




@app.get("/api/investigations")
def get_investigation_history(
    limit: int = 20,
    offset: int = 0,
        user=Depends(require_user),
):
    if limit < 1 or limit > 100:
        raise HTTPException(
            status_code=400,
            detail="Limit must be between 1 and 100."
        )

    if offset < 0:
        raise HTTPException(
            status_code=400,
            detail="Offset cannot be negative."
        )

    db = get_session_factory()()

    try:
        investigations = list_history(
            db,
            limit=limit,
            offset=offset,
              user_id=str(user.id),
        )

        return {
            "status": "success",
            "count": len(investigations),
            "limit": limit,
            "offset": offset,
            "investigations": investigations,
        }

    except Exception:
        logger.exception("Failed to fetch investigation history")
        raise HTTPException(
            status_code=500,
            detail="Unable to fetch investigation history."
        )

    finally:
        db.close()


@app.get("/api/investigations/{run_id}")
def get_investigation_details(
    run_id: str,
    user=Depends(require_user),
):
    try:
        valid_id = validate_run_id(run_id)

    except (ValueError, HTTPException):
        raise HTTPException(
            status_code=400,
            detail="Invalid investigation ID."
        )

    db = get_session_factory()()

    try:
        investigation = get_detail(
    db,
    valid_id,
    user_id=str(user.id),
)

        if investigation is None:
            raise HTTPException(
                status_code=404,
                detail="Investigation not found."
            )

        return {
            "status": "success",
            "investigation": investigation,
        }

    except HTTPException:
        raise

    except Exception:
        logger.exception("Failed to fetch investigation details")
        raise HTTPException(
            status_code=500,
            detail="Unable to fetch investigation details."
        )

    finally:
        db.close()
