import { CHARACTERS, CHAR_BY_ID, EYE_INDEX, SHAPE_INDEX, hexToRgb } from '../content/characters';
import { EMPTY, Grid, VOID } from '../sim/grid';
import type { Player, World } from '../sim/world';
import { buildAccessoryAtlas } from './accessories';
import { HEAD_FS, HEAD_VS, PARTICLE_FS, PARTICLE_VS, SMOOTH_FS, TERRAIN_FS, TERRAIN_VS, TRAIL_FS, TRAIL_VS } from './glsl';
import { PARTICLE_MAX, type Particles } from './particles';

export interface Camera {
  x: number;
  y: number;
  /** CSS pixels per cell. */
  zoom: number;
}

export interface FrameInfo {
  world: World;
  cam: Camera;
  /** Interpolation factor between the previous and current sim tick. */
  alpha: number;
  time: number;
  youId: number;
  particles: Particles;
}

/** Palette id reserved for rendering character cards. */
const CARD_ID = 252;
/** Super-sampling factor of the smoothed territory field (per cell). */
const FINE_K = 6;
export const HEAD_SIZE = 0.88;

type Prog = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };

function compile(gl: WebGL2RenderingContext, vs: string, fs: string, uniforms: string[]): Prog {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      throw new Error('Shader compile failed: ' + log);
    }
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link failed: ' + gl.getProgramInfoLog(p));
  const u: Prog['u'] = {};
  for (const n of uniforms) u[n] = gl.getUniformLocation(p, n);
  return { p, u };
}

interface GridTex {
  own: WebGLTexture;
  cap: WebGLTexture;
}

function easeOutBack(t: number): number {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  /** Device pixels. */
  width = 1;
  height = 1;
  pixelRatio = 1;

  private terrain: Prog;
  private smooth: Prog;
  private fineTex: WebGLTexture | null = null;
  private fineFB: WebGLFramebuffer | null = null;
  private fineAlloc: [number, number] = [0, 0];
  private trail: Prog;
  private head: Prog;
  private part: Prog;
  private quad: WebGLBuffer;
  private trailVAO: WebGLVertexArrayObject;
  private trailBuf: WebGLBuffer;
  private trailData = new Float32Array(6 * 4096);
  private headVAO: WebGLVertexArrayObject;
  private headBuf: WebGLBuffer;
  private headData = new Float32Array(10 * 256);
  private partVAO: WebGLVertexArrayObject;
  private partBuf: WebGLBuffer;
  private partData = new Float32Array(8 * PARTICLE_MAX);
  private palTex: WebGLTexture;
  private palData = new Float32Array(4 * 256 * 4);
  private palDirty = true;
  private palChar: string[] = new Array(256).fill('');
  private atlasTex: WebGLTexture;
  private atlasGrid: [number, number];
  private grids = new WeakMap<Grid, GridTex>();
  private rosterSeen = -1;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
      desynchronized: true,
      preserveDrawingBuffer: false,
      stencil: true,
    });
    if (!gl) throw new Error('WebGL2 is not available on this device.');
    this.gl = gl;

    const common = ['uPal', 'uCam', 'uScale', 'uRes', 'uTime'];
    this.terrain = compile(gl, TERRAIN_VS, TERRAIN_FS, [...common, 'uFine', 'uFineOrigin', 'uK', 'uFineSize', 'uCap', 'uGridSize']);
    this.smooth = compile(gl, TERRAIN_VS, SMOOTH_FS, ['uOwn', 'uGridSize', 'uOrigin', 'uK']);
    this.trail = compile(gl, TRAIL_VS, TRAIL_FS, [...common, 'uYou']);
    this.head = compile(gl, HEAD_VS, HEAD_FS, [...common, 'uAtlas', 'uAtlasGrid']);
    this.part = compile(gl, PARTICLE_VS, PARTICLE_FS, common);

    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const mkVAO = (layout: number[]): [WebGLVertexArrayObject, WebGLBuffer] => {
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      const stride = layout.reduce((a, b) => a + b, 0) * 4;
      let off = 0;
      layout.forEach((n, i) => {
        gl.enableVertexAttribArray(i + 1);
        gl.vertexAttribPointer(i + 1, n, gl.FLOAT, false, stride, off);
        gl.vertexAttribDivisor(i + 1, 1);
        off += n * 4;
      });
      gl.bindVertexArray(null);
      return [vao, buf];
    };
    [this.trailVAO, this.trailBuf] = mkVAO([4, 2]);
    [this.headVAO, this.headBuf] = mkVAO([4, 4, 2]);
    [this.partVAO, this.partBuf] = mkVAO([4, 4]);

    this.palTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    this.nearest();

    const atlas = buildAccessoryAtlas();
    this.atlasGrid = [atlas.cols, atlas.rows];
    this.atlasTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private nearest(): void {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  resize(cssW: number, cssH: number, pixelRatio: number): void {
    this.pixelRatio = pixelRatio;
    const w = Math.max(1, Math.round(cssW * pixelRatio));
    const h = Math.max(1, Math.round(cssH * pixelRatio));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.width = w;
    this.height = h;
  }

  setPalette(id: number, charId: string): void {
    if (this.palChar[id] === charId) return;
    this.palChar[id] = charId;
    const c = CHAR_BY_ID[charId] ?? CHARACTERS[0];
    const d = this.palData;
    const row = (r: number, v: number[]) => d.set(v, (id * 4 + r) * 4);
    row(0, [...hexToRgb(c.c1), 1]);
    row(1, [...hexToRgb(c.c2), 1]);
    row(2, [c.pattern, c.scale, SHAPE_INDEX[c.shape], EYE_INDEX[c.eyes]]);
    const accIdx = c.accessory === 'none' ? -1 : CHARACTERS.indexOf(c);
    row(3, [...hexToRgb(c.accent ?? c.c1), accIdx]);
    this.palDirty = true;
  }

  private syncPalette(world: World): void {
    if (world.rosterVersion !== this.rosterSeen) {
      this.rosterSeen = world.rosterVersion;
      for (const p of world.players) this.setPalette(p.id, p.loadout.charId);
    }
    this.flushPalette();
  }

  private flushPalette(): void {
    if (!this.palDirty) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4, 256, 0, gl.RGBA, gl.FLOAT, this.palData);
    this.palDirty = false;
  }

  private gridTex(grid: Grid): GridTex {
    let t = this.grids.get(grid);
    const gl = this.gl;
    if (!t) {
      const own = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, own);
      this.nearest();
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8UI, grid.w, grid.h);
      const cap = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, cap);
      this.nearest();
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R32F, grid.w, grid.h);
      t = { own, cap };
      this.grids.set(grid, t);
      grid.markAll();
    }
    const d = grid.dirty;
    if (d) {
      grid.dirty = null;
      const w = d.x1 - d.x0;
      const h = d.y1 - d.y0;
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, grid.w);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, d.x0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, d.y0);
      gl.bindTexture(gl.TEXTURE_2D, t.own);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, d.x0, d.y0, w, h, gl.RED_INTEGER, gl.UNSIGNED_BYTE, grid.owner);
      gl.bindTexture(gl.TEXTURE_2D, t.cap);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, d.x0, d.y0, w, h, gl.RED, gl.FLOAT, grid.capTime);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    }
    return t;
  }

  /** Free the GPU textures of a grid that will no longer be drawn. */
  release(grid: Grid): void {
    const t = this.grids.get(grid);
    if (!t) return;
    this.gl.deleteTexture(t.own);
    this.gl.deleteTexture(t.cap);
    this.grids.delete(grid);
  }

  private setCommon(pr: Prog, cam: Camera, time: number): void {
    const gl = this.gl;
    gl.useProgram(pr.p);
    gl.uniform2f(pr.u.uCam, cam.x, cam.y);
    gl.uniform1f(pr.u.uScale, cam.zoom * this.pixelRatio);
    gl.uniform2f(pr.u.uRes, this.width, this.height);
    gl.uniform1f(pr.u.uTime, time);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.uniform1i(pr.u.uPal, 0);
  }

  /** Ensure the fine (smoothed) field texture is at least w x h texels. */
  private ensureFine(w: number, h: number): void {
    const gl = this.gl;
    if (this.fineTex && w <= this.fineAlloc[0] && h <= this.fineAlloc[1]) return;
    const aw = Math.max(w, this.fineAlloc[0], 64) + 64;
    const ah = Math.max(h, this.fineAlloc[1], 64) + 64;
    if (this.fineTex) gl.deleteTexture(this.fineTex);
    if (this.fineFB) gl.deleteFramebuffer(this.fineFB);
    this.fineTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.fineTex);
    this.nearest();
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RG8UI, aw, ah);
    this.fineFB = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fineFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fineTex, 0);
    this.fineAlloc = [aw, ah];
  }

  private drawTerrain(grid: Grid, cam: Camera, time: number, target: WebGLFramebuffer | null): void {
    const gl = this.gl;
    const t = this.gridTex(grid);
    gl.disable(gl.BLEND);

    // 1) Smooth the visible window of the grid into the fine field.
    const scale = cam.zoom * this.pixelRatio;
    const halfW = this.width / scale / 2;
    const halfH = this.height / scale / 2;
    const ox = Math.floor(cam.x - halfW - 2);
    const oy = Math.floor(cam.y - halfH - 3);
    const fw = Math.ceil((cam.x + halfW + 2 - ox) * FINE_K);
    const fh = Math.ceil((cam.y + halfH + 2 - oy) * FINE_K);
    this.ensureFine(fw, fh);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fineFB);
    gl.viewport(0, 0, fw, fh);
    gl.useProgram(this.smooth.p);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, t.own);
    gl.uniform1i(this.smooth.u.uOwn, 1);
    gl.uniform2i(this.smooth.u.uGridSize, grid.w, grid.h);
    gl.uniform2f(this.smooth.u.uOrigin, ox, oy);
    gl.uniform1f(this.smooth.u.uK, FINE_K);
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2) Shade the terrain from the fine field.
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, this.width, this.height);
    this.setCommon(this.terrain, cam, time);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fineTex);
    gl.uniform1i(this.terrain.u.uFine, 1);
    gl.uniform2f(this.terrain.u.uFineOrigin, ox, oy);
    gl.uniform1f(this.terrain.u.uK, FINE_K);
    gl.uniform2i(this.terrain.u.uFineSize, fw, fh);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, t.cap);
    gl.uniform1i(this.terrain.u.uCap, 2);
    gl.uniform2i(this.terrain.u.uGridSize, grid.w, grid.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private drawHeads(n: number, cam: Camera, time: number): void {
    if (!n) return;
    const gl = this.gl;
    this.setCommon(this.head, cam, time);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.uniform1i(this.head.u.uAtlas, 1);
    gl.uniform2f(this.head.u.uAtlasGrid, this.atlasGrid[0], this.atlasGrid[1]);
    gl.bindVertexArray(this.headVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.headBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.headData.subarray(0, n * 10), gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  }

  /** Render one frame of a live world. */
  draw(f: FrameInfo): void {
    const gl = this.gl;
    const { world, cam, alpha, time } = f;
    this.syncPalette(world);
    this.drawTerrain(world.grid, cam, world.time, null);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // Visible world rect (with margin) for culling.
    const halfW = this.width / (cam.zoom * this.pixelRatio) / 2 + 4;
    const halfH = this.height / (cam.zoom * this.pixelRatio) / 2 + 4;
    const vis = (x: number, y: number, m = 0) => Math.abs(x - cam.x) < halfW + m && Math.abs(y - cam.y) < halfH + m;

    const lerp = (p: Player) => [p.px + (p.x - p.px) * alpha, p.py + (p.y - p.py) * alpha];

    // Trails. Stencil keeps one fragment per pixel so overlapping capsules
    // stay a single ribbon instead of stacking into ribs.
    let nt = 0;
    const pushSeg = (x0: number, y0: number, x1: number, y1: number, id: number, rad: number) => {
      if (nt * 6 >= this.trailData.length) {
        const bigger = new Float32Array(this.trailData.length * 2);
        bigger.set(this.trailData);
        this.trailData = bigger;
      }
      const d = this.trailData;
      const o = nt * 6;
      d[o] = x0;
      d[o + 1] = y0;
      d[o + 2] = x1;
      d[o + 3] = y1;
      d[o + 4] = id;
      d[o + 5] = rad;
      nt++;
    };
    const pushTrail = (p: Player) => {
      if (!p.alive || p.trailPts.length < 2) return;
      const pts = p.trailPts;
      const yours = p.id === f.youId;
      const rad = yours ? 0.72 : 0.5;
      for (let k = 0; k + 3 < pts.length; k += 2) {
        if (!vis(pts[k], pts[k + 1], 2) && !vis(pts[k + 2], pts[k + 3], 2)) continue;
        pushSeg(pts[k], pts[k + 1], pts[k + 2], pts[k + 3], p.id, rad);
      }
      const [hx, hy] = lerp(p);
      const dx = Math.cos(p.angle);
      const dy = Math.sin(p.angle);
      const lx = pts[pts.length - 2];
      const ly = pts[pts.length - 1];
      const nx = hx - dx * 0.42;
      const ny = hy - dy * 0.42;
      pushSeg(lx, ly, nx, ny, p.id, rad);
      pushSeg(nx, ny, hx + dx * 0.12, hy + dy * 0.12, p.id, yours ? rad * 0.92 : rad);
    };
    const flushTrails = () => {
      if (!nt) return;
      this.setCommon(this.trail, cam, world.time);
      gl.uniform1i(this.trail.u.uYou, f.youId);
      gl.bindVertexArray(this.trailVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.trailBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.trailData.subarray(0, nt * 6), gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nt);
      nt = 0;
    };
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0xff);
    gl.clear(gl.STENCIL_BUFFER_BIT);
    gl.stencilFunc(gl.NOTEQUAL, 1, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    for (const p of world.players) if (p.id !== f.youId) pushTrail(p);
    flushTrails();
    gl.clear(gl.STENCIL_BUFFER_BIT);
    const you = world.byId[f.youId];
    if (you) pushTrail(you);
    flushTrails();
    gl.disable(gl.STENCIL_TEST);

    // Heads, back to front.
    const heads = world.players.filter((p) => p.alive && vis(p.x, p.y, 3));
    heads.sort((a, b) => a.y - b.y);
    let nh = 0;
    for (const p of heads) {
      const [x, y] = lerp(p);
      const age = world.time - p.spawnTime;
      const pop = age < 0.4 ? Math.max(0.05, easeOutBack(age / 0.4)) : 1;
      const dashing = world.time < p.dashUntil;
      let flags = 0;
      if (world.time < p.shieldUntil) flags += 1;
      if (dashing) flags += 2;
      if (world.time < p.slowUntil) flags += 4;
      if (p.id === f.youId) flags += 8;
      const o = nh * 10;
      const d = this.headData;
      d[o] = x;
      d[o + 1] = y;
      d[o + 2] = HEAD_SIZE * pop * (p.tag === 'boss' ? 1.35 : 1);
      d[o + 3] = p.id;
      d[o + 4] = Math.cos(p.angle);
      d[o + 5] = Math.sin(p.angle);
      d[o + 6] = Math.max(-0.3, Math.min(0.3, p.turnVel * 0.045));
      d[o + 7] = flags;
      d[o + 8] = dashing ? 0.28 : 0;
      d[o + 9] = p.id * 1.7;
      nh++;
    }
    this.drawHeads(nh, cam, time);

    // Particles
    const np = f.particles.fill(this.partData);
    if (np) {
      this.setCommon(this.part, cam, time);
      gl.bindVertexArray(this.partVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.partData.subarray(0, np * 8), gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, np);
    }
    gl.bindVertexArray(null);
  }

  // ---------------------------------------------------------------- cards

  private cardGrid: Grid | null = null;

  /** Render a character "card" (their land + their blob) to a PNG data URL. */
  renderCard(charId: string, size: number, time = 1.2): string {
    const gl = this.gl;
    const N = 24;
    if (!this.cardGrid) {
      const g = new Grid(N, N);
      g.setTerrain((x, y) => {
        const dx = x + 0.5 - N / 2;
        const dy = y + 0.5 - N / 2 + 0.8;
        const d = Math.hypot(dx, dy);
        if (d > 10.5) return VOID;
        const blob = Math.hypot(dx * 1.05, (dy - 0.6) * 1.2) + 0.8 * Math.sin(Math.atan2(dy, dx) * 3);
        return blob < 7.2 ? CARD_ID : EMPTY;
      });
      this.cardGrid = g;
    }
    this.setPalette(CARD_ID, charId);
    this.flushPalette();

    const fb = gl.createFramebuffer()!;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, size, size);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

    const saved = { w: this.width, h: this.height, pr: this.pixelRatio };
    this.width = size;
    this.height = size;
    this.pixelRatio = 1;
    const cam: Camera = { x: N / 2, y: N / 2 + 0.6, zoom: size / 22 };
    this.drawTerrain(this.cardGrid, cam, time, fb);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const d = this.headData;
    d.set([N / 2, N / 2 - 0.4, 2.6, CARD_ID, 0.35, 0.5, 0, 0, 0, 0], 0);
    this.drawHeads(1, cam, time);

    const px = new Uint8Array(size * size * 4);
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    this.width = saved.w;
    this.height = saved.h;
    this.pixelRatio = saved.pr;

    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    const row = size * 4;
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * row, (size - y) * row), y * row);
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }
}
