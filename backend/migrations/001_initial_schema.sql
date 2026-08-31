-- ==============================================================================
-- QuizLoop Database Migration: Consolidated Pedagogical Schema
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

-- Prune deprecated legacy tables idempotently
DROP TABLE IF EXISTS goal_progress CASCADE;
DROP TABLE IF EXISTS interactive_lessons CASCADE;
DROP TABLE IF EXISTS interactive_sessions CASCADE;
DROP TABLE IF EXISTS attempts CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS chat_history CASCADE;

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

DROP TRIGGER IF EXISTS trg_sessions_updated_at ON sessions;
CREATE TRIGGER trg_sessions_updated_at
BEFORE UPDATE ON sessions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. TOKEN USAGE LEDGER TABLE (Observability & Audit Trail)
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

-- 3. PEDAGOGICAL SESSIONS TABLE
CREATE TABLE IF NOT EXISTS pedagogical_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    plan JSONB NOT NULL DEFAULT '[]'::jsonb,
    plan_status VARCHAR(50) NOT NULL DEFAULT 'drafting',
    quiz_config JSONB,
    slots JSONB,
    current_objective JSONB,
    current_mcq JSONB,
    mcq_queue JSONB,
    attempts_json JSONB DEFAULT '[]'::jsonb,
    hint_revealed BOOLEAN NOT NULL DEFAULT FALSE,
    coaching_message TEXT,
    last_result JSONB,
    revision INTEGER NOT NULL DEFAULT 0,
    plan_cap_reached BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pedagogical_sessions_session_id ON pedagogical_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_pedagogical_sessions_session_id ON pedagogical_sessions(session_id);

DROP TRIGGER IF EXISTS trg_pedagogical_sessions_updated_at ON pedagogical_sessions;
CREATE TRIGGER trg_pedagogical_sessions_updated_at
BEFORE UPDATE ON pedagogical_sessions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. SUMMARY REPORT TABLE
CREATE TABLE IF NOT EXISTS summary_report (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    summary JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_summary_report_session_id ON summary_report(session_id);
CREATE INDEX IF NOT EXISTS idx_summary_report_session_id ON summary_report(session_id);

