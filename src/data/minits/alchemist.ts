import { MinitContext, MinitDef } from '../../types/game';
import { FastMath } from '../../engine/fastMath';
import { Archetype } from '../../engine/blueprint';

const POTIONS = [
  { type: 'acid', weight: 30 },
  { type: 'lightning', weight: 25 },
  { type: 'fire', weight: 25 },
  { type: 'frost', weight: 15 },
  { type: 'void', weight: 5 }
] as const;

type PotionType = (typeof POTIONS)[number]['type'];

const TOTAL_WEIGHT = POTIONS.reduce((s, p) => s + p.weight, 0);

function rollPotion(): PotionType {
  let r = FastMath.rand() * TOTAL_WEIGHT;
  for (const p of POTIONS) {
    r -= p.weight;
    if (r <= 0) return p.type;
  }
  return 'acid';
}

export interface AlchemistConfig {
  dmg: number;
  radius: number;
  throwRangeX: number;
  throwRangeY: number;
  throwLife: number;
  poisonDur: number;
  poisonMag: number;
  slowDur: number;
  slowMag: number;
  voidDelay: number;
  voidRange: number;
  voidDmg: number;
}

export interface AlchemistState {
  lastPotion: PotionType | null;
  potionCounts: Record<PotionType, number>;
}

export const alchemistMinit: MinitDef<AlchemistConfig, AlchemistState> = {
  id: 'alchemist',
  name: 'ALCHEMIST',
  role: 'Chaotic Brewmaster',
  color: 0xaa66ff,
  roam: 0,
  cd: 15,
  desc: 'Throws 5 volatile potion types: Acid, Lightning, Fire, Frost, and Void.',

  config: {
    dmg: 60,
    radius: 2,
    throwRangeX: 5,
    throwRangeY: 4,
    throwLife: 60,
    poisonDur: 300,
    poisonMag: 0.4,
    slowDur: 300,
    slowMag: 0.5,
    voidDelay: 60,
    voidRange: 4,
    voidDmg: 250
  },

  audio: {
    alch_throw: {
      t: 'triangle',
      f0: 300,
      f1: 700,
      v: 0.1,
      d: 0.15,
      ramp: 'exp'
    },
    alch_pot_acid: {
      noise: true,
      d: 0.25,
      fType: 'bandpass',
      f0: 900,
      f1: 300,
      fQ: 2,
      v: 0.1,
      oF0: 250,
      oF1: 60
    },
    alch_pot_lightning: {
      t: 'square',
      f0: 1200,
      f1: 200,
      f2: 800,
      v: 0.1,
      d: 0.25,
      ramp: 'lin_exp'
    },
    alch_pot_fire: {
      noise: true,
      d: 0.35,
      fType: 'lowpass',
      f0: 1500,
      f1: 80,
      v: 0.3,
      oF0: 200,
      oF1: 50
    },
    alch_pot_frost: {
      noise: true,
      d: 0.3,
      fType: 'highpass',
      f0: 1500,
      f1: 800,
      v: 0.08
    },
    alch_pot_void: {
      t: 'sine',
      f0: 400,
      f1: 150,
      f2: 800,
      v: 0.15,
      d: 0.6,
      ramp: 'lin_exp'
    }
  },

  textures: {
    base: (g, c) => {
      g.beginFill(c, 1).drawCircle(0, 2, 6).endFill();
      g.beginFill(c, 1).drawRect(-2.5, -7, 5, 5).endFill();
      g.beginFill(0x553322, 1).drawRect(-3, -9, 6, 2).endFill();
      g.beginFill(0xffffff, 0.3).drawCircle(0, 2, 4).endFill();
      g.beginFill(0xffffff, 0.8).drawCircle(-1.5, 0, 0.8).endFill();
      g.beginFill(0xffffff, 0.9).drawCircle(-3, -1, 1).endFill();
    }
  },

  vfx: {
    potion_acid: (g) => {
      g.beginFill(0x88ff44, 1).drawCircle(0, 0, 4).endFill();
      g.beginFill(0xffffff, 0.8).drawCircle(-1, -1, 1.5).endFill();
      g.beginFill(0x336611, 0.6).drawCircle(1, 1, 2).endFill();
    },
    potion_lightning: (g) => {
      g.beginFill(0xffff00, 1).drawCircle(0, 0, 4).endFill();
      g.lineStyle(1, 0xffffff, 1);
      g.moveTo(-3, -3).lineTo(0, 0).lineTo(3, -3);
      g.moveTo(-3, 3).lineTo(0, 0).lineTo(3, 3);
    },
    potion_fire: (g) => {
      g.beginFill(0xff4422, 1).drawCircle(0, 0, 4).endFill();
      g.beginFill(0xffaa00, 0.9).drawCircle(0, -1, 3).endFill();
      g.beginFill(0xffff00, 1).drawCircle(0, -2, 1.5).endFill();
    },
    potion_frost: (g) => {
      g.beginFill(0x00ccff, 1).drawCircle(0, 0, 4).endFill();
      g.lineStyle(1, 0xffffff, 0.9);
      g.moveTo(0, -4).lineTo(0, 4);
      g.moveTo(-4, 0).lineTo(4, 0);
    },
    potion_void: (g) => {
      g.beginFill(0x220044, 1).drawCircle(0, 0, 5).endFill();
      g.beginFill(0x8844ff, 0.9).drawCircle(0, 0, 3.5).endFill();
      g.beginFill(0xffffff, 1).drawCircle(0, 0, 1).endFill();
    },
    potion_trail: (g, c) => {
      g.beginFill(c, 0.9).drawCircle(0, 0, 3).endFill();
      g.beginFill(0xffffff, 0.6).drawCircle(0, 0, 1.5).endFill();
    }
  },

  onInit: ({ state }) => {
    state.lastPotion = null;
    state.potionCounts = { acid: 0, lightning: 0, fire: 0, frost: 0, void: 0 };
  },

  onTrigger: (ctx) => {
    const { state, arena, slot, config, playSound } = ctx;
    const dmgMul = slot.modifiers.dmgMul || 1;

    let potionType = rollPotion();
    if (potionType === state.lastPotion && FastMath.rand() < 0.5) {
      potionType = rollPotion();
    }
    state.lastPotion = potionType;
    state.potionCounts[potionType]++;

    const tx = arena.clampX(
      slot.log.x + (FastMath.randRange(-config.throwRangeX, config.throwRangeX) | 0)
    );
    const ty = arena.clampY(slot.log.y + config.throwRangeY);

    const p = arena.getPixelCoords(slot.log.x, slot.log.y);
    arena.fxPool.spawnShockwave(p.px, p.py, slot.md.color, 30, 3);
    playSound('alch_throw', 0.7);

    switch (potionType) {
      case 'acid':
        throwAcid(ctx, dmgMul, tx, ty);
        break;
      case 'lightning':
        throwLightning(ctx, dmgMul, tx, ty);
        break;
      case 'fire':
        throwFire(ctx, dmgMul, tx, ty);
        break;
      case 'frost':
        throwFrost(ctx, dmgMul, tx, ty);
        break;
      case 'void':
        throwVoid(ctx, dmgMul, tx, ty);
        break;
    }
  },

  onTick: ({ arena, spr, slot, tex }) => {
    const bob = Math.sin(arena.simTicks * 0.12) * 0.06;
    slot.animScale.tX = 1 + bob;
    slot.animScale.tY = 1 - bob;

    const cd = slot.md.cd / (slot.modifiers.speedMul || 1);
    if (slot.log.t >= cd - 8) {
      spr.tint = arena.simTicks % 6 < 3 ? 0xddbbff : 0xffffff;
    } else {
      spr.tint = 0xffffff;
    }

    if (arena.simTicks % 20 === 0) {
      const p = arena.getPixelCoords(slot.log.x, slot.log.y);
      const ang = (arena.simTicks * 0.05) % (Math.PI * 2);
      arena.fxPool.spawnPhysics(
        tex('potion_trail'),
        p.px + Math.cos(ang) * 12,
        p.py + Math.sin(ang) * 12,
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

function throwAcid(
  ctx: MinitContext<AlchemistConfig, AlchemistState>,
  dmgMul: number,
  tx: number,
  ty: number
) {
  const { arena, slot, config, spawn } = ctx;
  spawn(
    Archetype.projectileTargeted({
      dmg: config.dmg * 0.7 * dmgMul,
      radius: 2,
      color: 0x88ff44,
      tx,
      ty,
      life: config.throwLife,
      trailTex: 'potion_acid',
      trailVy: -0.5,
      expSound: 'alch_pot_acid',
      shockRad: 70,
      shake: 4
    })
  );

  const enemy = arena.getOpponentSlot(slot);
  if (enemy && !enemy.disabled) {
    enemy.addEffect('poison', {
      duration: config.poisonDur,
      magnitude: config.poisonMag,
      source: slot
    });
  }
}

function throwLightning(
  ctx: MinitContext<AlchemistConfig, AlchemistState>,
  dmgMul: number,
  tx: number,
  ty: number
) {
  const { config, spawn } = ctx;
  spawn(
    Archetype.projectileTargeted({
      dmg: config.dmg * 0.4 * dmgMul,
      radius: 1,
      color: 0xffff00,
      tx,
      ty,
      life: config.throwLife,
      trailTex: 'potion_lightning',
      trailVy: -0.5,
      expSound: 'alch_pot_lightning',
      shockRad: 60,
      shake: 5,
      spawnOnDeath: [
        Archetype.beamLightning({
          length: 5,
          dmg: config.dmg * 0.6 * dmgMul,
          color: 0xffff00,
          duration: 20
        })
      ]
    })
  );
}

function throwFire(
  ctx: MinitContext<AlchemistConfig, AlchemistState>,
  dmgMul: number,
  tx: number,
  ty: number
) {
  const { config, spawn } = ctx;
  spawn(
    Archetype.projectileTargeted({
      dmg: config.dmg * 1.4 * dmgMul,
      radius: config.radius + 1,
      color: 0xff4422,
      tx,
      ty,
      life: config.throwLife,
      trailTex: 'potion_fire',
      trailVy: -1.5,
      expSound: 'alch_pot_fire',
      shockRad: 100,
      shake: 10
    })
  );
}

function throwFrost(
  ctx: MinitContext<AlchemistConfig, AlchemistState>,
  dmgMul: number,
  tx: number,
  ty: number
) {
  const { arena, slot, config, spawn } = ctx;
  spawn(
    Archetype.projectileTargeted({
      dmg: config.dmg * 0.3 * dmgMul,
      radius: 2,
      color: 0x00ccff,
      tx,
      ty,
      life: config.throwLife,
      trailTex: 'potion_frost',
      trailVy: -0.5,
      expSound: 'alch_pot_frost',
      shockRad: 60,
      shake: 3,
      spawnOnDeath: [
        Archetype.shockwave({
          baseDmg: config.dmg * 0.25 * dmgMul,
          maxRadius: 4,
          speed: 0.4,
          color: 0x00ccff
        })
      ]
    })
  );

  const enemy = arena.getOpponentSlot(slot);
  if (enemy && !enemy.disabled) {
    enemy.addEffect('slow', {
      duration: config.slowDur,
      magnitude: config.slowMag,
      source: slot
    });
  }
}

function throwVoid(
  ctx: MinitContext<AlchemistConfig, AlchemistState>,
  dmgMul: number,
  tx: number,
  ty: number
) {
  const { config, spawn } = ctx;
  spawn(
    Archetype.projectileTargeted({
      dmg: config.dmg * 0.2 * dmgMul,
      radius: 1,
      color: 0x8844ff,
      tx,
      ty,
      life: config.throwLife,
      trailTex: 'potion_void',
      trailVy: -1,
      expSound: 'alch_pot_void',
      shockRad: 50,
      shake: 4,
      spawnOnDeath: [
        Archetype.ultimateSnap({
          delay: config.voidDelay,
          range: config.voidRange,
          dmg: config.voidDmg * dmgMul,
          color: 0x8844ff,
          shake: 12,
          flash: 0.5
        })
      ]
    })
  );
}
