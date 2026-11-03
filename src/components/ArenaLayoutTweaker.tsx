import React, { useState, useEffect, useRef } from 'react';
import {
  Smartphone,
  Monitor,
  RotateCcw,
  Copy,
  Check,
  Eye,
  Layers,
  Pickaxe,
  Sliders,
  Maximize2,
  Sparkles
} from 'lucide-react';
import {
  CFG,
  OrientationLayoutConfig,
  PALETTE,
  numToHex,
  computeArenaDimensions,
  LayoutConfigService
} from '../data/config';
import { MINIT_DB, MINIT_LIST } from '../data/minits';
import { MinitPreviewDataUrls } from '../engine/textures';
import { AudioSys } from '../engine/audio';

interface ArenaLayoutTweakerProps {
  selectedMinits: string[];
  isCurrentDevicePortrait: boolean;
  onLayoutUpdated: () => void;
}

type OrientationTab = 'PORTRAIT' | 'LANDSCAPE';
type SectionTab = 'ARENA' | 'TIMER' | 'TELEMETRY' | 'CARD';

interface ViewportPreset {
  id: string;
  label: string;
  w: number;
  h: number;
}

const PORTRAIT_PRESETS: ViewportPreset[] = [
  { id: 'phone_std', label: 'Phone (390×844)', w: 390, h: 844 },
  { id: 'phone_sm', label: 'Compact (360×640)', w: 360, h: 640 },
  { id: 'phone_lg', label: 'Max Phone (430×932)', w: 430, h: 932 },
  { id: 'tablet_p', label: 'Tablet (768×1024)', w: 768, h: 1024 }
];

const LANDSCAPE_PRESETS: ViewportPreset[] = [
  { id: 'hd_720', label: 'HD (1280×720)', w: 1280, h: 720 },
  { id: 'mob_land', label: 'Mobile Land (844×390)', w: 844, h: 390 },
  { id: 'tab_land', label: 'Tablet Land (1024×768)', w: 1024, h: 768 },
  { id: 'fhd_1080', label: 'Desktop (1600×900)', w: 1600, h: 900 }
];

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: string;
  onChange: (val: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  hint,
  onChange
}) => {
  const displayVal =
    step < 0.01
      ? value.toFixed(4)
      : step < 1
      ? value.toFixed(2)
      : Math.round(value).toString();

  const clampAndSet = (next: number) => {
    const rounded = Math.round(next / step) * step;
    const clamped = Math.max(min, Math.min(max, Number(rounded.toFixed(4))));
    onChange(clamped);
  };

  return (
    <div className="bg-[#070a12] border border-slate-800/90 p-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-pixel text-[9px] text-slate-200 tracking-wide truncate">
            {label}
          </div>
          {hint && (
            <div className="text-[10px] text-slate-500 truncate">{hint}</div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => clampAndSet(value - step)}
            className="w-5 h-5 flex items-center justify-center bg-slate-900 border border-slate-700 text-slate-300 hover:border-cyan-400 hover:text-white font-mono-tabular text-xs cursor-pointer"
            title={`Decrease by ${step}`}
          >
            -
          </button>
          <span className="min-w-[52px] text-center px-1.5 py-0.5 bg-[#04060a] border border-slate-800 font-mono-tabular text-[11px] text-cyan-300 font-semibold">
            {displayVal}
            {unit}
          </span>
          <button
            type="button"
            onClick={() => clampAndSet(value + step)}
            className="w-5 h-5 flex items-center justify-center bg-slate-900 border border-slate-700 text-slate-300 hover:border-cyan-400 hover:text-white font-mono-tabular text-xs cursor-pointer"
            title={`Increase by ${step}`}
          >
            +
          </button>
        </div>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-slate-800 accent-cyan-400 cursor-pointer"
      />
    </div>
  );
};

export const ArenaLayoutTweaker: React.FC<ArenaLayoutTweakerProps> = ({
  selectedMinits,
  isCurrentDevicePortrait,
  onLayoutUpdated
}) => {
  const [orientation, setOrientation] = useState<OrientationTab>(() =>
    isCurrentDevicePortrait ? 'PORTRAIT' : 'LANDSCAPE'
  );
  const [section, setSection] = useState<SectionTab>('ARENA');
  const [portraitCfg, setPortraitCfg] = useState<OrientationLayoutConfig>(() =>
    LayoutConfigService.load().portrait
  );
  const [landscapeCfg, setLandscapeCfg] = useState<OrientationLayoutConfig>(() =>
    LayoutConfigService.load().landscape
  );

  const [portraitPresetId, setPortraitPresetId] = useState<string>('phone_std');
  const [landscapePresetId, setLandscapePresetId] = useState<string>('hd_720');
  const [showGuides, setShowGuides] = useState<boolean>(true);
  const [previewOvertime, setPreviewOvertime] = useState<boolean>(false);
  const [copiedConfig, setCopiedConfig] = useState<boolean>(false);

  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const [stageBounds, setStageBounds] = useState<{ w: number; h: number }>({
    w: 560,
    h: 420
  });

  useEffect(() => {
    const el = previewStageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 20 && r.height > 20) {
        setStageBounds({ w: r.width, h: r.height });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const currentCfg = orientation === 'PORTRAIT' ? portraitCfg : landscapeCfg;

  const applyUpdate = (updater: (prev: OrientationLayoutConfig) => OrientationLayoutConfig) => {
    if (orientation === 'PORTRAIT') {
      const nextP = updater(portraitCfg);
      setPortraitCfg(nextP);
      LayoutConfigService.save(nextP, landscapeCfg);
    } else {
      const nextL = updater(landscapeCfg);
      setLandscapeCfg(nextL);
      LayoutConfigService.save(portraitCfg, nextL);
    }
    onLayoutUpdated();
  };

  const handleResetCurrent = () => {
    AudioSys.play('click');
    const reset = LayoutConfigService.resetOrientation(orientation);
    setPortraitCfg(reset.portrait);
    setLandscapeCfg(reset.landscape);
    onLayoutUpdated();
  };

  const handleCopyTsSnippet = () => {
    AudioSys.play('click');
    const snippet = LayoutConfigService.exportTsSnippet(portraitCfg, landscapeCfg);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(snippet).then(() => {
        setCopiedConfig(true);
        setTimeout(() => setCopiedConfig(false), 2000);
      });
    }
  };

  // Resolve active simulated viewport dimensions
  const activePresets =
    orientation === 'PORTRAIT' ? PORTRAIT_PRESETS : LANDSCAPE_PRESETS;
  const activePresetId =
    orientation === 'PORTRAIT' ? portraitPresetId : landscapePresetId;
  const presetObj =
    activePresets.find((p) => p.id === activePresetId) || activePresets[0];

  const simVw = presetObj.w;
  const simVh = presetObj.h;

  // Compute exact Arena dimensions using the same engine formula
  const {
    w: arenaW,
    h: arenaH,
    scale: snappedScale
  } = computeArenaDimensions(simVw, simVh, currentCfg);

  const telCfg = currentCfg.TELEMETRY_BAR;
  const cardCfg = currentCfg.MINIT_CARD;
  const hudCfg = currentCfg.TIMER_HUD;
  const isCompactArena = arenaW < telCfg.COMPACT_WIDTH_THRESHOLD;
  const cardWidth = Math.round(arenaW * cardCfg.WIDTH_RATIO);

  // Calculate scale factor to fit simulated device viewport inside the right-hand preview stage
  const availW = Math.max(120, stageBounds.w - 28);
  const availH = Math.max(120, stageBounds.h - 28);
  const fitScale = Math.min(availW / simVw, availH / simVh, 1.0);

  const p1Id = selectedMinits[0] || MINIT_LIST[0]?.id || 'laser';
  const p2Id = selectedMinits[1] || MINIT_LIST[1]?.id || 'absorb';

  const rockHexes = PALETTE.ROCKS.map((c) => numToHex(c));

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3 py-2.5 overflow-hidden">
      {/* ═══════════════════════════════════════════════════════════════════
          LEFT COLUMN: ORIENTATION & PARAMETER TWEAKER CONTROLS
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="lg:col-span-5 flex flex-col min-h-0 bg-[#0a0d16]/95 border border-slate-800 overflow-hidden">
        {/* Orientation Switcher: Portrait vs Landscape */}
        <div className="p-2.5 bg-[#0d121f] border-b border-slate-800 shrink-0 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-pixel text-[10px] text-cyan-400 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" />
              ARENA LAYOUT STUDIO
            </span>
            <span className="text-[10px] font-mono-tabular text-slate-400">
              Auto-Saved
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => {
                AudioSys.play('click');
                setOrientation('PORTRAIT');
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 font-pixel text-[9px] sm:text-[10px] border transition-colors cursor-pointer ${
                orientation === 'PORTRAIT'
                  ? 'bg-cyan-400 text-slate-950 border-cyan-300 shadow-[0_2px_0_#0891b2]'
                  : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:border-slate-600'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 shrink-0" />
              <span>PORTRAIT</span>
              {isCurrentDevicePortrait && (
                <span
                  className={`px-1 py-0.2 text-[7px] ${
                    orientation === 'PORTRAIT'
                      ? 'bg-slate-950 text-cyan-300'
                      : 'bg-cyan-500/20 text-cyan-300'
                  }`}
                >
                  ACTIVE
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                AudioSys.play('click');
                setOrientation('LANDSCAPE');
              }}
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 font-pixel text-[9px] sm:text-[10px] border transition-colors cursor-pointer ${
                orientation === 'LANDSCAPE'
                  ? 'bg-cyan-400 text-slate-950 border-cyan-300 shadow-[0_2px_0_#0891b2]'
                  : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:border-slate-600'
              }`}
            >
              <Monitor className="w-3.5 h-3.5 shrink-0" />
              <span>LANDSCAPE</span>
              {!isCurrentDevicePortrait && (
                <span
                  className={`px-1 py-0.2 text-[7px] ${
                    orientation === 'LANDSCAPE'
                      ? 'bg-slate-950 text-cyan-300'
                      : 'bg-cyan-500/20 text-cyan-300'
                  }`}
                >
                  ACTIVE
                </span>
              )}
            </button>
          </div>

          {/* Sub-Section Tabs */}
          <div className="grid grid-cols-4 gap-1 pt-0.5">
            {(
              [
                { id: 'ARENA', label: 'ARENA' },
                { id: 'TIMER', label: 'TIMER' },
                { id: 'TELEMETRY', label: 'STATS' },
                { id: 'CARD', label: 'CARD' }
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  AudioSys.play('click');
                  setSection(tab.id);
                }}
                className={`py-1.5 font-pixel text-[8px] sm:text-[9px] border transition-colors cursor-pointer ${
                  section === tab.id
                    ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                    : 'bg-[#070a12] border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Sliders List */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
          {section === 'ARENA' && (
            <>
              <SliderRow
                label="SCALE MULTIPLIER"
                hint="Multiplies auto-fitted arena scale"
                value={currentCfg.SCALE_MULTIPLIER}
                min={0.5}
                max={2.0}
                step={0.05}
                unit="x"
                onChange={(v) =>
                  applyUpdate((c) => ({ ...c, SCALE_MULTIPLIER: v }))
                }
              />
              <SliderRow
                label="FIXED SCALE (0 = AUTO-FIT)"
                hint="If > 0, locks arena to exact scale"
                value={currentCfg.FIXED_SCALE}
                min={0}
                max={2.5}
                step={0.0625}
                unit="x"
                onChange={(v) => applyUpdate((c) => ({ ...c, FIXED_SCALE: v }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <SliderRow
                  label="MIN SCALE"
                  value={currentCfg.MIN_SCALE}
                  min={0.25}
                  max={2.0}
                  step={0.05}
                  unit="x"
                  onChange={(v) => applyUpdate((c) => ({ ...c, MIN_SCALE: v }))}
                />
                <SliderRow
                  label="MAX SCALE"
                  value={currentCfg.MAX_SCALE}
                  min={0.5}
                  max={3.5}
                  step={0.05}
                  unit="x"
                  onChange={(v) => applyUpdate((c) => ({ ...c, MAX_SCALE: v }))}
                />
              </div>
              <SliderRow
                label="ARENA GAP (P1 ↔ P2)"
                hint="Horizontal space between P1 & P2 arenas"
                value={currentCfg.ARENA_GAP}
                min={0}
                max={120}
                step={2}
                unit="px"
                onChange={(v) => applyUpdate((c) => ({ ...c, ARENA_GAP: v }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <SliderRow
                  label="ARENA OFFSET X"
                  value={currentCfg.OFFSET_X}
                  min={-200}
                  max={200}
                  step={2}
                  unit="px"
                  onChange={(v) => applyUpdate((c) => ({ ...c, OFFSET_X: v }))}
                />
                <SliderRow
                  label="ARENA OFFSET Y"
                  value={currentCfg.OFFSET_Y}
                  min={-200}
                  max={200}
                  step={2}
                  unit="px"
                  onChange={(v) => applyUpdate((c) => ({ ...c, OFFSET_Y: v }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <SliderRow
                  label="SCREEN PADDING X"
                  value={currentCfg.PADDING_X}
                  min={0}
                  max={80}
                  step={2}
                  unit="px"
                  onChange={(v) => applyUpdate((c) => ({ ...c, PADDING_X: v }))}
                />
                <SliderRow
                  label="SCREEN PADDING Y"
                  value={currentCfg.PADDING_Y}
                  min={0}
                  max={80}
                  step={2}
                  unit="px"
                  onChange={(v) => applyUpdate((c) => ({ ...c, PADDING_Y: v }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <SliderRow
                  label="RESERVE WIDTH"
                  hint="Horiz auto-fit margin"
                  value={currentCfg.RESERVE_WIDTH}
                  min={0}
                  max={240}
                  step={2}
                  unit="px"
                  onChange={(v) =>
                    applyUpdate((c) => ({ ...c, RESERVE_WIDTH: v }))
                  }
                />
                <SliderRow
                  label="RESERVE HEIGHT"
                  hint="Vert HUD/Card space"
                  value={currentCfg.RESERVE_HEIGHT}
                  min={0}
                  max={360}
                  step={5}
                  unit="px"
                  onChange={(v) =>
                    applyUpdate((c) => ({ ...c, RESERVE_HEIGHT: v }))
                  }
                />
              </div>
            </>
          )}

          {section === 'TIMER' && (
            <>
              <SliderRow
                label="TIMER HUD OFFSET Y"
                hint="Vertical shift of the top match timer header"
                value={hudCfg.OFFSET_Y}
                min={-150}
                max={300}
                step={2}
                unit="px"
                onChange={(v) =>
                  applyUpdate((c) => ({
                    ...c,
                    TIMER_HUD: { ...c.TIMER_HUD, OFFSET_Y: v }
                  }))
                }
              />
              <SliderRow
                label="TITLE FONT SIZE"
                hint="Size of 'MINING DUELS!' banner text"
                value={hudCfg.TITLE_FONT_SIZE}
                min={8}
                max={52}
                step={1}
                unit="px"
                onChange={(v) =>
                  applyUpdate((c) => ({
                    ...c,
                    TIMER_HUD: { ...c.TIMER_HUD, TITLE_FONT_SIZE: v }
                  }))
                }
              />
              <SliderRow
                label="TIMER COUNTDOWN SIZE"
                hint="Size of the 20s / OVERTIME countdown digits"
                value={hudCfg.TIMER_FONT_SIZE}
                min={12}
                max={64}
                step={1}
                unit="px"
                onChange={(v) =>
                  applyUpdate((c) => ({
                    ...c,
                    TIMER_HUD: { ...c.TIMER_HUD, TIMER_FONT_SIZE: v }
                  }))
                }
              />
            </>
          )}

          {section === 'TELEMETRY' && (
            <>
              <div className="flex items-center justify-between p-2.5 bg-[#070a12] border border-slate-800">
                <div>
                  <div className="font-pixel text-[9px] text-slate-200">
                    SHOW TELEMETRY BAR
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Depth, Mined &amp; Points header above each arena
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    AudioSys.play('click');
                    applyUpdate((c) => ({
                      ...c,
                      TELEMETRY_BAR: {
                        ...c.TELEMETRY_BAR,
                        SHOW: !c.TELEMETRY_BAR.SHOW
                      }
                    }));
                  }}
                  className={`px-3 py-1.5 font-pixel text-[9px] border cursor-pointer ${
                    telCfg.SHOW
                      ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  {telCfg.SHOW ? 'SHOWN' : 'HIDDEN'}
                </button>
              </div>

              <SliderRow
                label="TELEMETRY OFFSET Y"
                value={telCfg.OFFSET_Y}
                min={-100}
                max={100}
                step={1}
                unit="px"
                onChange={(v) =>
                  applyUpdate((c) => ({
                    ...c,
                    TELEMETRY_BAR: { ...c.TELEMETRY_BAR, OFFSET_Y: v }
                  }))
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <SliderRow
                  label="FONT SIZE"
                  value={telCfg.FONT_SIZE}
                  min={8}
                  max={20}
                  step={1}
                  unit="px"
                  onChange={(v) =>
                    applyUpdate((c) => ({
                      ...c,
                      TELEMETRY_BAR: { ...c.TELEMETRY_BAR, FONT_SIZE: v }
                    }))
                  }
                />
                <SliderRow
                  label="ICON SIZE"
                  value={telCfg.ICON_SIZE}
                  min={8}
                  max={24}
                  step={1}
                  unit="px"
                  onChange={(v) =>
                    applyUpdate((c) => ({
                      ...c,
                      TELEMETRY_BAR: { ...c.TELEMETRY_BAR, ICON_SIZE: v }
                    }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <SliderRow
                  label="PADDING X"
                  value={telCfg.PADDING_X}
                  min={2}
                  max={24}
                  step={1}
                  unit="px"
                  onChange={(v) =>
                    applyUpdate((c) => ({
                      ...c,
                      TELEMETRY_BAR: { ...c.TELEMETRY_BAR, PADDING_X: v }
                    }))
                  }
                />
                <SliderRow
                  label="PADDING Y"
                  value={telCfg.PADDING_Y}
                  min={1}
                  max={20}
                  step={1}
                  unit="px"
                  onChange={(v) =>
                    applyUpdate((c) => ({
                      ...c,
                      TELEMETRY_BAR: { ...c.TELEMETRY_BAR, PADDING_Y: v }
                    }))
                  }
                />
              </div>
              <SliderRow
                label="COMPACT WIDTH THRESHOLD"
                hint="Switches to short labels when arena width < threshold"
                value={telCfg.COMPACT_WIDTH_THRESHOLD}
                min={100}
                max={320}
                step={5}
                unit="px"
                onChange={(v) =>
                  applyUpdate((c) => ({
                    ...c,
                    TELEMETRY_BAR: {
                      ...c.TELEMETRY_BAR,
                      COMPACT_WIDTH_THRESHOLD: v
                    }
                  }))
                }
              />
            </>
          )}

          {section === 'CARD' && (
            <>
              <div className="flex items-center justify-between p-2.5 bg-[#070a12] border border-slate-800">
                <div>
                  <div className="font-pixel text-[9px] text-slate-200">
                    SHOW MINIT CARD
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Minit icon, name, effects &amp; description below arena
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    AudioSys.play('click');
                    applyUpdate((c) => ({
                      ...c,
                      MINIT_CARD: { ...c.MINIT_CARD, SHOW: !c.MINIT_CARD.SHOW }
                    }));
                  }}
                  className={`px-3 py-1.5 font-pixel text-[9px] border cursor-pointer ${
                    cardCfg.SHOW
                      ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  {cardCfg.SHOW ? 'SHOWN' : 'HIDDEN'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <SliderRow
                  label="WIDTH RATIO"
                  value={cardCfg.WIDTH_RATIO}
                  min={0.5}
                  max={1.4}
                  step={0.05}
                  unit="x"
                  onChange={(v) =>
                    applyUpdate((c) => ({
                      ...c,
                      MINIT_CARD: { ...c.MINIT_CARD, WIDTH_RATIO: v }
                    }))
                  }
                />
                <SliderRow
                  label="MARGIN TOP"
                  value={cardCfg.MARGIN_TOP}
                  min={0}
                  max={40}
                  step={1}
                  unit="px"
                  onChange={(v) =>
                    applyUpdate((c) => ({
                      ...c,
                      MINIT_CARD: { ...c.MINIT_CARD, MARGIN_TOP: v }
                    }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <SliderRow
                  label="CARD OFFSET X"
                  value={cardCfg.OFFSET_X}
                  min={-150}
                  max={150}
                  step={2}
                  unit="px"
                  onChange={(v) =>
                    applyUpdate((c) => ({
                      ...c,
                      MINIT_CARD: { ...c.MINIT_CARD, OFFSET_X: v }
                    }))
                  }
                />
                <SliderRow
                  label="CARD OFFSET Y"
                  value={cardCfg.OFFSET_Y}
                  min={-150}
                  max={150}
                  step={2}
                  unit="px"
                  onChange={(v) =>
                    applyUpdate((c) => ({
                      ...c,
                      MINIT_CARD: { ...c.MINIT_CARD, OFFSET_Y: v }
                    }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <SliderRow
                  label="ICON BOX SIZE"
                  value={cardCfg.ICON_BOX_SIZE}
                  min={16}
                  max={56}
                  step={2}
                  unit="px"
                  onChange={(v) =>
                    applyUpdate((c) => ({
                      ...c,
                      MINIT_CARD: { ...c.MINIT_CARD, ICON_BOX_SIZE: v }
                    }))
                  }
                />
                <SliderRow
                  label="SPRITE SIZE"
                  value={cardCfg.ICON_SPRITE_SIZE}
                  min={12}
                  max={48}
                  step={2}
                  unit="px"
                  onChange={(v) =>
                    applyUpdate((c) => ({
                      ...c,
                      MINIT_CARD: { ...c.MINIT_CARD, ICON_SPRITE_SIZE: v }
                    }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <SliderRow
                  label="NAME FONT SIZE"
                  value={cardCfg.NAME_FONT_SIZE}
                  min={8}
                  max={22}
                  step={1}
                  unit="px"
                  onChange={(v) =>
                    applyUpdate((c) => ({
                      ...c,
                      MINIT_CARD: { ...c.MINIT_CARD, NAME_FONT_SIZE: v }
                    }))
                  }
                />
                <SliderRow
                  label="DESC FONT SIZE"
                  value={cardCfg.DESC_FONT_SIZE}
                  min={8}
                  max={18}
                  step={1}
                  unit="px"
                  onChange={(v) =>
                    applyUpdate((c) => ({
                      ...c,
                      MINIT_CARD: { ...c.MINIT_CARD, DESC_FONT_SIZE: v }
                    }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <SliderRow
                  label="INNER PADDING"
                  value={cardCfg.PADDING}
                  min={2}
                  max={24}
                  step={1}
                  unit="px"
                  onChange={(v) =>
                    applyUpdate((c) => ({
                      ...c,
                      MINIT_CARD: { ...c.MINIT_CARD, PADDING: v }
                    }))
                  }
                />
                <SliderRow
                  label="DESC MAX LINES"
                  value={cardCfg.DESC_MAX_LINES}
                  min={1}
                  max={4}
                  step={1}
                  onChange={(v) =>
                    applyUpdate((c) => ({
                      ...c,
                      MINIT_CARD: { ...c.MINIT_CARD, DESC_MAX_LINES: v }
                    }))
                  }
                />
              </div>
            </>
          )}
        </div>

        {/* Bottom Actions: Reset & Copy TS Snippet */}
        <div className="p-2.5 bg-[#0d121f] border-t border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetCurrent}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-950/60 border border-rose-700/70 text-rose-300 hover:border-rose-400 font-pixel text-[8px] sm:text-[9px] cursor-pointer"
            title={`Reset ${orientation} layout to defaults`}
          >
            <RotateCcw className="w-3 h-3" />
            <span>RESET {orientation}</span>
          </button>

          <button
            type="button"
            onClick={handleCopyTsSnippet}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900 border border-slate-700 text-cyan-300 hover:border-cyan-400 font-pixel text-[8px] sm:text-[9px] cursor-pointer"
            title="Copy TypeScript config snippet for config.ts"
          >
            {copiedConfig ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-300">COPIED TS!</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>COPY CONFIG.TS</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          RIGHT COLUMN: INTERACTIVE LIVE EXAMPLE VIEW
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="lg:col-span-7 flex flex-col min-h-0 bg-[#0a0d16]/95 border border-slate-800 overflow-hidden">
        {/* Example View Toolbar & Device Resolution Presets */}
        <div className="p-2.5 bg-[#0d121f] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-pixel text-[9px] sm:text-[10px] text-white">
              EXAMPLE VIEW · {orientation}
            </span>
            <span className="px-1.5 py-0.5 bg-cyan-950/80 border border-cyan-500/40 font-mono-tabular text-[10px] text-cyan-300">
              Arena: {arenaW}×{arenaH}px ({snappedScale.toFixed(4).replace(/\.?0+$/, '')}x)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {activePresets.map((pr) => (
              <button
                key={pr.id}
                type="button"
                onClick={() => {
                  AudioSys.play('click');
                  if (orientation === 'PORTRAIT') setPortraitPresetId(pr.id);
                  else setLandscapePresetId(pr.id);
                }}
                className={`px-2 py-1 font-mono-tabular text-[10px] border cursor-pointer ${
                  activePresetId === pr.id
                    ? 'bg-cyan-400/20 border-cyan-400 text-cyan-200 font-semibold'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {pr.label}
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                AudioSys.play('click');
                setPreviewOvertime((v) => !v);
              }}
              className={`px-2 py-1 font-pixel text-[8px] border cursor-pointer ${
                previewOvertime
                  ? 'bg-rose-500/20 border-rose-400 text-rose-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
              title="Toggle Overtime HUD state in preview"
            >
              OVERTIME
            </button>

            <button
              type="button"
              onClick={() => {
                AudioSys.play('click');
                setShowGuides((v) => !v);
              }}
              className={`flex items-center gap-1 px-2 py-1 font-pixel text-[8px] border cursor-pointer ${
                showGuides
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
              title="Toggle padding & alignment guides"
            >
              <Maximize2 className="w-2.5 h-2.5" />
              GUIDES
            </button>
          </div>
        </div>

        {/* Scaled Viewport Simulation Stage */}
        <div
          ref={previewStageRef}
          className="flex-1 min-h-[260px] relative flex items-center justify-center bg-[#04060a] overflow-hidden p-3"
        >
          {/* Outer Device Frame Wrapper */}
          <div
            style={{
              width: Math.round(simVw * fitScale),
              height: Math.round(simVh * fitScale)
            }}
            className="relative border-2 border-cyan-500/70 shadow-[0_0_40px_rgba(0,204,255,0.15)] bg-[#050508] overflow-hidden shrink-0"
          >
            {/* Simulated 1:1 Viewport Canvas scaled via CSS transform */}
            <div
              style={{
                width: simVw,
                height: simVh,
                transform: `scale(${fitScale})`,
                transformOrigin: 'top left',
                paddingLeft: currentCfg.PADDING_X,
                paddingRight: currentCfg.PADDING_X,
                paddingTop: currentCfg.PADDING_Y,
                paddingBottom: currentCfg.PADDING_Y
              }}
              className="relative flex flex-col items-center justify-between select-none overflow-hidden"
            >
              {/* Simulated Background Grid Pattern */}
              <div
                className="absolute inset-0 pointer-events-none opacity-45"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, rgba(0,136,255,0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,136,255,0.14) 1px, transparent 1px)',
                  backgroundSize: '32px 32px'
                }}
              />

              {/* Optional Alignment & Margin Guides */}
              {showGuides && (
                <>
                  {/* Padding Boundary Guide */}
                  <div
                    style={{
                      left: currentCfg.PADDING_X,
                      right: currentCfg.PADDING_X,
                      top: currentCfg.PADDING_Y,
                      bottom: currentCfg.PADDING_Y
                    }}
                    className="absolute border border-dashed border-emerald-400/45 pointer-events-none z-30"
                  />
                  {/* Center Axis Crosshairs */}
                  <div className="absolute inset-y-0 left-1/2 w-px bg-cyan-400/20 pointer-events-none z-10" />
                  <div className="absolute inset-x-0 top-1/2 h-px bg-cyan-400/20 pointer-events-none z-10" />
                  {/* Viewport Resolution Badge */}
                  <div className="absolute top-1.5 left-2 z-30 px-1.5 py-0.5 bg-black/80 border border-emerald-500/50 font-mono-tabular text-[10px] text-emerald-300">
                    {simVw}×{simVh}px · Pad({currentCfg.PADDING_X},{currentCfg.PADDING_Y}) · Gap({currentCfg.ARENA_GAP}px)
                  </div>
                </>
              )}

              {/* 1. Top Duel Timer & Phase Display (Exact replica of Screen 3) */}
              <div
                style={{
                  transform: `translateY(${hudCfg.OFFSET_Y}px)`
                }}
                className="relative z-20 w-full max-w-5xl mx-auto flex flex-col items-center justify-center shrink-0"
              >
                <div
                  style={{ fontSize: hudCfg.TITLE_FONT_SIZE }}
                  className="font-pixel tracking-widest text-slate-400 mb-1"
                >
                  {previewOvertime
                    ? 'FINAL STRIKE · 3 BLOCKS LEFT'
                    : 'MINING DUELS!'}
                </div>
                <div
                  style={{
                    fontSize: hudCfg.TIMER_FONT_SIZE,
                    textShadow: '0 2px 0 #000'
                  }}
                  className={`font-pixel tracking-wider ${
                    previewOvertime ? 'text-rose-500' : 'text-cyan-400'
                  }`}
                >
                  {previewOvertime ? 'OVERTIME!' : '14s'}
                </div>
              </div>

              {/* 2. Dual Side-by-Side Arena Viewport Frames (Exact replica of Screen 3) */}
              <div
                style={{
                  gap: currentCfg.ARENA_GAP,
                  transform: `translate(${currentCfg.OFFSET_X}px, ${currentCfg.OFFSET_Y}px)`
                }}
                className="relative z-20 flex-1 flex flex-row items-start justify-center w-full my-auto"
              >
                {[0, 1].map((idx) => {
                  const mId = idx === 0 ? p1Id : p2Id;
                  const m = MINIT_DB[mId] || MINIT_LIST[idx % MINIT_LIST.length];
                  const colorHex = m ? numToHex(m.color) : PALETTE.NEON;
                  const sampleDepth = idx === 0 ? 48 : 52;
                  const sampleMined = idx === 0 ? 142 : 156;
                  const sampleScore = idx === 0 ? 142 : 156;

                  return (
                    <div key={idx} className="flex flex-col items-center shrink-0">
                      {/* Top Mini Telemetry Header */}
                      {telCfg.SHOW && (
                        <div
                          style={{
                            width: arenaW,
                            paddingLeft: telCfg.PADDING_X,
                            paddingRight: telCfg.PADDING_X,
                            paddingTop: telCfg.PADDING_Y,
                            paddingBottom: telCfg.PADDING_Y,
                            fontSize: telCfg.FONT_SIZE,
                            transform: `translateY(${telCfg.OFFSET_Y}px)`
                          }}
                          className="flex items-center justify-between bg-[#0a0c12]/95 border border-b-0 border-slate-700/80 font-mono-tabular"
                        >
                          <div className="flex items-center gap-1.5 sm:gap-2.5 text-slate-300 min-w-0">
                            <span className="flex items-center gap-1">
                              <Layers
                                style={{
                                  width: telCfg.ICON_SIZE,
                                  height: telCfg.ICON_SIZE
                                }}
                                className="text-cyan-400 shrink-0"
                              />
                              <span>
                                {isCompactArena
                                  ? `${sampleDepth}m`
                                  : `Depth:${sampleDepth}`}
                              </span>
                            </span>
                            <span className="text-slate-600">·</span>
                            <span className="flex items-center gap-1">
                              <Pickaxe
                                style={{
                                  width: telCfg.ICON_SIZE,
                                  height: telCfg.ICON_SIZE
                                }}
                                className="text-amber-400 shrink-0"
                              />
                              <span>
                                {isCompactArena
                                  ? `${sampleMined}`
                                  : `Mined:${sampleMined}`}
                              </span>
                            </span>
                          </div>
                          <span className="font-semibold text-white shrink-0">
                            {isCompactArena
                              ? `${sampleScore}`
                              : `PTS: ${sampleScore}`}
                          </span>
                        </div>
                      )}

                      {/* Simulated PixiJS Subterranean Arena Frame */}
                      <div
                        style={{ width: arenaW, height: arenaH }}
                        className="relative border border-slate-600/90 shadow-[0_0_24px_rgba(0,0,0,0.85)] bg-[#06070c] overflow-hidden flex flex-col"
                      >
                        {/* Top Excavated Cavern Airspace (35%) */}
                        <div className="relative h-[36%] w-full bg-[#05060a] flex items-end justify-center pb-2">
                          {/* Vertical Laser / Beam VFX Preview */}
                          <div
                            style={{
                              backgroundColor: colorHex,
                              boxShadow: `0 0 12px ${colorHex}`
                            }}
                            className="absolute bottom-0 w-1.5 h-full opacity-50"
                          />
                          {/* Active Minit Sprite Preview */}
                          <div className="relative z-10 flex flex-col items-center">
                            <div
                              style={{ borderColor: colorHex }}
                              className="px-1 py-0.2 mb-1 bg-black/80 border text-[8px] font-pixel text-white"
                            >
                              P{idx + 1}
                            </div>
                            {m && MinitPreviewDataUrls[m.id] ? (
                              <img
                                src={MinitPreviewDataUrls[m.id]}
                                alt={m.name}
                                style={{
                                  width: Math.max(16, Math.round(20 * snappedScale)),
                                  height: Math.max(16, Math.round(20 * snappedScale))
                                }}
                                className="object-contain pixelated-canvas drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
                              />
                            ) : (
                              <Sparkles
                                className="w-5 h-5"
                                style={{ color: colorHex }}
                              />
                            )}
                          </div>
                        </div>

                        {/* Subterranean Rock Strata Layers (64%) */}
                        <div className="flex-1 flex flex-col w-full">
                          {rockHexes.map((rHex, rIdx) => (
                            <div
                              key={rIdx}
                              style={{
                                backgroundColor: rHex,
                                backgroundImage:
                                  'linear-gradient(to right, rgba(0,0,0,0.28) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.07) 1px, transparent 1px)',
                                backgroundSize: `${Math.max(
                                  6,
                                  Math.round(16 * snappedScale)
                                )}px ${Math.max(6, Math.round(16 * snappedScale))}px`
                              }}
                              className="flex-1 w-full relative overflow-hidden"
                            >
                              {rIdx === 0 && (
                                <div
                                  style={{
                                    borderColor: colorHex,
                                    boxShadow: `0 0 14px ${colorHex}`
                                  }}
                                  className="absolute -top-3 left-1/2 -translate-x-1/2 w-10 h-6 rounded-full border-2 opacity-80"
                                />
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Guide Overlay inside Arena showing exact Pixel Size & Scale */}
                        {showGuides && (
                          <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/85 border border-cyan-500/50 font-mono-tabular text-[9px] text-cyan-300">
                            {arenaW}×{arenaH} ({snappedScale.toFixed(2)}x)
                          </div>
                        )}
                      </div>

                      {/* Bottom Minit Card */}
                      {m && cardCfg.SHOW && (
                        <div
                          style={{
                            width: cardWidth,
                            marginTop: cardCfg.MARGIN_TOP,
                            padding: cardCfg.PADDING,
                            transform: `translate(${cardCfg.OFFSET_X}px, ${cardCfg.OFFSET_Y}px)`
                          }}
                          className="bg-[#0a0c12]/95 border border-slate-800"
                        >
                          <div
                            style={{
                              height: cardCfg.ACCENT_BAR_HEIGHT,
                              backgroundColor: colorHex
                            }}
                            className="w-full mb-1.5"
                          />
                          <div className="flex items-start gap-2 min-w-0">
                            <div
                              style={{
                                width: cardCfg.ICON_BOX_SIZE,
                                height: cardCfg.ICON_BOX_SIZE
                              }}
                              className="bg-[#05060a] border border-slate-800 flex items-center justify-center shrink-0"
                            >
                              {MinitPreviewDataUrls[m.id] && (
                                <img
                                  src={MinitPreviewDataUrls[m.id]}
                                  alt={m.name}
                                  style={{
                                    width: cardCfg.ICON_SPRITE_SIZE,
                                    height: cardCfg.ICON_SPRITE_SIZE
                                  }}
                                  className="object-contain pixelated-canvas"
                                />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1">
                                <span
                                  style={{
                                    color: colorHex,
                                    fontSize: cardCfg.NAME_FONT_SIZE
                                  }}
                                  className="font-pixel truncate"
                                >
                                  {m.name}
                                </span>
                                <span
                                  style={{ color: colorHex }}
                                  className="text-[9px] font-mono-tabular font-semibold shrink-0"
                                >
                                  {idx === 0 ? 'BUFF×2' : 'READY'}
                                </span>
                              </div>
                              <p
                                style={{
                                  fontSize: cardCfg.DESC_FONT_SIZE,
                                  WebkitLineClamp: cardCfg.DESC_MAX_LINES,
                                  display: '-webkit-box',
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden'
                                }}
                                className="text-slate-300 leading-snug mt-0.5"
                              >
                                {m.desc}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
