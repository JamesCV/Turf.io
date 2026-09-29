/** Cell owner values. 0 = empty floor, 1..MAX_ID = player ids. */
export const EMPTY = 0;
export const MAX_ID = 250;
/** Raised obstacle block inside the arena. Never capturable. */
export const ROCK = 254;
/** Outside the arena. Never capturable, not walkable. */
export const VOID = 255;

export interface Rect {
  x0: number;
  y0: number;
  x1: number; // exclusive
  y1: number; // exclusive
}

/**
 * The arena grid: who owns each cell, whose trail is on it, and when it was
 * captured (for the capture ripple effect). Pure data, no DOM.
 */
export class Grid {
  readonly w: number;
  readonly h: number;
  readonly owner: Uint8Array;
  readonly trail: Uint8Array;
  /** Time (seconds) each cell was last captured; drives the flash ripple. */
  readonly capTime: Float32Array;
  /** Owned-cell count per owner id. */
  readonly counts = new Int32Array(256);
  /** Number of cells that can be owned (not VOID / ROCK). */
  playable = 0;
  /** Region changed since the renderer last uploaded. */
  dirty: Rect | null = null;

  // Scratch buffers for flood fill, reused to avoid allocations.
  private readonly stamp: Uint32Array;
  private gen = 1;
  private readonly queue: Int32Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.owner = new Uint8Array(n);
    this.trail = new Uint8Array(n);
    this.capTime = new Float32Array(n).fill(-100);
    this.stamp = new Uint32Array(n);
    this.queue = new Int32Array(n);
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  ownerAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return VOID;
    return this.owner[y * this.w + x];
  }

  walkable(x: number, y: number): boolean {
    const o = this.ownerAt(x, y);
    return o !== VOID && o !== ROCK;
  }

  /** Initialise terrain from a mask function (called once per map). */
  setTerrain(fn: (x: number, y: number) => number): void {
    this.counts.fill(0);
    this.playable = 0;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const v = fn(x, y);
        const i = y * this.w + x;
        this.owner[i] = v;
        this.trail[i] = 0;
        this.counts[v]++;
        if (v !== VOID && v !== ROCK) this.playable++;
      }
    }
    this.markAll();
  }

  setOwner(i: number, id: number): void {
    const old = this.owner[i];
    if (old === id) return;
    this.counts[old]--;
    this.counts[id]++;
    this.owner[i] = id;
    const x = i % this.w;
    const y = (i - x) / this.w;
    this.markDirty(x, y);
  }

  markDirty(x: number, y: number): void {
    const d = this.dirty;
    if (!d) {
      this.dirty = { x0: x, y0: y, x1: x + 1, y1: y + 1 };
      return;
    }
    if (x < d.x0) d.x0 = x;
    if (y < d.y0) d.y0 = y;
    if (x + 1 > d.x1) d.x1 = x + 1;
    if (y + 1 > d.y1) d.y1 = y + 1;
  }

  markAll(): void {
    this.dirty = { x0: 0, y0: 0, x1: this.w, y1: this.h };
  }

  /**
   * Find every cell enclosed by `id`'s territory within `box` and hand it to
   * `onCell`. Cells reachable from the box border without crossing `id`
   * cells are outside; everything else (except terrain) is enclosed.
   */
  floodEnclosed(id: number, box: Rect, onCell: (i: number) => void): void {
    const x0 = Math.max(0, box.x0 - 1);
    const y0 = Math.max(0, box.y0 - 1);
    const x1 = Math.min(this.w, box.x1 + 1);
    const y1 = Math.min(this.h, box.y1 + 1);
    const w = this.w;
    const owner = this.owner;
    const stamp = this.stamp;
    const q = this.queue;
    if (++this.gen === 0xffffffff) {
      stamp.fill(0);
      this.gen = 1;
    }
    const g = this.gen;
    let head = 0;
    let tail = 0;

    const seed = (x: number, y: number) => {
      const i = y * w + x;
      if (stamp[i] !== g && owner[i] !== id) {
        stamp[i] = g;
        q[tail++] = i;
      }
    };
    // Seed from the border of the (expanded) box. Cells touching the grid
    // edge are always outside.
    for (let x = x0; x < x1; x++) {
      seed(x, y0);
      seed(x, y1 - 1);
    }
    for (let y = y0; y < y1; y++) {
      seed(x0, y);
      seed(x1 - 1, y);
    }
    while (head < tail) {
      const i = q[head++];
      const x = i % w;
      const y = (i - x) / w;
      if (x > x0) {
        const j = i - 1;
        if (stamp[j] !== g && owner[j] !== id) { stamp[j] = g; q[tail++] = j; }
      }
      if (x < x1 - 1) {
        const j = i + 1;
        if (stamp[j] !== g && owner[j] !== id) { stamp[j] = g; q[tail++] = j; }
      }
      if (y > y0) {
        const j = i - w;
        if (stamp[j] !== g && owner[j] !== id) { stamp[j] = g; q[tail++] = j; }
      }
      if (y < y1 - 1) {
        const j = i + w;
        if (stamp[j] !== g && owner[j] !== id) { stamp[j] = g; q[tail++] = j; }
      }
    }
    for (let y = y0; y < y1; y++) {
      let i = y * w + x0;
      for (let x = x0; x < x1; x++, i++) {
        if (stamp[i] === g) continue;
        const o = owner[i];
        if (o === id || o === VOID || o === ROCK) continue;
        onCell(i);
      }
    }
  }
}
