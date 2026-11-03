import * as PIXI from 'pixi.js';
import { TextureDataUrlConfig } from '../types/game';

export const Textures: Record<string, PIXI.Texture> = {};
export const MinitPreviewDataUrls: Record<string, string> = {};

/**
 * Helper to define a PNG Data URL (base64) texture or VFX entry with optional sizing/scaling.
 * Note: You can also pass a raw `'data:image/png;base64,...'` string directly into
 * a Minit's `textures` or `vfx` map.
 */
export function pngTexture(
  dataUrlOrConfig: string | TextureDataUrlConfig,
  opts: Omit<TextureDataUrlConfig, 'dataUrl' | 'src' | 'url'> = {}
): TextureDataUrlConfig {
  if (typeof dataUrlOrConfig === 'object' && dataUrlOrConfig !== null) {
    const rawUrl = dataUrlOrConfig.dataUrl || dataUrlOrConfig.src || dataUrlOrConfig.url || '';
    return {
      dataUrl: rawUrl,
      src: rawUrl,
      url: rawUrl,
      ...dataUrlOrConfig,
      ...opts
    };
  }
  const rawUrl = String(dataUrlOrConfig || '');
  return {
    dataUrl: rawUrl,
    src: rawUrl,
    url: rawUrl,
    ...opts
  };
}
