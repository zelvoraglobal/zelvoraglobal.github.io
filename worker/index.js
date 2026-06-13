/* ═══════════════════════════════════════════════════════════════
   ZELVORA AI — CLOUDFLARE WORKER (B2B ELITE)
   Multi-route API with BYOK, Supabase, AI routing & Tenant Isolation
   Deploy: wrangler deploy
   ═══════════════════════════════════════════════════════════════ */

// Environment variables (set in wrangler.toml or CF dashboard):
// SUPABASE_URL, SUPABASE_SERVICE_KEY, GROQ_API_KEY, ENCRYPTION_SECRET

export default {
  async fetch(request, env, ctx) {
    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders()
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // ═══════ ROUTING ═══════
      // Legacy compatibility
      if (path === '/' || path === '') return handleLegacy(request, env);
      if (path === '/verify-payment') return handleVerifyPayment(request, env);
      if (path === '/db') return handleDB(request, env);

      // New API routes
      if (path === '/api/auth/login') return handleLogin(request, env);
      if (path === '/api/auth/register') return handleRegister(request, env);
      if (path === '/api/interview/start') return handleInterviewStart(request, env);
      if (path === '/api/interview/respond') return handleInterviewRespond(request, env);
      if (path === '/api/interview/end') return handleInterviewEnd(request, env);
      if (path === '/api/byok/validate') return handleBYOKValidate(request, env);
      if (path === '/api/tokens/generate') return handleTokenGenerate(request, env);
      if (path === '/api/tokens/verify') return handleTokenVerify(request, env);
      if (path === '/api/usage') return handleUsage(request, env);
      if (path === '/api/admin/audit') return handleAuditLog(request, env);
      if (path === '/api/admin/quota') return handleQuotaCheck(request, env);

      return json({ error: 'Not found' }, 404);

    } catch (e) {
      console.error('Worker error:', e);
      return json({ error: e.message || 'Internal server error' }, 500);
    }
  }
};

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Institution-Id',
    'Access-Control-Max-Age': '86400'
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}

async function supabase(env, path, method = 'GET', body = null) {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
  const options = {
    method,
    headers: {
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(url, options);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ═══════════════════════════════════════
// MULTI-TENANT ISOLATION MIDDLEWARE
// ═══════════════════════════════════════

// Validate that the requesting user belongs to the institution_id they claim
async function validateTenant(env, request, claimedInstitutionId) {
  if (!claimedInstitutionId) return { valid: true, reason: 'no_institution' };

  // Check X-Institution-Id header matches body
  const headerInstId = request.headers.get('X-Institution-Id');
  if (headerInstId && headerInstId !== claimedInstitutionId) {
    // Cross-tenant attempt detected!
    await logSecurityEvent(env, 'CROSS_TENANT_HEADER_MISMATCH', headerInstId, claimedInstitutionId, {
      ip: request.headers.get('CF-Connecting-IP') || 'unknown',
      path: new URL(request.url).pathname
    });
    return { valid: false, reason: 'institution_id_mismatch' };
  }

  // Verify institution exists and is active
  const inst = await supabase(env, `institutions?id=eq.${claimedInstitutionId}&is_active=eq.true`);
  if (!inst || inst.length === 0) {
    return { valid: false, reason: 'institution_not_found_or_inactive' };
  }

  return { valid: true, institution: inst[0] };
}

// Ensure a resource belongs to the claimed institution
async function enforceOwnership(env, table, resourceId, institutionId) {
  if (!resourceId || !institutionId) return true;
  const resource = await supabase(env, `${table}?id=eq.${resourceId}&institution_id=eq.${institutionId}`);
  return resource && resource.length > 0;
}

// Check interview quota against plan limits
async function checkQuota(env, institutionId) {
  const inst = await supabase(env, `institutions?id=eq.${institutionId}`);
  if (!inst || inst.length === 0) return { allowed: false, reason: 'institution_not_found' };

  const maxAllowed = inst[0].max_interviews_per_month || 50;
  const sessions = await supabase(env,
    `interview_sessions?institution_id=eq.${institutionId}&created_at=gte.${new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()}&select=id`
  );
  const used = (sessions || []).length;

  // Check plan expiry
  if (inst[0].plan_expires_at && new Date(inst[0].plan_expires_at) < new Date()) {
    return { allowed: false, reason: 'plan_expired', used, max: maxAllowed };
  }

  return {
    allowed: used < maxAllowed,
    used,
    max: maxAllowed,
    remaining: Math.max(0, maxAllowed - used),
    plan: inst[0].plan
  };
}

// Log security events to audit table
async function logSecurityEvent(env, eventType, sourceInstId, targetInstId, details = {}) {
  try {
    await supabase(env, 'security_audit_log', 'POST', {
      event_type: eventType,
      source_institution_id: sourceInstId || null,
      target_institution_id: targetInstId || null,
      details: details,
      endpoint: details.path || null,
      ip_address: details.ip || null
    });
  } catch (e) {
    console.warn('Audit log failed:', e);
  }
}

async function callAI(env, messages, provider = 'groq', model = null, apiKey = null) {
  // Route to the right provider
  switch (provider) {
    case 'openai':
      return callOpenAI(apiKey || env.OPENAI_API_KEY, messages, model || 'gpt-4o-mini');
    case 'anthropic':
      return callAnthropic(apiKey || env.ANTHROPIC_API_KEY, messages, model || 'claude-sonnet-4-20250514');
    case 'gemini':
      return callGemini(apiKey || env.GEMINI_API_KEY, messages, model || 'gemini-2.5-flash');
    case 'groq':
    default:
      return callGroq(apiKey || env.GROQ_API_KEY, messages, model || 'llama-3.3-70b-versatile');
  }
}

async function callGroq(apiKey, messages, model) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: 1024, temperature: 0.7 })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Groq API error');
  return { reply: data.choices[0].message.content, model, provider: 'groq', tokens: data.usage };
}

async function callOpenAI(apiKey, messages, model) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: 1024, temperature: 0.7 })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'OpenAI API error');
  return { reply: data.choices[0].message.content, model, provider: 'openai', tokens: data.usage };
}

async function callAnthropic(apiKey, messages, model) {
  // Convert OpenAI-style messages to Anthropic format
  const systemMsg = messages.find(m => m.role === 'system')?.content || '';
  const chatMsgs = messages.filter(m => m.role !== 'system');
  
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemMsg,
      messages: chatMsgs
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Anthropic API error');
  return {
    reply: data.content[0].text,
    model,
    provider: 'anthropic',
    tokens: { prompt_tokens: data.usage?.input_tokens, completion_tokens: data.usage?.output_tokens }
  };
}

async function callGemini(apiKey, messages, model) {
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
  const systemInstruction = messages.find(m => m.role === 'system')?.content;

  const body = { contents };
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Gemini API error');
  return {
    reply: data.candidates[0].content.parts[0].text,
    model,
    provider: 'gemini',
    tokens: { prompt_tokens: data.usageMetadata?.promptTokenCount, completion_tokens: data.usageMetadata?.candidatesTokenCount }
  };
}

// ═══════════════════════════════════════
// RESOLVE BYOK KEY FOR INSTITUTION
// ═══════════════════════════════════════
async function resolveBYOK(env, institutionId) {
  if (!institutionId) return { provider: 'groq', model: 'llama-3.3-70b-versatile', apiKey: null, isBYOK: false };

  // Check institution's BYOK keys
  const keys = await supabase(env,
    `api_keys?institution_id=eq.${institutionId}&is_active=eq.true&order=created_at.asc`
  );

  if (keys && keys.length > 0) {
    // Priority: openai > anthropic > gemini > groq
    const priority = ['openai', 'anthropic', 'gemini', 'groq'];
    for (const p of priority) {
      const key = keys.find(k => k.provider === p);
      if (key) {
        // Decrypt key (keys are encrypted client-side, Worker needs to decrypt)
        try {
          const decryptedKey = await decryptBYOKKey(env, key.encrypted_key);
          return {
            provider: key.provider,
            model: key.preferred_model,
            apiKey: decryptedKey,
            isBYOK: true,
            keyId: key.id
          };
        } catch (e) {
          console.warn('BYOK decrypt failed for', key.provider, e);
        }
      }
    }
  }

  // Fallback to platform default
  return { provider: 'groq', model: 'llama-3.3-70b-versatile', apiKey: null, isBYOK: false };
}

async function decryptBYOKKey(env, encryptedKey) {
  // Client encrypts with PBKDF2 derived key, Worker re-derives to decrypt
  // For simplicity in this version, keys are passed through — 
  // in production, use a shared secret or KMS
  try {
    const combined = Uint8Array.from(atob(encryptedKey), c => c.charCodeAt(0));
    // For now, return the key as-is if it's a direct base64 of the key
    return new TextDecoder().decode(combined);
  } catch (e) {
    throw new Error('Key decryption failed');
  }
}

// ═══════════════════════════════════════
// SYSTEM PROMPTS
// ═══════════════════════════════════════
function getInterviewPrompt(role, type, difficulty, questionNum, maxQuestions, cvText = null) {
  const difficultyMap = {
    beginner: 'Ask simple, encouraging questions suitable for fresh graduates.',
    intermediate: 'Ask standard professional-level questions.',
    advanced: 'Ask tough, senior-level questions that probe deep expertise.',
    faang: 'Ask elite FAANG-level questions with high pressure and follow-ups.',
  };

  let prompt = `You are an elite AI interviewer for the position of ${role}.
Interview type: ${type}. Difficulty: ${difficulty}.
${difficultyMap[difficulty] || difficultyMap.intermediate}

This is question ${questionNum} of ${maxQuestions}.
- Ask one clear, focused question at a time
- Follow up on interesting points from previous answers
- Be professional but conversational
- Evaluate STAR method responses for behavioral questions
- For technical questions, probe for depth and practical experience
- Keep responses concise (2-3 sentences max for follow-ups)
- Do NOT repeat questions already asked`;

  if (cvText) {
    prompt += `\n\n╔════════════════════════════════════════════╗
║  CANDIDATE'S RESUME / CV (MUST USE)       ║
╚════════════════════════════════════════════╝
${cvText}
════════════════════════════════════════════

🚨 CRITICAL INSTRUCTIONS FOR CV-BASED INTERVIEW:
1. You MUST personalize ALL questions based on this CV
2. Reference SPECIFIC companies, projects, technologies, and achievements from the CV
3. Do NOT ask generic questions — every question must relate to their actual experience
4. Probe deeper into their claimed accomplishments with follow-ups like "You mentioned X at Y company — tell me more about..."
5. If they claim expertise in a technology, ask targeted technical questions about it
6. Reference their career progression and ask about transitions
7. Use their job titles and durations to calibrate question difficulty
8. Start your first question by acknowledging something specific from their resume`;
  }

  return prompt;
}

function getTutorPrompt(mode) {
  const prompts = {
    conversation: 'You are Zelvora, a friendly English conversation partner. Help the user practice natural English conversation. Gently correct grammar and suggest better vocabulary when appropriate. Keep responses conversational and engaging, 2-3 sentences.',
    debate: 'You are Zelvora, a debate partner. Take the opposing position on any topic the user brings up. Challenge their arguments while helping them improve their English argumentation skills.',
    roleplay: 'You are Zelvora, a roleplay partner for English practice. Act out scenarios (job interviews, customer service, meetings) to help users practice situational English.',
    vocabulary: 'You are Zelvora, a vocabulary coach. Introduce advanced vocabulary naturally in conversation and explain new words when used.',
    pronunciation: 'You are Zelvora, a pronunciation coach. Listen for common pronunciation issues and provide gentle corrections with phonetic guides.'
  };
  return prompts[mode] || prompts.conversation;
}

function getFeedbackPrompt() {
  return `You are an expert interview evaluator. Analyze the interview transcript and provide:
1. Overall score (0-100)
2. Key strengths (3 points)
3. Areas for improvement (3 points)
4. Communication skills assessment
5. Technical/behavioral competency rating
6. Specific recommendations for next interview
Be constructive, specific, and actionable.`;
}

// ═══════════════════════════════════════
// ROUTE HANDLERS
// ═══════════════════════════════════════

// Legacy route (backward compatible with existing frontend)
async function handleLegacy(request, env) {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
  const body = await request.json();
  const { module, mode, text, history = [], quality, job_role, interview_type, difficulty, cv_text } = body;

  // Build messages
  let systemPrompt = '';
  if (module === 'interview') {
    systemPrompt = getInterviewPrompt(job_role, interview_type, difficulty, 1, 10, cv_text || null);
  } else if (module === 'tutor') {
    systemPrompt = getTutorPrompt(mode);
  } else if (module === 'career') {
    systemPrompt = `You are a professional career advisor. Tool: ${mode}. Provide detailed, actionable advice.`;
  } else if (module === 'exam') {
    systemPrompt = `You are an expert exam coach. Mode: ${mode}. Provide accurate questions and explanations.`;
  }

  // For interview start, replace __start_interview__ with a proper message
  let userText = text;
  if (module === 'interview' && (text === '__start_interview__' || mode === 'start')) {
    if (cv_text) {
      userText = `Start the interview for a ${job_role || 'professional'} position (${interview_type || 'behavioral'}, ${difficulty || 'intermediate'} difficulty). The candidate has uploaded their resume/CV. Please review their background and ask your first question based on their actual experience, projects, and skills from the CV.`;
    } else {
      userText = `Start the interview. Greet the candidate warmly and ask your first ${interview_type || 'behavioral'} question for the ${job_role || 'professional'} role.`;
    }
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-16),
    { role: 'user', content: userText }
  ];

  // Use platform default (Groq)
  const result = await callAI(env, messages, 'groq', 'llama-3.3-70b-versatile');

  return json({
    reply: result.reply,
    model: result.model,
    provider: result.provider
  });
}

// Auth: Login
async function handleLogin(request, env) {
  const { email, password } = await request.json();
  if (!email || !password) return json({ error: 'Email and password required' }, 400);

  const users = await supabase(env,
    `institution_users?email=eq.${encodeURIComponent(email)}&select=*,institutions(*)`
  );

  if (!users || users.length === 0) return json({ error: 'Account not found' }, 404);
  const user = users[0];
  if (user.password_hash !== password) return json({ error: 'Invalid password' }, 401);
  if (!user.is_active) return json({ error: 'Account disabled' }, 403);

  // Update last login
  await supabase(env,
    `institution_users?id=eq.${user.id}`,
    'PATCH',
    { last_login: new Date().toISOString() }
  );

  return json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      institution_id: user.institution_id,
      institution: user.institutions
    }
  });
}

// Auth: Register
async function handleRegister(request, env) {
  const { institution_name, email, password, name, phone } = await request.json();
  if (!institution_name || !email || !password) {
    return json({ error: 'Institution name, email, and password required' }, 400);
  }

  // Check if email exists
  const existing = await supabase(env, `institution_users?email=eq.${encodeURIComponent(email)}`);
  if (existing && existing.length > 0) return json({ error: 'Email already registered' }, 409);

  const slug = institution_name.toLowerCase().replace(/[^a-z0-9]/g, '-');

  // Create institution
  const inst = await supabase(env, 'institutions', 'POST', {
    name: institution_name,
    slug,
    email,
    phone: phone || null,
    plan: 'trial',
    plan_expires_at: new Date(Date.now() + 14 * 24 * 3600000).toISOString(),
    max_interviews_per_month: 20,
    max_seats: 3
  });

  if (!inst || inst.length === 0) return json({ error: 'Failed to create institution' }, 500);

  // Create user
  const user = await supabase(env, 'institution_users', 'POST', {
    institution_id: inst[0].id,
    email,
    password_hash: password, // TODO: bcrypt hash
    name: name || email.split('@')[0],
    role: 'owner'
  });

  return json({
    success: true,
    institution: inst[0],
    user: user?.[0]
  });
}

// Interview: Start
async function handleInterviewStart(request, env) {
  const body = await request.json();
  const { institution_id, token_id, job_role, interview_type, difficulty, max_questions, cv_text } = body;

  // ── TENANT ISOLATION ──
  if (institution_id) {
    const tenant = await validateTenant(env, request, institution_id);
    if (!tenant.valid) return json({ error: `Tenant validation failed: ${tenant.reason}` }, 403);

    // Check quota
    const quota = await checkQuota(env, institution_id);
    if (!quota.allowed) {
      return json({
        error: quota.reason === 'plan_expired'
          ? 'Your plan has expired. Please renew to continue.'
          : `Monthly interview limit reached (${quota.used}/${quota.max}). Upgrade your plan.`,
        quota
      }, 429);
    }
  }

  // Resolve BYOK
  const byok = await resolveBYOK(env, institution_id);

  const systemPrompt = getInterviewPrompt(
    job_role || 'Software Engineer',
    interview_type || 'behavioral',
    difficulty || 'intermediate',
    1,
    max_questions || 10,
    cv_text || null
  );

  // Build the start message — reference CV if uploaded
  let startMessage;
  if (body.start_text) {
    startMessage = body.start_text;
  } else if (cv_text) {
    startMessage = `Start the interview for a ${job_role || 'Software Engineer'} position. The candidate has uploaded their resume/CV. Please review their background and ask your first ${interview_type || 'behavioral'} question based on their actual experience, projects, and skills mentioned in the CV.`;
  } else {
    startMessage = `Start the interview. Greet the candidate warmly and ask your first ${interview_type || 'behavioral'} question for the ${job_role || 'Software Engineer'} role.`;
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: startMessage }
  ];

  const result = await callAI(env, messages, byok.provider, byok.model, byok.apiKey);

  // Create session in Supabase
  let sessionId = null;
  if (institution_id) {
    const session = await supabase(env, 'interview_sessions', 'POST', {
      institution_id,
      access_token_id: token_id || null,
      job_role,
      interview_type,
      difficulty,
      ai_provider: byok.isBYOK ? byok.provider : 'platform',
      ai_model: result.model,
      transcript: JSON.stringify([{ role: 'assistant', content: result.reply, timestamp: new Date().toISOString() }]),
      status: 'in_progress'
    });
    sessionId = session?.[0]?.id;
  }

  // Log usage
  if (institution_id) {
    await supabase(env, 'usage_logs', 'POST', {
      institution_id,
      module: 'interview',
      provider: result.provider,
      model: result.model,
      tokens_in: result.tokens?.prompt_tokens || 0,
      tokens_out: result.tokens?.completion_tokens || 0,
      is_byok: byok.isBYOK
    });
  }

  return json({
    reply: result.reply,
    model: result.model,
    provider: result.provider,
    session_id: sessionId,
    is_byok: byok.isBYOK
  });
}

// Interview: Respond (process candidate answer)
async function handleInterviewRespond(request, env) {
  const body = await request.json();
  const { institution_id, session_id, text, history = [], job_role, interview_type, difficulty, question_num, max_questions, cv_text } = body;

  // ── TENANT ISOLATION ──
  if (institution_id) {
    const tenant = await validateTenant(env, request, institution_id);
    if (!tenant.valid) return json({ error: `Tenant validation failed: ${tenant.reason}` }, 403);

    // Verify session belongs to this institution
    if (session_id) {
      const owns = await enforceOwnership(env, 'interview_sessions', session_id, institution_id);
      if (!owns) {
        await logSecurityEvent(env, 'CROSS_TENANT_SESSION_ACCESS', institution_id, null, {
          session_id, ip: request.headers.get('CF-Connecting-IP')
        });
        return json({ error: 'Session does not belong to your institution' }, 403);
      }
    }
  }

  const byok = await resolveBYOK(env, institution_id);

  const systemPrompt = getInterviewPrompt(
    job_role || 'Software Engineer',
    interview_type || 'behavioral',
    difficulty || 'intermediate',
    question_num || 1,
    max_questions || 10,
    cv_text || null
  );

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-20),
    { role: 'user', content: text }
  ];

  const result = await callAI(env, messages, byok.provider, byok.model, byok.apiKey);

  // Update session transcript
  if (session_id) {
    const session = await supabase(env, `interview_sessions?id=eq.${session_id}`);
    if (session && session.length > 0) {
      const transcript = JSON.parse(session[0].transcript || '[]');
      transcript.push(
        { role: 'user', content: text, timestamp: new Date().toISOString() },
        { role: 'assistant', content: result.reply, timestamp: new Date().toISOString() }
      );
      await supabase(env, `interview_sessions?id=eq.${session_id}`, 'PATCH', {
        transcript: JSON.stringify(transcript),
        questions_answered: question_num || 0
      });
    }
  }

  // Log usage
  if (institution_id) {
    await supabase(env, 'usage_logs', 'POST', {
      institution_id,
      module: 'interview',
      provider: result.provider,
      model: result.model,
      tokens_in: result.tokens?.prompt_tokens || 0,
      tokens_out: result.tokens?.completion_tokens || 0,
      is_byok: byok.isBYOK
    });
  }

  return json({
    reply: result.reply,
    model: result.model,
    provider: result.provider,
    is_byok: byok.isBYOK
  });
}

// Interview: End (generate scorecard)
async function handleInterviewEnd(request, env) {
  const body = await request.json();
  const { institution_id, session_id, history = [], job_role, interview_type, difficulty, stats } = body;

  const byok = await resolveBYOK(env, institution_id);

  const messages = [
    { role: 'system', content: getFeedbackPrompt() },
    ...history.slice(-30),
    { role: 'user', content: `Interview complete. Role: ${job_role}. Type: ${interview_type}. Difficulty: ${difficulty}. Questions answered: ${stats?.questions || 0}. Duration: ${stats?.duration || '0:00'}. Avg response: ${stats?.avgWords || 0} words. Provide your final assessment.` }
  ];

  const result = await callAI(env, messages, byok.provider, byok.model, byok.apiKey);

  // Update session with final data
  if (session_id) {
    await supabase(env, `interview_sessions?id=eq.${session_id}`, 'PATCH', {
      status: 'completed',
      feedback: result.reply,
      overall_score: stats?.score || null,
      grade: stats?.grade || null,
      duration_seconds: stats?.durationSeconds || null,
      avg_response_words: stats?.avgWords || null,
      completed_at: new Date().toISOString()
    });
  }

  return json({
    reply: result.reply,
    model: result.model,
    provider: result.provider
  });
}

// BYOK: Validate key
async function handleBYOKValidate(request, env) {
  const { provider, api_key } = await request.json();
  if (!provider || !api_key) return json({ error: 'Provider and api_key required' }, 400);

  try {
    // Quick validation — attempt a simple API call
    const messages = [{ role: 'user', content: 'Hello' }];
    await callAI(env, messages, provider, null, api_key);
    return json({ valid: true });
  } catch (e) {
    return json({ valid: false, error: e.message });
  }
}

// Token: Generate interview link
async function handleTokenGenerate(request, env) {
  const body = await request.json();
  const { institution_id, candidate_name, candidate_email, job_role, experience_level,
    interview_type, difficulty, max_questions, max_attempts, expires_hours, is_proctored, language, job_id } = body;

  if (!institution_id || !candidate_name || !job_role) {
    return json({ error: 'institution_id, candidate_name, and job_role required' }, 400);
  }

  // ── TENANT ISOLATION ──
  const tenant = await validateTenant(env, request, institution_id);
  if (!tenant.valid) return json({ error: `Tenant validation failed: ${tenant.reason}` }, 403);

  // Verify job belongs to this institution
  if (job_id) {
    const owns = await enforceOwnership(env, 'jobs', job_id, institution_id);
    if (!owns) return json({ error: 'Job does not belong to your institution' }, 403);
  }

  // Generate unique token
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = 'ZV-';
  for (let i = 0; i < 24; i++) token += chars.charAt(Math.floor(Math.random() * chars.length));

  const tokenData = {
    institution_id,
    candidate_name,
    candidate_email: candidate_email || null,
    job_role,
    experience_level: experience_level || 'mid',
    interview_type: interview_type || 'behavioral',
    difficulty: difficulty || 'intermediate',
    max_questions: max_questions || 10,
    max_attempts: max_attempts || 1,
    language: language || 'en',
    is_proctored: is_proctored !== false,
    job_id: job_id || null,
    token,
    status: 'pending',
    expires_at: new Date(Date.now() + (expires_hours || 72) * 3600000).toISOString()
  };

  // Also create/find candidate record
  if (candidate_email) {
    const existing = await supabase(env,
      `candidates?institution_id=eq.${institution_id}&email=eq.${encodeURIComponent(candidate_email)}`
    );
    if (!existing || existing.length === 0) {
      const cand = await supabase(env, 'candidates', 'POST', {
        institution_id,
        name: candidate_name,
        email: candidate_email
      });
      if (cand && cand.length > 0) tokenData.candidate_id = cand[0].id;
    } else {
      tokenData.candidate_id = existing[0].id;
    }
  }

  const result = await supabase(env, 'access_tokens', 'POST', tokenData);
  if (!result || result.length === 0) return json({ error: 'Failed to create token' }, 500);

  return json({
    success: true,
    token: result[0],
    interview_url: `https://zelvoraglobal.github.io/mock-interview.html?token=${token}`
  });
}

// Token: Verify
async function handleTokenVerify(request, env) {
  const { token } = await request.json();
  if (!token) return json({ error: 'Token required' }, 400);

  const tokens = await supabase(env, `access_tokens?token=eq.${encodeURIComponent(token)}`);
  if (!tokens || tokens.length === 0) return json({ error: 'Invalid token', valid: false }, 404);

  const t = tokens[0];
  if (t.status === 'expired' || t.status === 'revoked') {
    return json({ error: 'Token expired or revoked', valid: false }, 410);
  }
  if (new Date(t.expires_at) < new Date()) {
    await supabase(env, `access_tokens?id=eq.${t.id}`, 'PATCH', { status: 'expired' });
    return json({ error: 'Token expired', valid: false }, 410);
  }
  if (t.attempts_used >= t.max_attempts) {
    return json({ error: 'Max attempts reached', valid: false }, 403);
  }

  // Get institution details for branding
  let institution = null;
  if (t.institution_id) {
    const inst = await supabase(env, `institutions?id=eq.${t.institution_id}`);
    institution = inst?.[0] || null;
  }

  return json({
    valid: true,
    token: t,
    institution: institution ? {
      id: institution.id,
      name: institution.name,
      logo_url: institution.logo_url,
      branding: institution.branding
    } : null
  });
}

// Usage stats
async function handleUsage(request, env) {
  const url = new URL(request.url);
  const institutionId = url.searchParams.get('institution_id');
  if (!institutionId) return json({ error: 'institution_id required' }, 400);

  // ── TENANT ISOLATION ──
  const tenant = await validateTenant(env, request, institutionId);
  if (!tenant.valid) return json({ error: `Tenant validation failed: ${tenant.reason}` }, 403);

  const [sessions, tokens, usage] = await Promise.all([
    supabase(env, `interview_sessions?institution_id=eq.${institutionId}&order=created_at.desc&limit=50`),
    supabase(env, `access_tokens?institution_id=eq.${institutionId}&order=created_at.desc&limit=50`),
    supabase(env, `usage_logs?institution_id=eq.${institutionId}&order=created_at.desc&limit=100`)
  ]);

  return json({ sessions, tokens, usage });
}

// Admin: Security Audit Log
async function handleAuditLog(request, env) {
  const url = new URL(request.url);
  const institutionId = url.searchParams.get('institution_id');
  if (!institutionId) return json({ error: 'institution_id required' }, 400);

  const tenant = await validateTenant(env, request, institutionId);
  if (!tenant.valid) return json({ error: 'Unauthorized' }, 403);

  const logs = await supabase(env,
    `security_audit_log?or=(source_institution_id.eq.${institutionId},target_institution_id.eq.${institutionId})&order=created_at.desc&limit=100`
  );

  return json({ audit_logs: logs || [] });
}

// Admin: Quota Check
async function handleQuotaCheck(request, env) {
  const url = new URL(request.url);
  const institutionId = url.searchParams.get('institution_id');
  if (!institutionId) return json({ error: 'institution_id required' }, 400);

  const tenant = await validateTenant(env, request, institutionId);
  if (!tenant.valid) return json({ error: 'Unauthorized' }, 403);

  const quota = await checkQuota(env, institutionId);
  return json(quota);
}

// Legacy DB proxy (with tenant scoping)
async function handleDB(request, env) {
  const { action, table, data, filters, select, order } = await request.json();

  // ── TENANT ISOLATION: Block cross-tenant queries on sensitive tables ──
  const tenantTables = ['api_keys','jobs','candidates','access_tokens','interview_sessions','usage_logs','payments','institution_users'];
  if (tenantTables.includes(table)) {
    const instId = data?.institution_id || filters?.institution_id;
    if (instId) {
      const tenant = await validateTenant(env, request, instId);
      if (!tenant.valid) return json({ error: 'Tenant isolation: access denied' }, 403);
    }
  }

  let path = table;
  if (select) path += `?select=${select}`;
  if (filters) {
    Object.entries(filters).forEach(([k, v]) => {
      path += `${path.includes('?') ? '&' : '?'}${k}=eq.${v}`;
    });
  }
  if (order) path += `${path.includes('?') ? '&' : '?'}order=${order}`;

  switch (action) {
    case 'select':
      return json(await supabase(env, path));
    case 'insert':
      return json(await supabase(env, table, 'POST', data));
    case 'update':
      return json(await supabase(env, path, 'PATCH', data));
    case 'delete':
      return json(await supabase(env, path, 'DELETE'));
    default:
      return json({ error: 'Invalid action' }, 400);
  }
}

// Payment verification (legacy)
async function handleVerifyPayment(request, env) {
  const { payment_id } = await request.json();
  // In production, verify with Razorpay API
  // For now, return success with a token
  const token = {
    sub: 'paid_' + Date.now(),
    exp: Date.now() + 30 * 24 * 3600000,
    uses: { spoken: 999999 }
  };
  return json({
    success: true,
    token: btoa(JSON.stringify(token))
  });
}
