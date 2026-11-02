import { MinitDef } from '../../types/game';
import { FastMath } from '../../engine/fastMath';
import { Archetype } from '../../engine/blueprint';
import { Textures } from '../../engine/textures';

export interface MothConfig {
  dmg: number;
  range: number;
  shake: number;
  flash: number;
  hatchTime: number;
}

export interface MothState {
  isHatched: boolean;
  ticks: number;
}

export const mothMinit: MinitDef<MothConfig, MothState> = {
  id: 'moth',
  name: 'MOTH',
  role: 'Late-Game Nuker',
  color: 0x88ffcc,
  roam: 0.8,
  cd: 45,
  desc: 'Incubates as a chrysalis, then hatches to rain massive 7x7 nuke spores across the shaft.',

  config: {
    dmg: 500,
    range: 3,
    shake: 15,
    flash: 0.6,
    hatchTime: 480
  },

  audio: {
    moth_swarm: {
      t: 'square',
      f0: () => 1200 + FastMath.rand() * 800,
      seq: [
        () => 400 + FastMath.rand() * 200,
        () => 1000 + FastMath.rand() * 400
      ],
      v: 0.02,
      d: 0.15,
      ramp: 'exp'
    }
  },

  textures: {
    base: (g) => {
      g.lineStyle(0);
      const pixels: Array<[number, number, number, number, number]> = [
        [-2, -7, 4, 0x88ffcc, 1.0], [-3, -6, 1, 0x9cddc5, 1.0], [-2, -6, 5, 0x88ffcc, 1.0],
        [-4, -5, 2, 0x88ffcc, 1.0], [-2, -5, 1, 0x9cddc5, 1.0], [-1, -5, 5, 0x88ffcc, 1.0],
        [-4, -4, 3, 0x88ffcc, 1.0], [-1, -4, 1, 0x9cddc5, 1.0], [0, -4, 4, 0x88ffcc, 1.0],
        [-5, -3, 2, 0x9cddc5, 1.0], [-3, -3, 3, 0x88ffcc, 1.0], [0, -3, 2, 0x9cddc5, 1.0],
        [2, -3, 3, 0x88ffcc, 1.0], [-5, -2, 1, 0x88ffcc, 1.0], [-4, -2, 2, 0x9cddc5, 1.0],
        [-2, -2, 4, 0x88ffcc, 1.0], [2, -2, 1, 0x9cddc5, 1.0], [3, -2, 2, 0x88ffcc, 1.0],
        [-5, -1, 1, 0x88ffcc, 1.0], [-4, -1, 2, 0x9cddc5, 1.0], [-2, -1, 5, 0x88ffcc, 1.0],
        [3, -1, 1, 0x9cddc5, 1.0], [4, -1, 1, 0x88ffcc, 1.0], [-5, 0, 2, 0x88ffcc, 1.0],
        [-3, 0, 2, 0x9cddc5, 1.0], [-1, 0, 5, 0x88ffcc, 1.0], [4, 0, 1, 0x9cddc5, 1.0],
        [-5, 1, 3, 0x88ffcc, 1.0], [-2, 1, 2, 0x9cddc5, 1.0], [0, 1, 5, 0x88ffcc, 1.0],
        [-5, 2, 3, 0x88ffcc, 1.0], [-2, 2, 2, 0x9cddc5, 1.0], [0, 2, 5, 0x88ffcc, 1.0],
        [-4, 3, 3, 0x88ffcc, 1.0], [-1, 3, 2, 0x9cddc5, 1.0], [1, 3, 3, 0x88ffcc, 1.0],
        [-4, 4, 4, 0x88ffcc, 1.0], [0, 4, 1, 0x9cddc5, 1.0], [1, 4, 3, 0x88ffcc, 1.0],
        [-3, 5, 3, 0x88ffcc, 1.0], [0, 5, 2, 0x9cddc5, 1.0], [2, 5, 1, 0x88ffcc, 1.0],
        [-2, 6, 3, 0x88ffcc, 1.0], [1, 6, 1, 0x9cddc5, 1.0]
      ];
      for (const d of pixels) {
        g.beginFill(d[3], d[4]).drawRect(d[0], d[1], d[2], 1).endFill();
      }
    },
    hatched: (g) => {
      g.lineStyle(0);
      const pixels: Array<[number, number, number, number, number]> = [
        [-4, -7, 1, 0x88ffcc, 0.8], [3, -7, 1, 0x88ffcc, 0.8], [-9, -6, 1, 0x000000, 1.0],
        [-3, -6, 1, 0x88ffcc, 0.8], [2, -6, 1, 0x88ffcc, 0.8], [8, -6, 1, 0x000000, 1.0],
        [-8, -5, 2, 0x000000, 1.0], [-4, -5, 1, 0x88ffcc, 0.8], [-3, -5, 1, 0x88ffcc, 0.96],
        [2, -5, 1, 0x88ffcc, 0.96], [3, -5, 1, 0x88ffcc, 0.8], [6, -5, 2, 0x000000, 1.0],
        [-8, -4, 1, 0x000000, 1.0], [-7, -4, 1, 0x88ffcc, 1.0], [-6, -4, 3, 0x000000, 1.0],
        [-2, -4, 1, 0x88ffcc, 0.8], [1, -4, 1, 0x88ffcc, 0.8], [3, -4, 3, 0x000000, 1.0],
        [6, -4, 1, 0x88ffcc, 1.0], [7, -4, 1, 0x000000, 1.0], [-8, -3, 1, 0x000000, 1.0],
        [-7, -3, 4, 0x88ffcc, 1.0], [-3, -3, 6, 0x000000, 1.0], [3, -3, 4, 0x88ffcc, 1.0],
        [7, -3, 1, 0x000000, 1.0], [-8, -2, 2, 0x000000, 1.0], [-6, -2, 4, 0x88ffcc, 1.0],
        [-2, -2, 4, 0xff0055, 1.0], [2, -2, 4, 0x88ffcc, 1.0], [6, -2, 2, 0x000000, 1.0],
        [-7, -1, 1, 0x000000, 1.0], [-6, -1, 4, 0x88ffcc, 1.0], [-2, -1, 4, 0xff0055, 1.0],
        [2, -1, 4, 0x88ffcc, 1.0], [6, -1, 1, 0x000000, 1.0], [-7, 0, 1, 0x000000, 1.0],
        [-6, 0, 4, 0x88ffcc, 1.0], [-2, 0, 1, 0x000000, 1.0], [-1, 0, 2, 0xffffff, 1.0],
        [1, 0, 1, 0x000000, 1.0], [2, 0, 4, 0x88ffcc, 1.0], [6, 0, 1, 0x000000, 1.0],
        [-7, 1, 6, 0x000000, 1.0], [-1, 1, 2, 0xffffff, 1.0], [1, 1, 6, 0x000000, 1.0],
        [-3, 2, 2, 0x000000, 1.0], [-1, 2, 2, 0xffffff, 1.0], [1, 2, 2, 0x000000, 1.0],
        [-3, 3, 2, 0x000000, 1.0], [-1, 3, 2, 0xffffff, 1.0], [1, 3, 2, 0x000000, 1.0],
        [-4, 4, 1, 0x000000, 1.0], [-3, 4, 1, 0x88ffcc, 1.0], [-2, 4, 4, 0x000000, 1.0],
        [2, 4, 1, 0x88ffcc, 1.0], [3, 4, 1, 0x000000, 1.0], [-4, 5, 3, 0x000000, 1.0],
        [1, 5, 3, 0x000000, 1.0], [-5, 6, 1, 0x000000, 1.0], [4, 6, 1, 0x000000, 1.0]
      ];
      for (const d of pixels) {
        g.beginFill(d[3], d[4]).drawRect(d[0], d[1], d[2], 1).endFill();
      }
    }
  },

  vfx: {
    acid: (g) => {
      g.lineStyle(0);
      const pixels: Array<[number, number, number, number, number]> = [
        [2, -8, 1, 0x8800cd, 0.9], [0, -7, 2, 0x8800cd, 0.9], [2, -7, 1, 0x58009c, 0.97],
        [3, -7, 2, 0x8800cd, 0.9], [-1, -6, 1, 0x8800cd, 0.9], [0, -6, 5, 0x58009c, 0.97],
        [5, -6, 1, 0x8800cd, 0.9], [-1, -5, 1, 0x8800cd, 0.9], [0, -5, 2, 0x58009c, 0.97],
        [2, -5, 1, 0xffffff, 1.0], [3, -5, 2, 0x58009c, 0.97], [5, -5, 1, 0x8800cd, 0.9],
        [-2, -4, 1, 0x8800cd, 0.9], [-1, -4, 2, 0x58009c, 0.97], [1, -4, 3, 0xffffff, 1.0],
        [4, -4, 2, 0x58009c, 0.97], [6, -4, 1, 0x8800cd, 0.9], [-3, -3, 1, 0x8800cd, 0.9],
        [-1, -3, 1, 0x8800cd, 0.9], [0, -3, 2, 0x58009c, 0.97], [2, -3, 1, 0xffffff, 1.0],
        [3, -3, 2, 0x58009c, 0.97], [5, -3, 1, 0x8800cd, 0.9], [-5, -2, 2, 0x8800cd, 0.9],
        [-3, -2, 1, 0x58009c, 0.97], [-2, -2, 2, 0x8800cd, 0.9], [0, -2, 5, 0x58009c, 0.97],
        [5, -2, 1, 0x8800cd, 0.9], [-6, -1, 1, 0x8800cd, 0.9], [-5, -1, 5, 0x58009c, 0.97],
        [0, -1, 2, 0x8800cd, 0.9], [2, -1, 1, 0x58009c, 0.97], [3, -1, 2, 0x8800cd, 0.9],
        [-6, 0, 1, 0x8800cd, 0.9], [-5, 0, 2, 0x58009c, 0.97], [-3, 0, 1, 0xffffff, 1.0],
        [-2, 0, 2, 0x58009c, 0.97], [0, 0, 1, 0x8800cd, 0.9], [2, 0, 4, 0x8800cd, 0.9],
        [-7, 1, 1, 0x8800cd, 0.9], [-6, 1, 2, 0x58009c, 0.97], [-4, 1, 3, 0xffffff, 1.0],
        [-1, 1, 2, 0x58009c, 0.97], [1, 1, 1, 0x8800cd, 0.9], [2, 1, 4, 0x58009c, 0.97],
        [6, 1, 1, 0x8800cd, 0.9], [-6, 2, 1, 0x8800cd, 0.9], [-5, 2, 2, 0x58009c, 0.97],
        [-3, 2, 1, 0xffffff, 1.0], [-2, 2, 2, 0x58009c, 0.97], [0, 2, 1, 0x8800cd, 0.9],
        [1, 2, 6, 0x58009c, 0.97], [7, 2, 1, 0x8800cd, 0.9], [-6, 3, 1, 0x8800cd, 0.9],
        [-5, 3, 5, 0x58009c, 0.97], [0, 3, 1, 0x8800cd, 0.9], [1, 3, 2, 0x58009c, 0.97],
        [3, 3, 2, 0xffffff, 1.0], [5, 3, 2, 0x58009c, 0.97], [7, 3, 1, 0x8800cd, 0.9],
        [-5, 4, 2, 0x8800cd, 0.9], [-3, 4, 1, 0x58009c, 0.97], [-2, 4, 3, 0x8800cd, 0.9],
        [1, 4, 2, 0x58009c, 0.97], [3, 4, 2, 0xffffff, 1.0], [5, 4, 2, 0x58009c, 0.97],
        [7, 4, 1, 0x8800cd, 0.9], [-3, 5, 1, 0x8800cd, 0.9], [0, 5, 1, 0x8800cd, 0.9],
        [1, 5, 6, 0x58009c, 0.97], [7, 5, 1, 0x8800cd, 0.9], [1, 6, 1, 0x8800cd, 0.9],
        [2, 6, 4, 0x58009c, 0.97], [6, 6, 1, 0x8800cd, 0.9], [2, 7, 4, 0x8800cd, 0.9]
      ];
      for (const d of pixels) {
        g.beginFill(d[3], d[4]).drawRect(d[0], d[1], d[2], 1).endFill();
      }
    }
  },

  onInit: ({ state }) => {
    state.isHatched = false;
    state.ticks = 0;
  },

  onTick: ({ state, arena, spr, slot, config, tex, playSound }) => {
    if (state.isHatched) return;
    if (++state.ticks % 10 === 0) {
      slot.animScale.tX = 1.1;
      slot.animScale.tY = 0.9;
    }
    if (state.ticks >= config.hatchTime - 10 && state.ticks % 2 === 0) {
      arena.triggerFlash(0.2);
    }
    if (state.ticks >= config.hatchTime) {
      state.isHatched = true;
      playSound('win', 1.5);
      arena.triggerFlash(0.8);
      arena.shake = Math.max(arena.shake, 8);
      spr.texture = Textures[`minit_${slot.id}_hatched`];
      const p = arena.getPixelCoords(slot.log.x, slot.log.y);
      arena.fxPool.spawnShockwave(p.px, p.py, slot.md.color, 150, 8);
      for (let i = 0; i < 12; i++) {
        const ang = FastMath.rand() * Math.PI * 2;
        arena.fxPool.spawnPhysics(
          tex('acid'),
          p.px + Math.cos(ang) * 6,
          p.py + Math.sin(ang) * 6,
          Math.cos(ang) * FastMath.randRange(1, 3),
          Math.sin(ang) * FastMath.randRange(1, 3),
          25,
          0.92,
          0.92,
          true
        );
      }
      arena.spawnToast(p.px, p.py - 24, 'HATCHED!', slot.md.color);
    }
  },

  onTrigger: ({ state, arena, slot, config, spawn, playSound }) => {
    if (!state.isHatched) return;
    playSound('moth_swarm');
    const log = slot.log;
    const tx = FastMath.randRange(3, arena.cols - 4) | 0;
    const ty = Math.min(log.y + (FastMath.randRange(2, 7) | 0), arena.maxDepth - 1);
    spawn(
      Archetype.projectileTargeted({
        dmg: config.dmg,
        radius: config.range,
        color: slot.md.color,
        shake: config.shake,
        flash: config.flash,
        expSound: 'nuke',
        shockRad: 120,
        trailTex: 'acid',
        trailSwirl: true,
        tx,
        ty
      })
    );
  }
};
