# `rag-api` Edge Function

The new app’s assistant calls the separate Supabase Edge Function `rag-api`.
It is not the existing `quiz-api`, and it does not modify tables, quiz data,
authentication settings, or the submitted repository.

## Request flow

1. Supabase verifies the signed-in user JWT before the handler and the handler
   explicitly checks `ctx.userClaims.id` from `createSupabaseContext(..., {
   auth: "user" })`.
2. The function embeds the question with `text-embedding-3-small` at 1536
   dimensions.
3. It calls Neo4j Aura’s HTTPS Query API and the existing
   `knowledge_embeddings` index, retrieving up to five relevant Knowledge
   nodes. The Cypher result is limited to `node.id`, `node.text`, and `score`;
   it never returns `properties(node)` or the stored embedding.
4. It sends the short retrieved context to one OpenAI Responses request with
   the server-configured model and a strict JSON schema. The response contains
   `kind` (`sql`, `explanation`, or `clarification`), PostgreSQL `sql`, and a
   brief `explanation`. The output budget is capped at 350 tokens.
5. It returns the structured result plus retrieval metadata for internal
   debugging/tests. The frontend does not display that metadata. Generated
   SQL is never executed or claimed to be validated.

The browser sends only `{ "question": "..." }` through
`supabase.functions.invoke("rag-api", ...)`. OpenAI and Neo4j credentials are
server-side only. Both GitHub Pages apps share an origin, so CORS cannot
isolate their repository paths and is not an authentication boundary.

## New function secrets

Set these only in the Supabase Edge Function secret store or a local, ignored
function environment file. Do not add them to the committed frontend or to
the submitted repository:

```text
RAG_OPENAI_API_KEY
RAG_OPENAI_SQL_MODEL=gpt-6-luna
RAG_NEO4J_URI=neo4j+s://<database-id>.databases.neo4j.io
RAG_NEO4J_USERNAME
RAG_NEO4J_PASSWORD
RAG_NEO4J_DATABASE=neo4j
RAG_HOURLY_LIMIT=10
RAG_DAILY_LIMIT=20
```

`SUPABASE_URL` and `SUPABASE_JWKS` are Supabase-provided runtime values, not
custom secrets. The function keeps `verify_jwt = true` in
[supabase/config.toml](./supabase/config.toml), matching this project’s
existing signed-in Supabase access-token setup. API keys are not accepted as
the user identity.

## Cache, quota, and failure behavior

Question embeddings use a bounded 64-entry, one-hour in-memory cache per Edge
Function isolate. Calls have a 15-second timeout and no automatic retries.
The 10/hour and 20/day per-user counters are also bounded in memory and are
best-effort controls, not hard spending limits: they reset after cold starts
or restarts and are not shared across workers, regions, or concurrent
isolates. A durable global limit would require shared rate-limit storage,
which is intentionally not added here.

The frontend makes no request on page load, panel open, typing, or navigation.
It sends a request only after the user submits, prevents duplicate
submissions, keeps the SQL code block and Copy SQL button, and renders the
explanation and SQL with text nodes. Retrieval sources are not shown in the
user interface.

Dataset-specific SQL must be grounded in retrieved schema and business rules.
General PostgreSQL explanations may use the model’s general knowledge and
clearly label hypothetical tables or columns. The current knowledge index is
still used for every request; no hardcoded answer menu replaces retrieval.

No additional Neo4j knowledge ingestion is included in this change. General
SQL concepts do not require new stored vectors, while dataset-specific
questions continue to depend on the existing `Knowledge` entries and index.

## Local mocked checks

With Deno installed, run from the repository root:

```bash
deno test --allow-env supabase/functions/rag-api/index_test.ts tests/email-login_test.js
```

The tests use mocked OpenAI and Neo4j responses and cover existing quiz
questions, new dataset questions, general SQL explanations, missing-column
clarifications, retrieval context forwarding, structured-output validation,
and the absence of a second explanation request. They do not contact live
services, execute generated SQL, deploy the function, or set remote secrets.
The existing Python terminal pipeline remains available in
[sql_rag.py](./sql_rag.py); its local embedding cache remains ignored.

## Deployment instructions (not run here)

From this repository, after reviewing the local tests and choosing the
correct Supabase project ref:

```bash
supabase functions serve rag-api
supabase secrets set --project-ref <project-ref> \
  RAG_OPENAI_API_KEY=<value> \
  RAG_OPENAI_SQL_MODEL=gpt-6-luna \
  RAG_NEO4J_URI=<aura-neo4j-s-uri> \
  RAG_NEO4J_USERNAME=<value> \
  RAG_NEO4J_PASSWORD=<value> \
  RAG_NEO4J_DATABASE=neo4j \
  RAG_HOURLY_LIMIT=10 \
  RAG_DAILY_LIMIT=20
supabase functions deploy rag-api --project-ref <project-ref>
```

These commands target only `rag-api`; do not run a deploy command for
`quiz-api`. Verify the function logs and one controlled signed-in request
after deployment. Never place real secret values in Git, frontend assets, or
this document.

Runtime references: [Supabase Edge Function auth](https://supabase.com/docs/guides/functions/auth), [Supabase auth headers](https://supabase.com/docs/guides/functions/auth-headers), [Neo4j Query API](https://neo4j.com/docs/query-api/current/), and [OpenAI TypeScript/API reference](https://developers.openai.com/api/reference/typescript).
