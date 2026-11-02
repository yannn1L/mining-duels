import { Entity, MinitDef } from '../../types/game';
import { Archetype, Blueprint, Trait } from '../../engine/blueprint';

export interface TurretConfig {
  dmg: number;
  boltSpeed: number;
  turretLife: number;
  castInterval: number;
  castCount: number;
  castSpread: number;
  maxTurrets: number;
}

export interface TurretState {
  turrets: Entity[];
}

export const turretMinit: MinitDef<TurretConfig, TurretState> = {
  id: 'turret',
  name: 'TURRET',
  role: 'Sentry Engineer',
  color: 0x88ff44,
  roam: 0.5,
  cd: 25,
  desc: 'Deploys static laser sentries that continuously fire 6-bolt fan spreads downward.',

  config: {
    dmg: 25,
    boltSpeed: 1.5,
    turretLife: 300,
    castInterval: 25,
    castCount: 6,
    castSpread: 0.8,
    maxTurrets: 30
  },

  audio: {
    turret_deploy: {
      t: 'square',
      f0: 300,
      f1: 800,
      v: 0.04,
      d: 0.3,
      ramp: 'exp'
    },
    turret_fire: {
      t: 'sawtooth',
      f0: 900,
      f1: 200,
      v: 0.06,
      d: 0.15,
      ramp: 'exp'
    }
  },

  textures: {
    base: (g, c) => {
      g.beginFill(0x1a1a1a, 1).drawRect(-7, -3, 14, 9).endFill();
      g.lineStyle(1, c, 1).drawRect(-7, -3, 14, 9);
      g.lineStyle(0).beginFill(c, 1);
      g.moveTo(-5, -3).lineTo(-3, -8).lineTo(3, -8).lineTo(5, -3).closePath().endFill();
      g.beginFill(0xff2222, 1).drawCircle(0, -8, 1.5).endFill();
      g.beginFill(0x555555, 1);
      g.drawRect(-3, 6, 1.5, 3);
      g.drawRect(-0.75, 6, 1.5, 3);
      g.drawRect(1.5, 6, 1.5, 3);
      g.endFill();
    }
  },

  vfx: {
    turret_body: (g, c) => {
      g.beginFill(0x1a1a1a, 1).drawRect(-5, -3, 10, 7).endFill();
      g.lineStyle(1, c, 1).drawRect(-5, -3, 10, 7);
      g.lineStyle(0).beginFill(c, 1);
      g.moveTo(-3, -3).lineTo(-2, -6).lineTo(2, -6).lineTo(3, -3).closePath().endFill();
      g.beginFill(0xff2222, 1).drawCircle(0, -6, 1).endFill();
    },
    laser_bolt: (g, c) => {
      g.beginFill(0xffffff, 1).drawCircle(0, 0, 1.5).endFill();
      g.beginFill(c, 0.9).drawCircle(0, 0, 3).endFill();
      g.beginFill(c, 0.4).drawCircle(0, 0, 5).endFill();
    },
    turret_deploy: (g, c) => {
      g.lineStyle(2, c, 1).drawCircle(0, 0, 5);
      g.lineStyle(0).beginFill(c, 0.5).drawCircle(0, 0, 3).endFill();
    }
  },

  onInit: ({ state }) => {
    state.turrets = [];
  },

  onTrigger: ({ state, arena, slot, config, spawn, tex, playSound }) => {
    const dmgMul = slot.modifiers.dmgMul || 1;
    state.turrets = state.turrets.filter((t) => t && t.active && !t.dead);

    if (state.turrets.length >= config.maxTurrets) {
      const oldest = state.turrets[0];
      if (oldest) {
        oldest.l = config.turretLife;
        oldest.maxL = config.turretLife;
      }
      return;
    }

    const boltBlueprint = Archetype.projectileStraight({
      dmg: config.dmg * dmgMul,
      color: 0x88ff44,
      trailTex: 'laser_bolt',
      trailVy: -0.3,
      life: 20,
      vx: 0,
      vy: config.boltSpeed
    });

    const sentryBlueprint = Blueprint.create()
      .life(config.turretLife)
      .use(
        Trait.vfx.sprite('turret_body'),
        Trait.cast.fan({
          interval: config.castInterval,
          count: config.castCount,
          spread: config.castSpread,
          baseAngle: Math.PI / 2,
          speed: config.boltSpeed,
          sound: 'turret_fire',
          payload: boltBlueprint
        }),
        Trait.lifecycle.age()
      );

    const turret = spawn(sentryBlueprint);
    if (turret) state.turrets.push(turret);

    const p = arena.getPixelCoords(slot.log.x, slot.log.y);
    arena.fxPool.spawnShockwave(p.px, p.py, 0x88ff44, 50, 3);
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      arena.fxPool.spawnPhysics(
        tex('turret_deploy'),
        p.px + Math.cos(ang) * 8,
        p.py + Math.sin(ang) * 8,
        Math.cos(ang) * 1.5,
        Math.sin(ang) * 1.5,
        18,
        0.9,
        0.9,
        true
      );
    }
    arena.shake = Math.max(arena.shake, 3);
    playSound('turret_deploy', 0.7);
  },

  onTick: ({ state, arena, spr, slot }) => {
    const bob = Math.sin(arena.simTicks * 0.12) * 0.05;
    slot.animScale.tX = 1 + bob;
    slot.animScale.tY = 1 - bob;

    const cd = slot.md.cd / (slot.modifiers.speedMul || 1);
    if (slot.log.t >= cd - 8) {
      spr.tint = arena.simTicks % 6 < 3 ? 0xaaffaa : 0xffffff;
    } else {
      spr.tint = 0xffffff;
    }

    if (arena.simTicks % 60 === 0) {
      state.turrets = state.turrets.filter((t) => t && t.active && !t.dead);
    }
  }
};
