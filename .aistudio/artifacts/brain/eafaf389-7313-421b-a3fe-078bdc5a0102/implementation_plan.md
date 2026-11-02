# Mobile Performance & WebGL Batching Optimization Plan

Deliver a locked 60 FPS gameplay experience on mobile and tablet devices during intense dual-arena combat without sacrificing visual effects, particle counts, or any gameplay features.

## User Review & Critical Decisions

Based on your clarification responses, this optimization plan incorporates the following architectural decisions:
- **Target Hardware Focus**: Mobile and tablet devices with thermal and memory bandwidth constraints.
- **Core Pipeline Upgrades**: WebGL particle batching and layout reflow caching to completely eliminate DOM layout thrashing.
- **VFX & Physics Architecture**: Retain 100% of particle counts and visual fidelity using GPU-accelerated particle batching combined with precomputed physics lookup tables.

---

## 1. Overview & Core Concept

Mining Duels currently experiences frame rate dips to 30–50 FPS on mobile and tablet devices due to two main bottlenecks:
1. **Forced Synchronous Layout Thrashing**: Querying `getBoundingClientRect()` inside the 60 FPS PixiJS animation loop forces the mobile browser's layout engine to recalculate full-page CSS layout synchronously on every animation frame (costing 8–15ms per frame on mobile CPUs).
2. **WebGL Draw Call & Transform Churn**: 800+ particle sprites per arena living inside standard `PIXI.Container` trees generate multiple draw calls and matrix recomputations, while mobile screens with high Device Pixel Ratios (2.75x–3.5x) stress the mobile GPU fill-rate.

This plan addresses both root causes directly—maintaining all VFX, particle densities, lasers, and animations at a solid 60 FPS.

---

## 2. User Experience & Visual Design

- **Silky 60 FPS on Mobile**: Excavation, screen shake, status toasts, and rapid projectile bursts run fluidly on iOS and Android devices without stutter or thermal throttling.
- **Identical Visual Fidelity**: All sparks, dust bursts, laser beams, shockwaves, damage digits, and custom minit effects remain active with zero reduction in particle count.
- **Pixel-Crisp Scaling**: Clamping DPR to 2.0x on ultra-high-density mobile screens preserves pixel-art clarity while drastically reducing mobile GPU fill-rate strain.

---

## 3. Key Product Decisions & Trade-Offs

- **Cached Layout Reflow vs. Per-Frame DOM Queries**:
  - *Chosen Approach*: Cache arena bounding box coordinates and update them only upon window resize, orientation change, or when a Mutation/ResizeObserver triggers, completely removing `getBoundingClientRect()` from the hot ticker loop.
  - *Why*: Eliminates forced synchronous layout thrashing on mobile WebKit/Blink, regaining 10+ ms of CPU frame budget every tick.
- **PIXI.ParticleContainer & Batched Sprites**:
  - *Chosen Approach*: Transition the physics particle pool to `PIXI.ParticleContainer` with batched vertex buffer updates.
  - *Why*: Reduces hundreds of individual WebGL draw calls and transform matrix passes to 1 single GPU draw call per arena.
- **Precomputed Physics Lookup Tables**:
  - *Chosen Approach*: Precompute drag decay curves (`dragX^t`, `dragY^t`) and trigonometric tables in static typed arrays, replacing repeated dynamic calculations in hot loops.
  - *Why*: Frees mobile CPU cycles for game simulation and PixiJS rendering.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PixiJS 60 FPS Ticker Loop                       │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
┌───────────────────────────────────────┐ ┌──────────────────────────────┐
│       WebGL Multi-Arena Engine        │ │     Layout & Telemetry Sync    │
│                                       │ │                              │
│ • Batched PIXI.ParticleContainer (1x) │ │ • Cached DOM Anchor Bounds   │
│ • Precomputed Physics LUT (Float32)   │ │   (ResizeObserver-driven)    │
│ • Viewport Block Dirty Tile Pass      │ │ • Zero getBoundingClientRect │
│ • Clamped Mobile DPR (Max 2.0x)       │ │   in per-frame ticker        │
└───────────────────────────────────────┘ └──────────────────────────────┘
```

### Key Technical Steps

1. **Eliminate Layout Thrashing (`App.tsx`)**:
   - Cache `p1AnchorRef` and `p2AnchorRef` bounding coordinates in ref memory.
   - Remove per-frame `getBoundingClientRect()` calls from the ticker.
   - Update anchor coordinates exclusively inside `ResizeObserver` callbacks and window resize/orientation events.

2. **Batched Particle Rendering (`vfxPool.ts`)**:
   - Refactor `VFXPool` to use `PIXI.ParticleContainer` configured for dynamic position, scale, rotation, and alpha batching.
   - Maintain the active swap-and-pop particle list, directly updating typed vertex buffers.
   - Retain full particle lifetimes and burst counts without culling.

3. **Precomputed Physics Lookup Tables (`fastMath.ts`)**:
   - Create pre-baked Float32 lookup tables for drag multipliers and directional vectors.
   - Replace dynamic `Math.pow` calculations with instant array index lookups.

4. **Mobile GPU Fill-Rate Optimization (`App.tsx`)**:
   - Clamp canvas `resolution` to `Math.min(2.0, window.devicePixelRatio || 1)`.
   - Prevent 3x/3.5x mobile screens from rendering excessive pixel fill that overwhelms mobile fragment shaders.
