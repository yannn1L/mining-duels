export interface OrientationLayoutConfig {
  /** Minimum auto-fitted scale for the arena */
  MIN_SCALE: number;
  /** Maximum auto-fitted scale for the arena */
  MAX_SCALE: number;
  /** Multiplier applied on top of auto-fit scale (e.g., 1.0 = 100%, 0.9 = 90%, 1.15 = 115%) */
  SCALE_MULTIPLIER: number;
  /** If > 0, overrides auto-fit and locks arena scale to this exact value */
  FIXED_SCALE: number;
  /** Snap step for pixel-perfect tiles (0.0625 = 1/16 so 16px * scale is always an integer) */
  SCALE_STEP: number;
  /** Horizontal gap (px) between Player 1 and Player 2 arenas */
  ARENA_GAP: number;
  /** Screen horizontal padding (px) */
  PADDING_X: number;
  /** Screen vertical padding (px) */
  PADDING_Y: number;
  /** Horizontal reserved space (px) when calculating auto-fit width */
  RESERVE_WIDTH: number;
  /** Vertical reserved space (px) for HUD + telemetry bar + minit card when calculating auto-fit height */
  RESERVE_HEIGHT: number;
  /** Fine-tune X position offset (px) of the dual-arena container */
  OFFSET_X: number;
  /** Fine-tune Y position offset (px) of the dual-arena container */
  OFFSET_Y: number;
  /** Top timer HUD vertical offset (px) and scale */
  TIMER_HUD: {
    OFFSET_Y: number;
    TITLE_FONT_SIZE: number;
    TIMER_FONT_SIZE: number;
  };
  /** Top telemetry bar (Depth / Mined / Points) above each arena */
  TELEMETRY_BAR: {
    SHOW: boolean;
    OFFSET_Y: number;
    PADDING_X: number;
    PADDING_Y: number;
    FONT_SIZE: number;
    ICON_SIZE: number;
    COMPACT_WIDTH_THRESHOLD: number;
  };
  /** Minit description card attached to each arena */
  MINIT_CARD: {
    SHOW: boolean;
    /** Width multiplier relative to arena width (1.0 = exact same width as arena) */
    WIDTH_RATIO: number;
    /** Vertical gap (px) between arena bottom and minit card */
    MARGIN_TOP: number;
    /** Fine-tune X/Y offset (px) of the card */
    OFFSET_X: number;
    OFFSET_Y: number;
    /** Card inner padding (px) */
    PADDING: number;
    /** Top accent bar height (px) */
    ACCENT_BAR_HEIGHT: number;
    /** Minit preview icon box size (px) */
    ICON_BOX_SIZE: number;
    /** Minit sprite image size (px) */
    ICON_SPRITE_SIZE: number;
    /** Minit name font size (px) */
    NAME_FONT_SIZE: number;
    /** Minit description font size (px) */
    DESC_FONT_SIZE: number;
    /** Max lines for description text */
    DESC_MAX_LINES: number;
  };
}

export const CFG = {
  APP: { W: 800, H: 600, BG_COLOR: 0x050508 },
  GRID: { TS: 16, HALF_TS: 8, COLS: 15, ROWS: 20, MAX_DEPTH: 999 },
  RENDER: {
    LERP: 0.22,
    CAM_LERP: 0.16,
    SPRING_TENSION: 0.18,
    SPRING_DAMP: 0.32
  },
  ARENA: { BASE_HP: 10, HP_SCALING: 3 },

  /**
   * Tweakable Arena, HUD, Telemetry Bar, and Minit Card Layout for Portrait & Landscape
   */
  LAYOUT: {
    /** Consider viewport Portrait when aspect ratio (width < height) or width < PORTRAIT_MAX_WIDTH */
    USE_ASPECT_RATIO: true,
    PORTRAIT_MAX_WIDTH: 768,

    PORTRAIT: {
      MIN_SCALE: 0.8,
      MAX_SCALE: 1.8,
      SCALE_MULTIPLIER: 1.0,
      FIXED_SCALE: 0,
      SCALE_STEP: 0.0625,
      ARENA_GAP: 10,
      PADDING_X: 8,
      PADDING_Y: 10,
      RESERVE_WIDTH: 26,
      RESERVE_HEIGHT: 190,
      OFFSET_X: 0,
      OFFSET_Y: -80,
      TIMER_HUD: {
        OFFSET_Y: 200,
        TITLE_FONT_SIZE: 35,
        TIMER_FONT_SIZE: 28
      },
      TELEMETRY_BAR: {
        SHOW: true,
        OFFSET_Y: 0,
        PADDING_X: 6,
        PADDING_Y: 4,
        FONT_SIZE: 10,
        ICON_SIZE: 12,
        COMPACT_WIDTH_THRESHOLD: 195
      },
      MINIT_CARD: {
        SHOW: true,
        WIDTH_RATIO: 1.0,
        MARGIN_TOP: 6,
        OFFSET_X: 0,
        OFFSET_Y: -50,
        PADDING: 6,
        ACCENT_BAR_HEIGHT: 2,
        ICON_BOX_SIZE: 28,
        ICON_SPRITE_SIZE: 20,
        NAME_FONT_SIZE: 11,
        DESC_FONT_SIZE: 10,
        DESC_MAX_LINES: 1
      }
    } as OrientationLayoutConfig,

    LANDSCAPE: {
      MIN_SCALE: 0.5,
      MAX_SCALE: 2.25,
      SCALE_MULTIPLIER: 1.0,
      FIXED_SCALE: 0,
      SCALE_STEP: 0.0625,
      ARENA_GAP: 36,
      PADDING_X: 24,
      PADDING_Y: 12,
      RESERVE_WIDTH: 84,
      RESERVE_HEIGHT: 200,
      OFFSET_X: 0,
      OFFSET_Y: 0,
      TIMER_HUD: {
        OFFSET_Y: 0,
        TITLE_FONT_SIZE: 10,
        TIMER_FONT_SIZE: 24
      },
      TELEMETRY_BAR: {
        SHOW: true,
        OFFSET_Y: 0,
        PADDING_X: 10,
        PADDING_Y: 6,
        FONT_SIZE: 12,
        ICON_SIZE: 14,
        COMPACT_WIDTH_THRESHOLD: 195
      },
      MINIT_CARD: {
        SHOW: true,
        WIDTH_RATIO: 1.0,
        MARGIN_TOP: 8,
        OFFSET_X: 0,
        OFFSET_Y: 0,
        PADDING: 10,
        ACCENT_BAR_HEIGHT: 2,
        ICON_BOX_SIZE: 36,
        ICON_SPRITE_SIZE: 24,
        NAME_FONT_SIZE: 12,
        DESC_FONT_SIZE: 11,
        DESC_MAX_LINES: 2
      }
    } as OrientationLayoutConfig
  },

  SIM: {
    DUR: 20.0,
    MULT: 0.5,
    OVERTIME_HITS: 5,
    SLOWMO_SPEED: 0.15,
    SLOWMO_DUR: 120,
    MAX_DT: 2.0,
    MAX_ITERATIONS: 3,
    VFX_LOD: { 2: 1.0 } as Record<number, number>
  },
  PHYSICS: { DRAG_X: 0.9, DRAG_Y: 0.95 },
  VECTORS: {
    DOWN: [[0, 1]],
    SPREAD: [
      [0, -1],
      [1, 0],
      [-1, 0]
    ]
  },
  AUDIO: {
    MASTER_GAIN: 0.8,
    COMPRESSOR: { THRESHOLD: -12, RATIO: 4 },
    THROTTLE: {
      hit: 0.05,
      laser: 0.08,
      crush: 0.06,
      gun: 0.04,
      swarm: 0.1,
      DEFAULT: 0.04
    } as Record<string, number>
  },
  VFX: {
    TEXT_LIMIT: 60,
    PHYSICS_LIMIT: 800,
    TEXT_LIFE: 30,
    TEXT_COOLDOWN: 15
  }
};

export const PALETTE = {
  // Pre-composited opaque rock strata colors (eliminates 0.6 alpha seam bleeding)
  ROCKS: [0x17171a, 0x26282c, 0x342c24, 0x442224, 0x3b1745],
  TEXT: '#ffffff',
  NEON: '#00ccff',
  NEON_NUM: 0x00ccff,
  ALERT: '#ff0055',
  ALERT_NUM: 0xff0055,
  MUTED: '#94a3b8',
  CARD_BG: 0x0a0a0f,
  BORDER: 0x2a2a3a
};

export function numToHex(color: number): string {
  return '#' + (color & 0xffffff).toString(16).padStart(6, '0');
}

export function cloneLayoutConfig(cfg: OrientationLayoutConfig): OrientationLayoutConfig {
  return {
    ...cfg,
    TIMER_HUD: { ...cfg.TIMER_HUD },
    TELEMETRY_BAR: { ...cfg.TELEMETRY_BAR },
    MINIT_CARD: { ...cfg.MINIT_CARD }
  };
}

export const DEFAULT_PORTRAIT_LAYOUT: OrientationLayoutConfig = cloneLayoutConfig(
  CFG.LAYOUT.PORTRAIT
);

export const DEFAULT_LANDSCAPE_LAYOUT: OrientationLayoutConfig = cloneLayoutConfig(
  CFG.LAYOUT.LANDSCAPE
);

export function computeArenaDimensions(
  vw: number,
  vh: number,
  layout: OrientationLayoutConfig
): {
  w: number;
  h: number;
  scale: number;
} {
  const baseW = CFG.GRID.COLS * CFG.GRID.TS; // 240
  const baseH = CFG.GRID.ROWS * CFG.GRID.TS; // 320

  let snappedScale: number;

  if (layout.FIXED_SCALE > 0) {
    snappedScale = layout.FIXED_SCALE;
  } else {
    const totalHorizReserve =
      layout.RESERVE_WIDTH + layout.PADDING_X * 2 + layout.ARENA_GAP;
    const maxAvailW = Math.max(80, Math.floor((vw - totalHorizReserve) / 2));
    const maxAvailH = Math.max(
      100,
      vh - layout.RESERVE_HEIGHT - layout.PADDING_Y * 2
    );

    const rawScaleW = maxAvailW / baseW;
    const rawScaleH = maxAvailH / baseH;
    const fittedScale = Math.min(rawScaleW, rawScaleH) * layout.SCALE_MULTIPLIER;
    const clampedScale = Math.max(
      layout.MIN_SCALE,
      Math.min(layout.MAX_SCALE, fittedScale)
    );

    const step = layout.SCALE_STEP > 0 ? layout.SCALE_STEP : 0.0625;
    snappedScale = Math.max(
      layout.MIN_SCALE,
      Math.floor(clampedScale / step) * step
    );
  }

  return {
    w: Math.round(baseW * snappedScale),
    h: Math.round(baseH * snappedScale),
    scale: snappedScale
  };
}

const LAYOUT_STORAGE_KEY = 'md_arena_layout_v1';

function mergeOrientationConfig(
  defaults: OrientationLayoutConfig,
  saved?: Partial<OrientationLayoutConfig>
): OrientationLayoutConfig {
  if (!saved || typeof saved !== 'object') return cloneLayoutConfig(defaults);
  return {
    ...defaults,
    ...saved,
    TIMER_HUD: {
      ...defaults.TIMER_HUD,
      ...(saved.TIMER_HUD || {})
    },
    TELEMETRY_BAR: {
      ...defaults.TELEMETRY_BAR,
      ...(saved.TELEMETRY_BAR || {})
    },
    MINIT_CARD: {
      ...defaults.MINIT_CARD,
      ...(saved.MINIT_CARD || {})
    }
  };
}

export const LayoutConfigService = {
  load(): { portrait: OrientationLayoutConfig; landscape: OrientationLayoutConfig } {
    try {
      const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        CFG.LAYOUT.PORTRAIT = mergeOrientationConfig(
          DEFAULT_PORTRAIT_LAYOUT,
          parsed.portrait
        );
        CFG.LAYOUT.LANDSCAPE = mergeOrientationConfig(
          DEFAULT_LANDSCAPE_LAYOUT,
          parsed.landscape
        );
      }
    } catch {
      // Ignore storage read errors
    }
    return {
      portrait: cloneLayoutConfig(CFG.LAYOUT.PORTRAIT),
      landscape: cloneLayoutConfig(CFG.LAYOUT.LANDSCAPE)
    };
  },

  save(portrait: OrientationLayoutConfig, landscape: OrientationLayoutConfig): void {
    CFG.LAYOUT.PORTRAIT = cloneLayoutConfig(portrait);
    CFG.LAYOUT.LANDSCAPE = cloneLayoutConfig(landscape);
    try {
      localStorage.setItem(
        LAYOUT_STORAGE_KEY,
        JSON.stringify({
          portrait: CFG.LAYOUT.PORTRAIT,
          landscape: CFG.LAYOUT.LANDSCAPE
        })
      );
    } catch {
      // Ignore storage quota errors
    }
  },

  resetOrientation(mode: 'PORTRAIT' | 'LANDSCAPE'): {
    portrait: OrientationLayoutConfig;
    landscape: OrientationLayoutConfig;
  } {
    if (mode === 'PORTRAIT') {
      CFG.LAYOUT.PORTRAIT = cloneLayoutConfig(DEFAULT_PORTRAIT_LAYOUT);
    } else {
      CFG.LAYOUT.LANDSCAPE = cloneLayoutConfig(DEFAULT_LANDSCAPE_LAYOUT);
    }
    this.save(CFG.LAYOUT.PORTRAIT, CFG.LAYOUT.LANDSCAPE);
    return {
      portrait: cloneLayoutConfig(CFG.LAYOUT.PORTRAIT),
      landscape: cloneLayoutConfig(CFG.LAYOUT.LANDSCAPE)
    };
  },

  exportTsSnippet(
    portrait: OrientationLayoutConfig,
    landscape: OrientationLayoutConfig
  ): string {
    return `PORTRAIT: ${JSON.stringify(portrait, null, 2)} as OrientationLayoutConfig,\n\nLANDSCAPE: ${JSON.stringify(landscape, null, 2)} as OrientationLayoutConfig`;
  }
};

// Initialize saved layout overrides on module load
if (typeof window !== 'undefined') {
  LayoutConfigService.load();
}

