export const FastMath = {
  seed: 123456789,
  sinLUT: new Float32Array(1024),
  cosLUT: new Float32Array(1024),
  PI: 3.14159265359,
  _initialized: false,

  init() {
    if (!this._initialized) {
      for (let i = 0; i < 1024; i++) {
        const rad = (i * Math.PI * 2) / 1024;
        this.sinLUT[i] = Math.sin(rad);
        this.cosLUT[i] = Math.cos(rad);
      }
      this._initialized = true;
    }
    this.seed = (Date.now() ^ (Math.random() * 0x100000000)) | 0;
  },

  rand(): number {
    this.seed = (this.seed * 1664525 + 1013904223) | 0;
    return (this.seed & 0x7fffffff) / 0x7fffffff;
  },

  randRange(min: number, max: number): number {
    return min + this.rand() * (max - min);
  },

  sin(rad: number): number {
    return (
      this.sinLUT[((rad > 0 ? rad : -rad) * 162.97466) & 1023] *
      (rad > 0 ? 1 : -1)
    );
  },

  cos(rad: number): number {
    return this.cosLUT[((rad > 0 ? rad : -rad) * 162.97466) & 1023];
  }
};

// Precomputed Drag LUT for physics particles to eliminate dynamic Math.pow in hot animation loops
export const DragLUT = {
  // Precomputed Float32 steps for timeScale from 0.0 to 2.5 in 0.05 increments (51 entries)
  dragX: new Float32Array(51),
  dragY: new Float32Array(51),
  _ready: false,

  init(defaultDragX = 0.9, defaultDragY = 0.95) {
    if (this._ready) return;
    for (let i = 0; i <= 50; i++) {
      const ts = i * 0.05;
      this.dragX[i] = Math.pow(defaultDragX, ts);
      this.dragY[i] = Math.pow(defaultDragY, ts);
    }
    this._ready = true;
  },

  getDragX(timeScale: number): number {
    const idx = Math.min(50, Math.max(0, Math.round(timeScale * 20)));
    return this.dragX[idx];
  },

  getDragY(timeScale: number): number {
    const idx = Math.min(50, Math.max(0, Math.round(timeScale * 20)));
    return this.dragY[idx];
  }
};

// Initialize LUTs immediately so deferred functions always have valid sin/cos and drag values
FastMath.init();
DragLUT.init();

export class SparseSet<T> {
  public items: T[] = [];
  private _indices = new Map<T, number>();
  public capacity: number;

  constructor(capacity = 0) {
    this.capacity = capacity;
  }

  add(item: T): boolean {
    if (this._indices.has(item)) return false;
    this._indices.set(item, this.items.length);
    this.items.push(item);
    return true;
  }

  remove(item: T): boolean {
    const idx = this._indices.get(item);
    if (idx === undefined) return false;
    const last = this.items[this.items.length - 1];
    this.items[idx] = last;
    this._indices.set(last, idx);
    this.items.pop();
    this._indices.delete(item);
    return true;
  }

  has(item: T): boolean {
    return this._indices.has(item);
  }

  get size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items.length = 0;
    this._indices.clear();
  }

  [Symbol.iterator](): Iterator<T> {
    return this.items[Symbol.iterator]();
  }
}
