import { Player, type AbilityId, type Loadout, type World } from '../sim/world';

export interface NetPlayerSnap {
  id: number;
  name: string;
  bot: boolean;
  charId: string;
  ability: AbilityId | null;
  team: number;
  key: string;
  x: number;
  y: number;
  angle: number;
  alive: boolean;
  inside: boolean;
  ready: number;
  trail: number[];
}

export interface NetSnapshot {
  t: number;
  players: NetPlayerSnap[];
  /** Run-length triples [value, countLo, countHi] of the owner grid. */
  rle?: number[];
  /** Host has already ended the match. */
  over?: boolean;
}

function sampleTrail(pts: number[], max = 42): number[] {
  const n = pts.length / 2;
  if (n <= max) return pts.slice();
  const out: number[] = [];
  for (let i = 0; i < max; i++) {
    const k = Math.round((i / (max - 1)) * (n - 1));
    out.push(pts[k * 2], pts[k * 2 + 1]);
  }
  return out;
}

export function captureSnapshot(world: World, includeGrid: boolean, over = false): NetSnapshot {
  const players: NetPlayerSnap[] = world.players.map((p) => ({
    id: p.id,
    name: p.name,
    bot: p.isBot,
    charId: p.loadout.charId,
    ability: p.loadout.ability,
    team: p.team,
    key: p.netKey,
    x: p.x,
    y: p.y,
    angle: p.angle,
    alive: p.alive,
    inside: p.inside,
    ready: p.abilityReadyAt,
    trail: p.alive && !p.inside ? sampleTrail(p.trailPts) : [],
  }));
  const snap: NetSnapshot = { t: world.time, players, over: over || undefined };
  if (includeGrid) snap.rle = encodeRle(world.grid.owner);
  return snap;
}

export function applySnapshot(world: World, snap: NetSnapshot, alpha: number): void {
  const keep = new Set(snap.players.map((p) => p.id));
  for (let i = world.players.length - 1; i >= 0; i--) {
    const p = world.players[i];
    if (!keep.has(p.id)) {
      world.byId[p.id] = null;
      world.players.splice(i, 1);
      world.rosterVersion++;
    }
  }
  for (const s of snap.players) {
    let p = world.byId[s.id];
    if (!p) {
      const loadout: Loadout = {
        charId: s.charId,
        ability: s.ability,
        abilityPower: 1,
        cooldownMul: 1,
        startRadius: 3.5,
      };
      p = new Player(s.id, s.name, s.bot, loadout);
      world.byId[s.id] = p;
      world.players.push(p);
      world.rosterVersion++;
      p.px = s.x;
      p.py = s.y;
    } else {
      const ix = p.px + (p.x - p.px) * alpha;
      const iy = p.py + (p.y - p.py) * alpha;
      p.px = ix;
      p.py = iy;
      p.loadout.charId = s.charId;
      p.loadout.ability = s.ability;
    }
    p.x = s.x;
    p.y = s.y;
    p.angle = s.angle;
    p.targetAngle = s.angle;
    p.alive = s.alive;
    p.inside = s.inside;
    p.team = s.team;
    p.netKey = s.key;
    p.abilityReadyAt = s.ready;
    p.trailPts = s.trail;
    p.cellX = Math.floor(s.x);
    p.cellY = Math.floor(s.y);
  }
  if (snap.rle) decodeRle(world, snap.rle);
  world.time = snap.t;
}

function encodeRle(owner: Uint8Array): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < owner.length) {
    const v = owner[i];
    let j = i + 1;
    const cap = Math.min(owner.length, i + 65535);
    while (j < cap && owner[j] === v) j++;
    const n = j - i;
    out.push(v, n & 255, n >> 8);
    i = j;
  }
  return out;
}

function decodeRle(world: World, rle: number[]): void {
  const g = world.grid;
  const owner = g.owner;
  g.counts.fill(0);
  let i = 0;
  for (let k = 0; k + 2 < rle.length && i < owner.length; k += 3) {
    const v = rle[k];
    const n = rle[k + 1] | (rle[k + 2] << 8);
    const end = Math.min(owner.length, i + n);
    owner.fill(v, i, end);
    g.counts[v] += end - i;
    i = end;
  }
  g.markAll();
}
