import { CFG } from '../data/config';
import {
  BehaviorPayload,
  BlueprintOrPayload,
  Entity,
  IArena,
  IEntityBlueprint,
  IMinitSlot,
  TraitFn
} from '../types/game';
import { AudioSys } from './audio';
import { FastMath } from './fastMath';

/**
 * Attaches a human-readable trait name and optional debug metadata (such as AoE radius or beam length)
 * to a TraitFn so the Live Debug Overlay and Entity Inspector can visualize any entity accurately.
 */
export function tagTrait(
  name: string,
  fn: (e: Entity, a: IArena) => void,
  meta?: Record<string, any>
): TraitFn {
  const tagged = fn as TraitFn;
  tagged._traitName = name;
  if (meta) tagged._debugMeta = meta;
  return tagged;
}

/**
 * Helper to resolve a texture key against the entity's owning MinitSlot if present.
 */
export function resolveEntityTex(e: Entity, texName?: string): string | undefined {
  if (!texName) return undefined;
  if (e.owner && typeof e.owner.tex === 'function') {
    return e.owner.tex(texName);
  }
  return texName;
}

/**
 * Normalizes either a fluent EntityBlueprint or a raw BehaviorPayload into a BehaviorPayload.
 */
export function toPayload(
  item: BlueprintOrPayload,
  overrides: Partial<BehaviorPayload> = {}
): BehaviorPayload {
  if (typeof (item as IEntityBlueprint).build === 'function') {
    return (item as IEntityBlueprint).build(overrides);
  }
  const base = item as BehaviorPayload;
  return {
    ...base,
    ...overrides,
    traits: overrides.traits || base.traits || [],
    p: overrides.p ? { ...(base.p || {}), ...overrides.p } : base.p || {}
  };
}

/**
 * Fluent Composable Entity Blueprint Builder
 * Combines spatial parameters, lifecycle properties, and a pipeline of TraitFn hooks.
 */
export class EntityBlueprint implements IEntityBlueprint {
  private data: BehaviorPayload;

  constructor(init: Partial<BehaviorPayload> = {}) {
    this.data = {
      traits: init.traits ? [...init.traits] : [],
      p: init.p ? { ...init.p } : {},
      ...init
    };
  }

  static create(init: Partial<BehaviorPayload> = {}): EntityBlueprint {
    return new EntityBlueprint(init);
  }

  pos(x: number, y: number): this {
    this.data.x = x;
    this.data.y = y;
    return this;
  }

  offset(offsetX: number, offsetY: number): this {
    this.data.offsetX = offsetX;
    this.data.offsetY = offsetY;
    return this;
  }

  vel(dx: number, dy: number): this {
    this.data.dx = dx;
    this.data.dy = dy;
    return this;
  }

  target(tx: number, ty: number): this {
    this.data.tx = tx;
    this.data.ty = ty;
    return this;
  }

  life(ticks: number): this {
    this.data.l = ticks;
    this.data.maxL = ticks;
    return this;
  }

  fuse(ticks: number): this {
    this.data.f = ticks;
    return this;
  }

  angle(rad: number): this {
    this.data.ang = rad;
    return this;
  }

  sound(sfxId: string, vol = 1.0): this {
    this.data.sound = sfxId;
    this.data.soundVol = vol;
    return this;
  }

  chance(prob: number): this {
    this.data.spawnChance = prob;
    return this;
  }

  params(p: Record<string, any>): this {
    this.data.p = { ...(this.data.p || {}), ...p };
    return this;
  }

  use(...traits: TraitFn[]): this {
    for (const tr of traits) {
      this.data.traits.push(tr);
      if (tr._debugMeta) {
        this.data.p = { ...(this.data.p || {}), ...tr._debugMeta };
      }
    }
    return this;
  }

  build(overrides: Partial<BehaviorPayload> = {}): BehaviorPayload {
    return {
      ...this.data,
      ...overrides,
      traits: overrides.traits || this.data.traits,
      p: overrides.p ? { ...(this.data.p || {}), ...overrides.p } : this.data.p || {}
    };
  }
}

export const Blueprint = EntityBlueprint;

/**
 * Composable Trait Primitives Library
 * Every trait is a pure, closure-configured TraitFn: (entity, arena) => void
 */
export const Trait = {
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. MOVEMENT TRAITS
  // ═══════════════════════════════════════════════════════════════════════════
  move: {
    linear(): TraitFn {
      return tagTrait('move.linear', (e) => {
        e.curX += e.dx;
        e.curY += e.dy;
        e.x = e.curX | 0;
        e.y = e.curY | 0;
      });
    },

    toTarget(opts: {
      targetRef?: { x: number; y: number } | null;
      arcHeight?: number;
    } = {}): TraitFn {
      return tagTrait(
        'move.toTarget',
        (e) => {
          const pct = 1 - e.l / Math.max(1, e.maxL);
          const t = opts.targetRef || e.p.targetRef || { x: e.tx, y: e.ty };
          const clampedPct = Math.max(0, Math.min(1, pct));
          const arc = opts.arcHeight ?? e.p.arcHeight ?? 0;
          const arcOffset =
            arc !== 0 ? -Math.sin(clampedPct * Math.PI) * arc : 0;

          e.curX = e.startX + (t.x - e.startX) * clampedPct;
          e.curY = e.startY + (t.y - e.startY) * clampedPct + arcOffset;

          if (pct >= 1) {
            e.curX = t.x;
            e.curY = t.y;
          }

          e.x = Math.round(e.curX);
          e.y = Math.round(e.curY);
        },
        { hasTarget: true, targetRef: opts.targetRef }
      );
    },

    gravityFall(): TraitFn {
      return tagTrait('move.gravityFall', (e, a) => {
        if (
          !e.spinning &&
          !e.pinned &&
          (a.getHP(e.x | 0, e.y + 1) > 0 || e.y >= a.maxDepth - 1)
        ) {
          e.hitGround = true;
        } else {
          e.y++;
          e.curY = e.y;
        }
      });
    },

    bounceX(opts: { shake?: number; sparkTex?: string; sound?: string } = {}): TraitFn {
      return tagTrait('move.bounceX', (e, a) => {
        if (e.curX < 0 || e.curX >= a.cols - 1) {
          e.curX = Math.max(0, Math.min(e.curX, a.cols - 1));
          e.dx *= -1;
          AudioSys.play(opts.sound || 'hit', 0.5);
          a.shake = Math.max(a.shake, opts.shake ?? e.p.shake ?? 0);

          const sparkTex = resolveEntityTex(e, opts.sparkTex || e.p.sparkTex);
          if (sparkTex && a.fxPool) {
            const p = a.getPixelCoords(e.x, e.y);
            const dir = e.dx > 0 ? 1 : -1;
            for (let i = 0; i < 6; i++) {
              a.fxPool.spawnPhysics(
                sparkTex,
                p.px,
                p.py + FastMath.randRange(-4, 4),
                dir * FastMath.randRange(1, 3),
                FastMath.randRange(-2, 2),
                14,
                0.88,
                0.9,
                true
              );
            }
          }
        }
        e.x = e.curX | 0;
      });
    },

    orbit(opts: {
      targetRef: { x: number; y: number };
      radius?: number;
      speed?: number;
      startAngle?: number;
    }): TraitFn {
      return tagTrait(
        'move.orbit',
        (e) => {
          const target = opts.targetRef || e.p.targetRef;
          if (!target) return;
          if (opts.startAngle !== undefined && !e.state._orbitInit) {
            e.ang = opts.startAngle;
            e.state._orbitInit = true;
          }
          const speed = opts.speed ?? e.p.orbitSpeed ?? 0.08;
          const radius = opts.radius ?? e.p.orbitRadius ?? 2.5;
          e.ang = (e.ang || 0) + speed;
          e.curX = target.x + FastMath.cos(e.ang) * radius;
          e.curY = target.y + FastMath.sin(e.ang) * radius;
          e.x = e.curX | 0;
          e.y = e.curY | 0;
        },
        { orbitRadius: opts.radius ?? 2.5 }
      );
    },

    wanderDownSpread(): TraitFn {
      return tagTrait('move.wander', (e) => {
        if (e.l % 2 === 0) {
          const vecs =
            FastMath.rand() < 0.5 ? CFG.VECTORS.DOWN : CFG.VECTORS.SPREAD;
          const d = vecs[(FastMath.rand() * vecs.length) | 0];
          e.curX += d[0];
          e.curY += d[1];
          e.x = e.curX | 0;
          e.y = e.curY | 0;
        }
      });
    }
  },

  // Alias namespace `Trait.motion` for README / Custom Minit compatibility
  motion: {
    linear(): TraitFn {
      return Trait.move.linear();
    },

    gravity(): TraitFn {
      return Trait.move.gravityFall();
    },

    lerpToTarget(opts: {
      tx?: number;
      ty?: number;
      duration?: number;
      arcHeight?: number;
      dieOnArrive?: boolean;
    } = {}): TraitFn {
      return tagTrait(
        'motion.lerpToTarget',
        (e) => {
          if (opts.tx !== undefined) e.tx = opts.tx;
          if (opts.ty !== undefined) e.ty = opts.ty;
          const pct = 1 - e.l / Math.max(1, opts.duration || e.maxL);
          const clampedPct = Math.max(0, Math.min(1, pct));
          const arc = opts.arcHeight ?? e.p.arcHeight ?? 0;
          const arcOffset =
            arc !== 0 ? -Math.sin(clampedPct * Math.PI) * arc : 0;

          e.curX = e.startX + (e.tx - e.startX) * clampedPct;
          e.curY = e.startY + (e.ty - e.startY) * clampedPct + arcOffset;

          if (pct >= 1) {
            e.curX = e.tx;
            e.curY = e.ty;
            if (opts.dieOnArrive !== false) e.dead = true;
          }

          e.x = Math.round(e.curX);
          e.y = Math.round(e.curY);
        },
        { hasTarget: true }
      );
    },

    homingToRef(opts: {
      targetRef: { x: number; y: number };
      duration?: number;
      pullScale?: number;
    }): TraitFn {
      return Trait.move.toTarget({ targetRef: opts.targetRef });
    },

    orbit(opts: {
      targetRef: { x: number; y: number };
      radius?: number;
      speed?: number;
      startAngle?: number;
    }): TraitFn {
      return Trait.move.orbit(opts);
    },

    bounceX(opts: { shake?: number; sparkTex?: string; sound?: string } = {}): TraitFn {
      return Trait.move.bounceX(opts);
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. LIFECYCLE & DEATH TRAITS
  // ═══════════════════════════════════════════════════════════════════════════
  lifecycle: {
    age(): TraitFn {
      return tagTrait('lifecycle.age', (e) => {
        e.step = (e.step || 0) + 1;
        if (--e.l <= 0) e.dead = true;
      });
    },

    fuse(ticks?: number, onDetonate?: (e: Entity, a: IArena) => void): TraitFn {
      return tagTrait('lifecycle.fuse', (e, a) => {
        if (ticks !== undefined && !e.state._fuseInit) {
          e.f = ticks;
          e.state._fuseInit = true;
        }
        if ((e.hitGround || ticks !== undefined) && --e.f <= 0) {
          if (onDetonate) onDetonate(e, a);
          e.dead = true;
        }
      });
    },

    spawnOnDeath(blueprints: BlueprintOrPayload[]): TraitFn {
      return tagTrait('lifecycle.spawnOnDeath', (e, a) => {
        if (!e.dead || !blueprints || blueprints.length === 0) return;
        for (const sub of blueprints) {
          const built = toPayload(sub);
          if (
            built.spawnChance !== undefined &&
            FastMath.rand() >= built.spawnChance
          ) {
            continue;
          }
          const sx = e.x + (built.offsetX || 0);
          const sy = e.y + (built.offsetY || 0);
          a.spawnEnt(built, {
            x: sx,
            y: sy,
            curX: sx,
            curY: sy,
            startX: sx,
            startY: sy,
            owner: e.owner
          });
        }
      });
    },

    explodeOnDeath(opts: {
      dmg: number;
      radius?: number;
      color: number;
      shake?: number;
      flash?: number;
      sound?: string;
      shockRad?: number;
      spawnOnDeath?: BlueprintOrPayload[];
    }): TraitFn {
      return tagTrait(
        'lifecycle.explode',
        (e, a) => {
          if (!e.dead) return;
          AudioSys.play(opts.sound || 'explosion');
          if (opts.shake) a.shake = Math.max(a.shake, opts.shake);
          if (opts.flash) a.triggerFlash(opts.flash);

          a.dmgAoE(e.x, e.y, opts.radius ?? 1, opts.dmg, opts.color, e.owner);
          const p = a.getPixelCoords(e.x, e.y);
          a.fxPool.spawnShockwave(p.px, p.py, opts.color, opts.shockRad || 100, 6);

          if (opts.spawnOnDeath && opts.spawnOnDeath.length > 0) {
            for (const sub of opts.spawnOnDeath) {
              const built = toPayload(sub);
              if (built.spawnChance !== undefined && FastMath.rand() >= built.spawnChance) {
                continue;
              }
              const sx = e.x + (built.offsetX || 0);
              const sy = e.y + (built.offsetY || 0);
              a.spawnEnt(built, {
                x: sx,
                y: sy,
                curX: sx,
                curY: sy,
                startX: sx,
                startY: sy,
                owner: e.owner
              });
            }
          }
        },
        { debugRadius: opts.radius ?? 1, debugColor: opts.color }
      );
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. DAMAGE & EXCAVATION TRAITS
  // ═══════════════════════════════════════════════════════════════════════════
  damage: {
    onHit(opts: {
      dmg: number;
      color: number;
      aoeRadius?: number;
      dieOnHit?: boolean;
      sound?: string;
      shockRad?: number;
      shake?: number;
      flash?: number;
    }): TraitFn {
      return tagTrait(
        'damage.onHit',
        (e, a) => {
          const hp = a.getHP(e.x, e.y);
          if (hp > 0 && hp !== 9999) {
            if (opts.aoeRadius && opts.aoeRadius > 0) {
              a.dmgAoE(e.x, e.y, opts.aoeRadius, opts.dmg, opts.color, e.owner);
            } else {
              a.dmg(e.x, e.y, opts.dmg, true, opts.color, e.owner);
            }
            if (opts.sound) AudioSys.play(opts.sound);
            if (opts.shake) a.shake = Math.max(a.shake, opts.shake);
            if (opts.flash) a.triggerFlash(opts.flash);
            if (opts.shockRad) {
              const p = a.getPixelCoords(e.x, e.y);
              a.fxPool.spawnShockwave(p.px, p.py, opts.color, opts.shockRad, 4);
            }
            if (opts.dieOnHit !== false) e.dead = true;
          }
        },
        { debugColor: opts.color, debugRadius: opts.aoeRadius }
      );
    },

    tick(opts: { dmg: number; color: number }): TraitFn {
      return tagTrait('damage.tick', (e, a) => {
        a.dmg(e.x, e.y, opts.dmg, true, opts.color, e.owner);
      });
    },

    beam(opts: {
      length: number;
      dmg: number;
      color: number;
      width?: number;
      jagged?: boolean;
      renderLaser?: boolean;
    }): TraitFn {
      return tagTrait(
        'damage.beam',
        (e, a) => {
          for (let k = 1; k <= opts.length; k++) {
            a.dmg(e.x, e.y + k, opts.dmg, true, opts.color, e.owner);
          }
          if (opts.renderLaser !== false) {
            const ps = a.getPixelCoords(e.x, e.y);
            const pe = a.getPixelCoords(e.x, e.y + opts.length);
            a.fxPool.spawnLaser(
              ps.px,
              ps.py,
              pe.px,
              pe.py,
              opts.color,
              opts.width ?? 4,
              2,
              opts.jagged ?? false
            );
          }
        },
        { debugBeamLength: opts.length, debugColor: opts.color }
      );
    },

    lightning(opts: { length: number; dmg: number; color?: number }): TraitFn {
      const col = opts.color ?? 0xffff00;
      return tagTrait(
        'damage.lightning',
        (e, a) => {
          const endY = Math.min(e.y + opts.length, a.maxDepth - 1);
          const ps = a.getPixelCoords(e.x, e.y);
          const pe = a.getPixelCoords(e.x, endY);
          a.fxPool.spawnLaser(ps.px, ps.py, pe.px, pe.py, col, 4, 10, true);
          for (let y = e.y; y <= endY; y++) {
            const rx = a.clampX(e.x + (FastMath.randRange(-1.5, 1.5) | 0));
            a.dmg(rx, y, opts.dmg, true, col, e.owner);
            const pr = a.getPixelCoords(rx, y);
            a.fxPool.spawnPhysics(
              'fx_flash',
              pr.px,
              pr.py,
              FastMath.randRange(-2, 2),
              FastMath.randRange(-2, 2),
              10,
              CFG.PHYSICS.DRAG_X,
              CFG.PHYSICS.DRAG_X,
              true
            );
          }
        },
        { debugBeamLength: opts.length, debugColor: col }
      );
    },

    randomArea(opts: {
      range: number;
      dmg: number;
      color: number;
      targetsPerTick?: number;
      onDestroy?: (
        x: number,
        y: number,
        arena: IArena,
        owner: IMinitSlot | null
      ) => void;
    }): TraitFn {
      return tagTrait(
        'damage.randomArea',
        (e, a) => {
          e.state.counter = (e.state.counter || 0) + 1;
          if (e.state.counter % 3 !== 0) return;

          const cx = e.x;
          const cy = e.y;
          const range = opts.range || 8;
          const cnt = Math.ceil((opts.targetsPerTick || 3) * (a.vfxLod || 1));

          for (let i = 0; i < cnt; i++) {
            const rx = a.clampX(cx + ((FastMath.rand() * range * 2 - range) | 0));
            const ry = a.clampY(cy + ((FastMath.rand() * range * 2 - range) | 0));
            const hp = a.getHP(rx, ry);
            if (
              hp > 0 &&
              hp !== 9999 &&
              a.dmg(rx, ry, opts.dmg, true, opts.color, e.owner) &&
              opts.onDestroy
            ) {
              opts.onDestroy(rx, ry, a, e.owner);
            }
          }

          if (e.state.counter % 6 === 0) {
            const pc = a.getPixelCoords(cx, cy);
            const c = Math.ceil(5 * (a.vfxLod || 1));
            for (let i = 0; i < c; i++) {
              const ang = FastMath.rand() * Math.PI * 2;
              const rad = FastMath.randRange(30, 100);
              a.fxPool.spawnPhysics(
                'fx_dust',
                pc.px + Math.cos(ang) * rad,
                pc.py + Math.sin(ang) * rad + FastMath.randRange(-20, 20),
                Math.cos(ang) * FastMath.randRange(-1, 1),
                FastMath.randRange(-3, -1),
                20,
                0.9,
                0.9,
                true
              );
            }
          }
        },
        { debugRadius: opts.range, debugColor: opts.color }
      );
    },

    shockwave(opts: {
      baseDmg: number;
      maxRadius: number;
      speed: number;
      color: number;
    }): TraitFn {
      return tagTrait(
        'damage.shockwave',
        (e, a) => {
          e.state.radius = (e.state.radius || 0) + opts.speed;
          if (e.state.radius >= opts.maxRadius) {
            e.dead = true;
            return;
          }
          const r = Math.floor(e.state.radius);
          const cx = e.x;
          const cy = e.y;
          for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              const dist = Math.hypot(dx, dy);
              if (dist <= r) {
                const dmg = Math.floor(opts.baseDmg / (dist + 1));
                if (dmg > 0) a.dmg(cx + dx, cy + dy, dmg, true, opts.color, e.owner);
              }
            }
          }
          const pc = a.getPixelCoords(cx, cy);
          a.fxPool.spawnShockwave(pc.px, pc.py, opts.color, e.state.radius * 20, 3);
          if (e.state.radius % 2 === 0) {
            const cnt = Math.ceil(8 * a.vfxLod);
            for (let i = 0; i < cnt; i++) {
              const ang = FastMath.rand() * Math.PI * 2;
              const rad = e.state.radius * 16;
              a.fxPool.spawnPhysics(
                'fx_dust',
                pc.px + Math.cos(ang) * rad,
                pc.py + Math.sin(ang) * rad,
                Math.cos(ang) * FastMath.randRange(1, 3),
                Math.sin(ang) * FastMath.randRange(1, 3),
                20,
                0.9,
                0.9,
                true
              );
            }
          }
          if (e.state.radius % 3 === 0) AudioSys.play('hit', 0.3);
        },
        { debugRadius: opts.maxRadius, debugColor: opts.color }
      );
    },

    ultimateSnap(opts: {
      delay?: number;
      range?: number;
      dmg: number;
      color?: number;
      shake?: number;
      flash?: number;
      sound?: string;
    }): TraitFn {
      const delay = opts.delay ?? 10;
      const range = opts.range ?? 4;
      const color = opts.color ?? 0xffaa44;
      return tagTrait(
        'damage.ultimateSnap',
        (e, a) => {
          e.state.counter = (e.state.counter || 0) + 1;
          if (e.state.counter < delay) return;

          const cx = e.x;
          const cy = e.y;
          const rocksInRange: Array<{ x: number; y: number }> = [];
          for (let dy = -range; dy <= range; dy++) {
            for (let dx = -range; dx <= range; dx++) {
              const rx = a.clampX(cx + dx);
              const ry = a.clampY(cy + dy);
              const hp = a.getHP(rx, ry);
              if (hp > 0 && hp !== 9999) rocksInRange.push({ x: rx, y: ry });
            }
          }

          const toDestroy = Math.floor(rocksInRange.length * 0.6);
          for (let i = 0; i < toDestroy; i++) {
            if (rocksInRange.length === 0) break;
            const idx = (FastMath.rand() * rocksInRange.length) | 0;
            const rock = rocksInRange[idx];
            a.dmg(rock.x, rock.y, opts.dmg, true, color, e.owner);
            rocksInRange.splice(idx, 1);
          }

          AudioSys.play(opts.sound || 'bio_squish', 1.2);
          a.triggerFlash(opts.flash ?? 0.6);
          a.shake = Math.max(a.shake, opts.shake ?? 12);
          const pCenter = a.getPixelCoords(cx, cy);
          a.fxPool.spawnShockwave(pCenter.px, pCenter.py, color, 150, 8);

          const starCount = Math.ceil(20 * (a.vfxLod || 1));
          for (let i = 0; i < starCount; i++) {
            const ang = FastMath.rand() * Math.PI * 2;
            const rad = FastMath.randRange(30, 120);
            a.fxPool.spawnPhysics(
              'fx_flash',
              pCenter.px + Math.cos(ang) * rad,
              pCenter.py + Math.sin(ang) * rad,
              Math.cos(ang) * FastMath.randRange(-2, 2),
              Math.sin(ang) * FastMath.randRange(-2, 2),
              25,
              0.9,
              0.9,
              true
            );
          }
          e.dead = true;
        },
        { debugRadius: range, debugColor: color }
      );
    }
  },

  // Alias namespace `Trait.combat` for README / Custom Minit compatibility
  combat: {
    collideRock(opts: {
      dmg: number;
      aoeRadius?: number;
      color: number;
      dieOnHit?: boolean;
      sound?: string;
      shockRad?: number;
      shake?: number;
      flash?: number;
    }): TraitFn {
      return Trait.damage.onHit(opts);
    },

    detonateAoE(opts: {
      dmg: number;
      radius?: number;
      color: number;
      sound?: string;
      shockRad?: number;
      shake?: number;
      flash?: number;
      spawnOnDeath?: BlueprintOrPayload[];
    }): TraitFn {
      return Trait.lifecycle.explodeOnDeath(opts);
    },

    beamColumn(opts: {
      length: number;
      dmg: number;
      color: number;
      width?: number;
      jagged?: boolean;
      renderLaser?: boolean;
    }): TraitFn {
      return Trait.damage.beam(opts);
    },

    randomAreaStrike(opts: {
      range: number;
      dmg: number;
      color: number;
      targetsPerTick?: number;
      onDestroy?: (
        x: number,
        y: number,
        arena: IArena,
        owner: IMinitSlot | null
      ) => void;
    }): TraitFn {
      return Trait.damage.randomArea(opts);
    },

    expandingRing(opts: {
      baseDmg: number;
      maxRadius: number;
      speed: number;
      color: number;
    }): TraitFn {
      return Trait.damage.shockwave(opts);
    },

    delayedSnap(opts: {
      delay?: number;
      range?: number;
      dmg: number;
      color?: number;
      shake?: number;
      flash?: number;
      sound?: string;
    }): TraitFn {
      return Trait.damage.ultimateSnap(opts);
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. VFX & RENDER TRAITS
  // ═══════════════════════════════════════════════════════════════════════════
  vfx: {
    sprite(texName: string, interval = 2): TraitFn {
      return tagTrait(`vfx.sprite(${texName})`, (e, a) => {
        if ((a.simTicks + (e.entId || 0)) % interval !== 0) return;
        const p = a.getPixelCoords(e.curX ?? e.x, e.curY ?? e.y);
        const tex = resolveEntityTex(e, texName);
        if (tex) {
          a.fxPool.spawnPhysics(tex, p.px, p.py, 0, 0, 3, 1, 1, false);
        }
      });
    },

    trail(opts: {
      tex: string;
      vx?: number;
      vxRange?: number;
      vy?: number;
      life?: number;
      dragX?: number;
      dragY?: number;
      swirl?: boolean;
      interval?: number;
      count?: number;
    }): TraitFn {
      return tagTrait(`vfx.trail(${opts.tex})`, (e, a) => {
        if (opts.interval && (e.step || 0) % opts.interval !== 0) return;
        const tex = resolveEntityTex(e, opts.tex);
        if (!tex) return;
        const p = a.getPixelCoords(e.curX ?? e.x, e.curY ?? e.y);
        const count = opts.count ?? 1;
        const dragX = opts.dragX ?? CFG.PHYSICS.DRAG_X;
        const dragY = opts.dragY ?? CFG.PHYSICS.DRAG_Y;
        const life = opts.life ?? 10;

        for (let i = 0; i < count; i++) {
          let vx =
            opts.vx ??
            (opts.vxRange ? FastMath.randRange(-opts.vxRange, opts.vxRange) : 0);
          let vy = opts.vy ?? 0;
          if (opts.swirl) {
            vx += FastMath.sin(e.l + i) * 2;
            vy += FastMath.cos(e.l + i) * 2;
          }
          a.fxPool.spawnPhysics(tex, p.px, p.py, vx, vy, life, dragX, dragY, true);
        }
      });
    },

    shockwaveOnStart(opts: {
      color: number;
      radius?: number;
      width?: number;
      shake?: number;
      flash?: number;
      sound?: string;
    }): TraitFn {
      return tagTrait('vfx.shockwaveOnStart', (e, a) => {
        if (e.state._swFired) return;
        e.state._swFired = true;
        if (opts.sound) AudioSys.play(opts.sound);
        if (opts.shake) a.shake = Math.max(a.shake, opts.shake);
        if (opts.flash) a.triggerFlash(opts.flash);
        const p = a.getPixelCoords(e.x, e.y);
        a.fxPool.spawnShockwave(
          p.px,
          p.py,
          opts.color,
          opts.radius ?? 60,
          opts.width ?? 4
        );
      });
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. SUB-ENTITY CASTING & SPREAD TRAITS
  // ═══════════════════════════════════════════════════════════════════════════
  cast: {
    interval(opts: {
      interval: number;
      sound?: string;
      vol?: number;
      payload: BlueprintOrPayload;
      randomVelocity?: boolean;
    }): TraitFn {
      return tagTrait(`cast.interval(${opts.interval}f)`, (e, a) => {
        e.state.castTimer = (e.state.castTimer || 0) + 1;
        if (e.state.castTimer < opts.interval) return;
        e.state.castTimer = 0;

        if (opts.sound) {
          AudioSys.play(opts.sound, opts.vol ?? (opts.randomVelocity ? 0.2 : 0.4));
        }

        const built = toPayload(opts.payload);
        a.spawnEnt(built, {
          x: e.x,
          y: e.y,
          curX: e.x,
          curY: e.y,
          startX: e.x,
          startY: e.y,
          dx: opts.randomVelocity ? FastMath.randRange(-1.5, 1.5) : built.dx ?? 0,
          dy: opts.randomVelocity ? FastMath.randRange(0.5, 2.0) : built.dy ?? 0,
          owner: e.owner
        });
      });
    },

    fan(opts: {
      interval: number;
      count: number;
      spread?: number;
      baseAngle?: number;
      speed?: number;
      sound?: string;
      vol?: number;
      payload: BlueprintOrPayload;
    }): TraitFn {
      const spread = opts.spread ?? 0.6;
      const baseAngle = opts.baseAngle ?? Math.PI / 2;
      const speed = opts.speed ?? 1.5;
      return tagTrait(`cast.fan(×${opts.count})`, (e, a) => {
        e.state.castTimer = (e.state.castTimer || 0) + 1;
        if (e.state.castTimer < opts.interval) return;
        e.state.castTimer = 0;

        if (opts.sound) AudioSys.play(opts.sound, opts.vol ?? 0.4);
        const built = toPayload(opts.payload);

        for (let i = 0; i < opts.count; i++) {
          const t = opts.count === 1 ? 0 : i / (opts.count - 1) - 0.5;
          const angle = baseAngle + t * spread;
          const dx = Math.cos(angle) * speed;
          const dy = Math.sin(angle) * speed;

          a.spawnEnt(built, {
            x: e.x,
            y: e.y,
            curX: e.x,
            curY: e.y,
            startX: e.x,
            startY: e.y,
            dx,
            dy,
            owner: e.owner
          });
        }
      });
    }
  },

  spread: {
    onDestroy(opts: {
      dmg: number;
      color: number;
      lifeDecay?: number;
      offsets?: Array<[number, number]>;
      sound?: string;
      trailTex?: string;
      spawnOnDeath?: BlueprintOrPayload[];
    }): TraitFn {
      const offsets = opts.offsets ?? [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ];
      const decay = opts.lifeDecay ?? 5;
      return tagTrait('spread.onDestroy', (e, a) => {
        const hp = a.getHP(e.x, e.y);
        const p = a.getPixelCoords(e.x, e.y);
        const trailTex = resolveEntityTex(e, opts.trailTex);

        if (hp <= 0 || hp === 9999) {
          e.y++;
          e.curY = e.y;
          if (trailTex) {
            a.fxPool.spawnPhysics(
              trailTex,
              p.px,
              p.py,
              0,
              2,
              10,
              CFG.PHYSICS.DRAG_X,
              CFG.PHYSICS.DRAG_X,
              true
            );
          }
        } else {
          const broke = a.dmg(e.x, e.y, opts.dmg, true, opts.color, e.owner);
          if (trailTex) {
            a.fxPool.spawnPhysics(
              trailTex,
              p.px,
              p.py,
              FastMath.randRange(-2, 2),
              FastMath.randRange(-3, 0),
              10,
              CFG.PHYSICS.DRAG_X,
              CFG.PHYSICS.DRAG_X,
              true
            );
          }
          if (broke) {
            const nextLife = Math.max(10, e.l - decay);
            for (const off of offsets) {
              a.spawnEnt({
                x: e.x + off[0],
                y: e.y + off[1],
                l: nextLife,
                maxL: nextLife,
                traits: e.traits,
                p: e.p,
                owner: e.owner
              });
            }
            if (opts.sound) AudioSys.play(opts.sound);
            if (opts.spawnOnDeath) {
              for (const sub of opts.spawnOnDeath) {
                const built = toPayload(sub);
                if (
                  built.spawnChance === undefined ||
                  FastMath.rand() < built.spawnChance
                ) {
                  const sx = e.x + (built.offsetX || 0);
                  const sy = e.y + (built.offsetY || 0);
                  a.spawnEnt(built, {
                    x: sx,
                    y: sy,
                    curX: sx,
                    curY: sy,
                    owner: e.owner
                  });
                }
              }
            }
            e.dead = true;
          }
        }
      });
    }
  }
};

/**
 * Reusable Archetype Presets built directly on top of Blueprint + Trait
 */
export const Archetype = {
  beamVertical(opts: {
    dmg?: number;
    length?: number;
    color?: number;
    duration?: number;
    sound?: string;
    renderLaser?: boolean;
  }): EntityBlueprint {
    const bp = Blueprint.create()
      .life(opts.duration ?? 25)
      .use(
        Trait.lifecycle.age(),
        Trait.damage.beam({
          length: opts.length ?? 5,
          dmg: opts.dmg ?? 30,
          color: opts.color ?? 0x00ccff,
          renderLaser: opts.renderLaser
        })
      );
    if (opts.sound) bp.sound(opts.sound);
    return bp;
  },

  beamLightning(opts: {
    dmg?: number;
    length?: number;
    color?: number;
    duration?: number;
    sound?: string;
  }): EntityBlueprint {
    const bp = Blueprint.create()
      .life(opts.duration ?? 20)
      .use(
        Trait.lifecycle.age(),
        Trait.damage.lightning({
          length: opts.length ?? 5,
          dmg: opts.dmg ?? 25,
          color: opts.color ?? 0xffff00
        })
      );
    if (opts.sound) bp.sound(opts.sound);
    return bp;
  },

  projectileStraight(opts: {
    dmg: number;
    color: number;
    trailTex?: string;
    trailVy?: number;
    life?: number;
    vx?: number;
    vy?: number;
  }): EntityBlueprint {
    const bp = Blueprint.create()
      .vel(opts.vx ?? 0, opts.vy ?? 1)
      .life(opts.life ?? 25)
      .use(
        Trait.move.linear(),
        Trait.lifecycle.age(),
        Trait.damage.onHit({ dmg: opts.dmg, color: opts.color })
      );
    if (opts.trailTex) {
      bp.use(Trait.vfx.trail({ tex: opts.trailTex, vy: opts.trailVy ?? -0.5 }));
    }
    return bp;
  },

  projectileBouncing(opts: {
    dmg: number;
    color: number;
    trailTex?: string;
    trailVy?: number;
    life?: number;
    vx?: number;
    vy?: number;
    shake?: number;
    sparkTex?: string;
  }): EntityBlueprint {
    const bp = Blueprint.create()
      .vel(opts.vx ?? 0.8, opts.vy ?? 0.9)
      .life(opts.life ?? 30)
      .use(
        Trait.move.linear(),
        Trait.move.bounceX({ shake: opts.shake ?? 2, sparkTex: opts.sparkTex }),
        Trait.lifecycle.age(),
        Trait.damage.onHit({ dmg: opts.dmg, color: opts.color })
      );
    if (opts.trailTex) {
      bp.use(Trait.vfx.trail({ tex: opts.trailTex, vy: opts.trailVy ?? -0.5 }));
    }
    return bp;
  },

  projectileGravity(opts: {
    dmg: number;
    radius?: number;
    color: number;
    fuse?: number;
    shake?: number;
    expSound?: string;
    shockRad?: number;
    trailTex?: string;
    trailVy?: number;
    spawnOnDeath?: BlueprintOrPayload[];
  }): EntityBlueprint {
    const bp = Blueprint.create()
      .fuse(opts.fuse ?? 8)
      .use(
        Trait.move.gravityFall(),
        Trait.lifecycle.fuse(),
        Trait.lifecycle.explodeOnDeath({
          dmg: opts.dmg,
          radius: opts.radius ?? 2,
          color: opts.color,
          shake: opts.shake ?? 15,
          sound: opts.expSound ?? 'explosion',
          shockRad: opts.shockRad ?? 100,
          spawnOnDeath: opts.spawnOnDeath
        })
      );
    if (opts.trailTex) {
      bp.use(Trait.vfx.trail({ tex: opts.trailTex, vy: opts.trailVy ?? -1.5 }));
    }
    return bp;
  },

  projectileTargeted(opts: {
    dmg: number;
    radius?: number;
    color: number;
    tx: number;
    ty: number;
    life?: number;
    duration?: number;
    arcHeight?: number;
    trailTex?: string;
    trailVy?: number;
    trailDragX?: number;
    trailDragY?: number;
    trailSwirl?: boolean;
    shake?: number;
    flash?: number;
    sound?: string;
    expSound?: string;
    shockRad?: number;
    spawnOnDeath?: BlueprintOrPayload[];
  }): EntityBlueprint {
    const bp = Blueprint.create()
      .target(opts.tx, opts.ty)
      .life(opts.duration ?? opts.life ?? 30)
      .use(Trait.move.toTarget({ arcHeight: opts.arcHeight }));

    if (opts.trailTex) {
      bp.use(
        Trait.vfx.trail({
          tex: opts.trailTex,
          vy: opts.trailVy ?? -1,
          dragX: opts.trailDragX ?? 0.92,
          dragY: opts.trailDragY ?? 0.92,
          swirl: opts.trailSwirl ?? false
        })
      );
    }

    bp.use(
      Trait.lifecycle.age(),
      Trait.lifecycle.explodeOnDeath({
        dmg: opts.dmg,
        radius: opts.radius ?? 2,
        color: opts.color,
        shake: opts.shake ?? 10,
        flash: opts.flash,
        sound: opts.sound ?? opts.expSound ?? 'explosion',
        shockRad: opts.shockRad ?? 90,
        spawnOnDeath: opts.spawnOnDeath
      })
    );
    return bp;
  },

  mortarBomb(opts: {
    tx: number;
    ty: number;
    dmg: number;
    radius?: number;
    duration?: number;
    life?: number;
    arcHeight?: number;
    color: number;
    trailTex?: string;
    sound?: string;
    expSound?: string;
    shake?: number;
    shockRad?: number;
    spawnOnDeath?: BlueprintOrPayload[];
  }): EntityBlueprint {
    return Archetype.projectileTargeted({
      tx: opts.tx,
      ty: opts.ty,
      dmg: opts.dmg,
      radius: opts.radius ?? 1,
      duration: opts.duration ?? opts.life ?? 18,
      arcHeight: opts.arcHeight ?? 1.2,
      color: opts.color,
      trailTex: opts.trailTex,
      sound: opts.sound ?? opts.expSound ?? 'explosion',
      shake: opts.shake ?? 6,
      shockRad: opts.shockRad ?? 70,
      spawnOnDeath: opts.spawnOnDeath
    });
  },

  pullToward(opts: {
    targetRef: { x: number; y: number };
    trailTex: string;
    life?: number;
  }): EntityBlueprint {
    return Blueprint.create()
      .life(opts.life ?? 15)
      .use(
        Trait.move.toTarget({ targetRef: opts.targetRef }),
        Trait.lifecycle.age(),
        Trait.vfx.trail({ tex: opts.trailTex })
      );
  },

  orbitalSatellite(opts: {
    targetRef: { x: number; y: number };
    radius: number;
    speed: number;
    startAngle: number;
    spriteTex: string;
    castInterval: number;
    castSound?: string;
    castPayload: BlueprintOrPayload;
    randomCast?: boolean;
    life?: number;
  }): EntityBlueprint {
    return Blueprint.create()
      .angle(opts.startAngle)
      .life(opts.life ?? 600)
      .use(
        Trait.move.orbit({
          targetRef: opts.targetRef,
          radius: opts.radius,
          speed: opts.speed
        }),
        Trait.vfx.sprite(opts.spriteTex),
        Trait.cast.interval({
          interval: opts.castInterval,
          sound: opts.castSound,
          payload: opts.castPayload,
          randomVelocity: opts.randomCast
        }),
        Trait.lifecycle.age()
      );
  },

  areaRandomDamage(opts: {
    range: number;
    dmg: number;
    color: number;
    targetsPerTick?: number;
    life?: number;
    onDestroy?: (
      x: number,
      y: number,
      arena: IArena,
      owner: IMinitSlot | null
    ) => void;
  }): EntityBlueprint {
    return Blueprint.create()
      .life(opts.life ?? 20)
      .use(
        Trait.damage.randomArea({
          range: opts.range,
          dmg: opts.dmg,
          color: opts.color,
          targetsPerTick: opts.targetsPerTick,
          onDestroy: opts.onDestroy
        }),
        Trait.lifecycle.age()
      );
  },

  shockwave(opts: {
    baseDmg: number;
    maxRadius: number;
    speed: number;
    color: number;
  }): EntityBlueprint {
    return Blueprint.create().use(Trait.damage.shockwave(opts));
  },

  ultimateSnap(opts: {
    delay?: number;
    range?: number;
    dmg: number;
    color?: number;
    shake?: number;
    flash?: number;
    sound?: string;
  }): EntityBlueprint {
    return Blueprint.create()
      .life(1)
      .use(Trait.damage.ultimateSnap(opts));
  }
};

export { pngTexture } from './textures';
