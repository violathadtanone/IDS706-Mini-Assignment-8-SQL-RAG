import { assertEquals, assertFalse, assertStringIncludes } from "jsr:@std/assert@1";
import { authenticatedUserId, handleRagRequest, NEO4J_SEARCH, parseNeo4jRows, serveRagRequest, startRagServer } from "./index.ts";

function response(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function mockFetch(calls: string[]) {
  return async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method || "GET"} ${url}`);
    if (url.endsWith("/embeddings")) return response(200, { data: [{ embedding: [0.1, 0.2, 0.3] }] });
    if (url.includes("/query/v2")) return response(200, {
      data: { fields: ["id", "text", "score"], values: [["k-1", "Use a grouped aggregate.", 0.98]] },
    });
    if (url.endsWith("/responses")) return response(200, { output_text: "SELECT COUNT(*) FROM students;" });
    return response(404, {});
  };
}

Deno.test("Neo4j query returns only id, text, and score", () => {
  assertStringIncludes(NEO4J_SEARCH, "RETURN node.id AS id, node.text AS text, score");
  assertFalse(NEO4J_SEARCH.includes("properties(node)"));
  assertFalse(NEO4J_SEARCH.toLowerCase().includes("embedding AS"));
  assertEquals(parseNeo4jRows({ data: { fields: ["id", "text", "score"], values: [["x", "snippet", 0.4]] } }), [
    { id: "x", snippet: "snippet", score: 0.4 },
  ]);
});

Deno.test("Supabase user context uses userClaims.id", () => {
  assertEquals(authenticatedUserId({ userClaims: { id: "user-123" } }), "user-123");
  assertEquals(authenticatedUserId({ userClaims: { id: "  " } }), null);
  assertEquals(authenticatedUserId({ userClaims: { id: undefined } }), null);
  assertEquals(authenticatedUserId({ userClaims: {} }), null);
});

Deno.test("serveRagRequest accepts mocked authenticated context and rejects missing identity", async () => {
  Deno.env.delete("RAG_OPENAI_API_KEY");
  const request = new Request("http://local/generate", { method: "POST", body: JSON.stringify({ question: "test" }) });
  const authenticated = await serveRagRequest(request, async () => ({ data: { userClaims: { id: "user-123" } }, error: null }) as any);
  assertEquals(authenticated.status, 503);
  const unauthenticated = await serveRagRequest(request, async () => ({ data: { userClaims: {} }, error: null }) as any);
  assertEquals(unauthenticated.status, 401);
});

Deno.test("production entrypoint ignores Deno request-info and preserves auth checks", async () => {
  let productionHandler: ((request: Request) => Promise<Response>) | undefined;
  const mockServe = (handler: (request: Request) => Promise<Response>) => {
    productionHandler = handler;
    return undefined;
  };
  const authenticatedContext = async () => ({ data: { userClaims: { id: "user-123" } }, error: null });
  startRagServer(mockServe, authenticatedContext as any);
  assert(productionHandler, "Deno.serve was not given a production handler");

  const malformedRequest = new Request("http://local/generate", { method: "POST", body: "not-json" });
  const authenticatedResponse = await (productionHandler as any)(malformedRequest, { remoteAddr: "mock-info" });
  assertEquals(authenticatedResponse.status, 400);

  const unauthenticatedContext = async () => ({ data: { userClaims: {} }, error: null });
  let unauthenticatedHandler: ((request: Request) => Promise<Response>) | undefined;
  startRagServer((handler) => {
    unauthenticatedHandler = handler;
    return undefined;
  }, unauthenticatedContext as any);
  const unauthenticatedResponse = await (unauthenticatedHandler as any)(new Request("http://local/generate", { method: "POST" }), { remoteAddr: "mock-info" });
  assertEquals(unauthenticatedResponse.status, 401);
});

Deno.test("mocked flow embeds, retrieves, and generates without executing SQL", async () => {
  Deno.env.set("RAG_OPENAI_API_KEY", "test-only");
  Deno.env.set("RAG_NEO4J_URI", "neo4j+s://example.databases.neo4j.io");
  Deno.env.set("RAG_NEO4J_USERNAME", "user");
  Deno.env.set("RAG_NEO4J_PASSWORD", "password");
  Deno.env.set("RAG_NEO4J_DATABASE", "neo4j");
  const calls: string[] = [];
  const result = await handleRagRequest(
    new Request("http://local/generate", { method: "POST", body: JSON.stringify({ question: "How many students?" }) }),
    "user-1",
    { fetchImpl: mockFetch(calls), now: () => 1_000_000 },
  );
  assertEquals(result.status, 200);
  const body = await result.json();
  assertEquals(body.sql, "SELECT COUNT(*) FROM students;");
  assertEquals(body.sources[0].id, "k-1");
  assertEquals(calls.filter((call) => call.includes("/embeddings")).length, 1);
  assertEquals(calls.filter((call) => call.includes("/responses")).length, 1);
  assertFalse(calls.some((call) => call.includes("/sql") || call.includes("/transaction")));
});

Deno.test("embedding cache avoids repeating the embedding request", async () => {
  const calls: string[] = [];
  const fetchImpl = mockFetch(calls);
  const request = () => new Request("http://local/generate", { method: "POST", body: JSON.stringify({ question: "cached question" }) });
  const deps = { fetchImpl, now: () => 2_000_000 };
  assertEquals((await handleRagRequest(request(), "cache-user", deps)).status, 200);
  assertEquals((await handleRagRequest(request(), "cache-user", deps)).status, 200);
  assertEquals(calls.filter((call) => call.includes("/embeddings")).length, 1);
});

Deno.test("quota is explicit and best-effort in memory", async () => {
  Deno.env.set("RAG_HOURLY_LIMIT", "1");
  const deps = { fetchImpl: mockFetch([]), now: () => 3_000_000 };
  const request = () => new Request("http://local/generate", { method: "POST", body: JSON.stringify({ question: crypto.randomUUID() }) });
  assertEquals((await handleRagRequest(request(), "quota-user", deps)).status, 200);
  assertEquals((await handleRagRequest(request(), "quota-user", deps)).status, 429);
  Deno.env.delete("RAG_HOURLY_LIMIT");
});
