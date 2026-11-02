import * as PIXI from 'pixi.js';
import { IArena, IMinitSlot, MinitDef } from '../../types/game';
import { FastMath } from '../../engine/fastMath';
import { Archetype } from '../../engine/blueprint';
import { Textures } from '../../engine/textures';

export interface LithosConfig {
  areaDmg: number;
  areaRange: number;
  areaDuration: number;
  rareChance: number;
  maxSlots: number;
  snapRange: number;
  snapDmg: number;
  snapDelay: number;
}

export interface LithosState {
  crystals: string[];
  buffDamage: number;
  abilityActive: boolean;
  abilityTicksLeft: number;
  ultimateReady: boolean;
  ultimateTriggered: boolean;
  ultimateFramesLeft: number;
  crystalContainer: PIXI.Container;
  crystalSprites: PIXI.Sprite[];
  spawningCrystals: Array<{ cspr: PIXI.Sprite; step: number }>;
  destroyingCrystals: Array<{ cspr: PIXI.Sprite; step: number; sx: number; sy: number }>;
}

export const lithosMinit: MinitDef<LithosConfig, LithosState> = {
  id: 'lithos',
  name: 'LITHOS',
  role: 'Crystal Collector',
  color: 0x88aaff,
  roam: 0.2,
  cd: 5,
  desc: 'Harvests elemental crystals from shattered rocks. Collect 5 to trigger an Ultimate Snap.',

  config: {
    areaDmg: 50,
    areaRange: 7,
    areaDuration: 20,
    rareChance: 0.33,
    maxSlots: 5,
    snapRange: 7,
    snapDmg: 999,
    snapDelay: 5
  },

  audio: {
    lithos_snap: { t: 'sine', f0: 400, seq: [514.37, 619.25], v: 0.2, d: 1.0, ramp: 'exp' }
  },

  effects: {
    momentum: {
      id: 'momentum',
      label: 'MOMENTUM',
      color: 0xff4422,
      stackable: false,
      defaultDur: 300,
      onApply: (slot) => {
        slot.modifiers.dmgMul = (slot.modifiers.dmgMul || 1) * 1.5;
      },
      onRemove: (slot) => {
        slot.modifiers.dmgMul /= 1.5;
      },
      onTick: () => {}
    }
  },

  textures: {
    base: (g, c) => {
      g.beginFill(0x2a2a3a).drawRect(-7, -4, 14, 10).endFill();
      g.beginFill(0x4a4a5a).drawRect(-5, -7, 10, 14).endFill();
      g.beginFill(c).moveTo(0, -5).lineTo(4, 0).lineTo(0, 5).lineTo(-4, 0).endFill();
      g.beginFill(0xffffff).drawRect(-1, -1, 2, 2).endFill();
    }
  },

  vfx: {
    crystal_red: (g) => {
      g.beginFill(0xff6666)
        .moveTo(0, -6)
        .lineTo(4, 0)
        .lineTo(2, 2)
        .lineTo(0, 6)
        .lineTo(-2, 2)
        .lineTo(-4, 0)
        .endFill();
      g.beginFill(0xffaaaa).drawCircle(0, -1, 1.5).endFill();
    },
    crystal_blue: (g) => {
      g.beginFill(0x66aaff)
        .moveTo(0, -5)
        .lineTo(5, 2)
        .lineTo(2, 2)
        .lineTo(0, 6)
        .lineTo(-2, 2)
        .lineTo(-5, 2)
        .endFill();
      g.beginFill(0xaaddff).drawRect(-1, -2, 2, 3).endFill();
    },
    crystal_green: (g) => {
      g.beginFill(0x66ff88).drawEllipse(0, 0, 4, 6).endFill();
      g.beginFill(0xaaffcc).drawEllipse(0, -1, 2, 3).endFill();
    },
    crystal_purple: (g) => {
      g.beginFill(0xcc66ff)
        .moveTo(0, -7)
        .lineTo(3, -2)
        .lineTo(5, 2)
        .lineTo(2, 5)
        .lineTo(-2, 5)
        .lineTo(-5, 2)
        .lineTo(-3, -2)
        .endFill();
      g.beginFill(0xeeaaff).drawCircle(0, 0, 2).endFill();
    },
    crystal_gold: (g) => {
      g.beginFill(0xffcc44).drawRect(-4, -5, 8, 10).endFill();
      g.beginFill(0xffdd88).drawRect(-2, -4, 4, 8).endFill();
      g.lineStyle(1, 0xffaa00).moveTo(-4, 0).lineTo(4, 0);
    },
    crystal_sparkle: (g) => {
      g.beginFill(0xffffff, 0.9).drawCircle(0, 0, 2).endFill();
      g.lineStyle(1, 0xffaa44, 0.8);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        g.moveTo(0, 0).lineTo(Math.cos(a) * 6, Math.sin(a) * 6);
      }
    },
    crystal_aura: (g, c) => {
      g.lineStyle(1, c, 0.5).drawCircle(0, 0, 18);
      g.lineStyle(1, 0xffffff, 0.3).drawCircle(0, 0, 22);
    },
    ult_ready_glow: (g) => {
      g.beginFill(0xffaa44, 0.9).drawCircle(0, 0, 4).endFill();
      g.beginFill(0xffdd88, 0.6).drawCircle(0, 0, 7).endFill();
      g.lineStyle(2, 0xffffff, 0.8);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        g.moveTo(Math.cos(a) * 8, Math.sin(a) * 8).lineTo(Math.cos(a) * 12, Math.sin(a) * 12);
      }
    }
  },

  onInit: ({ state, arena }) => {
    state.crystals = [];
    state.buffDamage = 0;
    state.abilityActive = false;
    state.abilityTicksLeft = 0;
    state.ultimateReady = false;
    state.ultimateTriggered = false;
    state.ultimateFramesLeft = 0;
    state.crystalContainer = new PIXI.Container();
    state.crystalSprites = [];
    state.spawningCrystals = [];
    state.destroyingCrystals = [];
    arena.worldContainer.addChild(state.crystalContainer);
  },

  onTick: ({ state, arena, spr, slot, tex }) => {
    const px = slot.worldX;
    const py = slot.worldY;
    state.crystalContainer.position.set(Math.round(px - 10), Math.round(py - 28));

    if (state.crystals.length > 0 && arena.simTicks % 8 === 0) {
      arena.fxPool.spawnPhysics(tex('crystal_aura'), px, py, 0, 0, 20, 0.95, 0.95, true);
    }

    if (state.abilityTicksLeft > 0) {
      state.abilityTicksLeft--;
      if (state.abilityTicksLeft <= 0) state.abilityActive = false;
    }

    if (state.spawningCrystals.length) {
      state.spawningCrystals = state.spawningCrystals.filter((anim) => {
        anim.step += 0.15;
        const t = Math.min(1, anim.step * 1.25);
        anim.cspr.scale.set(t);
        anim.cspr.rotation = (1 - t) * Math.PI * 4;
        return anim.step < 0.8;
      });
    }

    if (state.destroyingCrystals.length) {
      state.destroyingCrystals = state.destroyingCrystals.filter((anim) => {
        anim.step += 0.1;
        anim.cspr.x = anim.sx + (FastMath.rand() - 0.5) * anim.step * 6;
        anim.cspr.y = anim.sy + anim.step * 10;
        anim.cspr.alpha = 1 - anim.step;
        if (anim.step >= 1) {
          if (anim.cspr.parent) anim.cspr.parent.removeChild(anim.cspr);
          return false;
        }
        return true;
      });
    }

    if (state.ultimateFramesLeft > 0 && --state.ultimateFramesLeft === 0) {
      state.ultimateTriggered = false;
    }

    if (state.crystals.length >= 5 && !state.ultimateReady && !state.ultimateTriggered) {
      state.ultimateReady = true;
      spr.tint = 0xffaa88;
      arena.triggerFlash(0.2);
      for (const cs of state.crystalSprites) {
        if (cs) {
          arena.fxPool.spawnPhysics(
            tex('ult_ready_glow'),
            state.crystalContainer.x + cs.x,
            state.crystalContainer.y + cs.y - 5,
            0,
            -1,
            15,
            0.95,
            0.95,
            true
          );
        }
      }
      arena.spawnToast(px, py - 40, 'ULT READY!', 0xffaa44);
    } else if (state.crystals.length < 5 && state.ultimateReady && !state.ultimateTriggered) {
      state.ultimateReady = false;
      spr.tint = 0xffffff;
    }

    state.crystalSprites.forEach((cs, i) => {
      if (cs) {
        cs.y = 5 + Math.sin(arena.simTicks * 0.1 + i) * 3;
        cs.rotation = Math.sin(arena.simTicks * 0.15 + i) * 0.2;
      }
    });
  },

  onTrigger: ({ state, arena, slot, config, spawn, tex, playSound }) => {
    if (state.abilityActive) return;
    const log = slot.log;

    const onRockDestroy = (
      x: number,
      y: number,
      targetArena: IArena,
      ownerSlot: IMinitSlot | null
    ) => {
      if (state.ultimateTriggered) return;
      if (FastMath.rand() >= config.rareChance) return;
      if (state.crystals.length >= config.maxSlots) return;

      const types = ['red', 'blue', 'green', 'purple', 'gold'];
      const type = types[(FastMath.rand() * 5) | 0];
      state.crystals.push(type);
      playSound('bio_squish', 0.7);
      playSound('click', 0.4);

      const p = targetArena.getPixelCoords(x, y);
      targetArena.fxPool.spawnPhysics(
        tex('crystal_sparkle'),
        p.px,
        p.py,
        0,
        -2,
        20,
        0.95,
        0.95,
        true
      );
      for (let i = 0; i < 5; i++) {
        targetArena.fxPool.spawnPhysics(
          'fx_flash',
          p.px + FastMath.randRange(-8, 8),
          p.py + FastMath.randRange(-8, 8),
          FastMath.randRange(-1, 1),
          FastMath.randRange(-3, -1),
          15,
          0.9,
          0.9,
          true
        );
      }

      const cspr = new PIXI.Sprite(Textures[tex(`crystal_${type}`)]);
      cspr.anchor.set(0.5);
      cspr.x = -((state.crystals.length - 1) * 12) / 2 + (state.crystals.length - 1) * 12;
      cspr.y = 5;
      cspr.scale.set(0);
      state.crystalContainer.addChild(cspr);
      state.crystalSprites.push(cspr);
      state.spawningCrystals.push({ cspr, step: 0 });

      const pm = targetArena.getPixelCoords(log.x, log.y);
      targetArena.fxPool.spawnPhysics(
        tex('crystal_sparkle'),
        pm.px,
        pm.py - 20,
        0,
        -3,
        15,
        0.95,
        0.95,
        true
      );

      const old = state.buffDamage;
      state.buffDamage = state.crystals.length * 10;
      if (state.buffDamage > old) {
        targetArena.triggerFlash(0.15);
        targetArena.fxPool.spawnPhysics('fx_flash', pm.px, pm.py - 15, 0, -2, 10, 0.9, 0.9, true);
      }

      if (state.crystals.length >= config.maxSlots && !state.ultimateTriggered) {
        state.ultimateTriggered = true;
        state.ultimateReady = false;
        state.ultimateFramesLeft = 30;
        playSound('lithos_snap', 1);
        targetArena.triggerFlash(0.5);
        targetArena.shake = Math.max(targetArena.shake, 8);
        for (let i = 0; i < 20; i++) {
          const ang = FastMath.rand() * Math.PI * 2;
          const rad = FastMath.randRange(15, 60);
          targetArena.fxPool.spawnPhysics(
            'fx_explosion',
            pm.px + Math.cos(ang) * rad,
            pm.py + Math.sin(ang) * rad,
            Math.cos(ang) * FastMath.randRange(1, 4),
            Math.sin(ang) * FastMath.randRange(1, 4),
            25,
            0.9,
            0.9,
            true
          );
        }
        spawn(
          Archetype.ultimateSnap({
            delay: config.snapDelay,
            range: config.snapRange,
            dmg: config.snapDmg,
            color: 0xffaa44
          }),
          { x: log.x, y: log.y, owner: ownerSlot || slot }
        );
        for (const cs of state.crystalSprites) {
          if (cs && cs.parent) {
            state.destroyingCrystals.push({ cspr: cs, step: 0, sx: cs.x, sy: cs.y });
          }
        }
        state.crystals = [];
        state.crystalSprites = [];
        state.buffDamage = 0;
        slot.spr.tint = 0xffffff;
      }
    };

    state.abilityActive = true;
    state.abilityTicksLeft = config.areaDuration;
    spawn(
      Archetype.areaRandomDamage({
        range: config.areaRange,
        dmg: config.areaDmg + state.buffDamage,
        color: slot.md.color,
        targetsPerTick: 4,
        life: config.areaDuration,
        onDestroy: onRockDestroy
      })
    );
    playSound('quake', 0.8);
    slot.animScale.tX = 1.3;
    slot.animScale.tY = 0.7;
    const pm = arena.getPixelCoords(log.x, log.y);
    arena.fxPool.spawnShockwave(pm.px, pm.py, slot.md.color, 100, 4);
  }
};
