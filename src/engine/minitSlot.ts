import * as PIXI from 'pixi.js';
import { CFG } from '../data/config';
import { MINIT_DB } from '../data/minits';
import {
  BehaviorPayload,
  BlueprintOrPayload,
  EffectApplyOpts,
  Entity,
  IArena,
  IEffectInstance,
  IMinitSlot,
  MinitContext,
  MinitDef
} from '../types/game';
import { AudioSys } from './audio';
import { toPayload } from './blueprint';
import { EffectManager } from './effectSystem';
import { FastMath } from './fastMath';
import { Textures } from './textures';

export class MinitSlot implements IMinitSlot {
  public id: string;
  public md: MinitDef<any, any>;
  public arena: IArena;
  public slotIndex: number;
  public log: { x: number; y: number; t: number };
  public worldX: number;
  public worldY: number;
  public spr: PIXI.Sprite;
  public animScale = { x: 1, y: 1, tX: 1, tY: 1 };
  public baseScale = 1.0;
  public state: Record<string, any>;
  public ctx: MinitContext<any, any>;
  public stats = { d: 0, maxDp: 0 };
  public modifiers = {
    speedMul: 1.0,
    dmgMul: 1.0,
    blind: false,
    shieldCharges: 0
  };
  public effects: IEffectInstance[] = [];
  public effectsUI: PIXI.Container;
  private errorCount = 0;
  public disabled = false;
  public active = true;

  constructor(minitId: string, arena: IArena, slotIndex: number, minitData?: MinitDef<any, any>) {
    this.id = minitId;
    this.md = minitData || MINIT_DB[minitId];
    if (!this.md) {
      throw new Error(`[MinitSlot] Unknown minit: ${minitId}`);
    }
    this.arena = arena;
    this.slotIndex = slotIndex;

    const cols = arena.cols ?? CFG.GRID.COLS;
    const startX = (cols / 2) | 0;

    this.log = { x: startX, y: 0, t: 0 };

    const p = arena.getPixelCoords(this.log.x, this.log.y);
    this.worldX = p.px;
    this.worldY = p.py;

    this.spr = new PIXI.Sprite(Textures[`minit_${minitId}_base`]);
    this.spr.anchor.set(0.5);
    this.spr.x = Math.round(this.worldX);
    this.spr.y = Math.round(this.worldY);
    this.spr.scale.set(1, 1);

    this.effectsUI = new PIXI.Container();
    this.effectsUI.position.set(Math.round(this.worldX), Math.round(this.worldY - 22));

    this.state = { wasFalling: false, arena, slot: this };

    this.ctx = {
      state: this.state,
      arena: this.arena,
      slot: this,
      spr: this.spr,
      config: this.md.config,
      tex: (name: string) => this.tex(name),
      playSound: (id: string, volMult = 1.0) => AudioSys.play(id, volMult),
      spawn: (blueprint: BlueprintOrPayload, overrides?: Partial<BehaviorPayload>) =>
        this.spawn(blueprint, overrides)
    };

    if (this.md.onInit) {
      try {
        this.md.onInit(this.ctx);
      } catch (e) {
        console.error(`[MinitSlot:${minitId}] onInit:`, e);
      }
    }
  }

  /**
   * Resolves a Minit-local VFX texture name (e.g. 'potion_acid') to its baked key
   * ('minit_alchemist_vfx_potion_acid') or returns global keys ('fx_dust') unchanged.
   */
  public tex(name: string): string {
    if (!name || name.startsWith('minit_')) return name;
    if (this.md.vfx) {
      const short = name.replace(/^fx_/, '');
      if (this.md.vfx[short]) {
        return `minit_${this.id}_vfx_${short}`;
      }
      if (this.md.vfx[name]) {
        return `minit_${this.id}_vfx_${name}`;
      }
    }
    return name;
  }

  /**
   * Spawns an Entity from a fluent EntityBlueprint or BehaviorPayload, automatically
   * binding ownership, default coordinates, and sound playback.
   */
  public spawn(
    blueprint: BlueprintOrPayload,
    overrides: Partial<BehaviorPayload> = {}
  ): Entity | null {
    const built = toPayload(blueprint, {
      x: this.log.x,
      y: this.log.y,
      owner: this,
      ...overrides
    });
    if (built.sound) {
      AudioSys.play(built.sound, built.soundVol ?? 1.0);
    }
    return this.arena.spawnEnt(built);
  }

  public isFalling(): boolean {
    return (
      this.arena.getHP(this.log.x, this.log.y + 1) === 0 &&
      this.log.y < this.arena.maxDepth - 1
    );
  }

  public moveStep(): void {
    const ml = this.log;
    const md = this.md;
    if (this.isFalling()) {
      ml.y++;
      this.animScale.tY = 1.28;
      this.animScale.tX = 0.72;
      this.state.wasFalling = true;
    } else {
      if (this.state.wasFalling) {
        this.animScale.tY = 0.72;
        this.animScale.tX = 1.28;
        this.state.wasFalling = false;
      }
      if (FastMath.rand() < md.roam * this.modifiers.speedMul) {
        const dir = FastMath.rand() > 0.5 ? 1 : -1;
        const cols = this.arena.cols ?? CFG.GRID.COLS;
        if (
          ml.x + dir >= 0 &&
          ml.x + dir < cols &&
          this.arena.getHP(ml.x + dir, ml.y) === 0
        ) {
          ml.x += dir;
        }
      }
    }
  }

  public tick(): void {
    if (this.disabled) return;
    try {
      this._tickInternal();
    } catch (e) {
      this.errorCount++;
      console.error(`[MinitSlot:${this.id}] tick error (${this.errorCount}):`, e);
      if (this.errorCount >= 3) {
        this.disabled = true;
      }
    }
  }

  private _tickInternal(): void {
    const ml = this.log;
    const md = this.md;

    this.moveStep();

    const effectiveCd = Math.max(1, Math.floor(md.cd / this.modifiers.speedMul));
    ml.t++;
    if (ml.t >= effectiveCd) {
      ml.t = 0;
      this.animScale.tX = 1.28;
      this.animScale.tY = 0.72;
      if (md.onTrigger) {
        md.onTrigger(this.ctx);
      }
    }

    if (md.onTick) {
      md.onTick(this.ctx);
    }

    EffectManager.tick(this);
    this.stats.maxDp = Math.max(this.stats.maxDp, ml.y);
    this._updateEffectsUI();
  }

  public addEffect(id: string, opts?: EffectApplyOpts): IEffectInstance | null {
    return EffectManager.apply(this, id, opts || {});
  }

  public removeEffect(id: string): boolean {
    return EffectManager.remove(this, id);
  }

  public hasEffect(id: string): boolean {
    return EffectManager.has(this, id);
  }

  public getEffect(id: string): IEffectInstance | null {
    return EffectManager.get(this, id);
  }

  public clearEffects(): void {
    EffectManager.clear(this);
  }

  private _updateEffectsUI(): void {
    const ui = this.effectsUI as PIXI.Container & { _effectCount?: number };
    if (!ui) return;

    if (ui._effectCount !== this.effects.length) {
      ui.removeChildren();
      for (const eff of this.effects) {
        const icon = new PIXI.Graphics();
        ui.addChild(icon);
        eff._uiIcon = icon;
      }
      const spacing = 10;
      const startX = -Math.round(((this.effects.length - 1) * spacing) / 2);
      this.effects.forEach((eff, i) => {
        if (eff._uiIcon) eff._uiIcon.x = startX + i * spacing;
      });
      ui._effectCount = this.effects.length;
    }

    for (const eff of this.effects) {
      const icon = eff._uiIcon as
        | (PIXI.Graphics & { _lastBarW?: number; _lastColor?: number })
        | undefined;
      if (!icon) continue;
      const pct = Math.max(0, Math.min(1, eff.duration / eff.def.defaultDur));
      const barW = Math.round(6 * pct);
      if (icon._lastBarW === barW && icon._lastColor === eff.color) continue;
      icon._lastBarW = barW;
      icon._lastColor = eff.color;
      icon.clear();
      icon.beginFill(0x000000, 0.85).drawRect(-4, -4, 8, 9).endFill();
      icon.beginFill(eff.color, 0.95).drawRect(-3, -3, 6, 5).endFill();
      icon.beginFill(eff.color, 1).drawRect(-3, 3, barW, 1).endFill();
    }
  }

  public updateVisuals(timeScale: number): void {
    const target = this.arena.getPixelCoords(this.log.x, this.log.y);
    const lerpFactor = Math.min(1, CFG.RENDER.LERP * timeScale);

    // Smooth interpolation in pure World Space (decoupled from camera scroll!)
    this.worldX += (target.px - this.worldX) * lerpFactor;
    this.worldY += (target.py - this.worldY) * lerpFactor;

    this.spr.x = this.worldX;
    this.spr.y = this.worldY;

    const tension = Math.min(1, CFG.RENDER.SPRING_TENSION * timeScale);
    const damp = Math.min(1, CFG.RENDER.SPRING_DAMP * timeScale);

    this.animScale.tX += (1.0 - this.animScale.tX) * tension;
    this.animScale.tY += (1.0 - this.animScale.tY) * tension;

    const targetScaleX = this.animScale.tX * this.baseScale;
    const targetScaleY = this.animScale.tY * this.baseScale;
    this.animScale.x += (targetScaleX - this.animScale.x) * damp;
    this.animScale.y += (targetScaleY - this.animScale.y) * damp;
    this.spr.scale.set(this.animScale.x, this.animScale.y);

    if (this.effectsUI) {
      this.effectsUI.position.set(
        Math.round(this.worldX),
        Math.round(this.worldY - 20 * this.baseScale)
      );
    }
  }

  public destroy(): void {
    EffectManager.clear(this);
    if (this.spr && this.spr.parent) this.spr.parent.removeChild(this.spr);
    if (this.effectsUI && this.effectsUI.parent) {
      this.effectsUI.parent.removeChild(this.effectsUI);
    }
    if (this.spr) this.spr.destroy();
    if (this.effectsUI) this.effectsUI.destroy({ children: true });
  }
}
