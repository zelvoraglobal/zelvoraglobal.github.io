-- ═══════════════════════════════════════════════════════════════
-- ZELVORA AI — COMPLETE DATABASE SETUP (Tables + RLS + Functions)
-- Paste this ENTIRE file into Supabase SQL Editor and click Run
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════
-- DROP EXISTING TABLES (clean slate — order matters for foreign keys)
-- ═══════════════════════════════════════
DROP TABLE IF EXISTS security_audit_log CASCADE;
DROP TABLE IF EXISTS access_codes CASCADE;
DROP TABLE IF EXISTS usage_logs CASCADE;
DROP TABLE IF EXISTS interview_sessions CASCADE;
DROP TABLE IF EXISTS access_tokens CASCADE;
DROP TABLE IF EXISTS candidates CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;
DROP TABLE IF EXISTS api_keys CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS institution_users CASCADE;
DROP TABLE IF EXISTS institutions CASCADE;
DROP TABLE IF EXISTS platform_config CASCADE;

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
-- 3. API KEYS (BYOK)
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
-- 4. JOBS
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
-- 8. USAGE LOGS
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
-- 10. PLATFORM CONFIG
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS platform_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO platform_config (key, value) VALUES
  ('plans', '{"starter":{"name":"Starter","price":99,"currency":"USD","interviews":50,"seats":5,"byok":false},"professional":{"name":"Professional","price":299,"currency":"USD","interviews":200,"seats":25,"byok":true},"enterprise":{"name":"Enterprise","price":799,"currency":"USD","interviews":999999,"seats":999,"byok":true,"whitelabel":true}}'),
  ('default_ai', '{"provider":"groq","model":"llama-3.3-70b-versatile"}'),
  ('features', '{"full_duplex":true,"proctoring":true,"byok":true}')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════
-- 11. ACCESS CODES (Reusable campus codes)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS access_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  max_uses INT DEFAULT 50,
  used INT DEFAULT 0,
  days INT DEFAULT 30,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_access_codes_code ON access_codes(code);

-- ═══════════════════════════════════════
-- 12. SECURITY AUDIT LOG
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS security_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  source_institution_id UUID,
  target_institution_id UUID,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════

-- No need to drop policies since we dropped all tables above

-- Enable RLS on all tables
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_codes ENABLE ROW LEVEL SECURITY;

-- Anon can verify tokens (SELECT only)
CREATE POLICY "Anon can verify tokens" ON access_tokens FOR SELECT USING (true);
CREATE POLICY "Deny anon write tokens" ON access_tokens FOR INSERT WITH CHECK (false);
CREATE POLICY "Deny anon update tokens" ON access_tokens FOR UPDATE USING (false);
CREATE POLICY "Deny anon delete tokens" ON access_tokens FOR DELETE USING (false);

-- Anon can read codes and platform config
CREATE POLICY "Anon can read codes" ON access_codes FOR SELECT USING (true);
CREATE POLICY "Deny anon write codes" ON access_codes FOR INSERT WITH CHECK (false);
CREATE POLICY "Deny anon update codes" ON access_codes FOR UPDATE USING (false);
CREATE POLICY "Deny anon delete codes" ON access_codes FOR DELETE USING (false);
CREATE POLICY "Anon can read config" ON platform_config FOR SELECT USING (true);

-- Block anon from all other tables
CREATE POLICY "No anon access" ON institutions FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "No anon access" ON institution_users FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "No anon access" ON api_keys FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "No anon access" ON jobs FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "No anon access" ON candidates FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "No anon access" ON interview_sessions FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "No anon access" ON usage_logs FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "No anon access" ON payments FOR ALL USING (false) WITH CHECK (false);

-- ═══════════════════════════════════════
-- FUNCTIONS & TRIGGERS
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $fn$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

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
RETURNS JSON AS $fn$
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
$fn$ LANGUAGE plpgsql;
