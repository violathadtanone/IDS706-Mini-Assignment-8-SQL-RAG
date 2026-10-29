import { assert, assertEquals, assertFalse, assertStringIncludes } from "jsr:@std/assert@1";
import { authenticatedUserId, buildGenerationContext, handleRagRequest, NEO4J_SEARCH, parseAssistantResponse, parseNeo4jRows, serveRagRequest, startRagServer } from "./index.ts";

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
    if (url.endsWith("/responses")) return response(200, {
      output_text: JSON.stringify({ kind: "sql", sql: "SELECT COUNT(*) FROM students;", explanation: "Counts the rows in students." }),
    });
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

Deno.test("one structured generation supports quiz, new dataset, general, and clarification questions", async () => {
  Deno.env.set("RAG_OPENAI_API_KEY", "test-only");
  Deno.env.set("RAG_NEO4J_URI", "neo4j+s://example.databases.neo4j.io");
  Deno.env.set("RAG_NEO4J_USERNAME", "user");
  Deno.env.set("RAG_NEO4J_PASSWORD", "password");
  const cases = [
    { question: "Who are the top 10 students by GPA?", kind: "sql", sql: "SELECT student_id, gpa FROM students ORDER BY gpa DESC LIMIT 10;", explanation: "Sorts students by GPA and keeps the first 10." },
    { question: "Which city has the most meal transactions?", kind: "sql", sql: "SELECT s.city, COUNT(*) FROM schools s JOIN students st ON st.school_id = s.school_id GROUP BY s.city;", explanation: "Groups meal-related records by city." },
    { question: "What does GROUP BY do?", kind: "explanation", sql: "SELECT city, COUNT(*) FROM hypothetical_sales GROUP BY city;", explanation: "Hypothetical example: GROUP BY combines rows with the same city so an aggregate can be calculated per city." },
    { question: "Show the unicorn_score column.", kind: "clarification", sql: "", explanation: "Which dataset table and confirmed column should unicorn_score come from?" },
  ];
  for (const [index, expected] of cases.entries()) {
    const calls: string[] = [];
    const requestBodies: any[] = [];
    const fetchImpl = async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/embeddings")) return response(200, { data: [{ embedding: [0.1, 0.2, 0.3] }] });
      if (url.includes("/query/v2")) return response(200, {
        data: { fields: ["id", "text", "score"], values: [["schema-1", "Tables schools(school_id, city), students(school_id, gpa), and meals(student_id, price).", 0.99]] },
      });
      if (url.endsWith("/responses")) {
        requestBodies.push(JSON.parse(String(init?.body)));
        return response(200, { output_text: JSON.stringify(expected) });
      }
      return response(404, {});
    };
    const result = await handleRagRequest(
      new Request("http://local/generate", { method: "POST", body: JSON.stringify({ question: expected.question }) }),
      `scenario-${index}`,
      { fetchImpl, now: () => 10_000_000 + index },
    );
    assertEquals(result.status, 200);
    const body = await result.json();
    assertEquals(body.kind, expected.kind);
    assertEquals(body.sql, expected.sql);
    assertEquals(body.explanation, expected.explanation);
    assertEquals(calls.filter((url) => url.endsWith("/responses")).length, 1);
    assertStringIncludes(requestBodies[0].input, "household income is not included");
    assertStringIncludes(requestBodies[0].input, "schema-1");
    assertStringIncludes(requestBodies[0].input, "school_id");
  }
});

Deno.test("malformed model output is rejected safely", () => {
  let failed = false;
  try {
    parseAssistantResponse({ output_text: "not JSON" });
  } catch (error) {
    failed = error instanceof Error && error.message.includes("malformed structured output");
  }
  assert(failed, "Malformed model output should produce a safe validation error");
  assertEquals(buildGenerationContext([{ id: "k-1", snippet: "schema text" }]), "[1] k-1: schema text");
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
