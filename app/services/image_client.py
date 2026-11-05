
import asyncio
import logging
import time
import os
import base64
import io

from typing import Any

from openai import AsyncOpenAI
from PIL import Image, ImageDraw

from meta_sam_parser import (
    image_segmentation_format,
    parse_responses_stream,
    SegmentationMaskRecord,
    SegmentationBoxRecord,
    decode_mask_to_raster,
)

from app.services.meta_client import (
    analyze_image_with_meta,
    verify_claim_with_web,
    emit_event,
)


logger = logging.getLogger("veritasshield.image")

MAX_CONCURRENT_VERIFICATIONS = 3

SAM_MODEL = "sam-3.1"

SAM_COLORS = [
    (255, 70, 70),
    (50, 180, 255),
    (70, 220, 130),
    (255, 190, 50),
    (180, 100, 255),
    (255, 100, 190),
    (50, 220, 210),
    (220, 220, 70),
    (120, 150, 255),
    (255, 130, 50),
    (100, 230, 180),
    (200, 120, 255),
]


# ---------------------------------------------------------
# SAM 3.1 SEGMENTATION
# ---------------------------------------------------------

async def segment_image_with_sam(
    image_bytes: bytes,
    content_type: str,
    run_id: str | None = None,
) -> dict[str, Any]:

    api_key = os.getenv("MODEL_API_KEY")

    if not api_key:
        raise RuntimeError("MODEL_API_KEY missing from .env")

    if content_type not in (
        "image/jpeg",
        "image/png",
        "image/webp",
    ):
        raise ValueError(
            f"Unsupported image content type: {content_type}"
        )

    image = Image.open(
        io.BytesIO(image_bytes)
    ).convert("RGBA")

    image_width, image_height = image.size

    encoded_image = base64.b64encode(
        image_bytes
    ).decode("utf-8")

    image_url = (
        f"data:{content_type};base64,{encoded_image}"
    )

    client = AsyncOpenAI(
        base_url="https://api.meta.ai/v1",
        api_key=api_key,
        timeout=120.0,
    )

    try:
        emit_event(
            run_id,
            "sam_segmentation_started",
            "Starting SAM 3.1 image segmentation.",
            {
                "model": SAM_MODEL,
                "image_width": image_width,
                "image_height": image_height,
            },
        )

        source = await client.responses.create(
            model=SAM_MODEL,
            input=[
                {
                    "type": "message",
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": "person",
                        },
                        {
                            "type": "input_image",
                            "image_url": image_url,
                        },
                    ],
                }
            ],
            stream=True,
        )

        parsed = parse_responses_stream(
            source,
            image_segmentation_format(),
        )

        result = await parsed.final_result()

        if getattr(result.outcome, "status", None) != "completed":
            raise RuntimeError(
                f"SAM segmentation did not complete: {result.outcome}"
            )

        mask_records = [
            record
            for record in result.records
            if isinstance(record, SegmentationMaskRecord)
        ]

        box_records = [
            record
            for record in result.records
            if isinstance(record, SegmentationBoxRecord)
        ]

        overlay = Image.new(
            "RGBA",
            image.size,
            (0, 0, 0, 0),
        )

        draw = ImageDraw.Draw(overlay)

        segmentation_objects = []

        for index, record in enumerate(mask_records):

            bounds = record.bounds

            if bounds is None:
                continue

            left = int(bounds.left)
            top = int(bounds.top)
            right = int(bounds.right)
            bottom = int(bounds.bottom)

            mask_width = record.mask.width
            mask_height = record.mask.height

            # Validate mask coordinates against original image.
            if (
                left < 0
                or top < 0
                or right > image_width
                or bottom > image_height
                or right - left != mask_width
                or bottom - top != mask_height
            ):
                logger.warning(
                    "Skipping invalid SAM mask: object_id=%s",
                    record.object_id,
                )
                continue

            raster = decode_mask_to_raster(
                record.mask
            )

            if len(raster) != mask_width * mask_height:
                logger.warning(
                    "Skipping mask with invalid raster size: %s",
                    record.object_id,
                )
                continue

            color = SAM_COLORS[
                index % len(SAM_COLORS)
            ]

            mask_layer = Image.new(
                "RGBA",
                (mask_width, mask_height),
                (0, 0, 0, 0),
            )

            mask_pixels = [
                (*color, 125) if value else (0, 0, 0, 0)
                for value in raster
            ]

            mask_layer.putdata(mask_pixels)

            overlay.alpha_composite(
                mask_layer,
                (left, top),
            )

            draw.rectangle(
                (
                    left,
                    top,
                    right - 1,
                    bottom - 1,
                ),
                outline=(*color, 255),
                width=2,
            )

            draw.text(
                (
                    left,
                    max(0, top - 15),
                ),
                f"ID {record.object_id}",
                fill=(*color, 255),
            )

            segmentation_objects.append(
                {
                    "object_id": str(record.object_id),
                    "identity": (
                        str(record.identity)
                        if record.identity is not None
                        else None
                    ),
                    "bounds": {
                        "left": left,
                        "top": top,
                        "right": right,
                        "bottom": bottom,
                    },
                    "mask_width": mask_width,
                    "mask_height": mask_height,
                    "encoding": record.mask.encoding,
                    "foreground_pixels": int(sum(raster)),
                    "confidence": record.confidence,
                }
            )

        final_overlay = Image.alpha_composite(
            image,
            overlay,
        )

        output_buffer = io.BytesIO()

        final_overlay.convert("RGB").save(
            output_buffer,
            format="PNG",
            optimize=True,
        )

        overlay_base64 = base64.b64encode(
            output_buffer.getvalue()
        ).decode("utf-8")

        segmentation_data = {
            "status": "completed",
            "model": SAM_MODEL,
            "image_width": image_width,
            "image_height": image_height,
            "total_records": len(result.records),
            "mask_count": len(mask_records),
            "box_count": len(box_records),
            "rendered_mask_count": len(segmentation_objects),
            "objects": segmentation_objects,
            "overlay_data_url": (
                f"data:image/png;base64,{overlay_base64}"
            ),
        }

        emit_event(
            run_id,
            "sam_segmentation_completed",
            "SAM 3.1 segmentation and overlay generation completed.",
            {
                "mask_count": len(mask_records),
                "rendered_mask_count": len(segmentation_objects),
                "box_count": len(box_records),
            },
        )

        logger.info(
            "SAM_SEGMENTATION_COMPLETED | MASKS: %s | RENDERED: %s",
            len(mask_records),
            len(segmentation_objects),
        )

        return segmentation_data

    finally:
        await client.close()


# ---------------------------------------------------------
# IMAGE INVESTIGATION PIPELINE
# ---------------------------------------------------------

async def investigate_image_file(
    image_bytes: bytes,
    content_type: str,
    filename: str | None = None,
    run_id: str | None = None,
) -> dict[str, Any]:

    pipeline_start = time.perf_counter()

    limitations = []
    segmentation = None

    # -----------------------------------------------------
    # STAGE 1: IMAGE ANALYSIS
    # -----------------------------------------------------

    logger.info("Starting image analysis.")

    analysis_start = time.perf_counter()

    analysis = await asyncio.to_thread(
        analyze_image_with_meta,
        image_bytes,
        content_type,
        run_id=run_id,
    )

    analysis_time = time.perf_counter() - analysis_start

    logger.info(
        "IMAGE_ANALYSIS_TIME: %.2fs",
        analysis_time,
    )

    claims = analysis.get("claims", [])

    if not isinstance(claims, list):
        raise RuntimeError(
            "Invalid claims returned by image analysis."
        )

    claims = [
        item
        for item in claims
        if isinstance(item, dict)
        and isinstance(item.get("claim"), str)
        and len(item["claim"].strip()) >= 8
    ]

    total_claims = len(claims)

    logger.info(
        "IMAGE_CLAIMS_EXTRACTED: %s",
        total_claims,
    )

    # -----------------------------------------------------
    # STAGE 2: SAM 3.1 SEGMENTATION
    # -----------------------------------------------------

    logger.info("Starting SAM 3.1 segmentation.")

    sam_start = time.perf_counter()

    try:
        segmentation = await segment_image_with_sam(
            image_bytes=image_bytes,
            content_type=content_type,
            run_id=run_id,
        )

    except Exception as exc:
        logger.exception(
            "SAM 3.1 segmentation failed."
        )

        limitations.append(
            "SAM 3.1 segmentation was unavailable: "
            + str(exc)[:300]
        )

        emit_event(
            run_id,
            "sam_segmentation_failed",
            "SAM 3.1 segmentation could not be completed.",
            {
                "error": str(exc)[:300],
            },
        )

    sam_time = time.perf_counter() - sam_start

    logger.info(
        "SAM_SEGMENTATION_TIME: %.2fs",
        sam_time,
    )

    # -----------------------------------------------------
    # STAGE 3: CONCURRENT CLAIM VERIFICATION
    # -----------------------------------------------------

    emit_event(
        run_id,
        "claim_verification_started",
        f"Starting verification of {total_claims} extracted image claims.",
        {
            "total_claims": total_claims,
        },
    )

    semaphore = asyncio.Semaphore(
        MAX_CONCURRENT_VERIFICATIONS
    )

    async def verify_one(
        index: int,
        item: dict,
    ) -> dict:

        claim = item["claim"].strip()

        visual_basis = str(
            item.get("visual_basis") or ""
        )

        emit_event(
            run_id,
            "claim_verification_started",
            f"Verifying image claim {index} of {total_claims}.",
            {
                "claim": claim[:250],
                "claim_index": index,
                "total_claims": total_claims,
            },
        )

        request_start = time.perf_counter()

        try:
            async with semaphore:

                verification = await asyncio.to_thread(
                    verify_claim_with_web,
                    claim,
                    run_id=run_id,
                )

            request_time = (
                time.perf_counter() - request_start
            )

            data = verification.get("data", {})

            if not isinstance(data, dict):
                data = {}

            sources = data.get("sources", [])

            if not isinstance(sources, list):
                sources = []

            sources = [
                source
                for source in sources
                if isinstance(source, dict)
                and isinstance(source.get("url"), str)
                and source["url"].startswith(
                    ("http://", "https://")
                )
            ]

            verdict = data.get(
                "verdict",
                "Inconclusive",
            )

            if not sources:
                verdict = "Inconclusive"

            result = {
                "claim": claim,
                "visual_basis": visual_basis,
                "verdict": verdict,
                "assessment": str(
                    data.get("assessment") or ""
                ),
                "evidence_summary": str(
                    data.get("evidence_summary") or ""
                ),
                "uncertainty": str(
                    data.get("uncertainty") or ""
                ),
                "sources": sources,
                "model": verification.get(
                    "model",
                    "Unknown",
                ),
            }

            logger.info(
                "CLAIM_%s_VERIFICATION_TIME: %.2fs | SOURCES: %s | VERDICT: %s",
                index,
                request_time,
                len(sources),
                verdict,
            )

            emit_event(
                run_id,
                "claim_verification_completed",
                f"Image claim {index} verification completed.",
                {
                    "claim": claim[:250],
                    "verdict": verdict,
                    "source_count": len(sources),
                    "claim_index": index,
                    "total_claims": total_claims,
                },
            )

            return result

        except Exception:
            request_time = (
                time.perf_counter() - request_start
            )

            logger.exception(
                "CLAIM_%s_VERIFICATION_FAILED after %.2fs",
                index,
                request_time,
            )

            emit_event(
                run_id,
                "claim_verification_failed",
                f"Image claim {index} verification failed.",
                {
                    "claim": claim[:250],
                    "claim_index": index,
                    "total_claims": total_claims,
                },
            )

            return {
                "claim": claim,
                "visual_basis": visual_basis,
                "verdict": "Inconclusive",
                "assessment": (
                    "Claim verification could not be completed."
                ),
                "evidence_summary": "",
                "uncertainty": (
                    "Evidence retrieval or verification failed."
                ),
                "sources": [],
                "model": "Unknown",
            }

    verification_start = time.perf_counter()

    results = await asyncio.gather(
        *[
            verify_one(index, item)
            for index, item in enumerate(
                claims,
                start=1,
            )
        ]
    )

    verification_time = (
        time.perf_counter() - verification_start
    )

    logger.info(
        "CLAIM_VERIFICATION_TIME: %.2fs",
        verification_time,
    )

    # -----------------------------------------------------
    # STAGE 4: FINAL PIPELINE METRICS
    # -----------------------------------------------------

    total_pipeline_time = (
        time.perf_counter() - pipeline_start
    )

    logger.info(
        "IMAGE_PIPELINE_METRICS | "
        "ANALYSIS: %.2fs | "
        "SAM: %.2fs | "
        "VERIFICATION: %.2fs | "
        "TOTAL: %.2fs | "
        "CLAIMS: %s | "
        "CONCURRENCY: %s",
        analysis_time,
        sam_time,
        verification_time,
        total_pipeline_time,
        total_claims,
        MAX_CONCURRENT_VERIFICATIONS,
    )

    final_limitations = analysis.get(
        "limitations",
        [],
    )

    if not isinstance(final_limitations, list):
        final_limitations = []

    final_limitations.extend(limitations)

    emit_event(
        run_id,
        "image_investigation_completed",
        "Image analysis, SAM segmentation and claim verification completed.",
        {
            "claim_count": len(results),
            "model": analysis.get("model", "Unknown"),
            "sam_model": SAM_MODEL,
            "sam_status": (
                segmentation.get("status")
                if segmentation
                else "unavailable"
            ),
            "analysis_time_seconds": round(
                analysis_time, 2
            ),
            "sam_time_seconds": round(
                sam_time, 2
            ),
            "verification_time_seconds": round(
                verification_time, 2
            ),
            "total_time_seconds": round(
                total_pipeline_time, 2
            ),
        },
    )

    # -----------------------------------------------------
    # FINAL RESPONSE
    # -----------------------------------------------------

    return {
        "status": "completed",
        "investigation_type": "image",
        "filename": filename,
        "visual_summary": analysis.get(
            "visual_summary", ""
        ),
        "visible_text": analysis.get(
            "visible_text", []
        ),
        "claims": results,
        "segmentation": segmentation,
        "limitations": final_limitations,

                "models": {
            "image_analysis": analysis.get("model", "Unknown"),
            "claim_verification": list({
                item.get("model", "Unknown")
                for item in results
            }),
            "segmentation": SAM_MODEL,
        },

        "model": analysis.get(
            "model", "Unknown"
        ),
    }
