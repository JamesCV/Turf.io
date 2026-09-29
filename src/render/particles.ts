import { hexToRgb } from '../content/characters';

const STRIDE = 13; // x y vx vy r life maxLife r g b shape drag gravity
const MAX = 3000;

export interface BurstOpts {
  count: number;
  colors: string[];
  speed: [number, number];
  size: [number, number];
  life: [number, number];
  square?: number; // probability of square shape
  drag?: number;
  gravity?: number;
  /** Emit from a ring of this radius instead of a point. */
  radius?: number;
}

export class Particles {
  readonly data = new Float32Array(MAX * STRIDE);
  count = 0;

  burst(x: number, y: number, o: BurstOpts): void {
    const rgb = o.colors.map(hexToRgb);
    for (let i = 0; i < o.count; i++) {
      if (this.count >= MAX) return;
      const a = Math.random() * Math.PI * 2;
      const sp = o.speed[0] + Math.random() * (o.speed[1] - o.speed[0]);
      const r0 = o.radius ?? 0;
      const k = this.count++ * STRIDE;
      const d = this.data;
      const c = rgb[(Math.random() * rgb.length) | 0];
      d[k] = x + Math.cos(a) * r0;
      d[k + 1] = y + Math.sin(a) * r0;
      d[k + 2] = Math.cos(a) * sp;
      d[k + 3] = Math.sin(a) * sp;
      d[k + 4] = o.size[0] + Math.random() * (o.size[1] - o.size[0]);
      const life = o.life[0] + Math.random() * (o.life[1] - o.life[0]);
      d[k + 5] = life;
      d[k + 6] = life;
      d[k + 7] = c[0];
      d[k + 8] = c[1];
      d[k + 9] = c[2];
      d[k + 10] = Math.random() < (o.square ?? 0) ? 1 : 0;
      d[k + 11] = o.drag ?? 3;
      d[k + 12] = o.gravity ?? 0;
    }
  }

  update(dt: number): void {
    const d = this.data;
    let w = 0;
    for (let i = 0; i < this.count; i++) {
      const k = i * STRIDE;
      const life = d[k + 5] - dt;
      if (life <= 0) continue;
      const drag = Math.exp(-d[k + 11] * dt);
      const vx = d[k + 2] * drag;
      const vy = d[k + 3] * drag + d[k + 12] * dt;
      const o = w * STRIDE;
      if (o !== k) d.copyWithin(o, k, k + STRIDE);
      d[o] += vx * dt;
      d[o + 1] += vy * dt;
      d[o + 2] = vx;
      d[o + 3] = vy;
      d[o + 5] = life;
      w++;
    }
    this.count = w;
  }

  /** Writes instance data (x y r alpha | r g b shape) and returns count. */
  fill(out: Float32Array): number {
    const d = this.data;
    for (let i = 0; i < this.count; i++) {
      const k = i * STRIDE;
      const o = i * 8;
      const t = d[k + 5] / d[k + 6];
      out[o] = d[k];
      out[o + 1] = d[k + 1];
      out[o + 2] = d[k + 4] * (0.4 + 0.6 * t);
      out[o + 3] = Math.min(1, t * 2);
      out[o + 4] = d[k + 7];
      out[o + 5] = d[k + 8];
      out[o + 6] = d[k + 9];
      out[o + 7] = d[k + 10];
    }
    return this.count;
  }
}

export const PARTICLE_MAX = MAX;
