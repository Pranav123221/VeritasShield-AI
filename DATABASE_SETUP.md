# Supabase PostgreSQL setup

1. Install: `python -m pip install "SQLAlchemy>=2.0,<3.0" "psycopg[binary]>=3.2,<4.0"`
2. In Supabase, open Project → Connect → Session Pooler and copy its connection string.
3. Put it in root `.env` as `DATABASE_URL`. Never commit `.env`; keep `.env.example` placeholders only.
4. Add `DB_SSLMODE=require` and `CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`.
5. Copy the three Python modules into `app/`. Replace `app/main.py` only with the separately supplied database-aware version (see next assistant message).
6. Start with `python -m uvicorn app.main:app --reload`.

Tables: investigations, evidence_sources, investigation_events, evidence_files.
Upload bytes are NOT stored: only filename, content type, size and SHA-256 are recorded. `storage_key` is reserved for later Supabase Storage integration.
The existing SSE stream remains in-memory; event audit rows can be persisted separately. For multi-worker production, use shared event delivery (Redis or database polling).
`create_all()` is only a bootstrap. Add Alembic migrations before production schema evolution.
