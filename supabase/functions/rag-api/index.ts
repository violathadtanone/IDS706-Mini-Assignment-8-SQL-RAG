import { createSupabaseContext } from "npm:@supabase/server@1";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const NEO4J_INDEX = "knowledge_embeddings";
const TOP_K = 5;
const MAX_OUTPUT_TOKENS = 350;
const MAX_QUESTION_LENGTH = 2000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 64;
const MAX_QUOTA_USERS = 5000;
const REQUEST_TIMEOUT_MS = 15_000;
const COMPLETE_DATASET_SCHEMA = `
Authoritative complete schema for the three dataset tables:
schools(school_id VARCHAR PRIMARY KEY, school_name VARCHAR, city VARCHAR, state VARCHAR, school_type VARCHAR)
students(student_id VARCHAR PRIMARY KEY, first_name VARCHAR, last_name VARCHAR, grade_level VARCHAR, gpa NUMERIC, school_id VARCHAR REFERENCES schools.school_id)
meals(meal_id VARCHAR PRIMARY KEY, student_id VARCHAR REFERENCES students.student_id, meal_date DATE, meal_item VARCHAR, price NUMERIC)
Relationships: students.school_id joins schools.school_id; meals.student_id joins students.student_id.
Business rule: the dataset represents students enrolled in a free lunch program.
No other dataset tables or columns are confirmed by this schema. In particular, household income is not included.`;

type Source = { id: string; snippet: string; score?: number };
type AssistantResult = { kind: "sql" | "explanation" | "clarification"; sql: string; explanation: string };
type EmbeddingEntry = { embedding: number[]; expiresAt: number };
type Dependencies = { fetchImpl?: typeof fetch; now?: () => number };

const embeddingCache = new Map<string, EmbeddingEntry>();
const quotaLog = new Map<string, number[]>();

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function env(name: string): string | undefined {
  const value = Deno.env.get(name)?.trim();
  return value || undefined;
}

function configuredError(message: string) {
  return json({ error: message }, 503);
}

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function boundedSet<T>(cache: Map<string, T>, key: string, value: T, limit: number) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) cache.delete(cache.keys().next().value!);
}

function neo4jHttpsUrl(uri: string, database: string) {
  const host = uri.replace(/^neo4j\+s:\/\//, "").replace(/^neo4j:\/\//, "").replace(/^https:\/\//, "").replace(/\/$/, "");
  if (!host || /[:/]/.test(host)) throw new Error("RAG_NEO4J_URI must identify a Neo4j Aura HTTPS host.");
  return `https://${host}/db/${encodeURIComponent(database)}/query/v2`;
}

export const NEO4J_SEARCH = `
MATCH (node:Knowledge)
SEARCH node IN (VECTOR INDEX ${NEO4J_INDEX} FOR $embedding LIMIT ${TOP_K}) SCORE AS score
RETURN node.id AS id, node.text AS text, score
ORDER BY score DESC`;

export function parseNeo4jRows(payload: any): Source[] {
  const data = payload?.data;
  const fields = Array.isArray(data?.fields) ? data.fields : [];
  const values = Array.isArray(data?.values) ? data.values : [];
  return values.map((row: any[]) => {
    const record = Object.fromEntries(fields.map((field: string, index: number) => [field, row[index]]));
    return { id: String(record.id ?? "Knowledge source"), snippet: String(record.text ?? "").slice(0, 240), score: Number(record.score) };
  }).filter((source) => source.snippet);
}

async function openaiJson(path: string, body: unknown, apiKey: string, fetchImpl: typeof fetch) {
  const request = timeoutSignal(REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`https://api.openai.com/v1/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: request.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`OpenAI request failed (${response.status}).`);
    return payload;
  } finally {
    request.clear();
  }
}

async function getEmbedding(question: string, apiKey: string, fetchImpl: typeof fetch, now: () => number) {
  const key = await sha256(question);
  const cached = embeddingCache.get(key);
  if (cached && cached.expiresAt > now()) return cached.embedding;
  embeddingCache.delete(key);
  const payload = await openaiJson("embeddings", { model: EMBEDDING_MODEL, input: question, dimensions: EMBEDDING_DIMENSIONS }, apiKey, fetchImpl);
  const embedding = payload?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) throw new Error("Embedding response was invalid.");
  boundedSet(embeddingCache, key, { embedding, expiresAt: now() + CACHE_TTL_MS }, MAX_CACHE_ENTRIES);
  return embedding;
}

async function retrieveSources(embedding: number[], fetchImpl: typeof fetch) {
  const uri = env("RAG_NEO4J_URI");
  const username = env("RAG_NEO4J_USERNAME");
  const password = env("RAG_NEO4J_PASSWORD");
  const database = env("RAG_NEO4J_DATABASE") || "neo4j";
  if (!uri || !username || !password) throw new Error("Neo4j RAG configuration is incomplete.");
  const request = timeoutSignal(REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(neo4jHttpsUrl(uri, database), {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${username}:${password}`)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ statement: NEO4J_SEARCH, parameters: { embedding } }),
      signal: request.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Neo4j request failed (${response.status}).`);
    return parseNeo4jRows(payload);
  } finally {
    request.clear();
  }
}

function takeQuota(userId: string, now: number) {
  const timestamps = (quotaLog.get(userId) || []).filter((stamp) => stamp > now - 24 * 60 * 60 * 1000);
  const hourly = timestamps.filter((stamp) => stamp > now - 60 * 60 * 1000).length;
  const dailyLimit = Number(env("RAG_DAILY_LIMIT") || "20");
  const hourlyLimit = Number(env("RAG_HOURLY_LIMIT") || "10");
  if (hourly >= hourlyLimit || timestamps.length >= dailyLimit) return false;
  boundedSet(quotaLog, userId, [...timestamps, now], MAX_QUOTA_USERS);
  return true;
}

function responseText(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text.trim();
  return (payload?.output || []).flatMap((item: any) => item?.content || [])
    .filter((item: any) => item?.type === "output_text" && typeof item.text === "string")
    .map((item: any) => item.text).join("\n").trim();
}

export function parseAssistantResponse(payload: any): AssistantResult {
  const raw = responseText(payload);
  let result: any;
  try {
    result = JSON.parse(raw);
  } catch {
    throw new Error("The SQL assistant returned malformed structured output.");
  }
  if (!result || !["sql", "explanation", "clarification"].includes(result.kind) ||
      typeof result.sql !== "string" || typeof result.explanation !== "string" ||
      !result.explanation.trim() || (result.kind === "sql" && !result.sql.trim()) ||
      (result.kind === "clarification" && result.sql.trim()) ||
      result.sql.length > 8000 || result.explanation.length > 1200) {
    throw new Error("The SQL assistant returned an invalid structured response.");
  }
  return {
    kind: result.kind,
    sql: result.sql.trim(),
    explanation: result.explanation.trim(),
  };
}

export function buildGenerationContext(sources: Source[]) {
  return sources.map((source, index) => `[${index + 1}] ${source.id}: ${source.snippet}`).join("\n");
}

async function generateSql(question: string, sources: Source[], apiKey: string, model: string, fetchImpl: typeof fetch) {
  const context = buildGenerationContext(sources);
  const payload = await openaiJson("responses", {
    model,
    instructions: `You are a concise PostgreSQL teaching assistant for a school-lunch dataset.
Return JSON matching the supplied schema. Generate SQL and its brief plain-language explanation in this same response.
Use PostgreSQL syntax. Support SELECT, WHERE, ORDER BY, LIMIT, DISTINCT, aggregates, GROUP BY, HAVING, JOINs, NULL handling, subqueries, CTEs, and basic window functions.
For dataset questions, use only tables, columns, and business rules supported by the complete schema and retrieved knowledge. Never invent schema. The complete schema is authoritative: if a requested table or field is absent, use kind "clarification", leave sql empty, and state plainly that the requested data is not included and cannot be answered using these tables. Do not ask the user where an absent field is. Ask one concise question only when the schema itself does not determine a needed detail.
For general SQL questions, use kind "explanation" and may include a small clearly hypothetical SQL example in sql; label hypothetical examples in explanation.
For dataset SQL, use kind "sql". SQL must be read-only and must not be claimed executed or validated. Keep explanation under three sentences.`,
    input: `Question:\n${question}\n\n${COMPLETE_DATASET_SCHEMA}\n\nRetrieved knowledge (use this to add relevant schema details and business rules):\n${context}`.slice(0, 10000),
    max_output_tokens: MAX_OUTPUT_TOKENS,
    text: {
      format: {
        type: "json_schema",
        name: "sql_assistant_response",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            kind: { type: "string", enum: ["sql", "explanation", "clarification"] },
            sql: { type: "string" },
            explanation: { type: "string" },
          },
          required: ["kind", "sql", "explanation"],
        },
      },
    },
  }, apiKey, fetchImpl);
  return parseAssistantResponse(payload);
}

export async function handleRagRequest(req: Request, userId: string, deps: Dependencies = {}) {
  if (req.method !== "POST") return json({ error: "Use POST for SQL generation." }, 405);
  const length = Number(req.headers.get("content-length") || "0");
  if (length > 12_000) return json({ error: "Request is too large." }, 413);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Request body must be JSON." }, 400); }
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question || question.length > MAX_QUESTION_LENGTH) return json({ error: "Question must be between 1 and 2000 characters." }, 400);
  const now = deps.now || Date.now;
  if (!takeQuota(userId, now())) return json({ error: "Generation quota reached. Try again later." }, 429);
  const apiKey = env("RAG_OPENAI_API_KEY");
  if (!apiKey) return configuredError("RAG backend is not configured.");
  const fetchImpl = deps.fetchImpl || fetch;
  try {
    const embedding = await getEmbedding(question, apiKey, fetchImpl, now);
    const sources = await retrieveSources(embedding, fetchImpl);
    const result = await generateSql(question, sources, apiKey, env("RAG_OPENAI_SQL_MODEL") || "gpt-6-luna", fetchImpl);
    return json({ ...result, sources });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "RAG request failed");
    return json({ error: "The SQL assistant is unavailable. Try again later." }, 502);
  }
}

export function authenticatedUserId(context: { userClaims?: { id?: unknown } } | null | undefined) {
  const id = context?.userClaims?.id;
  return typeof id === "string" && id.trim() ? id : null;
}

export async function serveRagRequest(req: Request, authContext = createSupabaseContext) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const { data: context, error } = await authContext(req, { auth: "user" });
  const userId = authenticatedUserId(context);
  if (error || !userId) return json({ error: "A valid signed-in Supabase user is required." }, 401);
  return handleRagRequest(req, userId);
}

export function createProductionHandler(authContext = createSupabaseContext) {
  return (req: Request) => serveRagRequest(req, authContext);
}

export function startRagServer(serve = Deno.serve, authContext = createSupabaseContext) {
  const handler = createProductionHandler(authContext);
  return serve((req: Request) => handler(req));
}

if (import.meta.main) startRagServer();
