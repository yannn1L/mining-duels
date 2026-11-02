import { AudioProfile } from '../types/game';
import { FastMath } from '../engine/fastMath';

/**
 * Core Engine Audio Profiles
 * Minit-specific synthesizer profiles live directly inside src/data/minits/<minit>.ts
 * and are automatically registered via registerAudioProfiles().
 */
export const AUDIO_PROFS: Record<string, AudioProfile> = {
  start: { t: 'square', f0: 150, f1: 600, v: 0.15, d: 0.6, ramp: 'exp' },
  win: { t: 'sawtooth', f0: 440, seq: [554.37, 659.25], v: 0.2, d: 1.0, ramp: 'exp' },
  click: { t: 'square', f0: 400, f1: 800, v: 0.1, d: 0.05, ramp: 'exp' },
  hit: {
    t: 'square',
    f0: () => 400 + FastMath.rand() * 200,
    f1: 50,
    v: 0.05,
    d: 0.08,
    ramp: 'exp'
  },
  laser: {
    t: 'sawtooth',
    f0: () => 2000 + FastMath.rand() * 500,
    f1: 100,
    v: 0.02,
    d: 0.2,
    ramp: 'exp'
  },
  swarm: {
    t: 'square',
    f0: () => 1200 + FastMath.rand() * 800,
    seq: [
      () => 400 + FastMath.rand() * 200,
      () => 1000 + FastMath.rand() * 400
    ],
    v: 0.02,
    d: 0.15,
    ramp: 'exp'
  },
  spore: {
    t: 'sine',
    f0: () => 200 + FastMath.rand() * 100,
    f1: (f) => f + 300,
    f2: 50,
    v: 0.05,
    d: 0.25,
    ramp: 'lin_exp'
  },
  devour: { t: 'sawtooth', f0: 120, f1: 30, v: 0.4, d: 0.25, ramp: 'exp' },
  gun: {
    t: 'square',
    f0: () => 800 + FastMath.rand() * 400,
    f1: 100,
    v: 0.05,
    d: 0.05,
    ramp: 'exp'
  },
  thruster: {
    t: 'sawtooth',
    f0: () => 150 + FastMath.rand() * 50,
    f1: 50,
    v: 0.1,
    d: 0.2,
    ramp: 'lin'
  },
  bio_squish: { t: 'sine', f0: 200, f1: 50, v: 0.1, d: 0.2, ramp: 'exp' },
  snap: { t: 'sine', f0: 400, seq: [514.37, 619.25], v: 0.2, d: 1.0, ramp: 'exp' },
  crush: {
    noise: true,
    d: 0.15,
    fType: 'bandpass',
    f0: () => 600 + FastMath.rand() * 400,
    fQ: 1.5,
    v: 0.2
  },
  quake: {
    noise: true,
    d: 0.5,
    fType: 'lowpass',
    f0: 800,
    f1: 40,
    v: 0.6,
    oF0: 150,
    oF1: 20
  },
  explosion: {
    noise: true,
    d: 0.7,
    fType: 'lowpass',
    f0: 1500,
    f1: 40,
    v: 0.6,
    oF0: 150,
    oF1: 20
  },
  nuke: {
    noise: true,
    d: 0.9,
    fType: 'lowpass',
    f0: 300,
    f1: 10,
    v: 0.9,
    oF0: 80,
    oF1: 10
  }
};

export function registerAudioProfiles(profiles?: Record<string, AudioProfile>): void {
  if (!profiles) return;
  for (const [id, prof] of Object.entries(profiles)) {
    AUDIO_PROFS[id] = prof;
  }
}
