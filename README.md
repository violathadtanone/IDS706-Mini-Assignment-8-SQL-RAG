[![Verify hosted database](https://github.com/violathadtanone/IDS706-Mini-Assignment-8-SQL-RAG/actions/workflows/test.yml/badge.svg)](https://github.com/violathadtanone/IDS706-Mini-Assignment-8-SQL-RAG/actions/workflows/test.yml)


# IDS 706 Mini Major Assignment: Build a SQL Quiz with RAG-Powered Text-to-SQL Application - 29 Oct 2026

## Project Description
This project consists of 2 phases
- Phase 1 aims to build a small system: a hosted database, sign-in, automation, and a SQL quiz that runs against live data.
- Phase 2 is an enhancement of SQL quiz with RAG-Powered Text-to-SQL agent. This supports in developing our understanding of how databases, vector databases, and AI models work together.

## Project Structure

```text
IDS706-Mini-Assignment-8-SQL-RAG/
├── index.html                          # Quiz interface and sign-in dialog
├── style.css                           # Application styling and responsive layouts
├── app.js                              # Authentication, quiz interactions, scoring, RAG assistant, and API calls
├── supabase-config.js                  # Browser-safe Supabase Project URL and publishable key
├── rag-config.js                       # Browser-safe RAG Edge Function name
├── init.sql                            # Standalone database setup and seed script (contains resets)
├── query.py                            # Local Python database operations example
├── sql_rag.py                          # Terminal RAG pipeline and local embedding cache
├── rag_api.py                          # Python RAG backend reference implementation
├── requirements.txt                    # Python dependencies
├── README.md                           # Project overview, setup, and testing instructions
├── .gitignore                          # Excludes local credentials and generated files
├── .github/
│   └── workflows/
│       └── test.yml                    # Hosted database verification using GitHub Secrets
├── supabase/
│   ├── config.toml                     # Supabase project and Edge Function configuration
│   ├── functions/
│   │   ├── quiz-api/                   # Existing authenticated quiz backend and SQL guard
│   │   └── rag-api/                    # Authenticated RAG Edge Function and mocked tests
│   └── migrations/                     # Dataset, restricted roles, saved answers, and audit/login tables
├── images/                             # Images used for supporting README.md explanation
└── tests/                              # Frontend behavior, RAG checks, and live database permission tests
```
<br><br>

## SQL Quiz - School Lunch Program Analysis
- This SQL quiz uses a small dataset about North Carolina schools, students, and school lunch records.
- Five questions are worth 20 points total and are answered by writing SQL queries against the live database. 
- Hints are available for guidance
- Grading is based on the results returned by each query
- Sign-in is required to begin the quiz.
- SQL assistant converts natural-language questions into SQL queries with explanations, displays query results, and compares them with the expected answer when a quiz question is selected.
- Link access to SQL Quiz: https://violathadtanone.github.io/IDS706-Mini-Assignment-8-SQL-RAG/#
<br><br>

## Overall Setup Instructions
### 1. Create GitHub repository
General:
- Name the repository with `IDS706-Major-Assignment-2-SQLQuiz`.

Configuration:
- Add README - Toggle On option.
- Add .gitignore - Select Python.
- Proceed to create repository.

### 2. Clone repository in VS Code
- Open Command Palette and select `Git: Clone`.
- Paste GitHub repository URL (e.g. https://github.com/violathadtanone/IDS706-Major-Assignment-2-SQLQuiz).
- Select the local folder to continue the development.

### 3. Set up a Python virtual environment
- Create and activate the virtual environment on Terminal with the code below:
```bash
python -m venv .venv
source .venv/bin/activate
```
- Upgrade pip to ensure that it is compatible with the current Python version before installing other packages.
```bash
python -m pip install --upgrade pip
```

### 4. Install Node.js
- Node.js is used to run JavaScript outside a web browser, especially for server-side applications. In Node.js, JavaScript can build web servers, create APIs, access databases, and work with files.
- Follow https://nodejs.org/en/download to install Node.js
<br><br>

## Create pre-requisite files

### 1. .env
- This stores the PostgreSQL, Neo4j, and OpenAI connection settings and credentials used by the local Python scripts (query.py and sql_rag.py). The live quiz uses separate Supabase configuration and secrets.
- After creating the Supabase database, open the Session Pooler connection details in Supabase and use those values to fill up `.env` file.
- Once Neo4j Aura instance is created, download and save its credentials file, which contains the connection URI, username, password, and database name to be included in `.env` file.
- Create an OpenAI API key at https://platform.openai.com/home and use it to fill in OPENAI_API_KEY in `.env` file.
- Format of `.env` file can be seen below:
```
POSTGRES_DB=postgres
POSTGRES_USER=postgres.<your-project-ref>
POSTGRES_PASSWORD=<your-database-password>
DB_HOST=aws-0-<your-region>.pooler.supabase.com
DB_PORT=5432
DB_SSLMODE=require
NEO4J_URI=neo4j+s://<your-instance-host>.databases.neo4j.io
NEO4J_USERNAME=<your-neo4j-username>
NEO4J_PASSWORD=<your-neo4j-password>
NEO4J_DATABASE=<your-database-name>
AURA_INSTANCEID=<your-instance-id>
AURA_INSTANCENAME=Free instance
OPENAI_API_KEY=<your-openai-api-key>
```

### 2. init.sql
- This contains the SQL needed to create the quiz tables and load the initial dataset into PostgreSQL.
- It is intended for setting up a new or empty Supabase database.

### 3. requirements.txt
- Create a new file called `requirements.txt` in the project root and add packages below in the file.
```
psycopg2-binary
python-dotenv
neo4j
openai
fastapi
uvicorn
httpx
```
- Install the requirements in the virtual environment `(.venv) (base)` with the code below in Terminal:
```bash
python -m pip install -r requirements.txt
```

### 4. query.py
- This is a small Python script used to test the PostgreSQL connection and demonstrate basic database operations. 
- It connects to Supabase using the values from .env and uses parameterized SQL for safe INSERT, UPDATE, and DELETE examples.

### 5. .gitignore
- This tells Git which local files should not be committed to the repository.
- .env must be listed in this file to keep the database password and other local credentials out of GitHub.
```
.env
```
<br><br>

## Overall Project Architecture & Core Components

![Diagram](images/project-architecture.png)
The project uses the following setup:
- **Local development**: query.py connects to the hosted PostgreSQL database using credentials stored in .env. The connection uses the Supabase Session Pooler with sslmode=require.
- **Supabase**: PostgreSQL stores the schools, students, and meals tables. Supabase also provides authentication and the backend used to run and save quiz queries.
- **GitHub**: GitHub Pages hosts the quiz website, while GitHub Actions verifies that the hosted database is reachable using a GitHub Secret.
- **Neo4j**: Neo4j stores knowledge about the dataset and retrieves relevant context. 
- **OpenAI**: OpenAI uses that context from Neo4j to generate SQL queries and explanations.


### 1. Authentication
- The quiz uses Supabase Magic Link authentication. A user enters an email address and receives a sign-in link.
- Signed-out users cannot run SQL queries or save quiz answers. After signing in, the quiz allows the user to run queries against the hosted database and save progress.

### 2. GitHub Actions
- Verify hosted database workflow checks that GitHub can connect to the hosted Supabase PostgreSQL database and that the students table contains data.
- Database connection is stored as a GitHub repository secret named: DATABASE_URL
- Workflow uses the Supabase Session Pooler connection with SSL. Database passwords are not stored in the workflow file or committed to GitHub.
- Workflow runs automatically on pushes to main and can also be started manually from the GitHub Actions tab.

### 3. RAG Architecture
- Neo4j stores the database schema, business rules, and example SQL queries.
- For each user question, the application retrieves relevant knowledge from Neo4j and passes it to OpenAI to help generate SQL.
- Workflow: User question → Vector retrieval → AI model → Generated SQL.

### 4. OpenAI API
- OpenAI generates SQL queries and brief explanations using the user’s question and retrieved knowledge.
- API key is stored securely in Supabase secrets for the deployed application and .env for local testing.
- Generated SQL runs with read-only access, and results can be checked against the selected quiz’s expected answer.

### 5. Additional features
- Parameterized queries: Application-owned database operations use parameters rather than f-string or string-concatenated SQL, helping reduce SQL injection risk.  
- Audit logging: Query runs and saved quiz answers are recorded in quiz_audit_log, including who performed the action, what was run or saved, and when it occurred.  
- Audit-log integrity: The restricted quiz role cannot modify the audit history. Direct UPDATE, DELETE, and TRUNCATE attempts are blocked by PostgreSQL permissions.
- Result validation: When a quiz question is selected under “Validate against,” generated results are compared with that question’s expected results. General questions display results without a correctness verdict.
<br><br>

## SQL Quiz Instructions
1. Open https://violathadtanone.github.io/IDS706-Major-Assignment-2-SQLQuiz/
2. Click sign in and open Magic Link sent to your email.
3. Select one of the five SQL questions.
4. Write a SQL query in the query editor.
5. Use Run Query to view the results from the live Supabase database.
6. Use the hint when needed to compare the expected SQL approach and expected result.
7. Use Check My SQL to check the returned result.
8. Save quiz progress while signed in.

## SQL Assistant Instructions
1. Click "Ask SQL Assistant" to open the chat
2. Enter your question, including the required columns, filters, sorting, and row limit.
3. Click Generate SQL to receive SQL, an explanation, and automatically executed query results.

<p align="center">
  <img src="images/sqlquiz-1.png" width="45%">
  <img src="images/sqlquiz-2.png" width="45%">
</p>

4. Under Validate against option can also be used by selecting a particular quiz question or General question.
5. If a quiz question was selected, the agent will review whether the results match its expected answer.
<p align="center">
  <img src="images/sqlquiz-3.png" width="45%">
  <img src="images/sqlquiz-4.png" width="45%">
</p>