import { MinitDef } from '../../types/game';
import { FastMath } from '../../engine/fastMath';
import { Archetype } from '../../engine/blueprint';

export interface BomberConfig {
  dmg: number;
  radius: number;
  fuse: number;
  poisonDur: number;
  poisonMag: number;
}

export interface BomberState {
  triggerCount: number;
}

export const bomberMinit: MinitDef<BomberConfig, BomberState> = {
  id: 'bomber',
  name: 'BOMBER',
  role: 'Heavy Demolisher',
  color: 0xff6644,
  roam: 0.4,
  cd: 45,
  desc: 'Drops high-yield gravity bombs and afflicts the rival miner with poison and slow.',

  config: {
    dmg: 400,
    radius: 3,
    fuse: 10,
    poisonDur: 300,
    poisonMag: 0.4
  },

  textures: {
    base: (g, c) => {
      g.beginFill(0x333333).drawRect(-8, -6, 16, 12).endFill();
      g.beginFill(c).drawCircle(0, 0, 5).endFill();
      g.beginFill(0xffffff).drawRect(-2, -8, 4, 2).endFill();
    }
  },

  vfx: {
    smoke: (g) => {
      g.beginFill(0x666666, 0.8).drawCircle(0, 0, 3).endFill();
      g.beginFill(0xaaaaaa, 0.6).drawCircle(0, 0, 2).endFill();
    }
  },

  onInit: ({ state }) => {
    state.triggerCount = 0;
  },

  onTrigger: ({ state, arena, slot, config, spawn, tex, playSound }) => {
    state.triggerCount++;

    if (state.triggerCount % 3 === 0) {
      const enemy = arena.getOpponentSlot(slot);
      if (enemy && !enemy.disabled) {
        enemy.addEffect('poison', {
          duration: config.poisonDur,
          magnitude: config.poisonMag,
          source: slot
        });
        enemy.addEffect('slow', {
          duration: 180,
          magnitude: 0.3,
          source: slot
        });
      }
    }

    spawn(
      Archetype.projectileGravity({
        dmg: config.dmg,
        radius: config.radius,
        fuse: config.fuse,
        color: slot.md.color,
        expSound: 'nuke',
        shockRad: 120
      })
    );

    const p = arena.getPixelCoords(slot.log.x, slot.log.y);
    for (let i = 0; i < 6; i++) {
      arena.fxPool.spawnPhysics(
        tex('smoke'),
        p.px + FastMath.randRange(-8, 8),
        p.py + FastMath.randRange(-4, 4),
        FastMath.randRange(-1, 1),
        FastMath.randRange(-3, -1),
        25,
        0.9,
        0.9,
        true
      );
    }
    arena.shake = Math.max(arena.shake, 5);
    playSound('explosion', 0.4);
  },

  onTick: ({ spr, slot }) => {
    if (slot.log.t >= slot.md.cd - 10) {
      spr.tint = 0xff8844;
    } else {
      spr.tint = 0xffffff;
    }
  }
};
