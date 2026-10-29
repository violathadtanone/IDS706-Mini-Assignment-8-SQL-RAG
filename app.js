const quizzes = {
  "top-students": {
    number: "01",
    title: "Who are the top 10 students by GPA?",
    level: "EASY",
    scenario: "You are a state official analyzing student academic performance to identify the highest-GPA students in the free lunch program.",
    requirements: [
      "Return student_id, first_name, last_name, grade_level, and gpa, in that column order, from the students dataset.",
      "Order the final output by GPA from highest to lowest.",
      "Return only the first 10 students."
    ],
    hint: `Choose the requested student columns.
Sort the GPA column from highest to lowest.
Limit the number of returned rows to the requested count.`,
    solution: `SELECT
    student_id,
    first_name,
    last_name,
    grade_level,
    gpa
FROM students
ORDER BY gpa DESC
LIMIT 10;`,
    headers: ["student_id", "first_name", "last_name", "grade_level", "gpa"],
    resultDescription: "The 10 highest-GPA students in the seed data.",
    rows: [
      ["student_074", "Lucas", "Murphy", "Grade 12", "3.97"],
      ["student_081", "Henry", "Davis", "Grade 9", "3.92"],
      ["student_040", "Ava", "Jenkins", "Grade 9", "3.89"],
      ["student_014", "Harper", "Kim", "Grade 12", "3.86"],
      ["student_002", "James", "Adams", "Grade 12", "3.83"],
      ["student_027", "Luna", "Wilson", "Grade 11", "3.82"],
      ["student_093", "Daniel", "Richardson", "Grade 9", "3.82"],
      ["student_047", "Layla", "Harris", "Grade 9", "3.81"],
      ["student_050", "Camila", "Ramirez", "Grade 11", "3.80"],
      ["student_053", "Ethan", "Clark", "Grade 10", "3.79"],
    ],
  },
  "average-gpa": {
    number: "02",
    title: "What is the average GPA at each school?",
    level: "MEDIUM",
    scenario: "You are a state official comparing academic performance across schools participating in the free lunch program.",
    requirements: [
      "Match each student to their school using the shared school identifier; include only schools with matching students.",
      "Combine students into one group per school, identified by its school identifier and name.",
      "Return school_name followed by average_gpa, calculated as the mean student GPA at each school and rounded to two decimal places.",
      "Order the final output by average GPA from highest to lowest and include every matching school."
    ],
    hint: `Join schools and students using their shared school identifier.
Group students by school and calculate the mean GPA.
Round to two decimal places and sort the averages descending.`,
    solution: `SELECT
    s.school_name,
    ROUND(AVG(st.gpa), 2) AS average_gpa
FROM schools s
JOIN students st
    ON s.school_id = st.school_id
GROUP BY s.school_id, s.school_name
ORDER BY average_gpa DESC;`,
    headers: ["school_name", "average_gpa"],
    resultDescription:
      "The average GPA by school. Only schools with students appear in this inner-join result.",
    rows: [
      ["Queen City Preparatory", "3.43"],
      ["Lakewood High School", "3.38"],
      ["Blue Ridge High School", "3.34"],
      ["Gate City Academy", "3.26"],
      ["Oak Ridge High School", "3.22"],
      ["Maple Grove High School", "3.22"],
      ["Cedar Hill High School", "3.19"],
      ["Capital View Academy", "3.18"],
      ["Pinecrest Academy", "3.02"],
    ],
  },
  "student-count": {
    number: "03",
    title: "Which 5 schools serve the most students?",
    level: "MEDIUM",
    scenario: "You are a state official analyzing free lunch enrollment to identify the schools serving the most participating students.",
    requirements: [
      "Every student in this dataset participates in the free lunch program; match students to schools using the shared school identifier.",
      "Combine students into one group per school, identified by its school identifier and name.",
      "Return school_name followed by student_count, counting student identifiers within each school.",
      "Order the final output by student count from highest to lowest and return only the first 5 schools."
    ],
    hint: `Join schools and students using their shared school identifier.
Count the participating students in each school group.
Sort the counts descending and keep the requested number of schools.`,
    solution: `SELECT
    s.school_name,
    COUNT(st.student_id) AS student_count
FROM schools s
JOIN students st
    ON s.school_id = st.school_id
GROUP BY s.school_id, s.school_name
ORDER BY student_count DESC
LIMIT 5;`,
    headers: ["school_name", "student_count"],
    resultDescription:
      "The five schools with the most free-lunch students. LIMIT 5 follows the question wording.",
    rows: [
      ["Cedar Hill High School", "20"],
      ["Oak Ridge High School", "18"],
      ["Maple Grove High School", "16"],
      ["Lakewood High School", "14"],
      ["Capital View Academy", "9"],
    ],
  },
  "city-cost": {
    number: "04",
    title: "What is the average lunch cost in each city?",
    level: "ADVANCED",
    scenario: "You are a state official comparing average meal costs across cities to understand differences in school lunch spending.",
    requirements: [
      "Match schools to students using the school identifier, then match students to recorded meals using the student identifier; include only matching records.",
      "Combine meal transactions into one group per city.",
      "Return city followed by average_lunch_cost, calculated as the mean recorded meal price in each city and rounded to two decimal places.",
      "Order the final output by average lunch cost from highest to lowest and include every city with recorded meals."
    ],
    hint: `Follow the relationships from schools to students to meals.
Group meal transactions by city and calculate the mean price.
Round the averages to two decimals and sort them descending.`,
    solution: `SELECT
    s.city,
    ROUND(AVG(m.price), 2) AS average_lunch_cost
FROM schools s
JOIN students st
    ON s.school_id = st.school_id
JOIN meals m
    ON st.student_id = m.student_id
GROUP BY s.city
ORDER BY average_lunch_cost DESC;`,
    headers: ["city", "average_lunch_cost"],
    resultDescription:
      "Average meal transaction price in each city represented in the meal records.",
    rows: [
      ["Asheville", "4.57"],
      ["Raleigh", "4.53"],
      ["Charlotte", "4.53"],
      ["Durham", "4.52"],
      ["Greensboro", "4.52"],
    ],
  },
  "school-cost": {
    number: "05",
    title: "Which schools have the highest lunch costs?",
    level: "ADVANCED",
    scenario: "You are a state official analyzing school lunch spending to identify the schools with the highest total meal costs.",
    requirements: [
      "Match schools to students using the school identifier, then match students to recorded meals using the student identifier; include only matching records.",
      "Combine meal transactions into one group per school, identified by its school identifier, name, and city.",
      "Return school_name, city, total_meals, and total_lunch_cost, in that column order; count meal identifiers for total_meals and add recorded meal prices for total_lunch_cost, rounding the cost to two decimal places.",
      "Order the final output by total lunch cost from highest to lowest and return up to the first 10 schools."
    ],
    hint: `Follow the relationships from schools to students to meals.
Group by school and city, then count meals and add their prices.
Round the totals, sort descending, and keep the requested number of schools.`,
    solution: `SELECT
    s.school_name,
    s.city,
    COUNT(m.meal_id) AS total_meals,
    ROUND(SUM(m.price), 2) AS total_lunch_cost
FROM schools s
JOIN students st
    ON s.school_id = st.school_id
JOIN meals m
    ON st.student_id = m.student_id
GROUP BY s.school_id, s.school_name, s.city
ORDER BY total_lunch_cost DESC
LIMIT 10;`,
    headers: ["school_name", "city", "total_meals", "total_lunch_cost"],
    resultDescription:
      "There are meal transactions for nine schools in the seed data, so the top-10 query returns nine rows.",
    rows: [
      ["Cedar Hill High School", "Charlotte", "77", "349.45"],
      ["Oak Ridge High School", "Durham", "75", "338.50"],
      ["Maple Grove High School", "Raleigh", "64", "290.65"],
      ["Lakewood High School", "Greensboro", "59", "267.40"],
      ["Capital View Academy", "Raleigh", "42", "189.45"],
      ["Gate City Academy", "Greensboro", "33", "148.40"],
      ["Pinecrest Academy", "Durham", "28", "126.90"],
      ["Queen City Preparatory", "Charlotte", "23", "103.80"],
      ["Blue Ridge High School", "Asheville", "10", "45.65"],
    ],
  },
};

const questionIds = Object.keys(quizzes);
const APP_STORAGE_PREFIX = "ids706_rag_";
const editor = document.querySelector("#sql-editor");
const paramsInput = document.querySelector("#query-parameters");
const lineNumbers = document.querySelector("#line-numbers");
const feedback = document.querySelector("#feedback-message");
const resultHeading = document.querySelector("#results-heading");
const resultState = document.querySelector("#result-state");
const resultsContent = document.querySelector("#results-content");
const resultsFootnote = document.querySelector("#results-footnote");
const saveStatus = document.querySelector("#save-status");
const navItems = [...document.querySelectorAll(".quiz-nav-item")];
const authStatus = document.querySelector("#auth-status");
const signInButton = document.querySelector("#sign-in");
const signOutButton = document.querySelector("#sign-out");
const signInDialog = document.querySelector("#signin-dialog");
const signInForm = document.querySelector("#signin-form");
const signInMessage = document.querySelector("#signin-message");
const editorAccess = document.querySelector("#editor-access");
const checkButton = document.querySelector("#check-answer");
const saveButton = document.querySelector("#save-quiz");
const runButton = document.querySelector("#run-query");
const assistantLauncher = document.querySelector("#assistant-launcher");
const assistantPanel = document.querySelector("#sql-assistant");
const assistantClose = document.querySelector("#assistant-close");
const assistantMessages = document.querySelector("#assistant-messages");
const assistantForm = document.querySelector("#assistant-form");
const assistantInput = document.querySelector("#assistant-input");
const assistantGenerate = document.querySelector("#assistant-generate");
const assistantUseQuestion = document.querySelector("#assistant-use-question");
const assistantState = {
  open: false,
  busy: false,
  messages: [],
  requestId: 0,
};

let currentQuizId = questionIds[0];
let currentUser = null;
let signedIn = false;
let earnedQuestions = new Set();
let checkingAnswer = false;
let savedProgress = {};
let client = null;
let initializationError = "";
let activeSessionKey = null;
let sessionInitialization = null;
let authGeneration = 0;
let viewRevision = 0;
let editorRevision = 0;
let activeRun = null;
const savesInFlight = new Set();

function showFeedback(message, type = "") {
  feedback.textContent = message;
  feedback.className = `feedback-message${type ? ` is-${type}` : ""}`;
}

function setSignInMessage(message, type = "") {
  signInMessage.textContent = message;
  signInMessage.className = `signin-message${type ? ` is-${type}` : ""}`;
}

function getCurrentQuiz() {
  return quizzes[currentQuizId];
}

function assistantFunctionName() {
  const name = window.RAG_CONFIG?.functionName;
  return typeof name === "string" && /^[a-z0-9-]+$/.test(name.trim())
    ? name.trim()
    : "";
}

function renderAssistantMessages() {
  assistantMessages.replaceChildren();
  if (assistantState.messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "assistant-empty";
    const title = document.createElement("strong");
    title.textContent = "Need a starting point?";
    const copy = document.createElement("span");
    copy.textContent = "Ask a plain-language question about the school lunch data.";
    empty.append(title, copy);
    assistantMessages.append(empty);
    return;
  }

  for (const message of assistantState.messages) {
    const item = document.createElement("article");
    item.className = `assistant-message is-${message.role}${message.error ? " is-error" : ""}`;
    const text = document.createElement("span");
    text.textContent = message.text;
    item.append(text);

    if (message.sql) {
      const code = document.createElement("pre");
      code.className = "assistant-sql";
      code.textContent = message.sql;
      item.append(code);

      const copyButton = document.createElement("button");
      copyButton.className = "assistant-copy";
      copyButton.type = "button";
      copyButton.textContent = "Copy SQL";
      copyButton.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(message.sql);
          copyButton.textContent = "Copied";
        } catch {
          copyButton.textContent = "Copy unavailable";
        }
      });
      item.append(copyButton);
    }

    if (Array.isArray(message.sources) && message.sources.length > 0) {
      const details = document.createElement("details");
      details.className = "assistant-sources";
      const summary = document.createElement("summary");
      summary.textContent = `Sources (${message.sources.length})`;
      details.append(summary);
      for (const source of message.sources) {
        const sourceItem = document.createElement("div");
        sourceItem.className = "assistant-source";
        const sourceId = document.createElement("strong");
        sourceId.textContent = String(source.id ?? "Knowledge source");
        const snippet = document.createElement("span");
        snippet.textContent = ` — ${String(source.snippet ?? "")}`;
        sourceItem.append(sourceId, snippet);
        details.append(sourceItem);
      }
      item.append(details);
    }
    assistantMessages.append(item);
  }

  if (assistantState.busy) {
    const loading = document.createElement("div");
    loading.className = "assistant-loading";
    loading.textContent = "Retrieving knowledge and drafting SQL…";
    assistantMessages.append(loading);
  }
  assistantMessages.scrollTop = assistantMessages.scrollHeight;
}

function updateAssistantControls() {
  const enabled = signedIn && !assistantState.busy;
  assistantInput.disabled = !signedIn || assistantState.busy;
  assistantGenerate.disabled = !enabled;
  assistantUseQuestion.disabled = !enabled;
  assistantGenerate.textContent = assistantState.busy ? "Generating…" : "Generate SQL";
}

function setAssistantOpen(open) {
  assistantState.open = open;
  assistantPanel.hidden = !open;
  assistantPanel.setAttribute("aria-hidden", String(!open));
  assistantLauncher.setAttribute("aria-expanded", String(open));
  if (open) {
    updateAssistantControls();
    assistantInput.focus();
  } else {
    assistantLauncher.focus();
  }
}

function addAssistantMessage(message) {
  assistantState.messages.push(message);
  renderAssistantMessages();
}

async function generateAssistantSql(event) {
  event.preventDefault();
  if (assistantState.busy) return;
  const question = assistantInput.value.trim();
  if (!question) {
    addAssistantMessage({
      role: "assistant",
      text: "Enter a question before generating SQL.",
      error: true,
    });
    return;
  }
  if (!signedIn) {
    addAssistantMessage({
      role: "assistant",
      text: "Sign in before using the SQL assistant.",
      error: true,
    });
    return;
  }
  const functionName = assistantFunctionName();
  if (!functionName) {
    addAssistantMessage({
      role: "assistant",
      text: "The SQL assistant is not connected. Configure the rag-api function first.",
      error: true,
    });
    return;
  }
  const requestId = ++assistantState.requestId;
  assistantState.busy = true;
  addAssistantMessage({ role: "user", text: question });
  renderAssistantMessages();
  updateAssistantControls();
  try {
    const { data: payload, error } = await client.functions.invoke(functionName, {
      body: { question },
    });
    if (error) throw new Error(error.message || "The SQL assistant is unavailable. Try again later.");
    if (requestId !== assistantState.requestId) return;
    if (typeof payload.sql !== "string" || !Array.isArray(payload.sources)) {
      throw new Error("The SQL assistant returned an invalid response.");
    }
    addAssistantMessage({
      role: "assistant",
      text: "Generated SQL:",
      sql: payload.sql,
      sources: payload.sources,
    });
  } catch (error) {
    if (requestId === assistantState.requestId) {
      addAssistantMessage({
        role: "assistant",
        text: error instanceof Error ? error.message : "The SQL assistant is unavailable.",
        error: true,
      });
    }
  } finally {
    if (requestId === assistantState.requestId) {
      assistantState.busy = false;
      updateAssistantControls();
      renderAssistantMessages();
    }
  }
}

assistantLauncher.addEventListener("click", () => setAssistantOpen(!assistantState.open));
assistantClose.addEventListener("click", () => setAssistantOpen(false));
assistantForm.addEventListener("submit", generateAssistantSql);
assistantUseQuestion.addEventListener("click", () => {
  const quiz = getCurrentQuiz();
  assistantInput.value = quiz.title;
  assistantInput.focus();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && assistantState.open) setAssistantOpen(false);
});

function parseParameters() {
  const raw = paramsInput.value.trim();
  if (!raw) {
    return [];
  }

  let values;
  try {
    values = JSON.parse(raw);
  } catch {
    throw new Error("Parameters must be a valid JSON array, such as [\"Grade 9\", 10].");
  }

  if (!Array.isArray(values)) {
    throw new Error("Parameters must be a JSON array.");
  }
  if (
    values.length > 20 ||
    values.some(
      (value) =>
        value !== null &&
        typeof value !== "string" &&
        typeof value !== "boolean" &&
        !(typeof value === "number" && Number.isFinite(value)),
    )
  ) {
    throw new Error("Use up to 20 string, number, boolean, or null parameter values.");
  }
  return values;
}

function updateLineNumbers() {
  const lineCount = Math.max(1, editor.value.split("\n").length);
  lineNumbers.textContent = Array.from(
    { length: lineCount },
    (_, index) => index + 1,
  ).join("\n");
}

function updateSaveButton() {
  const alreadySaved = Boolean(savedProgress[currentQuizId]);
  const saving = savesInFlight.has(`${authGeneration}:${currentQuizId}`);
  saveButton.disabled = !signedIn || saving;
  saveButton.textContent = saving ? "Saving…" : alreadySaved ? "Update saved query" : "Save quiz";
}

function scoreStorageKey() {
  return `${APP_STORAGE_PREFIX}sql-quiz-points:${currentUser.id}`;
}

function loadEarnedPoints() {
  earnedQuestions = new Set();
  if (!signedIn) return;
  try {
    const stored = JSON.parse(localStorage.getItem(scoreStorageKey()) ?? "[]");
    if (Array.isArray(stored)) {
      earnedQuestions = new Set(stored.filter((id) => questionIds.includes(id)));
    }
  } catch {
    // Scoring remains available when browser storage is unavailable.
  }
}

function updateProgress() {
  const correctCount = signedIn ? earnedQuestions.size : 0;
  const points = correctCount * 4;
  document.querySelector("#progress-count").innerHTML =
    `${points} <span>/ 20</span>`;
  document.querySelector("#progress-fill").style.width = `${points * 5}%`;
  document.querySelector("#progress-bar").setAttribute("aria-valuenow", points);
  document.querySelector("#progress-caption").textContent = signedIn
    ? `${correctCount} of 5 correct · 4 points each · saved in this browser`
    : "5 questions · 4 points each";

  for (const item of navItems) {
    const complete = signedIn && earnedQuestions.has(item.dataset.quiz);
    item.classList.toggle("is-complete", complete);
    const quiz = quizzes[item.dataset.quiz];
    item.querySelector(".nav-number").textContent = complete ? "✓" : quiz.number;
    item.setAttribute("aria-label", `${quiz.title}${complete ? " — Correct, 4 points earned" : ""}`);
  }
  const currentComplete = signedIn && earnedQuestions.has(currentQuizId);
  document.querySelector(".challenge").classList.toggle("is-complete", currentComplete);
  const quiz = getCurrentQuiz();
  document.querySelector("#challenge-kicker").innerHTML =
    `QUESTION ${currentComplete ? "✓" : quiz.number} <span>•</span> ${quiz.level}${currentComplete ? " · CORRECT" : ""}`;
}

function updateRunButton() {
  const running = activeRun?.auth === authGeneration && activeRun?.view === viewRevision;
  runButton.disabled = !signedIn || running;
  runButton.innerHTML = running ? "Running…" :
    '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4.5 8 5.5-8 5.5z" /></svg> Run query';
}

function updateAuthControls() {
  const dot = document.createElement("span");
  dot.className = "status-dot";
  dot.setAttribute("aria-hidden", "true");
  authStatus.replaceChildren(
    dot,
    document.createTextNode(signedIn ? currentUser?.email ?? "Signed in" : "Signed out"),
  );
  authStatus.classList.toggle("is-signed-in", signedIn);
  signInButton.classList.toggle("is-hidden", signedIn);
  signOutButton.classList.toggle("is-hidden", !signedIn);
  document.querySelector("#signin-callout").classList.toggle("is-hidden", signedIn);
  editor.readOnly = !signedIn;
  paramsInput.disabled = !signedIn;
  updateRunButton();
  checkButton.disabled = !signedIn || checkingAnswer;
  saveButton.disabled = !signedIn;
  editorAccess.textContent = signedIn ? "Signed-in workspace · editable" : "Sign in to edit";
  saveStatus.textContent = signedIn ? "Saved to your account on request" : "Sign in to save";
  document.querySelector("#preview-note").textContent = signedIn
    ? "Runs on Supabase · read-only SQL"
    : "Sign in to run queries and save your quiz.";
  updateProgress();
  updateSaveButton();
  updateAssistantControls();
}

function renderTable(headers, rows, container) {
  const wrapper = document.createElement("div");
  wrapper.className = "results-table-wrap";
  const table = document.createElement("table");
  table.className = "results-table";
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");

  headers.forEach((label) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    headerRow.append(cell);
  });
  head.append(headerRow);

  const body = document.createElement("tbody");
  rows.forEach((row) => {
    const tableRow = document.createElement("tr");
    row.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value === null ? "NULL" : String(value);
      tableRow.append(cell);
    });
    body.append(tableRow);
  });

  table.append(head, body);
  wrapper.append(table);
  container.replaceChildren(wrapper);
}

function renderHint(quiz) {
  document.querySelector("#hint-card").open = false;
  document.querySelector("#hint-sql").textContent = quiz.hint;
  document.querySelector("#hint-result-description").textContent =
    quiz.resultDescription;
  renderTable(quiz.headers, quiz.rows, document.querySelector("#hint-result-table"));
}

function clearResults() {
  resultHeading.textContent = "Run a query to see results";
  resultState.textContent = signedIn ? "READY" : "LOCKED";
  resultState.classList.remove("is-ready");
  resultsContent.innerHTML = `
    <div class="empty-results">
      <div class="empty-icon" aria-hidden="true">⌕</div>
      <p>${signedIn ? "Ready when you are." : "Sign in to unlock query tools."}</p>
      <span>${
        signedIn
          ? "The query will run against Supabase when you choose Run query."
          : "Sign in to run your query against the student lunch dataset."
      }</span>
    </div>`;
  resultsFootnote.textContent = signedIn
    ? "Only read-only SELECT queries against schools, students, and meals are allowed."
    : "Query execution is available to signed-in users.";
}

function renderQuiz(quizId) {
  viewRevision++;
  currentQuizId = quizId;
  const quiz = getCurrentQuiz();
  document.querySelector("#challenge-kicker").innerHTML =
    `QUESTION ${quiz.number} <span>•</span> ${quiz.level}`;
  document.querySelector("#challenge-title").textContent = quiz.title;
  document.querySelector("#challenge-prompt").textContent = quiz.scenario;
  const requirements = quiz.requirements.map((requirement) => {
    const item = document.createElement("li");
    item.textContent = requirement;
    return item;
  });
  document.querySelector("#challenge-requirements").replaceChildren(...requirements);
  document.querySelector(".points-pill").innerHTML = "<strong>4</strong> POINTS";
  renderHint(quiz);

  const saved = signedIn ? savedProgress[quizId] : null;
  editor.value = saved?.query_text ?? "";
  paramsInput.value = saved?.parameters
    ? JSON.stringify(saved.parameters)
    : "";
  updateLineNumbers();
  clearResults();
  showFeedback("");

  navItems.forEach((item) => {
    const isActive = item.dataset.quiz === quizId;
    item.classList.toggle("is-active", isActive);
    if (isActive) {
      item.setAttribute("aria-current", "step");
    } else {
      item.removeAttribute("aria-current");
    }
  });
  updateAuthControls();
}

async function invokeApi(body, loginSession = null) {
  // Only login recording may run before the quiz UI is unlocked. The backend
  // still validates the supplied bearer token; browser state grants no access.
  if (!client || (!signedIn && !(body.action === "login" && loginSession?.access_token))) {
    throw new Error("Sign in before using the quiz backend.");
  }
  const options = { body };
  if (loginSession) options.headers = { Authorization: `Bearer ${loginSession.access_token}` };
  const { data, error } = await client.functions.invoke("quiz-api", options);
  if (error) {
    let message = error.message || "The quiz backend request failed.";
    if (error.context instanceof Response) {
      try {
        const body = await error.context.json();
        if (typeof body.error === "string") {
          message = body.error;
        }
      } catch {
        // Keep the SDK's error message if the response is not JSON.
      }
    }
    throw new Error(message);
  }
  return data;
}

async function loadSavedProgress() {
  if (!signedIn) {
    savedProgress = {};
    updateProgress();
    return;
  }
  const auth = authGeneration;
  const view = viewRevision;
  const revision = editorRevision;
  const query = editor.value;
  const rawParameters = paramsInput.value;
  try {
    const data = await invokeApi({ action: "load" });
    if (!signedIn || auth !== authGeneration) return;
    savedProgress = Object.fromEntries(
      (data.progress ?? []).map((entry) => [entry.question_id, entry]),
    );
    if (savedProgress[currentQuizId] && view === viewRevision &&
        revision === editorRevision && query === editor.value && rawParameters === paramsInput.value) {
      editor.value = savedProgress[currentQuizId].query_text;
      paramsInput.value = JSON.stringify(savedProgress[currentQuizId].parameters ?? []);
      updateLineNumbers();
    }
    updateProgress();
    updateSaveButton();
  } catch (error) {
    if (signedIn && auth === authGeneration && view === viewRevision) {
      showFeedback(`Could not load saved quizzes: ${error.message}`, "error");
    }
  }
}

async function applySession(session) {
  if (!session?.user) {
    authGeneration++;
    activeSessionKey = null;
    sessionInitialization = null;
    currentUser = null;
    signedIn = false;
    savedProgress = {};
    loadEarnedPoints();
    renderQuiz(currentQuizId);
    return false;
  }
  let key;
  try {
    const payload = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
    if (!claims.session_id) throw new Error("Missing session identifier");
    key = `${session.user.id}:${claims.session_id}`;
  } catch {
    setSignInMessage("The sign-in session is invalid. Request a new Magic Link.", "error");
    return false;
  }
  // Token refreshes and repeated callbacks for this session preserve drafts,
  // results and points. A reload retries the same idempotent backend insert.
  if (signedIn && activeSessionKey === key) {
    currentUser = session.user;
    updateAuthControls();
    return true;
  }
  if (sessionInitialization?.key === key) return sessionInitialization.promise;
  const generation = ++authGeneration;
  currentUser = null;
  signedIn = false;
  activeSessionKey = null;
  savedProgress = {};
  loadEarnedPoints();
  renderQuiz(currentQuizId);
  const promise = (async () => {
    try {
      await invokeApi({ action: "login" }, session);
      if (generation !== authGeneration) return false;
      currentUser = session.user;
      signedIn = true;
      activeSessionKey = key;
      loadEarnedPoints();
      if (signInDialog.open) signInDialog.close();
      document.querySelector("#send-magic-link").textContent = "Send Magic Link";
      renderQuiz(currentQuizId);
      setSignInMessage("");
      await loadSavedProgress();
      return true;
    } catch (error) {
      if (generation === authGeneration) {
        const message = `Your authentication succeeded, but the login transaction could not be recorded: ${error.message}. Reload to retry; the quiz remains locked.`;
        setSignInMessage(message, "error");
        showFeedback(message, "error");
      }
      return false;
    } finally {
      if (sessionInitialization?.generation === generation) sessionInitialization = null;
    }
  })();
  sessionInitialization = { key, generation, promise };
  return promise;
}

async function signInWithEmail(event) {
  event.preventDefault();
  if (!client) {
    setSignInMessage(
      initializationError || "Supabase could not initialize. Reload the page and try again.",
      "error",
    );
    return;
  }

  const email = document.querySelector("#signin-email").value.trim();
  const button = document.querySelector("#send-magic-link");
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = "Sending…";
  setSignInMessage("");
  try {
    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: "https://violathadtanone.github.io/IDS706-Major-Assignment-2-SQLQuiz/",
      },
    });
    if (error) {
      throw error;
    }
    if (document.querySelector("#signin-email").value.trim() !== email) return;
    setSignInMessage("Check your email and click the Magic Link to return to the quiz and sign in.", "success");
  } catch (error) {
    setSignInMessage(`Could not send a Magic Link: ${error.message}`, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Send Magic Link";
  }
}

async function runQuery() {
  if (!signedIn) {
    showFeedback("Sign in before running a query.", "error");
    return;
  }
  let parameters;
  try {
    parameters = parseParameters();
  } catch (error) {
    showFeedback(error.message, "error");
    return;
  }
  const attempt = { auth: authGeneration, view: viewRevision };
  const quizId = currentQuizId;
  activeRun = attempt;
  const isCurrent = () => signedIn && attempt.auth === authGeneration &&
    attempt.view === viewRevision && activeRun === attempt;
  updateRunButton();
  resultHeading.textContent = "Running your query…";
  resultState.textContent = "RUNNING";
  resultState.classList.remove("is-ready");
  try {
    const data = await invokeApi({
      action: "run",
      questionId: quizId,
      query: editor.value,
      parameters,
    });
    if (!isCurrent()) return;
    renderTable(data.columns, data.rows, resultsContent);
    resultHeading.textContent = "Query results";
    resultState.textContent = "EXECUTED";
    resultState.classList.add("is-ready");
    resultsFootnote.textContent = data.truncated
      ? `Showing the first ${data.rows.length} rows. Results are capped for safety.`
      : `${data.rows.length} row${data.rows.length === 1 ? "" : "s"} returned from Supabase.`;
    showFeedback("Query ran successfully.", "success");
  } catch (error) {
    if (!isCurrent()) return;
    resultHeading.textContent = "Query could not be completed";
    resultState.textContent = "ERROR";
    resultsContent.innerHTML = "";
    showFeedback(error.message, "error");
  } finally {
    if (activeRun === attempt) activeRun = null;
    updateRunButton();
  }
}

async function saveQuiz() {
  if (!signedIn) {
    showFeedback("Sign in before saving quiz progress.", "error");
    return;
  }
  let parameters;
  try {
    parameters = parseParameters();
  } catch (error) {
    showFeedback(error.message, "error");
    return;
  }

  const quizId = currentQuizId;
  const auth = authGeneration;
  const view = viewRevision;
  const pendingKey = `${auth}:${quizId}`;
  if (savesInFlight.has(pendingKey)) return;
  savesInFlight.add(pendingKey);
  updateSaveButton();
  try {
    const data = await invokeApi({
      action: "save",
      questionId: quizId,
      query: editor.value,
      parameters,
    });
    if (!signedIn || auth !== authGeneration) return;
    savedProgress[quizId] = data.progress;
    updateProgress();
    if (view === viewRevision) showFeedback("Your query and parameters were saved to your account.", "success");
  } catch (error) {
    if (signedIn && auth === authGeneration && view === viewRevision) {
      showFeedback(`Could not save this question: ${error.message}`, "error");
    }
  } finally {
    savesInFlight.delete(pendingKey);
    updateSaveButton();
  }
}

async function signOut() {
  if (!client) {
    return;
  }
  const { error } = await client.auth.signOut();
  if (error) {
    showFeedback(`Could not sign out: ${error.message}`, "error");
  }
}

for (const item of navItems) {
  item.addEventListener("click", () => renderQuiz(item.dataset.quiz));
}

editor.addEventListener("input", () => {
  editorRevision++;
  showFeedback("");
  updateLineNumbers();
});

editor.addEventListener("scroll", () => {
  lineNumbers.scrollTop = editor.scrollTop;
});

editor.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    event.preventDefault();
    editor.setRangeText("    ", editor.selectionStart, editor.selectionEnd, "end");
    editorRevision++;
    updateLineNumbers();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    runQuery();
  }
});

paramsInput.addEventListener("input", () => {
  editorRevision++;
  showFeedback("");
});

// Compare values rather than SQL spelling or aliases. Tied rows may be in
// either order, but the requested ranking metric must still be descending.
function answersMatch(actual, expected) {
  if (actual.truncated || expected.truncated || !expected.rows.length ||
      actual.columns.length !== expected.columns.length ||
      actual.rows.length !== expected.rows.length) return false;
  const normalize = (value) => {
    if (value === null) return null;
    if (typeof value === "number" ||
        (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value))) {
      return Number(value);
    }
    return value;
  };
  // Absolute tolerance only: never scale the allowance with the value.
  const numericTolerance = 1e-12;
  const cellsMatch = (left, right) => {
    left = normalize(left);
    right = normalize(right);
    if (typeof left === "number" && typeof right === "number") {
      return Number.isFinite(left) && Number.isFinite(right) &&
        Math.abs(left - right) <= numericTolerance;
    }
    return left === right;
  };
  const rowsMatch = (left, right) => left.length === expected.columns.length &&
    right.length === expected.columns.length &&
    left.every((value, column) => cellsMatch(value, right[column]));
  // One-to-one matching preserves duplicate counts. Reassign earlier matches
  // when tolerance makes multiple rows eligible, rather than matching greedily.
  const owners = Array(expected.rows.length).fill(-1);
  const match = (actualIndex, visited) => {
    for (let expectedIndex = 0; expectedIndex < expected.rows.length; expectedIndex++) {
      if (visited.has(expectedIndex) ||
          !rowsMatch(actual.rows[actualIndex], expected.rows[expectedIndex])) continue;
      visited.add(expectedIndex);
      if (owners[expectedIndex] === -1 || match(owners[expectedIndex], visited)) {
        owners[expectedIndex] = actualIndex;
        return true;
      }
    }
    return false;
  };
  if (!actual.rows.every((_, index) => match(index, new Set()))) return false;
  const metricIndex = expected.columns.length - 1;
  return actual.rows.every((row, index, rows) => index === 0 ||
    Number(rows[index - 1][metricIndex]) >= Number(row[metricIndex]));
}

async function checkAnswer() {
  if (!signedIn) {
    showFeedback("Sign in before checking your SQL.", "error");
    return;
  }
  if (checkingAnswer) return;
  const quizId = currentQuizId;
  const userId = currentUser.id;
  const query = editor.value;
  const rawParameters = paramsInput.value;
  let parameters;
  try {
    if (!query.trim()) throw new Error("Write a SQL query before checking your answer.");
    parameters = parseParameters();
  } catch (error) {
    showFeedback(error.message, "error");
    return;
  }
  checkingAnswer = true;
  checkButton.disabled = true;
  checkButton.textContent = "Checking…";
  showFeedback("Checking your answer against the dataset…");
  const isCurrentAttempt = () => currentUser?.id === userId &&
    currentQuizId === quizId && editor.value === query &&
    paramsInput.value === rawParameters;
  try {
    const actual = await invokeApi({ action: "run", questionId: quizId, query, parameters });
    if (!isCurrentAttempt()) return;
    const expected = await invokeApi({
      action: "run", questionId: quizId,
      query: quizzes[quizId].solution, parameters: [],
    });
    if (!isCurrentAttempt()) return;
    if (!answersMatch(actual, expected)) {
      showFeedback("Not correct yet. Check your selected columns, joins, calculations, sorting, and row limit. Open Hint for guidance.", "error");
      return;
    }
    const alreadyEarned = earnedQuestions.has(quizId);
    earnedQuestions.add(quizId);
    try {
      localStorage.setItem(scoreStorageKey(), JSON.stringify([...earnedQuestions]));
    } catch {
      // Keep earned points for this session if storage is unavailable.
    }
    updateProgress();
    showFeedback(alreadyEarned
      ? "Correct! You have already earned this question’s 4 points."
      : "Correct! You earned 4 points.", "success");
  } catch (error) {
    if (isCurrentAttempt()) showFeedback(`Could not check your answer: ${error.message}`, "error");
  } finally {
    checkingAnswer = false;
    checkButton.disabled = !signedIn;
    checkButton.innerHTML = 'Check my SQL <span aria-hidden="true">↗</span>';
  }
}

checkButton.addEventListener("click", checkAnswer);

runButton.addEventListener("click", runQuery);
saveButton.addEventListener("click", saveQuiz);
signInButton.addEventListener("click", () => {
  setSignInMessage("");
  signInDialog.showModal();
});
document.querySelector("#callout-sign-in").addEventListener("click", () => {
  setSignInMessage("");
  signInDialog.showModal();
});
signOutButton.addEventListener("click", signOut);
signInForm.addEventListener("submit", signInWithEmail);
document.querySelector("#signin-email").addEventListener("input", () => {
  document.querySelector("#send-magic-link").textContent = "Send Magic Link";
  setSignInMessage("");
});

const config = window.SUPABASE_CONFIG ?? {};
const hasSupabaseConfig =
  typeof config.url === "string" &&
  typeof config.anonKey === "string" &&
  config.url.startsWith("https://") &&
  config.anonKey.length > 0;
if (typeof window.supabase?.createClient !== "function") {
  initializationError = "The Supabase JavaScript library did not load. Reload the page and check whether the CDN script is blocked or failed in your browser's Network tab.";
  setSignInMessage(initializationError, "error");
} else if (!hasSupabaseConfig) {
  initializationError = "Supabase configuration is missing or invalid. Check that supabase-config.js sets window.SUPABASE_CONFIG.url to an HTTPS Project URL and window.SUPABASE_CONFIG.anonKey to your publishable key.";
  setSignInMessage(initializationError, "error");
} else {
  client = window.supabase.createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  client.auth.onAuthStateChange((_event, session) => {
    queueMicrotask(() => applySession(session));
  });
  client.auth.getSession().then(({ data, error }) => {
    if (error) {
      showFeedback(`Could not check your Supabase session: ${error.message}`, "error");
      return;
    }
    applySession(data.session);
  });
}

updateAuthControls();
renderQuiz(currentQuizId);
