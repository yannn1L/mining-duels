import { IArena, MinitContext, MinitDef } from '../../types/game';
import { FastMath } from '../../engine/fastMath';
import { Archetype } from '../../engine/blueprint';

export interface FrenzyConfig {
  dmg: number;
  radius: number;
  targetsPerTick: number;
  aoeLife: number;
  killsPerFury: number;
  maxFury: number;
  furyDuration: number;
  furyMagnitude: number;
  decayTriggers: number;
  blindDuration: number;
  furyPulseDmg: number;
  furyPulseRadius: number;
}

export interface FrenzyState {
  fury: number;
  killCount: number;
  triggersSinceKill: number;
  _wasBlind: boolean;
}

export const frenzyMinit: MinitDef<FrenzyConfig, FrenzyState> = {
  id: 'frenzy',
  name: 'FRENZY',
  role: 'Berserker Predator',
  color: 0xff2244,
  roam: 0.4,
  cd: 5,
  desc: 'Grows stronger with each rock destroyed, unleashing a massive Fury Pulse at max stacks.',

  config: {
    dmg: 30,
    radius: 6,
    targetsPerTick: 4,
    aoeLife: 12,
    killsPerFury: 5,
    maxFury: 5,
    furyDuration: 300,
    furyMagnitude: 0.25,
    decayTriggers: 8,
    blindDuration: 30,
    furyPulseDmg: 200,
    furyPulseRadius: 5
  },

  effects: {
    frenzy: {
      id: 'frenzy',
      label: 'FRENZY',
      color: 0xff2244,
      stackable: false,
      defaultDur: 300,
      onApply: (slot, eff) => {
        slot.modifiers.dmgMul *= eff.magnitude;
      },
      onRemove: (slot, eff) => {
        slot.modifiers.dmgMul /= eff.magnitude;
      },
      onTick: () => {}
    }
  },

  textures: {
    base: (g, c) => {
      g.beginFill(0x220000, 1);
      g.moveTo(0, -12).lineTo(10, 8).lineTo(-10, 8).lineTo(0, -12).endFill();
      g.lineStyle(2, c, 1);
      g.moveTo(0, -12).lineTo(10, 8).lineTo(-10, 8).lineTo(0, -12);
      g.lineStyle(2, c, 0.9);
      g.moveTo(-10, 8).lineTo(-14, 10);
      g.moveTo(10, 8).lineTo(14, 10);
      g.moveTo(-6, -2).lineTo(-11, -1);
      g.moveTo(6, -2).lineTo(11, -1);
      g.lineStyle(0);
      g.beginFill(0xffffff, 1).drawCircle(0, -2, 4).endFill();
      g.beginFill(c, 1).drawCircle(0, -2, 2.5).endFill();
      g.beginFill(0x000000, 1).drawCircle(0, -2, 1.2).endFill();
      g.beginFill(0xffffff, 0.9).drawCircle(-1, -3, 0.6).endFill();
      g.beginFill(0xffffff, 0.9);
      g.moveTo(-6, 5)
        .lineTo(-3, 8)
        .lineTo(0, 5)
        .lineTo(3, 8)
        .lineTo(6, 5)
        .lineTo(6, 6)
        .lineTo(-6, 6)
        .lineTo(-6, 5)
        .endFill();
    }
  },

  vfx: {
    fury_aura: (g, c) => {
      g.lineStyle(1, c, 0.7).drawCircle(0, 0, 6);
      g.lineStyle(1, 0xffffff, 0.9).drawCircle(0, 0, 3);
      g.lineStyle(0).beginFill(c, 0.4).drawCircle(0, 0, 4).endFill();
    },
    kill_burst: (g, c) => {
      g.beginFill(0xffffff, 1).drawCircle(0, 0, 2).endFill();
      g.beginFill(c, 0.9).drawCircle(0, 0, 4).endFill();
      g.lineStyle(1, c, 0.8);
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2;
        g.moveTo(0, 0).lineTo(Math.cos(ang) * 7, Math.sin(ang) * 7);
      }
    },
    fury_pulse: (g) => {
      g.beginFill(0xffaa00, 0.9).drawCircle(0, 0, 8).endFill();
      g.beginFill(0xffffff, 1).drawCircle(0, 0, 4).endFill();
      g.lineStyle(2, 0xff2200, 0.9);
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        g.moveTo(0, 0).lineTo(Math.cos(ang) * 14, Math.sin(ang) * 14);
      }
    }
  },

  onInit: ({ state }) => {
    state.fury = 0;
    state.killCount = 0;
    state.triggersSinceKill = 0;
    state._wasBlind = false;
  },

  onTrigger: (ctx) => {
    const { state, slot, config, spawn, tex, playSound } = ctx;
    const dmgMul = slot.modifiers.dmgMul || 1;
    state.triggersSinceKill++;

    spawn(
      Archetype.areaRandomDamage({
        range: config.radius,
        dmg: config.dmg * dmgMul,
        color: slot.md.color,
        targetsPerTick: config.targetsPerTick,
        life: config.aoeLife,
        onDestroy: (x: number, y: number, arena: IArena) => {
          state.killCount++;
          state.triggersSinceKill = 0;
          const p = arena.getPixelCoords(x, y);
          arena.fxPool.spawnPhysics(
            tex('kill_burst'),
            p.px,
            p.py,
            FastMath.randRange(-1, 1),
            FastMath.randRange(-2, -0.5),
            15,
            0.9,
            0.9,
            true
          );
        }
      })
    );

    if (state.killCount >= config.killsPerFury && state.fury < config.maxFury) {
      state.killCount = 0;
      state.fury++;
      applyFury(ctx);
      playSound('swarm', 0.6);
    }

    if (state.fury >= config.maxFury) {
      fireFuryPulse(ctx);
    }

    if (state.triggersSinceKill >= config.decayTriggers && state.fury > 0) {
      state.fury--;
      state.triggersSinceKill = 0;
      state.killCount = 0;
      applyFury(ctx);
      playSound('click', 0.5);
    }
  },

  onTick: ({ state, arena, spr, slot, config, tex }) => {
    const furyPct = state.fury / config.maxFury;

    const pulse = 0.5 + Math.sin(arena.simTicks * (0.08 + furyPct * 0.15)) * 0.5;
    slot.animScale.tX = 1 + pulse * (0.05 + furyPct * 0.15);
    slot.animScale.tY = 1 - pulse * (0.03 + furyPct * 0.1);

    if (state.fury === 0) {
      spr.tint = 0xffffff;
    } else if (state.fury >= config.maxFury) {
      spr.tint = arena.simTicks % 6 < 3 ? 0xffff00 : 0xffaa00;
    } else {
      const t = furyPct;
      const r = 0xff;
      const g = Math.floor(0x22 + (0xdd - 0x22) * t);
      const b = Math.floor(0x44 + (0x00 - 0x44) * t);
      spr.tint = (r << 16) | (g << 8) | b;
    }

    if (state.fury > 0 && arena.simTicks % Math.max(3, 10 - state.fury) === 0) {
      const p = arena.getPixelCoords(slot.log.x, slot.log.y);
      const ang = (arena.simTicks * 0.08) % (Math.PI * 2);
      const rad = 10 + state.fury * 2;
      arena.fxPool.spawnPhysics(
        tex('fury_aura'),
        p.px + Math.cos(ang) * rad,
        p.py + Math.sin(ang) * rad,
        0,
        -0.5,
        12,
        0.92,
        0.92,
        true
      );
    }
  }
};

function applyFury(ctx: MinitContext<FrenzyConfig, FrenzyState>) {
  const { state, arena, slot, config } = ctx;
  slot.removeEffect('frenzy');
  if (state.fury > 0) {
    slot.addEffect('frenzy', {
      duration: config.furyDuration,
      magnitude: 1 + state.fury * config.furyMagnitude,
      source: slot
    });
  }
  const p = arena.getPixelCoords(slot.log.x, slot.log.y);
  arena.fxPool.spawnShockwave(p.px, p.py, 0xff2244, 40 + state.fury * 20, 3);
}

function fireFuryPulse(ctx: MinitContext<FrenzyConfig, FrenzyState>) {
  const { state, arena, slot, config, tex, playSound } = ctx;
  const dmgMul = slot.modifiers.dmgMul || 1;

  if (!state._wasBlind) {
    slot.addEffect('blind', {
      duration: config.blindDuration,
      magnitude: 1,
      source: slot
    });
    state._wasBlind = true;
    playSound('devour', 0.8);
  }

  const cx = slot.log.x;
  const cy = slot.log.y;
  const R = config.furyPulseRadius;
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const dist = Math.hypot(dx, dy);
      if (dist > R) continue;
      arena.dmg(cx + dx, cy + dy, config.furyPulseDmg * dmgMul, true, 0xffaa00, slot);
    }
  }

  const p = arena.getPixelCoords(cx, cy);
  arena.fxPool.spawnShockwave(p.px, p.py, 0xffaa00, 200, 8);
  for (let i = 0; i < 20; i++) {
    const ang = (i / 20) * Math.PI * 2;
    arena.fxPool.spawnPhysics(
      tex('fury_pulse'),
      p.px + Math.cos(ang) * 20,
      p.py + Math.sin(ang) * 20,
      Math.cos(ang) * 4,
      Math.sin(ang) * 4,
      25,
      0.9,
      0.9,
      true
    );
  }

  arena.shake = Math.max(arena.shake, 10);
  arena.triggerFlash(0.4);

  state.fury = 0;
  state.killCount = 0;
  state.triggersSinceKill = 0;
  state._wasBlind = false;
  slot.removeEffect('frenzy');
}
