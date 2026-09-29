/**
 * All shaders. The big idea: the territory is ONE full-screen pass that reads
 * a tiny texture of cell owners and reconstructs smooth, anti-aliased, raised
 * "slabs" with a procedural pattern per owner. Nothing is a bitmap, so it is
 * crisp at any device pixel ratio.
 */

const HEADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
precision highp sampler2D;
`;

/** Palette: 4 x 256 RGBA32F. Row (x) 0 = c1, 1 = c2, 2 = (pattern, scale, shape, eyes), 3 = (accent.rgb, atlas). */
const PALETTE = /* glsl */ `
uniform sampler2D uPal;
vec4 palRow(int id, int row) { return texelFetch(uPal, ivec2(row, id), 0); }
`;

const PATTERNS = /* glsl */ `
const float PI = 3.14159265;
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 hash22(vec2 p) { float n = hash21(p); return vec2(n, hash21(p + n + 17.17)); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
vec3 hsv2rgb(vec3 c) { vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y); }
/** 1 where d < halfw (a band around a centre line), anti-aliased over px. */
float band(float d, float halfw, float px) { return 1.0 - smoothstep(halfw - px, halfw + px, d); }
/** 1 inside a signed distance field. */
float fillSDF(float d, float px) { return 1.0 - smoothstep(-px, px, d); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float dot2(vec2 v) { return dot(v, v); }
float sdHeart(vec2 p) {
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
  return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}
float sdStar5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0, 1);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
vec3 confettiColor(float h) {
  int i = int(floor(fract(h * 7.13) * 5.0));
  if (i == 0) return vec3(1.0, 0.30, 0.43);
  if (i == 1) return vec3(0.23, 0.53, 1.0);
  if (i == 2) return vec3(1.0, 0.75, 0.04);
  if (i == 3) return vec3(0.02, 0.84, 0.63);
  return vec3(0.51, 0.22, 0.93);
}

/** Pattern colour at p (in pattern units). px = size of one pixel in pattern units. */
vec3 patternColor(int pat, vec2 p, vec3 c1, vec3 c2, float t, float px) {
  px = clamp(px, 0.002, 0.5);
  if (pat == 1) { // diagonal stripes
    float d = abs(fract((p.x + p.y) * 0.70710678) - 0.5);
    return mix(c1, c2, band(d, 0.2, px));
  }
  if (pat == 2) { // polka dots
    vec2 q = p; q.x += mod(floor(q.y), 2.0) * 0.5;
    float d = length(fract(q) - 0.5);
    return mix(c1, c2, band(d, 0.25, px));
  }
  if (pat == 3) { // checker (rotated 45deg for a diamond look)
    vec2 q = rot(0.785398) * p * 1.41421356;
    float s = sin(q.x * PI) * sin(q.y * PI);
    return mix(c1, mix(c1, c2, 0.8), smoothstep(-PI * px * 1.4, PI * px * 1.4, s));
  }
  if (pat == 4) { // waves
    float u = p.y + 0.22 * sin(p.x * PI + t * 1.6);
    float d = abs(fract(u) - 0.5);
    return mix(c1, c2, band(d, 0.19, px * 1.2));
  }
  if (pat == 5) { // honeycomb
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 ag = abs(gv);
    float hd = max(dot(ag, normalize(r)), ag.x);
    vec3 fill = mix(c1 * 1.08, c1 * 0.9, smoothstep(0.0, 0.5, hd));
    return mix(fill, c2, band(0.5 - hd, 0.055, px));
  }
  if (pat == 6) { // chevron
    float u = p.y + abs(fract(p.x) - 0.5) * 1.1;
    float d = abs(fract(u) - 0.5);
    return mix(c1, c2, band(d, 0.19, px * 1.5));
  }
  if (pat == 7) { // fish scales
    vec2 q = vec2(p.x, p.y * 1.3);
    float off = mod(floor(q.y), 2.0) * 0.5;
    vec2 f = vec2(fract(q.x + off) - 0.5, fract(q.y));
    float d = length(f);
    vec3 inner = mix(c1 * 1.12, c1 * 0.86, clamp(d / 0.62, 0.0, 1.0));
    return mix(inner, c2, band(abs(d - 0.6), 0.06, px * 1.3));
  }
  if (pat == 8) { // twinkling stars on a night sky
    vec3 col = c1 + c2 * 0.08 * vnoise(p * 0.6);
    vec2 g = floor(p); vec2 f = fract(p) - 0.5;
    float h = hash21(g);
    vec2 o = (hash22(g + 3.3) - 0.5) * 0.4;
    float tw = 0.7 + 0.3 * sin(t * 2.6 + h * 40.0);
    float r = (0.12 + 0.16 * h) * tw;
    float sd = sdStar5(rot(h * 6.0 + t * 0.2) * (vec2(f.x, -f.y) - o), r, 0.45);
    vec3 sc = mix(c2, vec3(1.0, 0.95, 0.7), step(0.6, h));
    col = mix(col, sc, fillSDF(sd, px));
    float dust = fillSDF(length(fract(p * 2.3 + 0.37) - 0.5) - 0.035, px * 2.3);
    return mix(col, c2, dust * step(0.55, hash21(floor(p * 2.3 + 0.37))) * 0.8);
  }
  if (pat == 9) { // hearts
    vec2 q = p; q.x += mod(floor(q.y), 2.0) * 0.5;
    vec2 f = fract(q) - 0.5;
    vec2 hp = (vec2(f.x, -f.y) + vec2(0.0, 0.3)) / 0.6;
    float d = sdHeart(hp) * 0.6;
    return mix(c1, c2, fillSDF(d, px));
  }
  if (pat == 10) { // plaid / tartan
    float bx = band(abs(fract(p.x) - 0.5), 0.2, px);
    float by = band(abs(fract(p.y) - 0.5), 0.2, px);
    float tx = band(abs(fract(p.x * 2.0 + 0.25) - 0.5), 0.05, px * 2.0);
    float ty = band(abs(fract(p.y * 2.0 + 0.25) - 0.5), 0.05, px * 2.0);
    vec3 col = c1;
    col = mix(col, c2, bx * 0.55);
    col = mix(col, c2, by * 0.55);
    col = mix(col, mix(c1, vec3(1.0), 0.55), max(tx, ty) * 0.6);
    return col;
  }
  if (pat == 11) { // bricks
    vec2 q = p * vec2(1.0, 2.0);
    q.x += mod(floor(q.y), 2.0) * 0.5;
    vec2 f = fract(q);
    float d = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y) * 0.5);
    vec3 brick = c1 * (0.9 + 0.16 * hash21(floor(q)));
    return mix(brick, c2, band(d, 0.04, px));
  }
  if (pat == 12) { // confetti
    vec3 col = c1;
    vec2 q = p * 1.3;
    vec2 g = floor(q); vec2 f = fract(q) - 0.5;
    float h = hash21(g);
    if (h > 0.2) {
      vec2 o = (hash22(g + 7.0) - 0.5) * 0.4;
      vec2 lq = rot(h * 6.283 + t * (h - 0.5)) * (f - o);
      float d = h > 0.6 ? sdBox(lq, vec2(0.2, 0.07)) - 0.02 : length(lq) - 0.11;
      col = mix(col, confettiColor(h), fillSDF(d / 1.3, px));
    }
    return col;
  }
  if (pat == 13) { // prism: flowing rainbow
    float hue = fract((p.x + p.y) * 0.055 + t * 0.06);
    vec3 base = hsv2rgb(vec3(hue, 0.6, 1.0));
    float d = abs(fract((p.x - p.y) * 0.70710678) - 0.5);
    return mix(base, mix(base, vec3(1.0), 0.5), band(d, 0.12, px));
  }
  if (pat == 14) { // zebra / tiger
    float n = vnoise(p * 0.45) * 1.6 + vnoise(p * 1.1 + 3.0) * 0.4;
    float u = p.x * 0.55 + p.y * 0.2 + n;
    float d = abs(fract(u) - 0.5);
    float w = 0.12 + 0.13 * vnoise(p * 0.8 + 5.0);
    return mix(c1, c2, band(d, w, px * 0.9));
  }
  if (pat == 15) { // circuit board
    vec3 col = c1 + c2 * 0.05;
    vec2 g = floor(p); vec2 f = fract(p);
    float h = hash21(g);
    float d = h < 0.5 ? abs(f.y - 0.5) : abs(f.x - 0.5);
    float along = h < 0.5 ? p.x : p.y;
    float line = band(d, 0.045, px);
    float padD = length(f - 0.5) - 0.12;
    float pad = fillSDF(padD, px) * step(0.62, hash21(g + 9.0));
    float pulse = 0.5 + 0.5 * sin(along * 1.3 - t * 4.0 + h * 10.0);
    vec3 neon = c2 * (0.55 + 0.9 * pulse * pulse);
    col = mix(col, neon, max(line, pad));
    col += c2 * 0.14 * (1.0 - smoothstep(0.04, 0.3, min(d, padD)));
    return col;
  }
  if (pat == 16) { // rising bubbles
    vec3 col = c1;
    vec2 q = p;
    q.y += t * (0.3 + 0.25 * hash21(vec2(floor(q.x), 1.0)));
    vec2 g = floor(q); vec2 f = fract(q) - 0.5;
    float h = hash21(g);
    float r = 0.1 + 0.2 * h;
    vec2 o = (hash22(g) - 0.5) * (0.8 - 2.0 * r);
    float d = length(f - o) - r;
    col = mix(col, mix(c1, c2, 0.3), fillSDF(d, px) * 0.7);
    col = mix(col, c2, band(abs(d + 0.025), 0.03, px));
    float hl = fillSDF(length(f - o + r * vec2(0.38)) - r * 0.26, px);
    return mix(col, vec3(1.0), hl * 0.9);
  }
  if (pat == 17) { // crystal shards
    vec2 g = floor(p); vec2 f = fract(p);
    float tri = step(f.x, f.y);
    float h = hash21(g + tri * 7.0);
    vec3 col = mix(c1, c2, h * 0.6);
    float d = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    d = min(d, abs(f.x - f.y) * 0.70710678);
    return mix(col, mix(c1, vec3(1.0), 0.45), band(d, 0.025, px));
  }
  if (pat == 18) { // flames
    float n = vnoise(vec2(p.x * 1.1, p.y * 0.5 + t * 1.4)) * 1.2 + vnoise(p * 2.2 + vec2(0.0, t * 2.0)) * 0.35;
    float u = fract(p.y * 0.55 + n + t * 0.6);
    vec3 col = mix(c1, c2, smoothstep(0.3, 0.92, u));
    col = mix(col, vec3(1.0, 0.97, 0.75), smoothstep(0.88, 0.97, u) * 0.7);
    return mix(col, c1, smoothstep(0.965, 1.0, u));
  }
  // solid with a soft sheen
  return mix(c1, c2, 0.08 * (0.5 + 0.5 * sin((p.x + p.y) * 0.8)));
}

vec3 ownerPattern(int id, vec2 world, float t, float pxWorld) {
  vec4 prm = palRow(id, 2);
  float sc = max(prm.y, 0.5);
  return patternColor(int(prm.x + 0.5), world / sc, palRow(id, 0).rgb, palRow(id, 1).rgb, t, pxWorld / sc);
}
`;

const FULLSCREEN_VS = /* glsl */ `${HEADER}
const vec2 V[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(V[gl_VertexID], 0.0, 1.0); }
`;

export const TERRAIN_VS = FULLSCREEN_VS;

/**
 * Pre-pass: re-sample the coarse owner grid at K x resolution (only the visible
 * window) using a cubic B-spline majority vote. Output: (owner, winning weight).
 * This turns blocky cell staircases into smooth, organic contours.
 */
export const SMOOTH_FS = /* glsl */ `${HEADER}
uniform usampler2D uOwn;
uniform ivec2 uGridSize;
uniform vec2 uOrigin;
uniform float uK;
layout(location = 0) out uvec4 outOwn;

int own(ivec2 c) {
  if (c.x < 0 || c.y < 0 || c.x >= uGridSize.x || c.y >= uGridSize.y) return 255;
  return int(texelFetch(uOwn, c, 0).r);
}
vec4 bspline(float f) {
  float f2 = f * f; float f3 = f2 * f;
  return vec4((1.0 - f) * (1.0 - f) * (1.0 - f), 3.0 * f3 - 6.0 * f2 + 4.0, -3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0, f3) / 6.0;
}
void main() {
  vec2 q = uOrigin + gl_FragCoord.xy / uK;
  vec2 g = q - 0.5;
  vec2 b = floor(g);
  vec2 f = g - b;
  ivec2 base = ivec2(b) - 1;
  vec4 wx = bspline(f.x);
  vec4 wy = bspline(f.y);
  int ids[16];
  float ws[16];
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      ids[j * 4 + i] = own(base + ivec2(i, j));
      ws[j * 4 + i] = wx[i] * wy[j];
    }
  }
  int best = ids[5];
  float bw = -1.0;
  for (int k = 0; k < 16; k++) {
    int id = ids[k];
    bool seen = false;
    for (int m = 0; m < k; m++) seen = seen || ids[m] == id;
    if (seen) continue;
    float sum = 0.0;
    for (int m = k; m < 16; m++) sum += ids[m] == id ? ws[m] : 0.0;
    if (sum > bw) { bw = sum; best = id; }
  }
  outOwn = uvec4(uint(best), uint(clamp(bw, 0.0, 1.0) * 255.0 + 0.5), 0u, 0u);
}
`;

export const TERRAIN_FS = /* glsl */ `${HEADER}
${PALETTE}
${PATTERNS}
uniform usampler2D uFine;   // (owner, weight) at K x resolution
uniform vec2 uFineOrigin;
uniform float uK;
uniform ivec2 uFineSize;
uniform sampler2D uCap;
uniform ivec2 uGridSize;
uniform vec2 uCam;
uniform float uScale;   // device pixels per cell
uniform vec2 uRes;      // device pixels
uniform float uTime;
out vec4 outColor;

const int ROCK = 254;
const int VOIDC = 255;
const float H_TERR = 0.42;
const float H_FLOOR = 1.5;
const float H_ROCK = 1.1;

struct S4 { ivec4 o; vec4 g; vec4 w; };

S4 sample4(vec2 p) {
  vec2 g = (p - uFineOrigin) * uK - 0.5;
  vec2 fl = floor(g);
  ivec2 i = ivec2(fl);
  vec2 f = g - fl;
  S4 s;
  ivec2 c[4] = ivec2[4](i, i + ivec2(1, 0), i + ivec2(0, 1), i + ivec2(1, 1));
  for (int k = 0; k < 4; k++) {
    ivec2 cc = clamp(c[k], ivec2(0), uFineSize - 1);
    uvec2 t = texelFetch(uFine, cc, 0).rg;
    s.o[k] = int(t.r);
    s.g[k] = float(t.g) / 255.0;
  }
  s.w = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
  return s;
}
/** Smooth "share" of owner id at this point (~B-spline weight). */
float dOf(S4 s, int id) {
  vec4 m = vec4(equal(s.o, ivec4(id)));
  return dot(s.w, mix(1.0 - s.g, s.g, m));
}
/** Signed margin of id over its strongest competitor: > 0 means id owns this point. */
float margin(S4 s, int id) {
  float d = dOf(s, id);
  float other = 0.0;
  for (int k = 0; k < 4; k++) {
    int o = s.o[k];
    if (o != id) other = max(other, dOf(s, o));
  }
  if (other == 0.0) other = 1.0 - d;
  return d - other;
}
bool isTerr(int id) { return id > 0 && id < ROCK; }

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 p = uCam + (frag - uRes * 0.5) / uScale;
  float px = 1.0 / uScale;           // one device pixel in cells
  float aa = max(px * 0.85, 0.004);  // margin changes ~1.1 per cell
  #define EDGE(m) smoothstep(-aa, aa, m)

  // Void: deep, softly lit backdrop with drifting glow dots.
  vec2 sp = frag / uRes;
  vec3 col = mix(vec3(0.075, 0.07, 0.17), vec3(0.16, 0.11, 0.3), sp.y * 0.8 + 0.2 * sin(uTime * 0.2 + sp.x * 3.0));
  vec2 dp = p * 0.12 + vec2(uTime * 0.05, 0.0);
  float glow = 1.0 - smoothstep(0.0, 0.16, length(fract(dp) - 0.5));
  col += vec3(0.25, 0.2, 0.55) * glow * 0.25 * step(0.5, hash21(floor(dp)));

  S4 s0 = sample4(p);
  S4 sT = sample4(p - vec2(0.0, H_TERR));
  S4 sS = sample4(p - vec2(-0.25, H_TERR + 0.45));
  S4 sF = sample4(p - vec2(0.0, H_FLOOR));

  // Floor platform: side then top.
  float fTop = 1.0 - EDGE(margin(s0, VOIDC));
  float fSide = 1.0 - EDGE(margin(sF, VOIDC));
  col = mix(col, vec3(0.5, 0.46, 0.74), fSide * (1.0 - fTop));
  vec3 floorC = vec3(0.965, 0.955, 0.985);
  vec2 gd = fract(p * 0.5) - 0.5;
  floorC = mix(floorC, vec3(0.87, 0.85, 0.95), fillSDF(length(gd) - 0.06, px * 0.5));
  col = mix(col, floorC, fTop);

  // Soft drop shadow of territory slabs onto the floor.
  float shadow = 0.0;
  for (int k = 0; k < 4; k++) {
    int o = sS.o[k];
    if (isTerr(o)) shadow = max(shadow, smoothstep(-0.25, 0.25, margin(sS, o)));
  }
  col *= 1.0 - shadow * 0.17 * fTop;

  // Territory side faces.
  for (int k = 0; k < 4; k++) {
    int o = sT.o[k];
    if (!isTerr(o)) continue;
    bool dup = false;
    for (int m = 0; m < k; m++) dup = dup || sT.o[m] == o;
    if (dup) continue;
    float a = EDGE(margin(sT, o));
    if (a > 0.0) col = mix(col, palRow(o, 0).rgb * 0.64, a);
  }

  // Capture ripple (bilinear over the four nearest cells so it is smooth too).
  vec2 cg = p - 0.5;
  ivec2 ci = ivec2(floor(cg));
  vec2 cf = cg - floor(cg);
  vec4 caps = vec4(
    texelFetch(uCap, clamp(ci, ivec2(0), uGridSize - 1), 0).r,
    texelFetch(uCap, clamp(ci + ivec2(1, 0), ivec2(0), uGridSize - 1), 0).r,
    texelFetch(uCap, clamp(ci + ivec2(0, 1), ivec2(0), uGridSize - 1), 0).r,
    texelFetch(uCap, clamp(ci + ivec2(1, 1), ivec2(0), uGridSize - 1), 0).r);
  vec4 since = uTime - caps;
  vec4 fl4 = mix(vec4(0.0), exp(-since * 4.0), step(0.0, since));
  float flash = mix(mix(fl4.x, fl4.y, cf.x), mix(fl4.z, fl4.w, cf.x), cf.y);

  // Territory tops.
  for (int k = 0; k < 4; k++) {
    int o = s0.o[k];
    if (!isTerr(o)) continue;
    bool dup = false;
    for (int m = 0; m < k; m++) dup = dup || s0.o[m] == o;
    if (dup) continue;
    float mg = margin(s0, o);
    float a = EDGE(mg);
    if (a <= 0.0) continue;
    vec3 base = palRow(o, 0).rgb;
    vec3 top = ownerPattern(o, p, uTime, px);
    // Gentle bevel: slightly lifted just inside the rim.
    top *= 0.96 + 0.07 * smoothstep(0.05, 0.5, mg);
    // Crisp darker rim.
    float rim = 1.0 - smoothstep(0.07 - aa, 0.07 + aa, mg);
    top = mix(top, base * 0.7, rim * 0.6);
    top = mix(top, vec3(1.0), flash * 0.6);
    col = mix(col, top, a);
  }

  // Rocks: tall blocks that sit above everything.
  S4 sR = sample4(p - vec2(0.0, H_ROCK));
  float rTop = EDGE(margin(s0, ROCK));
  float rSide = EDGE(margin(sR, ROCK));
  col = mix(col, vec3(0.3, 0.29, 0.52), rSide * (1.0 - rTop));
  float rm = margin(s0, ROCK);
  vec3 rockTop = mix(vec3(0.47, 0.46, 0.74), vec3(0.57, 0.56, 0.86), vnoise(p * 0.7));
  rockTop = mix(rockTop, vec3(0.36, 0.35, 0.62), 1.0 - smoothstep(0.05, 0.15, rm));
  col = mix(col, rockTop, rTop);

  outColor = vec4(col, 1.0);
}
`;

const CAMERA = /* glsl */ `
uniform vec2 uCam;
uniform float uScale;
uniform vec2 uRes;
vec4 toClip(vec2 w) {
  vec2 s = (w - uCam) * uScale / (uRes * 0.5);
  return vec4(s.x, -s.y, 0.0, 1.0);
}
`;

export const TRAIL_VS = /* glsl */ `${HEADER}
${CAMERA}
layout(location = 0) in vec2 aCorner;   // (-1..1, -1..1)
layout(location = 1) in vec4 aSeg;      // x0 y0 x1 y1
layout(location = 2) in vec2 aInfo;     // id, radius
out vec2 vWorld;
flat out vec4 vSeg;
flat out int vId;
flat out float vRad;
void main() {
  vec2 a = aSeg.xy; vec2 b = aSeg.zw;
  vec2 d = b - a;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float r = aInfo.y + 2.0 / uScale;
  vec2 mid = (a + b) * 0.5;
  vec2 w = mid + dir * aCorner.x * (len * 0.5 + r) + nrm * aCorner.y * r;
  vWorld = w; vSeg = aSeg; vId = int(aInfo.x + 0.5); vRad = aInfo.y;
  gl_Position = toClip(w);
}
`;

export const TRAIL_FS = /* glsl */ `${HEADER}
${PALETTE}
${PATTERNS}
uniform float uScale;
uniform float uTime;
uniform int uYou;
in vec2 vWorld;
flat in vec4 vSeg;
flat in int vId;
flat in float vRad;
out vec4 outColor;
void main() {
  vec2 a = vSeg.xy; vec2 b = vSeg.zw;
  vec2 pa = vWorld - a; vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  float d = length(pa - ba * h) - vRad;
  float px = 1.0 / uScale;
  float alpha = fillSDF(d, px * 1.7);
  if (alpha <= 0.0) discard;
  float hot = vId == uYou ? 1.0 : 0.0;
  vec3 c1 = palRow(vId, 0).rgb;
  vec3 c2 = palRow(vId, 1).rgb;
  float dist = length(pa - ba * h);
  float t = clamp(dist / max(vRad, 0.001), 0.0, 1.0);
  vec3 c = mix(mix(c1, c2, 0.35), c1 * 0.7, smoothstep(0.2, 1.0, t));
  c = mix(c, vec3(1.0), (1.0 - t) * (0.18 + hot * 0.22));
  outColor = vec4(c * alpha, alpha);
}
`;

export const HEAD_VS = /* glsl */ `${HEADER}
${CAMERA}
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aA;   // x, y, size, id
layout(location = 2) in vec4 aB;   // lookX, lookY, tilt, flags
layout(location = 3) in vec2 aC;   // stretch, time offset
out vec2 vQ;
flat out int vId;
flat out vec4 vB;
flat out vec2 vC;
flat out float vSize;
const float EXTENT = 1.9;
void main() {
  vQ = aCorner * EXTENT;
  vId = int(aA.w + 0.5); vB = aB; vC = aC; vSize = aA.z;
  gl_Position = toClip(aA.xy + aCorner * EXTENT * aA.z);
}
`;

export const HEAD_FS = /* glsl */ `${HEADER}
${PALETTE}
${PATTERNS}
uniform sampler2D uAtlas;
uniform vec2 uAtlasGrid;
uniform float uScale;
uniform float uTime;
in vec2 vQ;
flat in int vId;
flat in vec4 vB;
flat in vec2 vC;
flat in float vSize;
out vec4 outColor;

const vec3 INK = vec3(0.11, 0.1, 0.18);
const float EXTENT = 1.9;

float bodySDF(vec2 q, int shape) {
  if (shape == 1) return length(q) - 0.95;
  if (shape == 2) return sdBox(q, vec2(0.5)) - 0.44;
  return sdBox(q, vec2(0.66)) - 0.26;
}

vec4 over(vec4 dst, vec3 c, float a) { return vec4(mix(dst.rgb, c, a), dst.a + a * (1.0 - dst.a)); }

void main() {
  float px = 1.0 / (vSize * uScale); // body units per device pixel
  vec4 prm = palRow(vId, 2);
  vec4 acc = palRow(vId, 3);
  vec3 c1 = palRow(vId, 0).rgb;
  vec3 c2 = palRow(vId, 1).rgb;
  int shape = int(prm.z + 0.5);
  int eyes = int(prm.w + 0.5);
  float flags = vB.w;
  bool shield = mod(flags, 2.0) >= 1.0;
  bool slowed = mod(floor(flags / 4.0), 2.0) >= 1.0;
  bool isYou = mod(floor(flags / 8.0), 2.0) >= 1.0;

  // Tilt + squash/stretch along heading.
  vec2 q = rot(-vB.z) * vQ;
  vec2 look = vB.xy;
  float st = vC.x;
  if (st > 0.001 && length(look) > 0.01) {
    vec2 L = normalize(look);
    float a = dot(q, L); float b = dot(q, vec2(-L.y, L.x));
    q = L * a / (1.0 + st) + vec2(-L.y, L.x) * b * (1.0 + st * 0.5);
  }
  float bob = sin(uTime * 7.0 + vC.y) * 0.03;
  q.y += bob;

  vec4 o = vec4(0.0);
  // "You" marker: soft pulsing ring on the ground.
  if (isYou) {
    float rr = length(vQ - vec2(0.0, 0.35)) - 1.45 - 0.05 * sin(uTime * 4.0);
    o = over(o, vec3(1.0), band(abs(rr), 0.05, px) * 0.8);
  }
  // Ground shadow.
  float sh = bodySDF((q - vec2(0.12, 0.42)) * vec2(1.0, 1.25), shape);
  o = over(o, vec3(0.05, 0.04, 0.15), (1.0 - smoothstep(-0.2, 0.25, sh)) * 0.28);
  // Block side (extrusion).
  float sd = bodySDF(q - vec2(0.0, 0.26), shape);
  o = over(o, c1 * 0.62, fillSDF(sd, px));
  // Top face with the character's own territory pattern.
  float d = bodySDF(q, shape);
  vec3 top = patternColor(int(prm.x + 0.5), q * 1.75 + vec2(0.37, 0.61), c1, c2, uTime, px * 1.75);
  top *= 1.08 - 0.16 * smoothstep(-1.0, 1.0, q.y + q.x * 0.3);
  top = mix(top, c1 * 0.7, band(abs(d + 0.035), 0.035, px) * 0.8);
  if (slowed) top = mix(top, vec3(0.6, 0.85, 1.0), 0.45);
  o = over(o, top, fillSDF(d, px));

  // Face.
  vec2 lk = length(look) > 0.01 ? normalize(look) : vec2(0.0);
  vec2 eL = vec2(-0.34, -0.12); vec2 eR = vec2(0.34, -0.12);
  // Blush
  float bl = min(length((q - vec2(-0.58, 0.2)) * vec2(1.0, 1.6)), length((q - vec2(0.58, 0.2)) * vec2(1.0, 1.6))) - 0.16;
  o = over(o, vec3(1.0, 0.45, 0.6), fillSDF(bl, px) * 0.35);
  if (eyes == 2) {
    // Visor
    float vd = sdBox(q - vec2(0.0, -0.12), vec2(0.6, 0.14)) - 0.06;
    o = over(o, INK, fillSDF(vd, px));
    float dotd = length(q - vec2(lk.x * 0.36, -0.12 + lk.y * 0.05)) - 0.1;
    o = over(o, c2 * 1.3, fillSDF(dotd, px));
    o = over(o, c2, (1.0 - smoothstep(0.0, 0.25, dotd)) * 0.35);
  } else if (eyes == 1) {
    // Happy closed eyes ^ ^
    for (int k = 0; k < 2; k++) {
      vec2 e = (k == 0 ? eL : eR) + vec2(0.0, 0.06);
      vec2 r = q - e;
      float ad = abs(length(r) - 0.16);
      float m = step(r.y, 0.02);
      o = over(o, INK, band(ad, 0.045, px) * m);
    }
  } else {
    for (int k = 0; k < 2; k++) {
      vec2 e = k == 0 ? eL : eR;
      float ed = length(q - e) - 0.24;
      o = over(o, INK, fillSDF(ed - 0.035, px));
      o = over(o, vec3(1.0), fillSDF(ed, px));
      vec2 pc = e + lk * 0.09;
      float pd = length(q - pc) - 0.125;
      if (eyes == 4) {
        pd = sdStar5(rot(uTime) * vec2(q.x - pc.x, -(q.y - pc.y)), 0.17, 0.5);
        o = over(o, vec3(1.0, 0.8, 0.2), fillSDF(pd, px));
      } else {
        o = over(o, INK, fillSDF(pd, px));
        o = over(o, vec3(1.0), fillSDF(length(q - pc - vec2(-0.045, -0.05)) - 0.04, px));
      }
      if (eyes == 3) {
        // Sleepy lid
        float lid = max(ed, (q.y - e.y) + 0.02);
        o = over(o, c1 * 0.88, fillSDF(lid, px));
        o = over(o, INK, band(abs(q.y - e.y + 0.02), 0.025, px) * fillSDF(ed, px));
      }
    }
  }
  // Mouth
  vec2 mr = q - vec2(0.0, 0.16);
  float md = abs(length(mr) - 0.17);
  o = over(o, INK, band(md, 0.035, px) * step(0.07, mr.y));

  // Accessory from the canvas-drawn atlas.
  float idx = acc.w;
  if (idx >= 0.0) {
    vec2 uv = (vQ / EXTENT) * 0.5 + 0.5;
    uv = (rot(-vB.z) * (uv - 0.5)) + 0.5;
    uv.y += bob / (EXTENT * 2.0);
    if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
      vec2 cell = vec2(mod(idx, uAtlasGrid.x), floor(idx / uAtlasGrid.x));
      vec4 a = texture(uAtlas, (uv + cell) / uAtlasGrid);
      o = vec4(mix(o.rgb, a.rgb / max(a.a, 1e-4), a.a), o.a + a.a * (1.0 - o.a));
    }
  }

  if (shield) {
    float sr = length(vQ) - 1.55;
    float sa = band(abs(sr), 0.06, px) * 0.9 + (1.0 - smoothstep(-0.9, 0.0, sr)) * step(sr, 0.0) * 0.18;
    o = over(o, vec3(0.55, 0.9, 1.0), sa * (0.8 + 0.2 * sin(uTime * 10.0)));
  }
  if (o.a <= 0.001) discard;
  outColor = vec4(o.rgb * o.a, o.a);
}
`;

export const PARTICLE_VS = /* glsl */ `${HEADER}
${CAMERA}
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aP;   // x, y, radius, alpha
layout(location = 2) in vec4 aCol; // rgb, shape (0 circle, 1 square)
out vec2 vQ;
flat out vec4 vCol;
flat out float vAlpha;
flat out float vR;
void main() {
  vQ = aCorner;
  vCol = aCol; vAlpha = aP.w; vR = aP.z;
  gl_Position = toClip(aP.xy + aCorner * (aP.z + 1.5 / uScale));
}
`;

export const PARTICLE_FS = /* glsl */ `${HEADER}
uniform float uScale;
in vec2 vQ;
flat in vec4 vCol;
flat in float vAlpha;
flat in float vR;
out vec4 outColor;
void main() {
  float ext = vR + 1.5 / uScale;
  vec2 p = vQ * ext;
  float d = vCol.w > 0.5 ? max(abs(p.x), abs(p.y)) - vR * 0.8 : length(p) - vR;
  float px = 1.0 / uScale;
  float a = (1.0 - smoothstep(-px, px, d)) * vAlpha;
  if (a <= 0.0) discard;
  outColor = vec4(vCol.rgb * a, a);
}
`;
