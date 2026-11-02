# Moddable Minit SDK, Headless Balance Simulator & Live Debugger

Expand *Mining Duels!* into an open, moddable platform with a **Developer & Modding Lab** accessible directly from the Editor scene—enabling players to import and export `.ts` Minit files persisted in `localStorage`, run high-speed headless balance simulations across the entire roster, and inspect live combat with hitbox overlays and frame-by-frame stepping.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following product and technical decisions were confirmed during interactive clarification:

- **Confirmed Decision 1 — TypeScript (`.ts`) Minit Import, Export & `localStorage` Persistence**: Players can import `.ts` (and `.js`) Minit files authored with the exact same `MinitDef` structure used by built-in Minits, download a ready-to-edit `.ts` template or export existing custom Minits as `.ts` files, and manage/delete custom Minits stored in `localStorage`.
- **Confirmed Decision 2 — Headless Balancing Check System (Full Round-Robin Matrix + Custom 1v1 Batch Runs)**: A zero-render headless simulation engine runs hundreds of full 20-second + overtime matches in milliseconds, producing a comprehensive report with Win Rate %, Avg Score, Avg Depth, Avg Blocks Mined, Balance Tier ratings (`OP`, `BALANCED`, `UNDERTUNED`), and a head-to-head matchup matrix.
- **Confirmed Decision 3 — Live Debugging Mode (Entity Inspector, Hitbox Outlines & Frame-by-Frame Controls)**: Enabling Debug Mode adds an in-arena WebGL debug wireframe layer (Minit bounds, entity hitboxes, target vectors, AoE/beam radii), interactive frame stepping (`Pause`, `+1 Tick`, `+10 Ticks`, `0.25x–2x` speed), and a live Entity & State Inspector panel.

---

### 1. Overview & Core Concept

- **What It Does**: Adds a **Dev Lab / Mod Manager** button in the Editor header that opens a dedicated multi-tabbed engineering workbench:
  1. **Custom Minits Manager (`.ts` Import / Code Editor / `localStorage`)**: Upload any `<minit>.ts` file (or edit/paste TypeScript code directly), transpile and validate it in-browser against the Minit SDK, dynamically bake its procedural or base64 PNG textures/VFX/audio/effects into the live engine, persist it in `localStorage`, and delete custom Minits at any time.
  2. **Headless Balance Lab**: Execute either a **Full Round-Robin Tournament** (every Minit vs. every Minit for N iterations) or a **Focused 1v1 Matchup Series**, outputting an interactive statistical report table and matchup matrix.
  3. **Live Debug Mode**: Toggle a comprehensive debugging overlay inside the Simulation scene with hitbox/trajectory wireframes, a live Entity & Minit State Inspector, and deterministic single-tick stepping controls.
- **Target Audience / Persona**: Players, modders, and game designers who want to craft custom `.ts` Minits, verify their combat balance against the existing roster, and debug entity behaviors frame-by-frame.
- **Key Value**:
  - **Zero-Rebuild Modding**: Anyone can write a single `<minit>.ts` file using the exact same `MinitDef`, `Blueprint`, `Trait`, `Archetype`, and `pngTexture` APIs as built-in Minits and load it directly into the browser.
  - **Deterministic Headless Architecture**: Decoupling simulation logic from WebGL rendering and audio allows 1,000+ ticks per match to run in under a millisecond for instant balance verification.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Opening the Dev Lab**: In the Editor scene header, clicking the **DEV LAB** button opens a crisp, high-craft modal organized into three tabs: **CUSTOM MINITS**, **BALANCE CHECK**, and **DEBUGGER**.
  2. **Importing & Managing `.ts` Minits**:
     - Players can click **IMPORT `.TS` FILE** (or drag-and-drop a `<minit>.ts` file), or click **DOWNLOAD `.TS` TEMPLATE** to get a documented starter file (`custom_minit.ts`).
     - Upon import, the TypeScript module is transpiled in-memory, validated for required fields (`id`, `name`, `color`, `cd`, `desc`, `textures.base`), baked via `AssetBaker`, saved to `localStorage`, and immediately added to the Editor roster with a `CUSTOM` badge and a quick delete button.
  3. **Running Headless Balance Checks**:
     - Players choose **Full Round-Robin Matrix** or **1v1 Matchup Test**, select iterations per pairing (e.g., `10`, `25`, or `50` matches per pair), and click **RUN SIMULATION**.
     - The results view displays a sortable leaderboard (Win %, W-L-T record, Avg Score, Avg Depth, Avg Mined, Balance Status badge) and a color-coded head-to-head Win Rate Matrix.
  4. **Inspecting a Duel in Debug Mode**:
     - When **Debug Mode** is toggled ON, the Simulation scene displays a compact top/bottom **Debug Transport & Inspector Bar** (`Pause/Resume`, `+1 Tick`, `+10 Ticks`, `0.25x / 0.5x / 1x / 2x`, `Reset`), draws crisp wireframe hitboxes and target vectors over both arenas, and lists active entities and Minit internal state variables in real time.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Tactical cyber-engineering telemetry deck matching the obsidian arcade UI.
  - *Color Palette & Mood*: Deep slate surfaces (`#080a10`), cyan (`#00ccff`) primary accents, emerald (`#10b981`) for balanced/passing metrics, amber (`#f59e0b`) for warnings/high win-rate alerts, and crimson (`#f43f5e`) for overpowered/error states.
  - *Typography & Hierarchy*: Universal **Orbitron** typography across all tables, badges, code diagnostics, and hitbox labels, using `tabular-nums` for all win-rate percentages, frame counters, and coordinates.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: In-Browser TypeScript (`.ts`) Transpilation & Sandboxed Minit SDK Injection**
  - *Chosen Approach*: Build a dedicated TypeScript-to-JS module evaluator (`MinitLoader`) that strips TypeScript type annotations, `interface` declarations, `import` statements, and `export` keywords from uploaded `.ts` files, and executes the module inside a controlled factory scope injected with the full Minit SDK (`PIXI`, `CFG`, `PALETTE`, `FastMath`, `Blueprint`, `EntityBlueprint`, `Trait`, `Archetype`, `Textures`, `pngTexture`, `AudioSys`, `resolveEntityTex`).
  - *Why*: Custom `.ts` files written like `src/data/minits/<minit>.ts` contain relative `import` paths (e.g., `import { MinitDef } from '../../types/game'`) and TypeScript type syntax that browsers cannot execute natively. Stripping imports/types and injecting the live SDK symbols allows any standard `<minit>.ts` file to run out-of-the-box without external bundlers.
  - *Alternatives Considered*: Requiring users to pre-compile `.ts` to `.js` externally (rejected per user requirement that exported/imported files use `.ts`).

- **Decision 2: Pure Headless Mode in `Arena` & `MinitSlot` (`headless: true`)**
  - *Chosen Approach*: Enhance `Arena` and `MinitSlot` with an optional `headless: boolean` flag (or lightweight no-op `HeadlessFXPool` and no-op `AudioSys` mute guard during headless runs) so the exact same `Arena.tickLogic()`, `MinitSlot.tick()`, `EffectManager`, and `TraitFn[]` pipelines execute with zero WebGL draw calls or audio context overhead.
  - *Why*: Guaranteeing 100% simulation parity between visual duels and headless balance checks requires running the exact same `Arena` and `MinitSlot` tick code rather than a separate approximated math model.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

#### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                     EDITOR SCENE — DEV LAB WORKBENCH                       │
│                                                                            │
│  ┌──────────────────────┐ ┌──────────────────────┐ ┌────────────────────┐  │
│  │ Custom Minit Manager │ │ Headless Balance Lab │ │ Live Debug Config  │  │
│  │ • Import <minit>.ts  │ │ • Round-Robin Matrix │ │ • Toggle Debug Mode│  │
│  │ • Download .ts Templ │ │ • Custom 1v1 Runner  │ │ • Hitbox Wireframes│  │
│  │ • Delete / Export .ts│ │ • Win% / Tier Report │ │ • Entity Inspector │  │
│  └──────────┬───────────┘ └──────────┬───────────┘ └─────────┬──────────┘  │
└─────────────┼────────────────────────┼───────────────────────┼─────────────┘
              │                        │                       │
              ▼                        ▼                       ▼
┌─────────────────────────┐ ┌──────────────────────┐ ┌───────────────────────┐
│   MinitModService       │ │ HeadlessSimRunner    │ │ Arena Debug Overlay   │
│ • TS-to-JS Transpiler   │ │ • Headless Arena Pair│ │ • WebGL debugLayer    │
│ • SDK Context Injector  │ │ • 1200+ Tick Loop    │ │   (Hitboxes, Vectors, │
│ • Schema Validator      │ │   + Overtime Strikes │ │    AoE Radii, Coords) │
│ • AssetBaker.bakeSingle │ │ • Aggregated Stats:  │ │ • Frame Step Controls │
│ • localStorage Sync     │ │   Win%, Score, Depth,│ │   (Pause, +1f, +10f,  │
│   ('md_custom_minits')  │ │   Mined, H2H Matrix  │ │    Speed, Inspector)  │
└─────────────────────────┘ └──────────────────────┘ └───────────────────────┘
```

#### Data Model & State

- **`CustomMinitRecord` (`localStorage` key `md_custom_minits_v1`)**:
  - `id: string` — Unique Minit identifier extracted from the `.ts` definition.
  - `fileName: string` — Original `.ts` filename (e.g., `plasma_driller.ts`).
  - `sourceCode: string` — Full TypeScript source code (allowing re-export as `.ts` and re-compilation on page reload).
  - `createdAt: number` — Timestamp when imported.
- **`BalanceReport`**:
  - `mode: 'ROUND_ROBIN' | 'ONE_VS_ONE'`
  - `matchesPerPair: number`
  - `totalMatches: number`
  - `durationMs: number`
  - `entries: Array<{ id, name, colorHex, isCustom, matches, wins, losses, ties, winRate, avgScore, maxScore, avgDepth, avgMined, tier: 'OP' | 'STRONG' | 'BALANCED' | 'WEAK' }>`
  - `matrix: Record<string, Record<string, { wins: number; losses: number; ties: number; matches: number }>>`
- **`DebugConfig`**:
  - `enabled: boolean` — Master toggle for Debug Mode.
  - `showHitboxes: boolean` — Renders Minit & Entity collision/AoE bounds and velocity/target vectors.
  - `showGridCoords: boolean` — Renders depth markers and grid cell highlights around the Minit.
  - `showInspector: boolean` — Displays live Minit state & active Entity trait inspector panel during simulation.

#### Interactive Component & State Mapping

- **TypeScript Minit Importer & Exporter (`MinitModService`)**:
  - **Import `.ts`**: Reads the uploaded `.ts` file, strips TypeScript interfaces/type annotations and module imports, evaluates the `MinitDef` object with the injected SDK (`Blueprint`, `Trait`, `Archetype`, `FastMath`, `CFG`, `pngTexture`, `PIXI`, `AudioSys`), validates all required properties, calls `AssetBaker.bakeMinit(renderer, minitDef)` to generate GPU textures and UI preview URLs, registers its `audio` and `effects`, saves the `.ts` source to `localStorage`, and refreshes the React roster state.
  - **Export `.ts` / Template**: Generates a clean, self-contained `<minit>.ts` file download so players can share or edit their Minit in any IDE.
  - **Delete Custom Minit**: Removes the Minit from `localStorage`, `MINIT_DB`, `MINIT_LIST`, and `MinitPreviewDataUrls`, and updates the Editor selection if needed.
- **Headless Balance Runner (`HeadlessSimRunner`)**:
  - Instantiates two `Arena` instances with `headless = true` (which uses a lightweight no-op `fxPool` and suppresses `AudioSys` sound output while keeping 100% of grid HP, damage, effects, and entity traits intact).
  - Steps the exact `ACTIVE` (1,200 ticks = 20.0s at 60Hz) and `OVERTIME` (until 5 additional blocks are mined or max tick cap) loop synchronously, recording P1 and P2 scores, depths, and blocks mined.
- **Simulation Debug Mode**:
  - Adds a `debugGfx: PIXI.Graphics` layer inside `arena.worldContainer` that draws crisp bounding boxes around the Minit (`slot.log.x, slot.log.y`), active entities (`e.curX, e.curY`), radius circles (`e.p.radius` / `range`), and target lines (`(e.curX, e.curY) -> (e.tx, e.ty)`).
  - Adds a floating Debug Transport & Inspector bar in the Simulation view when `debugConfig.enabled` is true, supporting `Pause/Resume`, `+1 Tick` single-frame advance, `+10 Ticks` advance, speed multipliers (`0.25x`, `0.5x`, `1x`, `2x`), and a live readout of `slot.state` and `arena.activeEnts`.
