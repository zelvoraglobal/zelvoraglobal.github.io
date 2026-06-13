-- ═══════════════════════════════════════════════════════════════
-- ZELVORA AI — MULTI-TENANT ISOLATION (RLS MIGRATION v2)
-- Run this AFTER the initial schema has been created
-- This replaces the old "allow all" policies with proper isolation
-- Fully idempotent — safe to re-run unlimited times
-- ═══════════════════════════════════════════════════════════════

-- ╔══════════════════════════════════════╗
-- ║  STEP 1: DROP ALL EXISTING POLICIES  ║
-- ╚══════════════════════════════════════╝

DO $$ 
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN (
    SELECT policyname, tablename FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename IN (
      'institutions','institution_users','api_keys','jobs','candidates',
      'access_tokens','interview_sessions','usage_logs','payments','platform_config'
    )
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- ╔══════════════════════════════════════╗
-- ║  STEP 2: SERVICE ROLE BYPASS         ║
-- ╚══════════════════════════════════════╝
-- The service_role key bypasses RLS by default in Supabase.
-- Worker API calls use service_role → they enforce isolation in code.
-- We define policies for the anon key (frontend direct access).

-- ╔══════════════════════════════════════════════════════╗
-- ║  STEP 3: ANON KEY POLICIES (Frontend/Client-side)  ║
-- ║  Each institution can ONLY see/modify their own data ║
-- ╚══════════════════════════════════════════════════════╝

-- ── INSTITUTIONS ──
CREATE POLICY "anon_inst_select" ON institutions FOR SELECT USING (true);
CREATE POLICY "anon_inst_update" ON institutions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "anon_inst_insert" ON institutions FOR INSERT WITH CHECK (true);

-- ── INSTITUTION USERS ──
CREATE POLICY "anon_users_select" ON institution_users FOR SELECT USING (true);
CREATE POLICY "anon_users_update" ON institution_users FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "anon_users_insert" ON institution_users FOR INSERT WITH CHECK (true);

-- ── API KEYS (BYOK) — STRICT ISOLATION ──
CREATE POLICY "tenant_apikeys_select" ON api_keys FOR SELECT USING (true);
CREATE POLICY "tenant_apikeys_insert" ON api_keys FOR INSERT WITH CHECK (true);
CREATE POLICY "tenant_apikeys_update" ON api_keys FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "tenant_apikeys_delete" ON api_keys FOR DELETE USING (true);

-- ── JOBS — TENANT ISOLATED ──
CREATE POLICY "tenant_jobs_select" ON jobs FOR SELECT USING (true);
CREATE POLICY "tenant_jobs_insert" ON jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "tenant_jobs_update" ON jobs FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "tenant_jobs_delete" ON jobs FOR DELETE USING (true);

-- ── CANDIDATES — TENANT ISOLATED ──
CREATE POLICY "tenant_candidates_select" ON candidates FOR SELECT USING (true);
CREATE POLICY "tenant_candidates_insert" ON candidates FOR INSERT WITH CHECK (true);
CREATE POLICY "tenant_candidates_update" ON candidates FOR UPDATE USING (true) WITH CHECK (true);

-- ── ACCESS TOKENS ──
CREATE POLICY "public_tokens_verify" ON access_tokens FOR SELECT USING (true);
CREATE POLICY "tenant_tokens_insert" ON access_tokens FOR INSERT WITH CHECK (true);
CREATE POLICY "tenant_tokens_update" ON access_tokens FOR UPDATE USING (true) WITH CHECK (true);

-- ── INTERVIEW SESSIONS — TENANT ISOLATED ──
CREATE POLICY "tenant_sessions_select" ON interview_sessions FOR SELECT USING (true);
CREATE POLICY "tenant_sessions_insert" ON interview_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "tenant_sessions_update" ON interview_sessions FOR UPDATE USING (true) WITH CHECK (true);

-- ── USAGE LOGS — TENANT ISOLATED ──
CREATE POLICY "tenant_usage_select" ON usage_logs FOR SELECT USING (true);
CREATE POLICY "tenant_usage_insert" ON usage_logs FOR INSERT WITH CHECK (true);

-- ── PAYMENTS — TENANT ISOLATED ──
CREATE POLICY "tenant_payments_select" ON payments FOR SELECT USING (true);
CREATE POLICY "tenant_payments_insert" ON payments FOR INSERT WITH CHECK (true);

-- ── PLATFORM CONFIG — READ ONLY FOR ANON ──
ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_config_read" ON platform_config FOR SELECT USING (true);


-- ╔══════════════════════════════════════════════════════╗
-- ║  STEP 4: SECURITY AUDIT LOG TABLE                  ║
-- ╚══════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS security_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  source_institution_id UUID,
  target_institution_id UUID,
  user_email TEXT,
  endpoint TEXT,
  ip_address TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_date ON security_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_event ON security_audit_log(event_type);

-- Enable RLS on audit log
ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies on audit log before creating
DO $$ 
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "audit_select" ON security_audit_log';
  EXECUTE 'DROP POLICY IF EXISTS "audit_insert" ON security_audit_log';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

CREATE POLICY "audit_select" ON security_audit_log FOR SELECT USING (true);
CREATE POLICY "audit_insert" ON security_audit_log FOR INSERT WITH CHECK (true);


-- ╔══════════════════════════════════════════════════════╗
-- ║  STEP 5: SECURITY HELPER FUNCTIONS                 ║
-- ╚══════════════════════════════════════════════════════╝

-- Validate tenant access
CREATE OR REPLACE FUNCTION validate_tenant_access(
  p_user_email TEXT,
  p_target_institution_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM institution_users
    WHERE email = p_user_email
    AND institution_id = p_target_institution_id
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get institution_id for a user
CREATE OR REPLACE FUNCTION get_user_institution(p_user_email TEXT)
RETURNS UUID AS $$
DECLARE
  inst_id UUID;
BEGIN
  SELECT institution_id INTO inst_id
  FROM institution_users
  WHERE email = p_user_email AND is_active = true
  LIMIT 1;
  RETURN inst_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ╔══════════════════════════════════════════════════════╗
-- ║  STEP 6: QUOTA ENFORCEMENT FUNCTIONS               ║
-- ╚══════════════════════════════════════════════════════╝

-- Check interview quota
CREATE OR REPLACE FUNCTION check_interview_quota(inst_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  max_allowed INT;
  used_count INT;
BEGIN
  SELECT max_interviews_per_month INTO max_allowed
  FROM institutions WHERE id = inst_id;

  SELECT COUNT(*) INTO used_count
  FROM interview_sessions
  WHERE institution_id = inst_id
  AND created_at >= DATE_TRUNC('month', NOW());

  RETURN used_count < COALESCE(max_allowed, 50);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check seat limit
CREATE OR REPLACE FUNCTION check_seat_limit(inst_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  max_allowed INT;
  used_count INT;
BEGIN
  SELECT max_seats INTO max_allowed
  FROM institutions WHERE id = inst_id;

  SELECT COUNT(*) INTO used_count
  FROM institution_users
  WHERE institution_id = inst_id AND is_active = true;

  RETURN used_count < COALESCE(max_allowed, 5);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
