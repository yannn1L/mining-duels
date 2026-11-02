import { CFG } from '../data/config';
import { AUDIO_PROFS } from '../data/sfx';
import { FastMath } from './fastMath';
import { GameSettings } from '../types/game';

const SETTINGS_KEY = 'md_settings_v2';

export const SettingsService = {
  DEFAULTS: {
    shaders: true,
    sfx: true,
    sfxVol: 0.8
  } as GameSettings,

  _cache: null as GameSettings | null,

  load(): GameSettings {
    if (this._cache) return { ...this._cache };
    let loaded: GameSettings = { ...this.DEFAULTS };
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<GameSettings>;
        loaded = {
          shaders: typeof parsed.shaders === 'boolean' ? parsed.shaders : this.DEFAULTS.shaders,
          sfx: typeof parsed.sfx === 'boolean' ? parsed.sfx : this.DEFAULTS.sfx,
          sfxVol: typeof parsed.sfxVol === 'number' ? parsed.sfxVol : this.DEFAULTS.sfxVol
        };
      }
    } catch {
      loaded = { ...this.DEFAULTS };
    }
    this._cache = loaded;
    return { ...loaded };
  },

  save(settings: GameSettings): void {
    this._cache = { ...settings };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this._cache));
    } catch {
      // Ignore storage quota errors
    }
    AudioSys.applySettings(this._cache);
  }
};

class AudioSystem {
  private ctx: AudioContext | null = null;
  private lastPlay: Record<string, number> = {};
  public masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  public mutedForHeadless = false;

  private ensureContext(): AudioContext | null {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    return this.ctx;
  }

  public init(): void {
    if (this.mutedForHeadless) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if (!this.masterGain) {
      this.masterGain = ctx.createGain();
      const s = SettingsService.load();
      this.masterGain.gain.value = s.sfx ? CFG.AUDIO.MASTER_GAIN * s.sfxVol : 0;

      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.value = CFG.AUDIO.COMPRESSOR.THRESHOLD;
      this.compressor.ratio.value = CFG.AUDIO.COMPRESSOR.RATIO;

      this.masterGain.connect(this.compressor);
      this.compressor.connect(ctx.destination);
    }
  }

  public applySettings(settings: GameSettings): void {
    if (this.masterGain) {
      this.masterGain.gain.value = settings.sfx
        ? CFG.AUDIO.MASTER_GAIN * settings.sfxVol
        : 0;
    }
  }

  public play(type: string, volMult = 1): void {
    if (this.mutedForHeadless) return;
    const s = SettingsService.load();
    if (!s.sfx || s.sfxVol <= 0) return;

    this.init();
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'suspended' || !this.masterGain) return;

    const now = ctx.currentTime;
    const throttle = CFG.AUDIO.THROTTLE[type] ?? CFG.AUDIO.THROTTLE.DEFAULT;
    if (this.lastPlay[type] && now - this.lastPlay[type] < throttle) return;
    this.lastPlay[type] = now;

    const p = AUDIO_PROFS[type];
    if (!p) return;

    const gain = ctx.createGain();
    gain.connect(this.masterGain);
    const baseVol = typeof p.v === 'function' ? p.v() : p.v;
    const targetVol = Math.max(0.001, baseVol * volMult);

    if (p.noise) {
      const bufSize = Math.max(1, Math.floor(ctx.sampleRate * p.d));
      const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = FastMath.rand() * 2 - 1;

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = p.fType || 'lowpass';
      const startF = typeof p.f0 === 'function' ? p.f0() : p.f0;
      filter.frequency.setValueAtTime(startF, now);
      if (p.f1) {
        const endF = typeof p.f1 === 'function' ? p.f1(startF) : p.f1;
        filter.frequency.exponentialRampToValueAtTime(Math.max(10, endF), now + p.d);
      }
      if (p.fQ) filter.Q.value = p.fQ;

      noise.connect(filter);
      filter.connect(gain);
      gain.gain.setValueAtTime(targetVol, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + p.d);

      if (p.oF0 && p.oF1) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(p.oF0, now);
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(10, p.oF1),
          now + Math.min(0.4, p.d)
        );
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + Math.min(0.4, p.d));
      }

      noise.start(now);
      noise.stop(now + p.d);
      noise.onended = () => {
        filter.disconnect();
        gain.disconnect();
      };
    } else {
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = p.t || 'square';
      const startFreq = typeof p.f0 === 'function' ? p.f0() : p.f0;
      osc.frequency.setValueAtTime(startFreq, now);

      if (p.seq) {
        p.seq.forEach((f, i) => {
          const freq = typeof f === 'function' ? f() : f;
          osc.frequency.setValueAtTime(freq, now + (i + 1) * 0.05);
        });
      } else if (p.ramp === 'lin_exp' && p.f1 && p.f2) {
        const midFreq = typeof p.f1 === 'function' ? p.f1(startFreq) : p.f1;
        osc.frequency.linearRampToValueAtTime(midFreq, now + 0.1);
        osc.frequency.exponentialRampToValueAtTime(Math.max(10, p.f2), now + p.d);
      } else if (p.f1) {
        const endFreq = typeof p.f1 === 'function' ? p.f1(startFreq) : p.f1;
        if (p.ramp === 'lin') {
          osc.frequency.linearRampToValueAtTime(endFreq, now + p.d);
        } else {
          osc.frequency.exponentialRampToValueAtTime(Math.max(10, endFreq), now + p.d);
        }
      }

      gain.gain.setValueAtTime(
        p.ramp === 'lin_exp' || type === 'start' ? 0.001 : targetVol,
        now
      );
      if (p.ramp === 'lin_exp') {
        gain.gain.linearRampToValueAtTime(targetVol, now + 0.05);
      }
      if (type === 'start') {
        gain.gain.linearRampToValueAtTime(targetVol, now + 0.1);
      }
      gain.gain.exponentialRampToValueAtTime(0.01, now + p.d);

      if (type === 'laser') {
        const osc2 = ctx.createOscillator();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(1000, now);
        osc2.frequency.exponentialRampToValueAtTime(50, now + p.d);
        osc2.connect(gain);
        osc2.start(now);
        osc2.stop(now + p.d);
      }

      osc.start(now);
      osc.stop(now + p.d);
      osc.onended = () => {
        gain.disconnect();
      };
    }
  }
}

export const AudioSys = new AudioSystem();
