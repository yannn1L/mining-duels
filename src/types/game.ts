import * as PIXI from 'pixi.js';

export type GameScreen = 'TITLE_MENU' | 'EDITOR' | 'SIMULATION';

export interface GameSettings {
  shaders: boolean;
  sfx: boolean;
  sfxVol: number;
}

export interface DebugConfig {
  enabled: boolean;
  showHitboxes: boolean;
  showGridCoords: boolean;
  showInspector: boolean;
  paused: boolean;
  speedMultiplier: number;
}

export interface CustomMinitRecord {
  id: string;
  name: string;
  fileName: string;
  sourceCode: string;
  createdAt: number;
}

export interface BalanceMatchResult {
  p1Id: string;
  p2Id: string;
  p1Score: number;
  p2Score: number;
  p1Depth: number;
  p2Depth: number;
  p1Mined: number;
  p2Mined: number;
  winner: 'P1' | 'P2' | 'TIE';
  ticks: number;
}

export type BalanceTier = 'OP' | 'STRONG' | 'BALANCED' | 'WEAK';

export interface BalanceMinitStats {
  id: string;
  name: string;
  colorHex: string;
  isCustom: boolean;
  matches: number;
  wins: number;
  losses: number;
  ties: number;
  winRate: number;
  avgScore: number;
  maxScore: number;
  minScore: number;
  avgDepth: number;
  avgMined: number;
  tier: BalanceTier;
}

export interface BalanceCell {
  wins: number;
  losses: number;
  ties: number;
  totalMatches: number;
  winRate: number;
  avgScoreDiff: number;
}

export interface BalanceReport {
  mode: 'ROUND_ROBIN' | 'ONE_VS_ONE';
  matchesPerPair: number;
  totalMatches: number;
  elapsedMs: number;
  leaderboard: BalanceMinitStats[];
  matrix: Record<string, Record<string, BalanceCell>>;
}

export interface AudioProfile {
  t?: OscillatorType;
  f0: number | (() => number);
  f1?: number | ((startFreq: number) => number);
  f2?: number;
  v: number | (() => number);
  d: number;
  ramp?: 'exp' | 'lin' | 'lin_exp';
  seq?: Array<number | (() => number)>;
  noise?: boolean;
  fType?: BiquadFilterType;
  fQ?: number;
  oF0?: number;
  oF1?: number;
}

export interface EffectDef {
  id: string;
  label: string;
  color: number;
  stackable: boolean;
  maxStacks?: number;
  defaultDur: number;
  onApply?: (slot: IMinitSlot, eff: IEffectInstance) => void;
  onRemove?: (slot: IMinitSlot, eff: IEffectInstance) => void;
  onTick?: (slot: IMinitSlot, eff: IEffectInstance) => void;
}

export interface EffectApplyOpts {
  magnitude?: number;
  duration?: number;
  stacks?: number;
  source?: IMinitSlot | null;
  silent?: boolean;
}

export interface IEffectInstance {
  def: EffectDef;
  id: string;
  magnitude: number;
  duration: number;
  elapsed: number;
  stacks: number;
  source: IMinitSlot | null;
  color: number;
  label: string;
  _uiIcon?: PIXI.Graphics;
  tick(slot: IMinitSlot): void;
  isExpired(): boolean;
}

export interface TraitFn {
  (e: Entity, a: IArena): void;
  _traitName?: string;
  _debugMeta?: Record<string, any>;
}

export interface BehaviorPayload {
  traits: TraitFn[];
  p?: Record<string, any>;
  l?: number;
  maxL?: number;
  f?: number;
  dx?: number;
  dy?: number;
  tx?: number;
  ty?: number;
  x?: number;
  y?: number;
  curX?: number;
  curY?: number;
  startX?: number;
  startY?: number;
  ang?: number;
  sound?: string;
  soundVol?: number;
  owner?: IMinitSlot | null;
  offsetX?: number;
  offsetY?: number;
  spawnChance?: number;
}

export interface IEntityBlueprint {
  build(overrides?: Partial<BehaviorPayload>): BehaviorPayload;
}

export type BlueprintOrPayload = IEntityBlueprint | BehaviorPayload;

export interface Entity {
  entId: number;
  active: boolean;
  dead: boolean;
  x: number;
  y: number;
  curX: number;
  curY: number;
  dx: number;
  dy: number;
  startX: number;
  startY: number;
  tx: number;
  ty: number;
  l: number;
  maxL: number;
  f: number;
  step: number;
  ang: number;
  hitGround: boolean;
  spinning: boolean;
  pinned?: boolean;
  fallTimer: number;
  traits: TraitFn[];
  p: Record<string, any>;
  state: Record<string, any>;
  counter: number;
  owner: IMinitSlot | null;
}

export type TextureDrawer = (g: PIXI.Graphics, color: number) => void;

export interface TextureDataUrlConfig {
  /** Base64 PNG Data URL (e.g. "data:image/png;base64,...") or image path */
  dataUrl?: string;
  src?: string;
  url?: string;
  /** Optional target pixel width when baking into the sprite texture */
  width?: number;
  /** Optional target pixel height when baking into the sprite texture */
  height?: number;
  /** Optional scale multiplier (default 1.0) */
  scale?: number;
  /** Optional tint color (e.g. 0xffffff) applied when baking */
  tint?: number;
  /** Optional transparent border padding in pixels (default 2) to prevent edge bleeding */
  padding?: number;
}

export type TextureSource = TextureDrawer | string | TextureDataUrlConfig;

export interface MinitContext<
  TConfig = Record<string, any>,
  TState = Record<string, any>
> {
  state: TState;
  arena: IArena;
  slot: IMinitSlot;
  spr: PIXI.Sprite;
  config: TConfig;
  tex(name: string): string;
  playSound(id: string, volMult?: number): void;
  spawn(
    blueprint: BlueprintOrPayload,
    overrides?: Partial<BehaviorPayload>
  ): Entity | null;
}

export interface MinitDef<
  TConfig = Record<string, any>,
  TState = Record<string, any>
> {
  id: string;
  name: string;
  color: number;
  roam: number;
  cd: number;
  desc: string;
  role?: string;
  isCustom?: boolean;
  sourceFileName?: string;
  config: TConfig;
  textures: Record<string, TextureSource>;
  vfx?: Record<string, TextureSource>;
  audio?: Record<string, AudioProfile>;
  effects?: Record<string, EffectDef>;
  onInit?: (ctx: MinitContext<TConfig, TState>) => void;
  onTick?: (ctx: MinitContext<TConfig, TState>) => void;
  onTrigger?: (ctx: MinitContext<TConfig, TState>) => void;
}

export interface IMinitSlot {
  id: string;
  md: MinitDef<any, any>;
  arena: IArena;
  slotIndex: number;
  log: { x: number; y: number; t: number };
  worldX: number;
  worldY: number;
  spr: PIXI.Sprite;
  animScale: { x: number; y: number; tX: number; tY: number };
  baseScale: number;
  state: Record<string, any>;
  ctx: MinitContext<any, any>;
  stats: { d: number; maxDp: number };
  modifiers: {
    speedMul: number;
    dmgMul: number;
    blind: boolean;
    shieldCharges: number;
  };
  effects: IEffectInstance[];
  effectsUI: PIXI.Container;
  disabled: boolean;
  active: boolean;
  tex(name: string): string;
  spawn(
    blueprint: BlueprintOrPayload,
    overrides?: Partial<BehaviorPayload>
  ): Entity | null;
  addEffect(id: string, opts?: EffectApplyOpts): IEffectInstance | null;
  removeEffect(id: string): boolean;
  hasEffect(id: string): boolean;
  getEffect(id: string): IEffectInstance | null;
  clearEffects(): void;
  tick(): void;
  updateVisuals(timeScale: number): void;
  destroy(): void;
}

export interface IArena {
  cols: number;
  rows: number;
  ts: number;
  halfTs: number;
  maxDepth: number;
  camY: number;
  logCamY: number;
  shake: number;
  simTicks: number;
  vfxLod: number;
  headless: boolean;
  slots: IMinitSlot[];
  opponentArena: IArena | null;
  view: PIXI.Container;
  worldContainer: PIXI.Container;
  layer: PIXI.Container;
  fxPool: any;
  stats: { d: number; maxDp: number };
  mLog: { x: number; y: number; t: number };
  mSpr: PIXI.Sprite;
  mState: Record<string, any>;
  md: MinitDef<any, any>;
  animScale: { x: number; y: number; tX: number; tY: number };
  clampX(x: number): number;
  clampY(y: number): number;
  getPixelCoords(gx: number, gy: number): { px: number; py: number };
  getHP(x: number, y: number): number;
  triggerFlash(a?: number): void;
  spawnEnt(props: BlueprintOrPayload, overrides?: Partial<BehaviorPayload>): Entity | null;
  dmg(
    x: number,
    y: number,
    amount: number,
    showText?: boolean | number,
    fxColor?: number,
    creditTo?: IMinitSlot | null
  ): boolean;
  dmgAoE(
    cx: number,
    cy: number,
    range: number,
    amt: number,
    color: number,
    creditTo?: IMinitSlot | null
  ): void;
  spawnToast(pX: number, pY: number, text: string, color: number): void;
  getOpponentSlot(selfSlot: IMinitSlot): IMinitSlot | null;
}

export interface DebugEntityInfo {
  entId: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  life: number;
  maxLife: number;
  traits: string[];
}

export interface PlayerTelemetry {
  id: string;
  name: string;
  colorHex: string;
  score: number;
  depth: number;
  mined: number;
  cdPct: number;
  effects: Array<{
    id: string;
    label: string;
    colorHex: string;
    stacks: number;
    pct: number;
  }>;
  debug?: {
    simTicks: number;
    camY: number;
    gridX: number;
    gridY: number;
    worldX: number;
    worldY: number;
    cdTick: number;
    cdMax: number;
    speedMul: number;
    dmgMul: number;
    activeEntCount: number;
    entities: DebugEntityInfo[];
    customState: Record<string, any>;
  };
}
