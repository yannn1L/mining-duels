import { Entity, MinitDef, TraitFn } from '../../types/game';
import { FastMath } from '../../engine/fastMath';
import { Blueprint, Trait, resolveEntityTex } from '../../engine/blueprint';

export interface SymbioteConfig {
  dmg: number;
  infectRadius: number;
  infectPerTrigger: number;
  stacksToTentacle: number;
  tentacleDmg: number;
  tentacleLife: number;
  spreadChance: number;
  parasiteEffectDur: number;
}

export interface SymbioteState {
  infested: Map<string, { stacks: number; lastTouch: number }>;
  tentacles: Entity[];
  triggerCounter: number;
}

/**
 * Custom Symbiote-specific Trait: lashes adjacent rock blocks while emitting tendril spores.
 */
function tendrilLashTrait(opts: {
  dmg: number;
  lashSpeed?: number;
  color?: number;
  trailTex?: string;
}): TraitFn {
  const lashSpeed = opts.lashSpeed ?? 0.15;
  const color = opts.color ?? 0xff2244;
  return (e, a) => {
    e.state.ang = (e.state.ang || 0) + lashSpeed;
    e.state.life = (e.state.life || 0) + 1;

    const dir = Math.sin(e.state.ang * 4) > 0 ? 1 : -1;
    const lashX = a.clampX(e.x + dir);
    const lashY = a.clampY(e.y - 1);
    const hp = a.getHP(lashX, lashY);

    if (hp > 0 && hp !== 9999) {
      a.dmg(lashX, lashY, opts.dmg, false, color, e.owner);
    }

    const trailTex = resolveEntityTex(e, opts.trailTex);
    if (a.fxPool && trailTex && e.state.life % 3 === 0) {
      const p = a.getPixelCoords(e.x, e.y - 1);
      a.fxPool.spawnPhysics(
        trailTex,
        p.px + dir * 6,
        p.py + FastMath.randRange(-3, 3),
        dir * 0.5,
        FastMath.randRange(-1, 0),
        12,
        0.92,
        0.92,
        true
      );
    }
  };
}

export const symbioteMinit: MinitDef<SymbioteConfig, SymbioteState> = {
  id: 'symbiote',
  name: 'SYMBIOTE',
  role: 'Bio-Infester',
  color: 0x66ff88,
  roam: 0.5,
  cd: 10,
  desc: 'Infects surrounding rocks with bio-spores. Infested blocks erupt into lashing tendrils.',

  config: {
    dmg: 15,
    infectRadius: 6,
    infectPerTrigger: 2,
    stacksToTentacle: 3,
    tentacleDmg: 2,
    tentacleLife: 200,
    spreadChance: 1,
    parasiteEffectDur: 240
  },

  audio: {
    symbiote_infect: {
      t: 'sine',
      f0: () => 300 + FastMath.rand() * 100,
      f1: 80,
      v: 0.08,
      d: 0.2,
      ramp: 'exp'
    },
    symbiote_tendril: {
      noise: true,
      d: 0.15,
      fType: 'bandpass',
      f0: () => 800 + FastMath.rand() * 400,
      f1: 200,
      fQ: 3,
      v: 0.06,
      oF0: 400,
      oF1: 100
    },
    symbiote_infest: {
      noise: true,
      d: 0.4,
      fType: 'lowpass',
      f0: 1200,
      f1: 100,
      v: 0.15,
      oF0: 200,
      oF1: 40
    }
  },

  effects: {
    parasite: {
      id: 'parasite',
      label: 'PARASITE',
      color: 0x66ff66,
      stackable: true,
      maxStacks: 3,
      defaultDur: 240,
      onApply: () => {},
      onRemove: () => {},
      onTick: (slot, eff) => {
        if (eff.elapsed % 30 === 0) {
          const a = slot.arena;
          const x = slot.log.x;
          const y = slot.log.y;
          a.dmg(x, y + 1, eff.magnitude * 3, false, eff.color, slot);
          const p = a.getPixelCoords(x, y + 1);
          a.fxPool.spawnPhysics(
            'fx_acid',
            p.px,
            p.py,
            FastMath.randRange(-1, 1),
            FastMath.randRange(-2, -0.5),
            15,
            0.94,
            0.94,
            true
          );
        }
      }
    }
  },

  textures: {
    base: (g, c) => {
      g.beginFill(0x000000, 0.8).drawCircle(0, 0, 7).endFill();
      g.beginFill(c, 0.9).drawCircle(0, 0, 6).endFill();
      g.beginFill(0x440000, 0.9).drawCircle(0, 0, 3).endFill();
      g.beginFill(0xff2222, 1).drawCircle(0, 0, 2).endFill();
      g.lineStyle(1, c, 0.9);
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        g.moveTo(Math.cos(a) * 5, Math.sin(a) * 5).lineTo(Math.cos(a) * 8, Math.sin(a) * 8);
      }
      g.lineStyle(0).beginFill(0xffffff, 0.7).drawCircle(-1, -1, 1).endFill();
    }
  },

  vfx: {
    parasite_glow: (g, c) => {
      g.beginFill(c, 0.8).drawCircle(0, 0, 5).endFill();
      g.beginFill(0xff2244, 1).drawCircle(0, 0, 2).endFill();
      g.beginFill(0xffffff, 1).drawCircle(0, 0, 1).endFill();
    },
    tendril: (g, c) => {
      g.lineStyle(2, 0x331144, 1);
      g.moveTo(-5, 2).lineTo(-2, -3).lineTo(2, -3).lineTo(5, 2);
      g.lineStyle(1, c, 0.9);
      g.moveTo(-5, 2).lineTo(-2, -3).lineTo(2, -3).lineTo(5, 2);
      g.lineStyle(0).beginFill(0xff2244, 1).drawCircle(0, -3, 2.5).endFill();
    },
    infest_burst: (g, c) => {
      g.beginFill(0x331144, 0.9).drawCircle(0, 0, 7).endFill();
      g.beginFill(c, 0.7).drawCircle(0, 0, 5).endFill();
      g.beginFill(0xff2244, 1).drawCircle(0, 0, 2).endFill();
    }
  },

  onInit: ({ state }) => {
    state.infested = new Map<string, { stacks: number; lastTouch: number }>();
    state.tentacles = [];
    state.triggerCounter = 0;
  },

  onTrigger: ({ state, arena, slot, config, spawn, tex, playSound }) => {
    const dmgMul = slot.modifiers.dmgMul || 1;
    state.triggerCounter++;

    const candidates: Array<{ x: number; y: number }> = [];
    const R = config.infectRadius;
    for (let dy = 0; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const rx = slot.log.x + dx;
        const ry = slot.log.y + dy;
        if (rx < 0 || rx >= arena.cols) continue;
        const hp = arena.getHP(rx, ry);
        if (hp > 0 && hp !== 9999) candidates.push({ x: rx, y: ry });
      }
    }

    for (let i = candidates.length - 1; i > 0; i--) {
      const j = (FastMath.rand() * (i + 1)) | 0;
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const picks = candidates.slice(0, config.infectPerTrigger);

    for (const t of picks) {
      const key = `${t.x},${t.y}`;
      const cur = state.infested.get(key) || { stacks: 0, lastTouch: arena.simTicks };
      cur.stacks++;
      cur.lastTouch = arena.simTicks;
      state.infested.set(key, cur);

      arena.dmg(t.x, t.y, config.dmg * dmgMul, false, slot.md.color, slot);
      const p = arena.getPixelCoords(t.x, t.y);
      arena.fxPool.spawnPhysics(
        tex('parasite_glow'),
        p.px,
        p.py,
        FastMath.randRange(-1, 1),
        FastMath.randRange(-2, -0.5),
        25,
        0.92,
        0.92,
        true
      );

      if (cur.stacks >= config.stacksToTentacle) {
        state.infested.delete(key);
        arena.fxPool.spawnShockwave(p.px, p.py, 0x331144, 50, 4);
        for (let j = 0; j < 8; j++) {
          arena.fxPool.spawnPhysics(
            tex('infest_burst'),
            p.px + FastMath.randRange(-10, 10),
            p.py + FastMath.randRange(-10, 10),
            FastMath.randRange(-2, 2),
            FastMath.randRange(-3, 1),
            30,
            0.9,
            0.9,
            true
          );
        }
        playSound('symbiote_infect', 0.8);

        const tentacleBlueprint = Blueprint.create()
          .life(config.tentacleLife)
          .use(
            Trait.lifecycle.age(),
            Trait.spread.onDestroy({
              dmg: config.tentacleDmg * dmgMul,
              color: slot.md.color,
              lifeDecay: 30,
              sound: 'symbiote_tendril',
              trailTex: 'tendril'
            }),
            tendrilLashTrait({
              dmg: config.tentacleDmg * dmgMul,
              lashSpeed: 0.15,
              color: 0xff2244,
              trailTex: 'tendril'
            }),
            Trait.vfx.trail({ tex: 'tendril', vy: -0.5 })
          );

        const ent = spawn(tentacleBlueprint, { x: t.x, y: t.y });
        if (ent) state.tentacles.push(ent);
      }
    }

    if (state.triggerCounter % 5 === 0) {
      const enemy = arena.getOpponentSlot(slot);
      if (enemy && !enemy.disabled) {
        enemy.addEffect('parasite', {
          duration: config.parasiteEffectDur,
          magnitude: 0.5,
          source: slot
        });
      }
    }

    const p = arena.getPixelCoords(slot.log.x, slot.log.y);
    arena.fxPool.spawnShockwave(p.px, p.py, slot.md.color, 40, 3);
    playSound('symbiote_tendril', 0.6);
  },

  onTick: ({ state, arena, spr, slot, tex }) => {
    if (arena.simTicks % 30 === 0) {
      const toRemove: string[] = [];
      for (const [key, val] of state.infested.entries()) {
        const [x, y] = key.split(',').map(Number);
        const hp = arena.getHP(x, y);
        if (hp <= 0 || hp === 9999) toRemove.push(key);
        else if (arena.simTicks - val.lastTouch > 180) toRemove.push(key);
      }
      for (const k of toRemove) state.infested.delete(k);
    }

    state.tentacles = state.tentacles.filter((t) => t.active && !t.dead);

    const pulse = 0.5 + Math.sin(arena.simTicks * 0.15) * 0.5;
    slot.animScale.tX = 1 + pulse * 0.1;
    slot.animScale.tY = 1 - pulse * 0.1;

    if (state.tentacles.length > 0) {
      spr.tint = arena.simTicks % 10 < 5 ? 0xffaaaa : 0xffffff;
    } else if (state.infested.size > 5) {
      spr.tint = 0xccffcc;
    } else {
      spr.tint = 0xffffff;
    }

    if (arena.simTicks % 20 === 0) {
      for (const [key] of state.infested.entries()) {
        const [x, y] = key.split(',').map(Number);
        const p = arena.getPixelCoords(x, y);
        arena.fxPool.spawnPhysics(
          tex('parasite_glow'),
          p.px + FastMath.randRange(-4, 4),
          p.py + FastMath.randRange(-4, 4),
          0,
          -0.5,
          10,
          0.92,
          0.92,
          true
        );
      }
    }
  }
};
