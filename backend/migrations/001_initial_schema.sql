-- ==============================================================================
-- SkillForge Database Migration: Hardened Schema & Audit Remediations
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Automated Timestamp Update Trigger Function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. SESSIONS TABLE
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pdf_filename VARCHAR(255),
    file_uri TEXT,
    gemini_file_uri TEXT,
    pdf_content TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'uploading',
    input_tokens BIGINT NOT NULL DEFAULT 0,
    output_tokens BIGINT NOT NULL DEFAULT 0,
    thought_tokens BIGINT NOT NULL DEFAULT 0,
    total_tokens BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_sessions_tokens CHECK (
        input_tokens >= 0 AND output_tokens >= 0 AND 
        thought_tokens >= 0 AND total_tokens >= 0
    )
);

-- Ensure migration columns for existing tables
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS input_tokens BIGINT NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS output_tokens BIGINT NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS thought_tokens BIGINT NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS total_tokens BIGINT NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DROP TRIGGER IF EXISTS trg_sessions_updated_at ON sessions;
CREATE TRIGGER trg_sessions_updated_at
BEFORE UPDATE ON sessions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. QUESTIONS TABLE
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_answer INTEGER NOT NULL,
    explanation TEXT,
    hint TEXT,
    order_index INTEGER NOT NULL,
    is_answered_correctly BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FK Index for fast joins and non-locking cascade deletes
CREATE INDEX IF NOT EXISTS idx_questions_session_id ON questions(session_id);

-- 3. ATTEMPTS TABLE
CREATE TABLE IF NOT EXISTS attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    selected_answer INTEGER NOT NULL,
    is_correct BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attempts_question_id ON attempts(question_id);

-- 4. INTERACTIVE SESSIONS TABLE (1:1 with base sessions)
CREATE TABLE IF NOT EXISTS interactive_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    master_plan JSONB NOT NULL DEFAULT '[]'::jsonb,
    current_phase VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    progress_percent INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interactive_sessions_session_id ON interactive_sessions(session_id);

DROP TRIGGER IF EXISTS trg_interactive_sessions_updated_at ON interactive_sessions;
CREATE TRIGGER trg_interactive_sessions_updated_at
BEFORE UPDATE ON interactive_sessions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. INTERACTIVE LESSONS TABLE
CREATE TABLE IF NOT EXISTS interactive_lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interactive_session_id UUID NOT NULL REFERENCES interactive_sessions(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    concept_description TEXT,
    sandpack_code JSONB NOT NULL,
    goals JSONB NOT NULL,
    order_index INTEGER NOT NULL,
    verification_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interactive_lessons_interactive_session_id ON interactive_lessons(interactive_session_id);

-- 6. GOAL PROGRESS TABLE (Atomic Upsert Ready)
CREATE TABLE IF NOT EXISTS goal_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id UUID NOT NULL REFERENCES interactive_lessons(id) ON DELETE CASCADE,
    goal_index INTEGER NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    attempts INTEGER NOT NULL DEFAULT 0
);

-- Crucial Unique Index for atomic ON CONFLICT DO UPDATE upserts
CREATE UNIQUE INDEX IF NOT EXISTS uq_goal_progress_lesson_goal ON goal_progress(lesson_id, goal_index);
CREATE INDEX IF NOT EXISTS idx_goal_progress_lesson_id ON goal_progress(lesson_id);

-- 7. TOKEN USAGE LEDGER TABLE (Observability & Audit Trail)
CREATE TABLE IF NOT EXISTS token_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    node_name VARCHAR(100) NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    thought_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_usage_session_id ON token_usage_logs(session_id);

-- 8. PEDAGOGICAL SESSIONS TABLE
CREATE TABLE IF NOT EXISTS pedagogical_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    plan JSONB,
    plan_status VARCHAR(50) DEFAULT 'pending',
    current_objective JSONB,
    current_mcq JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pedagogical_sessions_session_id ON pedagogical_sessions(session_id);

-- 9. CHAT HISTORY TABLE
CREATE TABLE IF NOT EXISTS chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_history_session_id ON chat_history(session_id);

-- 10. SUMMARY REPORT TABLE
CREATE TABLE IF NOT EXISTS summary_report (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    summary JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_summary_report_session_id ON summary_report(session_id);

-- 11. PEDAGOGICAL SESSIONS V2 COLUMNS (HITL refinement loop + quiz state)
ALTER TABLE pedagogical_sessions ADD COLUMN IF NOT EXISTS quiz_config JSONB;
ALTER TABLE pedagogical_sessions ADD COLUMN IF NOT EXISTS slots JSONB;
ALTER TABLE pedagogical_sessions ADD COLUMN IF NOT EXISTS attempts_json JSONB;
ALTER TABLE pedagogical_sessions ADD COLUMN IF NOT EXISTS hint_revealed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pedagogical_sessions ADD COLUMN IF NOT EXISTS coaching_message TEXT;
ALTER TABLE pedagogical_sessions ADD COLUMN IF NOT EXISTS last_result JSONB;
ALTER TABLE pedagogical_sessions ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pedagogical_sessions ADD COLUMN IF NOT EXISTS plan_cap_reached BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pedagogical_sessions ADD COLUMN IF NOT EXISTS mcq_queue JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedagogical_sessions_session_id ON pedagogical_sessions(session_id);
