import { EMPTY, ROCK, VOID } from './grid';
import { Rng } from './rng';

export type MapShape = 'circle' | 'square' | 'hexagon' | 'ring' | 'islands' | 'flower';

export interface MapSpec {
  shape: MapShape;
  /** Arena diameter in cells. */
  size: number;
  /** Number of rock clusters to scatter. */
  rocks: number;
  seed: number;
}

export interface BuiltMap {
  w: number;
  h: number;
  terrain: (x: number, y: number) => number;
}

const MARGIN = 6;

/** Signed-distance style "is inside the arena" tests, centred on (0,0). */
function insideShape(shape: MapShape, x: number, y: number, r: number): boolean {
  const d = Math.hypot(x, y);
  switch (shape) {
    case 'circle':
      return d <= r;
    case 'square': {
      // Rounded square
      const k = r * 0.86;
      const cr = r * 0.18;
      const qx = Math.max(Math.abs(x) - (k - cr), 0);
      const qy = Math.max(Math.abs(y) - (k - cr), 0);
      return Math.hypot(qx, qy) <= cr;
    }
    case 'hexagon': {
      const ax = Math.abs(x);
      const ay = Math.abs(y);
      return ay <= r * 0.866 && ax * 0.866 + ay * 0.5 <= r * 0.866;
    }
    case 'ring':
      return d <= r && d >= r * 0.3;
    case 'flower': {
      const a = Math.atan2(y, x);
      return d <= r * (0.82 + 0.18 * Math.cos(a * 5));
    }
    case 'islands': {
      // Four round islands joined by bridges to a central hub.
      const off = r * 0.52;
      const ir = r * 0.44;
      if (Math.hypot(x - off, y - off) <= ir) return true;
      if (Math.hypot(x + off, y - off) <= ir) return true;
      if (Math.hypot(x - off, y + off) <= ir) return true;
      if (Math.hypot(x + off, y + off) <= ir) return true;
      if (d <= r * 0.22) return true;
      const bw = r * 0.07;
      // Diagonal bridges from hub to each island, plus a ring road between islands.
      if (Math.abs(Math.abs(x) - Math.abs(y)) <= bw * 1.4 && d <= r) return true;
      if (Math.abs(x) <= bw && Math.abs(y) <= off) return true;
      if (Math.abs(y) <= bw && Math.abs(x) <= off) return true;
      return false;
    }
  }
}

export function buildMap(spec: MapSpec): BuiltMap {
  const r = spec.size / 2;
  const w = spec.size + MARGIN * 2;
  const h = w;
  const cx = w / 2;
  const cy = h / 2;
  const rng = new Rng(spec.seed);

  // Rock clusters: a few overlapping blobs each.
  const blobs: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < spec.rocks; i++) {
    for (let tries = 0; tries < 30; tries++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(r * 0.25, r * 0.8);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      if (!insideShape(spec.shape, x, y, r - 10)) continue;
      const n = rng.int(2, 4);
      for (let k = 0; k < n; k++) {
        blobs.push({ x: x + rng.range(-4, 4), y: y + rng.range(-4, 4), r: rng.range(2.2, 4.2) });
      }
      break;
    }
  }

  return {
    w,
    h,
    terrain: (gx, gy) => {
      const x = gx + 0.5 - cx;
      const y = gy + 0.5 - cy;
      if (!insideShape(spec.shape, x, y, r)) return VOID;
      for (const b of blobs) {
        const dx = x - b.x;
        const dy = y - b.y;
        if (dx * dx + dy * dy <= b.r * b.r) return ROCK;
      }
      return EMPTY;
    },
  };
}
