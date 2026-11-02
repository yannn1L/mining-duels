# Mining Duels — Full Engine & Rendering Performance Optimization Plan

A comprehensive runtime and rendering optimization plan to eliminate frame rate drops during high-intensity duels, decouple React DOM telemetry updates from the 60 FPS WebGL simulation loop, and introduce dynamic particle throttling.

## User Review & Critical Decisions

Based on your preferences, this plan incorporates the following core decisions:
- **Primary Optimization Target**: Active duel simulations with heavy particle and projectile activity across both arenas.
- **Adaptive Visual Effects**: Dynamic VFX throttling that automatically scales back secondary particle bursts and trails when frame time spikes or active particle pools saturate, preserving full visual impact during normal load.
- **Decoupled HUD & Telemetry Architecture**: The PixiJS arena simulation runs at an unblocked 60 FPS while React DOM telemetry, status effect bars, and timer HUD updates are throttled and only triggered when displayed values change.

---

## 1. Overview & Core Concept

During intense matchups (such as Laser, Alchemist, Frenzy, or Turret duels), **Mining Duels** experiences frame rate drops caused by five compounding bottlenecks:
1. **60Hz React State Re-renders**: `App.tsx` calls `setTimeLeft` and `setTelemetry` (allocating new arrays and objects) on every single PixiJS ticker frame (60 times per second), forcing React to reconcile the entire DOM HUD tree every 16.6ms alongside WebGL rendering.
2. **Unconditional Scene-Graph Transform Invalidations**: Every frame, `Arena.updateVisuals` writes `.x` and `.y` on all 690 viewport block containers (`345` per arena) even when the camera row hasn't changed and no blocks were damaged—forcing PixiJS to recompute 2,070 world matrices per frame.
3. **Full-Pool Particle Scans & Per-Particle `Math.pow`**: `VFXPool.update` scans all 800 physics slots per arena (1,600 total) every frame regardless of how many particles are active, and runs `Math.pow(dragX, timeScale)` per particle inside the hot loop.
4. **Mid-Combat Canvas Text Allocations & 60Hz Graphics Re-triangulation**: Status effect toasts (`spawnToast`) instantiate a brand-new high-DPI `PIXI.Text` (`resolution = 4`) on every status application, triggering synchronous HTML5 Canvas text rasterization and GPU texture uploads mid-duel. Meanwhile, `MinitSlot._updateEffectsUI` calls `PIXI.Graphics.clear()` and redraws status progress bars 60 times per second.
5. **Hidden Background Overdraw**: The 22 animated floating background sprites remain visible and continue updating behind the opaque duel arenas during active simulations.

---

## 2. User Experience & Visual Design

- **Locked 60 FPS Combat Fluidity**: Camera tracking, hit-stop, screen shake, laser beams, and projectile physics remain silky-smooth even when both Minits trigger rapid-fire abilities simultaneously.
- **Seamless Dynamic Particle Scaling**:
  - Under normal frame budgets (`>= 55 FPS`), particles spawn at 100% density.
  - When frame delta spikes or active physics particles exceed pool thresholds, an adaptive LOD multiplier (`vfxLod`) smoothly scales down burst counts and skips redundant ambient dust/trail particles while always preserving critical combat telegraphs (lasers, shockwaves, explosions, and damage popups).
- **Responsive Yet Lightweight HUD**:
  - Match countdown timer updates cleanly when tenths-of-a-second change.
  - Player telemetry (score, depth, mined count, and status effects) updates at a crisp, human-readable 12–15Hz cadence without stalling WebGL frame submission.

---

## 3. Key Product Decisions & Trade-Offs

- **Active-Index Tracking vs. Fixed Array Scanning in `VFXPool`**:
  - *Decision*: Maintain compact active-item arrays (swap-and-pop on particle expiration) for physics particles, shockwaves, lasers, and popups, plus a fast-path drag calculation when `timeScale ≈ 1.0`.
  - *Trade-off*: Adds a few bytes of index bookkeeping per pool item in exchange for reducing idle/moderate particle loop overhead by up to 85%.
- **Dirty-Flagged Viewport Block Updates**:
  - *Decision*: Introduce a `hasDirtyBlocks` flag and compare `cYInt !== lastCYInt` before iterating the 345 viewport grid slots per arena, and only update `vpb.c.y` when a slot's grid row (`gy`) actually changes.
  - *Trade-off*: Eliminates hundreds of redundant PixiJS transform recalculations on frames where the camera is stationary and no blocks took damage.
- **Pre-Allocated Toast & Status Bar Pooling**:
  - *Decision*: Replace per-proc `new PIXI.Text()` allocations in `spawnToast` with a fixed, reusable toast pool per arena (with rate-limiting against duplicate rapid-fire procs), and replace 60Hz `PIXI.Graphics.clear()` status bar redraws with quantized dirty checks so geometry only updates when the bar width or color visibly changes.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PixiJS 60 FPS Ticker Loop                        │
└───────────────────┬─────────────────────────────────┬───────────────────┘
                    │ Every Frame (16.6ms)            │ Throttled (~12-15Hz / Dirty)
                    ▼                                 ▼
┌───────────────────────────────────────┐ ┌───────────────────────────────┐
│        WebGL Simulation Engine        │ │     React HUD & Telemetry     │
│                                       │ │                               │
│ • Adaptive Frame-Time Monitor (LOD)   │ │ • Decoupled Telemetry Sync    │
│ • Dirty-Flagged Viewport Grid (690x)  │ │ • Quantized Timer State       │
│ • Swap-&-Pop Active VFX Pool          │ │ • Paused BG Floaters in Sim   │
│ • Pooled Status Toasts & Cached Bars  │ │ • On-Demand Debug Inspector   │
└───────────────────────────────────────┘ └───────────────────────────────┘
```

### Core Optimization Pillars

1. **Decoupled React HUD & Background Culling**
   - Throttle `refreshTelemetrySnapshot` in the ticker loop to run every 5 frames (~12Hz) and perform a shallow change check before calling `setTelemetry` so React never re-renders when stats are unchanged.
   - Quantize `timeLeft` and `overtimeRemaining` state updates to 0.1s increments (`Math.round(tl * 10) / 10`) so `setTimeLeft` only fires ~10 times per second instead of 60.
   - Hide `bgContainer` (`bgContainer.visible = false`) and skip updating the 22 background floaters whenever the active screen is `SIMULATION`.

2. **Active-Only `VFXPool` & Dynamic Particle Throttling**
   - Refactor `VFXPool` to iterate only over active particles via compact active lists using O(1) swap-and-pop removal when `life <= 0`.
   - Add an adaptive frame-rate monitor in `Arena` that tracks rolling frame delta (`dt`) and current `VFXPool` occupancy to compute `vfxLod` (`0.2` to `1.0`).
   - Scale multi-particle burst counts by `vfxLod` and probabilistically cull low-priority ambient dust/trail spawns when pool occupancy exceeds 65% or FPS dips below 50.
   - Replace per-particle `Math.pow(s.dragX, timeScale)` with direct multiplication when `Math.abs(timeScale - 1) < 0.05`.

3. **Zero-Waste Viewport Grid & Entity Rendering**
   - Add `hasDirtyBlocks` tracking in `Arena._markDirty()` and skip the 345-slot `vpBlocks` traversal altogether on frames where `!this.hasDirtyBlocks && cYInt === this.lastCYInt`.
   - Remove redundant `vpb.c.x = vx * TS` writes inside `updateVisuals()` (already positioned at initialization) and only assign `vpb.c.y` when `vpb.lastGy !== gy`.
   - Guard `debugLayer.clear()` with a `_debugWasEnabled` flag so it is not invoked 60 times per second when the debugger is off.

4. **Pooled Status Toasts & Cached Status Effect Icons**
   - Pre-allocate a pool of reusable `PIXI.Text` toast objects per arena (`resolution = 2`) with a short cooldown per effect ID to eliminate mid-combat canvas creation and `destroy()` churn.
   - Cache the last rendered fill color and quantized bar width on each status effect icon in `MinitSlot._updateEffectsUI()` so `PIXI.Graphics` is only redrawn when the visual bar step changes.
   - Avoid cloning immutable default `traits` arrays in `toPayload()` when no trait overrides are supplied.
