import { MinitContext, MinitDef } from '../../types/game';
import { FastMath } from '../../engine/fastMath';
import { Archetype } from '../../engine/blueprint';

export interface LaserConfig {
  length: number;
  dmg: number;
  duration: number;
  shake: number;
  flash: number;
  chargeFrames: number;
  beamColors: { outer: number; core: number; hot: number };
  beamWidths: { outer: number; core: number; hot: number };
  impactShrapnel: number;
  postSmoke: number;
  electric: {
    chargeArcCount: number;
    chargeArcRate: number;
    beamArcRate: number;
    beamArcJitter: number;
    impactArcCount: number;
    impactArcRange: number;
  };
}

export interface LaserState {
  charging: boolean;
  chargeTicks: number;
  chargeRings: number;
}

export const laserMinit: MinitDef<LaserConfig, LaserState> = {
  id: 'laser',
  name: 'LASER',
  role: 'Precision Striker',
  color: 0x00ccff,
  roam: 0,
  cd: 24,
  desc: 'Charges an overvolted core to fire a piercing multi-layer plasma beam straight down.',

  config: {
    length: 5,
    dmg: 35,
    duration: 20,
    shake: 4,
    flash: 0.15,
    chargeFrames: 18,
    beamColors: { outer: 0x0088cc, core: 0x00ccff, hot: 0xffffff },
    beamWidths: { outer: 8, core: 4, hot: 2 },
    impactShrapnel: 10,
    postSmoke: 6,
    electric: {
      chargeArcCount: 4,
      chargeArcRate: 3,
      beamArcRate: 2,
      beamArcJitter: 20,
      impactArcCount: 6,
      impactArcRange: 40
    }
  },

  textures: {
    base: (g, c) => {
      g.beginFill(0x1a1a2a).drawRect(-7, -7, 14, 14).endFill();
      g.beginFill(c).moveTo(0, -7).lineTo(7, 0).lineTo(0, 7).lineTo(-7, 0).endFill();
      g.beginFill(0xffffff).drawRect(-2, -2, 4, 4).endFill();
      g.lineStyle(1, 0xffffff, 0.6).drawCircle(0, 0, 3);
    }
  },

  vfx: {
    charge_ring: (g, c) => {
      g.lineStyle(2, c, 0.9).drawCircle(0, 0, 12);
      g.lineStyle(1, 0xffffff, 0.6).drawCircle(0, 0, 16);
    },
    charge_core: (g, c) => {
      g.beginFill(c, 1).drawCircle(0, 0, 3).endFill();
      g.beginFill(0xffffff, 1).drawCircle(0, 0, 1.5).endFill();
    },
    electric_arc: (g, c) => {
      g.lineStyle(2, c, 1);
      g.moveTo(-4, -6).lineTo(-1, -2).lineTo(-3, 2).lineTo(2, 6);
      g.lineStyle(1, 0xffffff, 0.9);
      g.moveTo(-3, -5).lineTo(-2, -1).lineTo(0, 1).lineTo(3, 5);
      g.lineStyle(0).beginFill(0xffffff, 1).drawCircle(-1, -2, 1).drawCircle(2, 6, 1).endFill();
    },
    electric_spark: (g, c) => {
      g.beginFill(c, 1).drawCircle(0, 0, 2).endFill();
      g.beginFill(0xffffff, 1).drawCircle(0, 0, 1).endFill();
      g.lineStyle(1, c, 0.8);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        g.moveTo(0, 0).lineTo(Math.cos(a) * 5, Math.sin(a) * 5);
      }
    },
    beam_outer: (g, c) => {
      g.beginFill(c, 0.4).drawRect(-4, -8, 8, 16).endFill();
    },
    beam_core: (g, c) => {
      g.beginFill(c, 0.9).drawRect(-2, -8, 4, 16).endFill();
    },
    beam_hot: (g) => {
      g.beginFill(0xffffff, 1).drawRect(-1, -8, 2, 16).endFill();
    },
    impact_burst: (g, c) => {
      g.beginFill(0xffffff, 1).drawCircle(0, 0, 4).endFill();
      g.beginFill(c, 0.8).drawCircle(0, 0, 7).endFill();
    },
    post_smoke: (g) => {
      g.beginFill(0xaaaaaa, 0.6).drawRect(-2, -2, 4, 4).endFill();
    }
  },

  onInit: ({ state }) => {
    state.charging = false;
    state.chargeTicks = 0;
    state.chargeRings = 0;
  },

  onTick: (ctx) => {
    const { state, arena, slot, config, tex, playSound } = ctx;
    if (!state.charging) return;

    const p = arena.getPixelCoords(slot.log.x, slot.log.y);
    const el = config.electric;

    state.chargeTicks++;
    const pulse = 1 + Math.sin(state.chargeTicks * 0.5) * 0.12;
    slot.animScale.tX = pulse;
    slot.animScale.tY = pulse;

    if (state.chargeTicks % 6 === 0) {
      state.chargeRings++;
      arena.fxPool.spawnPhysics(
        tex('charge_ring'),
        p.px,
        p.py,
        0,
        0,
        15,
        0.95,
        0.95,
        true
      );
      playSound('click', 0.1);
    }

    if (state.chargeTicks % 3 === 0) {
      arena.fxPool.spawnPhysics(
        tex('charge_core'),
        p.px + FastMath.randRange(-6, 6),
        p.py + FastMath.randRange(-6, 6),
        0,
        -1,
        8,
        0.95,
        0.95,
        true
      );
    }

    if (state.chargeTicks % el.chargeArcRate === 0) {
      for (let i = 0; i < el.chargeArcCount; i++) {
        const ang = FastMath.rand() * Math.PI * 2;
        const dist = FastMath.randRange(8, 16);
        arena.fxPool.spawnPhysics(
          tex('electric_arc'),
          p.px + Math.cos(ang) * dist,
          p.py + Math.sin(ang) * dist,
          FastMath.randRange(-1, 1),
          FastMath.randRange(-1, 1),
          8,
          0.92,
          0.92,
          true
        );
      }
      arena.fxPool.spawnPhysics(
        tex('electric_spark'),
        p.px + FastMath.randRange(-8, 8),
        p.py + FastMath.randRange(-8, 8),
        0,
        0,
        6,
        1,
        1,
        true
      );
    }

    if (state.chargeTicks >= config.chargeFrames) {
      fireBeam(ctx);
    }
  },

  onTrigger: ({ state, arena, playSound }) => {
    if (state.charging) return;
    state.charging = true;
    state.chargeTicks = 0;
    state.chargeRings = 0;
    playSound('laser', 0.03);
    arena.triggerFlash(0.1);
  }
};

function fireBeam(ctx: MinitContext<LaserConfig, LaserState>) {
  const { state, arena, slot, config, spawn, tex, playSound } = ctx;
  const log = slot.log;
  const el = config.electric;

  state.charging = false;
  state.chargeTicks = 0;

  playSound('laser', 1.0);
  arena.triggerFlash(config.flash);
  arena.shake = Math.max(arena.shake, config.shake);

  const p = arena.getPixelCoords(log.x, log.y);

  spawn(
    Archetype.beamVertical({
      dmg: config.dmg,
      length: config.length,
      color: slot.md.color,
      duration: config.duration,
      renderLaser: false
    })
  );

  const endY = Math.min(log.y + config.length, arena.maxDepth - 1);
  const pEnd = arena.getPixelCoords(log.x, endY);

  arena.fxPool.spawnLaser(
    p.px,
    p.py,
    pEnd.px,
    pEnd.py,
    config.beamColors.outer,
    config.beamWidths.outer,
    config.duration,
    false
  );
  arena.fxPool.spawnLaser(
    p.px,
    p.py,
    pEnd.px,
    pEnd.py,
    config.beamColors.core,
    config.beamWidths.core,
    config.duration,
    false
  );
  arena.fxPool.spawnLaser(
    p.px,
    p.py,
    pEnd.px,
    pEnd.py,
    config.beamColors.hot,
    config.beamWidths.hot,
    config.duration,
    false
  );

  if (arena.headless) return;

  const arcCount = Math.ceil(config.length * 2 * arena.vfxLod);
  for (let i = 0; i < arcCount; i++) {
    const t = FastMath.rand();
    const ax = p.px + (pEnd.px - p.px) * t;
    const ay = p.py + (pEnd.py - p.py) * t;
    setTimeout(() => {
      if ((arena as any).destroyed || !arena.fxPool) return;
      arena.fxPool.spawnPhysics(
        tex('electric_arc'),
        ax + FastMath.randRange(-el.beamArcJitter, el.beamArcJitter),
        ay,
        FastMath.randRange(-2, 2),
        FastMath.randRange(-1, 1),
        8,
        0.9,
        0.9,
        true
      );
    }, i * 15);
  }

  for (let i = 0; i < 6; i++) {
    const ang = FastMath.rand() * Math.PI * 2;
    arena.fxPool.spawnPhysics(
      tex('electric_spark'),
      p.px + Math.cos(ang) * 4,
      p.py + Math.sin(ang) * 4,
      Math.cos(ang) * FastMath.randRange(1, 3),
      Math.sin(ang) * FastMath.randRange(1, 3),
      12,
      0.92,
      0.92,
      true
    );
  }

  setTimeout(() => {
    if ((arena as any).destroyed || !arena.fxPool) return;
    arena.fxPool.spawnShockwave(pEnd.px, pEnd.py, slot.md.color, 80, 5);
    arena.fxPool.spawnPhysics(tex('impact_burst'), pEnd.px, pEnd.py, 0, 0, 12, 1, 1, true);

    for (let i = 0; i < el.impactArcCount; i++) {
      const ang = FastMath.rand() * Math.PI * 2;
      const rad = FastMath.randRange(10, el.impactArcRange);
      arena.fxPool.spawnPhysics(
        tex('electric_arc'),
        pEnd.px + Math.cos(ang) * rad,
        pEnd.py + Math.sin(ang) * rad,
        Math.cos(ang) * FastMath.randRange(-1, 1),
        Math.sin(ang) * FastMath.randRange(-1, 1),
        15,
        0.9,
        0.9,
        true
      );
    }

    for (let i = 0; i < config.impactShrapnel; i++) {
      const ang = FastMath.rand() * Math.PI * 2;
      arena.fxPool.spawnPhysics(
        'fx_shrapnel',
        pEnd.px + Math.cos(ang) * 4,
        pEnd.py + Math.sin(ang) * 4,
        Math.cos(ang) * FastMath.randRange(1, 3),
        Math.sin(ang) * FastMath.randRange(1, 3),
        20,
        0.9,
        0.9,
        true
      );
    }
    playSound('crush', 0.5);
  }, 60);

  for (let i = 0; i < config.postSmoke; i++) {
    const smokeY = p.py + (i / config.postSmoke) * (pEnd.py - p.py);
    setTimeout(() => {
      if ((arena as any).destroyed || !arena.fxPool) return;
      arena.fxPool.spawnPhysics(
        tex('post_smoke'),
        p.px + FastMath.randRange(-4, 4),
        smokeY,
        FastMath.randRange(-0.5, 0.5),
        FastMath.randRange(-1, -0.3),
        25,
        0.94,
        0.97,
        true
      );
    }, i * 30);
  }
}
