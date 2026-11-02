import { EffectDef } from '../types/game';

/**
 * Core Universal Status Effects
 * Minit-specific status effects (frenzy, parasite, momentum, etc.) are co-located
 * inside src/data/minits/<minit>.ts and registered via EffectRegistry.register().
 */
export const EFFECTS: Record<string, EffectDef> = {
  // ═══════════ UNIVERSAL DEBUFFS ═══════════
  slow: {
    id: 'slow',
    label: 'SLOW',
    color: 0xffaa00,
    stackable: true,
    maxStacks: 5,
    defaultDur: 180,
    onApply: (slot, eff) => {
      slot.modifiers.speedMul *= Math.max(0.15, 1 - eff.magnitude);
    },
    onRemove: (slot, eff) => {
      slot.modifiers.speedMul /= Math.max(0.15, 1 - eff.magnitude);
    },
    onTick: () => {}
  },

  poison: {
    id: 'poison',
    label: 'POISON',
    color: 0x88ff44,
    stackable: true,
    maxStacks: 3,
    defaultDur: 300,
    onApply: () => {},
    onRemove: () => {},
    onTick: (slot, eff) => {
      if (eff.elapsed % 30 === 0) {
        const a = slot.arena;
        const x = slot.log.x;
        const y = slot.log.y;
        a.dmg(x, y + 1, eff.magnitude * 5, false, eff.color, slot);
        const p = a.getPixelCoords(x, y + 1);
        a.fxPool.spawnPhysics(
          'fx_acid',
          p.px,
          p.py,
          0,
          -1,
          15,
          0.92,
          0.92,
          true
        );
      }
    }
  },

  blind: {
    id: 'blind',
    label: 'BLIND',
    color: 0x9955ff,
    stackable: false,
    defaultDur: 180,
    onApply: (slot) => {
      slot.modifiers.blind = true;
      if (slot.spr) slot.spr.alpha = 0.45;
    },
    onRemove: (slot) => {
      slot.modifiers.blind = false;
      if (slot.spr) slot.spr.alpha = 1.0;
    },
    onTick: () => {}
  },

  // ═══════════ UNIVERSAL BUFFS ═══════════
  haste: {
    id: 'haste',
    label: 'HASTE',
    color: 0x00ccff,
    stackable: true,
    maxStacks: 3,
    defaultDur: 240,
    onApply: (slot, eff) => {
      slot.modifiers.speedMul *= 1 + eff.magnitude;
    },
    onRemove: (slot, eff) => {
      slot.modifiers.speedMul /= 1 + eff.magnitude;
    },
    onTick: () => {}
  },

  shield: {
    id: 'shield',
    label: 'SHIELD',
    color: 0xffdd00,
    stackable: false,
    defaultDur: 400,
    onApply: (slot, eff) => {
      slot.modifiers.shieldCharges = eff.magnitude | 0;
    },
    onRemove: (slot) => {
      slot.modifiers.shieldCharges = 0;
    },
    onTick: () => {}
  }
};

export const EffectRegistry = {
  register(effects?: Record<string, EffectDef>): void {
    if (!effects) return;
    for (const [id, def] of Object.entries(effects)) {
      EFFECTS[id] = def;
    }
  },
  get(id: string): EffectDef | null {
    return EFFECTS[id] || null;
  },
  all(): EffectDef[] {
    return Object.values(EFFECTS);
  },
  ids(): string[] {
    return Object.keys(EFFECTS);
  }
};
