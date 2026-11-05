
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI


# ---------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------

load_dotenv()

API_KEY = os.getenv("MODEL_API_KEY")
IMAGE_PATH = Path(r"E:\1280w-CWL5w-WE-NU.jpg")

MODEL = "sam-3.1"

# SAM accepts one concrete concept per request.
PROMPT = "person"

OUTPUT_PATH = Path("sam_output.txt")


# ---------------------------------------------------------
# VALIDATION
# ---------------------------------------------------------

if not API_KEY:
    raise RuntimeError(
        "MODEL_API_KEY is missing. Check your .env file."
    )

if not IMAGE_PATH.is_file():
    raise FileNotFoundError(
        f"Image not found: {IMAGE_PATH}"
    )

if IMAGE_PATH.suffix.lower() not in {
    ".jpg", ".jpeg", ".png", ".webp"
}:
    raise ValueError("Unsupported image format.")


mime_type = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}[IMAGE_PATH.suffix.lower()]


# ---------------------------------------------------------
# CLIENT
# ---------------------------------------------------------

client = OpenAI(
    base_url="https://api.meta.ai/v1",
    api_key=API_KEY,
    timeout=120.0,
    max_retries=1,
)


# ---------------------------------------------------------
# IMAGE ENCODING
# ---------------------------------------------------------

with IMAGE_PATH.open("rb") as file:
    image_bytes = file.read()

import base64

encoded_image = base64.b64encode(
    image_bytes
).decode("utf-8")

image_url = (
    f"data:{mime_type};base64,{encoded_image}"
)


# ---------------------------------------------------------
# SAM 3.1 INFERENCE
# ---------------------------------------------------------

def main():

    print("=" * 55)
    print("VERITASSHIELD AI | SAM 3.1 SEGMENTATION TEST")
    print("=" * 55)

    print("Model:", MODEL)
    print("Image:", IMAGE_PATH)
    print("Image size:", f"{len(image_bytes):,}", "bytes")
    print("Segmentation prompt:", PROMPT)

    print("\nSending image to Meta SAM 3.1...\n")

    output_parts = []

    stream = client.responses.create(
        model=MODEL,
        input=[
            {
                "type": "message",
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": PROMPT,
                    },
                    {
                        "type": "input_image",
                        "image_url": image_url,
                    },
                ],
            }
        ],
        stream=True,
        metadata={
            "include_confidence": "true"
        },
    )

    final_response = None

    try:
        for event in stream:

            if event.type == "response.output_text.delta":
                delta = event.delta

                if delta:
                    output_parts.append(delta)
                    print(delta, end="", flush=True)

            elif event.type == "response.completed":
                final_response = event.response

            elif event.type == "response.failed":
                raise RuntimeError(
                    f"SAM request failed: {event}"
                )

            elif event.type == "error":
                raise RuntimeError(
                    f"SAM stream error: {event}"
                )

    finally:
        stream.close()

    output_text = "".join(output_parts)

    print("\n\n" + "=" * 55)
    print("SEGMENTATION SUMMARY")
    print("=" * 55)

    OUTPUT_PATH.write_text(
        output_text,
        encoding="utf-8",
    )

    if not output_text.strip():
        print("No segmentation records returned.")
        print(
            "This is a valid zero-match result, "
            "not necessarily an API failure."
        )
        print("Saved empty output to:", OUTPUT_PATH)
        return

    # -----------------------------------------------------
    # BASIC OUTPUT INSPECTION
    # -----------------------------------------------------

    boxes = re.findall(
        r"<\|box;([^|]+)\|>",
        output_text,
    )

    masks = re.findall(
        r"<\|mask;([^|]+)\|>",
        output_text,
    )

    frames = re.findall(
        r"<(\d+)f>",
        output_text,
    )

    print("Frames returned:", len(set(frames)))
    print("Bounding boxes:", len(boxes))
    print("Mask records:", len(masks))

    if final_response is not None:
        print("Response status:", final_response.status)
        print("Response model:", final_response.model)

    if boxes:
        print("\nDETECTED BOUNDING BOXES:")

        for index, box in enumerate(boxes, start=1):
            print(f"{index}. {box}")

    if masks:
        print("\nMASK RECORDS:", len(masks))
        print(
            "Mask payloads are preserved in the raw output file."
        )

    if boxes and masks:
        print("\nSAM SEGMENTATION RECORDS DETECTED.")
    else:
        print("\nNo complete box-and-mask records detected.")
        print("Inspect the saved raw output.")

    print("\nRaw output saved to:", OUTPUT_PATH.resolve())


if __name__ == "__main__":
    main()
