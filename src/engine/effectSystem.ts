import * as PIXI from 'pixi.js';
import { EffectApplyOpts, EffectDef, IEffectInstance, IMinitSlot } from '../types/game';
import { EffectRegistry } from '../data/effects';
import { FastMath } from './fastMath';

export class EffectInstance implements IEffectInstance {
  public def: EffectDef;
  public id: string;
  public magnitude: number;
  public duration: number;
  public elapsed = 0;
  public stacks: number;
  public source: IMinitSlot | null;
  public color: number;
  public label: string;
  public _uiIcon?: PIXI.Graphics;

  constructor(def: EffectDef, opts: EffectApplyOpts = {}) {
    this.def = def;
    this.id = def.id;
    this.magnitude = opts.magnitude ?? 1;
    this.duration = opts.duration ?? def.defaultDur;
    this.stacks = opts.stacks ?? 1;
    this.source = opts.source ?? null;
    this.color = def.color;
    this.label = def.label;
  }

  tick(slot: IMinitSlot): void {
    this.duration--;
    this.elapsed++;
    if (this.def.onTick) {
      try {
        this.def.onTick(slot, this);
      } catch {
        // Handled silently
      }
    }
  }

  isExpired(): boolean {
    return this.duration <= 0;
  }
}

export const EffectManager = {
  apply(slot: IMinitSlot, id: string, opts: EffectApplyOpts = {}): IEffectInstance | null {
    const def = EffectRegistry.get(id);
    if (!def) {
      return null;
    }

    const existing = slot.effects.find((e) => e.id === id);
    if (existing) {
      if (def.stackable && existing.stacks < (def.maxStacks || 1)) {
        existing.stacks++;
        existing.magnitude = (existing.magnitude || 1) + (opts.magnitude ?? 1);
        existing.duration = Math.max(existing.duration, opts.duration ?? def.defaultDur);
        if (def.onApply) {
          try {
            def.onApply(slot, existing);
          } catch {
            // Error in effect handler
          }
        }
        if (!opts.silent) this._notify(slot, existing, 'stack');
        return existing;
      }
      existing.duration = Math.max(existing.duration, opts.duration ?? def.defaultDur);
      if (!opts.silent) this._notify(slot, existing, 'refresh');
      return existing;
    }

    const eff = new EffectInstance(def, opts);
    slot.effects.push(eff);
    if (def.onApply) {
      try {
        def.onApply(slot, eff);
      } catch {
        // Error in effect handler
      }
    }
    if (!opts.silent) this._notify(slot, eff, 'apply');
    return eff;
  },

  remove(slot: IMinitSlot, id: string): boolean {
    const idx = slot.effects.findIndex((e) => e.id === id);
    if (idx < 0) return false;
    this._removeInstance(slot, slot.effects[idx]);
    slot.effects.splice(idx, 1);
    return true;
  },

  has(slot: IMinitSlot, id: string): boolean {
    return slot.effects.some((e) => e.id === id);
  },

  get(slot: IMinitSlot, id: string): IEffectInstance | null {
    return slot.effects.find((e) => e.id === id) || null;
  },

  clear(slot: IMinitSlot): void {
    for (const eff of slot.effects) {
      this._removeInstance(slot, eff);
    }
    slot.effects.length = 0;
  },

  tick(slot: IMinitSlot): void {
    for (let i = slot.effects.length - 1; i >= 0; i--) {
      const eff = slot.effects[i];
      eff.tick(slot);
      if (eff.isExpired()) {
        this._removeInstance(slot, eff);
        slot.effects.splice(i, 1);
      }
    }
  },

  _removeInstance(slot: IMinitSlot, eff: IEffectInstance): void {
    if (eff.def.onRemove) {
      try {
        eff.def.onRemove(slot, eff);
      } catch {
        // Handled silently
      }
    }
    if (slot.arena && slot.arena.fxPool) {
      const p = slot.arena.getPixelCoords(slot.log.x, slot.log.y);
      slot.arena.fxPool.spawnShockwave(p.px, p.py, eff.color, 40, 2);
    }
  },

  _notify(slot: IMinitSlot, eff: IEffectInstance, kind: 'apply' | 'stack' | 'refresh'): void {
    const a = slot.arena;
    if (!a) return;
    const p = a.getPixelCoords(slot.log.x, slot.log.y);
    a.fxPool.spawnShockwave(p.px, p.py, eff.color, 50, 3);
    for (let i = 0; i < 8; i++) {
      const ang = FastMath.rand() * Math.PI * 2;
      a.fxPool.spawnPhysics(
        'fx_flash',
        p.px + Math.cos(ang) * 8,
        p.py + Math.sin(ang) * 8,
        Math.cos(ang) * FastMath.randRange(1, 3),
        Math.sin(ang) * FastMath.randRange(-3, -1),
        20,
        0.9,
        0.9,
        true
      );
    }
    const suffix = kind === 'stack' ? ` x${eff.stacks}` : kind === 'refresh' ? ' +' : '';
    a.spawnToast(p.px, p.py - 20, `${eff.label}${suffix}`, eff.color);
  }
};
