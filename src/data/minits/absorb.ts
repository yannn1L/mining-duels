import { MinitDef } from '../../types/game';
import { CFG } from '../config';
import { FastMath } from '../../engine/fastMath';
import { Archetype } from '../../engine/blueprint';

export interface AbsorbConfig {
  baseDmg: number;
  scaling: number;
  shake: number;
  flash: number;
  baseRange: number;
  rangeScale: number;
  baseTargets: number;
  targetScale: number;
  maxTargets: number;
  pullLife: number;
}

export interface AbsorbState {
  ringPhase: number;
}

export const absorbMinit: MinitDef<AbsorbConfig, AbsorbState> = {
  id: 'absorb',
  name: 'ABSORB',
  role: 'Scaling Vortex',
  color: 0xff4422,
  roam: 0.05,
  cd: 15,
  desc: 'Inhales nearby blocks and scales damage, range, and size with every block devoured.',

  config: {
    baseDmg: 20,
    scaling: 1.5,
    shake: 3,
    flash: 0.1,
    baseRange: 1,
    rangeScale: 0.025,
    baseTargets: 3,
    targetScale: 0.027,
    maxTargets: 30,
    pullLife: 15
  },

  audio: {
    absorb_devour: { t: 'sawtooth', f0: 120, f1: 30, v: 0.4, d: 0.25, ramp: 'exp' }
  },

  textures: {
    base: (g) => {
      g.lineStyle(0);
      const pixels: Array<[number, number, number, number, number]> = [
        [-3, -9, 6, 0x000000, 0.9], [-5, -8, 10, 0x000000, 0.9], [-6, -7, 3, 0x000000, 0.9],
        [-2, -7, 5, 0xff4422, 1.0], [3, -7, 3, 0x000000, 0.9], [-7, -6, 3, 0x000000, 0.9],
        [-4, -6, 2, 0xff4422, 1.0], [-2, -6, 2, 0xffc8bd, 1.0], [0, -6, 1, 0x000000, 0.7],
        [1, -6, 3, 0xff4422, 1.0], [4, -6, 3, 0x000000, 0.9], [-8, -5, 3, 0x000000, 0.9],
        [-5, -5, 3, 0xff4422, 1.0], [-2, -5, 2, 0x000000, 0.91], [0, -5, 2, 0x000000, 0.7],
        [2, -5, 3, 0xff4422, 1.0], [5, -5, 3, 0x000000, 0.9], [-8, -4, 2, 0x000000, 0.9],
        [-6, -4, 3, 0xff4422, 1.0], [-3, -4, 3, 0x000000, 0.91], [0, -4, 4, 0x000000, 0.7],
        [4, -4, 2, 0xff4422, 1.0], [6, -4, 2, 0x000000, 0.9], [-9, -3, 2, 0x000000, 0.9],
        [-7, -3, 3, 0xff4422, 1.0], [-4, -3, 2, 0x000000, 0.91], [-2, -3, 1, 0x000000, 0.99],
        [-1, -3, 1, 0x000000, 0.91], [0, -3, 1, 0x000000, 0.7], [1, -3, 1, 0x000000, 0.91],
        [2, -3, 2, 0x000000, 0.7], [4, -3, 3, 0xff4422, 1.0], [7, -3, 2, 0x000000, 0.9],
        [-9, -2, 2, 0x000000, 0.9], [-7, -2, 2, 0xff4422, 1.0], [-5, -2, 1, 0x000000, 0.7],
        [-4, -2, 1, 0x000000, 0.91], [-3, -2, 1, 0x000000, 0.99], [-2, -2, 1, 0x000000, 1.0],
        [-1, -2, 1, 0xfefefe, 1.0], [0, -2, 1, 0xe9e9e9, 1.0], [1, -2, 1, 0xb3b3b3, 1.0],
        [2, -2, 1, 0x000000, 0.91], [3, -2, 2, 0x000000, 0.7], [5, -2, 2, 0xff4422, 1.0],
        [7, -2, 2, 0x000000, 0.9], [-9, -1, 2, 0x000000, 0.9], [-7, -1, 2, 0xff4422, 1.0],
        [-5, -1, 2, 0x000000, 0.91], [-3, -1, 1, 0x000000, 0.97], [-2, -1, 1, 0xfefefe, 1.0],
        [-1, -1, 1, 0xf8f8f8, 1.0], [0, -1, 2, 0xb3b3b3, 1.0], [2, -1, 3, 0x000000, 0.7],
        [5, -1, 2, 0xff4422, 1.0], [7, -1, 2, 0x000000, 0.9], [-9, 0, 2, 0x000000, 0.9],
        [-7, 0, 2, 0xff4422, 1.0], [-5, 0, 2, 0x000000, 0.91], [-3, 0, 1, 0x000000, 0.7],
        [-2, 0, 1, 0xe9e9e9, 1.0], [-1, 0, 1, 0xb3b3b3, 1.0], [0, 0, 1, 0x000000, 1.0],
        [1, 0, 1, 0xb3b3b3, 1.0], [2, 0, 3, 0x000000, 0.7], [5, 0, 2, 0xff4422, 1.0],
        [7, 0, 2, 0x000000, 0.9], [-9, 1, 2, 0x000000, 0.9], [-7, 1, 1, 0xff4422, 1.0],
        [-6, 1, 1, 0xffc8bd, 1.0], [-5, 1, 1, 0x000000, 0.91], [-3, 1, 1, 0x000000, 0.7],
        [-2, 1, 4, 0xb3b3b3, 1.0], [2, 1, 1, 0x000000, 0.91], [3, 1, 2, 0x000000, 0.7],
        [5, 1, 2, 0xff4422, 1.0], [7, 1, 2, 0x000000, 0.9], [-9, 2, 2, 0x000000, 0.9],
        [-6, 2, 2, 0xffefec, 1.0], [-2, 2, 3, 0x000000, 0.7], [1, 2, 1, 0x000000, 0.91],
        [2, 2, 2, 0x000000, 0.7], [4, 2, 2, 0xff4422, 1.0], [7, 2, 2, 0x000000, 0.9],
        [-8, 3, 2, 0x000000, 0.9], [-6, 3, 1, 0xffefec, 1.0], [-5, 3, 1, 0xff4422, 1.0],
        [0, 3, 3, 0x000000, 0.7], [3, 3, 3, 0xff4422, 1.0], [6, 3, 2, 0x000000, 0.9],
        [-8, 4, 3, 0x000000, 0.9], [-5, 4, 2, 0xff4422, 1.0], [0, 4, 2, 0x000000, 0.7],
        [3, 4, 2, 0xff4422, 1.0], [5, 4, 3, 0x000000, 0.9], [-7, 5, 1, 0x000000, 1.0],
        [-6, 5, 2, 0x000000, 0.9], [-4, 5, 2, 0xff4422, 1.0], [3, 5, 1, 0xff4422, 1.0],
        [4, 5, 3, 0x000000, 0.9], [-6, 6, 3, 0x000000, 0.9], [-2, 6, 1, 0xff4422, 1.0],
        [2, 6, 1, 0xff4422, 1.0], [3, 6, 3, 0x000000, 0.9], [-5, 7, 3, 0x000000, 0.9],
        [2, 7, 3, 0x000000, 0.9]
      ];
      for (const d of pixels) {
        g.beginFill(d[3], d[4]).drawRect(d[0], d[1], d[2], 1).endFill();
      }
    }
  },

  vfx: {
    vortex_ring: (g) => {
      g.lineStyle(0);
      const pixels: Array<[number, number, number, number, number]> = [
        [-5, -14, 10, 0x030303, 0.3], [-7, -13, 2, 0x030303, 0.3], [5, -13, 2, 0x030303, 0.3],
        [-9, -12, 2, 0x030303, 0.3], [7, -12, 2, 0x030303, 0.3], [-10, -11, 2, 0x030303, 0.3],
        [8, -11, 2, 0x030303, 0.3], [-11, -10, 1, 0x030303, 0.3], [-4, -10, 8, 0xff4421, 0.6],
        [10, -10, 1, 0x030303, 0.3], [-12, -9, 2, 0x030303, 0.3], [-6, -9, 2, 0xff4421, 0.6],
        [4, -9, 2, 0xff4421, 0.6], [10, -9, 2, 0x030303, 0.3], [-12, -8, 1, 0x030303, 0.3],
        [-7, -8, 1, 0xff4421, 0.6], [6, -8, 1, 0xff4421, 0.6], [11, -8, 1, 0x030303, 0.3],
        [-13, -7, 1, 0x030303, 0.3], [-8, -7, 1, 0xff4421, 0.6], [7, -7, 1, 0xff4421, 0.6],
        [12, -7, 1, 0x030303, 0.3], [-13, -6, 1, 0x030303, 0.3], [-9, -6, 1, 0xff4421, 0.6],
        [8, -6, 1, 0xff4421, 0.6], [12, -6, 1, 0x030303, 0.3], [-14, -5, 1, 0x030303, 0.3],
        [-9, -5, 1, 0xff4421, 0.6], [8, -5, 1, 0xff4421, 0.6], [13, -5, 1, 0x030303, 0.3],
        [-14, -4, 1, 0x030303, 0.3], [-10, -4, 1, 0xff4421, 0.6], [9, -4, 1, 0xff4421, 0.6],
        [13, -4, 1, 0x030303, 0.3], [-14, -3, 1, 0x030303, 0.3], [-10, -3, 1, 0xff4421, 0.6],
        [9, -3, 1, 0xff4421, 0.6], [13, -3, 1, 0x030303, 0.3], [-14, -2, 1, 0x030303, 0.3],
        [-10, -2, 1, 0xff4421, 0.6], [9, -2, 1, 0xff4421, 0.6], [13, -2, 1, 0x030303, 0.3],
        [-14, -1, 1, 0x030303, 0.3], [-10, -1, 1, 0xff4421, 0.6], [9, -1, 1, 0xff4421, 0.6],
        [13, -1, 1, 0x030303, 0.3], [-14, 0, 1, 0x030303, 0.3], [-10, 0, 1, 0xff4421, 0.6],
        [9, 0, 1, 0xff4421, 0.6], [13, 0, 1, 0x030303, 0.3], [-14, 1, 1, 0x030303, 0.3],
        [-10, 1, 1, 0xff4421, 0.6], [9, 1, 1, 0xff4421, 0.6], [13, 1, 1, 0x030303, 0.3],
        [-14, 2, 1, 0x030303, 0.3], [-10, 2, 1, 0xff4421, 0.6], [9, 2, 1, 0xff4421, 0.6],
        [13, 2, 1, 0x030303, 0.3], [-14, 3, 1, 0x030303, 0.3], [-10, 3, 1, 0xff4421, 0.6],
        [9, 3, 1, 0xff4421, 0.6], [13, 3, 1, 0x030303, 0.3], [-14, 4, 1, 0x030303, 0.3],
        [-9, 4, 1, 0xff4421, 0.6], [8, 4, 1, 0xff4421, 0.6], [13, 4, 1, 0x030303, 0.3],
        [-13, 5, 1, 0x030303, 0.3], [-9, 5, 1, 0xff4421, 0.6], [8, 5, 1, 0xff4421, 0.6],
        [12, 5, 1, 0x030303, 0.3], [-13, 6, 1, 0x030303, 0.3], [-8, 6, 1, 0xff4421, 0.6],
        [7, 6, 1, 0xff4421, 0.6], [12, 6, 1, 0x030303, 0.3], [-12, 7, 1, 0x030303, 0.3],
        [-7, 7, 1, 0xff4421, 0.6], [6, 7, 1, 0xff4421, 0.6], [11, 7, 1, 0x030303, 0.3],
        [-12, 8, 2, 0x030303, 0.3], [-6, 8, 2, 0xff4421, 0.6], [4, 8, 2, 0xff4421, 0.6],
        [10, 8, 2, 0x030303, 0.3], [-11, 9, 1, 0x030303, 0.3], [-4, 9, 8, 0xff4421, 0.6],
        [10, 9, 1, 0x030303, 0.3], [-10, 10, 2, 0x030303, 0.3], [8, 10, 2, 0x030303, 0.3],
        [-9, 11, 2, 0x030303, 0.3], [7, 11, 2, 0x030303, 0.3], [-7, 12, 2, 0x030303, 0.3],
        [5, 12, 2, 0x030303, 0.3], [-5, 13, 10, 0x030303, 0.3]
      ];
      for (const d of pixels) {
        g.beginFill(d[3], d[4]).drawRect(d[0], d[1], d[2], 1).endFill();
      }
    },
    pull_dot: (g) => {
      g.lineStyle(0);
      const pixels: Array<[number, number, number, number, number]> = [
        [-2, -3, 4, 0xff4422, 1.0], [-3, -2, 2, 0xff4422, 1.0], [-1, -2, 2, 0x4488ff, 1.0],
        [1, -2, 2, 0xff4422, 1.0], [-3, -1, 1, 0xff4422, 1.0], [-2, -1, 4, 0x4488ff, 1.0],
        [2, -1, 1, 0xff4422, 1.0], [-3, 0, 1, 0xff4422, 1.0], [-2, 0, 4, 0x4488ff, 1.0],
        [2, 0, 1, 0xff4422, 1.0], [-3, 1, 2, 0xff4422, 1.0], [-1, 1, 2, 0x4488ff, 1.0],
        [1, 1, 2, 0xff4422, 1.0], [-2, 2, 4, 0xff4422, 1.0]
      ];
      for (const d of pixels) {
        g.beginFill(d[3], d[4]).drawRect(d[0], d[1], d[2], 1).endFill();
      }
    },
    devour_burst: (g) => {
      g.lineStyle(0);
      const pixels: Array<[number, number, number, number, number]> = [
        [-2, -5, 4, 0xff4322, 0.8], [-4, -4, 8, 0xff4322, 0.8], [-4, -3, 2, 0xff4322, 0.8],
        [-2, -3, 4, 0xff694e, 1.0], [2, -3, 2, 0xff4322, 0.8], [-5, -2, 2, 0xff4322, 0.8],
        [-3, -2, 6, 0xff694e, 1.0], [3, -2, 2, 0xff4322, 0.8], [-5, -1, 2, 0xff4322, 0.8],
        [-3, -1, 6, 0xff694e, 1.0], [3, -1, 2, 0xff4322, 0.8], [-5, 0, 2, 0xff4322, 0.8],
        [-3, 0, 6, 0xff694e, 1.0], [3, 0, 2, 0xff4322, 0.8], [-5, 1, 2, 0xff4322, 0.8],
        [-3, 1, 6, 0xff694e, 1.0], [3, 1, 2, 0xff4322, 0.8], [-4, 2, 2, 0xff4322, 0.8],
        [-2, 2, 4, 0xff694e, 1.0], [2, 2, 2, 0xff4322, 0.8], [-4, 3, 8, 0xff4322, 0.8],
        [-2, 4, 4, 0xff4322, 0.8]
      ];
      for (const d of pixels) {
        g.beginFill(d[3], d[4]).drawRect(d[0], d[1], d[2], 1).endFill();
      }
    }
  },

  onInit: ({ state }) => {
    state.ringPhase = 0;
  },

  onTick: ({ state, arena, slot, tex }) => {
    state.ringPhase += 0.08;
    if (arena.simTicks % 6 === 0) {
      const p = arena.getPixelCoords(slot.log.x, slot.log.y);
      const ang = state.ringPhase;
      const r = 12 + Math.sin(state.ringPhase) * 3;
      arena.fxPool.spawnPhysics(
        tex('vortex_ring'),
        p.px + Math.cos(ang) * r,
        p.py + Math.sin(ang) * r,
        0,
        0,
        12,
        0.9,
        0.9,
        true
      );
    }
  },

  onTrigger: ({ arena, slot, config, spawn, tex, playSound }) => {
    const log = slot.log;
    const range = Math.min(
      CFG.GRID.COLS,
      Math.floor(config.baseRange + arena.stats.d * config.rangeScale)
    );

    const targets: Array<{ x: number; y: number }> = [];
    const minX = arena.clampX(log.x - range);
    const maxX = arena.clampX(log.x + range);
    const minY = arena.clampY(log.y);
    const maxY = arena.clampY(log.y + range);
    for (let tx = minX; tx <= maxX; tx++) {
      for (let ty = minY; ty <= maxY; ty++) {
        const hp = arena.getHP(tx, ty);
        if (hp > 0 && hp !== 9999) targets.push({ x: tx, y: ty });
      }
    }

    const maxT = Math.min(
      config.maxTargets,
      targets.length,
      Math.floor(config.baseTargets + arena.stats.d * config.targetScale)
    );
    for (let i = 0; i < maxT; i++) {
      const j = i + ((FastMath.rand() * (targets.length - i)) | 0);
      [targets[i], targets[j]] = [targets[j], targets[i]];
    }

    const dmg = config.baseDmg + arena.stats.d * config.scaling;
    let hitAny = false;

    for (let i = 0; i < maxT; i++) {
      const t = targets[i];
      if (arena.dmg(t.x, t.y, dmg, true, slot.md.color, slot)) {
        hitAny = true;
        spawn(
          Archetype.pullToward({
            targetRef: log,
            trailTex: 'pull_dot',
            life: config.pullLife
          }),
          { x: t.x, y: t.y }
        );
      }
    }

    if (hitAny) {
      playSound('absorb_devour');
      arena.shake = Math.min(15, config.shake + arena.stats.d / 20);
      slot.baseScale = Math.min(2.6, 1 + arena.stats.d / 85);
      slot.animScale.tX = 1.4;
      slot.animScale.tY = 0.6;

      const p = arena.getPixelCoords(log.x, log.y);
      for (let i = 0; i < 8; i++) {
        const ang = FastMath.rand() * Math.PI * 2;
        arena.fxPool.spawnPhysics(
          tex('devour_burst'),
          p.px + Math.cos(ang) * 4,
          p.py + Math.sin(ang) * 4,
          Math.cos(ang) * 1.5,
          Math.sin(ang) * 1.5,
          18,
          0.9,
          0.9,
          true
        );
      }
      arena.fxPool.spawnShockwave(p.px, p.py, slot.md.color, 70, 3);
    } else if (targets.length > 0) {
      playSound('hit');
    }
  }
};
