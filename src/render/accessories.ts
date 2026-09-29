import { CHARACTERS, type Accessory, type CharacterDef } from '../content/characters';

export const ATLAS_CELL = 256;
export const ATLAS_COLS = 8;
/** Must match EXTENT in the head shader: the cell spans [-EXTENT, EXTENT] body units. */
const EXTENT = 1.9;
const INK = '#1c1a2e';

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

type Ctx = CanvasRenderingContext2D;

/** Rounded-rect path (ctx.roundRect is Safari 16+, we support iOS 15). */
function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function outline(ctx: Ctx, fill: string, w = 0.06): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = w;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function leafShape(ctx: Ctx, x: number, y: number, len: number, ang: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.45, len, 0);
  ctx.quadraticCurveTo(len * 0.5, len * 0.45, 0, 0);
  outline(ctx, color, 0.05);
  ctx.beginPath();
  ctx.moveTo(0.05, 0);
  ctx.lineTo(len * 0.8, 0);
  ctx.strokeStyle = shade(color, -0.35);
  ctx.lineWidth = 0.035;
  ctx.stroke();
  ctx.restore();
}

function drawAccessory(ctx: Ctx, a: Accessory, c: CharacterDef): void {
  const acc = c.accent ?? c.c1;
  ctx.lineCap = 'round';
  switch (a) {
    case 'none':
      return;
    case 'sprout': {
      ctx.beginPath();
      ctx.moveTo(0, -0.9);
      ctx.quadraticCurveTo(0.05, -1.15, 0, -1.3);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.12;
      ctx.stroke();
      ctx.strokeStyle = shade(acc, -0.2);
      ctx.lineWidth = 0.06;
      ctx.stroke();
      leafShape(ctx, 0, -1.28, 0.5, -0.5, acc);
      leafShape(ctx, 0, -1.28, 0.42, Math.PI + 0.55, shade(acc, 0.15));
      return;
    }
    case 'leaf': {
      ctx.beginPath();
      ctx.moveTo(0.05, -0.9);
      ctx.lineTo(0.08, -1.18);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.1;
      ctx.stroke();
      leafShape(ctx, 0.08, -1.15, 0.55, -0.35, acc);
      return;
    }
    case 'foxEars':
    case 'catEars': {
      const tall = a === 'foxEars' ? 0.75 : 0.5;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 0.2, -0.82);
        ctx.lineTo(s * 0.62, -0.82 - tall);
        ctx.lineTo(s * 0.88, -0.62);
        ctx.closePath();
        outline(ctx, acc);
        ctx.beginPath();
        ctx.moveTo(s * 0.36, -0.84);
        ctx.lineTo(s * 0.6, -0.82 - tall * 0.62);
        ctx.lineTo(s * 0.74, -0.72);
        ctx.closePath();
        ctx.fillStyle = a === 'foxEars' ? '#fff4ea' : '#ffb3c7';
        ctx.fill();
      }
      return;
    }
    case 'antennae': {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 0.28, -0.88);
        ctx.quadraticCurveTo(s * 0.3, -1.35, s * 0.62, -1.5);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 0.08;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s * 0.64, -1.52, 0.14, 0, Math.PI * 2);
        outline(ctx, acc === INK ? c.c2 : acc, 0.05);
      }
      return;
    }
    case 'bow': {
      ctx.save();
      ctx.translate(0.52, -0.86);
      ctx.rotate(0.35);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(s * 0.35, -0.38, s * 0.48, -0.08);
        ctx.quadraticCurveTo(s * 0.46, 0.26, 0, 0);
        outline(ctx, acc, 0.05);
      }
      ctx.beginPath();
      ctx.arc(0, 0, 0.11, 0, Math.PI * 2);
      outline(ctx, shade(acc, -0.2), 0.05);
      ctx.restore();
      return;
    }
    case 'beanie': {
      ctx.beginPath();
      ctx.moveTo(-0.96, -0.46);
      ctx.bezierCurveTo(-0.96, -1.35, 0.96, -1.35, 0.96, -0.46);
      ctx.closePath();
      outline(ctx, acc);
      // Knit ribs
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = shade(acc, 0.18);
      ctx.lineWidth = 0.05;
      for (let x = -0.9; x <= 0.9; x += 0.18) {
        ctx.beginPath();
        ctx.moveTo(x, -0.5);
        ctx.lineTo(x * 0.8, -1.3);
        ctx.stroke();
      }
      ctx.restore();
      ctx.beginPath();
      rrect(ctx, -1.0, -0.62, 2.0, 0.24, 0.1);
      outline(ctx, shade(c.c1, -0.05));
      ctx.beginPath();
      ctx.arc(0, -1.22, 0.2, 0, Math.PI * 2);
      outline(ctx, '#ffffff');
      return;
    }
    case 'mane': {
      ctx.beginPath();
      const n = 7;
      ctx.moveTo(-0.85, -0.7);
      for (let i = 0; i <= n; i++) {
        const x = -0.85 + (1.7 * i) / n;
        const peak = -1.2 - 0.12 * Math.sin(i * 1.3);
        if (i < n) ctx.lineTo(x + 1.7 / n / 2, peak);
        ctx.lineTo(x + 1.7 / n, -0.78);
      }
      ctx.closePath();
      outline(ctx, acc);
      return;
    }
    case 'hardhat': {
      ctx.beginPath();
      ctx.moveTo(-0.82, -0.62);
      ctx.bezierCurveTo(-0.82, -1.38, 0.82, -1.38, 0.82, -0.62);
      ctx.closePath();
      outline(ctx, acc);
      ctx.beginPath();
      rrect(ctx, -1.08, -0.7, 2.16, 0.18, 0.08);
      outline(ctx, shade(acc, -0.12));
      ctx.beginPath();
      rrect(ctx, -0.1, -1.24, 0.2, 0.56, 0.08);
      ctx.fillStyle = shade(acc, 0.35);
      ctx.fill();
      return;
    }
    case 'partyHat': {
      ctx.save();
      ctx.translate(0.2, -0.86);
      ctx.rotate(0.25);
      ctx.beginPath();
      ctx.moveTo(-0.42, 0);
      ctx.lineTo(0, -0.95);
      ctx.lineTo(0.42, 0);
      ctx.closePath();
      ctx.save();
      outline(ctx, acc);
      ctx.clip();
      const stripes = ['#ffd23f', '#ff4d6d', '#06d6a0'];
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(-0.6, -0.16 - i * 0.2);
        ctx.lineTo(0.6, -0.3 - i * 0.2);
        ctx.strokeStyle = stripes[i % 3];
        ctx.lineWidth = 0.07;
        ctx.stroke();
      }
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(-0.42, 0);
      ctx.lineTo(0, -0.95);
      ctx.lineTo(0.42, 0);
      ctx.closePath();
      ctx.lineWidth = 0.06;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -0.98, 0.14, 0, Math.PI * 2);
      outline(ctx, '#ffd23f', 0.05);
      ctx.restore();
      return;
    }
    case 'flame': {
      const g = ctx.createLinearGradient(0, -0.7, 0, -1.75);
      g.addColorStop(0, '#ff3d00');
      g.addColorStop(0.55, '#ffb000');
      g.addColorStop(1, '#fff3a0');
      ctx.beginPath();
      ctx.moveTo(-0.62, -0.78);
      ctx.bezierCurveTo(-0.8, -1.2, -0.3, -1.3, -0.35, -1.62);
      ctx.bezierCurveTo(-0.05, -1.4, 0.0, -1.25, 0.05, -1.35);
      ctx.bezierCurveTo(0.1, -1.55, 0.25, -1.7, 0.2, -1.82);
      ctx.bezierCurveTo(0.6, -1.5, 0.75, -1.15, 0.62, -0.78);
      ctx.closePath();
      outline(ctx, '#ff6a00', 0.06);
      ctx.fillStyle = g;
      ctx.fill();
      return;
    }
    case 'crown': {
      ctx.beginPath();
      ctx.moveTo(-0.62, -0.8);
      ctx.lineTo(-0.7, -1.38);
      ctx.lineTo(-0.35, -1.1);
      ctx.lineTo(0, -1.5);
      ctx.lineTo(0.35, -1.1);
      ctx.lineTo(0.7, -1.38);
      ctx.lineTo(0.62, -0.8);
      ctx.closePath();
      outline(ctx, acc);
      const gems = ['#ff4d6d', '#3a86ff', '#06d6a0'];
      [-0.36, 0, 0.36].forEach((x, i) => {
        ctx.beginPath();
        ctx.arc(x, -0.96, 0.08, 0, Math.PI * 2);
        ctx.fillStyle = gems[i];
        ctx.fill();
      });
      for (const [x, y] of [[-0.7, -1.38], [0, -1.5], [0.7, -1.38]]) {
        ctx.beginPath();
        ctx.arc(x, y, 0.08, 0, Math.PI * 2);
        outline(ctx, '#fff3b0', 0.04);
      }
      return;
    }
    case 'halo': {
      ctx.beginPath();
      ctx.ellipse(0, -1.34, 0.62, 0.18, 0, 0, Math.PI * 2);
      ctx.lineWidth = 0.2;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = 0.12;
      ctx.strokeStyle = acc;
      ctx.stroke();
      ctx.lineWidth = 0.04;
      ctx.strokeStyle = '#fffbe0';
      ctx.stroke();
      return;
    }
    case 'horns': {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 0.35, -0.84);
        ctx.quadraticCurveTo(s * 0.45, -1.3, s * 0.85, -1.42);
        ctx.quadraticCurveTo(s * 0.72, -1.1, s * 0.72, -0.76);
        ctx.closePath();
        outline(ctx, acc);
      }
      return;
    }
    case 'shades': {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        rrect(ctx, s * 0.34 - 0.3, -0.34, 0.6, 0.38, 0.14);
        ctx.fillStyle = acc;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * 0.34 - 0.16, -0.26);
        ctx.lineTo(s * 0.34 - 0.02, -0.26);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 0.06;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-0.06, -0.2);
      ctx.lineTo(0.06, -0.2);
      ctx.strokeStyle = acc;
      ctx.lineWidth = 0.08;
      ctx.stroke();
      return;
    }
    case 'fin': {
      ctx.beginPath();
      ctx.moveTo(-0.35, -0.86);
      ctx.quadraticCurveTo(0.05, -1.25, 0.2, -1.6);
      ctx.quadraticCurveTo(0.35, -1.1, 0.45, -0.86);
      ctx.closePath();
      outline(ctx, acc);
      return;
    }
    case 'icicles': {
      const xs = [-0.6, -0.3, 0, 0.3, 0.6];
      xs.forEach((x, i) => {
        const h = i % 2 === 0 ? 0.55 : 0.38;
        ctx.beginPath();
        ctx.moveTo(x - 0.14, -0.84);
        ctx.lineTo(x, -0.84 - h);
        ctx.lineTo(x + 0.14, -0.84);
        ctx.closePath();
        outline(ctx, i % 2 ? '#bfe9ff' : acc, 0.05);
      });
      return;
    }
  }
}

/** Draws every character's accessory into a grid atlas. Index = position in CHARACTERS. */
export function buildAccessoryAtlas(): { canvas: HTMLCanvasElement; cols: number; rows: number } {
  const cols = ATLAS_COLS;
  const rows = Math.ceil(CHARACTERS.length / cols);
  const canvas = document.createElement('canvas');
  canvas.width = cols * ATLAS_CELL;
  canvas.height = rows * ATLAS_CELL;
  const ctx = canvas.getContext('2d')!;
  CHARACTERS.forEach((c, i) => {
    ctx.save();
    ctx.translate((i % cols) * ATLAS_CELL + ATLAS_CELL / 2, Math.floor(i / cols) * ATLAS_CELL + ATLAS_CELL / 2);
    const s = ATLAS_CELL / 2 / EXTENT;
    ctx.scale(s, s);
    drawAccessory(ctx, c.accessory, c);
    ctx.restore();
  });
  return { canvas, cols, rows };
}
