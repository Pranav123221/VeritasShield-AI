
import os
import asyncio
import base64
from pathlib import Path

from dotenv import load_dotenv
from openai import AsyncOpenAI
from PIL import Image, ImageDraw

from meta_sam_parser import (
    image_segmentation_format,
    parse_responses_stream,
    SegmentationMaskRecord,
    decode_mask_to_raster,
)

load_dotenv()

IMAGE_PATH = Path(r"E:\1280w-CWL5w-WE-NU.jpg")
OUTPUT_PATH = Path("sam_segmentation_overlay.png")

COLORS = [
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


async def main():
    api_key = os.getenv("MODEL_API_KEY")

    if not api_key:
        raise RuntimeError("MODEL_API_KEY missing from .env")

    if not IMAGE_PATH.exists():
        raise FileNotFoundError(IMAGE_PATH)

    original = Image.open(IMAGE_PATH).convert("RGBA")
    width, height = original.size

    print("Original image:", width, "x", height)

    client = AsyncOpenAI(
        base_url="https://api.meta.ai/v1",
        api_key=api_key,
        timeout=120.0,
    )

    try:
        image_bytes = IMAGE_PATH.read_bytes()
        image_url = (
            "data:image/jpeg;base64,"
            + base64.b64encode(image_bytes).decode("utf-8")
        )

        print("\nStarting SAM 3.1 segmentation...")

        source = await client.responses.create(
            model="sam-3.1",
            input=[
                {
                    "type": "message",
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": "person"},
                        {"type": "input_image", "image_url": image_url},
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

        print("SAM outcome:", result.outcome)

        masks = [
            record
            for record in result.records
            if isinstance(record, SegmentationMaskRecord)
        ]

        print("Masks received:", len(masks))

        overlay = Image.new("RGBA", original.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        for index, record in enumerate(masks):
            bounds = record.bounds

            left = int(bounds.left)
            top = int(bounds.top)
            right = int(bounds.right)
            bottom = int(bounds.bottom)

            mask_width = record.mask.width
            mask_height = record.mask.height

            raster = decode_mask_to_raster(record.mask)

            if len(raster) != mask_width * mask_height:
                raise ValueError(
                    f"Invalid raster size for object {record.object_id}"
                )

            if (
                left < 0
                or top < 0
                or right > width
                or bottom > height
                or right - left != mask_width
                or bottom - top != mask_height
            ):
                raise ValueError(
                    f"Mask bounds do not match image for object "
                    f"{record.object_id}: {bounds}"
                )

            color = COLORS[index % len(COLORS)]

            # Place decoded mask pixels at their original image coordinates.
            mask_layer = Image.new(
                "RGBA",
                (mask_width, mask_height),
                (0, 0, 0, 0),
            )

            pixels = mask_layer.load()

            for y in range(mask_height):
                for x in range(mask_width):
                    value = raster[y * mask_width + x]

                    if value:
                        pixels[x, y] = (*color, 125)

            overlay.alpha_composite(mask_layer, (left, top))

            # Draw the object bounding box and ID.
            draw.rectangle(
                (left, top, right - 1, bottom - 1),
                outline=(*color, 255),
                width=2,
            )

            draw.text(
                (left, max(0, top - 15)),
                f"ID {record.object_id}",
                fill=(*color, 255),
            )

            print(
                f"Object {record.object_id}: "
                f"bounds=({left}, {top}, {right}, {bottom})"
            )

        final_image = Image.alpha_composite(original, overlay)
        final_image.convert("RGB").save(OUTPUT_PATH, quality=95)

        print("\nOverlay saved:", OUTPUT_PATH.resolve())
        print("Total masks rendered:", len(masks))
        print("SAM OVERLAY TEST COMPLETED")

    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
