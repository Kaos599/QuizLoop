# Getting Started and Operations Guide

## 1. Prerequisites

- **Python**: `3.11+` (tested on Python `3.13.2`)
- **Node.js**: `18.x` or `20.x+` (with `npm`, `pnpm`, or `yarn`)
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

# 2. PostgreSQL Database Connection
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres

# 3. Supabase PDF Storage (Optional / Fallback to Local)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# 4. LangSmith Observability & Tracing (Optional)
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_pt_...
LANGSMITH_PROJECT=quizloop-platform
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
```

---

## 3. Local Development Setup

### Backend Service (FastAPI)

```bash
# Navigate to backend
cd backend

# Create & activate virtual environment
python -m venv venv

# Windows PowerShell:
.\venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run migrations (auto-applied on startup) & launch dev server
uvicorn app.main:app --reload --port 8000
```

The API documentation is accessible at `http://localhost:8000/docs`.

### Frontend Web App (Next.js 16)

```bash
# In the root project directory
npm install

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 4. Running Automated Test Suites

```bash
# Navigate to backend
cd backend

# Run the entire test suite
python -m pytest tests/ -v

# Run pedagogical API flow tests
python -m pytest tests/test_learning_api_flow.py -v

# Run pedagogical graph behavior & HITL refinement tests
python -m pytest tests/test_pedagogical_pipeline.py -v
```

---

## 5. Operations and Troubleshooting

### Common Diagnostics

1. **PDF Upload Fails Validation**:
   - Verify the file is $\le 25\text{MB}$ and possesses a valid `%PDF` binary header.
2. **502 on Plan Approval or Re-drafting**:
   - Check `GEMINI_API_KEY` quota and rate limits.
   - Review `backend/logs/` for upstream LLM error logs.
3. **Database Connection Errors**:
   - Ensure the database URL uses pooled connections if running behind AWS/Supabase Supavisor.
   - Check that `001_initial_schema.sql` was applied successfully.
