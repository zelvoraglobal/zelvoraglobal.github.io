-- ═══════════════════════════════════════════════════════════════
-- ZELVORA AI — B2B INTERVIEW PLATFORM — SUPABASE SCHEMA
-- Run this in your Supabase SQL Editor (https://nlsfakiwozkkqvbobnjq.supabase.co)
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════
-- 1. INSTITUTIONS (B2B Clients)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS institutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  logo_url TEXT,
  website TEXT,
  plan TEXT DEFAULT 'starter' CHECK (plan IN ('starter','professional','enterprise','trial')),
  plan_expires_at TIMESTAMPTZ,
  max_interviews_per_month INT DEFAULT 50,
  max_seats INT DEFAULT 5,
  branding JSONB DEFAULT '{}',
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- 2. INSTITUTION USERS (Admin accounts)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS institution_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'admin' CHECK (role IN ('owner','admin','hr','viewer')),
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inst_users_email ON institution_users(email);

-- ═══════════════════════════════════════
-- 3. API KEYS (BYOK — Bring Your Own Key)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('openai','anthropic','gemini','groq','elevenlabs','openai_tts','custom')),
  encrypted_key TEXT NOT NULL,
  key_hint TEXT,
  preferred_model TEXT,
  is_active BOOLEAN DEFAULT true,
  is_validated BOOLEAN DEFAULT false,
  last_used_at TIMESTAMPTZ,
  usage_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_inst ON api_keys(institution_id);

-- ═══════════════════════════════════════
-- 4. JOB POSITIONS
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  department TEXT,
  description TEXT,
  requirements TEXT,
  location TEXT,
  job_type TEXT DEFAULT 'full-time',
  experience_level TEXT DEFAULT 'mid',
  interview_config JSONB DEFAULT '{"type":"behavioral","difficulty":"intermediate","questions":10}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jobs_inst ON jobs(institution_id);

-- ═══════════════════════════════════════
-- 5. CANDIDATES
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  resume_text TEXT,
  linkedin_url TEXT,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active','hired','rejected','archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_candidates_inst ON candidates(institution_id);
CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(email);

-- ═══════════════════════════════════════
-- 6. ACCESS TOKENS (Interview Links)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS access_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  token TEXT UNIQUE NOT NULL,
  candidate_name TEXT,
  candidate_email TEXT,
  job_role TEXT NOT NULL,
  experience_level TEXT DEFAULT 'mid',
  interview_type TEXT DEFAULT 'behavioral',
  difficulty TEXT DEFAULT 'intermediate',
  max_questions INT DEFAULT 10,
  max_attempts INT DEFAULT 1,
  attempts_used INT DEFAULT 0,
  language TEXT DEFAULT 'en',
  is_proctored BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','expired','revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_access_tokens_token ON access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_access_tokens_inst ON access_tokens(institution_id);

-- ═══════════════════════════════════════
-- 7. INTERVIEW SESSIONS
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS interview_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
  access_token_id UUID REFERENCES access_tokens(id) ON DELETE SET NULL,
  candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  job_role TEXT,
  interview_type TEXT,
  difficulty TEXT,
  ai_provider TEXT DEFAULT 'platform',
  ai_model TEXT,
  transcript JSONB DEFAULT '[]',
  scores JSONB DEFAULT '{}',
  overall_score INT,
  grade TEXT,
  feedback TEXT,
  duration_seconds INT,
  questions_answered INT DEFAULT 0,
  avg_response_words INT DEFAULT 0,
  violations JSONB DEFAULT '[]',
  proctoring_data JSONB DEFAULT '{}',
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','abandoned','flagged')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_inst ON interview_sessions(institution_id);
CREATE INDEX IF NOT EXISTS idx_sessions_candidate ON interview_sessions(candidate_id);

-- ═══════════════════════════════════════
-- 8. USAGE LOGS (API Tracking)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module IN ('interview','tutor','career','exam','doubt')),
  provider TEXT,
  model TEXT,
  tokens_in INT DEFAULT 0,
  tokens_out INT DEFAULT 0,
  cost_usd DECIMAL(10,6) DEFAULT 0,
  is_byok BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_inst ON usage_logs(institution_id);
CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_logs(created_at);

-- ═══════════════════════════════════════
-- 9. PAYMENTS
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id UUID REFERENCES institutions(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  plan TEXT,
  payment_method TEXT,
  payment_id TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','refunded')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_inst ON payments(institution_id);

-- ═══════════════════════════════════════
-- 10. PLATFORM CONFIG (Global settings)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS platform_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default platform config
INSERT INTO platform_config (key, value) VALUES
  ('plans', '{"starter":{"name":"Starter","price":99,"currency":"USD","interviews":50,"seats":5,"byok":false},"professional":{"name":"Professional","price":299,"currency":"USD","interviews":200,"seats":25,"byok":true},"enterprise":{"name":"Enterprise","price":799,"currency":"USD","interviews":999999,"seats":999,"byok":true,"whitelabel":true}}'),
  ('default_ai', '{"provider":"groq","model":"llama-3.3-70b-versatile"}'),
  ('features', '{"full_duplex":true,"proctoring":true,"byok":true}')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS, anon gets read on public tables
-- Drop old policies first (makes this script re-runnable)
DO $$ 
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN (
    SELECT policyname, tablename FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename IN ('institutions','institution_users','api_keys','jobs','candidates','access_tokens','interview_sessions','usage_logs','payments')
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

CREATE POLICY "Service role full access" ON institutions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON institution_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON api_keys FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON candidates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON access_tokens FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON interview_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON usage_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON payments FOR ALL USING (true) WITH CHECK (true);

-- Public read for access token verification
CREATE POLICY "Anon can verify tokens" ON access_tokens FOR SELECT USING (true);

-- ═══════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_institutions_updated ON institutions;
CREATE TRIGGER trg_institutions_updated BEFORE UPDATE ON institutions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_api_keys_updated ON api_keys;
CREATE TRIGGER trg_api_keys_updated BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_jobs_updated ON jobs;
CREATE TRIGGER trg_jobs_updated BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_candidates_updated ON candidates;
CREATE TRIGGER trg_candidates_updated BEFORE UPDATE ON candidates FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Dashboard analytics function
CREATE OR REPLACE FUNCTION get_institution_stats(inst_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_interviews', (SELECT COUNT(*) FROM interview_sessions WHERE institution_id = inst_id),
    'completed_interviews', (SELECT COUNT(*) FROM interview_sessions WHERE institution_id = inst_id AND status = 'completed'),
    'avg_score', (SELECT COALESCE(AVG(overall_score), 0) FROM interview_sessions WHERE institution_id = inst_id AND overall_score IS NOT NULL),
    'active_tokens', (SELECT COUNT(*) FROM access_tokens WHERE institution_id = inst_id AND status = 'pending' AND expires_at > NOW()),
    'total_candidates', (SELECT COUNT(*) FROM candidates WHERE institution_id = inst_id),
    'active_jobs', (SELECT COUNT(*) FROM jobs WHERE institution_id = inst_id AND is_active = true),
    'interviews_this_month', (SELECT COUNT(*) FROM interview_sessions WHERE institution_id = inst_id AND created_at >= DATE_TRUNC('month', NOW())),
    'api_calls_this_month', (SELECT COUNT(*) FROM usage_logs WHERE institution_id = inst_id AND created_at >= DATE_TRUNC('month', NOW())),
    'byok_usage', (SELECT COUNT(*) FROM usage_logs WHERE institution_id = inst_id AND is_byok = true AND created_at >= DATE_TRUNC('month', NOW()))
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql;
