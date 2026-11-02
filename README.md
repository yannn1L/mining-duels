# MINING DUELS!

**Mining Duels!** is a deterministic 60 FPS arcade excavation combat game built with **TypeScript**, **React 19**, **PixiJS v7**, **Tailwind CSS v4**, and a procedural **Web Audio API** synthesizer. Players select two autonomous mining units (**Minits**) and pit them head-to-head in a 20-second high-depth subterranean showdown followed by a sudden-death Overtime race.

It includes an in-browser **Dev Lab** featuring:
- **External `<minit>.ts` Modding & Compiler**: Author, import, compile, and export self-contained TypeScript Minit files directly in the browser (persisted in `localStorage`).
- **Headless Balancing Check System**: Simulate hundreds of full 1v1 or Round-Robin tournament duels in milliseconds (~3,000 matches/sec) with win-rate leaderboards, balance tiers, and an interactive head-to-head matchup matrix.
- **Live Arena Debugger**: Real-time world-space hitbox/trajectory/AoE wireframes, step-by-step frame transport (`Pause`, `+1T`, `+10T`, `0.25x–2x`), and a live Entity & State Inspector.

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Architecture & Engine Design](#2-architecture--engine-design)
3. [Project Structure](#3-project-structure)
4. [Arena Layout & Responsive Configuration (`config.ts`)](#4-arena-layout--responsive-configuration-configts)
5. [Complete Minit Creation Guide (`<minit>.ts` SDK)](#5-complete-minit-creation-guide-minitts-sdk)
   - [5.1 File Structure & `MinitDef` Schema](#51-file-structure--minitdef-schema)
   - [5.2 Lifecycle Hooks & `MinitContext`](#52-lifecycle-hooks--minitcontext)
   - [5.3 Textures & VFX: Procedural Graphics & Base64 PNG Data URLs](#53-textures--vfx-procedural-graphics--base64-png-data-urls)
   - [5.4 Co-Located Procedural Audio (`AudioProfile`)](#54-co-located-procedural-audio-audioprofile)
   - [5.5 Co-Located Status Effects & Cross-Arena Sabotage (`EffectDef`)](#55-co-located-status-effects--cross-arena-sabotage-effectdef)
   - [5.6 Entity Blueprints, Composable `Trait` Primitives & Custom Traits](#56-entity-blueprints-composable-trait-primitives--custom-traits)
   - [5.7 Prefab `Archetype` Reference](#57-prefab-archetype-reference)
   - [5.8 Full Example: Creating a Custom `<minit>.ts` From Scratch](#58-full-example-creating-a-custom-minitts-from-scratch)
6. [Dev Lab: Importing `.ts` Minits, Balancing & Debugging](#6-dev-lab-importing-ts-minits-balancing--debugging)
7. [Development & Automatic GitHub Pages Deployment](#7-development--automatic-github-pages-deployment)

---

## 1. Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **UI & State Shell** | **React 19 + TypeScript** | Menus, Roster Editor, Dev Lab Modal, Telemetry HUD, and Inspector |
| **2D WebGL Renderer** | **PixiJS v7 (`pixi.js`)** | Hardware-accelerated, nearest-neighbor pixel-locked dual arenas |
| **Styling & Typography** | **Tailwind CSS v4 + `Orbitron`** | Unified crisp geometric arcade typography across DOM and WebGL |
| **Audio Engine** | **Web Audio API (`AudioSystem`)** | Zero-asset procedural synthesizer with oscillators, noise & dynamics compressor |
| **Build & Bundler** | **Vite 8** | Fast dev server and relative-path static bundle (`base: './'`) for GitHub Pages |

---

## 2. Architecture & Engine Design

### Deterministic 60Hz Simulation Loop
- Each `Arena` runs an independent, deterministic 60 ticks/second simulation (`tickLogic()`) decoupled from the display refresh rate.
- Regulation lasts `CFG.SIM.DUR` (20 seconds = 1,200 ticks), followed by **Overtime**, where both Minits race to shatter a combined `CFG.SIM.OVERTIME_HITS` (15) additional blocks.
- Final score is calculated as:
  $$\text{Score} = \lfloor \text{Blocks Mined} \times \text{CFG.SIM.MULT} \rfloor + \text{Max Depth}$$

### Unified World-Space Scrolling & Zero-Bleed Pixel Art
- Every visual object inside an Arena (`sprLayer`, `minitLayer`, `fxLayer`, `toastLayer`, `debugLayer`) lives inside a single `worldContainer` that scrolls smoothly as the Minit excavates deeper.
- `AssetBaker` bakes all procedural `PIXI.Graphics` and Base64 PNG Data URLs at boot (and on-the-fly when importing custom `.ts` Minits) using `PIXI.SCALE_MODES.NEAREST`, `MSAA_QUALITY.NONE`, and a 2px transparent border region so rotating/scaling sprites never bleed edge texels.
- All pooled rock blocks (`vpBlocks`), entities (`ents` + `SparseSet`), and particles (`VFXPool`) are pre-allocated to eliminate garbage collection spikes during combat.

---

## 3. Project Structure

```text
├── .github/workflows/
│   └── deploy.yml                # Automatic GitHub Pages CI/CD workflow
├── src/
│   ├── data/
│   │   ├── config.ts             # Global grid, physics, audio & Portrait/Landscape layout config
│   │   ├── effects.ts            # Global status effect registry & built-in effects (slow, poison, blind)
│   │   ├── sfx.ts                # Core Web Audio API procedural sound profiles
│   │   └── minits/               # Self-contained single-file Minit modules
│   │       ├── index.ts          # Minit registry (MINIT_LIST, MINIT_DB, registerMinit, unregisterMinit)
│   │       ├── absorb.ts         # ABSORB (Scaling Vortex)
│   │       ├── alchemist.ts      # ALCHEMIST (Chaotic Brewmaster)
│   │       ├── bomber.ts         # BOMBER (Heavy Demolisher)
│   │       ├── frenzy.ts         # FRENZY (Berserker Predator)
│   │       ├── laser.ts          # LASER (Precision Striker)
│   │       ├── lithos.ts         # LITHOS (Crystal Collector)
│   │       ├── moth.ts           # MOTH (Late-Game Nuker)
│   │       ├── sentinel.ts       # SENTINEL (Orbital Commander)
│   │       ├── symbiote.ts       # SYMBIOTE (Bio-Infester)
│   │       └── turret.ts         # TURRET (Sentry Engineer)
│   ├── engine/
│   │   ├── arena.ts              # Core Arena simulation, viewport block pool, damage & debug renderer
│   │   ├── assetBaker.ts         # Nearest-neighbor texture & Base64 PNG baker
│   │   ├── audio.ts              # Web Audio API synthesizer & SettingsService
│   │   ├── blueprint.ts          # EntityBlueprint builder, Trait library & Archetype prefabs
│   │   ├── fastMath.ts           # Deterministic PRNG (FastMath) & O(1) SparseSet
│   │   ├── headlessSim.ts        # Zero-render Headless Balance Check simulator
│   │   ├── minitModService.ts    # In-browser .ts transpiler, sandbox evaluator & localStorage manager
│   │   ├── minitSlot.ts          # Minit AI movement, cooldown, status effects & MinitContext
│   │   ├── textures.ts           # Baked PIXI.Texture dictionary & pngTexture() helper
│   │   └── vfxPool.ts            # Pre-allocated particle, shockwave, laser & popup digit pool
│   ├── types/
│   │   └── game.ts               # Complete TypeScript interfaces for Minits, Traits, Arenas & Telemetry
│   ├── App.tsx                   # Main application, Simulation HUD & Dev Lab Modal
│   ├── index.css                 # Orbitron font & pixel-art canvas styles
│   └── main.tsx                  # React root entry point
├── index.html
├── package.json
└── vite.config.ts
```

---

## 4. Arena Layout & Responsive Configuration (`config.ts`)

Both **Portrait** and **Landscape** simulation layouts keep the two arenas side-by-side and are 100% tweakable in `src/data/config.ts` under `CFG.LAYOUT.PORTRAIT` and `CFG.LAYOUT.LANDSCAPE`:

- **Scale & Sizing**: `FIXED_SCALE`, `MIN_SCALE`, `MAX_SCALE`, `SCALE_STEP`, `SCALE_MULTIPLIER`
- **Spacing & Offsets**: `ARENA_GAP`, `PADDING_X`, `PADDING_Y`, `RESERVE_WIDTH`, `RESERVE_HEIGHT`, `OFFSET_X`, `OFFSET_Y`
- **Timer HUD (`TIMER_HUD`)**: `TITLE_FONT_SIZE`, `TIMER_FONT_SIZE`, `OFFSET_Y`
- **Telemetry Bar (`TELEMETRY_BAR`)**: `SHOW`, `FONT_SIZE`, `ICON_SIZE`, `PADDING_X`, `PADDING_Y`, `OFFSET_Y`, `COMPACT_WIDTH_THRESHOLD`
- **Minit Card (`MINIT_CARD`)**: `SHOW`, `WIDTH_RATIO`, `MARGIN_TOP`, `PADDING`, `ACCENT_BAR_HEIGHT`, `ICON_BOX_SIZE`, `ICON_SPRITE_SIZE`, `NAME_FONT_SIZE`, `DESC_FONT_SIZE`, `DESC_MAX_LINES`, `OFFSET_X`, `OFFSET_Y`

---

## 5. Complete Minit Creation Guide (`<minit>.ts` SDK)

Every Minit in **Mining Duels!** is a single, self-contained TypeScript file (`<minit>.ts`). You can either:
1. Add `<minit>.ts` directly to `src/data/minits/` and import it in `src/data/minits/index.ts`, **OR**
2. Import `<minit>.ts` at runtime via the **DEV LAB -> CUSTOM MINITS (`.TS`)** window in the Editor scene (no rebuild required!).

### 5.1 File Structure & `MinitDef` Schema

A `<minit>.ts` file exports a `MinitDef<TConfig, TState>` object:

```ts
export interface MinitDef<TConfig = Record<string, any>, TState = Record<string, any>> {
  id: string;                              // Unique lowercase alphanumeric ID (e.g. 'vortex')
  name: string;                            // Display name in uppercase (e.g. 'VORTEX')
  role?: string;                           // Subtitle role (e.g. 'Singularity Excavator')
  color: number;                           // Primary hex color (e.g. 0x00ffcc)
  roam: number;                            // Horizontal roam tendency (0 = vertical drill, 0.5+ = wide roam)
  cd: number;                              // Base ability cooldown in ticks (60 ticks = 1 second)
  desc: string;                            // Concise description shown on the Minit card
  config: TConfig;                         // Tunable parameters accessible via ctx.config
  textures: Record<string, TextureSource>; // Must include 'base'; optional alternate states (e.g. 'hatched')
  vfx?: Record<string, TextureSource>;     // Custom particle/projectile/aura textures
  audio?: Record<string, AudioProfile>;    // Co-located procedural sound effects
  effects?: Record<string, EffectDef>;     // Co-located status buffs/debuffs
  onInit?: (ctx: MinitContext<TConfig, TState>) => void;    // Called once when duel starts
  onTick?: (ctx: MinitContext<TConfig, TState>) => void;    // Called every simulation tick (60Hz)
  onTrigger?: (ctx: MinitContext<TConfig, TState>) => void; // Called whenever cooldown reaches cd
}
```

### 5.2 Lifecycle Hooks & `MinitContext`

Every hook (`onInit`, `onTick`, `onTrigger`) receives a strongly-typed `ctx: MinitContext<TConfig, TState>`:

| Property / Method | Description |
| :--- | :--- |
| `ctx.state` | Mutable per-match state object (`TState`) unique to this Minit instance. |
| `ctx.config` | Your Minit's `config` object (`TConfig`). |
| `ctx.arena` | The owning `IArena` instance (`arena.dmg()`, `arena.dmgAoE()`, `arena.getHP()`, `arena.getPixelCoords()`, `arena.fxPool`, `arena.shake`, `arena.triggerFlash()`, `arena.spawnToast()`). |
| `ctx.slot` | The owning `IMinitSlot` (`slot.log.x`, `slot.log.y`, `slot.log.t`, `slot.worldX`, `slot.worldY`, `slot.modifiers`, `slot.addEffect()`). |
| `ctx.spr` | The Minit's `PIXI.Sprite` (modify `spr.tint`, `spr.rotation`, or swap `spr.texture`). |
| `ctx.tex(name)` | Resolves a local VFX texture name (`'orb'`) to its global baked key (`'minit_<id>_vfx_orb'`). |
| `ctx.playSound(id, volMult?)` | Plays either a built-in sound (`'laser'`, `'explosion'`, `'nuke'`, `'crush'`, `'hit'`, `'quake'`, `'swarm'`, `'devour'`) or a custom sound registered in `audio`. |
| `ctx.spawn(blueprint, overrides?)` | Spawns an `Entity` in the arena using an `EntityBlueprint`, `Archetype`, or payload. Automatically binds `owner: ctx.slot` and `x: slot.log.x, y: slot.log.y`. |

### 5.3 Textures & VFX: Procedural Graphics & Base64 PNG Data URLs

Both `textures` and `vfx` accept any `TextureSource`:

1. **Procedural `PIXI.Graphics` Drawer Function `(g, color) => void`** (centered at `(0, 0)`):
   ```ts
   textures: {
     base: (g, c) => {
       g.beginFill(0x0b1320).drawRect(-7, -7, 14, 14).endFill();
       g.lineStyle(1.5, c, 1).drawRect(-6, -6, 12, 12);
       g.lineStyle(0).beginFill(0xffffff, 1).drawCircle(0, 0, 3).endFill();
     }
   }
   ```
2. **Base64 PNG Data URL String or `pngTexture()` Helper**:
   ```ts
   import { pngTexture } from '../../engine/textures';

   textures: {
     // Direct base64 string:
     base: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9h...',
     // Or configured with explicit pixel size/scale/tint:
     overdrive: pngTexture('data:image/png;base64,iVBORw0KGgo...', {
       width: 16,
       height: 16,
       scale: 1,
       padding: 2
     })
   }
   ```

### 5.4 Co-Located Procedural Audio (`AudioProfile`)

Define custom sound effects inside your Minit's `audio` block and play them via `playSound('my_sound')`:

```ts
audio: {
  // Oscillator synth sound
  plasma_shot: {
    t: 'sawtooth',         // 'sine' | 'square' | 'sawtooth' | 'triangle'
    f0: () => 850 + FastMath.rand() * 150, // Start frequency (Hz)
    f1: 110,               // End frequency (Hz)
    d: 0.22,               // Duration (seconds)
    v: 0.18,               // Volume (0.0 - 1.0)
    ramp: 'exp'            // 'exp' | 'lin' | 'lin_exp'
  },
  // Filtered noise burst + sub-oscillator
  heavy_impact: {
    noise: true,
    fType: 'lowpass',      // 'lowpass' | 'highpass' | 'bandpass'
    f0: 1400,
    f1: 90,
    fQ: 2,
    oF0: 180,              // Sub-sine start freq
    oF1: 40,               // Sub-sine end freq
    d: 0.35,
    v: 0.25
  }
}
```

### 5.5 Co-Located Status Effects & Cross-Arena Sabotage (`EffectDef`)

Minits can buff themselves (`slot.addEffect(...)`) or sabotage the opponent in the rival arena (`const enemy = arena.getOpponentSlot(slot); enemy?.addEffect(...)`).

Built-in status effects include:
- `'slow'` — Reduces mining/cooldown speed (`slot.modifiers.speedMul`).
- `'poison'` — Periodically deals acid damage around the afflicted Minit.
- `'blind'` — Disables ability triggers while active (`slot.modifiers.blind = true`).

You can also define custom status effects directly in your Minit's `effects` block:

```ts
effects: {
  overcharge: {
    id: 'overcharge',
    label: 'OVERCHARGE',
    color: 0x00ffcc,
    stackable: true,
    maxStacks: 3,
    defaultDur: 240, // 4 seconds at 60fps
    onApply: (slot, eff) => {
      slot.modifiers.speedMul *= 1 + 0.2 * eff.stacks;
      slot.modifiers.dmgMul *= 1.25;
    },
    onRemove: (slot, eff) => {
      slot.modifiers.speedMul /= 1 + 0.2 * eff.stacks;
      slot.modifiers.dmgMul /= 1.25;
    },
    onTick: (slot, eff) => {
      if (eff.elapsed % 20 === 0) {
        const p = slot.arena.getPixelCoords(slot.log.x, slot.log.y);
        slot.arena.fxPool.spawnPhysics('fx_flash', p.px, p.py, 0, -1, 10, 0.9, 0.9, true);
      }
    }
  }
}
```

### 5.6 Entity Blueprints, Composable `Trait` Primitives & Custom Traits

When a Minit fires projectiles, beams, drones, or hazards, it spawns **Entities** composed of modular **Traits** using `Blueprint.create()`:

```ts
import { Blueprint, Trait, tagTrait } from '../../engine/blueprint';

const drillRocket = Blueprint.create()
  .life(30)
  .vel(0, 0.9)
  .use(
    Trait.lifecycle.age(),
    Trait.motion.linear(),
    Trait.vfx.trail({ tex: 'spark', vy: -0.6, count: 2 }),
    Trait.combat.collide Rock({
      dmg: 45,
      aoeRadius: 2,
      color: 0xffaa00,
      dieOnHit: true,
      sound: 'explosion',
      shockRad: 80,
      shake: 5
    })
  );

spawn(drillRocket);
```

#### Built-in `Trait` Namespaces (`src/engine/blueprint.ts`)
- **`Trait.lifecycle`**:
  - `Trait.lifecycle.age()` — Decrements `e.l`, increments `e.step`, and marks `e.dead = true` when `e.l <= 0`.
  - `Trait.lifecycle.fuse(ticks, onDetonate)` — Triggers callback after `ticks` frames and marks entity dead.
  - `Trait.lifecycle.spawnOnDeath(blueprints[])` — Spawns child blueprints at the entity's death coordinates.
- **`Trait.motion`**:
  - `Trait.motion.linear()` — Moves `e.curX += e.dx`, `e.curY += e.dy`.
  - `Trait.motion.gravity(g, maxVy)` — Applies downward acceleration and stops on solid rock below.
  - `Trait.motion.lerpToTarget({ tx, ty, duration, arcHeight, dieOnArrive })` — Parabolic or linear interpolation to `(tx, ty)`.
  - `Trait.motion.homingToRef({ targetRef, duration, pullScale })` — Pulls entity toward a moving `{ x, y }` reference.
  - `Trait.motion.orbit({ targetRef, radius, speed, startAngle })` — Orbits a moving target at `radius` grid cells.
- **`Trait.vfx`**:
  - `Trait.vfx.sprite(texKey)` — Attaches a persistent `PIXI.Sprite` to the entity for its lifetime.
  - `Trait.vfx.trail({ tex, vxRange, vy, life, swirl, interval, count })` — Emits physics particles along the entity's path.
  - `Trait.vfx.shockwaveOnStart({ color, radius, width, shake, flash, sound })` — Fires once on entity spawn.
- **`Trait.combat`**:
  - `Trait.combat.collideRock({ dmg, aoeRadius, color, dieOnHit, sound, shockRad, shake, flash })` — Damages rock cells on contact.
  - `Trait.combat.detonateAoE({ dmg, radius, color, sound, shockRad, shake, flash, shrapnelTex, shrapnelCount })` — Explodes in an AoE when `e.dead` becomes true.
  - `Trait.combat.beamColumn({ length, dmg, color, duration, jagged, renderLaser })` — Pierces a vertical column of blocks downward.
  - `Trait.combat.randomAreaStrike({ range, dmg, color, targetsPerTick, onDestroy })` — Strikes random blocks within `range` each tick.
  - `Trait.combat.expandingRing({ baseDmg, maxRadius, speed, color })` — Expanding circular damage wave.
  - `Trait.combat.delayedSnap({ delay, range, dmg, color, shake, flash, sound })` — Charges for `delay` ticks then vaporizes all blocks in `range`.
- **`Trait.cast`**:
  - `Trait.cast.interval({ interval, sound, payload, randomTargetInRange })` — Periodically spawns child entities.
  - `Trait.cast.fan({ interval, count, spread, baseAngle, speed, sound, payload })` — Fires a directional fan spread of projectiles.
- **`Trait.spread`**:
  - `Trait.spread.onDestroy({ dmg, color, lifeDecay, sound, trailTex })` — Propagates to an adjacent rock cell whenever it destroys its current block.

#### Writing Custom Inline Trait Functions
Any function `(entity, arena) => void` is a valid `TraitFn`! Use `tagTrait(name, fn, debugMeta?)` so the **Live Arena Debugger** displays your trait's name and hitbox radius:

```ts
const chainLightningTrait = tagTrait(
  'custom.chainLightning',
  (e, a) => {
    if (e.step % 5 !== 0) return;
    const gx = a.clampX(Math.round(e.curX) + FastMath.randInt(-2, 2));
    const gy = a.clampY(Math.round(e.curY) + 1);
    if (a.getHP(gx, gy) > 0) {
      const p1 = a.getPixelCoords(e.curX, e.curY);
      const p2 = a.getPixelCoords(gx, gy);
      a.fxPool.spawnLaser(p1.px, p1.py, p2.px, p2.py, 0x00ffff, 2, 8, true);
      a.dmg(gx, gy, 28, true, 0x00ffff, e.owner);
    }
  },
  { debugRadius: 2, debugColor: 0x00ffff }
);
```

### 5.7 Prefab `Archetype` Reference

For rapid Minit creation, `Archetype` provides ready-to-spawn composite blueprints:

| Archetype | Description |
| :--- | :--- |
| `Archetype.projectileStraight(opts)` | Linear projectile that damages/explodes on rock contact. |
| `Archetype.projectileTargeted(opts)` | Aims at `(tx, ty)`, leaves a particle trail, and detonates in an AoE on arrival. |
| `Archetype.projectileGravity(opts)` | Falls with gravity, pins to the floor, and explodes after `fuse` ticks. |
| `Archetype.mortarBomb(opts)` | Lobbed in a high parabolic arc (`arcHeight`) to `(tx, ty)` and explodes on impact. |
| `Archetype.beamVertical(opts)` | Instant vertical piercing beam of `length` blocks downward. |
| `Archetype.beamLightning(opts)` | Jagged electric lightning beam downward. |
| `Archetype.areaRandomDamage(opts)` | Strikes `targetsPerTick` random blocks within `range` for `life` ticks. |
| `Archetype.shockwave(opts)` | Expanding circular ring that damages blocks as its radius grows. |
| `Archetype.pullToward(opts)` | Homing energy orb that flies back to `targetRef`. |
| `Archetype.ultimateSnap(opts)` | High-impact delayed AoE annihilation wave. |
| `Archetype.orbitalSatellite(opts)` | Autonomous orbiting drone that periodically casts `castPayload`. |

### 5.8 Full Example: Creating a Custom `<minit>.ts` From Scratch

Save the following file as `chrono.ts` and import it via **DEV LAB -> CUSTOM MINITS (`.TS`)**:

```ts
import { MinitDef } from '../../types/game';
import { Blueprint, Trait, Archetype, tagTrait } from '../../engine/blueprint';
import { FastMath } from '../../engine/fastMath';

export interface ChronoConfig {
  shardCount: number;
  shardDmg: number;
  riftRadius: number;
  riftDmg: number;
  slowDuration: number;
}

export interface ChronoState {
  castCount: number;
}

export const chronoMinit: MinitDef<ChronoConfig, ChronoState> = {
  id: 'chrono',
  name: 'CHRONO',
  role: 'Temporal Weaver',
  color: 0x33ddff,
  roam: 2,
  cd: 22,
  desc: 'Fires time-dilating shards that fracture blocks and warps the rival miner with temporal slow.',

  config: {
    shardCount: 3,
    shardDmg: 26,
    riftRadius: 2,
    riftDmg: 55,
    slowDuration: 150
  },

  textures: {
    base: (g, c) => {
      g.beginFill(0x091326).drawCircle(0, 0, 7).endFill();
      g.lineStyle(1.5, c, 1).drawCircle(0, 0, 7);
      g.moveTo(0, -5).lineTo(0, 0).lineTo(4, 2);
      g.lineStyle(0).beginFill(0xffffff, 1).drawCircle(0, 0, 1.5).endFill();
    }
  },

  vfx: {
    shard: (g, c) => {
      g.beginFill(c, 0.95).drawRect(-2, -4, 4, 8).endFill();
      g.beginFill(0xffffff, 1).drawRect(-1, -2, 2, 4).endFill();
    }
  },

  audio: {
    chrono_tick: {
      t: 'triangle',
      f0: 960,
      f1: 320,
      d: 0.14,
      v: 0.18,
      ramp: 'exp'
    }
  },

  onInit: ({ state }) => {
    state.castCount = 0;
  },

  onTrigger: ({ state, arena, slot, config, spawn, tex, playSound }) => {
    state.castCount++;
    const log = slot.log;
    const dmgMul = slot.modifiers.dmgMul || 1;

    playSound('chrono_tick', 1.0);

    // Launch temporal shards at nearby blocks
    for (let i = 0; i < config.shardCount; i++) {
      const tx = arena.clampX(log.x + FastMath.randInt(-3, 3));
      const ty = arena.clampY(log.y + FastMath.randInt(1, 4));
      spawn(
        Archetype.mortarBomb({
          tx,
          ty,
          dmg: config.shardDmg * dmgMul,
          radius: 1,
          duration: 16,
          arcHeight: 1.2,
          color: slot.md.color,
          trailTex: tex('shard'),
          sound: 'hit'
        })
      );
    }

    // Every 4th trigger, open a Temporal Rift AoE and slow the opponent
    if (state.castCount % 4 === 0) {
      const p = arena.getPixelCoords(log.x, log.y);
      arena.fxPool.spawnShockwave(p.px, p.py, slot.md.color, 90, 4);
      arena.dmgAoE(log.x, log.y + 1, config.riftRadius, config.riftDmg * dmgMul, slot.md.color, slot);

      const enemy = arena.getOpponentSlot(slot);
      if (enemy && !enemy.disabled) {
        enemy.addEffect('slow', {
          duration: config.slowDuration,
          magnitude: 0.35,
          source: slot
        });
      }
    }
  }
};
```

---

## 6. Dev Lab: Importing `.ts` Minits, Balancing & Debugging

Click the **`DEV LAB`** button in the top-right of the **Editor (`SELECT 2 MINITS`)** screen to access three integrated tools:

1. **`CUSTOM MINITS (.TS)`**:
   - **Upload `.ts` File**: Import any `<minit>.ts` file from disk.
   - **Download `vortex.ts` Template**: Get a starter `.ts` file with types, config, VFX, audio, and archetypes pre-wired.
   - **In-Browser `.ts` Source Compiler**: Edit TypeScript code directly in the built-in editor and click **`COMPILE & SAVE .TS`** to immediately bake textures/VFX and persist the Minit in `localStorage`.
   - **Manage & Export**: Edit, export back to `<minit>.ts`, or delete any custom Minit at any time.
2. **`BALANCE CHECK`**:
   - Choose **Full Round-Robin Matrix** (all Minits vs. all Minits, including custom `.ts` Minits) or **Custom 1v1 Run**, select `3 / 5 / 10 / 20` matches per pair, and click **`RUN HEADLESS CHECK`**.
   - Inspect each Minit's **Balance Tier** (`OP` ≥ 65%, `STRONG` 54–64%, `BALANCED` 42–53%, `WEAK` < 42%), **Win Rate %**, **W-L-T record**, **Avg/Min/Max Score**, **Avg Depth**, and **Avg Mined Blocks**.
   - Click any cell in the **Head-to-Head Win% Matrix** to immediately watch that 1v1 matchup live in the Arena.
3. **`DEBUGGER`**:
   - Toggle **Live Debug Mode**, **Hitboxes, Trajectories & AoE Outlines**, **Subterranean Grid Lines**, and **Live Entity & State Inspector**.
   - During a debug duel, use the top transport bar to **Pause/Resume**, step **`+1T`** or **`+10T`** deterministic frames, switch speed (`0.25x`, `0.5x`, `1x`, `2x`), and inspect active `Entity[]` traits and custom Minit `state` in real time.

---

## 7. Development & Automatic GitHub Pages Deployment

### Local Development

```bash
# Install dependencies
npm install

# Start local development server on http://localhost:3000
npm run dev

# Type-check with TypeScript
npm run lint

# Build production static bundle into ./dist
npm run build
```

### Automatic GitHub Pages Deployment

This repository includes a pre-configured GitHub Actions workflow at `.github/workflows/deploy.yml` and relative asset resolution (`base: './'` in `vite.config.ts`).

To enable automatic deployment on GitHub:
1. Push this repository to GitHub (`main` or `master` branch).
2. In your GitHub repository, navigate to **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. Every push to `main` or `master` (or manual trigger from the **Actions** tab) will automatically type-check, build `./dist`, and publish the live game to your GitHub Pages URL.
