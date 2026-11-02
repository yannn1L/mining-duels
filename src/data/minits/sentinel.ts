import { Entity, MinitDef } from '../../types/game';
import { FastMath } from '../../engine/fastMath';
import { Archetype } from '../../engine/blueprint';

export interface SentinelConfig {
  dmg: number;
  radius: number;
  maxSatellites: number;
  castInterval: number;
  orbitRadius: number;
  orbitSpeed: number;
  satLife: number;
  bombLife: number;
  fallSpeed: number;
}

export interface SentinelState {
  satellites: Entity[];
  startAngle: number;
  deployCount: number;
}

export const sentinelMinit: MinitDef<SentinelConfig, SentinelState> = {
  id: 'sentinel',
  name: 'SENTINEL',
  role: 'Orbital Commander',
  color: 0xffaa44,
  roam: 0.25,
  cd: 120,
  desc: 'Deploys up to 8 autonomous orbital satellites that carpet-bomb the shaft.',

  config: {
    dmg: 25,
    radius: 3,
    maxSatellites: 8,
    castInterval: 39,
    orbitRadius: 3.2,
    orbitSpeed: 0.08,
    satLife: 600,
    bombLife: 30,
    fallSpeed: 1.2
  },

  audio: {
    sentinel_thruster: {
      t: 'sawtooth',
      f0: () => 150 + FastMath.rand() * 50,
      f1: 50,
      v: 0.1,
      d: 0.2,
      ramp: 'lin'
    }
  },

  textures: {
    base: (g, c) => {
      const R = 10;
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        pts.push([Math.cos(a) * R, Math.sin(a) * R]);
      }
      g.beginFill(0x1a1a1a, 1);
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 6; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.lineTo(pts[0][0], pts[0][1]);
      g.endFill();

      g.lineStyle(2, c, 1);
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < 6; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.lineTo(pts[0][0], pts[0][1]);

      g.lineStyle(0);
      g.beginFill(c, 0.3).drawCircle(0, 0, 6).endFill();
      g.beginFill(0xffffff, 1).drawCircle(0, 0, 3.5).endFill();
      g.beginFill(0xff2222, 1).drawCircle(0, 0, 2).endFill();
      g.beginFill(0xffffff, 1).drawCircle(-0.8, -0.8, 0.8).endFill();

      g.lineStyle(2, 0x555555, 1);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
        const lx = Math.cos(a) * R;
        const ly = Math.sin(a) * R;
        g.moveTo(lx * 0.85, ly * 0.85).lineTo(lx * 1.25, ly * 1.25);
      }

      g.lineStyle(1, c, 1);
      g.moveTo(0, -R).lineTo(0, -R - 4);
      g.lineStyle(0).beginFill(0xff2222, 1).drawCircle(0, -R - 5, 1.5).endFill();
    }
  },

  vfx: {
    satellite_aura: (g, c) => {
      g.lineStyle(1, c, 0.7).drawCircle(0, 0, 5);
      g.lineStyle(1, 0xffffff, 1).drawCircle(0, 0, 3);
      g.lineStyle(0).beginFill(0xffdd00, 0.5).drawCircle(0, 0, 4).endFill();
      g.beginFill(0xffffff, 1).drawCircle(0, 0, 1).endFill();
    },
    bomb_drop: (g, c) => {
      g.beginFill(0x222222, 1).drawCircle(0, 0, 4).endFill();
      g.beginFill(c, 1).drawCircle(0, 0, 3).endFill();
      g.beginFill(0xff2222, 1).drawCircle(0, 0, 1.5).endFill();
      g.beginFill(0xffdd00, 0.7).drawCircle(0, -4, 1.5).endFill();
    },
    bomb_explosion: (g) => {
      g.beginFill(0xff8800, 0.9).drawCircle(0, 0, 8).endFill();
      g.beginFill(0xffdd00, 0.8).drawCircle(0, 0, 5).endFill();
      g.beginFill(0xffffff, 1).drawCircle(0, 0, 2).endFill();
      g.lineStyle(2, 0xffffff, 0.9);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        g.moveTo(0, 0).lineTo(Math.cos(ang) * 12, Math.sin(ang) * 12);
      }
    },
    deploy_pulse: (g, c) => {
      g.lineStyle(2, 0xffffff, 1).drawCircle(0, 0, 5);
      g.lineStyle(1, c, 0.7).drawCircle(0, 0, 8);
      g.lineStyle(0).beginFill(0xffdd00, 0.6).drawCircle(0, 0, 2).endFill();
    }
  },

  onInit: ({ state }) => {
    state.satellites = [];
    state.startAngle = FastMath.rand() * Math.PI * 2;
    state.deployCount = 0;
  },

  onTrigger: ({ state, arena, slot, config, spawn, tex, playSound }) => {
    const dmgMul = slot.modifiers.dmgMul || 1;
    state.satellites = state.satellites.filter((x) => x && x.active && !x.dead);

    if (state.satellites.length >= config.maxSatellites) {
      const oldest = state.satellites[0];
      if (oldest) {
        oldest.l = config.satLife;
        oldest.maxL = config.satLife;
      }
      const p = arena.getPixelCoords(slot.log.x, slot.log.y);
      arena.fxPool.spawnPhysics(tex('deploy_pulse'), p.px, p.py, 0, -0.5, 15, 0.9, 0.9, true);
      return;
    }

    const bombBlueprint = Archetype.projectileGravity({
      dmg: config.dmg * dmgMul,
      radius: config.radius,
      color: 0xffaa44,
      fuse: config.bombLife,
      shake: 6,
      expSound: 'explosion',
      shockRad: 100,
      trailTex: 'bomb_drop',
      trailVy: -1.5,
      spawnOnDeath: [
        Archetype.areaRandomDamage({
          range: config.radius + 1,
          dmg: Math.floor(config.dmg * 0.4 * dmgMul),
          color: 0xffdd00,
          targetsPerTick: 3,
          life: 15
        })
      ]
    });

    const sat = spawn(
      Archetype.orbitalSatellite({
        targetRef: slot.log,
        radius: config.orbitRadius,
        speed: config.orbitSpeed,
        startAngle: state.startAngle + state.deployCount * ((Math.PI * 2) / config.maxSatellites),
        spriteTex: 'satellite_aura',
        castInterval: config.castInterval,
        castSound: 'sentinel_thruster',
        castPayload: bombBlueprint,
        randomCast: true,
        life: config.satLife
      })
    );

    if (sat) {
      state.satellites.push(sat);
      state.deployCount++;
    }

    const p = arena.getPixelCoords(slot.log.x, slot.log.y);
    arena.fxPool.spawnShockwave(p.px, p.py, 0xffaa44, 80, 4);

    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      arena.fxPool.spawnPhysics(
        tex('deploy_pulse'),
        p.px + Math.cos(ang) * 10,
        p.py + Math.sin(ang) * 10,
        Math.cos(ang) * 2,
        Math.sin(ang) * 2,
        18,
        0.9,
        0.9,
        true
      );
    }

    arena.shake = Math.max(arena.shake, 4);
    playSound('sentinel_thruster', 0.7);
  },

  onTick: ({ state, arena, spr, slot, config, tex }) => {
    spr.rotation += 0.005;

    const satCount = state.satellites.length;
    const pulse = 1 + Math.sin(arena.simTicks * 0.1) * 0.05;
    slot.animScale.tX = pulse + satCount * 0.03;
    slot.animScale.tY = pulse + satCount * 0.03;

    if (satCount >= config.maxSatellites) {
      spr.tint = arena.simTicks % 8 < 4 ? 0xffdd00 : 0xffffff;
    } else if (satCount > 0) {
      spr.tint = 0xffeedd;
    } else {
      spr.tint = 0xffffff;
    }

    if (satCount > 0 && arena.simTicks % 6 === 0) {
      const p = arena.getPixelCoords(slot.log.x, slot.log.y);
      const ang = (arena.simTicks * 0.05) % (Math.PI * 2);
      arena.fxPool.spawnPhysics(
        tex('bomb_drop'),
        p.px + Math.cos(ang) * 14,
        p.py + Math.sin(ang) * 14,
        0,
        0,
        12,
        0.9,
        0.9,
        true
      );
    }

    if (satCount > 0 && arena.simTicks % 4 === 0) {
      for (const sat of state.satellites) {
        if (!sat || !sat.active) continue;
        const sp = arena.getPixelCoords(sat.curX ?? sat.x, sat.curY ?? sat.y);
        arena.fxPool.spawnPhysics(
          tex('satellite_aura'),
          sp.px,
          sp.py,
          FastMath.randRange(-0.5, 0.5),
          FastMath.randRange(-0.5, 0.5),
          12,
          0.92,
          0.92,
          true
        );
      }
    }

    if (arena.simTicks % 30 === 0) {
      state.satellites = state.satellites.filter((x) => x && x.active && !x.dead);
    }
  }
};
