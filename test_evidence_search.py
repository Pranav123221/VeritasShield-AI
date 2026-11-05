
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

claim = (
    "The Eiffel Tower was originally built in 1889 "
    "for the World's Fair in Paris."
)

response = client.responses.create(
    model="muse-spark-1.3",
    input=(
        "Investigate the following factual claim using web search. "
        "Return: (1) a concise assessment, "
        "(2) evidence from retrieved sources, "
        "(3) source URLs or citations available in your response, "
        "(4) any uncertainty. Do not invent sources.\n\n"
        f"Claim: {claim}"
    ),
    tools=[
        {"type": "web_search"}
    ],
)

print("\n=== EVIDENCE INVESTIGATION ===\n")
print(response.output_text)

print("\n=== RESPONSE DETAILS ===\n")
print(response.model_dump_json(indent=2))
