// Exercise the real frontend handlers with a small DOM and Supabase stub.
const source = await Deno.readTextFile(new URL("../app.js", import.meta.url));
function assert(value, message) {
  if (!value) throw new Error(message);
}

function makeSession(
  user = "user-a",
  id = "00000000-0000-0000-0000-000000000001",
  refreshed = false,
) {
  const claims = {
    sub: user,
    session_id: id,
    amr: [{ method: "otp" }],
    exp: refreshed ? 200 : 100,
  };
  return {
    user: { id: user, email: `${user}@example.test` },
    access_token: `header.${btoa(JSON.stringify(claims))}.signature`,
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function setup(
  { sendError = null, loggingError = null, invokeHook = null, bootstrap = false, ragPayload = null, clipboardError = null, ragResponse = null } = {},
) {
  const nodes = new Map();
  let focusedElement = null;
  const documentListeners = {};
  function element() {
    return {
      value: "",
      disabled: false,
      hidden: false,
      open: false,
      style: {},
      classList: { toggle() {}, add() {}, remove() {} },
      attributes: {},
      children: [],
      setAttribute(key, value) {
        this.attributes[key] = value;
      },
      removeAttribute(key) {
        delete this.attributes[key];
      },
      replaceChildren(...children) {
        this.children = children;
      },
      append(...children) {
        this.children.push(...children);
      },
      listeners: {},
      addEventListener(name, callback) {
        this.listeners[name] = callback;
      },
      focus() {
        focusedElement = this;
      },
      close() {
        this.open = false;
      },
    };
  }
  const document = {
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, element());
      return nodes.get(selector);
    },
    querySelectorAll: () => [],
    createElement: element,
    createTextNode: (s) => s,
    addEventListener(name, callback) {
      documentListeners[name] = callback;
    },
  };
  let authCallback, clientOptions;
  const restoredSession = deferred();
  const requests = [];
  const saved = new Map();
  const session = makeSession();
  const clipboardWrites = [];
  const navigatorMock = {
    clipboard: {
      async writeText(text) {
        clipboardWrites.push(text);
        if (clipboardError) throw clipboardError;
      },
    },
  };
  const sdkClient = {
    auth: {
      onAuthStateChange(callback) { authCallback = callback; },
      getSession() {
        return bootstrap
          ? restoredSession.promise
          : Promise.resolve({ data: { session }, error: null });
      },
      async signInWithOtp(body) {
        requests.push(["send", body]);
        return { error: sendError };
      },
    },
    functions: {
      async invoke(name, { body, headers }) {
        if (name === "rag-api") {
          requests.push([name, { body, headers }]);
          if (ragResponse) return ragResponse;
          return {
            data: ragPayload ?? {
              kind: "sql",
              sql: "SELECT COUNT(*) FROM students;",
              explanation: "Counts the rows in students.",
              sources: [{ id: "schema-1", snippet: "hidden retrieval metadata" }],
            },
            error: null,
          };
        }
        assert(name === "quiz-api", "Unexpected function");
        requests.push([body.action, body]);
        if (invokeHook) {
          const intercepted = invokeHook(body);
          if (intercepted !== undefined) return intercepted;
        }
        if (body.action === "login") {
          return { data: { recorded: true }, error: loggingError };
        }
        if (body.action === "run") {
          const quiz = app.quizzes[body.questionId];
          return {
            data: { columns: quiz.headers, rows: quiz.rows, truncated: false },
            error: null,
          };
        }
        if (body.action === "save") {
          const progress = {
            question_id: body.questionId,
            query_text: body.query,
            parameters: body.parameters,
          };
          saved.set(body.questionId, progress);
          return { data: { progress }, error: null };
        }
        return { data: { progress: [...saved.values()] }, error: null };
      },
    },
  };
  const app = new Function(
    "document",
    "window",
    "localStorage",
    "Response",
    "navigator",
    source + `
    return { signInWithEmail, applySession, generateAssistantSql,
      runQuery, saveQuiz, checkAnswer, answersMatch, invokeApi, renderQuiz, quizzes, questionIds, loadSavedProgress,
      points() { return earnedQuestions.size * 4; },
      useClient(value) { client = value; },
      isSignedIn() { return signedIn; }
    };
  `,
  )(document, bootstrap ? {
    SUPABASE_CONFIG: { url: "https://example.supabase.co", anonKey: "public-test-key" },
    supabase: { createClient(_url, _key, options) {
      clientOptions = options;
      return sdkClient;
    } },
    setTimeout,
  } : { setTimeout }, { getItem: () => null }, Response, navigatorMock);
  if (!bootstrap) app.useClient(sdkClient);
  const get = (selector) => document.querySelector(selector);
  get("#signin-email").value = session.user.email;
  get("#signin-dialog").open = true;
  return { app, get, requests, session, clientOptions, clipboardWrites, focusedElement: () => focusedElement,
    pressKey(key) { documentListeners.keydown?.({ key }); },
    restoreSession(value) { restoredSession.resolve({ data: { session: value }, error: null }); },
    emitAuth(event, value) { authCallback(event, value); },
  };
}
const event = { preventDefault() {} };

Deno.test("Magic Link request uses the exact quiz redirect; returned session unlocks and logs once", async () => {
  const { app, get, requests, session } = setup();
  await app.signInWithEmail(event);
  assert(!app.isSignedIn(), "Requesting a link must not sign in");
  assert(!requests.some(([kind]) => kind === "login"), "Requesting a link must not record a login");
  const send = requests.find(([kind]) => kind === "send")[1];
  assert(send.email === session.user.email, "Wrong recipient");
  assert(
    send.options.emailRedirectTo === "https://violathadtanone.github.io/IDS706-Mini-Assignment-8-SQL-RAG/",
    "Magic Link must return to the new RAG project URL",
  );
  assert(get("#signin-message").textContent.includes("Magic Link"), "Missing link instructions");
  // Supabase URL detection/auth callbacks deliver this session on return.
  await app.applySession(session);
  assert(app.isSignedIn(), "Returned session should sign in");
  assert(!get("#signin-dialog").open, "Dialog should close");
  assert(!get("#sql-editor").readOnly, "Quiz should unlock");
  const login = requests.filter(([kind]) => kind === "login");
  assert(login.length === 1, "Expected one login request");
  assert(
    JSON.stringify(login[0][1]) === '{"action":"login"}',
    "Do not send identity/token/session in login body",
  );
  await app.applySession(session);
  assert(
    requests.filter(([kind]) => kind === "login").length === 1,
    "Repeated session callback must not log another login",
  );
});

for (const mode of ["returned Magic Link", "restored persisted session"]) {
  Deno.test(`${mode} initializes through Supabase callbacks without manual refresh`, async () => {
    const fixture = setup({ bootstrap: true });
    const { app, get, session, clientOptions, requests } = fixture;
    assert(clientOptions.auth.detectSessionInUrl, "Must detect Magic Link session in URL");
    assert(clientOptions.auth.persistSession && clientOptions.auth.autoRefreshToken, "Session persistence/refresh must stay enabled");
    fixture.restoreSession(session);
    if (mode === "returned Magic Link") fixture.emitAuth("SIGNED_IN", session);
    // Drain the async auth callback, logging, and saved-progress load.
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert(app.isSignedIn() && !get("#sql-editor").readOnly, "Session did not unlock quiz automatically");
    assert(!get("#signin-dialog").open, "Sign-in dialog did not close");
    assert(requests.filter(([kind]) => kind === "login").length === 1, "Restoration/callback must record one login");
  });
}

Deno.test("failed Magic Link delivery keeps the quiz locked and allows retry", async () => {
  const { app, get, requests } = setup({ sendError: new Error("Email rate limit exceeded") });
  await app.signInWithEmail(event);
  assert(!app.isSignedIn() && get("#signin-dialog").open, "Failed delivery changed auth");
  assert(!requests.some(([kind]) => kind === "login"), "Failed delivery recorded a login");
  assert(get("#signin-message").textContent.includes("Email rate limit exceeded"), "Missing feedback");
  assert(!get("#send-magic-link").disabled, "Retry button should be enabled");
  await app.signInWithEmail(event);
  assert(requests.filter(([kind]) => kind === "send").length === 2, "Retry should request another link");
});

Deno.test("recording failure keeps a returned Magic Link session locked", async () => {
  const { app, get, session } = setup({ loggingError: { message: "Logging unavailable" } });
  await app.applySession(session);
  assert(!app.isSignedIn() && get("#sql-editor").readOnly, "Quiz must stay locked until login is recorded");
  assert(get("#signin-dialog").open, "Keep the sign-in dialog open on recording failure");
  assert(
    get("#feedback-message").textContent.includes("login transaction could not be recorded"),
    "Missing recording failure feedback",
  );
});

Deno.test("signed-out direct JavaScript calls cannot run, check, invoke, or save", async () => {
  const { app, get, requests } = setup();
  // Simulate someone enabling the buttons and editing the textarea manually.
  get("#sql-editor").value = "SELECT student_id FROM students";
  get("#run-query").disabled = false;
  get("#save-quiz").disabled = false;
  await app.runQuery();
  assert(
    get("#feedback-message").textContent.includes("Sign in"),
    "Direct run must be blocked",
  );
  await app.saveQuiz();
  assert(
    get("#feedback-message").textContent.includes("Sign in"),
    "Direct save must be blocked",
  );
  await app.checkAnswer();
  let rejected = false;
  try {
    await app.invokeApi({ action: "run", query: "SELECT * FROM students" });
  } catch {
    rejected = true;
  }
  assert(
    rejected && requests.length === 0,
    "Signed-out functions sent a backend request",
  );
});

Deno.test("signed-in assistant sends the current session token to rag-api", async () => {
  const { app, get, requests, session } = setup();
  await app.applySession(session);
  const question = "List school names\nordered by student count\nwith a limit of 10.";
  get("#assistant-input").value = question;
  await app.generateAssistantSql(event);
  const ragRequest = requests.find(([name]) => name === "rag-api");
  assert(ragRequest, "Expected rag-api request");
  assert(
    ragRequest[1].headers.Authorization === `Bearer ${session.access_token}`,
    "rag-api request must carry the current user JWT",
  );
  assert(
    !ragRequest[1].headers.Authorization.includes("public-test-key"),
    "The anon key must not be used as the bearer token",
  );
  assert(ragRequest[1].body.question === question, "Multiline question must be sent unchanged");
  assert(
    !get("#assistant-messages").children.some((child) => child.className === "assistant-sources"),
    "Retrieval sources must not be shown in the assistant UI",
  );
  const assistantItem = get("#assistant-messages").children.find((child) =>
    String(child.className).includes("assistant-message is-assistant")
  );
  assert(
    assistantItem?.children.some((child) => child.className === "assistant-sql"),
    "Generated SQL must remain visible as a code block",
  );
  assert(
    assistantItem?.children.some((child) => child.className === "assistant-explanation"),
    "Generated explanation must be visible",
  );
  assert(
    assistantItem.children.findIndex((child) => child.className === "assistant-response-heading") <
      assistantItem.children.findIndex((child) => child.className === "assistant-explanation") &&
      assistantItem.children.findIndex((child) => child.className === "assistant-sql-heading") <
      assistantItem.children.findIndex((child) => child.className === "assistant-sql"),
    "SQL response headings must precede their content",
  );
});

Deno.test("general assistant SQL executes without a correctness verdict", async () => {
  const { app, get, requests, session } = setup();
  await app.applySession(session);
  get("#assistant-input").value = "Count the students.";
  await app.generateAssistantSql(event);
  const runRequests = requests.filter(([name]) => name === "run");
  assert(runRequests.length === 1, "General SQL should execute once");
  const assistantItem = get("#assistant-messages").children.find((child) =>
    String(child.className).includes("assistant-message is-assistant")
  );
  const execution = assistantItem.children.find((child) => child.className === "assistant-execution");
  assert(execution, "Generated results should be shown in the assistant");
  assert(
    execution.children.some((child) => child.className === "assistant-validation-status" && child.textContent === "No expected answer selected"),
    "General SQL should not receive a correctness verdict",
  );
});

Deno.test("quiz validation runs generated and expected SQL and reports a match", async () => {
  const { app, get, requests, session } = setup();
  await app.applySession(session);
  get("#assistant-validation-target").value = "top-students";
  get("#assistant-input").value = "Return the top students.";
  await app.generateAssistantSql(event);
  assert(requests.filter(([name]) => name === "run").length === 2, "Quiz validation should run both queries");
  const assistantItem = get("#assistant-messages").children.find((child) =>
    String(child.className).includes("assistant-message is-assistant")
  );
  const execution = assistantItem.children.find((child) => child.className === "assistant-execution");
  assert(
    execution.children.some((child) => child.textContent === "Matches expected results"),
    "Matching quiz results should be reported",
  );
});

Deno.test("validation target is captured before the request starts", async () => {
  const response = deferred();
  const { app, get, requests, session } = setup({ ragResponse: response.promise });
  await app.applySession(session);
  get("#assistant-validation-target").value = "average-gpa";
  get("#assistant-input").value = "Group students by school.";
  const pending = app.generateAssistantSql(event);
  get("#assistant-validation-target").value = "school-cost";
  response.resolve({
    data: {
      kind: "sql",
      sql: "SELECT school_name FROM schools;",
      explanation: "Lists schools.",
      sources: [],
    },
    error: null,
  });
  await pending;
  const runRequests = requests.filter(([name]) => name === "run");
  assert(runRequests.length === 2, "Captured target should still run generated and expected SQL");
  assert(runRequests[0][1].questionId === "average-gpa", "Generated SQL used the changed selector");
  assert(runRequests[1][1].questionId === "average-gpa", "Expected SQL used the changed selector");
});

Deno.test("expected-answer execution failure preserves results and reports validation unavailable", async () => {
  const { app, get, requests, session } = setup({
    invokeHook(body) {
      if (body.action === "run" && body.query === app.quizzes[body.questionId].solution) {
        return { data: null, error: new Error("Expected query unavailable") };
      }
    },
  });
  await app.applySession(session);
  get("#assistant-validation-target").value = "top-students";
  get("#assistant-input").value = "Return the top students.";
  await app.generateAssistantSql(event);
  assert(requests.filter(([name]) => name === "run").length === 2, "Expected SQL should still be attempted");
  const assistantItem = get("#assistant-messages").children.find((child) =>
    String(child.className).includes("assistant-message is-assistant")
  );
  const execution = assistantItem.children.find((child) => child.className === "assistant-execution");
  assert(execution.children.some((child) => child.className === "assistant-result-table"), "Generated results should remain visible");
  assert(execution.children.some((child) => child.textContent === "Validation unavailable"), "Validation failure status is missing");
  assert(!execution.children.some((child) => child.textContent === "Does not match expected results"), "Validation failure is not a mismatch");
});

Deno.test("mismatched quiz results do not report an execution error", async () => {
  const { app, get, session } = setup({
    invokeHook(body) {
      if (body.action === "run" && body.query === app.quizzes[body.questionId].solution) {
        return { data: { columns: app.quizzes[body.questionId].headers, rows: [], truncated: false }, error: null };
      }
    },
  });
  await app.applySession(session);
  get("#assistant-validation-target").value = "top-students";
  get("#assistant-input").value = "Return the top students.";
  await app.generateAssistantSql(event);
  const assistantItem = get("#assistant-messages").children.find((child) =>
    String(child.className).includes("assistant-message is-assistant")
  );
  const execution = assistantItem.children.find((child) => child.className === "assistant-execution");
  assert(execution.children.some((child) => child.textContent === "Does not match expected results"), "Mismatch status is missing");
  assert(!execution.children.some((child) => String(child.textContent).startsWith("Execution error:")), "Mismatch should not be an execution error");
});

Deno.test("assistant does not include the removed quiz-question shortcut", () => {
  assert(!source.includes("assistant-use-question"), "Removed shortcut markup is still present");
  assert(!source.includes("assistantUseQuestion"), "Removed shortcut handler is still present");
});

Deno.test("signed-out assistant does not invoke rag-api", async () => {
  const { app, get, requests } = setup();
  get("#assistant-input").value = "How many students are there?";
  await app.generateAssistantSql(event);
  assert(!requests.some(([name]) => name === "rag-api"), "Signed-out assistant sent a request");
  assert(get("#assistant-messages").children.length > 0, "Signed-out prompt was not rendered");
});

Deno.test("assistant renders model content as text, not HTML", async () => {
  const { app, get, session } = setup({
    ragPayload: {
      kind: "sql",
      sql: "<script>bad()</script>",
      explanation: "<b>plain text</b>",
      sources: [],
    },
  });
  await app.applySession(session);
  get("#assistant-input").value = "Explain this query";
  await app.generateAssistantSql(event);
  const assistantItem = get("#assistant-messages").children.find((child) =>
    String(child.className).includes("assistant-message is-assistant")
  );
  const code = assistantItem.children.find((child) => child.className === "assistant-sql");
  const explanation = assistantItem.children.find((child) => child.className === "assistant-explanation");
  assert(code.textContent === "<script>bad()</script>", "SQL must be rendered as text");
  assert(explanation.textContent === "<b>plain text</b>", "Explanation must be rendered as text");
});

Deno.test("copy icon preserves SQL line breaks and announces success", async () => {
  const { app, get, session, clipboardWrites } = setup({
    ragPayload: {
      kind: "sql",
      sql: "SELECT city, COUNT(*)\nFROM schools\nGROUP BY city;",
      explanation: "Counts schools by city.",
      sources: [],
    },
  });
  await app.applySession(session);
  get("#assistant-input").value = "Count schools by city";
  await app.generateAssistantSql(event);
  const assistantItem = get("#assistant-messages").children.find((child) =>
    String(child.className).includes("assistant-message is-assistant")
  );
  const copyButton = assistantItem.children.find((child) => child.className === "assistant-copy");
  const status = assistantItem.children.find((child) => child.className === "assistant-copy-status");
  assert(copyButton.attributes["aria-label"] === "Copy SQL", "Copy icon needs an accessible label");
  assert(copyButton.title === "Copy SQL", "Copy icon needs a tooltip");
  assert(copyButton.innerHTML.includes("<svg"), "Copy control must use an inline SVG");
  await copyButton.listeners.click();
  assert(clipboardWrites[0] === "SELECT city, COUNT(*)\nFROM schools\nGROUP BY city;", "Clipboard text must preserve SQL line breaks");
  assert(copyButton.innerHTML.includes("<path"), "Successful copy must show the checkmark state");
  assert(status.textContent === "Copied", "Successful copy must announce Copied");
});

Deno.test("clipboard failure shows a clear message", async () => {
  const { app, get, session } = setup({ clipboardError: new Error("clipboard unavailable") });
  await app.applySession(session);
  get("#assistant-input").value = "Count students";
  await app.generateAssistantSql(event);
  const assistantItem = get("#assistant-messages").children.find((child) =>
    String(child.className).includes("assistant-message is-assistant")
  );
  const copyButton = assistantItem.children.find((child) => child.className === "assistant-copy");
  const status = assistantItem.children.find((child) => String(child.className).includes("assistant-copy-status"));
  await copyButton.listeners.click();
  assert(status.textContent.includes("Could not copy SQL"), "Clipboard failure message is missing");
});

Deno.test("unavailable dataset responses show only the Response layout", async () => {
  const { app, get, requests, session } = setup({
    ragPayload: {
      kind: "clarification",
      sql: "",
      explanation: "Household income is not included in this dataset, so this question cannot be answered using the available tables.",
      sources: [{ id: "schema", snippet: "hidden" }],
    },
  });
  await app.applySession(session);
  get("#assistant-input").value = "List students whose household income is below $30,000.";
  await app.generateAssistantSql(event);
  const assistantItem = get("#assistant-messages").children.find((child) =>
    String(child.className).includes("assistant-message is-assistant")
  );
  assert(assistantItem.children.some((child) => child.className === "assistant-response-heading"), "Response heading is missing");
  assert(assistantItem.children.some((child) => child.className === "assistant-explanation"), "Unavailable-data explanation is missing");
  assert(!assistantItem.children.some((child) => child.className === "assistant-sql-heading"), "Clarification must not show SQL heading");
  assert(!assistantItem.children.some((child) => child.className === "assistant-sql"), "Clarification must not show SQL");
  assert(!assistantItem.children.some((child) => child.className === "assistant-copy"), "Clarification must not show Copy SQL");
  assert(!requests.some(([name]) => name === "run"), "Clarification must not execute SQL");
});

Deno.test("generated SQL execution errors are shown separately", async () => {
  const { app, get, session } = setup({
    invokeHook(body) {
      if (body.action === "run") return { data: null, error: new Error("Read-only query rejected") };
    },
  });
  await app.applySession(session);
  get("#assistant-input").value = "Count students.";
  await app.generateAssistantSql(event);
  const assistantItem = get("#assistant-messages").children.find((child) =>
    String(child.className).includes("assistant-message is-assistant")
  );
  const execution = assistantItem.children.find((child) => child.className === "assistant-execution");
  assert(execution.children.some((child) => child.textContent === "Execution error: Read-only query rejected"), "Execution error is missing");
  assert(!execution.children.some((child) => child.textContent === "Does not match expected results"), "Execution error must not be a mismatch");
});

Deno.test("assistant opens and X closes the entire panel", () => {
  const { get } = setup();
  const panel = get("#sql-assistant");
  get("#assistant-launcher").listeners.click();
  assert(!panel.hidden && panel.attributes["aria-hidden"] === "false", "Launcher should open the panel");
  get("#assistant-close").listeners.click();
  assert(panel.hidden && panel.attributes["aria-hidden"] === "true", "X should hide the panel");
  assert(panel.attributes.inert === "", "Closed panel should be inert");
});

Deno.test("assistant launcher toggles open and closed without requests", () => {
  const { get, requests } = setup();
  const launcher = get("#assistant-launcher");
  const panel = get("#sql-assistant");
  launcher.listeners.click();
  launcher.listeners.click();
  assert(panel.hidden, "Second launcher click should close the panel");
  assert(requests.length === 0, "Toggling must not make a network request");
});

Deno.test("closing and reopening preserves draft and conversation history", async () => {
  const { app, get, requests, session } = setup();
  await app.applySession(session);
  const launcher = get("#assistant-launcher");
  const panel = get("#sql-assistant");
  launcher.listeners.click();
  get("#assistant-input").value = "How many students are there?";
  await app.generateAssistantSql(event);
  const messageCount = get("#assistant-messages").children.length;
  get("#assistant-input").value = "Keep this draft";
  const requestCount = requests.length;
  get("#assistant-close").listeners.click();
  launcher.listeners.click();
  assert(!panel.hidden, "Panel should reopen");
  assert(get("#assistant-input").value === "Keep this draft", "Draft was lost while closed");
  assert(get("#assistant-messages").children.length === messageCount, "Conversation history was lost while closed");
  assert(requests.length === requestCount, "Toggling must not make another request");
});

Deno.test("switching quiz questions preserves assistant history", async () => {
  const { app, get, session } = setup();
  await app.applySession(session);
  get("#assistant-launcher").listeners.click();
  get("#assistant-input").value = "What does GROUP BY do?";
  await app.generateAssistantSql(event);
  const before = get("#assistant-messages").children.length;
  app.renderQuiz("average-gpa");
  assert(get("#assistant-messages").children.length === before, "Quiz navigation cleared assistant history");
});

Deno.test("response arriving while closed stays closed and is retained", async () => {
  const response = deferred();
  const { app, get, requests, session } = setup({ ragResponse: response.promise });
  await app.applySession(session);
  get("#assistant-launcher").listeners.click();
  get("#assistant-input").value = "Count students";
  const pending = app.generateAssistantSql(event);
  get("#assistant-close").listeners.click();
  assert(get("#sql-assistant").hidden, "Panel should remain closed while request is pending");
  response.resolve({
    data: { kind: "sql", sql: "SELECT COUNT(*) FROM students;", explanation: "Counts students.", sources: [] },
    error: null,
  });
  await pending;
  assert(get("#sql-assistant").hidden, "Response completion should not reopen the panel");
  assert(requests.filter(([name]) => name === "rag-api").length === 1, "Expected exactly one request");
  assert(get("#assistant-messages").children.length >= 2, "Completed response was not retained");
});

Deno.test("Escape closes the panel and returns focus to the launcher", () => {
  const { get, focusedElement, pressKey } = setup();
  const launcher = get("#assistant-launcher");
  launcher.listeners.click();
  pressKey("Escape");
  assert(get("#sql-assistant").hidden, "Escape should close the panel");
  assert(focusedElement() === launcher, "Escape should return focus to the launcher");
});

Deno.test("all five hints provide SQL guidance without solutions and display expected output values", async () => {
  const { app, get, session } = setup();
  await app.applySession(session);
  assert(app.questionIds.length === 5, "Expected five questions");
  for (const id of app.questionIds) {
    app.renderQuiz(id);
    const quiz = app.quizzes[id];
    assert(
      get("#sql-editor").value === "",
      "Unanswered editor must stay blank",
    );
    assert(
      get("#hint-sql").textContent === quiz.hint &&
        !get("#hint-sql").textContent.includes(quiz.solution) &&
        /join|group|sort|limit|mean|count|choose/i.test(quiz.hint),
      "Hint must provide useful operations guidance without the full solution",
    );
    assert(
      get("#hint-result-description").textContent.length > 0,
      "Missing expected-result description",
    );
    const table = get("#hint-result-table").children[0].children[0];
    assert(
      table.children[0].children[0].children.length === quiz.headers.length,
      "Missing expected columns",
    );
    assert(
      table.children[1].children.length === quiz.rows.length &&
        quiz.rows.length > 0,
      "Missing expected-result rows",
    );
    const displayedHeaders = table.children[0].children[0].children.map((
      cell,
    ) => cell.textContent);
    const displayedRows = table.children[1].children.map((row) =>
      row.children.map((cell) => cell.textContent)
    );
    assert(
      JSON.stringify(displayedHeaders) === JSON.stringify(quiz.headers),
      "Wrong expected columns",
    );
    assert(
      JSON.stringify(displayedRows) === JSON.stringify(quiz.rows),
      "Expected answer values must remain visible",
    );
  }
});

Deno.test("five questions award exactly four points each, with no duplicate credit", async () => {
  const { app, get, session } = setup();
  await app.applySession(session);
  assert(app.questionIds.length === 5, "Expected five questions");
  for (const id of app.questionIds) {
    app.renderQuiz(id);
    const quiz = app.quizzes[id];
    const before = app.points();
    get("#sql-editor").value = quiz.solution;
    await app.checkAnswer();
    assert(app.points() === before + 4, "Each question must award four points");
    await app.checkAnswer();
    assert(
      app.points() === before + 4,
      "Repeated checks must not award extra points",
    );
  }
  assert(app.points() === 20, "Total must be 20 points");
  assert(
    get("#progress-fill").style.width === "100%",
    "20 points should fill the bar",
  );
});

Deno.test("signed-in frontend sends SQL and parameters, renders returned rows, and saves/restores answers", async () => {
  const { app, get, requests, session } = setup();
  await app.applySession(session);
  assert(!get("#sql-editor").readOnly, "Signed-in editor must be editable");
  const query = "SELECT student_id FROM students WHERE grade_level = $1";
  get("#sql-editor").value = query;
  get("#query-parameters").value = '["Grade 9"]';
  await app.runQuery();
  const run = requests.find(([kind]) => kind === "run")[1];
  assert(
    run.query === query && run.parameters[0] === "Grade 9",
    "Query/parameters were not passed to quiz-api",
  );
  const table = get("#results-content").children[0].children[0];
  assert(
    table.children[1].children.length > 0,
    "Returned rows were not rendered",
  );
  assert(
    get("#result-state").textContent === "EXECUTED",
    "Missing execution feedback",
  );
  await app.saveQuiz();
  assert(
    get("#feedback-message").textContent.includes("saved"),
    "Save not confirmed",
  );
  assert(app.points() === 0, "Saving must not award points");
  app.renderQuiz("average-gpa");
  app.renderQuiz("top-students");
  assert(get("#sql-editor").value === query, "Saved answer was not restored");
  const restored = setup({
    invokeHook: (body) =>
      body.action === "load"
        ? {
          data: {
            progress: [{
              question_id: "top-students",
              query_text: query,
              parameters: ["Grade 9"],
            }],
          },
          error: null,
        }
        : undefined,
  });
  await restored.app.applySession(restored.session);
  assert(
    restored.get("#sql-editor").value === query,
    "Backend load did not restore saved answer",
  );
});

Deno.test("same-session token refresh preserves drafts, parameters, results, and points", async () => {
  const { app, get, requests, session } = setup();
  await app.applySession(session);
  get("#sql-editor").value = app.quizzes["top-students"].solution;
  await app.checkAnswer();
  get("#sql-editor").value =
    "SELECT first_name FROM students WHERE grade_level = $1";
  get("#query-parameters").value = '["Grade 9"]';
  await app.runQuery();
  const results = get("#results-content").children;
  const before = requests.length;
  await app.applySession(
    makeSession("user-a", "00000000-0000-0000-0000-000000000001", true),
  );
  assert(
    get("#sql-editor").value.includes("first_name"),
    "Refresh erased draft",
  );
  assert(
    get("#query-parameters").value === '["Grade 9"]',
    "Refresh erased parameters",
  );
  assert(
    get("#results-content").children === results && app.points() === 4,
    "Refresh reset results/points",
  );
  assert(
    requests.length === before,
    "Refresh must not reload or record another login",
  );
});

Deno.test("repeated auth callbacks share login recording and wait before unlocking", async () => {
  const login = deferred();
  const { app, get, session, requests } = setup({
    invokeHook: (body) => body.action === "login" ? login.promise : undefined,
  });
  const first = app.applySession(session);
  const second = app.applySession(session);
  assert(
    !app.isSignedIn() && get("#sql-editor").readOnly &&
      get("#signin-dialog").open,
    "Unlocked before recording login",
  );
  assert(
    requests.filter(([kind]) => kind === "login").length === 1,
    "Duplicate callback sent duplicate login",
  );
  login.resolve({ data: { recorded: true }, error: null });
  await Promise.all([first, second]);
  assert(
    app.isSignedIn() && !get("#signin-dialog").open,
    "Did not unlock after recording",
  );
  await app.applySession(
    makeSession("user-a", "00000000-0000-0000-0000-000000000002"),
  );
  assert(
    requests.filter(([kind]) => kind === "login").length === 2,
    "New session must record a new login",
  );
});

Deno.test("failed login recording retries without another Magic Link and sign-out cancels pending initialization", async () => {
  let fail = true;
  const fixture = setup({
    invokeHook: (body) =>
      body.action === "login" && fail
        ? { error: { message: "offline" } }
        : undefined,
  });
  await fixture.app.applySession(fixture.session);
  assert(!fixture.app.isSignedIn(), "Unlocked after failed recording");
  fail = false;
  await fixture.app.applySession(fixture.session);
  assert(fixture.app.isSignedIn(), "Valid session did not retry recording");
  const pending = deferred();
  const second = setup({
    invokeHook: (body) => body.action === "login" ? pending.promise : undefined,
  });
  const attempt = second.app.applySession(second.session);
  await second.app.applySession(null);
  pending.resolve({ data: { recorded: true }, error: null });
  await attempt;
  assert(!second.app.isSignedIn(), "Late login unlocked a signed-out page");
});

Deno.test("late saved-progress load cannot overwrite typing or another user's state", async () => {
  let pending = null;
  const { app, get, session } = setup({
    invokeHook: (body) =>
      body.action === "load" && pending ? pending.promise : undefined,
  });
  await app.applySession(session);
  pending = deferred();
  const load = app.loadSavedProgress();
  get("#sql-editor").value = "my draft";
  get("#sql-editor").listeners.input();
  pending.resolve({
    data: {
      progress: [{
        question_id: "top-students",
        query_text: "older saved query",
        parameters: [],
      }],
    },
    error: null,
  });
  await load;
  assert(get("#sql-editor").value === "my draft", "Load overwrote typing");
  pending = deferred();
  const oldLoad = app.loadSavedProgress();
  await app.applySession(null);
  pending.resolve({
    data: {
      progress: [{
        question_id: "top-students",
        query_text: "private answer",
        parameters: [],
      }],
    },
    error: null,
  });
  await oldLoad;
  app.renderQuiz("top-students");
  assert(
    get("#sql-editor").value === "",
    "Old-user load restored data after sign-out",
  );
});

Deno.test("delayed save stays attached to its original question", async () => {
  const pending = deferred();
  const { app, get, session } = setup({
    invokeHook: (body) => body.action === "save" ? pending.promise : undefined,
  });
  await app.applySession(session);
  const query = "SELECT first_name FROM students";
  get("#sql-editor").value = query;
  const saving = app.saveQuiz();
  app.renderQuiz("average-gpa");
  get("#sql-editor").value = "second question draft";
  pending.resolve({
    data: {
      progress: {
        question_id: "top-students",
        query_text: query,
        parameters: [],
      },
    },
    error: null,
  });
  await saving;
  assert(
    get("#sql-editor").value === "second question draft",
    "Save changed another editor",
  );
  app.renderQuiz("average-gpa");
  assert(
    get("#sql-editor").value === "",
    "Save cached under the wrong question",
  );
  app.renderQuiz("top-students");
  assert(
    get("#sql-editor").value === query,
    "Save missing from original question",
  );
});

Deno.test("save response cannot leak across users", async () => {
  const pending = deferred();
  const { app, get, session } = setup({
    invokeHook: (body) => body.action === "save" ? pending.promise : undefined,
  });
  await app.applySession(session);
  get("#sql-editor").value = "first user's answer";
  const saving = app.saveQuiz();
  await app.applySession(makeSession("user-b"));
  pending.resolve({
    data: {
      progress: {
        question_id: "top-students",
        query_text: "first user's answer",
        parameters: [],
      },
    },
    error: null,
  });
  await saving;
  app.renderQuiz("top-students");
  assert(get("#sql-editor").value === "", "Previous user's answer leaked");
});

for (const fail of [false, true]) {
  Deno.test(`late query ${fail ? "error" : "result"} cannot appear on a different question`, async () => {
    const pending = deferred();
    const { app, get, session } = setup({
      invokeHook: (body) => body.action === "run" ? pending.promise : undefined,
    });
    await app.applySession(session);
    get("#sql-editor").value = "SELECT student_id FROM students";
    const running = app.runQuery();
    app.renderQuiz("average-gpa");
    if (fail) pending.reject(new Error("old query failed"));
    else {pending.resolve({
        data: {
          columns: ["student_id"],
          rows: [["student_001"]],
          truncated: false,
        },
        error: null,
      });}
    await running;
    assert(
      get("#results-heading").textContent === "Run a query to see results",
      "Old result changed new question",
    );
    assert(
      get("#feedback-message").textContent === "",
      "Old feedback appeared on new question",
    );
  });
}

Deno.test("older query completion cannot unlock a newer pending run", async () => {
  const runs = [];
  const { app, get, session } = setup({
    invokeHook: (body) => {
      if (body.action === "run") {
        const pending = deferred();
        runs.push(pending);
        return pending.promise;
      }
    },
  });
  await app.applySession(session);
  get("#sql-editor").value = "SELECT student_id FROM students";
  const first = app.runQuery();
  app.renderQuiz("average-gpa");
  get("#sql-editor").value = "SELECT school_name FROM schools";
  const second = app.runQuery();
  runs[0].resolve({
    data: {
      columns: ["student_id"],
      rows: [["student_001"]],
      truncated: false,
    },
    error: null,
  });
  await first;
  assert(
    get("#run-query").disabled,
    "Older run enabled button while newer run is pending",
  );
  runs[1].resolve({
    data: {
      columns: ["school_name"],
      rows: [["Example school"]],
      truncated: false,
    },
    error: null,
  });
  await second;
  assert(
    get("#results-heading").textContent === "Query results" &&
      !get("#run-query").disabled,
    "New query did not complete normally",
  );
});


Deno.test("all five result comparisons accept aliases and tied rankings while preserving exact table requirements", () => {
  const { app } = setup();
  for (const id of app.questionIds) {
    const quiz = app.quizzes[id];
    const expected = { columns: quiz.headers, rows: quiz.rows, truncated: false };
    const copy = () => ({
      columns: quiz.headers.map((_, index) => `different_alias_${index}`),
      rows: quiz.rows.map((row) => [...row]),
      truncated: false,
    });
    const actual = copy();
    actual.rows = actual.rows.map((row) => row.map((cell) =>
      /^-?\d+(?:\.\d+)?$/.test(cell) ? Number(cell) : cell));
    assert(app.answersMatch(actual, expected), `${id}: aliases and numeric types should pass`);
    // Reverse rows within each equal ranking group; their relative order is unspecified.
    const tied = copy();
    for (let start = 0; start < tied.rows.length;) {
      let end = start + 1;
      while (end < tied.rows.length && tied.rows[end].at(-1) === tied.rows[start].at(-1)) end++;
      tied.rows.splice(start, end - start, ...tied.rows.slice(start, end).reverse());
      start = end;
    }
    assert(app.answersMatch(tied, expected), `${id}: ties should pass`);
    const reversed = copy();
    reversed.rows.reverse();
    assert(!app.answersMatch(reversed, expected), `${id}: ascending order should fail`);
    const duplicate = copy();
    duplicate.rows[duplicate.rows.length - 1] = [...duplicate.rows[0]];
    assert(!app.answersMatch(duplicate, expected), `${id}: duplicate-count mismatch should fail`);
    const missing = copy(); missing.rows.pop();
    assert(!app.answersMatch(missing, expected), `${id}: missing row should fail`);
    const extra = copy(); extra.rows.push([...extra.rows[0]]);
    assert(!app.answersMatch(extra, expected), `${id}: extra row should fail`);
    const misplaced = copy();
    misplaced.rows = misplaced.rows.map((row) => row.reverse());
    assert(!app.answersMatch(misplaced, expected), `${id}: wrong column positions should fail`);
    const wrongText = copy(); wrongText.rows[0][0] += " incorrect";
    assert(!app.answersMatch(wrongText, expected), `${id}: wrong text should fail`);
    const wrongNumber = copy();
    wrongNumber.rows[0][wrongNumber.columns.length - 1] = Number(wrongNumber.rows[0].at(-1)) + 0.001;
    assert(!app.answersMatch(wrongNumber, expected), `${id}: wrong numeric value should fail`);
    const extraColumn = copy(); extraColumn.columns.push("extra");
    assert(!app.answersMatch(extraColumn, expected), `${id}: extra column should fail`);
    const truncated = copy(); truncated.truncated = true;
    assert(!app.answersMatch(truncated, expected), `${id}: truncated result should fail`);
  }
});

Deno.test("numeric tolerance accepts representation noise only, with strict ordering and one-to-one rows", () => {
  const { app } = setup();
  const result = (rows) => ({ columns: ["label", "metric"], rows, truncated: false });
  const compare = (actual, expected) => app.answersMatch(result(actual), result(expected));
  assert(compare([["A", 0.1 + 0.2]], [["A", "0.30"]]), "Floating-point representation should pass");
  assert(compare([["A", 5e-13]], [["A", "0.00"]]), "Sub-tolerance difference should pass");
  assert(!compare([["A", 2e-12]], [["A", "0.00"]]), "Above-tolerance difference should fail");
  assert(!compare([["A", 4.574]], [["A", "4.57"]]), "Unrounded result should fail");
  assert(!compare([["A", 1000000000.001]], [["A", "1000000000.00"]]), "Tolerance must not grow with magnitude");
  assert(!compare([["A", null]], [["A", 0]]), "NULL must not equal zero");
  assert(!compare([["A", Infinity]], [["A", Infinity]]), "Non-finite numbers should fail");
  assert(!compare([["A", 0.3], ["B", 0.3 + 5e-13]], [["A", 0.3], ["B", 0.3]]), "Required descending ordering must remain strict");
  assert(compare([["A", 0.75e-12], ["A", -0.5e-12]], [["A", 0], ["A", 1.5e-12]]), "Overlapping candidates require one-to-one reassignment");
  assert(!compare([["A", 0], ["A", 0]], [["A", 0], ["A", 2e-12]]), "A matched row cannot be reused for another duplicate");
});

Deno.test("Check my SQL awards each question for different aliases and a derived-table structure", async () => {
  const { app, get, session, requests } = setup({
    invokeHook(body) {
      if (body.action !== "run") return;
      const quiz = app.quizzes[body.questionId];
      return { data: {
        columns: quiz.headers.map((_, index) => `alias_${index}`),
        rows: quiz.rows.map((row) => [...row]), truncated: false,
      }, error: null };
    },
  });
  await app.applySession(session);
  for (const id of app.questionIds) {
    app.renderQuiz(id);
    const quiz = app.quizzes[id];
    const selected = quiz.headers.map((name, index) => `q.${name} AS alias_${index}`).join(", ");
    const query = `select ${selected} from (${quiz.solution.replace(/;$/, "")}) q order by ${quiz.headers.length} desc`;
    assert(query !== quiz.solution, "Test must use different SQL");
    get("#sql-editor").value = query;
    await app.checkAnswer();
    assert(get("#feedback-message").textContent.startsWith("Correct!"), `${id}: equivalent output should pass`);
    assert(requests.some(([action, body]) => action === "run" && body.query === query), "Student SQL must be sent for execution unchanged");
  }
  assert(app.points() === 20, "Equivalent outputs should earn all 20 points");
});
