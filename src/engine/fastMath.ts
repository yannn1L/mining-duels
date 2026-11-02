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

// Initialize LUT immediately so deferred functions always have valid sin/cos
FastMath.init();

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
