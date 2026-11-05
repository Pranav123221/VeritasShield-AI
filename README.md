# VeritasShield AI — Backend Starter

An evidence-linked claim-investigation API using Meta Model API (`muse-spark-1.3`) and the Responses API `web_search` tool.

## Current scope

- FastAPI backend with `/health`, `/`, and `/api/verify`
- Request validation with Pydantic
- Meta Responses API integration
- Extracts URL citation annotations returned by the API
- Three cautious verdicts: `Supported`, `Contradicted`, `Inconclusive`
- Basic tests for health and input validation

**Important:** This is a starter backend, not a complete fact-checking system. Model-generated assessments can be wrong. A source link is not proof that the source supports a claim; the UI should let users inspect sources. Use `Inconclusive` when evidence is weak or conflicting.

## Setup (Windows PowerShell)

1. Extract the ZIP and open a terminal in this folder.
2. Create a virtual environment:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

3. Install packages:

   ```powershell
   python -m pip install -r requirements.txt
   ```

4. Create your local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

5. Open `.env` and replace `replace_with_your_key` with your Meta Model API key. Never commit `.env` or paste the key into chat.

6. Start the API:

   ```powershell
   uvicorn app.main:app --reload
   ```

7. Open `http://127.0.0.1:8000/docs`, choose `POST /api/verify`, click **Try it out**, and test with:

   ```json
   {
     "claim": "The Eiffel Tower was built for the 1889 World's Fair in Paris."
   }
   ```

## Run tests

```powershell
pytest -q
```

The tests do not call Meta's paid API.

## Environment variables

- `MODEL_API_KEY`: your Meta Model API key
- `META_MODEL`: defaults to `muse-spark-1.3`

## Next milestones

1. Build a polished frontend.
2. Add screenshot upload and multimodal analysis after verifying the exact supported image-input format.
3. Add persistence and history only after defining privacy and retention behavior.
4. Add structured evidence review and tests with supported, contradicted, ambiguous, and adversarial claims.
5. Before deployment, add rate limiting, file-size limits, request timeouts, privacy disclosures, and stricter CORS.
