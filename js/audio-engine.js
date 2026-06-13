/* ═══════════════════════════════════════════════════════════════
   ZELVORA AI — ELITE AUDIO ENGINE
   Full-duplex audio with Web Audio API visualizer,
   Premium TTS via BYOK, and enhanced STT
   ═══════════════════════════════════════════════════════════════ */

class ZelvoraAudioEngine {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.mediaStream = null;
    this.animationId = null;
    this.isRecording = false;
    this.isSpeaking = false;

    // TTS state
    this.ttsQueue = [];
    this.currentAudio = null;
    this.ttsProvider = 'browser'; // browser | elevenlabs | openai_tts
    this.ttsConfig = null;

    // Callbacks
    this.onVisualize = null;
    this.onSpeakStart = null;
    this.onSpeakEnd = null;
  }

  // ═══════════════════════════════════════
  // AUDIO CONTEXT & MIC
  // ═══════════════════════════════════════
  async initAudio() {
    if (this.audioContext) return;
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;
  }

  async getMicStream() {
    if (this.mediaStream) return this.mediaStream;
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        }
      });
      await this.initAudio();
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.analyser);
      return this.mediaStream;
    } catch (e) {
      console.error('Microphone access denied:', e);
      throw e;
    }
  }

  // ═══════════════════════════════════════
  // CANVAS WAVEFORM VISUALIZER
  // ═══════════════════════════════════════
  startVisualization(canvas) {
    if (!this.analyser || !canvas) return;
    const ctx = canvas.getContext('2d');
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const width = canvas.width;
    const height = canvas.height;

    const draw = () => {
      this.animationId = requestAnimationFrame(draw);
      this.analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, width, height);

      // Background glow
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, 'rgba(99, 102, 241, 0.05)');
      gradient.addColorStop(0.5, 'rgba(34, 211, 238, 0.05)');
      gradient.addColorStop(1, 'rgba(168, 85, 247, 0.05)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      const barCount = 48;
      const barWidth = (width / barCount) * 0.6;
      const barGap = (width / barCount) * 0.4;
      const centerY = height / 2;

      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor(i * bufferLength / barCount);
        const value = dataArray[dataIndex];
        const barHeight = (value / 255) * (height * 0.8);
        const x = i * (barWidth + barGap) + barGap / 2;

        // Create gradient for each bar
        const barGrad = ctx.createLinearGradient(x, centerY - barHeight / 2, x, centerY + barHeight / 2);
        if (this.isSpeaking) {
          barGrad.addColorStop(0, 'rgba(16, 185, 129, 0.9)');
          barGrad.addColorStop(1, 'rgba(16, 185, 129, 0.3)');
        } else if (this.isRecording) {
          barGrad.addColorStop(0, 'rgba(239, 68, 68, 0.9)');
          barGrad.addColorStop(1, 'rgba(239, 68, 68, 0.3)');
        } else {
          barGrad.addColorStop(0, 'rgba(99, 102, 241, 0.8)');
          barGrad.addColorStop(1, 'rgba(34, 211, 238, 0.3)');
        }

        ctx.fillStyle = barGrad;
        const minHeight = 2;
        const h = Math.max(barHeight, minHeight);

        // Draw mirrored bars from center
        ctx.beginPath();
        ctx.roundRect(x, centerY - h / 2, barWidth, h, barWidth / 2);
        ctx.fill();
      }

      if (this.onVisualize) this.onVisualize(dataArray);
    };

    draw();
  }

  stopVisualization() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  // ═══════════════════════════════════════
  // PREMIUM TTS (BYOK — ElevenLabs/OpenAI)
  // ═══════════════════════════════════════
  async initTTS() {
    if (!window.BYOKEngine) {
      this.ttsProvider = 'browser';
      return;
    }

    const ttsConfig = await window.BYOKEngine.getTTSConfig();
    if (ttsConfig) {
      this.ttsProvider = ttsConfig.provider;
      this.ttsConfig = ttsConfig;
    } else {
      this.ttsProvider = 'browser';
    }
  }

  async speak(text, options = {}) {
    if (!text) return;
    this.isSpeaking = true;
    if (this.onSpeakStart) this.onSpeakStart();

    try {
      switch (this.ttsProvider) {
        case 'elevenlabs':
          await this._speakElevenLabs(text, options);
          break;
        case 'openai_tts':
          await this._speakOpenAI(text, options);
          break;
        default:
          await this._speakBrowser(text, options);
      }
    } catch (e) {
      console.warn('TTS error, falling back to browser:', e);
      await this._speakBrowser(text, options);
    }

    this.isSpeaking = false;
    if (this.onSpeakEnd) this.onSpeakEnd();
  }

  async _speakElevenLabs(text, options = {}) {
    if (!this.ttsConfig) throw new Error('No ElevenLabs config');
    const apiKey = await window.BYOKEngine.decryptKey(
      (await window.BYOKEngine.loadKeys()).find(k => k.provider === 'elevenlabs')?.encrypted_key
    );
    if (!apiKey) throw new Error('No ElevenLabs key');

    const voiceId = options.voiceId || 'EXAVITQu4vr4xnSDxMaL'; // Default: Bella
    const model = this.ttsConfig.model || 'eleven_multilingual_v2';

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: {
          stability: options.stability || 0.5,
          similarity_boost: options.similarity || 0.75,
          style: options.style || 0.0,
          use_speaker_boost: true
        }
      })
    });

    if (!res.ok) throw new Error(`ElevenLabs error: ${res.status}`);
    const audioBlob = await res.blob();
    await this._playAudioBlob(audioBlob);
  }

  async _speakOpenAI(text, options = {}) {
    const keys = await window.BYOKEngine.loadKeys();
    const openaiKey = keys.find(k => k.provider === 'openai' || k.provider === 'openai_tts');
    if (!openaiKey) throw new Error('No OpenAI key');
    const apiKey = await window.BYOKEngine.decryptKey(openaiKey.encrypted_key);

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model || 'tts-1',
        input: text,
        voice: options.voice || 'nova',
        speed: options.speed || 1.0
      })
    });

    if (!res.ok) throw new Error(`OpenAI TTS error: ${res.status}`);
    const audioBlob = await res.blob();
    await this._playAudioBlob(audioBlob);
  }

  async _playAudioBlob(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      this.currentAudio = new Audio(url);
      this.currentAudio.onended = () => {
        URL.revokeObjectURL(url);
        this.currentAudio = null;
        resolve();
      };
      this.currentAudio.onerror = (e) => {
        URL.revokeObjectURL(url);
        this.currentAudio = null;
        reject(e);
      };
      this.currentAudio.play();
    });
  }

  _speakBrowser(text, options = {}) {
    return new Promise((resolve) => {
      speechSynthesis.cancel();
      const rate = options.rate || 0.92;
      const pitch = options.pitch || 1.0;
      const voice = options.voice || null;

      if (text.length > 200) {
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        let i = 0;
        const next = () => {
          if (i >= sentences.length) { resolve(); return; }
          const u = new SpeechSynthesisUtterance(sentences[i].trim());
          if (voice) u.voice = voice;
          // Natural cadence — slight variation per sentence
          u.rate = rate + (Math.random() * 0.06 - 0.03);
          u.pitch = pitch + (Math.random() * 0.04 - 0.02);
          u.volume = 1;
          u.onend = () => {
            i++;
            // Natural pause between sentences (150-350ms)
            setTimeout(next, 150 + Math.random() * 200);
          };
          u.onerror = () => { i++; next(); };
          speechSynthesis.speak(u);
        };
        next();
      } else {
        const u = new SpeechSynthesisUtterance(text);
        if (voice) u.voice = voice;
        u.rate = rate;
        u.pitch = pitch;
        u.volume = 1;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        speechSynthesis.speak(u);
      }
    });
  }

  stopSpeaking() {
    speechSynthesis.cancel();
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    this.isSpeaking = false;
  }

  // ═══════════════════════════════════════
  // FULL-DUPLEX HELPERS
  // ═══════════════════════════════════════
  canInterrupt() {
    return this.isSpeaking;
  }

  interrupt() {
    if (this.isSpeaking) {
      this.stopSpeaking();
      return true;
    }
    return false;
  }

  // ═══════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════
  destroy() {
    this.stopVisualization();
    this.stopSpeaking();
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

// Export singleton
window.ZelvoraAudio = new ZelvoraAudioEngine();
