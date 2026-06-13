/* ═══════════════════════════════════════════════════════════════
   ZELVORA AI — BYOK (Bring Your Own Key) ENGINE
   Client-side key management, encryption, and provider routing
   ═══════════════════════════════════════════════════════════════ */

class BYOKEngine {
  constructor() {
    this.providers = {
      openai: {
        name: 'OpenAI',
        icon: '🧠',
        keyPrefix: 'sk-',
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3-mini'],
        defaultModel: 'gpt-4o-mini',
        testEndpoint: 'https://api.openai.com/v1/models',
        color: '#10a37f'
      },
      anthropic: {
        name: 'Anthropic',
        icon: '🔮',
        keyPrefix: 'sk-ant-',
        models: ['claude-sonnet-4-20250514', 'claude-haiku-35-20250620', 'claude-opus-4-20250514'],
        defaultModel: 'claude-sonnet-4-20250514',
        testEndpoint: 'https://api.anthropic.com/v1/messages',
        color: '#d97757'
      },
      gemini: {
        name: 'Google Gemini',
        icon: '💎',
        keyPrefix: 'AIza',
        models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
        defaultModel: 'gemini-2.5-flash',
        testEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
        color: '#4285f4'
      },
      groq: {
        name: 'Groq',
        icon: '⚡',
        keyPrefix: 'gsk_',
        models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
        defaultModel: 'llama-3.3-70b-versatile',
        testEndpoint: 'https://api.groq.com/openai/v1/models',
        color: '#f55036'
      },
      elevenlabs: {
        name: 'ElevenLabs TTS',
        icon: '🔊',
        keyPrefix: 'xi_',
        models: ['eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_flash_v2_5'],
        defaultModel: 'eleven_multilingual_v2',
        testEndpoint: 'https://api.elevenlabs.io/v1/voices',
        color: '#000000',
        isTTS: true
      },
      openai_tts: {
        name: 'OpenAI TTS',
        icon: '🗣️',
        keyPrefix: 'sk-',
        models: ['tts-1', 'tts-1-hd'],
        defaultModel: 'tts-1',
        voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
        testEndpoint: 'https://api.openai.com/v1/models',
        color: '#10a37f',
        isTTS: true
      },
      custom: {
        name: 'Custom Endpoint',
        icon: '🔧',
        keyPrefix: '',
        models: [],
        defaultModel: '',
        testEndpoint: null,
        color: '#6366f1'
      }
    };

    this._encryptionKey = null;
  }

  // ═══════════════════════════════════════
  // PROVIDER DETECTION
  // ═══════════════════════════════════════
  detectProvider(apiKey) {
    if (!apiKey) return null;
    if (apiKey.startsWith('sk-ant-')) return 'anthropic';
    if (apiKey.startsWith('sk-')) return 'openai';
    if (apiKey.startsWith('AIza')) return 'gemini';
    if (apiKey.startsWith('gsk_')) return 'groq';
    if (apiKey.startsWith('xi_')) return 'elevenlabs';
    return 'custom';
  }

  getProviderInfo(provider) {
    return this.providers[provider] || this.providers.custom;
  }

  getAllProviders() {
    return Object.entries(this.providers).map(([key, val]) => ({
      id: key,
      ...val
    }));
  }

  getLLMProviders() {
    return this.getAllProviders().filter(p => !p.isTTS && p.id !== 'custom');
  }

  getTTSProviders() {
    return this.getAllProviders().filter(p => p.isTTS);
  }

  // ═══════════════════════════════════════
  // KEY ENCRYPTION (AES-GCM via Web Crypto)
  // ═══════════════════════════════════════
  async _getEncryptionKey() {
    if (this._encryptionKey) return this._encryptionKey;
    
    // Derive key from a fixed passphrase + institution ID
    const passphrase = 'zelvora-byok-v1-' + (window.ZelvoraDB?.getInstitutionId() || 'default');
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']
    );
    
    this._encryptionKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: encoder.encode('zelvora-salt-2026'), iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    return this._encryptionKey;
  }

  async encryptKey(plainKey) {
    const key = await this._getEncryptionKey();
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(plainKey)
    );
    // Combine IV + ciphertext, encode as base64
    const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...combined));
  }

  async decryptKey(encryptedKey) {
    const key = await this._getEncryptionKey();
    const combined = Uint8Array.from(atob(encryptedKey), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  }

  getKeyHint(apiKey) {
    if (!apiKey) return '';
    if (apiKey.length <= 8) return '****';
    return apiKey.substring(0, 6) + '...' + apiKey.substring(apiKey.length - 4);
  }

  // ═══════════════════════════════════════
  // KEY VALIDATION
  // ═══════════════════════════════════════
  async validateKey(provider, apiKey) {
    const info = this.providers[provider];
    if (!info || !info.testEndpoint) {
      return { valid: false, error: 'Unknown provider' };
    }

    try {
      const headers = {};
      let url = info.testEndpoint;

      switch (provider) {
        case 'openai':
        case 'openai_tts':
          headers['Authorization'] = `Bearer ${apiKey}`;
          break;
        case 'anthropic':
          headers['x-api-key'] = apiKey;
          headers['anthropic-version'] = '2023-06-01';
          // For Anthropic, we'll do a minimal request
          url = info.testEndpoint;
          const anthRes = await fetch(url, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'Hi' }]
            })
          });
          // Even a 400 with "billing" error means the key format is valid
          return { valid: anthRes.status !== 401, error: anthRes.status === 401 ? 'Invalid API key' : null };
        case 'gemini':
          url = `${info.testEndpoint}?key=${apiKey}`;
          break;
        case 'groq':
          headers['Authorization'] = `Bearer ${apiKey}`;
          break;
        case 'elevenlabs':
          headers['xi-api-key'] = apiKey;
          break;
      }

      const res = await fetch(url, { method: 'GET', headers });
      if (res.ok || res.status === 200) {
        return { valid: true };
      }
      return { valid: false, error: `API returned ${res.status}` };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  // ═══════════════════════════════════════
  // SAVE KEY TO SUPABASE
  // ═══════════════════════════════════════
  async saveKey(provider, apiKey, preferredModel = null) {
    if (!window.ZelvoraDB?.isLoggedIn()) {
      throw new Error('Not logged in');
    }

    const institutionId = window.ZelvoraDB.getInstitutionId();
    const encryptedKey = await this.encryptKey(apiKey);
    const keyHint = this.getKeyHint(apiKey);
    const info = this.providers[provider];
    const model = preferredModel || info?.defaultModel || '';

    await window.ZelvoraDB.saveApiKey(institutionId, provider, encryptedKey, keyHint, model);
    return { success: true, hint: keyHint };
  }

  // ═══════════════════════════════════════
  // LOAD INSTITUTION'S KEYS
  // ═══════════════════════════════════════
  async loadKeys() {
    if (!window.ZelvoraDB?.isLoggedIn()) return [];
    const institutionId = window.ZelvoraDB.getInstitutionId();
    return window.ZelvoraDB.getApiKeys(institutionId);
  }

  // ═══════════════════════════════════════
  // GET PREFERRED PROVIDER CONFIG
  // ═══════════════════════════════════════
  async getPreferredConfig() {
    const keys = await this.loadKeys();
    if (!keys || keys.length === 0) return null;

    // Priority: OpenAI > Anthropic > Gemini > Groq
    const priority = ['openai', 'anthropic', 'gemini', 'groq'];
    for (const provider of priority) {
      const key = keys.find(k => k.provider === provider && k.is_active);
      if (key) {
        return {
          provider: key.provider,
          model: key.preferred_model,
          keyId: key.id,
          hint: key.key_hint,
          isBYOK: true
        };
      }
    }
    return null;
  }

  // Get TTS config
  async getTTSConfig() {
    const keys = await this.loadKeys();
    if (!keys || keys.length === 0) return null;

    const ttsKey = keys.find(k => (k.provider === 'elevenlabs' || k.provider === 'openai_tts') && k.is_active);
    if (ttsKey) {
      return {
        provider: ttsKey.provider,
        model: ttsKey.preferred_model,
        keyId: ttsKey.id,
        hint: ttsKey.key_hint,
        isBYOK: true
      };
    }
    return null;
  }
}

// Export singleton
window.BYOKEngine = new BYOKEngine();
