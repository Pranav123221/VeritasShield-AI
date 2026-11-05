import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

api_key = os.getenv("MODEL_API_KEY")

if not api_key:
    raise RuntimeError(
        "MODEL_API_KEY is missing. Check your .env file."
    )

client = OpenAI(
    base_url="https://api.meta.ai/v1",
    api_key=api_key,
)

response = client.chat.completions.create(
    model="muse-spark-1.3",
    messages=[
        {
            "role": "user",
            "content": "Reply with exactly: VERITASSHIELD_API_CONNECTED",
        }
    ],
)

print(response.choices[0].message.content)
