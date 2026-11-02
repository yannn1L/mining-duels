import * as PIXI from 'pixi.js';
import { CFG, PALETTE } from '../data/config';
import { MINIT_DB } from '../data/minits';
import { MinitDef, TextureDataUrlConfig, TextureSource } from '../types/game';
import { FastMath } from './fastMath';
import { MinitPreviewDataUrls, Textures } from './textures';

/**
 * Decodes a base64 PNG Data URL (or image URL) into a ready HTMLImageElement.
 */
function loadImageFromDataUrl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(() => resolve(img)).catch(() => resolve(img));
      } else {
        resolve(img);
      }
    };
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

export class AssetBaker {
  private static _baked = false;
  public static ROCK_TEXTURES: PIXI.Texture[] = [];

  public static async bake(renderer: PIXI.IRenderer): Promise<void> {
    if (this._baked) return;
    this._baked = true;

    const gfx = new PIXI.Graphics();
    const TS = CFG.GRID.TS;

    this._bakeDefaultRocks(renderer, gfx, TS);
    this._bakeCracks(renderer, gfx, TS);
    this._bakeCoreVfx(renderer, gfx, TS);
    await this._bakeMinitVfx(renderer, gfx);
    this._bakeDigits(renderer);
    this._audit();

    gfx.destroy();
  }

  /**
   * Bakes all textures and VFX for a single Minit (used both at boot and when
   * importing a custom external .ts Minit at runtime).
   */
  public static async bakeSingleMinit(
    renderer: PIXI.IRenderer,
    m: MinitDef<any, any>,
    sharedGfx?: PIXI.Graphics
  ): Promise<void> {
    const gfx = sharedGfx ?? new PIXI.Graphics();
    try {
      if (m.textures) {
        for (const k of Object.keys(m.textures)) {
          const { tex, rawDataUrl } = await this._bakeSource(
            renderer,
            gfx,
            m.textures[k],
            m.color,
            14
          );
          Textures[`minit_${m.id}_${k}`] = tex;

          if (k === 'base') {
            if (rawDataUrl) {
              MinitPreviewDataUrls[m.id] = rawDataUrl;
            } else {
              try {
                const extract = (renderer as any).extract as PIXI.Extract | undefined;
                if (extract && extract.canvas) {
                  const canvas = extract.canvas(new PIXI.Sprite(tex));
                  if (canvas && canvas.toDataURL) {
                    MinitPreviewDataUrls[m.id] = canvas.toDataURL('image/png');
                  }
                }
              } catch {
                // Fallback handled in UI if extract unavailable
              }
            }
          }
        }
      }
      if (m.vfx) {
        for (const name of Object.keys(m.vfx)) {
          const { tex } = await this._bakeSource(
            renderer,
            gfx,
            m.vfx[name],
            m.color,
            8
          );
          Textures[`minit_${m.id}_vfx_${name}`] = tex;
        }
      }
    } finally {
      if (!sharedGfx) {
        gfx.destroy();
      }
    }
  }

  /**
   * Generates a texture with explicit NEAREST filtering, no MSAA blur,
   * and an explicit region so edge pixels never bleed or stretch.
   */
  private static _genTex(
    renderer: PIXI.IRenderer,
    displayObject: PIXI.DisplayObject,
    region?: PIXI.Rectangle,
    resolution = 1
  ): PIXI.Texture {
    const tex = renderer.generateTexture(displayObject, {
      scaleMode: PIXI.SCALE_MODES.NEAREST,
      multisample: PIXI.MSAA_QUALITY.NONE,
      resolution,
      region
    });
    tex.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
    tex.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
    return tex;
  }

  /**
   * Generates a padded sprite texture (2px transparent border around bounds)
   * so rotating/scaling sprites in WebGL never sample/bleed edge texels.
   */
  private static _genPaddedTex(
    renderer: PIXI.IRenderer,
    gfx: PIXI.Graphics,
    minHalfSize = 12
  ): PIXI.Texture {
    const b = gfx.getLocalBounds();
    const halfW = Math.max(
      minHalfSize,
      Math.ceil(Math.max(Math.abs(b.x), Math.abs(b.x + b.width))) + 2
    );
    const halfH = Math.max(
      minHalfSize,
      Math.ceil(Math.max(Math.abs(b.y), Math.abs(b.y + b.height))) + 2
    );
    const region = new PIXI.Rectangle(-halfW, -halfH, halfW * 2, halfH * 2);
    return this._genTex(renderer, gfx, region, 1);
  }

  /**
   * Bakes either a procedural PIXI.Graphics drawer function OR a PNG Data URL (base64)
   * string / TextureDataUrlConfig into a crisp nearest-neighbor padded PIXI.Texture.
   */
  private static async _bakeSource(
    renderer: PIXI.IRenderer,
    gfx: PIXI.Graphics,
    source: TextureSource,
    defaultColor: number,
    minHalfSize: number
  ): Promise<{ tex: PIXI.Texture; rawDataUrl?: string }> {
    if (typeof source === 'function') {
      gfx.clear().lineStyle(0);
      source(gfx, defaultColor);
      return { tex: this._genPaddedTex(renderer, gfx, minHalfSize) };
    }

    const cfg: TextureDataUrlConfig =
      typeof source === 'string' ? { dataUrl: source } : source;

    try {
      const img = await loadImageFromDataUrl(cfg.dataUrl);
      const baseTex = new PIXI.BaseTexture(img, {
        scaleMode: PIXI.SCALE_MODES.NEAREST,
        mipmap: PIXI.MIPMAP_MODES.OFF
      });
      const rawTex = new PIXI.Texture(baseTex);
      const spr = new PIXI.Sprite(rawTex);
      spr.anchor.set(0.5);

      if (cfg.width !== undefined) spr.width = cfg.width;
      if (cfg.height !== undefined) spr.height = cfg.height;
      if (cfg.scale !== undefined) {
        spr.scale.set(spr.scale.x * cfg.scale, spr.scale.y * cfg.scale);
      }
      if (cfg.tint !== undefined) spr.tint = cfg.tint;

      const pad = cfg.padding ?? 2;
      const w = Math.max(2, Math.ceil(Math.abs(spr.width)));
      const h = Math.max(2, Math.ceil(Math.abs(spr.height)));
      const halfW = Math.max(minHalfSize, Math.ceil(w / 2) + pad);
      const halfH = Math.max(minHalfSize, Math.ceil(h / 2) + pad);
      const region = new PIXI.Rectangle(-halfW, -halfH, halfW * 2, halfH * 2);

      const bakedTex = this._genTex(renderer, spr, region, 1);
      spr.destroy();
      return { tex: bakedTex, rawDataUrl: cfg.dataUrl };
    } catch (err) {
      console.warn('[AssetBaker] Failed to decode PNG data URL, using fallback:', err);
      gfx.clear().beginFill(defaultColor, 1).drawRect(-6, -6, 12, 12).endFill();
      return { tex: this._genPaddedTex(renderer, gfx, minHalfSize) };
    }
  }

  private static _bakeDefaultRocks(
    renderer: PIXI.IRenderer,
    gfx: PIXI.Graphics,
    TS: number
  ): void {
    const rocks: PIXI.Texture[] = [];
    const exactTileRegion = new PIXI.Rectangle(0, 0, TS, TS);

    for (let i = 0; i < PALETTE.ROCKS.length; i++) {
      this._drawRock(gfx, TS, PALETTE.ROCKS[i]);
      Textures[`rock_${i}`] = this._genTex(renderer, gfx, exactTileRegion, 1);
      rocks.push(Textures[`rock_${i}`]);
    }
    AssetBaker.ROCK_TEXTURES = rocks;
  }

  private static _drawRock(gfx: PIXI.Graphics, TS: number, baseColor: number): void {
    gfx.clear();
    gfx.beginFill(baseColor, 1.0).drawRect(0, 0, TS, TS).endFill();

    gfx.beginFill(0x000000, 0.38);
    for (let k = 0; k < 6; k++) {
      gfx.drawRect(
        (FastMath.rand() * (TS - 4) + 2) | 0,
        (FastMath.rand() * (TS - 4) + 2) | 0,
        2,
        2
      );
    }
    gfx.endFill();

    gfx.beginFill(0xffffff, 0.12).drawRect(0, 0, TS, 1).endFill();
    gfx.beginFill(0x000000, 0.45).drawRect(0, TS - 1, TS, 1).endFill();
    gfx.beginFill(0x000000, 0.2).drawRect(TS - 1, 0, 1, TS).endFill();
  }

  private static _bakeCracks(
    renderer: PIXI.IRenderer,
    gfx: PIXI.Graphics,
    TS: number
  ): void {
    const exactTileRegion = new PIXI.Rectangle(0, 0, TS, TS);
    for (let c = 1; c <= 4; c++) {
      gfx.clear();
      gfx.beginFill(0x000000, 0).drawRect(0, 0, TS, TS).endFill();
      gfx.lineStyle(1, 0x000000, 0.85);
      for (let j = 0; j < c * 3; j++) {
        const x1 = 1 + ((FastMath.rand() * (TS - 2)) | 0);
        const y1 = 1 + ((FastMath.rand() * (TS - 2)) | 0);
        const x2 = 1 + ((FastMath.rand() * (TS - 2)) | 0);
        const y2 = 1 + ((FastMath.rand() * (TS - 2)) | 0);
        gfx.moveTo(x1, y1).lineTo(x2, y2);
      }
      Textures[`crack_${c}`] = this._genTex(renderer, gfx, exactTileRegion, 1);
    }
  }

  private static _bakeCoreVfx(
    renderer: PIXI.IRenderer,
    gfx: PIXI.Graphics,
    TS: number
  ): void {
    const tileRegion = new PIXI.Rectangle(0, 0, TS, TS);

    gfx.clear().beginFill(0xff8800, 0.95).drawRect(0, 0, TS, TS).endFill();
    Textures['fx_explosion'] = this._genTex(renderer, gfx, tileRegion, 1);

    gfx.clear().beginFill(0xffdd00, 1).drawRect(0, 0, 8, 8).endFill();
    Textures['fx_shrapnel'] = this._genTex(
      renderer,
      gfx,
      new PIXI.Rectangle(-1, -1, 10, 10),
      1
    );

    gfx.clear().beginFill(0xffffff, 1).drawRect(0, 0, TS, TS).endFill();
    Textures['fx_flash'] = this._genTex(renderer, gfx, tileRegion, 1);

    gfx.clear().beginFill(0xcc00ff, 0.95).drawRect(0, 0, 4, 4).endFill();
    Textures['fx_nano'] = this._genTex(
      renderer,
      gfx,
      new PIXI.Rectangle(-1, -1, 6, 6),
      1
    );

    gfx.clear().beginFill(0xaaaaaa, 1).drawRect(0, 0, 4, 4).endFill();
    Textures['fx_dust'] = this._genTex(
      renderer,
      gfx,
      new PIXI.Rectangle(-1, -1, 6, 6),
      1
    );

    gfx.clear();
    gfx.beginFill(0x66ff33, 0.95).drawRect(-2, -2, 4, 4).endFill();
    gfx.beginFill(0xccff88, 1).drawRect(-1, -1, 2, 2).endFill();
    Textures['fx_acid'] = this._genTex(
      renderer,
      gfx,
      new PIXI.Rectangle(-4, -4, 8, 8),
      1
    );

    gfx.clear().lineStyle(2, 0xffffff, 1).drawCircle(64, 64, 60);
    Textures['fx_ring'] = this._genTex(
      renderer,
      gfx,
      new PIXI.Rectangle(0, 0, 128, 128),
      1
    );

    gfx.clear();
    gfx.beginFill(0x050508, 1).drawRect(0, 0, 32, 32).endFill();
    gfx.beginFill(0x0088ff, 0.16).drawRect(31, 0, 1, 32).drawRect(0, 31, 32, 1).endFill();
    Textures['bg_grid'] = this._genTex(
      renderer,
      gfx,
      new PIXI.Rectangle(0, 0, 32, 32),
      1
    );
  }

  private static async _bakeMinitVfx(
    renderer: PIXI.IRenderer,
    gfx: PIXI.Graphics
  ): Promise<void> {
    for (const m of Object.values(MINIT_DB)) {
      await this.bakeSingleMinit(renderer, m, gfx);
    }
  }

  private static _bakeDigits(renderer: PIXI.IRenderer): void {
    // Bake crisp damage popup digits using Orbitron at 2x resolution
    const style = new PIXI.TextStyle({
      fontFamily: '"Orbitron", sans-serif',
      fontWeight: '800',
      fontSize: 9,
      fill: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      padding: 2
    });

    for (let i = 0; i <= 9; i++) {
      const t = new PIXI.Text(i.toString(), style);
      t.resolution = 2;
      Textures['digit_' + i] = this._genTex(renderer, t, undefined, 2);
      t.destroy();
    }
    const tm = new PIXI.Text('-', style);
    tm.resolution = 2;
    Textures['digit_minus'] = this._genTex(renderer, tm, undefined, 2);
    tm.destroy();
  }

  private static _audit(): void {
    const missing = new Set<string>();
    Object.values(MINIT_DB).forEach((m) => {
      if (m.textures) {
        Object.keys(m.textures).forEach((k) => {
          if (!Textures[`minit_${m.id}_${k}`]) missing.add(`minit_${m.id}_${k}`);
        });
      }
      if (m.vfx) {
        Object.keys(m.vfx).forEach((k) => {
          if (!Textures[`minit_${m.id}_vfx_${k}`]) missing.add(`minit_${m.id}_vfx_${k}`);
        });
      }
    });
    if (missing.size > 0) {
      console.warn('[AssetBaker] Missing textures:', Array.from(missing));
    }
  }
}
