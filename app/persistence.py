
import base64
import hashlib
import logging
import os
import re
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select, desc, delete
from supabase import create_client

from app.models import (
    Investigation,
    EvidenceSource,
    InvestigationEvent,
    EvidenceFile,
)

logger = logging.getLogger("veritasshield.persistence")

STORAGE_BUCKET = "veritasshield-evidence"

_supabase_client = None


def _get_supabase_client():
    """Create and reuse the privileged Supabase client."""
    global _supabase_client

    if _supabase_client is None:
        url = os.getenv("SUPABASE_URL", "").strip()
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

        if not url or not key:
            raise RuntimeError("Supabase Storage credentials are not configured.")

        _supabase_client = create_client(url, key)

    return _supabase_client


def _decode_data_url(data_url):
    """Decode a base64 data URL into bytes and its MIME type."""
    if not isinstance(data_url, str):
        raise ValueError("Overlay data URL is missing.")

    match = re.match(
        r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$",
        data_url,
        re.DOTALL,
    )
    if not match:
        raise ValueError("Invalid overlay data URL.")

    content_type = match.group(1).lower()
    raw = base64.b64decode(match.group(2), validate=True)

    if not raw:
        raise ValueError("Overlay image is empty.")

    return raw, content_type


def _upload_segmentation_overlay(db, rid, segmentation):
    """
    Upload the SAM overlay to private Supabase Storage.
    Returns the stored object key, or None if upload fails.
    """
    data_url = segmentation.pop("overlay_data_url", None)

    if not data_url:
        return None

    try:
        raw, content_type = _decode_data_url(data_url)

        if content_type != "image/png":
            raise ValueError(f"Unsupported overlay content type: {content_type}")

        client = _get_supabase_client()
        storage_key = f"investigations/{rid}/segmentation-overlay.png"

        client.storage.from_(STORAGE_BUCKET).upload(
            path=storage_key,
            file=raw,
            file_options={
                "content-type": content_type,
                "upsert": "true",
            },
        )

        sha256 = hashlib.sha256(raw).hexdigest()

        # Avoid duplicate overlay metadata if the result is saved again.
        existing = db.scalars(
            select(EvidenceFile).where(
                EvidenceFile.investigation_id == rid,
                EvidenceFile.storage_key == storage_key,
            )
        ).all()

        for old_file in existing:
            db.delete(old_file)

        db.add(
            EvidenceFile(
                investigation_id=rid,
                original_filename="segmentation-overlay.png",
                content_type=content_type,
                size_bytes=len(raw),
                sha256=sha256,
                storage_key=storage_key,
            )
        )

        segmentation["overlay_storage_key"] = storage_key
        segmentation["overlay_content_type"] = content_type
        segmentation["overlay_size_bytes"] = len(raw)
        segmentation["overlay_sha256"] = sha256
        segmentation["overlay_storage_status"] = "uploaded"

        return storage_key

    except Exception:
        logger.exception("Failed to upload SAM segmentation overlay for %s", rid)
        segmentation["overlay_storage_status"] = "failed"
        segmentation.setdefault("limitations", []).append(
            "Segmentation overlay could not be saved to evidence storage."
        )
        return None


def create_investigation(
    db,
    rid,
    kind,
    input_text=None,
    submitted_url=None,
    user_id=None,
):
    db.add(
        Investigation(
            id=rid,
            user_id=user_id,
            investigation_type=kind,
            status="running",
            input_text=input_text,
            submitted_url=submitted_url,
        )
    )
    db.commit()


def add_event(db, rid, event_type, message, details=None):
    if rid and db.get(Investigation, rid):
        db.add(
            InvestigationEvent(
                investigation_id=rid,
                event_type=event_type,
                message=message,
                details=details or {},
            )
        )
        db.commit()


def save_result(db, rid, result):
    item = db.get(Investigation, rid) if rid else None

    if item is None:
        return

    # Work on a copy so the caller's original result is not mutated.
    saved_result = dict(result)

    segmentation = saved_result.get("segmentation")
    if isinstance(segmentation, dict):
        segmentation = dict(segmentation)
        saved_result["segmentation"] = segmentation
        _upload_segmentation_overlay(db, rid, segmentation)

    item.result_json = saved_result
    item.status = "completed"
    item.verdict = saved_result.get("verdict")
    item.assessment = saved_result.get("assessment")
    item.evidence_summary = saved_result.get("evidence_summary")
    item.uncertainty = saved_result.get("uncertainty")
    item.model = saved_result.get("model")
    item.completed_at = datetime.now(timezone.utc)

    # Replace the previous source rows to prevent duplicates on repeated saves.
    db.execute(
        delete(EvidenceSource).where(EvidenceSource.investigation_id == rid)
    )

    sources = saved_result.get("sources", [])
    if isinstance(sources, list):
        for source in sources:
            if isinstance(source, dict) and source.get("url"):
                db.add(
                    EvidenceSource(
                        investigation_id=rid,
                        title=str(source.get("title") or "Untitled"),
                        url=str(source["url"]),
                        publisher=source.get("publisher"),
                        relationship_type=source.get("relationship") or "Neutral",
                        evidence=source.get("evidence"),
                        relevance=source.get("relevance"),
                        reliability=source.get("reliability"),
                        reliability_reason=source.get("reliability_reason"),
                        limitations=source.get("limitations"),
                    )
                )

    db.commit()


def mark_failed(db, rid):
    item = db.get(Investigation, rid) if rid else None

    if item:
        item.status = "failed"
        item.error_code = "INVESTIGATION_FAILED"
        item.completed_at = datetime.now(timezone.utc)
        db.commit()


def save_file_metadata(db, rid, filename, content_type, raw, storage_key=None):
    if rid and db.get(Investigation, rid):
        db.add(
            EvidenceFile(
                investigation_id=rid,
                original_filename=(filename or "")[:255],
                content_type=content_type,
                size_bytes=len(raw),
                sha256=hashlib.sha256(raw).hexdigest(),
                storage_key=storage_key,
            )
        )
        db.commit()


def get_detail(db, rid, user_id=None):
    investigation = db.scalar(
        select(Investigation).where(
            Investigation.id == rid,
            Investigation.user_id == user_id,
        )
    )

    if not investigation:
        return None

    return {
        "id": investigation.id,
        "type": investigation.investigation_type,
        "status": investigation.status,
        "input_text": investigation.input_text,
        "submitted_url": investigation.submitted_url,
        "verdict": investigation.verdict,
        "assessment": investigation.assessment,
        "evidence_summary": investigation.evidence_summary,
        "uncertainty": investigation.uncertainty,
        "model": investigation.model,
        "result": investigation.result_json,
        "created_at": (
            investigation.created_at.isoformat()
            if investigation.created_at else None
        ),
        "completed_at": (
            investigation.completed_at.isoformat()
            if investigation.completed_at else None
        ),
        "sources": [
            {
                "title": source.title,
                "url": source.url,
                "publisher": source.publisher,
                "relationship": source.relationship_type,
                "evidence": source.evidence,
                "relevance": source.relevance,
                "reliability": source.reliability,
                "reliability_reason": source.reliability_reason,
                "limitations": source.limitations,
            }
            for source in investigation.sources
        ],
        "events": [
            {
                "event_type": event.event_type,
                "message": event.message,
                "details": event.details,
                "created_at": (
                    event.created_at.isoformat()
                    if event.created_at else None
                ),
            }
            for event in sorted(
                investigation.events,
                key=lambda event: event.created_at or datetime.min.replace(
                    tzinfo=timezone.utc
                ),
            )
        ],
        "files": [
            {
                "original_filename": file.original_filename,
                "content_type": file.content_type,
                "size_bytes": file.size_bytes,
                "sha256": file.sha256,
                "storage_key": file.storage_key,
                "created_at": (
                    file.created_at.isoformat()
                    if file.created_at else None
                ),
            }
            for file in investigation.files
        ],
    }

def list_history(db, limit=20, offset=0, user_id=None):
    rows = db.scalars(
        select(Investigation)
        .where(Investigation.user_id == user_id)
        .order_by(desc(Investigation.created_at))
        .limit(limit)
        .offset(offset)
    ).all()

    return [
        {
            "id": item.id,
            "type": item.investigation_type,
            "status": item.status,
            "verdict": item.verdict,
            "model": item.model,
            "created_at": (
                item.created_at.isoformat()
                if item.created_at else None
            ),
            "completed_at": (
                item.completed_at.isoformat()
                if item.completed_at else None
            ),
            "input_preview": (
                item.input_text or item.submitted_url or ""
            )[:180],
        }
        for item in rows
    ]