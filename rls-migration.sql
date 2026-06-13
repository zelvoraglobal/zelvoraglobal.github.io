-- RLS Migration: Lock down anon access, allow only service role full access
-- Run this after the initial schema has been applied

-- Drop all existing policies
DO $$ 
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN (
    SELECT policyname, tablename FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename IN ('institutions','institution_users','api_keys','jobs','candidates','access_tokens','interview_sessions','usage_logs','payments','platform_config')
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- Enable RLS on all tables (idempotent)
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- ANON KEY POLICIES (browser clients — minimal read-only access)
CREATE POLICY "Anon can verify tokens" ON access_tokens FOR SELECT USING (true);

-- Block anon from modifying tokens
CREATE POLICY "Deny anon write tokens" ON access_tokens FOR INSERT WITH CHECK (false);
CREATE POLICY "Deny anon update tokens" ON access_tokens FOR UPDATE USING (false);
CREATE POLICY "Deny anon delete tokens" ON access_tokens FOR DELETE USING (false);

-- All other tables: no anon access (service_role in Worker bypasses RLS)
CREATE POLICY "No anon access" ON institutions FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "No anon access" ON institution_users FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "No anon access" ON api_keys FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "No anon access" ON jobs FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "No anon access" ON candidates FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "No anon access" ON interview_sessions FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "No anon access" ON usage_logs FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "No anon access" ON payments FOR ALL USING (false) WITH CHECK (false);
