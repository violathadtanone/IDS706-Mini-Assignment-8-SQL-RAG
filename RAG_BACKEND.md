# Separate SQL RAG backend

`rag_api.py` is a separate FastAPI service for the floating SQL assistant. It
does not modify or call the shared Supabase `quiz-api` for quiz operations. It
verifies the existing Supabase access token through Supabase Auth, then calls
the reusable pipeline in `sql_rag.py`.

## Server configuration

Set these variables only in the backend environment or a local `.env` file:

```text
OPENAI_API_KEY=...
OPENAI_SQL_MODEL=gpt-6-luna
NEO4J_URI=...
NEO4J_USERNAME=...
NEO4J_PASSWORD=...
NEO4J_DATABASE=...
RAG_SUPABASE_URL=...
RAG_SUPABASE_ANON_KEY=...
RAG_ALLOWED_ORIGIN=https://violathadtanone.github.io
RAG_HOURLY_LIMIT=10
RAG_DAILY_LIMIT=20
```

The browser only needs the public `RAG_CONFIG.endpoint` value in
`rag-config.js`; it must never receive any of the values above.

CORS should allow the GitHub Pages origin, or the local preview origin during
development. Because both GitHub Pages repositories share that origin, CORS
cannot distinguish their repository paths and is not an authentication
boundary. Supabase token verification and server-side quotas are the security
controls.

## Local run

Install [requirements.txt](./requirements.txt), then run:

```bash
RAG_ALLOWED_ORIGIN=http://127.0.0.1:8000 uvicorn rag_api:app --reload --port 8001
```

The frontend can point at `http://127.0.0.1:8001/generate-sql` for a local
integration test. The backend still requires a valid signed-in Supabase token
for a real request.

## Cache and quota limitations

Question embeddings are stored in the ignored `.cache/sql_rag_embeddings.json`
file. That cache survives a process restart only when the backend runs on a
persistent filesystem. It is local to one filesystem and is not shared by
multiple workers or containers, so separate workers may repeat embedding
requests.

The initial 10-per-user-per-hour and 20-per-user-per-day quotas are held in
process memory. They reset on restart, are not durable, and are not global
across multiple workers or instances. A production deployment needs shared
rate-limit storage such as Redis before these limits can be treated as global.

The endpoint only generates and returns SQL. It never executes or saves the
generated SQL.
