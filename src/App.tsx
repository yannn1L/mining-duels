import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as PIXI from 'pixi.js';
import {
  Play,
  Pause,
  StepForward,
  FastForward,
  RotateCcw,
  Settings as SettingsIcon,
  Shuffle,
  Volume2,
  VolumeX,
  Monitor,
  Trophy,
  ArrowLeft,
  Zap,
  Layers,
  Pickaxe,
  Terminal,
  Upload,
  Download,
  Trash2,
  Bug,
  BarChart3,
  FileCode2,
  CheckCircle2,
  AlertTriangle,
  X,
  Sliders,
  Sparkles
} from 'lucide-react';
import {
  CFG,
  OrientationLayoutConfig,
  PALETTE,
  computeArenaDimensions,
  numToHex
} from './data/config';
import { ArenaLayoutTweaker } from './components/ArenaLayoutTweaker';
import { MINIT_DB, MINIT_LIST } from './data/minits';
import { AssetBaker } from './engine/assetBaker';
import { AudioSys, SettingsService } from './engine/audio';
import { FastMath } from './engine/fastMath';
import { MinitPreviewDataUrls, Textures } from './engine/textures';
import { Arena } from './engine/arena';
import {
  MinitModService,
  generateStarterTemplateTs
} from './engine/minitModService';
import { runHeadlessBalanceCheck } from './engine/headlessSim';
import {
  BalanceReport,
  CustomMinitRecord,
  DebugConfig,
  GameScreen,
  GameSettings,
  PlayerTelemetry
} from './types/game';

// Configure PixiJS global defaults for crisp pixel art before any application is created
PIXI.BaseTexture.defaultOptions.scaleMode = PIXI.SCALE_MODES.NEAREST;
PIXI.BaseTexture.defaultOptions.mipmap = PIXI.MIPMAP_MODES.OFF;
PIXI.settings.ROUND_PIXELS = true;

interface BgFloater extends PIXI.Sprite {
  vx: number;
  vy: number;
}

type DuelPhase = 'COUNTDOWN' | 'ACTIVE' | 'OVERTIME' | 'SLOWMO' | 'FINISHED';
type DevLabTab = 'MINITS' | 'BALANCE' | 'DEBUG';

function getActiveLayout(vw: number, vh: number): {
  isPortrait: boolean;
  layout: OrientationLayoutConfig;
} {
  const isPortrait = CFG.LAYOUT.USE_ASPECT_RATIO
    ? vw < vh || vw < CFG.LAYOUT.PORTRAIT_MAX_WIDTH
    : vw < CFG.LAYOUT.PORTRAIT_MAX_WIDTH;
  return {
    isPortrait,
    layout: isPortrait ? CFG.LAYOUT.PORTRAIT : CFG.LAYOUT.LANDSCAPE
  };
}

export default function App() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const duelContainerRef = useRef<PIXI.Container | null>(null);
  const arenasRef = useRef<Arena[]>([]);

  const p1AnchorRef = useRef<HTMLDivElement | null>(null);
  const p2AnchorRef = useRef<HTMLDivElement | null>(null);

  const [booted, setBooted] = useState(false);
  const [screen, setScreen] = useState<GameScreen>('TITLE_MENU');
  const [editorView, setEditorView] = useState<'ROSTER' | 'LAYOUT'>('ROSTER');
  const [selectedMinits, setSelectedMinits] = useState<string[]>(['laser', 'absorb']);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(() => SettingsService.load());

  // Roster version counter to trigger re-renders when custom Minits are added/deleted
  const [rosterVersion, setRosterVersion] = useState(0);
  const [customRecords, setCustomRecords] = useState<CustomMinitRecord[]>(() =>
    MinitModService.getRecords()
  );

  // Dev Lab Modal & Minit Importer State
  const [devLabOpen, setDevLabOpen] = useState(false);
  const [devLabTab, setDevLabTab] = useState<DevLabTab>('MINITS');
  const [tsEditorCode, setTsEditorCode] = useState<string>(() =>
    generateStarterTemplateTs('vortex')
  );
  const [tsFileName, setTsFileName] = useState<string>('vortex.ts');
  const [modStatus, setModStatus] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);

  // Headless Balance Check State
  const [balanceMode, setBalanceMode] = useState<'ROUND_ROBIN' | 'ONE_VS_ONE'>(
    'ROUND_ROBIN'
  );
  const [matchesPerPair, setMatchesPerPair] = useState<number>(5);
  const [balanceP1, setBalanceP1] = useState<string>('laser');
  const [balanceP2, setBalanceP2] = useState<string>('absorb');
  const [balanceRunning, setBalanceRunning] = useState(false);
  const [balanceReport, setBalanceReport] = useState<BalanceReport | null>(null);

  // Debug Mode Configuration State
  const [debugConfig, setDebugConfig] = useState<DebugConfig>({
    enabled: false,
    showHitboxes: true,
    showGridCoords: false,
    showInspector: true,
    paused: false,
    speedMultiplier: 1
  });

  const debugConfigRef = useRef<DebugConfig>(debugConfig);
  useEffect(() => {
    debugConfigRef.current = debugConfig;
  }, [debugConfig]);

  // Real-time FPS & frame-time state for Debug Mode
  const [fpsInfo, setFpsInfo] = useState<{ fps: number; ms: number }>({ fps: 60, ms: 16.6 });
  const fpsCalcRef = useRef<{
    lastTime: number;
    frames: number;
    accumMs: number;
  }>({
    lastTime: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    frames: 0,
    accumMs: 0
  });

  // Simulation state
  const [duelPhase, setDuelPhase] = useState<DuelPhase>('ACTIVE');
  const [timeLeft, setTimeLeft] = useState<number>(CFG.SIM.DUR);
  const [overtimeRemaining, setOvertimeRemaining] = useState<number>(0);
  const [arenaLayoutState, setArenaLayoutState] = useState<{
    w: number;
    h: number;
    scale: number;
    isPortrait: boolean;
    layout: OrientationLayoutConfig;
  }>(() => {
    const init = getActiveLayout(
      typeof window !== 'undefined' ? window.innerWidth : 800,
      typeof window !== 'undefined' ? window.innerHeight : 600
    );
    return {
      w: CFG.GRID.COLS * CFG.GRID.TS,
      h: CFG.GRID.ROWS * CFG.GRID.TS,
      scale: 1,
      isPortrait: init.isPortrait,
      layout: init.layout
    };
  });

  const [telemetry, setTelemetry] = useState<[PlayerTelemetry | null, PlayerTelemetry | null]>([
    null,
    null
  ]);

  const simStateRef = useRef({
    screen: 'TITLE_MENU' as GameScreen,
    phase: 'ACTIVE' as DuelPhase,
    tl: CFG.SIM.DUR,
    overtimeTarget: 0,
    slowmoTimer: 0,
    pendingSteps: 0,
    telemetryTick: 0,
    lastTimeTenths: Math.ceil(CFG.SIM.DUR * 10),
    lastOvertimeRem: CFG.SIM.OVERTIME_HITS
  });

  useEffect(() => {
    simStateRef.current.screen = screen;
  }, [screen]);

  const syncArenaLayout = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const { isPortrait, layout } = getActiveLayout(vw, vh);
    const { w, h, scale: snappedScale } = computeArenaDimensions(vw, vh, layout);

    setArenaLayoutState({
      w,
      h,
      scale: snappedScale,
      isPortrait,
      layout: { ...layout }
    });

    requestAnimationFrame(() => {
      const arenas = arenasRef.current;
      const anchors = [p1AnchorRef.current, p2AnchorRef.current];
      const dpr = appRef.current?.renderer.resolution || 1;
      arenas.forEach((arena, idx) => {
        const anchor = anchors[idx];
        if (!arena || !anchor) return;
        const rect = anchor.getBoundingClientRect();
        arena.scale.set(snappedScale);
        arena.x = Math.round(rect.left);
        arena.y = Math.round(rect.top);
        arena.renderScale = snappedScale * dpr;
      });
    });
  }, []);

  const refreshTelemetrySnapshot = useCallback((arenas: Arena[], dbg: DebugConfig) => {
    setTelemetry((prev) => {
      if (!dbg.enabled && prev[0] && prev[1] && arenas.length === 2) {
        let changed = false;
        for (let i = 0; i < 2; i++) {
          const a = arenas[i];
          const slot = a.slots[0];
          const p = prev[i];
          if (!slot || !p) {
            changed = true;
            break;
          }
          const sc = Math.floor(a.stats.d * CFG.SIM.MULT) + a.stats.maxDp;
          const effectiveCd = Math.max(1, Math.floor(slot.md.cd / slot.modifiers.speedMul));
          const cdQuant = Math.round(Math.min(1, slot.log.t / effectiveCd) * 20);
          const prevCdQuant = Math.round(p.cdPct * 20);
          if (
            p.id !== slot.md.id ||
            p.score !== sc ||
            p.depth !== a.stats.maxDp ||
            p.mined !== a.stats.d ||
            prevCdQuant !== cdQuant ||
            p.effects.length !== slot.effects.length ||
            p.debug !== undefined
          ) {
            changed = true;
            break;
          }
          for (let j = 0; j < slot.effects.length; j++) {
            const eff = slot.effects[j];
            const pe = p.effects[j];
            const pctQuant = Math.round((eff.duration / eff.def.defaultDur) * 10);
            const prevPctQuant = Math.round(pe.pct * 10);
            if (pe.id !== eff.id || pe.stacks !== eff.stacks || pctQuant !== prevPctQuant) {
              changed = true;
              break;
            }
          }
          if (changed) break;
        }
        if (!changed) return prev;
      }

      return arenas.map((a): PlayerTelemetry | null => {
        const slot = a.slots[0];
        if (!slot) return null;
        const md = slot.md;
        const sc = Math.floor(a.stats.d * CFG.SIM.MULT) + a.stats.maxDp;
        const effectiveCd = Math.max(1, Math.floor(md.cd / slot.modifiers.speedMul));
        return {
          id: md.id,
          name: md.name,
          colorHex: numToHex(md.color),
          score: sc,
          depth: a.stats.maxDp,
          mined: a.stats.d,
          cdPct: Math.min(1, slot.log.t / effectiveCd),
          effects: slot.effects.map((e) => ({
            id: e.id,
            label: e.label,
            colorHex: numToHex(e.color),
            stacks: e.stacks,
            pct: Math.max(0, Math.min(1, e.duration / e.def.defaultDur))
          })),
          debug: dbg.enabled ? a.getDebugSnapshot() : undefined
        };
      }) as [PlayerTelemetry | null, PlayerTelemetry | null];
    });
  }, []);

  // Boot PixiJS Engine, Bake Procedural Assets, and Load Saved Custom .ts Minits
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let destroyed = false;
    // Cap DPR to 2.0 max to prevent mobile 3x / 3.5x Retina displays from allocating 4K+ render targets
    // and overwhelming mobile tile-based deferred renderers (TBDR GPUs)
    const dpr = Math.min(2, Math.max(1, Math.ceil(window.devicePixelRatio || 1)));

    const app = new PIXI.Application({
      view: canvas,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: CFG.APP.BG_COLOR,
      resolution: dpr,
      autoDensity: true,
      antialias: false,
      powerPreference: 'high-performance'
    });
    appRef.current = app;

    const bgContainer = new PIXI.Container();
    const floatersContainer = new PIXI.Container();
    const duelContainer = new PIXI.Container();
    app.stage.addChild(bgContainer, duelContainer);
    duelContainerRef.current = duelContainer;

    const globalBg = new PIXI.TilingSprite(
      PIXI.Texture.EMPTY,
      window.innerWidth,
      window.innerHeight
    );
    globalBg.alpha = 0.55;
    bgContainer.addChild(globalBg, floatersContainer);

    const floaters: BgFloater[] = [];

    const handleResize = () => {
      if (!appRef.current) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      appRef.current.renderer.resize(w, h);
      globalBg.width = w;
      globalBg.height = h;
      syncArenaLayout();
    };

    const handleScroll = () => {
      syncArenaLayout();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    window.addEventListener('scroll', handleScroll, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if (rootRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => handleResize());
      resizeObserver.observe(rootRef.current);
    }

    Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 1500))
    ]).then(async () => {
      if (destroyed) return;
      await AssetBaker.bake(app.renderer);
      const loadedCustom = await MinitModService.loadCustomMinitsOnBoot(app.renderer);
      if (destroyed) return;

      setCustomRecords(loadedCustom);
      setRosterVersion((v) => v + 1);

      globalBg.texture = Textures['bg_grid'];

      const keys = Object.keys(MINIT_DB);
      for (let i = 0; i < 22; i++) {
        const id = keys[(FastMath.rand() * keys.length) | 0];
        const tex = Textures[`minit_${id}_base`] || PIXI.Texture.WHITE;
        const f = new PIXI.Sprite(tex) as BgFloater;
        f.anchor.set(0.5);
        const intScale = 2 + ((FastMath.rand() * 3) | 0);
        f.scale.set(intScale);
        f.x = FastMath.rand() * window.innerWidth;
        f.y = FastMath.rand() * window.innerHeight;
        f.vx = FastMath.randRange(-0.6, 0.6);
        f.vy = FastMath.randRange(-0.6, 0.6);
        f.alpha = FastMath.randRange(0.12, 0.32);
        f.tint = 0x00aaff;
        floatersContainer.addChild(f);
        floaters.push(f);
      }

      app.ticker.add((dl) => {
        const rawDt = Math.min(dl, CFG.SIM.MAX_DT);
        const dt = rawDt > 0.88 && rawDt < 1.12 ? 1.0 : rawDt;

        // Measure live FPS for Debug Mode
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const calc = fpsCalcRef.current;
        const deltaMs = now - calc.lastTime;
        calc.lastTime = now;
        calc.frames++;
        calc.accumMs += deltaMs;

        if (calc.accumMs >= 200) {
          if (debugConfigRef.current.enabled) {
            const avgMs = calc.accumMs / Math.max(1, calc.frames);
            const measuredFps = Math.min(120, Math.round((1000 / Math.max(1, avgMs)) * 10) / 10);
            setFpsInfo({
              fps: measuredFps,
              ms: Math.round(avgMs * 10) / 10
            });
          }
          calc.frames = 0;
          calc.accumMs = 0;
        }

        const st = simStateRef.current;
        const inSim = st.screen === 'SIMULATION';

        // Pause & hide background floaters during active duel simulations to eliminate background overdraw
        if (floatersContainer.visible === inSim) {
          floatersContainer.visible = !inSim;
        }
        if (!inSim) {
          for (const f of floaters) {
            f.x += f.vx * dt;
            f.y += f.vy * dt;
            f.rotation += f.vx * 0.015 * dt;
            if (f.x < -80) f.x = window.innerWidth + 80;
            else if (f.x > window.innerWidth + 80) f.x = -80;
            if (f.y < -80) f.y = window.innerHeight + 80;
            else if (f.y > window.innerHeight + 80) f.y = -80;
          }
          return;
        }

        if (st.phase === 'FINISHED') {
          return;
        }

        const arenas = arenasRef.current;
        if (arenas.length !== 2) return;

        const dbg = debugConfigRef.current;
        const speedMul = dbg.enabled ? dbg.speedMultiplier : 1;

        // Handle Debug Pause & Step-by-Step Frame Controls
        if (dbg.enabled && dbg.paused) {
          const hadSteps = st.pendingSteps > 0;
          if (hadSteps) {
            const stepsToRun = st.pendingSteps;
            st.pendingSteps = 0;
            for (let s = 0; s < stepsToRun; s++) {
              if (st.phase === 'ACTIVE') {
                st.tl = Math.max(0, st.tl - 1 / 60);
                if (st.tl <= 0) {
                  st.phase = 'OVERTIME';
                  const tot = arenas[0].stats.d + arenas[1].stats.d;
                  st.overtimeTarget = tot + CFG.SIM.OVERTIME_HITS;
                  st.lastTimeTenths = 0;
                  st.lastOvertimeRem = CFG.SIM.OVERTIME_HITS;
                  setTimeLeft(0);
                  setOvertimeRemaining(CFG.SIM.OVERTIME_HITS);
                  setDuelPhase('OVERTIME');
                } else {
                  setTimeLeft(st.tl);
                }
              } else if (st.phase === 'OVERTIME') {
                const tot = arenas[0].stats.d + arenas[1].stats.d;
                const rem = Math.max(0, st.overtimeTarget - tot);
                setOvertimeRemaining(rem);
                if (tot >= st.overtimeTarget) {
                  st.phase = 'SLOWMO';
                  st.slowmoTimer = CFG.SIM.SLOWMO_DUR;
                  setDuelPhase('SLOWMO');
                }
              }
              arenas.forEach((a) => a.tickLogic());
            }
          }
          arenas.forEach((a) => {
            a.updateVisuals(dt);
            a.renderDebug(dbg);
          });
          if (hadSteps) {
            refreshTelemetrySnapshot(arenas, dbg);
          }
          return;
        }

        let currentScale = dt * speedMul;

        if (st.phase === 'SLOWMO') {
          currentScale = CFG.SIM.SLOWMO_SPEED * dt * speedMul;
          st.slowmoTimer -= dt * speedMul;
          if (st.slowmoTimer <= 0) {
            st.phase = 'FINISHED';
            refreshTelemetrySnapshot(arenas, dbg);
            setDuelPhase('FINISHED');
            AudioSys.play('win');
            return;
          }
        } else if (st.phase === 'ACTIVE') {
          st.tl -= currentScale / 60;
          if (st.tl <= 0) {
            st.tl = 0;
            st.phase = 'OVERTIME';
            const tot = arenas[0].stats.d + arenas[1].stats.d;
            st.overtimeTarget = tot + CFG.SIM.OVERTIME_HITS;
            st.lastTimeTenths = 0;
            st.lastOvertimeRem = CFG.SIM.OVERTIME_HITS;
            setTimeLeft(0);
            setOvertimeRemaining(CFG.SIM.OVERTIME_HITS);
            setDuelPhase('OVERTIME');
          } else {
            const tenths = Math.ceil(st.tl * 10);
            if (tenths !== st.lastTimeTenths) {
              st.lastTimeTenths = tenths;
              setTimeLeft(st.tl);
            }
          }
        } else if (st.phase === 'OVERTIME') {
          const tot = arenas[0].stats.d + arenas[1].stats.d;
          const rem = Math.max(0, st.overtimeTarget - tot);
          if (rem !== st.lastOvertimeRem) {
            st.lastOvertimeRem = rem;
            setOvertimeRemaining(rem);
          }
          if (tot >= st.overtimeTarget) {
            st.phase = 'SLOWMO';
            st.slowmoTimer = CFG.SIM.SLOWMO_DUR;
            setDuelPhase('SLOWMO');
          }
        }

        arenas.forEach((a) => {
          a.update(currentScale, true, currentScale);
          a.renderDebug(dbg);
        });

        st.telemetryTick = (st.telemetryTick + 1) % 5;
        if (st.telemetryTick === 0) {
          refreshTelemetrySnapshot(arenas, dbg);
        }
      });

      setBooted(true);
    });

    return () => {
      destroyed = true;
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      window.removeEventListener('scroll', handleScroll);
      if (resizeObserver) resizeObserver.disconnect();
      app.destroy(true, { children: true });
    };
  }, [syncArenaLayout, refreshTelemetrySnapshot]);

  // Cleanup arenas when leaving SIMULATION
  const destroyArenas = useCallback(() => {
    const duelCont = duelContainerRef.current;
    arenasRef.current.forEach((a) => {
      if (duelCont && a.parent === duelCont) {
        duelCont.removeChild(a);
      }
      a.destroy({ children: true });
    });
    arenasRef.current = [];
  }, []);

  // Start a 2-player duel with two minit IDs
  const startDuel = useCallback(
    (pair: string[]) => {
      if (pair.length !== 2 || !duelContainerRef.current) return;
      const p1Id = MINIT_DB[pair[0]] ? pair[0] : MINIT_LIST[0].id;
      const p2Id = MINIT_DB[pair[1]] ? pair[1] : MINIT_LIST[1]?.id || MINIT_LIST[0].id;

      AudioSys.init();
      AudioSys.play('start');

      destroyArenas();

      const a1 = new Arena(p1Id, 2, false);
      const a2 = new Arena(p2Id, 2, false);
      a1.opponentArena = a2;
      a2.opponentArena = a1;

      duelContainerRef.current.addChild(a1, a2);
      arenasRef.current = [a1, a2];

      simStateRef.current.phase = 'ACTIVE';
      simStateRef.current.tl = CFG.SIM.DUR;
      simStateRef.current.overtimeTarget = 0;
      simStateRef.current.slowmoTimer = 0;
      simStateRef.current.pendingSteps = 0;
      simStateRef.current.telemetryTick = 0;
      simStateRef.current.lastTimeTenths = Math.ceil(CFG.SIM.DUR * 10);
      simStateRef.current.lastOvertimeRem = CFG.SIM.OVERTIME_HITS;

      refreshTelemetrySnapshot([a1, a2], debugConfigRef.current);
      setDuelPhase('ACTIVE');
      setTimeLeft(CFG.SIM.DUR);
      setOvertimeRemaining(CFG.SIM.OVERTIME_HITS);
      setScreen('SIMULATION');

      setTimeout(() => syncArenaLayout(), 0);
      setTimeout(() => syncArenaLayout(), 60);
    },
    [destroyArenas, syncArenaLayout, refreshTelemetrySnapshot]
  );

  useEffect(() => {
    if (screen === 'SIMULATION') {
      syncArenaLayout();
    } else {
      destroyArenas();
    }
  }, [screen, syncArenaLayout, destroyArenas]);

  // Re-sync layout when debug mode or inspector is toggled, and observe arena anchors for layout changes
  useEffect(() => {
    if (screen === 'SIMULATION') {
      syncArenaLayout();
      const t = setTimeout(() => syncArenaLayout(), 50);

      let anchorObserver: ResizeObserver | null = null;
      if (typeof ResizeObserver !== 'undefined') {
        anchorObserver = new ResizeObserver(() => syncArenaLayout());
        if (p1AnchorRef.current) anchorObserver.observe(p1AnchorRef.current);
        if (p2AnchorRef.current) anchorObserver.observe(p2AnchorRef.current);
      }

      return () => {
        clearTimeout(t);
        if (anchorObserver) anchorObserver.disconnect();
      };
    }
  }, [screen, debugConfig.enabled, debugConfig.showInspector, syncArenaLayout]);

  // Auto-transition to EDITOR scene 5 seconds after match finishes (unless paused in Debug Mode)
  useEffect(() => {
    if (screen !== 'SIMULATION' || duelPhase !== 'FINISHED') return;
    if (debugConfig.enabled && debugConfig.paused) return;
    const timer = window.setTimeout(() => {
      setScreen('EDITOR');
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [screen, duelPhase, debugConfig.enabled, debugConfig.paused]);

  const handleToggleMinit = (id: string) => {
    AudioSys.init();
    AudioSys.play('click');
    setSelectedMinits((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return [id, id];
        return prev.filter((item, idx) => !(item === id && idx === prev.lastIndexOf(id)));
      }
      if (prev.length < 2) {
        return [...prev, id];
      }
      return [prev[1], id];
    });
  };

  const handleRandomizePair = () => {
    AudioSys.init();
    AudioSys.play('click');
    const ids = MINIT_LIST.map((m) => m.id);
    const i1 = (Math.random() * ids.length) | 0;
    let i2 = (Math.random() * ids.length) | 0;
    if (i2 === i1) i2 = (i1 + 1) % ids.length;
    setSelectedMinits([ids[i1], ids[i2]]);
  };

  const updateSetting = <K extends keyof GameSettings>(key: K, val: GameSettings[K]) => {
    AudioSys.init();
    AudioSys.play('click');
    const next = { ...settings, [key]: val };
    setSettings(next);
    SettingsService.save(next);
  };

  // Custom .ts Minit Import / Compile / Delete Handlers
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.name.toLowerCase().endsWith('.ts')) {
      setModStatus({
        type: 'error',
        msg: `Only .ts Minit files are supported (got "${file.name}").`
      });
      return;
    }

    try {
      const code = await file.text();
      setTsFileName(file.name);
      setTsEditorCode(code);
      const { def } = await MinitModService.importMinitFromTs(
        file.name,
        code,
        appRef.current?.renderer || null
      );
      setCustomRecords(MinitModService.getRecords());
      setRosterVersion((v) => v + 1);
      setSelectedMinits((prev) => [def.id, prev[0] || 'laser']);
      AudioSys.play('start');
      setModStatus({
        type: 'success',
        msg: `Imported & baked "${def.name}" (${def.id}.ts) into localStorage!`
      });
    } catch (err: any) {
      setModStatus({
        type: 'error',
        msg: err?.message || 'Failed to compile .ts Minit file.'
      });
    }
  };

  const handleCompileEditorTs = async () => {
    try {
      const { def } = await MinitModService.importMinitFromTs(
        tsFileName || 'custom.ts',
        tsEditorCode,
        appRef.current?.renderer || null
      );
      setTsFileName(`${def.id}.ts`);
      setCustomRecords(MinitModService.getRecords());
      setRosterVersion((v) => v + 1);
      setSelectedMinits((prev) => [def.id, prev[0] || 'laser']);
      AudioSys.play('start');
      setModStatus({
        type: 'success',
        msg: `Compiled & saved "${def.name}" (${def.id}.ts) to localStorage!`
      });
    } catch (err: any) {
      setModStatus({
        type: 'error',
        msg: err?.message || 'Compilation failed.'
      });
    }
  };

  const handleDeleteCustomMinit = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    AudioSys.play('click');
    if (MinitModService.deleteCustomMinit(id)) {
      setCustomRecords(MinitModService.getRecords());
      setRosterVersion((v) => v + 1);
      setSelectedMinits((prev) => {
        const filtered = prev.filter((item) => item !== id);
        while (filtered.length < 2) {
          filtered.push(MINIT_LIST[filtered.length % MINIT_LIST.length]?.id || 'laser');
        }
        return filtered;
      });
      setModStatus({
        type: 'success',
        msg: `Deleted custom Minit "${id}.ts" from localStorage.`
      });
    }
  };

  const handleRunBalanceSim = () => {
    AudioSys.play('click');
    setBalanceRunning(true);
    setTimeout(() => {
      try {
        const rep = runHeadlessBalanceCheck({
          mode: balanceMode,
          matchesPerPair,
          p1Id: balanceP1,
          p2Id: balanceP2
        });
        setBalanceReport(rep);
        AudioSys.play('win');
      } finally {
        setBalanceRunning(false);
      }
    }, 20);
  };

  const stepSimulationTicks = (ticks: number) => {
    AudioSys.play('click');
    setDebugConfig((prev) => ({ ...prev, paused: true }));
    simStateRef.current.pendingSteps += ticks;
  };

  // Determine winner when duel finishes
  const p1Tel = telemetry[0];
  const p2Tel = telemetry[1];
  const winnerInfo = (() => {
    if (!p1Tel || !p2Tel) return null;
    if (p1Tel.score > p2Tel.score) return { slot: 'P1', tel: p1Tel, isTie: false };
    if (p2Tel.score > p1Tel.score) return { slot: 'P2', tel: p2Tel, isTie: false };
    return { slot: 'TIE', tel: p1Tel, isTie: true };
  })();

  const { w: arenaW, h: arenaH, layout: activeLayout } = arenaLayoutState;
  const telCfg = activeLayout.TELEMETRY_BAR;
  const cardCfg = activeLayout.MINIT_CARD;
  const hudCfg = activeLayout.TIMER_HUD;
  const isCompactArena = arenaW < telCfg.COMPACT_WIDTH_THRESHOLD;
  const cardWidth = Math.round(arenaW * cardCfg.WIDTH_RATIO);

  // Reference rosterVersion so React re-renders MINIT_LIST updates
  void rosterVersion;

  return (
    <div
      ref={rootRef}
      className="relative w-screen h-[100dvh] overflow-hidden bg-[#050508] text-slate-100 select-none"
    >
      {/* Hidden .ts File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".ts"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* PixiJS Hardware-Accelerated Canvas (Background + Dual Simulation Arenas) */}
      <canvas
        ref={canvasRef}
        className="pixelated-canvas absolute inset-0 w-full h-full pointer-events-none z-0"
      />

      {/* Crisp non-blurring scanline overlay when Shaders (CRT) is active */}
      {settings.shaders && (
        <div className="crt-scanlines pointer-events-none fixed inset-0 z-30 opacity-60" />
      )}

      {/* Booting Screen */}
      {!booted && (
        <div className="relative z-20 flex flex-col items-center justify-center w-full h-full">
          <p className="font-pixel text-sm tracking-widest text-cyan-400">
            BOOTING SYSTEM...
          </p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          SCREEN 1: TITLE MENU
      ═══════════════════════════════════════════════════════════════════ */}
      {booted && screen === 'TITLE_MENU' && (
        <div className="relative z-20 flex flex-col items-center justify-between w-full h-full px-4 sm:px-6 py-5 sm:py-10 overflow-y-auto">
          <div className="w-full max-w-5xl flex items-center justify-between">
            <span className="font-pixel text-[9px] sm:text-[10px] text-slate-400 tracking-wider">
              ARCADE VS EDITION
            </span>
            <button
              onClick={() => updateSetting('sfx', !settings.sfx)}
              className="flex items-center gap-2 px-3 py-1.5 sm:py-2 text-xs font-medium text-slate-300 bg-slate-900/90 border border-slate-800 hover:border-cyan-400/60 transition-colors cursor-pointer"
              title="Toggle Sound Effects"
            >
              {settings.sfx ? (
                <Volume2 className="w-4 h-4 text-cyan-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-rose-400" />
              )}
              <span className="font-mono-tabular">{settings.sfx ? 'SFX ON' : 'MUTED'}</span>
            </button>
          </div>

          <div className="flex flex-col items-center text-center max-w-xl my-auto py-4">
            <div className="mb-2 sm:mb-3 text-[10px] sm:text-xs font-mono-tabular tracking-widest text-cyan-400/90">
              AUTOMATED SUBTERRANEAN COMBAT
            </div>
            <h1
              className="font-pixel text-2xl sm:text-5xl text-cyan-400 tracking-wider mb-3 sm:mb-4"
              style={{ textShadow: '0 4px 0 #000, 0 0 24px rgba(0,204,255,0.35)' }}
            >
              MINING DUELS
            </h1>
            <p className="text-xs sm:text-base text-slate-300 max-w-md mb-6 sm:mb-10 leading-relaxed px-2">
              Select two specialized autonomous mining units and pit them head-to-head in a
              20-second high-depth excavation showdown.
            </p>

            {/* Primary Menu Actions */}
            <div className="flex flex-col gap-3 sm:gap-4 w-64 sm:w-80">
              <button
                onClick={() => {
                  AudioSys.init();
                  AudioSys.play('start');
                  setScreen('EDITOR');
                }}
                className="group relative flex items-center justify-center gap-3 px-6 py-3.5 sm:py-4 bg-[#11131c] border-2 border-cyan-400 hover:bg-cyan-400/15 transition-all cursor-pointer shadow-[0_4px_0_#000]"
              >
                <Play className="w-4 h-4 text-cyan-400 fill-cyan-400" />
                <span className="font-pixel text-xs sm:text-sm text-white tracking-wider">
                  VS MODE
                </span>
              </button>

              <button
                onClick={() => {
                  AudioSys.init();
                  AudioSys.play('start');
                  const ids = MINIT_LIST.map((m) => m.id);
                  const i1 = (Math.random() * ids.length) | 0;
                  const i2 = (i1 + 1 + ((Math.random() * (ids.length - 1)) | 0)) % ids.length;
                  const pair = [ids[i1], ids[i2]];
                  setSelectedMinits(pair);
                  startDuel(pair);
                }}
                className="flex items-center justify-center gap-3 px-6 py-3 sm:py-3.5 bg-[#0d0f17] border border-slate-700 hover:border-cyan-400/80 hover:bg-slate-900 transition-all cursor-pointer shadow-[0_4px_0_#000]"
              >
                <Shuffle className="w-4 h-4 text-cyan-400" />
                <span className="font-pixel text-[11px] sm:text-xs text-slate-200 tracking-wider">
                  QUICK DUEL
                </span>
              </button>

              <button
                onClick={() => {
                  AudioSys.init();
                  AudioSys.play('click');
                  setSettingsOpen(true);
                }}
                className="flex items-center justify-center gap-3 px-6 py-3 sm:py-3.5 bg-[#0d0f17] border border-slate-700 hover:border-cyan-400/80 hover:bg-slate-900 transition-all cursor-pointer shadow-[0_4px_0_#000]"
              >
                <SettingsIcon className="w-4 h-4 text-slate-400" />
                <span className="font-pixel text-[11px] sm:text-xs text-slate-200 tracking-wider">
                  SETTINGS
                </span>
              </button>
            </div>
          </div>

          <footer className="w-full max-w-5xl flex items-center justify-between text-[10px] sm:text-xs text-slate-500 font-mono-tabular">
            <span>{MINIT_LIST.length} MINITS · PIXEL-LOCKED ENGINE</span>
            <span>60 FPS DETERMINISTIC TICK</span>
          </footer>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          SCREEN 2: EDITOR / MINIT SELECTION & ARENA LAYOUT STUDIO
      ═══════════════════════════════════════════════════════════════════ */}
      {booted && screen === 'EDITOR' && (
        <div className="relative z-20 flex flex-col w-full h-full max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
          {/* Top Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 pb-2.5 border-b border-slate-800/80 shrink-0">
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  AudioSys.play('click');
                  setScreen('TITLE_MENU');
                }}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-medium text-slate-300 bg-slate-900/90 border border-slate-800 hover:border-cyan-400 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden xs:inline sm:inline">Menu</span>
              </button>

              {/* Editor Mode Switcher: Minit Roster vs Arena Layout Studio */}
              <div className="flex items-center bg-[#06080f] border border-slate-800 p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    AudioSys.play('click');
                    setEditorView('ROSTER');
                  }}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 font-pixel text-[9px] sm:text-[10px] tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
                    editorView === 'ROSTER'
                      ? 'bg-cyan-400 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Pickaxe className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>MINITS</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    AudioSys.play('click');
                    setEditorView('LAYOUT');
                  }}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 font-pixel text-[9px] sm:text-[10px] tracking-wider transition-colors cursor-pointer whitespace-nowrap ${
                    editorView === 'LAYOUT'
                      ? 'bg-cyan-400 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Sliders className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>ARENA LAYOUT</span>
                </button>
              </div>
            </div>

            <div className="hidden md:block text-center min-w-0">
              <h2 className="font-pixel text-xs sm:text-base text-white tracking-wider truncate">
                {editorView === 'ROSTER' ? 'SELECT 2 MINITS' : 'ARENA LAYOUT STUDIO'}
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                {editorView === 'ROSTER'
                  ? 'Pick P1 & P2 contenders or open Dev Lab for .ts Minits & Balance'
                  : 'Tweak Portrait & Landscape arena geometry with real-time example preview'}
              </p>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                onClick={() => {
                  AudioSys.init();
                  AudioSys.play('click');
                  setDevLabOpen(true);
                }}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs font-pixel tracking-wider border transition-colors cursor-pointer whitespace-nowrap ${
                  debugConfig.enabled
                    ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300'
                    : 'bg-[#101524] border-cyan-500/80 text-cyan-300 hover:border-cyan-300 hover:bg-cyan-950/50'
                }`}
                title="Open Dev Lab: Import .ts Minits, Headless Balance Check & Debugger"
              >
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>DEV LAB</span>
                {customRecords.length > 0 && (
                  <span className="px-1 py-0.2 bg-cyan-500/20 text-cyan-300 text-[9px] border border-cyan-500/40">
                    +{customRecords.length}
                  </span>
                )}
                {debugConfig.enabled && (
                  <span className="w-2 h-2 bg-emerald-400 animate-pulse" />
                )}
              </button>

              <button
                onClick={handleRandomizePair}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-medium text-cyan-300 bg-slate-900/90 border border-slate-800 hover:border-cyan-400 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Random</span>
              </button>
            </div>
          </div>

          {/* Main Editor Body: Either Minit Roster Grid OR Arena Layout Tweaker */}
          {editorView === 'ROSTER' ? (
            <div className="flex-1 overflow-y-auto py-3 pr-0.5 min-h-0">
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
                {MINIT_LIST.map((m) => {
                  const isP1 = selectedMinits[0] === m.id;
                  const isP2 = selectedMinits[1] === m.id;
                  const isSelected = isP1 || isP2;
                  const hex = numToHex(m.color);
                  const previewUrl = MinitPreviewDataUrls[m.id];

                  return (
                    <div
                      key={m.id}
                      onClick={() => handleToggleMinit(m.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') handleToggleMinit(m.id);
                      }}
                      className={`group relative flex flex-col justify-between text-left p-2.5 sm:p-3.5 bg-[#0b0d14]/95 border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-cyan-400 ring-1 ring-cyan-400/50 bg-[#101522]'
                          : 'border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-1.5 mb-2 w-full">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center bg-[#06070b] border border-slate-800 shrink-0"
                              style={{ borderColor: isSelected ? hex : undefined }}
                            >
                              {previewUrl ? (
                                <img
                                  src={previewUrl}
                                  alt={m.name}
                                  className="w-6 h-6 sm:w-8 sm:h-8 object-contain pixelated-canvas"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div
                                  className="w-5 h-5"
                                  style={{ backgroundColor: hex }}
                                />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="font-pixel text-[10px] sm:text-xs tracking-wide truncate"
                                  style={{ color: hex }}
                                >
                                  {m.name}
                                </span>
                                {m.isCustom && (
                                  <span className="px-1 py-0.2 bg-amber-500/20 border border-amber-400/50 text-amber-300 font-pixel text-[8px] shrink-0">
                                    .TS
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">
                                {m.role || 'Excavator'}
                              </div>
                            </div>
                          </div>

                          {(isP1 || isP2) && (
                            <span className="font-pixel text-[8px] sm:text-[9px] text-cyan-300 shrink-0">
                              {isP1 && isP2 ? 'P1·P2' : isP1 ? 'P1' : 'P2'}
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] sm:text-xs text-slate-300 leading-relaxed">
                          {m.desc}
                        </p>
                      </div>

                      {m.isCustom && (
                        <div className="flex items-center justify-end gap-1.5 mt-2.5 pt-2 border-t border-slate-800/80">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              AudioSys.play('click');
                              MinitModService.exportMinitTsFile(m.id);
                            }}
                            className="flex items-center gap-1 px-2 py-1 text-[9px] font-pixel bg-slate-900 border border-slate-700 text-cyan-300 hover:border-cyan-400 cursor-pointer"
                            title={`Export ${m.id}.ts`}
                          >
                            <Download className="w-3 h-3" />
                            <span>.TS</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteCustomMinit(m.id, e)}
                            className="flex items-center gap-1 px-2 py-1 text-[9px] font-pixel bg-rose-950/60 border border-rose-700/70 text-rose-300 hover:border-rose-400 cursor-pointer"
                            title={`Delete ${m.name}`}
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>DEL</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 py-2.5 overflow-hidden flex flex-col">
              <ArenaLayoutTweaker
                selectedMinits={selectedMinits}
                isCurrentDevicePortrait={arenaLayoutState.isPortrait}
                onLayoutUpdated={syncArenaLayout}
              />
            </div>
          )}

          {/* Matchup Dock & Start Duel Button */}
          <div className="pt-2.5 border-t border-slate-800/90 flex items-center justify-between gap-2 sm:gap-4 bg-[#080a10]/95 px-3 sm:px-4 py-2.5 sm:py-3 border shrink-0">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              {[0, 1].map((slotIdx) => {
                const mId = selectedMinits[slotIdx];
                const m = mId ? MINIT_DB[mId] : null;
                return (
                  <React.Fragment key={slotIdx}>
                    {slotIdx === 1 && (
                      <span className="font-pixel text-[10px] sm:text-xs text-rose-500 shrink-0">
                        VS
                      </span>
                    )}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[#05060a] border border-slate-800 flex items-center justify-center shrink-0">
                        {m && MinitPreviewDataUrls[m.id] ? (
                          <img
                            src={MinitPreviewDataUrls[m.id]}
                            alt={m.name}
                            className="w-6 h-6 sm:w-7 sm:h-7 object-contain pixelated-canvas"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="font-pixel text-[9px] text-slate-600">
                            P{slotIdx + 1}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[9px] sm:text-[11px] font-mono-tabular text-slate-400">
                          P{slotIdx + 1}
                        </div>
                        <div
                          className="font-pixel text-[10px] sm:text-xs truncate"
                          style={{ color: m ? numToHex(m.color) : '#64748b' }}
                        >
                          {m ? m.name : 'SELECT'}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            <button
              disabled={selectedMinits.length < 2}
              onClick={() => startDuel(selectedMinits.slice(0, 2))}
              className="flex items-center justify-center gap-2 px-4 sm:px-7 py-2.5 sm:py-3.5 bg-cyan-400 text-slate-950 font-pixel text-[10px] sm:text-xs tracking-wider hover:bg-cyan-300 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-[0_3px_0_#0891b2]"
            >
              <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-slate-950" />
              <span>START DUEL</span>
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          SCREEN 3: LIVE SIMULATION DUEL
          Driven by CFG.LAYOUT.PORTRAIT and CFG.LAYOUT.LANDSCAPE in config.ts
      ═══════════════════════════════════════════════════════════════════ */}
      {booted && screen === 'SIMULATION' && (
        <>
          {/* Top Fixed Debug Mode Toolbar with Live FPS Counter (Visible ONLY when Debug Mode is enabled) */}
          {debugConfig.enabled && (
            <div className="fixed top-2 left-1/2 -translate-x-1/2 z-40 max-w-[96vw] flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 bg-[#090d16]/95 border border-emerald-500/80 px-2.5 sm:px-3 py-1.5 pointer-events-auto shadow-[0_4px_24px_rgba(0,0,0,0.85)] backdrop-blur-md">
              <span className="font-pixel text-[9px] text-emerald-400 flex items-center gap-1 shrink-0">
                <Bug className="w-3 h-3" />
                DBG
              </span>

              {/* Real-time FPS & Frame-time Counter */}
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#04060a] border border-slate-800 font-mono-tabular text-[9px] sm:text-[10px] shrink-0">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    fpsInfo.fps >= 55
                      ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                      : fpsInfo.fps >= 35
                      ? 'bg-amber-400 shadow-[0_0_6px_#fbbf24]'
                      : 'bg-rose-500 shadow-[0_0_6px_#f43f5e]'
                  }`}
                />
                <span
                  className={`font-semibold ${
                    fpsInfo.fps >= 55
                      ? 'text-emerald-400'
                      : fpsInfo.fps >= 35
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {fpsInfo.fps.toFixed(1)} FPS
                </span>
                <span className="text-slate-400 text-[8px] sm:text-[9px]">
                  {fpsInfo.ms.toFixed(1)}ms
                </span>
              </div>

              {/* Transport: Pause/Resume */}
              <button
                onClick={() => {
                  AudioSys.play('click');
                  setDebugConfig((prev) => ({ ...prev, paused: !prev.paused }));
                }}
                className={`flex items-center gap-1 px-2 py-1 text-[9px] font-pixel border cursor-pointer shrink-0 ${
                  debugConfig.paused
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-cyan-400'
                }`}
              >
                {debugConfig.paused ? (
                  <>
                    <Play className="w-3 h-3" /> RESUME
                  </>
                ) : (
                  <>
                    <Pause className="w-3 h-3" /> PAUSE
                  </>
                )}
              </button>

              {/* Frame Stepping */}
              <button
                onClick={() => stepSimulationTicks(1)}
                className="flex items-center gap-1 px-1.5 py-1 text-[9px] font-pixel bg-slate-900 border border-slate-700 text-cyan-300 hover:border-cyan-400 cursor-pointer shrink-0"
                title="Advance exactly 1 deterministic tick"
              >
                <StepForward className="w-3 h-3" /> +1T
              </button>

              <button
                onClick={() => stepSimulationTicks(10)}
                className="flex items-center gap-1 px-1.5 py-1 text-[9px] font-pixel bg-slate-900 border border-slate-700 text-cyan-300 hover:border-cyan-400 cursor-pointer shrink-0"
                title="Advance 10 deterministic ticks"
              >
                <FastForward className="w-3 h-3" /> +10T
              </button>

              {/* Speed Multipliers */}
              <div className="flex items-center gap-0.5 shrink-0">
                {[0.25, 0.5, 1, 2].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => {
                      AudioSys.play('click');
                      setDebugConfig((prev) => ({
                        ...prev,
                        speedMultiplier: spd,
                        paused: false
                      }));
                    }}
                    className={`px-1.5 py-1 text-[8px] sm:text-[9px] font-pixel border cursor-pointer ${
                      !debugConfig.paused && debugConfig.speedMultiplier === spd
                        ? 'bg-cyan-500/25 border-cyan-400 text-cyan-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>

              {/* Overlays: Hitboxes & Grid */}
              <button
                onClick={() => {
                  AudioSys.play('click');
                  setDebugConfig((prev) => ({ ...prev, showHitboxes: !prev.showHitboxes }));
                }}
                className={`px-1.5 py-1 text-[8px] sm:text-[9px] font-pixel border cursor-pointer shrink-0 ${
                  debugConfig.showHitboxes
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                    : 'bg-slate-900 border-slate-800 text-slate-500'
                }`}
                title="Toggle Hitbox / Trajectory wireframes"
              >
                BOXES
              </button>

              <button
                onClick={() => {
                  AudioSys.play('click');
                  setDebugConfig((prev) => ({ ...prev, showGridCoords: !prev.showGridCoords }));
                }}
                className={`px-1.5 py-1 text-[8px] sm:text-[9px] font-pixel border cursor-pointer shrink-0 ${
                  debugConfig.showGridCoords
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                    : 'bg-slate-900 border-slate-800 text-slate-500'
                }`}
                title="Toggle Subterranean Grid Coordinates overlay"
              >
                GRID
              </button>

              <button
                onClick={() => {
                  AudioSys.play('click');
                  setDebugConfig((prev) => ({ ...prev, showInspector: !prev.showInspector }));
                }}
                className={`px-1.5 py-1 text-[8px] sm:text-[9px] font-pixel border cursor-pointer shrink-0 ${
                  debugConfig.showInspector
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-slate-900 border-slate-800 text-slate-500'
                }`}
                title="Toggle Entity & Slot Inspector"
              >
                INSP
              </button>

              {/* Restart */}
              <button
                onClick={() => startDuel(selectedMinits.slice(0, 2))}
                className="flex items-center gap-1 px-1.5 py-1 text-[9px] font-pixel bg-slate-900 border border-slate-700 text-slate-300 hover:border-cyan-400 cursor-pointer shrink-0"
                title="Restart Debug Match"
              >
                <RotateCcw className="w-3 h-3" /> RST
              </button>

              {/* Exit */}
              <button
                onClick={() => {
                  AudioSys.play('click');
                  setScreen('EDITOR');
                }}
                className="px-2 py-1 text-[9px] font-pixel bg-slate-900 border border-slate-700 text-rose-300 hover:border-rose-400 cursor-pointer shrink-0"
              >
                EXIT
              </button>
            </div>
          )}

          <div
            style={{
              paddingLeft: activeLayout.PADDING_X,
              paddingRight: activeLayout.PADDING_X,
              paddingTop: activeLayout.PADDING_Y,
              paddingBottom: activeLayout.PADDING_Y
            }}
            className="relative z-20 flex flex-col items-center justify-between w-full h-full pointer-events-none"
          >
            {/* Top Duel Timer & Phase Display (Tweakable via CFG.LAYOUT.*.TIMER_HUD) */}
            <div
              style={{
                transform: `translateY(${hudCfg.OFFSET_Y}px)`
              }}
              className="w-full max-w-5xl mx-auto flex flex-col items-center justify-center shrink-0"
            >
              <div
                style={{ fontSize: hudCfg.TITLE_FONT_SIZE }}
                className="font-pixel tracking-widest text-slate-400 mb-1"
              >
                {duelPhase === 'OVERTIME'
                  ? `FINAL STRIKE · ${overtimeRemaining} BLOCKS LEFT`
                  : duelPhase === 'SLOWMO' || duelPhase === 'FINISHED'
                  ? 'EXCAVATION COMPLETE'
                  : 'MINING DUELS!'}
              </div>
              <div
                style={{
                  fontSize: hudCfg.TIMER_FONT_SIZE,
                  textShadow: '0 2px 0 #000'
                }}
                className={`font-pixel tracking-wider ${
                  duelPhase === 'OVERTIME' || timeLeft <= 5
                    ? 'text-rose-500'
                    : 'text-cyan-400'
                }`}
              >
                {duelPhase === 'OVERTIME'
                  ? 'OVERTIME!'
                  : duelPhase === 'SLOWMO' || duelPhase === 'FINISHED'
                  ? 'FINISHED!'
                  : `${Math.ceil(timeLeft).toString().padStart(2, '0')}s`}
              </div>
            </div>

            {/* Dual Arena Viewport Frames — Always Side-by-Side, Configured via CFG.LAYOUT */}
            <div
              style={{
                gap: activeLayout.ARENA_GAP,
                transform: `translate(${activeLayout.OFFSET_X}px, ${activeLayout.OFFSET_Y}px)`
              }}
              className="flex-1 flex flex-row items-start justify-center w-full my-auto"
            >
              {[0, 1].map((idx) => {
                const tel = telemetry[idx];
                const mId = selectedMinits[idx];
                const m = MINIT_DB[mId];
                const colorHex = m ? numToHex(m.color) : PALETTE.NEON;

                return (
                  <div key={idx} className="flex flex-col items-center shrink-0">
                    {/* Top Mini Telemetry Header (Tweakable via CFG.LAYOUT.*.TELEMETRY_BAR) */}
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
                              style={{ width: telCfg.ICON_SIZE, height: telCfg.ICON_SIZE }}
                              className="text-cyan-400 shrink-0"
                            />
                            <span>
                              {isCompactArena ? `${tel?.depth ?? 0}m` : `Depth:${tel?.depth ?? 0}`}
                            </span>
                          </span>
                          <span className="text-slate-600">·</span>
                          <span className="flex items-center gap-1">
                            <Pickaxe
                              style={{ width: telCfg.ICON_SIZE, height: telCfg.ICON_SIZE }}
                              className="text-amber-400 shrink-0"
                            />
                            <span>
                              {isCompactArena ? `${tel?.mined ?? 0}` : `Mined:${tel?.mined ?? 0}`}
                            </span>
                          </span>
                        </div>
                        <span className="font-semibold text-white shrink-0">
                          {isCompactArena ? `${tel?.score ?? 0}` : `PTS: ${tel?.score ?? 0}`}
                        </span>
                      </div>
                    )}

                    {/* Exact-Sized Pixel Anchor for PixiJS Arena */}
                    <div
                      ref={idx === 0 ? p1AnchorRef : p2AnchorRef}
                      style={{ width: arenaW, height: arenaH }}
                      className="relative border border-slate-600/80 shadow-[0_0_24px_rgba(0,0,0,0.85)]"
                    />

                    {/* Bottom Minit Card (Tweakable via CFG.LAYOUT.*.MINIT_CARD) */}
                    {m && cardCfg.SHOW && (
                      <div
                        style={{
                          width: cardWidth,
                          marginTop: cardCfg.MARGIN_TOP,
                          padding: cardCfg.PADDING,
                          transform: `translate(${cardCfg.OFFSET_X}px, ${cardCfg.OFFSET_Y}px)`
                        }}
                        className="bg-[#0a0c12]/95 border border-slate-800 pointer-events-auto"
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
                                referrerPolicy="no-referrer"
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

                              {/* Active Effects Readout */}
                              {tel && tel.effects.length > 0 && (
                                <div className="flex items-center gap-1 text-[9px] sm:text-[10px] font-mono-tabular shrink-0">
                                  {tel.effects.map((eff) => (
                                    <span
                                      key={eff.id}
                                      style={{ color: eff.colorHex }}
                                      className="font-semibold"
                                    >
                                      {eff.label}
                                      {eff.stacks > 1 ? `×${eff.stacks}` : ''}
                                    </span>
                                  ))}
                                </div>
                              )}
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

                    {/* Live Debug Entity & Slot Inspector — Docked to match arena width & layout 1:1 */}
                    {debugConfig.enabled && debugConfig.showInspector && tel?.debug && (
                      <div
                        style={{
                          width: arenaW,
                          marginTop: 6
                        }}
                        className="bg-[#090d16]/95 border border-emerald-500/70 p-2 shadow-xl pointer-events-auto text-[9px] font-mono-tabular text-slate-300 space-y-1.5"
                      >
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                          <span
                            className="font-pixel text-[8px] flex items-center gap-1"
                            style={{ color: colorHex }}
                          >
                            <Bug className="w-2.5 h-2.5" />
                            P{idx + 1} DEBUG · {m?.name}
                          </span>
                          <span className="text-[8px] text-slate-400">
                            TICK {tel.debug.simTicks}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-slate-300">
                          <span>
                            GRID: ({tel.debug.gridX}, {tel.debug.gridY})
                          </span>
                          <span>
                            CD: {tel.debug.cdTick}/{tel.debug.cdMax}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-slate-400">
                          <span>
                            SPD: {tel.debug.speedMul}x · DMG: {tel.debug.dmgMul}x
                          </span>
                          <span className="text-amber-300 font-semibold">
                            ENTS: {tel.debug.activeEntCount}
                          </span>
                        </div>

                        {Object.keys(tel.debug.customState).length > 0 && (
                          <div className="text-[8px] text-cyan-300/90 truncate bg-slate-950/80 px-1 py-0.5 border border-slate-800/80">
                            STATE: {JSON.stringify(tel.debug.customState)}
                          </div>
                        )}

                        {tel.debug.entities.length > 0 && (
                          <div className="max-h-24 overflow-y-auto bg-[#05070c] border border-slate-800/90 p-1 space-y-0.5">
                            {tel.debug.entities.slice(0, 8).map((ent) => (
                              <div
                                key={ent.entId}
                                className="flex items-center justify-between gap-1 text-[8px]"
                              >
                                <span className="text-amber-300 truncate">
                                  #{ent.entId} ({ent.x},{ent.y}) L:{ent.life}
                                </span>
                                <span className="text-slate-400 truncate">
                                  [{ent.traits.slice(0, 2).join(', ')}]
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL 1: VICTORY OVERLAY
      ═══════════════════════════════════════════════════════════════════ */}
      {screen === 'SIMULATION' && duelPhase === 'FINISHED' && winnerInfo && (
        <div
          onClick={() => {
            AudioSys.play('click');
            setScreen('EDITOR');
          }}
          className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/75 px-4 cursor-pointer"
        >
          <div className="flex flex-col items-center text-center">
            {MinitPreviewDataUrls[winnerInfo.tel.id] ? (
              <img
                src={MinitPreviewDataUrls[winnerInfo.tel.id]}
                alt={winnerInfo.tel.name}
                className="w-20 h-20 sm:w-24 sm:h-24 object-contain pixelated-canvas mb-4 drop-shadow-[0_6px_0_rgba(0,0,0,0.9)]"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Trophy className="w-16 h-16 text-amber-400 mb-4 drop-shadow-[0_4px_0_rgba(0,0,0,0.9)]" />
            )}

            <h2
              className="font-pixel text-2xl sm:text-4xl tracking-wider mb-5"
              style={{
                color: winnerInfo.tel.colorHex,
                textShadow: '0 4px 0 #000, 0 0 24px rgba(0,0,0,0.9)'
              }}
            >
              {winnerInfo.isTie ? 'DRAW MATCH!' : `${winnerInfo.tel.name} WINS!`}
            </h2>

            <div
              className="flex items-center justify-center gap-6 sm:gap-8 font-mono-tabular text-sm sm:text-base text-slate-100"
              style={{ textShadow: '0 2px 0 #000' }}
            >
              <div className="flex flex-col items-center">
                <span className="font-pixel text-[9px] sm:text-[10px] text-slate-400 mb-1">
                  SCORE
                </span>
                <span className="font-pixel text-sm sm:text-lg text-white">
                  {winnerInfo.tel.score}
                </span>
              </div>

              <div className="flex flex-col items-center">
                <span className="font-pixel text-[9px] sm:text-[10px] text-slate-400 mb-1">
                  DEPTH
                </span>
                <span className="font-pixel text-sm sm:text-lg text-cyan-400">
                  {winnerInfo.tel.depth}m
                </span>
              </div>

              <div className="flex flex-col items-center">
                <span className="font-pixel text-[9px] sm:text-[10px] text-slate-400 mb-1">
                  MINED
                </span>
                <span className="font-pixel text-sm sm:text-lg text-amber-400">
                  {winnerInfo.tel.mined}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL 2: DEV LAB (EXTERNAL .TS MINIT IMPORTER, HEADLESS BALANCE, DEBUGGER)
      ═══════════════════════════════════════════════════════════════════ */}
      {devLabOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-2 sm:p-5">
          <div className="w-full max-w-5xl h-[92dvh] bg-[#080b12] border-2 border-cyan-400 flex flex-col shadow-2xl overflow-hidden">
            {/* Dev Lab Header & Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-[#0c101b] border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <span className="font-pixel text-xs sm:text-sm text-white tracking-wider">
                  DEV LAB · MODDING, BALANCE & DEBUG
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    AudioSys.play('click');
                    setDevLabTab('MINITS');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 font-pixel text-[9px] sm:text-[10px] border cursor-pointer ${
                    devLabTab === 'MINITS'
                      ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <FileCode2 className="w-3.5 h-3.5" />
                  <span>CUSTOM MINITS (.TS)</span>
                </button>

                <button
                  onClick={() => {
                    AudioSys.play('click');
                    setDevLabTab('BALANCE');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 font-pixel text-[9px] sm:text-[10px] border cursor-pointer ${
                    devLabTab === 'BALANCE'
                      ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>BALANCE CHECK</span>
                </button>

                <button
                  onClick={() => {
                    AudioSys.play('click');
                    setDevLabTab('DEBUG');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 font-pixel text-[9px] sm:text-[10px] border cursor-pointer ${
                    devLabTab === 'DEBUG'
                      ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <Bug className="w-3.5 h-3.5" />
                  <span>DEBUGGER</span>
                  {debugConfig.enabled && (
                    <span className="w-2 h-2 bg-emerald-400 inline-block" />
                  )}
                </button>

                <button
                  onClick={() => {
                    AudioSys.play('click');
                    setDevLabOpen(false);
                  }}
                  className="ml-2 p-1.5 bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-rose-400 cursor-pointer"
                  title="Close Dev Lab"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Dev Lab Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {/* ─────────────────────────────────────────────────────────────
                  TAB 1: CUSTOM .TS MINIT IMPORTER & EDITOR
              ───────────────────────────────────────────────────────────── */}
              {devLabTab === 'MINITS' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
                  {/* Left Column: Import Controls & Installed Custom Minits */}
                  <div className="lg:col-span-5 flex flex-col gap-3">
                    <div className="bg-[#0d121f] border border-slate-800 p-3.5 space-y-3">
                      <div className="font-pixel text-[11px] text-cyan-400">
                        IMPORT EXTERNAL &lt;MINIT&gt;.TS FILE
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Upload any self-contained <code className="text-cyan-300">&lt;minit&gt;.ts</code> file
                        using the same <code className="text-cyan-300">MinitDef</code>,{' '}
                        <code className="text-cyan-300">Blueprint</code>,{' '}
                        <code className="text-cyan-300">Trait</code>, and{' '}
                        <code className="text-cyan-300">Archetype</code> API as built-in Minits.
                        All imported Minits are saved in <code className="text-amber-300">localStorage</code>.
                      </p>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-2 px-3.5 py-2 bg-cyan-400 text-slate-950 font-pixel text-[10px] hover:bg-cyan-300 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>IMPORT .TS FILE</span>
                        </button>

                        <button
                          onClick={() => {
                            AudioSys.play('click');
                            MinitModService.downloadTemplateTsFile();
                          }}
                          className="flex items-center gap-2 px-3 py-2 bg-slate-900 border border-slate-700 text-slate-200 font-pixel text-[10px] hover:border-cyan-400 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5 text-cyan-400" />
                          <span>DOWNLOAD VORTEX.TS TEMPLATE</span>
                        </button>

                        <button
                          onClick={() => {
                            AudioSys.play('click');
                            setTsFileName('vortex.ts');
                            setTsEditorCode(generateStarterTemplateTs('vortex'));
                          }}
                          className="flex items-center gap-2 px-3 py-2 bg-cyan-950/60 border border-cyan-600/80 text-cyan-200 font-pixel text-[10px] hover:border-cyan-400 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                          <span>LOAD VORTEX (PNG) IN EDITOR</span>
                        </button>
                      </div>

                      {modStatus && (
                        <div
                          className={`flex items-start gap-2 p-2.5 border text-xs ${
                            modStatus.type === 'success'
                              ? 'bg-emerald-950/60 border-emerald-500/70 text-emerald-200'
                              : 'bg-rose-950/60 border-rose-500/70 text-rose-200'
                          }`}
                        >
                          {modStatus.type === 'success' ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          )}
                          <span className="leading-snug">{modStatus.msg}</span>
                        </div>
                      )}
                    </div>

                    {/* Stored Custom Minits in localStorage */}
                    <div className="bg-[#0d121f] border border-slate-800 p-3.5 flex-1 flex flex-col">
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="font-pixel text-[11px] text-amber-400">
                          LOCALSTORAGE MINITS ({customRecords.length})
                        </span>
                      </div>

                      {customRecords.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center py-6 text-xs text-slate-500">
                          No external .ts Minits stored yet. Import a .ts file or click
                          &ldquo;COMPILE &amp; SAVE .TS&rdquo; in the code editor.
                        </div>
                      ) : (
                        <div className="space-y-2 overflow-y-auto max-h-64 pr-1">
                          {customRecords.map((rec) => {
                            const def = MINIT_DB[rec.id];
                            const preview = MinitPreviewDataUrls[rec.id];
                            const colorHex = def ? numToHex(def.color) : '#00ffcc';
                            return (
                              <div
                                key={rec.id}
                                className="flex items-center justify-between gap-2 p-2.5 bg-[#070a11] border border-slate-800"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-8 h-8 bg-black border border-slate-800 flex items-center justify-center shrink-0">
                                    {preview && (
                                      <img
                                        src={preview}
                                        alt={rec.name}
                                        className="w-6 h-6 object-contain pixelated-canvas"
                                      />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <div
                                      className="font-pixel text-[10px] truncate"
                                      style={{ color: colorHex }}
                                    >
                                      {rec.name}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-mono-tabular truncate">
                                      {rec.fileName}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    onClick={() => {
                                      AudioSys.play('click');
                                      setTsFileName(rec.fileName);
                                      setTsEditorCode(rec.sourceCode);
                                    }}
                                    className="px-2 py-1 text-[9px] font-pixel bg-slate-900 border border-slate-700 text-slate-200 hover:border-cyan-400 cursor-pointer"
                                  >
                                    EDIT
                                  </button>
                                  <button
                                    onClick={() => {
                                      AudioSys.play('click');
                                      MinitModService.exportMinitTsFile(rec.id);
                                    }}
                                    className="px-2 py-1 text-[9px] font-pixel bg-slate-900 border border-slate-700 text-cyan-300 hover:border-cyan-400 cursor-pointer"
                                    title="Export .ts file"
                                  >
                                    .TS
                                  </button>
                                  <button
                                    onClick={() => handleDeleteCustomMinit(rec.id)}
                                    className="px-2 py-1 text-[9px] font-pixel bg-rose-950/70 border border-rose-700 text-rose-300 hover:border-rose-400 cursor-pointer"
                                    title="Delete from localStorage"
                                  >
                                    DEL
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Live .ts Minit Authoring & Compiler */}
                  <div className="lg:col-span-7 bg-[#0d121f] border border-slate-800 p-3.5 flex flex-col gap-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-pixel text-[11px] text-cyan-400">
                          .TS MINIT SOURCE COMPILER
                        </span>
                        <input
                          type="text"
                          value={tsFileName}
                          onChange={(e) => setTsFileName(e.target.value)}
                          className="px-2 py-1 text-xs font-mono-tabular bg-[#06080e] border border-slate-700 text-slate-200 w-36"
                          placeholder="vortex.ts"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleCompileEditorTs}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-400 text-slate-950 font-pixel text-[10px] hover:bg-emerald-300 cursor-pointer"
                        >
                          <Zap className="w-3.5 h-3.5 fill-slate-950" />
                          <span>COMPILE &amp; SAVE .TS</span>
                        </button>
                      </div>
                    </div>

                    <textarea
                      value={tsEditorCode}
                      onChange={(e) => setTsEditorCode(e.target.value)}
                      spellCheck={false}
                      className="flex-1 min-h-[300px] w-full p-3 bg-[#05070c] border border-slate-800 text-xs font-mono-tabular text-cyan-100 leading-relaxed focus:outline-none focus:border-cyan-400 resize-none"
                    />
                  </div>
                </div>
              )}

              {/* ─────────────────────────────────────────────────────────────
                  TAB 2: HEADLESS BALANCING CHECK SYSTEM & STATISTICAL REPORT
              ───────────────────────────────────────────────────────────── */}
              {devLabTab === 'BALANCE' && (
                <div className="space-y-4">
                  {/* Simulation Controls Bar */}
                  <div className="bg-[#0d121f] border border-slate-800 p-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setBalanceMode('ROUND_ROBIN')}
                          className={`px-3 py-1.5 font-pixel text-[9px] border cursor-pointer ${
                            balanceMode === 'ROUND_ROBIN'
                              ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                              : 'bg-slate-900 text-slate-300 border-slate-700'
                          }`}
                        >
                          FULL ROUND-ROBIN MATRIX ({MINIT_LIST.length} MINITS)
                        </button>
                        <button
                          onClick={() => setBalanceMode('ONE_VS_ONE')}
                          className={`px-3 py-1.5 font-pixel text-[9px] border cursor-pointer ${
                            balanceMode === 'ONE_VS_ONE'
                              ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                              : 'bg-slate-900 text-slate-300 border-slate-700'
                          }`}
                        >
                          CUSTOM 1V1 RUN
                        </button>
                      </div>

                      {balanceMode === 'ONE_VS_ONE' && (
                        <div className="flex items-center gap-2">
                          <select
                            value={balanceP1}
                            onChange={(e) => setBalanceP1(e.target.value)}
                            className="px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 text-white"
                          >
                            {MINIT_LIST.map((m) => (
                              <option key={m.id} value={m.id}>
                                P1: {m.name}
                              </option>
                            ))}
                          </select>
                          <span className="font-pixel text-[10px] text-rose-400">VS</span>
                          <select
                            value={balanceP2}
                            onChange={(e) => setBalanceP2(e.target.value)}
                            className="px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 text-white"
                          >
                            {MINIT_LIST.map((m) => (
                              <option key={m.id} value={m.id}>
                                P2: {m.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="flex items-center gap-1.5">
                        <span className="font-pixel text-[9px] text-slate-400">
                          MATCHES/PAIR:
                        </span>
                        {[3, 5, 10, 20].map((cnt) => (
                          <button
                            key={cnt}
                            onClick={() => setMatchesPerPair(cnt)}
                            className={`px-2 py-1 font-pixel text-[9px] border cursor-pointer ${
                              matchesPerPair === cnt
                                ? 'bg-amber-400 text-slate-950 border-amber-300'
                                : 'bg-slate-900 text-slate-300 border-slate-800'
                            }`}
                          >
                            {cnt}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      disabled={balanceRunning}
                      onClick={handleRunBalanceSim}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-400 text-slate-950 font-pixel text-[10px] hover:bg-emerald-300 disabled:opacity-50 cursor-pointer"
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>
                        {balanceRunning ? 'SIMULATING...' : 'RUN HEADLESS CHECK'}
                      </span>
                    </button>
                  </div>

                  {!balanceReport ? (
                    <div className="bg-[#0d121f] border border-slate-800 p-10 text-center space-y-2">
                      <div className="font-pixel text-xs text-cyan-400">
                        HEADLESS DETERMINISTIC ARENA ENGINE READY
                      </div>
                      <p className="text-xs text-slate-400 max-w-lg mx-auto">
                        Click &ldquo;RUN HEADLESS CHECK&rdquo; to simulate full 20-second +
                        Overtime duels at ~3,000 matches/sec without WebGL rendering overhead.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Summary Telemetry Banner */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="bg-[#0d121f] border border-slate-800 p-3">
                          <div className="font-pixel text-[9px] text-slate-400">
                            TOTAL DUELS SIMULATED
                          </div>
                          <div className="font-pixel text-sm sm:text-base text-white mt-1">
                            {balanceReport.totalMatches} MATCHES
                          </div>
                        </div>
                        <div className="bg-[#0d121f] border border-slate-800 p-3">
                          <div className="font-pixel text-[9px] text-slate-400">
                            EXECUTION TIME
                          </div>
                          <div className="font-pixel text-sm sm:text-base text-cyan-400 mt-1">
                            {balanceReport.elapsedMs} ms
                          </div>
                        </div>
                        <div className="bg-[#0d121f] border border-slate-800 p-3">
                          <div className="font-pixel text-[9px] text-slate-400">
                            TOP CONTENDER
                          </div>
                          <div
                            className="font-pixel text-sm sm:text-base mt-1 truncate"
                            style={{
                              color:
                                balanceReport.leaderboard[0]?.colorHex || '#00ffcc'
                            }}
                          >
                            {balanceReport.leaderboard[0]?.name} (
                            {balanceReport.leaderboard[0]?.winRate}%)
                          </div>
                        </div>
                        <div className="bg-[#0d121f] border border-slate-800 p-3">
                          <div className="font-pixel text-[9px] text-slate-400">
                            SPREAD (MAX - MIN WIN%)
                          </div>
                          <div className="font-pixel text-sm sm:text-base text-amber-400 mt-1">
                            {Math.round(
                              (balanceReport.leaderboard[0]?.winRate ?? 0) -
                                (balanceReport.leaderboard[
                                  balanceReport.leaderboard.length - 1
                                ]?.winRate ?? 0)
                            )}
                            %
                          </div>
                        </div>
                      </div>

                      {/* Win-Rate & Excavation Leaderboard Table */}
                      <div className="bg-[#0d121f] border border-slate-800 overflow-x-auto">
                        <div className="px-3.5 py-2.5 border-b border-slate-800 font-pixel text-[10px] text-cyan-400">
                          BALANCE LEADERBOARD &amp; TIER REPORT
                        </div>
                        <table className="w-full text-left border-collapse text-xs font-mono-tabular">
                          <thead>
                            <tr className="border-b border-slate-800 text-[9px] font-pixel text-slate-400 bg-[#080b12]">
                              <th className="py-2 px-3">#</th>
                              <th className="py-2 px-3">MINIT</th>
                              <th className="py-2 px-3">TIER</th>
                              <th className="py-2 px-3">WIN RATE</th>
                              <th className="py-2 px-3">W - L - T</th>
                              <th className="py-2 px-3">AVG PTS</th>
                              <th className="py-2 px-3">MIN / MAX PTS</th>
                              <th className="py-2 px-3">AVG DEPTH</th>
                              <th className="py-2 px-3">AVG MINED</th>
                            </tr>
                          </thead>
                          <tbody>
                            {balanceReport.leaderboard.map((row, idx) => {
                              const tierColors: Record<string, string> = {
                                OP: 'bg-rose-500/20 border-rose-400 text-rose-300',
                                STRONG:
                                  'bg-amber-500/20 border-amber-400 text-amber-300',
                                BALANCED:
                                  'bg-emerald-500/20 border-emerald-400 text-emerald-300',
                                WEAK: 'bg-slate-800 border-slate-600 text-slate-400'
                              };
                              return (
                                <tr
                                  key={row.id}
                                  className="border-b border-slate-800/60 hover:bg-slate-900/50"
                                >
                                  <td className="py-2 px-3 text-slate-500">
                                    {idx + 1}
                                  </td>
                                  <td className="py-2 px-3">
                                    <div className="flex items-center gap-2">
                                      {MinitPreviewDataUrls[row.id] && (
                                        <img
                                          src={MinitPreviewDataUrls[row.id]}
                                          alt={row.name}
                                          className="w-5 h-5 object-contain pixelated-canvas"
                                        />
                                      )}
                                      <span
                                        className="font-pixel text-[10px]"
                                        style={{ color: row.colorHex }}
                                      >
                                        {row.name}
                                      </span>
                                      {row.isCustom && (
                                        <span className="px-1 text-[8px] font-pixel bg-amber-500/20 text-amber-300 border border-amber-400/40">
                                          .TS
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2 px-3">
                                    <span
                                      className={`px-1.5 py-0.5 font-pixel text-[8px] border ${
                                        tierColors[row.tier]
                                      }`}
                                    >
                                      {row.tier}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3">
                                    <div className="flex items-center gap-2">
                                      <div className="w-20 h-2 bg-slate-900 border border-slate-800 overflow-hidden">
                                        <div
                                          className="h-full bg-cyan-400"
                                          style={{ width: `${row.winRate}%` }}
                                        />
                                      </div>
                                      <span className="text-white font-semibold">
                                        {row.winRate}%
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 text-slate-300">
                                    {row.wins}W - {row.losses}L - {row.ties}T
                                  </td>
                                  <td className="py-2 px-3 text-white font-semibold">
                                    {row.avgScore}
                                  </td>
                                  <td className="py-2 px-3 text-slate-400">
                                    {row.minScore} / {row.maxScore}
                                  </td>
                                  <td className="py-2 px-3 text-cyan-300">
                                    {row.avgDepth}m
                                  </td>
                                  <td className="py-2 px-3 text-amber-300">
                                    {row.avgMined}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Head-to-Head Matchup Matrix (Click any cell to watch that live duel!) */}
                      {balanceReport.mode === 'ROUND_ROBIN' && (
                        <div className="bg-[#0d121f] border border-slate-800 overflow-x-auto">
                          <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between">
                            <span className="font-pixel text-[10px] text-cyan-400">
                              HEAD-TO-HEAD WIN% MATRIX (ROW VS COLUMN)
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Click any cell to launch that 1v1 duel live
                            </span>
                          </div>
                          <table className="w-full text-center border-collapse text-[10px] font-mono-tabular">
                            <thead>
                              <tr className="border-b border-slate-800 bg-[#080b12]">
                                <th className="p-2 text-left font-pixel text-[8px] text-slate-400">
                                  P1 \ P2
                                </th>
                                {balanceReport.leaderboard.map((col) => (
                                  <th
                                    key={col.id}
                                    className="p-2 font-pixel text-[8px]"
                                    style={{ color: col.colorHex }}
                                  >
                                    {col.name.slice(0, 5)}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {balanceReport.leaderboard.map((row) => (
                                <tr
                                  key={row.id}
                                  className="border-b border-slate-800/50"
                                >
                                  <td
                                    className="p-2 text-left font-pixel text-[9px] bg-[#080b12]"
                                    style={{ color: row.colorHex }}
                                  >
                                    {row.name}
                                  </td>
                                  {balanceReport.leaderboard.map((col) => {
                                    if (row.id === col.id) {
                                      return (
                                        <td
                                          key={col.id}
                                          className="p-2 text-slate-600 bg-slate-950/60"
                                        >
                                          —
                                        </td>
                                      );
                                    }
                                    const cell =
                                      balanceReport.matrix[row.id]?.[col.id];
                                    const wr = cell ? cell.winRate : 0;
                                    const cellColor =
                                      wr >= 60
                                        ? 'text-emerald-300 bg-emerald-950/30'
                                        : wr <= 40
                                        ? 'text-rose-300 bg-rose-950/30'
                                        : 'text-slate-200';
                                    return (
                                      <td
                                        key={col.id}
                                        onClick={() => {
                                          setSelectedMinits([row.id, col.id]);
                                          setDevLabOpen(false);
                                          startDuel([row.id, col.id]);
                                        }}
                                        className={`p-2 border border-slate-800/40 hover:border-cyan-400 cursor-pointer ${cellColor}`}
                                        title={`${row.name} vs ${col.name}: ${wr}% Win Rate (${cell?.wins}W-${cell?.losses}L-${cell?.ties}T). Click to watch live!`}
                                      >
                                        {wr}%
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ─────────────────────────────────────────────────────────────
                  TAB 3: LIVE ARENA DEBUGGER & FRAME-STEP INSPECTOR
              ───────────────────────────────────────────────────────────── */}
              {devLabTab === 'DEBUG' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-[#0d121f] border border-slate-800 p-4 space-y-4">
                    <div className="font-pixel text-xs text-cyan-400">
                      LIVE ARENA DEBUGGER CONTROLS
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Enable Debug Mode to overlay real-time entity hitboxes, projectile
                      trajectories, beam columns, AoE blast footprints, and step-by-step
                      frame transport controls inside the Arena.
                    </p>

                    <div className="space-y-3 pt-2">
                      {[
                        {
                          key: 'enabled' as const,
                          label: 'ENABLE LIVE DEBUG MODE',
                          desc: 'Activates debug HUD, frame stepping, and overlays in duels'
                        },
                        {
                          key: 'showHitboxes' as const,
                          label: 'HITBOXES, TRAJECTORIES & AOE OUTLINES',
                          desc: 'Draws world-space wireframes for slots, projectiles, beams & AoE'
                        },
                        {
                          key: 'showGridCoords' as const,
                          label: 'SUBTERRANEAN GRID LINES',
                          desc: 'Renders 16x16px logical excavation grid cells'
                        },
                        {
                          key: 'showInspector' as const,
                          label: 'LIVE ENTITY & STATE INSPECTOR',
                          desc: 'Displays active Entity[] pool, Trait stack & Minit state'
                        }
                      ].map((item) => (
                        <div
                          key={item.key}
                          className="flex items-center justify-between gap-3 p-3 bg-[#070a11] border border-slate-800"
                        >
                          <div>
                            <div className="font-pixel text-[10px] text-white">
                              {item.label}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {item.desc}
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              AudioSys.play('click');
                              setDebugConfig((prev) => ({
                                ...prev,
                                [item.key]: !prev[item.key]
                              }));
                            }}
                            className={`w-20 py-2 font-pixel text-[10px] border cursor-pointer shrink-0 ${
                              debugConfig[item.key]
                                ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300'
                                : 'bg-slate-900 border-slate-700 text-slate-400'
                            }`}
                          >
                            {debugConfig[item.key] ? 'ON' : 'OFF'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-[#0d121f] border border-slate-800 p-4 flex flex-col justify-between space-y-4">
                    <div className="space-y-4">
                      <div className="font-pixel text-xs text-amber-400">
                        SIMULATION SPEED &amp; QUICK LAUNCH
                      </div>

                      <div>
                        <div className="font-pixel text-[10px] text-slate-300 mb-2">
                          DEFAULT SIMULATION TICK SPEED
                        </div>
                        <div className="flex items-center gap-2">
                          {[0.25, 0.5, 1, 2].map((spd) => (
                            <button
                              key={spd}
                              onClick={() => {
                                AudioSys.play('click');
                                setDebugConfig((prev) => ({
                                  ...prev,
                                  speedMultiplier: spd
                                }));
                              }}
                              className={`flex-1 py-2 font-pixel text-[10px] border cursor-pointer ${
                                debugConfig.speedMultiplier === spd
                                  ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                                  : 'bg-slate-900 text-slate-300 border-slate-800'
                              }`}
                            >
                              {spd}x
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="p-3 bg-[#070a11] border border-slate-800 space-y-1.5 text-xs text-slate-300">
                        <div className="font-pixel text-[10px] text-cyan-300">
                          WIREFRAME LEGEND
                        </div>
                        <div>• Cyan Box: Logical Grid Cell &amp; Vertical Beam Column</div>
                        <div>• Magenta Crosshair: Interpolated World Sprite Position</div>
                        <div>• Amber Line &amp; Circle: Projectile Target Trajectory</div>
                        <div>• Red Shaded Box: AoE Blast / Acid Footprint</div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setDebugConfig((prev) => ({ ...prev, enabled: true }));
                        setDevLabOpen(false);
                        startDuel(selectedMinits.slice(0, 2));
                      }}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-400 text-slate-950 font-pixel text-xs hover:bg-emerald-300 cursor-pointer"
                    >
                      <Bug className="w-4 h-4" />
                      <span>LAUNCH DUEL IN DEBUG MODE</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL 3: SETTINGS
      ═══════════════════════════════════════════════════════════════════ */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
          <div className="w-full max-w-md bg-[#0a0c14] border-2 border-cyan-400 p-6 shadow-2xl">
            <h3 className="font-pixel text-base text-cyan-400 text-center mb-6">
              SETTINGS
            </h3>

            <div className="space-y-5 mb-7">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Monitor className="w-4 h-4 text-cyan-400" />
                  <span className="font-pixel text-[10px] text-slate-200">
                    SCANLINES (CRT)
                  </span>
                </div>
                <button
                  onClick={() => updateSetting('shaders', !settings.shaders)}
                  className={`w-24 py-2 font-pixel text-[10px] border transition-colors cursor-pointer ${
                    settings.shaders
                      ? 'bg-emerald-950/80 border-emerald-400 text-emerald-300'
                      : 'bg-rose-950/80 border-rose-500 text-rose-400'
                  }`}
                >
                  {settings.shaders ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  <span className="font-pixel text-[10px] text-slate-200">
                    SFX AUDIO
                  </span>
                </div>
                <button
                  onClick={() => updateSetting('sfx', !settings.sfx)}
                  className={`w-24 py-2 font-pixel text-[10px] border transition-colors cursor-pointer ${
                    settings.sfx
                      ? 'bg-emerald-950/80 border-emerald-400 text-emerald-300'
                      : 'bg-rose-950/80 border-rose-500 text-rose-400'
                  }`}
                >
                  {settings.sfx ? 'ON' : 'OFF'}
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-pixel text-[10px] text-slate-200">
                    SFX VOLUME
                  </span>
                  <span className="font-mono-tabular text-xs text-cyan-400">
                    {Math.round(settings.sfxVol * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.sfxVol}
                  onChange={(e) => updateSetting('sfxVol', parseFloat(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex justify-center">
              <button
                onClick={() => {
                  AudioSys.play('click');
                  setSettingsOpen(false);
                }}
                className="px-8 py-2.5 bg-slate-900 border border-cyan-400 font-pixel text-xs text-white hover:bg-cyan-400/20 transition-colors cursor-pointer"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
