/* ═══════════════════════════════════════════════════════════════
   ZELVORA AI — SUPABASE CLIENT MODULE
   Shared across all pages for database operations
   ═══════════════════════════════════════════════════════════════ */

const SUPABASE_URL = 'https://nlsfakiwozkkqvbobnjq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sc2Zha2l3b3pra3F2Ym9ibmpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNDY1MTUsImV4cCI6MjA5NjYyMjUxNX0.JB68GrLJ9wWH3SkXbpylKXMQevnsdlu9B11j5GUl108';

class ZelvoraDB {
  constructor() {
    this.url = SUPABASE_URL;
    this.key = SUPABASE_ANON_KEY;
    this.headers = {
      'apikey': this.key,
      'Authorization': `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
    this.session = null;
    this._loadSession();
  }

  // ═══════════════════════════════════════
  // SESSION MANAGEMENT
  // ═══════════════════════════════════════
  _loadSession() {
    try {
      const s = localStorage.getItem('zv_session');
      if (s) this.session = JSON.parse(s);
    } catch (e) { }
  }

  _saveSession(session) {
    this.session = session;
    localStorage.setItem('zv_session', JSON.stringify(session));
  }

  clearSession() {
    this.session = null;
    localStorage.removeItem('zv_session');
  }

  getInstitutionId() {
    return this.session?.institution_id || null;
  }

  getUserRole() {
    return this.session?.role || null;
  }

  isLoggedIn() {
    return !!this.session?.institution_id;
  }

  // Tenant-scoped Worker API call (includes X-Institution-Id header)
  async workerFetch(path, body = null) {
    const workerUrl = this.getWorkerUrl();
    const headers = { 'Content-Type': 'application/json' };
    if (this.session?.institution_id) {
      headers['X-Institution-Id'] = this.session.institution_id;
    }
    const res = await fetch(`${workerUrl}${path}`, {
      method: body ? 'POST' : 'GET',
      headers,
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Worker error: ${res.status}`);
    return data;
  }

  getWorkerUrl() {
    // Auto-detect: use local for dev, production for live
    return window.location.hostname === 'localhost'
      ? `http://localhost:8787`
      : `https://late-mouse-4aa2.zelvora-global.workers.dev`;
  }

  // ═══════════════════════════════════════
  // RAW SUPABASE REST API
  // ═══════════════════════════════════════
  async _fetch(path, options = {}) {
    const url = `${this.url}/rest/v1/${path}`;
    const res = await fetch(url, {
      headers: this.headers,
      ...options
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase error: ${res.status} — ${err}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async select(table, query = '') {
    return this._fetch(`${table}?${query}`, { method: 'GET' });
  }

  async insert(table, data) {
    return this._fetch(table, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async update(table, data, query) {
    return this._fetch(`${table}?${query}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  async delete(table, query) {
    return this._fetch(`${table}?${query}`, { method: 'DELETE' });
  }

  async rpc(fnName, params = {}) {
    const url = `${this.url}/rest/v1/rpc/${fnName}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(params)
    });
    if (!res.ok) throw new Error(`RPC error: ${res.status}`);
    return res.json();
  }

  // ═══════════════════════════════════════
  // AUTH — Institution Login (via Worker — passwords never reach browser)
  // ═══════════════════════════════════════
  async login(email, password) {
    // Route through Worker API — password is verified server-side
    const data = await this.workerFetch('/api/auth/login', { email, password });
    if (!data.success) throw new Error(data.error || 'Login failed');

    const user = data.user;
    const session = {
      user_id: user.id,
      institution_id: user.institution_id,
      email: user.email,
      name: user.name,
      role: user.role,
      institution: user.institution
    };
    this._saveSession(session);
    return session;
  }

  async register(institutionData, userData) {
    // Route through Worker API — password is hashed server-side
    const data = await this.workerFetch('/api/auth/register', {
      institution_name: institutionData.name,
      email: userData.email,
      password: userData.password,
      name: userData.name,
      phone: institutionData.phone || null
    });
    if (!data.success) throw new Error(data.error || 'Registration failed');

    return { institution: data.institution, user: data.user };
  }

  // ═══════════════════════════════════════
  // INSTITUTIONS
  // ═══════════════════════════════════════
  async getInstitution(id) {
    const data = await this.select('institutions', `id=eq.${id}`);
    return data?.[0] || null;
  }

  async updateInstitution(id, updates) {
    return this.update('institutions', updates, `id=eq.${id}`);
  }

  // ═══════════════════════════════════════
  // BYOK — API KEYS
  // ═══════════════════════════════════════
  async getApiKeys(institutionId) {
    return this.select('api_keys', 
      `institution_id=eq.${institutionId}&order=created_at.desc`
    );
  }

  async saveApiKey(institutionId, provider, encryptedKey, keyHint, preferredModel) {
    // Upsert: update if provider exists, insert if not
    const existing = await this.select('api_keys',
      `institution_id=eq.${institutionId}&provider=eq.${provider}`
    );
    if (existing && existing.length > 0) {
      return this.update('api_keys', {
        encrypted_key: encryptedKey,
        key_hint: keyHint,
        preferred_model: preferredModel,
        is_validated: false,
        updated_at: new Date().toISOString()
      }, `id=eq.${existing[0].id}`);
    }
    return this.insert('api_keys', {
      institution_id: institutionId,
      provider,
      encrypted_key: encryptedKey,
      key_hint: keyHint,
      preferred_model: preferredModel
    });
  }

  async deleteApiKey(keyId) {
    return this.delete('api_keys', `id=eq.${keyId}`);
  }

  async markKeyValidated(keyId) {
    return this.update('api_keys', { is_validated: true }, `id=eq.${keyId}`);
  }

  // ═══════════════════════════════════════
  // JOBS
  // ═══════════════════════════════════════
  async getJobs(institutionId) {
    return this.select('jobs', 
      `institution_id=eq.${institutionId}&order=created_at.desc`
    );
  }

  async createJob(data) {
    return this.insert('jobs', data);
  }

  async updateJob(id, updates) {
    return this.update('jobs', updates, `id=eq.${id}`);
  }

  // ═══════════════════════════════════════
  // CANDIDATES
  // ═══════════════════════════════════════
  async getCandidates(institutionId) {
    return this.select('candidates',
      `institution_id=eq.${institutionId}&order=created_at.desc`
    );
  }

  async createCandidate(data) {
    return this.insert('candidates', data);
  }

  async updateCandidate(id, updates) {
    return this.update('candidates', updates, `id=eq.${id}`);
  }

  async getCandidateWithSessions(candidateId) {
    const candidate = await this.select('candidates', `id=eq.${candidateId}`);
    const sessions = await this.select('interview_sessions',
      `candidate_id=eq.${candidateId}&order=created_at.desc`
    );
    return { candidate: candidate?.[0], sessions: sessions || [] };
  }

  // ═══════════════════════════════════════
  // ACCESS TOKENS
  // ═══════════════════════════════════════
  async getAccessTokens(institutionId, statusFilter = null) {
    let q = `institution_id=eq.${institutionId}&order=created_at.desc`;
    if (statusFilter && statusFilter !== 'all') {
      q += `&status=eq.${statusFilter}`;
    }
    return this.select('access_tokens', q);
  }

  async createAccessToken(data) {
    const token = this._generateToken();
    return this.insert('access_tokens', { ...data, token });
  }

  async verifyAccessToken(token) {
    const data = await this.select('access_tokens', `token=eq.${encodeURIComponent(token)}`);
    if (!data || data.length === 0) return null;
    const t = data[0];
    if (t.status === 'expired' || t.status === 'revoked') return null;
    if (new Date(t.expires_at) < new Date()) {
      await this.update('access_tokens', { status: 'expired' }, `id=eq.${t.id}`);
      return null;
    }
    if (t.attempts_used >= t.max_attempts) return null;
    return t;
  }

  async markTokenStarted(tokenId) {
    return this.update('access_tokens', {
      status: 'in_progress',
      started_at: new Date().toISOString(),
      attempts_used: 1 // Increment via RPC in production
    }, `id=eq.${tokenId}`);
  }

  async markTokenCompleted(tokenId) {
    return this.update('access_tokens', {
      status: 'completed',
      completed_at: new Date().toISOString()
    }, `id=eq.${tokenId}`);
  }

  _generateToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = 'ZV-';
    for (let i = 0; i < 24; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));
    return token;
  }

  // ═══════════════════════════════════════
  // INTERVIEW SESSIONS
  // ═══════════════════════════════════════
  async createSession(data) {
    return this.insert('interview_sessions', data);
  }

  async updateSession(id, updates) {
    return this.update('interview_sessions', updates, `id=eq.${id}`);
  }

  async getSessions(institutionId, limit = 50) {
    return this.select('interview_sessions',
      `institution_id=eq.${institutionId}&order=created_at.desc&limit=${limit}`
    );
  }

  async getSessionById(id) {
    const data = await this.select('interview_sessions', `id=eq.${id}`);
    return data?.[0] || null;
  }

  // ═══════════════════════════════════════
  // USAGE LOGS
  // ═══════════════════════════════════════
  async logUsage(data) {
    return this.insert('usage_logs', data);
  }

  async getUsageStats(institutionId) {
    return this.rpc('get_institution_stats', { inst_id: institutionId });
  }

  async getUsageLogs(institutionId, limit = 100) {
    return this.select('usage_logs',
      `institution_id=eq.${institutionId}&order=created_at.desc&limit=${limit}`
    );
  }

  // ═══════════════════════════════════════
  // PAYMENTS
  // ═══════════════════════════════════════
  async getPayments(institutionId) {
    return this.select('payments',
      `institution_id=eq.${institutionId}&order=created_at.desc`
    );
  }

  async createPayment(data) {
    return this.insert('payments', data);
  }

  // ═══════════════════════════════════════
  // PLATFORM CONFIG
  // ═══════════════════════════════════════
  async getConfig(key) {
    const data = await this.select('platform_config', `key=eq.${key}`);
    return data?.[0]?.value || null;
  }

  async setConfig(key, value) {
    const existing = await this.select('platform_config', `key=eq.${key}`);
    if (existing && existing.length > 0) {
      return this.update('platform_config', { value, updated_at: new Date().toISOString() }, `key=eq.${key}`);
    }
    return this.insert('platform_config', { key, value });
  }

  // ═══════════════════════════════════════
  // DASHBOARD ANALYTICS
  // ═══════════════════════════════════════
  async getDashboardStats(institutionId) {
    try {
      return await this.rpc('get_institution_stats', { inst_id: institutionId });
    } catch (e) {
      // Fallback: manual queries
      const [sessions, tokens, candidates, jobs] = await Promise.all([
        this.select('interview_sessions', `institution_id=eq.${institutionId}&select=id,overall_score,status,created_at`).catch(() => []),
        this.select('access_tokens', `institution_id=eq.${institutionId}&status=eq.pending&select=id`).catch(() => []),
        this.select('candidates', `institution_id=eq.${institutionId}&select=id`).catch(() => []),
        this.select('jobs', `institution_id=eq.${institutionId}&is_active=eq.true&select=id`).catch(() => [])
      ]);
      const completed = (sessions || []).filter(s => s.status === 'completed');
      const avgScore = completed.length > 0
        ? Math.round(completed.reduce((s, i) => s + (i.overall_score || 0), 0) / completed.length)
        : 0;
      return {
        total_interviews: (sessions || []).length,
        completed_interviews: completed.length,
        avg_score: avgScore,
        active_tokens: (tokens || []).length,
        total_candidates: (candidates || []).length,
        active_jobs: (jobs || []).length
      };
    }
  }
}

// Export singleton
window.ZelvoraDB = new ZelvoraDB();
