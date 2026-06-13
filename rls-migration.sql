-- ═══════════════════════════════════════════════════════════════
-- ZELVORA AI — ACCESS CODES TABLE + RLS POLICIES
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/nlsfakiwozkkqvbobnjq/sql/new
-- ═══════════════════════════════════════════════════════════════

-- 1. Create access_codes table (for reusable campus/batch codes like "CAMPUS2025")
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

-- 2. Enable RLS on access_codes
ALTER TABLE access_codes ENABLE ROW LEVEL SECURITY;

-- 3. Drop any existing policies on all tables (makes this re-runnable)
DO $$ 
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN (
    SELECT policyname, tablename FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename IN ('institutions','institution_users','api_keys','jobs','candidates','access_tokens','interview_sessions','usage_logs','payments','platform_config','access_codes')
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- 4. RLS Policies

-- ACCESS_TOKENS: anon can verify (SELECT only), everything else blocked
ALTER TABLE access_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon can verify tokens" ON access_tokens FOR SELECT USING (true);
CREATE POLICY "Deny anon write tokens" ON access_tokens FOR INSERT WITH CHECK (false);
CREATE POLICY "Deny anon update tokens" ON access_tokens FOR UPDATE USING (false);
CREATE POLICY "Deny anon delete tokens" ON access_tokens FOR DELETE USING (false);

-- ACCESS_CODES: anon can read (to validate codes), write blocked
CREATE POLICY "Anon can read codes" ON access_codes FOR SELECT USING (true);
CREATE POLICY "Deny anon write codes" ON access_codes FOR INSERT WITH CHECK (false);
CREATE POLICY "Deny anon update codes" ON access_codes FOR UPDATE USING (false);
CREATE POLICY "Deny anon delete codes" ON access_codes FOR DELETE USING (false);

-- PLATFORM_CONFIG: anon can read
ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon can read config" ON platform_config FOR SELECT USING (true);

-- ALL OTHER TABLES: no anon access (Worker uses service_role key which bypasses RLS)
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No anon access" ON institutions FOR ALL USING (false) WITH CHECK (false);

ALTER TABLE institution_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No anon access" ON institution_users FOR ALL USING (false) WITH CHECK (false);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No anon access" ON api_keys FOR ALL USING (false) WITH CHECK (false);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No anon access" ON jobs FOR ALL USING (false) WITH CHECK (false);

ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No anon access" ON candidates FOR ALL USING (false) WITH CHECK (false);

ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No anon access" ON interview_sessions FOR ALL USING (false) WITH CHECK (false);

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No anon access" ON usage_logs FOR ALL USING (false) WITH CHECK (false);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No anon access" ON payments FOR ALL USING (false) WITH CHECK (false);
