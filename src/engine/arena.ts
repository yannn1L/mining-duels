import * as PIXI from 'pixi.js';
import { CFG, numToHex } from '../data/config';
import { MINIT_DB } from '../data/minits';
import {
  BehaviorPayload,
  BlueprintOrPayload,
  DebugConfig,
  DebugEntityInfo,
  Entity,
  IArena,
  IMinitSlot,
  MinitDef,
  PlayerTelemetry
} from '../types/game';
import { AssetBaker } from './assetBaker';
import { AudioSys } from './audio';
import { toPayload } from './blueprint';
import { FastMath, SparseSet } from './fastMath';
import { MinitSlot } from './minitSlot';
import { Textures } from './textures';
import { VFXPool } from './vfxPool';

interface ViewportBlock {
  c: PIXI.Container;
  b: PIXI.Sprite;
  cr: PIXI.Sprite;
  lastGy: number;
  dirty: boolean;
}

interface ToastItem {
  text: PIXI.Text;
  active: boolean;
  lastText: string;
  lastColor: number;
  fx: number;
  fy: number;
  life: number;
  maxLife: number;
  vy: number;
  vx: number;
}

/**
 * Lightweight no-op VFXPool used during Headless Balance Check simulations
 * so zero GPU/Sprite allocations occur while keeping full API compatibility.
 */
const HEADLESS_FX_POOL = {
  lod: 0,
  activeCount: 0,
  spawnPhysics() {},
  spawnShockwave() {},
  spawnLaser() {},
  spawnDmgText() {},
  update() {}
} as unknown as VFXPool;

export class Arena extends PIXI.Container implements IArena {
  public cols: number;
  public rows: number;
  public ts: number;
  public halfTs: number;
  public maxDepth: number;
  public vfxLod: number;
  private baseVfxLod: number;
  private smoothDt = 1.0;
  public headless: boolean;

  public camY = 0;
  public logCamY = 0;
  public shake = 0;
  public simTicks = 0;
  public tickAcc = 0;
  public flashAlpha = 0;
  public renderScale = 1;

  public opponentArena: IArena | null = null;
  public slots: IMinitSlot[] = [];

  public view: PIXI.Container;
  public worldContainer: PIXI.Container;
  public sprLayer: PIXI.Container;
  public minitLayer: PIXI.Container;
  public fxLayer: PIXI.Container;
  public toastLayer: PIXI.Container;
  public debugLayer: PIXI.Graphics;
  public layer: PIXI.Container;
  public fxPool: VFXPool;

  private bgSprite: PIXI.Sprite;
  private screenFlash: PIXI.Sprite;
  private maskGfx: PIXI.Graphics;

  private gridHP: Float32Array;
  private textCooldowns: Int32Array;
  private vpBlocks: ViewportBlock[] = [];
  private readonly RENDER_ROWS: number;
  private lastCYInt = -1;
  private hasDirtyBlocks = true;
  private _debugWasDirty = false;

  private ents: Entity[] = [];
  private activeEnts = new SparseSet<Entity>();
  private entIdx = 0;
  private _deadScratch: Entity[] = [];
  private toastPool: ToastItem[] = [];
  private toastIdx = 0;
  private lastToastTick = -10;
  private lastToastKey = '';

  constructor(minitIdOrIds: string | string[], totalArenas = 2, headless = false) {
    super();

    this.headless = headless;
    this.cols = CFG.GRID.COLS;
    this.rows = CFG.GRID.ROWS;
    this.ts = CFG.GRID.TS;
    this.halfTs = CFG.GRID.HALF_TS;
    this.maxDepth = CFG.GRID.MAX_DEPTH;
    this.RENDER_ROWS = this.rows + 3;
    this.baseVfxLod = headless ? 0 : CFG.SIM.VFX_LOD[totalArenas] || 1.0;
    this.vfxLod = this.baseVfxLod;

    const W = this.cols * this.ts;
    const H = this.rows * this.ts;

    this.view = new PIXI.Container();
    this.worldContainer = new PIXI.Container();
    this.sprLayer = new PIXI.Container();
    this.minitLayer = new PIXI.Container();
    this.fxLayer = new PIXI.Container();
    this.toastLayer = new PIXI.Container();
    this.debugLayer = new PIXI.Graphics();
    this.layer = this.fxLayer;

    this.bgSprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
    this.screenFlash = new PIXI.Sprite(PIXI.Texture.WHITE);
    this.maskGfx = new PIXI.Graphics();

    if (!headless) {
      this.addChild(this.view);

      this.maskGfx.beginFill(0xffffff).drawRect(0, 0, W, H).endFill();
      this.addChild(this.maskGfx);
      this.view.mask = this.maskGfx;

      this.bgSprite.texture = Textures['arena_bg'] || PIXI.Texture.EMPTY;
      this.view.addChild(this.bgSprite);

      // Unified World-Space Container: rocks, minits, particles, lasers, toasts, and debug wireframes
      // all live in World Space and scroll together via worldContainer.y!
      this.worldContainer.addChild(
        this.sprLayer,
        this.minitLayer,
        this.fxLayer,
        this.toastLayer,
        this.debugLayer
      );
      this.view.addChild(this.worldContainer);

      this.screenFlash.width = W;
      this.screenFlash.height = H;
      this.screenFlash.alpha = 0;
      this.screenFlash.blendMode = PIXI.BLEND_MODES.ADD;
      this.view.addChild(this.screenFlash);
    }

    const totalCells = this.maxDepth * this.cols;
    this.gridHP = new Float32Array(totalCells);
    this.textCooldowns = new Int32Array(totalCells);

    if (!headless) {
      this._initViewportPool();
    }
    this._initGrid();
    this._initEntityPool();

    this.fxPool = headless ? HEADLESS_FX_POOL : new VFXPool(this.fxLayer);

    const ids = Array.isArray(minitIdOrIds) ? minitIdOrIds : [minitIdOrIds];
    ids.forEach((id, i) => {
      const slot = new MinitSlot(id, this, i, MINIT_DB[id]);
      this.slots.push(slot);
      if (!headless) {
        this.minitLayer.addChild(slot.spr, slot.effectsUI);
      }
    });
  }

  public get mLog() {
    return this.slots[0]?.log ?? { x: (this.cols / 2) | 0, y: 0, t: 0 };
  }

  public get mSpr() {
    return this.slots[0]?.spr;
  }

  public get mState() {
    return this.slots[0]?.state ?? {};
  }

  public get md(): MinitDef<any, any> {
    return this.slots[0]?.md;
  }

  public get animScale() {
    return this.slots[0]?.animScale ?? { x: 1, y: 1, tX: 1, tY: 1 };
  }

  public get stats() {
    let totalD = 0;
    let maxDp = 0;
    for (const s of this.slots) {
      totalD += s.stats.d;
      if (s.stats.maxDp > maxDp) maxDp = s.stats.maxDp;
    }
    return { d: totalD, maxDp };
  }

  public getOpponentSlot(selfSlot: IMinitSlot): IMinitSlot | null {
    const localEnemy = this.slots.find((sl) => sl !== selfSlot && !sl.disabled);
    if (localEnemy) return localEnemy;
    if (this.opponentArena && this.opponentArena.slots.length > 0) {
      const opp = this.opponentArena.slots.find((sl) => !sl.disabled);
      if (opp) return opp;
    }
    return null;
  }

  private _initViewportPool(): void {
    const TS = this.ts;
    for (let y = 0; y < this.RENDER_ROWS; y++) {
      for (let x = 0; x < this.cols; x++) {
        const c = new PIXI.Container();
        c.position.set(x * TS, y * TS);

        const b = new PIXI.Sprite(AssetBaker.ROCK_TEXTURES[0]);
        const cr = new PIXI.Sprite(Textures['crack_1']);
        cr.visible = false;

        c.addChild(b, cr);
        this.sprLayer.addChild(c);
        this.vpBlocks.push({ c, b, cr, lastGy: -1, dirty: true });
      }
    }
  }

  private _initEntityPool(): void {
    for (let i = 0; i < 600; i++) {
      this.ents.push({
        entId: i,
        active: false,
        dead: false,
        x: 0,
        y: 0,
        curX: 0,
        curY: 0,
        dx: 0,
        dy: 0,
        startX: 0,
        startY: 0,
        tx: 0,
        ty: 0,
        l: 0,
        maxL: 0,
        f: 0,
        step: 0,
        ang: 0,
        hitGround: false,
        spinning: false,
        pinned: false,
        fallTimer: 0,
        traits: [],
        p: {},
        state: {},
        counter: 0,
        owner: null
      });
    }
  }

  private _initGrid(): void {
    const COLS = this.cols;
    const startX = (COLS / 2) | 0;
    for (let y = 0; y < this.maxDepth; y++) {
      const maxHp = CFG.ARENA.BASE_HP + y * CFG.ARENA.HP_SCALING;
      for (let x = 0; x < COLS; x++) {
        this.gridHP[y * COLS + x] = maxHp;
      }
    }
    this.gridHP[0 * COLS + startX] = 0;
    this.gridHP[1 * COLS + startX] = 0;
  }

  public clampX(x: number): number {
    return Math.max(0, Math.min(this.cols - 1, x));
  }

  public clampY(y: number): number {
    return Math.max(0, Math.min(this.maxDepth - 1, y));
  }

  public getPixelCoords(gx: number, gy: number): { px: number; py: number } {
    return {
      px: gx * this.ts + this.halfTs,
      py: gy * this.ts + this.halfTs
    };
  }

  public getHP(x: number, y: number): number {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.maxDepth) return 9999;
    return this.gridHP[y * this.cols + x];
  }

  public triggerFlash(a = 0.5): void {
    if (this.headless) return;
    this.flashAlpha = Math.max(this.flashAlpha, a);
  }

  public spawnEnt(
    propsOrBlueprint: BlueprintOrPayload,
    overrides: Partial<BehaviorPayload> = {}
  ): Entity | null {
    const props = toPayload(propsOrBlueprint, overrides);
    for (let i = 0; i < this.ents.length; i++) {
      this.entIdx = (this.entIdx + 1) % this.ents.length;
      const e = this.ents[this.entIdx];
      if (e.active) continue;
      e.active = true;
      e.dead = false;
      e.hitGround = false;
      e.spinning = false;
      e.pinned = false;
      e.fallTimer = 0;
      e.step = 0;
      e.x = props.x ?? 0;
      e.y = props.y ?? 0;
      e.startX = props.startX ?? e.x;
      e.startY = props.startY ?? e.y;
      e.curX = props.curX ?? props.startX ?? e.x;
      e.curY = props.curY ?? props.startY ?? e.y;
      e.tx = props.tx ?? 0;
      e.ty = props.ty ?? 0;
      e.dx = props.dx ?? 0;
      e.dy = props.dy ?? 0;
      e.l = props.l ?? 0;
      e.maxL = props.maxL ?? e.l;
      e.f = props.f ?? 0;
      e.ang = props.ang ?? 0;
      e.traits = props.traits || [];
      e.p = props.p || {};
      e.state = {};
      e.counter = 0;
      e.owner = props.owner || null;
      this.activeEnts.add(e);
      return e;
    }
    return null;
  }

  private _markDirty(x: number, y: number): void {
    if (this.headless) return;
    const cYInt = Math.max(0, Math.floor(this.camY));
    const rY = y - cYInt;
    if (rY < 0 || rY >= this.RENDER_ROWS) return;
    const vpb = this.vpBlocks[rY * this.cols + x];
    if (vpb) {
      vpb.dirty = true;
      this.hasDirtyBlocks = true;
    }
  }

  public dmg(
    x: number,
    y: number,
    amount: number,
    showText: boolean | number = false,
    fxColor = 0xff0000,
    creditTo: IMinitSlot | null = null
  ): boolean {
    const COLS = this.cols;
    const TS = this.ts;
    const HALF_TS = this.halfTs;
    const ROWS = this.rows;

    if (x < 0 || x >= COLS || y < 0 || y >= this.maxDepth) return false;
    const id = y * COLS + x;
    const curHp = this.gridHP[id];
    if (curHp <= 0) return false;

    const maxHp = CFG.ARENA.BASE_HP + y * CFG.ARENA.HP_SCALING;
    const oldPct = curHp / maxHp;
    this.gridHP[id] -= amount;
    const newPct = this.gridHP[id] / maxHp;

    if (!this.headless) {
      this._markDirty(x, y);

      const rY = y - Math.floor(this.camY);
      const worldPX = x * TS + HALF_TS;
      const worldPY = y * TS + HALF_TS;

      if (rY >= -2 && rY <= ROWS + 2) {
        if (showText && this.simTicks > this.textCooldowns[id]) {
          this.textCooldowns[id] = this.simTicks + CFG.VFX.TEXT_COOLDOWN;
          this.fxPool.spawnDmgText(worldPX, worldPY - 4, amount, fxColor);
        }
        if (((oldPct * 4) | 0) > ((newPct * 4) | 0) && this.gridHP[id] > 0) {
          const dC = Math.ceil(2 * this.vfxLod);
          for (let i = 0; i < dC; i++) {
            this.fxPool.spawnPhysics(
              'fx_dust',
              worldPX,
              worldPY,
              FastMath.randRange(-2, 2),
              FastMath.randRange(-3, 0),
              15,
              0.85,
              0.9,
              true
            );
          }
        }
      }
    }

    if (this.gridHP[id] <= 0) {
      this.gridHP[id] = 0;
      if (creditTo) creditTo.stats.d++;
      else if (this.slots.length > 0) this.slots[0].stats.d++;
      if (!this.headless) {
        AudioSys.play('crush');
        const rY = y - Math.floor(this.camY);
        if (rY >= -2 && rY <= ROWS + 2) {
          const worldPX = x * TS + HALF_TS;
          const worldPY = y * TS + HALF_TS;
          const cC = Math.ceil(6 * this.vfxLod);
          for (let i = 0; i < cC; i++) {
            this.fxPool.spawnPhysics(
              'fx_dust',
              worldPX,
              worldPY,
              FastMath.randRange(-4, 4),
              FastMath.randRange(-7, -2),
              25,
              0.8,
              0.95,
              true
            );
          }
        }
      }
      return true;
    } else if (!showText && !this.headless) {
      AudioSys.play('hit', 0.5);
    }
    return false;
  }

  public dmgAoE(
    cx: number,
    cy: number,
    range: number,
    amt: number,
    color: number,
    creditTo: IMinitSlot | null = null
  ): void {
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        this.dmg(cx + dx, cy + dy, amt, true, color, creditTo);
      }
    }
  }

  public spawnToast(pX: number, pY: number, text: string, color: number): void {
    if (this.headless) return;
    // Deduplicate identical toasts fired within 4 simulation ticks
    if (this.simTicks - this.lastToastTick < 4 && this.lastToastKey === text) {
      return;
    }
    this.lastToastTick = this.simTicks;
    this.lastToastKey = text;

    const MAX_TOASTS = 10;
    let item: ToastItem;

    if (this.toastPool.length < MAX_TOASTS) {
      const t = new PIXI.Text(text, {
        fontFamily: '"Orbitron", sans-serif',
        fontWeight: '800',
        fontSize: 9,
        fill: numToHex(color),
        stroke: '#000000',
        strokeThickness: 3,
        padding: 2
      });
      t.resolution = 2;
      t.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
      t.anchor.set(0.5);
      this.toastLayer.addChild(t);
      item = {
        text: t,
        active: true,
        lastText: text,
        lastColor: color,
        fx: pX,
        fy: pY,
        life: 42,
        maxLife: 42,
        vy: -1.0,
        vx: FastMath.randRange(-0.3, 0.3)
      };
      this.toastPool.push(item);
    } else {
      this.toastIdx = (this.toastIdx + 1) % MAX_TOASTS;
      item = this.toastPool[this.toastIdx];
      if (item.lastColor !== color) {
        item.text.style.fill = numToHex(color);
        item.lastColor = color;
      }
      if (item.lastText !== text) {
        item.text.text = text;
        item.lastText = text;
      }
      item.active = true;
      item.fx = pX;
      item.fy = pY;
      item.life = 42;
      item.maxLife = 42;
      item.vy = -1.0;
      item.vx = FastMath.randRange(-0.3, 0.3);
    }

    item.text.visible = true;
    item.text.x = Math.round(pX);
    item.text.y = Math.round(pY);
    item.text.alpha = 1;
  }

  private _tickToasts(timeScale: number): void {
    for (let i = 0, len = this.toastPool.length; i < len; i++) {
      const t = this.toastPool[i];
      if (!t.active) continue;
      t.life -= timeScale;
      if (t.life <= 0) {
        t.active = false;
        t.text.visible = false;
        continue;
      }
      t.fy += t.vy * timeScale;
      t.fx += t.vx * timeScale;
      t.text.x = Math.round(t.fx);
      t.text.y = Math.round(t.fy);
      t.text.alpha = Math.min(1, t.life / 18);
    }
  }

  public update(
    renderTimeScale: number,
    shouldUpdateLogic: boolean,
    logicTimeScale: number
  ): void {
    if (shouldUpdateLogic) {
      this.tickAcc += logicTimeScale + 0.0001;
      let iterations = 0;
      while (this.tickAcc >= 1.0 && iterations < CFG.SIM.MAX_ITERATIONS) {
        this.tickLogic();
        this.tickAcc -= 1.0;
        iterations++;
      }
      if (this.tickAcc > 2.0) this.tickAcc = 0;
    }
    if (!this.headless) {
      this.updateVisuals(renderTimeScale);
    }
  }

  public tickLogic(): void {
    this.simTicks++;
    for (const slot of this.slots) slot.tick();

    const ents = this.activeEnts.items;
    const n = ents.length;
    for (let i = 0; i < n; i++) {
      const e = ents[i];
      for (let j = 0; j < e.traits.length; j++) {
        const traitFn = e.traits[j];
        try {
          traitFn(e, this);
        } catch (err) {
          console.error('[Arena] entity trait execution error:', err);
        }
      }
    }

    this._deadScratch.length = 0;
    for (let i = 0; i < ents.length; i++) {
      if (ents[i].dead) this._deadScratch.push(ents[i]);
    }
    for (const e of this._deadScratch) {
      e.active = false;
      this.activeEnts.remove(e);
    }
  }

  /**
   * Renders live debug overlays (hitboxes, trajectories, AoE blast radii, beams,
   * slot roam ranges, and grid cell lines) in world space.
   */
  public renderDebug(debugCfg: DebugConfig): void {
    if (this.headless) return;
    const g = this.debugLayer;
    if (!debugCfg.enabled) {
      if (this._debugWasDirty) {
        g.clear();
        this._debugWasDirty = false;
      }
      return;
    }
    this._debugWasDirty = true;
    g.clear();

    const TS = this.ts;
    const HALF_TS = this.halfTs;
    const cYInt = Math.max(0, Math.floor(this.camY));

    // 1. Optional Grid Overlay
    if (debugCfg.showGridCoords) {
      g.lineStyle(1, 0x00ffff, 0.14);
      const startY = cYInt * TS;
      const endY = Math.min(this.maxDepth, cYInt + this.RENDER_ROWS) * TS;
      for (let x = 0; x <= this.cols; x++) {
        g.moveTo(x * TS, startY).lineTo(x * TS, endY);
      }
      for (let gy = cYInt; gy <= cYInt + this.RENDER_ROWS; gy++) {
        g.moveTo(0, gy * TS).lineTo(this.cols * TS, gy * TS);
      }
    }

    if (!debugCfg.showHitboxes) return;

    // 2. Slot Bounding Boxes, Roam Radius & Target Indicators
    for (const slot of this.slots) {
      const p = this.getPixelCoords(slot.log.x, slot.log.y);
      const mColor = slot.md.color || 0x00ffff;

      // Logical grid cell outline (cyan)
      g.lineStyle(1.5, 0x00ffff, 0.9);
      g.drawRect(slot.log.x * TS + 1, slot.log.y * TS + 1, TS - 2, TS - 2);

      // Visual world position crosshair (magenta)
      g.lineStyle(1, 0xff00ff, 0.85);
      g.drawCircle(slot.worldX, slot.worldY, 5);
      g.moveTo(slot.worldX - 7, slot.worldY).lineTo(slot.worldX + 7, slot.worldY);
      g.moveTo(slot.worldX, slot.worldY - 7).lineTo(slot.worldX, slot.worldY + 7);

      // Roam horizontal corridor
      if (slot.md.roam > 0) {
        const minX = this.clampX(slot.log.x - slot.md.roam) * TS;
        const maxX = (this.clampX(slot.log.x + slot.md.roam) + 1) * TS;
        g.lineStyle(1, mColor, 0.45);
        g.drawRect(minX, slot.log.y * TS + 3, maxX - minX, TS - 6);
      }

      // Line from interpolated visual pos to logical cell center
      g.lineStyle(1, 0x00ffff, 0.4);
      g.moveTo(slot.worldX, slot.worldY).lineTo(p.px, p.py);
    }

    // 3. Active Entities: Hitboxes, Trajectories, AoE Radii, Beams, Orbits
    const ents = this.activeEnts.items;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      const gx = e.curX ?? e.x;
      const gy = e.curY ?? e.y;
      const px = gx * TS + HALF_TS;
      const py = gy * TS + HALF_TS;

      // Inspect attached trait metadata
      let aoeRadius = 0;
      let beamLen = 0;
      let hasTarget = false;
      let orbitRad = 0;
      let debugColor = 0xffcc00;

      for (let j = 0; j < e.traits.length; j++) {
        const meta = e.traits[j]._debugMeta;
        if (!meta) continue;
        if (meta.debugRadius && meta.debugRadius > aoeRadius) {
          aoeRadius = meta.debugRadius;
        }
        if (meta.debugBeamLength && meta.debugBeamLength > beamLen) {
          beamLen = meta.debugBeamLength;
        }
        if (meta.hasTarget) hasTarget = true;
        if (meta.orbitRadius) orbitRad = meta.orbitRadius;
        if (meta.debugColor) debugColor = meta.debugColor;
      }

      // Draw Entity Core Cell / Hitbox
      g.lineStyle(1.25, debugColor, 0.9);
      g.drawRect(px - 6, py - 6, 12, 12);

      // Draw Velocity Vector
      if (Math.abs(e.dx) > 0.01 || Math.abs(e.dy) > 0.01) {
        g.lineStyle(1, 0x00ff88, 0.85);
        g.moveTo(px, py).lineTo(px + e.dx * TS * 2.5, py + e.dy * TS * 2.5);
      }

      // Draw Target Trajectory Line & Target Crosshair
      if (hasTarget || (e.tx !== 0 && e.ty !== 0)) {
        const tpx = e.tx * TS + HALF_TS;
        const tpy = e.ty * TS + HALF_TS;
        g.lineStyle(1, 0xffaa00, 0.65);
        g.moveTo(px, py).lineTo(tpx, tpy);
        g.drawCircle(tpx, tpy, 5);
      }

      // Draw AoE Blast / Acid / Detonation Footprint
      if (aoeRadius > 0) {
        const span = (aoeRadius * 2 + 1) * TS;
        const rx = Math.round(gx) * TS - aoeRadius * TS;
        const ry = Math.round(gy) * TS - aoeRadius * TS;
        g.lineStyle(1, 0xff4444, 0.55);
        g.beginFill(0xff4444, 0.08);
        g.drawRect(rx, ry, span, span);
        g.endFill();
      }

      // Draw Vertical Beam Column Outline
      if (beamLen > 0) {
        const bx = Math.round(gx) * TS + 2;
        const by = Math.round(gy) * TS;
        const bh = Math.min(beamLen, this.maxDepth - Math.round(gy)) * TS;
        g.lineStyle(1.25, 0x00ffff, 0.75);
        g.beginFill(0x00ffff, 0.1);
        g.drawRect(bx, by, TS - 4, bh);
        g.endFill();
      }

      // Draw Orbit Circle around Owner
      if (orbitRad > 0 && e.owner) {
        const op = this.getPixelCoords(e.owner.log.x, e.owner.log.y);
        g.lineStyle(1, 0x33ffcc, 0.4);
        g.drawCircle(op.px, op.py, orbitRad * TS);
      }
    }
  }

  /**
   * Produces a structured snapshot of the Arena's primary MinitSlot and active entities
   * for the Live Debug Entity Inspector panel.
   */
  public getDebugSnapshot(): PlayerTelemetry['debug'] {
    const slot = this.slots[0];
    const ents = this.activeEnts.items;
    const entityInfos: DebugEntityInfo[] = [];

    const maxInspect = Math.min(ents.length, 24);
    for (let i = 0; i < maxInspect; i++) {
      const e = ents[i];
      const traitNames = e.traits.map((t) => t._traitName || 'customTrait');
      entityInfos.push({
        entId: e.entId,
        x: Math.round((e.curX ?? e.x) * 10) / 10,
        y: Math.round((e.curY ?? e.y) * 10) / 10,
        tx: e.tx,
        ty: e.ty,
        life: e.l,
        maxLife: e.maxL,
        traits: traitNames
      });
    }

    // Safe shallow serialization of custom Minit state
    const cleanState: Record<string, any> = {};
    if (slot && slot.state) {
      for (const [k, v] of Object.entries(slot.state)) {
        if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') {
          cleanState[k] = typeof v === 'number' ? Math.round(v * 100) / 100 : v;
        } else if (Array.isArray(v)) {
          cleanState[k] = `Array(${v.length})`;
        } else if (v && typeof v === 'object') {
          cleanState[k] = '{...}';
        }
      }
    }

    return {
      simTicks: this.simTicks,
      camY: Math.round(this.camY * 10) / 10,
      gridX: slot ? slot.log.x : 0,
      gridY: slot ? slot.log.y : 0,
      worldX: slot ? Math.round(slot.worldX) : 0,
      worldY: slot ? Math.round(slot.worldY) : 0,
      cdTick: slot ? slot.log.t : 0,
      cdMax: slot ? Math.max(1, Math.floor(slot.md.cd / slot.modifiers.speedMul)) : 1,
      speedMul: slot ? Math.round(slot.modifiers.speedMul * 100) / 100 : 1,
      dmgMul: slot ? Math.round(slot.modifiers.dmgMul * 100) / 100 : 1,
      activeEntCount: ents.length,
      entities: entityInfos,
      customState: cleanState
    };
  }

  public updateVisuals(timeScale: number): void {
    if (this.headless) return;

    // Adaptive VFX LOD Throttling based on rolling frame time and active particle saturation
    this.smoothDt = this.smoothDt * 0.9 + timeScale * 0.1;
    const pRatio = this.fxPool.activeCount / CFG.VFX.PHYSICS_LIMIT;
    const dtFactor =
      this.smoothDt > 1.16 ? Math.max(0.25, 1.0 - (this.smoothDt - 1.12) * 0.85) : 1.0;
    const poolFactor =
      pRatio > 0.5 ? Math.max(0.25, 1.0 - (pRatio - 0.5) * 1.4) : 1.0;
    this.vfxLod = this.baseVfxLod * Math.min(dtFactor, poolFactor);
    this.fxPool.lod = this.vfxLod;

    for (const slot of this.slots) {
      slot.updateVisuals(timeScale);
    }

    const primarySlot = this.slots[0];
    if (primarySlot) {
      const smoothGridY = (primarySlot.worldY - this.halfTs) / this.ts;
      this.logCamY = Math.max(
        0,
        Math.min(smoothGridY - this.rows * 0.42, this.maxDepth - this.rows)
      );
    }

    const camLerp = Math.min(1, CFG.RENDER.CAM_LERP * timeScale);
    this.camY += (this.logCamY - this.camY) * camLerp;

    const snapFactor = Math.max(1, this.renderScale);
    const rawWorldY = -this.camY * this.ts;
    this.worldContainer.y = Math.round(rawWorldY * snapFactor) / snapFactor;

    const cYInt = Math.max(0, Math.floor(this.camY));

    // Only traverse viewport blocks when camera crosses a row boundary or blocks took damage
    if (cYInt !== this.lastCYInt || this.hasDirtyBlocks) {
      this.lastCYInt = cYInt;
      this.hasDirtyBlocks = false;

      const COLS = this.cols;
      const N = this.RENDER_ROWS;
      const TS = this.ts;

      for (let vy = 0; vy < N; vy++) {
        const gy = cYInt + vy;
        const worldYPos = gy * TS;
        const maxHp = CFG.ARENA.BASE_HP + gy * CFG.ARENA.HP_SCALING;
        const rockIdx = Math.min(4, (gy / 20) | 0);
        const texRock = AssetBaker.ROCK_TEXTURES[rockIdx];

        for (let vx = 0; vx < COLS; vx++) {
          const vpb = this.vpBlocks[vy * COLS + vx];

          if (vpb.lastGy !== gy) {
            vpb.lastGy = gy;
            vpb.c.y = worldYPos;
            vpb.dirty = true;
          }

          if (vpb.dirty) {
            vpb.dirty = false;
            const hp = this.getHP(vx, gy);
            if (hp <= 0 || hp === 9999) {
              vpb.c.visible = false;
            } else {
              vpb.c.visible = true;
              vpb.b.texture = texRock;
              vpb.b.alpha = 1.0;
              const pct = hp / maxHp;
              if (pct > 0.9) {
                vpb.cr.visible = false;
              } else {
                vpb.cr.visible = true;
                if (pct > 0.75) vpb.cr.texture = Textures['crack_1'];
                else if (pct > 0.5) vpb.cr.texture = Textures['crack_2'];
                else if (pct > 0.25) vpb.cr.texture = Textures['crack_3'];
                else vpb.cr.texture = Textures['crack_4'];
              }
            }
          }
        }
      }
    }

    this.fxPool.update(timeScale);
    this._tickToasts(timeScale);

    if (this.flashAlpha > 0) {
      this.screenFlash.alpha = this.flashAlpha;
      this.flashAlpha = Math.max(0, this.flashAlpha - 0.05 * timeScale);
    } else if (this.screenFlash.alpha !== 0) {
      this.screenFlash.alpha = 0;
    }

    if (this.shake > 0) {
      const sx = Math.round(FastMath.randRange(-this.shake / 2, this.shake / 2));
      const sy = Math.round(FastMath.randRange(-this.shake / 2, this.shake / 2));
      this.view.position.set(sx, sy);
      this.shake *= Math.pow(0.82, timeScale);
      if (this.shake < 0.5) this.shake = 0;
    } else if (this.view.position.x !== 0 || this.view.position.y !== 0) {
      this.view.position.set(0, 0);
    }
  }

  public destroy(options?: PIXI.IDestroyOptions | boolean): void {
    if (this.fxPool && typeof (this.fxPool as any).destroy === 'function') {
      (this.fxPool as any).destroy();
    }
    this.fxPool = HEADLESS_FX_POOL;
    for (const slot of this.slots) {
      try {
        slot.destroy();
      } catch (e) {
        console.warn('[Arena] slot destroy error:', e);
      }
    }
    for (const t of this.toastPool) {
      if (t.text && !t.text.destroyed) t.text.destroy();
    }
    this.toastPool.length = 0;
    super.destroy(options);
  }
}
