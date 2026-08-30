# Getting Started and Operations Guide

## 1. Prerequisites

- **Python**: `3.11+` (tested on Python `3.13.2`)
- **Node.js**: `18.x` or `20.x+`
- **PostgreSQL**: PostgreSQL 14+ database instance (e.g. Supabase, Neon, or local Postgres)
- **Google Cloud / AI Studio**: Active Google Cloud project with Vertex AI / Gemini API enabled

---

## 2. Environment Variables Configuration

Create a `.env` file in the root of the project by copying from [`.env.example`](file:///g:/Stuff/Study/Programs/QuizLoop-Interactive-AI-Quiz-Assessment-Platform/.env.example):

```bash
cp .env.example .env
```

### Essential Configuration Keys:
```env
# 1. Google Gemini AI & Vertex AI
GEMINI_API_KEY=AIzaSy...YourGeminiApiKey
GEMINI_MODEL_NAME=gemini-2.5-flash
GOOGLE_CLOUD_PROJECT=gen-lang-client-0470874118
GOOGLE_CLOUD_LOCATION=us-central1

# 2. LangSmith Observability
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_pt_...YourLangSmithKey
LANGSMITH_PROJECT=quizloop-platform
LANGSMITH_ENDPOINT=https://api.smith.langchain.com

# 3. PostgreSQL Database
POSTGRES_URL=postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:6543/postgres

# 4. Supabase Storage (Server Backend)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...YourSecretKey

# 5. FastAPI Backend
FASTAPI_HOST=0.0.0.0
FASTAPI_PORT=8000
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 3. Installation & Running Locally

### Terminal 1: Setup & Run Python FastAPI Backend
```bash
# 1. Navigate to repository root
cd /path/to/QuizLoop-Interactive-AI-Quiz-Assessment-Platform

# 2. Create virtual environment and install dependencies
python -m venv backend/.venv
.\backend\.venv\Scripts\activate
pip install -r backend/requirements.txt

# 3. Start FastAPI with auto-reload
uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
```

*FastAPI will automatically execute initial database migrations on startup.*
- **API URL**: `http://localhost:8000`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`
- **Health Check**: `http://localhost:8000/health`

---

### Terminal 2: Setup & Run Next.js Frontend
```bash
# 1. Install Node dependencies
npm install

# 2. Start Next.js development server
npm run dev
```

- **Web UI**: `http://localhost:3000`
- *All `/api/*` requests will automatically proxy to the FastAPI backend on port 8000.*

---

## 4. Running Automated Test Suites

### Backend Unit & Contract Tests (Pytest)
```bash
backend/.venv/Scripts/pytest -c backend/pytest.ini backend/tests -v
```
Runs 15 automated test cases verifying:
- API contracts & `CamelModel` serialization.
- Dynamic Context Cache Manager lifecycle & 10k token thresholds.
- LangGraph state reducers and self-healing routing boundaries.
- Native C Tree-sitter JSX AST parsing.

### Frontend Production Build
```bash
npm run build
```
Executes Webpack bundling and full TypeScript type checking.

---

## 5. Troubleshooting & FAQ

### Q1: Gemini API returns `429 RESOURCE_EXHAUSTED`
- **Cause**: The API key is in a project configured in "Prepay" mode without credit balance.
- **Fix**: Link your project to your standard Google Cloud Billing Account (with your promotional credits), or authenticate via Vertex AI using `gcloud auth application-default login`.

### Q2: Database returns prepared statement collision errors
- **Cause**: Connecting to Supabase PgBouncer pooler in Transaction Mode.
- **Fix**: The backend automatically sets `statement_cache_size=0` on `asyncpg` pool initialization in `backend/app/db.py`.

### Q3: Next.js Turbopack fails on Windows with `os error 1314`
- **Cause**: Windows requires Developer Mode or Administrator privileges for symlink creation during Turbopack builds.
- **Fix**: The build scripts in `package.json` are pre-configured with `--webpack` for reliable, permission-free cross-platform compilation.
