import * as PIXI from 'pixi.js';
import { CFG } from '../data/config';
import { DragLUT, FastMath } from './fastMath';
import { Textures } from './textures';

interface PhysicsParticle extends PIXI.Sprite {
  active: boolean;
  activeIdx: number;
  vx: number;
  vy: number;
  life: number;
  maxL: number;
  dragX: number;
  dragY: number;
  scaleDecay: boolean;
}

interface ShockwaveSprite extends PIXI.Sprite {
  active: boolean;
  activeIdx: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxL: number;
}

interface LaserGfx extends PIXI.Graphics {
  active: boolean;
  activeIdx: number;
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  color: number;
  w: number;
  life: number;
  maxL: number;
  jagged: boolean;
}

interface DmgTextContainer extends PIXI.Container {
  active: boolean;
  activeIdx: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
  life: number;
  maxL: number;
}

export class VFXPool {
  private c: PIXI.Container;
  private phys: PhysicsParticle[] = [];
  private txts: DmgTextContainer[] = [];
  private lzs: LaserGfx[] = [];
  private sws: ShockwaveSprite[] = [];

  private activePhys: PhysicsParticle[] = [];
  private activeTxts: DmgTextContainer[] = [];
  private activeLzs: LaserGfx[] = [];
  private activeSws: ShockwaveSprite[] = [];

  private pIdx = 0;
  private tIdx = 0;
  private lIdx = 0;
  private sIdx = 0;
  private _warnedMissing = new Set<string>();
  public destroyed = false;
  public lod = 1.0;

  constructor(c: PIXI.Container) {
    this.c = c;

    for (let i = 0; i < CFG.VFX.PHYSICS_LIMIT; i++) {
      const s = new PIXI.Sprite() as PhysicsParticle;
      s.visible = s.active = false;
      s.activeIdx = -1;
      s.anchor.set(0.5);
      this.c.addChild(s);
      this.phys.push(s);
    }

    for (let i = 0; i < CFG.VFX.TEXT_LIMIT; i++) {
      const cnt = new PIXI.Container() as DmgTextContainer;
      cnt.visible = cnt.active = false;
      cnt.activeIdx = -1;
      cnt.fx = 0;
      cnt.fy = 0;
      for (let j = 0; j < 5; j++) {
        const d = new PIXI.Sprite();
        d.anchor.set(0, 0.5);
        d.x = j * 7;
        cnt.addChild(d);
      }
      this.c.addChild(cnt);
      this.txts.push(cnt);
    }

    for (let i = 0; i < 20; i++) {
      const lz = new PIXI.Graphics() as LaserGfx;
      lz.visible = lz.active = false;
      lz.activeIdx = -1;
      this.c.addChild(lz);
      this.lzs.push(lz);
    }

    for (let i = 0; i < 24; i++) {
      const sw = new PIXI.Sprite(Textures['fx_ring']) as ShockwaveSprite;
      sw.anchor.set(0.5);
      sw.visible = sw.active = false;
      sw.activeIdx = -1;
      this.c.addChild(sw);
      this.sws.push(sw);
    }
  }

  public get activeCount(): number {
    return this.activePhys.length;
  }

  public destroy(): void {
    this.destroyed = true;
    this.phys.length = 0;
    this.txts.length = 0;
    this.lzs.length = 0;
    this.sws.length = 0;
    this.activePhys.length = 0;
    this.activeTxts.length = 0;
    this.activeLzs.length = 0;
    this.activeSws.length = 0;
  }

  private _warnOnce(key: string, msg: string): void {
    if (this._warnedMissing.has(key)) return;
    this._warnedMissing.add(key);
    console.warn(`[VFXPool] ${msg}`);
  }

  public spawnPhysics(
    t: string,
    pX: number,
    pY: number,
    vx: number,
    vy: number,
    l: number,
    dragX = CFG.PHYSICS.DRAG_X,
    dragY = CFG.PHYSICS.DRAG_Y,
    scaleDecay: boolean | number = false
  ): PhysicsParticle | null {
    if (this.destroyed || !this.c || this.c.destroyed || this.phys.length === 0) {
      return null;
    }
    if (l <= 0) return null;

    // Dynamic throttling for ambient/secondary particles when frame rate dips or pool saturates
    if (this.lod < 0.96 && (t === 'fx_dust' || l > 6)) {
      if (FastMath.rand() > this.lod) return null;
    }

    const tex = Textures[t];
    if (!tex) {
      this._warnOnce(t, `Missing texture "${t}" — spawn skipped.`);
      return null;
    }

    this.pIdx = (this.pIdx + 1) % this.phys.length;
    const s = this.phys[this.pIdx];
    if (!s || s.destroyed || !s.transform) return null;
    s.texture = tex;
    s.x = pX;
    s.y = pY;
    s.vx = vx;
    s.vy = vy;
    s.life = s.maxL = l;
    s.dragX = dragX;
    s.dragY = dragY;
    s.scaleDecay = Boolean(scaleDecay);
    s.active = s.visible = true;
    s.alpha = 1;
    s.scale.set(1);
    s.rotation = FastMath.randRange(0, 6);
    if (s.activeIdx === -1) {
      s.activeIdx = this.activePhys.length;
      this.activePhys.push(s);
    }
    return s;
  }

  public spawnShockwave(
    pX: number,
    pY: number,
    color: number,
    maxRad = 80,
    _width = 4
  ): void {
    if (this.destroyed || !this.c || this.c.destroyed || this.sws.length === 0) {
      return;
    }
    if (maxRad <= 0) return;
    this.sIdx = (this.sIdx + 1) % this.sws.length;
    const sw = this.sws[this.sIdx];
    if (!sw || sw.destroyed || !sw.transform) return;
    sw.texture = Textures['fx_ring'];
    sw.x = pX;
    sw.y = pY;
    sw.tint = color;
    sw.radius = 0.1;
    sw.maxRadius = maxRad / 60;
    sw.life = sw.maxL = 20;
    sw.active = sw.visible = true;
    sw.alpha = 1;
    sw.scale.set(0.1);
    if (sw.activeIdx === -1) {
      sw.activeIdx = this.activeSws.length;
      this.activeSws.push(sw);
    }
  }

  public spawnLaser(
    sx: number,
    sy: number,
    ex: number,
    ey: number,
    color: number,
    width: number,
    dur: number,
    jagged: boolean | number = false
  ): void {
    if (this.destroyed || !this.c || this.c.destroyed || this.lzs.length === 0) {
      return;
    }
    if (dur <= 0) return;
    this.lIdx = (this.lIdx + 1) % this.lzs.length;
    const z = this.lzs[this.lIdx];
    if (!z || z.destroyed || !z.transform) return;
    z.sx = sx;
    z.sy = sy;
    z.ex = ex;
    z.ey = ey;
    z.color = color;
    z.w = width;
    z.life = z.maxL = dur;
    z.active = z.visible = true;
    z.alpha = 1;
    z.jagged = Boolean(jagged);
    if (z.activeIdx === -1) {
      z.activeIdx = this.activeLzs.length;
      this.activeLzs.push(z);
    }
  }

  public spawnDmgText(pX: number, pY: number, dmg: number, color = 0xff0000): void {
    if (this.destroyed || !this.c || this.c.destroyed || this.txts.length === 0) {
      return;
    }
    if (!isFinite(dmg) || dmg <= 0) return;
    this.tIdx = (this.tIdx + 1) % this.txts.length;
    const t = this.txts[this.tIdx];
    if (!t || t.destroyed || !t.transform) return;
    const str = Math.max(1, Math.floor(dmg)).toString().slice(0, 4);

    const charAdvance = 8;
    const totalChars = str.length + 1;
    const startOffsetX = -Math.floor((totalChars * charAdvance) / 2);

    const minusSpr = t.children[0] as PIXI.Sprite;
    minusSpr.texture = Textures['digit_minus'];
    minusSpr.tint = color;
    minusSpr.x = startOffsetX;
    minusSpr.visible = true;

    for (let j = 1; j < 5; j++) {
      const digitSpr = t.children[j] as PIXI.Sprite;
      if (j - 1 < str.length) {
        digitSpr.texture = Textures['digit_' + str[j - 1]];
        digitSpr.tint = color;
        digitSpr.x = startOffsetX + j * charAdvance;
        digitSpr.visible = true;
      } else {
        digitSpr.visible = false;
      }
    }

    t.fx = pX + FastMath.randRange(-4, 4);
    t.fy = pY + FastMath.randRange(-2, 2);
    t.x = Math.round(t.fx);
    t.y = Math.round(t.fy);
    t.vx = FastMath.randRange(-1.0, 1.0);
    t.vy = FastMath.randRange(-3.2, -1.8);
    t.life = t.maxL = CFG.VFX.TEXT_LIFE;
    t.active = t.visible = true;
    t.alpha = 1;
    t.scale.set(1);
    if (t.activeIdx === -1) {
      t.activeIdx = this.activeTxts.length;
      this.activeTxts.push(t);
    }
  }

  public update(timeScale = 1.0): void {
    if (this.destroyed || !this.c || this.c.destroyed) return;
    const unitScale = Math.abs(timeScale - 1.0) < 0.04;
    const pDragX = unitScale ? CFG.PHYSICS.DRAG_X : DragLUT.getDragX(timeScale);
    const pDragY = unitScale ? CFG.PHYSICS.DRAG_Y : DragLUT.getDragY(timeScale);

    const aPhys = this.activePhys;
    for (let i = aPhys.length - 1; i >= 0; i--) {
      const s = aPhys[i];
      s.life -= timeScale;
      if (s.life <= 0) {
        s.active = s.visible = false;
        const last = aPhys.pop()!;
        if (last !== s) {
          aPhys[i] = last;
          last.activeIdx = i;
        }
        s.activeIdx = -1;
        continue;
      }
      s.vy += 0.5 * timeScale;
      if (unitScale) {
        s.vx *= s.dragX;
        s.vy *= s.dragY;
        s.x += s.vx;
        s.y += s.vy;
        s.rotation += s.vx * 0.1;
      } else {
        s.vx *= s.dragX === CFG.PHYSICS.DRAG_X ? pDragX : DragLUT.getDragX(timeScale);
        s.vy *= s.dragY === CFG.PHYSICS.DRAG_Y ? pDragY : DragLUT.getDragY(timeScale);
        s.x += s.vx * timeScale;
        s.y += s.vy * timeScale;
        s.rotation += s.vx * 0.1 * timeScale;
      }
      const ratio = s.life / s.maxL;
      s.alpha = ratio < 0.1 ? 0.1 : ratio;
      if (s.scaleDecay) s.scale.set(ratio);
    }

    const aSws = this.activeSws;
    for (let i = aSws.length - 1; i >= 0; i--) {
      const s = aSws[i];
      s.life -= timeScale;
      if (s.life <= 0) {
        s.active = s.visible = false;
        const last = aSws.pop()!;
        if (last !== s) {
          aSws[i] = last;
          last.activeIdx = i;
        }
        s.activeIdx = -1;
        continue;
      }
      s.radius += (s.maxRadius - s.radius) * 0.2 * timeScale;
      s.scale.set(s.radius);
      s.alpha = s.life / s.maxL;
    }

    const aLzs = this.activeLzs;
    for (let i = aLzs.length - 1; i >= 0; i--) {
      const z = aLzs[i];
      z.life -= timeScale;
      if (z.life <= 0) {
        z.active = z.visible = false;
        const last = aLzs.pop()!;
        if (last !== z) {
          aLzs[i] = last;
          last.activeIdx = i;
        }
        z.activeIdx = -1;
        continue;
      }
      z.clear().lineStyle(z.w, z.color, z.life / z.maxL);
      z.moveTo(z.sx, z.sy);
      for (let j = 1; j <= 4; j++) {
        let tx = z.sx + (z.ex - z.sx) * (j / 4);
        let ty = z.sy + (z.ey - z.sy) * (j / 4);
        if (z.jagged) {
          tx += FastMath.randRange(-15, 15);
          ty += FastMath.randRange(-5, 5);
        }
        if (j === 4) {
          tx = z.ex;
          ty = z.ey;
        }
        z.lineTo(tx, ty);
      }
    }

    const aTxts = this.activeTxts;
    for (let i = aTxts.length - 1; i >= 0; i--) {
      const t = aTxts[i];
      t.life -= timeScale;
      if (t.life <= 0) {
        t.active = t.visible = false;
        const last = aTxts.pop()!;
        if (last !== t) {
          aTxts[i] = last;
          last.activeIdx = i;
        }
        t.activeIdx = -1;
        continue;
      }
      t.vy += 0.32 * timeScale;
      t.vx *= pDragX;
      t.vy *= pDragX;
      t.fx += t.vx * timeScale;
      t.fy += t.vy * timeScale;
      // Integer pixel snap prevents text blurring during motion
      t.x = Math.round(t.fx);
      t.y = Math.round(t.fy);
      t.alpha = t.life < 10 ? t.life / 10 : 1;
    }
  }
}
