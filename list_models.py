import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

api_key = os.getenv("MODEL_API_KEY")

if not api_key:
    raise RuntimeError("MODEL_API_KEY missing. Check your .env file.")

client = OpenAI(
    base_url="https://api.meta.ai/v1",
    api_key=api_key,
)

models = client.models.list()

print("\n=== AVAILABLE META MODELS ===\n")

for model in models.data:
    print(model.id)