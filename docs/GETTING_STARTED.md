# Getting Started and Operations Guide

## 1. Prerequisites

- **Node.js**: `20.x+` (with `npm`, `pnpm`, or `yarn`)
- **PostgreSQL**: PostgreSQL 14+ database instance (Supabase, Neon, or local PostgreSQL)
- **Google Cloud / AI Studio**: Active Google Gemini API Key (`gemini-3.7-flash`)

---

## 2. Environment Variables Configuration

Create a `.env` file in the root directory by copying from [`.env.example`](../.env.example):

```bash
cp .env.example .env
```

### Essential Configuration Keys:
```env
# 1. Google Gemini AI Core
GEMINI_API_KEY=AIzaSy...YourGeminiApiKey
GEMINI_MODEL_NAME=gemini-3.7-flash

# 2. PostgreSQL Database Connection (REQUIRED - fail-fast if missing)
POSTGRES_URL=postgresql://postgres.xxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres

# 3. Supabase PDF Storage (Optional / Fallback to Local)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...  # server-side only - never NEXT_PUBLIC_*

# 4. LangSmith Observability & Tracing (Optional)
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_pt_...
LANGSMITH_PROJECT=quizloop-platform
LANGSMITH_ENDPOINT=https://api.smith.langchain.com

# 5. CORS (Optional, comma-separated allowed origins)
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

---

## 3. Local Development Setup

```bash
# 1. Install dependencies (single codebase - frontend + API in one Next.js app)
npm install

# 2. Apply the database schema (sessions, pedagogical_sessions, summary_report, token_usage_logs)
npm run db:migrate

# 3. Run the development server (API + frontend on the same origin)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The REST API is served by Next.js route handlers under `http://localhost:3000/api/*` — there is no separate backend process.

> [!NOTE]
> Migrations are also applied automatically on boot via `ensureSchema()` (`src/server/db.ts`), which reads `migrations/001_initial_schema.sql`.

---

## 4. Running Automated Test Suites

```bash
# Run the entire test suite (server tests + frontend component tests)
npm test

# Type-check the entire codebase
npx tsc --noEmit

# Run only the server test suites
npx vitest run tests/server
```

---

## 5. Operations and Troubleshooting

### Common Diagnostics

1. **PDF Upload Fails Validation**:
   - Verify the file is $\le 25\text{MB}$ and possesses a valid `%PDF` binary header (content-based check — a misleading `.pdf` filename alone is rejected).
2. **502 / Timeout on Plan Approval or Re-drafting**:
   - Check `GEMINI_API_KEY` quota and rate limits (the Gemini client retries only HTTP 429/503 with exponential backoff).
   - Graph-touching route handlers export `maxDuration = 60`; on serverless platforms a longer-running deck regeneration may require raising it or moving to a queue worker.
3. **Database Connection Errors**:
   - Ensure the database URL uses pooled connections if running behind AWS/Supabase Supavisor.
   - Check that `001_initial_schema.sql` was applied (`npm run db:migrate`).
4. **Session Interrupts Lost Across Requests**:
   - Production graph resumes require the Postgres checkpointer (`PostgresSaver`). The in-process `TaskRegistry` is per-instance — on multi-instance/serverless deploys, task records are not shared; poll `GET /state` (the checkpointer) as the source of truth.