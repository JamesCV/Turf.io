import { ROCK, VOID } from './grid';
import { wrapAngle, type Controller, type Player, type World } from './world';

export type Difficulty = 'easy' | 'normal' | 'hard' | 'boss';

export interface Personality {
  /** Seconds between decisions. Lower = sharper. */
  reaction: number;
  /** 0..1 how eagerly it hunts other trails. */
  aggression: number;
  /** 0..1 how large its loops are. */
  greed: number;
  /** How early it retreats when threatened. ~0.3 reckless .. 1.4 paranoid. */
  caution: number;
  /** Steering noise in radians. */
  wobble: number;
  /** 0..1 how readily it fires its ability. */
  abilityUse: number;
}

type State = 'home' | 'out' | 'return' | 'hunt';

interface Brain {
  pers: Personality;
  state: State;
  nextThink: number;
  stateSince: number;
  planDir: number;
  legs: { x: number; y: number }[];
  leg: number;
  desired: number;
  homeX: number;
  homeY: number;
  homeCheck: number;
  hunt: Player | null;
  phase: number;
  /** Which way we last swerved to dodge our own trail (hysteresis). */
  avoidSide: number;
}

const PRESETS: Record<Difficulty, [Personality, Personality]> = {
  easy: [
    { reaction: 0.34, aggression: 0.05, greed: 0.45, caution: 0.25, wobble: 0.25, abilityUse: 0.2 },
    { reaction: 0.5, aggression: 0.3, greed: 1.0, caution: 0.6, wobble: 0.45, abilityUse: 0.4 },
  ],
  normal: [
    { reaction: 0.2, aggression: 0.25, greed: 0.3, caution: 0.6, wobble: 0.12, abilityUse: 0.4 },
    { reaction: 0.3, aggression: 0.6, greed: 0.85, caution: 1.0, wobble: 0.25, abilityUse: 0.7 },
  ],
  hard: [
    { reaction: 0.1, aggression: 0.55, greed: 0.35, caution: 0.9, wobble: 0.05, abilityUse: 0.7 },
    { reaction: 0.17, aggression: 0.9, greed: 0.8, caution: 1.3, wobble: 0.14, abilityUse: 1 },
  ],
  boss: [
    { reaction: 0.07, aggression: 0.9, greed: 0.6, caution: 1.2, wobble: 0.03, abilityUse: 1 },
    { reaction: 0.1, aggression: 1.0, greed: 0.9, caution: 1.4, wobble: 0.06, abilityUse: 1 },
  ],
};

export function rollPersonality(world: World, d: Difficulty): Personality {
  const [a, b] = PRESETS[d];
  const r = world.rng;
  const mix = (k: keyof Personality) => a[k] + (b[k] - a[k]) * r.next();
  return {
    reaction: mix('reaction'),
    aggression: mix('aggression'),
    greed: mix('greed'),
    caution: mix('caution'),
    wobble: mix('wobble'),
    abilityUse: mix('abilityUse'),
  };
}

export function makeBotController(pers: Personality): Controller {
  return (world, p, dt) => {
    let b = p.brain as Brain | null;
    if (!b) {
      b = {
        pers,
        state: 'home',
        nextThink: 0,
        stateSince: world.time,
        planDir: p.angle,
        legs: [],
        leg: 0,
        desired: p.angle,
        homeX: p.x,
        homeY: p.y,
        homeCheck: 0,
        hunt: null,
        phase: world.rng.range(0, 100),
        avoidSide: 0,
      };
      p.brain = b;
    }
    if (world.time >= b.nextThink) {
      think(world, p, b);
      b.nextThink = world.time + b.pers.reaction * (0.7 + world.rng.next() * 0.6);
    }
    steer(world, p, b, dt);
  };
}

function setState(world: World, b: Brain, s: State): void {
  if (b.state !== s) {
    b.state = s;
    b.stateSince = world.time;
  }
}

function think(world: World, p: Player, b: Brain): void {
  const pers = b.pers;

  // Transition: left territory while heading out -> build the loop legs.
  if (b.state === 'home' && !p.inside) startLoop(world, p, b);
  // Transition: got home.
  if ((b.state === 'return' || b.state === 'out') && p.inside) {
    setState(world, b, 'home');
    b.planDir = choosePlanDir(world, p, pers);
  }

  // Danger check while exposed.
  if (!p.inside && p.trail.length > 0) {
    const homeD = homeDistance(world, p, b);
    const threat = nearestThreatToTrail(world, p);
    const margin = homeD * (0.45 + pers.caution * 0.55) + 2 + pers.caution * 2;
    if (threat < margin) {
      if (b.state !== 'return') setState(world, b, 'return');
      if (pers.abilityUse > world.rng.next() && threat < homeD * 0.6) {
        const ab = p.loadout.ability;
        if (ab === 'dash' || ab === 'shield') world.useAbility(p);
      }
    }
    const maxTrail = 25 + pers.greed * 70;
    if (p.trail.length > maxTrail && b.state !== 'hunt') setState(world, b, 'return');
  }

  // Hunting opportunities.
  if (b.state !== 'return' || p.trail.length < 6) {
    const target = findPrey(world, p, pers);
    if (target && (b.state !== 'hunt' || b.hunt !== target)) {
      b.hunt = target;
      setState(world, b, 'hunt');
    }
  }

  switch (b.state) {
    case 'home': {
      if (world.time - b.stateSince > 5) b.planDir = choosePlanDir(world, p, pers);
      b.desired = b.planDir;
      break;
    }
    case 'out':
      // Waypoint following happens every tick in steer().
      break;
    case 'hunt': {
      const h = b.hunt;
      if (!h || !h.alive || h.trailPts.length < 2 || p.trail.length > 40 + pers.greed * 40) {
        b.hunt = null;
        setState(world, b, p.inside ? 'home' : 'return');
        break;
      }
      // Aim at the nearest trail point, leading slightly toward the trail's newest part.
      let bx = 0;
      let by = 0;
      let bd = Infinity;
      const pts = h.trailPts;
      for (let k = 0; k < pts.length; k += 2) {
        const d = Math.hypot(pts[k] - p.x, pts[k + 1] - p.y);
        if (d < bd) {
          bd = d;
          bx = pts[k];
          by = pts[k + 1];
        }
      }
      b.desired = Math.atan2(by - p.y, bx - p.x);
      if (bd < 7 && pers.abilityUse > world.rng.next()) {
        const ab = p.loadout.ability;
        if (ab === 'dash' || ab === 'freeze') world.useAbility(p);
      }
      break;
    }
    case 'return': {
      if (p.inside) {
        setState(world, b, 'home');
        b.planDir = choosePlanDir(world, p, pers);
        break;
      }
      homeDistance(world, p, b);
      break;
    }
  }
}

function startLoop(world: World, p: Player, b: Brain): void {
  const r = world.rng;
  const g = b.pers.greed;
  const big = 1 + Math.min(1.5, Math.sqrt(world.cells(p)) / 60);
  const L1 = r.range(4, 8 + g * 22) * big;
  const L2 = r.range(4, 8 + g * 22) * big;
  const dir = p.angle;
  const side = r.chance(0.5) ? 1 : -1;
  const px = Math.cos(dir + (side * Math.PI) / 2);
  const py = Math.sin(dir + (side * Math.PI) / 2);
  const w1 = { x: p.x + Math.cos(dir) * L1, y: p.y + Math.sin(dir) * L1 };
  const w2 = { x: w1.x + px * L2, y: w1.y + py * L2 };
  const w3 = { x: w2.x - Math.cos(dir) * L1 * 0.75, y: w2.y - Math.sin(dir) * L1 * 0.75 };
  b.legs = [w1, w2, w3].filter((w) => world.grid.walkable(Math.floor(w.x), Math.floor(w.y)));
  b.leg = 0;
  setState(world, b, 'out');
}

/** Pick a direction that leads into open, capturable space. */
function choosePlanDir(world: World, p: Player, pers: Personality): number {
  const g = world.grid;
  let best = p.angle;
  let bestScore = -Infinity;
  const n = 10;
  const off = world.rng.range(0, Math.PI * 2);
  for (let k = 0; k < n; k++) {
    const a = off + (k / n) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    let score = 0;
    let outside = 0;
    for (let d = 1; d <= 30; d += 1.5) {
      const x = Math.floor(p.x + ca * d);
      const y = Math.floor(p.y + sa * d);
      const o = g.ownerAt(x, y);
      if (o === VOID || o === ROCK) {
        score -= outside < 8 ? 12 : 2;
        break;
      }
      if (o !== p.id) {
        outside++;
        score += o === 0 ? 1 : 1.6 + pers.aggression; // enemy land is juicier
      } else if (outside > 0) {
        score += 0.2;
      } else {
        score -= 0.25; // prefer exits close by
      }
    }
    for (const o of world.players) {
      if (o === p || !o.alive) continue;
      const dx = o.x - p.x;
      const dy = o.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 30) continue;
      const along = (dx * ca + dy * sa) / (d || 1);
      if (along > 0.3) score -= (30 - d) * 0.35 * along * (0.5 + pers.caution);
    }
    score += world.rng.range(0, 4);
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

/** True if the straight path from p to (tx,ty) crosses p's own (non-recent) trail. */
function pathCrossesTrail(world: World, p: Player, tx: number, ty: number): boolean {
  const g = world.grid;
  const n = p.trail.length;
  const recent = new Set(p.trail.slice(Math.max(0, n - 5)));
  const d = Math.hypot(tx - p.x, ty - p.y);
  const steps = Math.ceil(d / 0.4);
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    const x = Math.floor(p.x + (tx - p.x) * t);
    const y = Math.floor(p.y + (ty - p.y) * t);
    const i = g.idx(x, y);
    if (g.trail[i] === p.id && !recent.has(i)) return true;
  }
  return false;
}

/**
 * Updates brain.homeX/Y to the nearest owned cell we can reach in a straight
 * line without crossing our own trail, and returns its distance.
 */
function homeDistance(world: World, p: Player, b: Brain): number {
  if (world.time >= b.homeCheck) {
    b.homeCheck = world.time + 0.25;
    const g = world.grid;
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    const found: { x: number; y: number; d: number }[] = [];
    let firstR = -1;
    for (let r = 1; r <= 70; r++) {
      if (firstR >= 0 && r > firstR + 8) break;
      for (let k = -r; k <= r; k++) {
        const cand: [number, number][] = [
          [cx + k, cy - r],
          [cx + k, cy + r],
          [cx - r, cy + k],
          [cx + r, cy + k],
        ];
        for (const [x, y] of cand) {
          if (g.ownerAt(x, y) !== p.id) continue;
          if (firstR < 0) firstR = r;
          found.push({ x: x + 0.5, y: y + 0.5, d: Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) });
        }
      }
    }
    found.sort((a, b2) => a.d - b2.d);
    let pick = found[0];
    for (let k = 0; k < Math.min(found.length, 48); k += k < 8 ? 1 : 3) {
      const c = found[k];
      if (!pathCrossesTrail(world, p, c.x, c.y)) {
        pick = c;
        break;
      }
    }
    if (pick) {
      b.homeX = pick.x;
      b.homeY = pick.y;
    } else {
      b.homeX = p.exitX;
      b.homeY = p.exitY;
    }
  }
  return Math.hypot(b.homeX - p.x, b.homeY - p.y);
}

/** Distance from the closest enemy head to any part of p's trail (or head). */
function nearestThreatToTrail(world: World, p: Player): number {
  let best = Infinity;
  const pts = p.trailPts;
  for (const o of world.players) {
    if (o === p || !o.alive) continue;
    const dh = Math.hypot(o.x - p.x, o.y - p.y);
    if (dh > 45) continue;
    best = Math.min(best, dh);
    for (let k = 0; k < pts.length; k += 4) {
      const d = Math.hypot(o.x - pts[k], o.y - pts[k + 1]);
      if (d < best) best = d;
    }
  }
  return best;
}

function findPrey(world: World, p: Player, pers: Personality): Player | null {
  if (pers.aggression < 0.05) return null;
  let best: Player | null = null;
  let bestScore = 0;
  for (const o of world.players) {
    if (o === p || !o.alive || o.trailPts.length < 6) continue;
    if (world.time < o.shieldUntil) continue;
    const dh = Math.hypot(o.x - p.x, o.y - p.y);
    if (dh > 28) continue;
    let dMe = Infinity;
    const pts = o.trailPts;
    for (let k = 0; k < pts.length; k += 2) {
      dMe = Math.min(dMe, Math.hypot(pts[k] - p.x, pts[k + 1] - p.y));
    }
    const dThem = Math.hypot(o.x - o.exitX, o.y - o.exitY);
    if (dMe > 22) continue;
    const edge = dThem * (0.6 + pers.aggression * 0.9) - dMe;
    if (edge <= 0) continue;
    const score = edge * pers.aggression;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}

/** Advance through loop waypoints; a waypoint counts once reached or passed. */
function followLegs(world: World, p: Player, b: Brain): void {
  while (b.leg < b.legs.length) {
    const w = b.legs[b.leg];
    const prev = b.leg > 0 ? b.legs[b.leg - 1] : { x: p.exitX, y: p.exitY };
    const lx = w.x - prev.x;
    const ly = w.y - prev.y;
    const dx = w.x - p.x;
    const dy = w.y - p.y;
    const passed = lx * dx + ly * dy < 0;
    if (Math.hypot(dx, dy) < 1.6 || passed) {
      b.leg++;
      continue;
    }
    b.desired = Math.atan2(dy, dx);
    return;
  }
  setState(world, b, 'return');
}

/** Turn the desired heading into a safe target angle (avoid own trail and walls). */
function steer(world: World, p: Player, b: Brain, dt: number): void {
  b.phase += dt;
  if (b.state === 'out') followLegs(world, p, b);
  if (b.state === 'return') {
    homeDistance(world, p, b);
    b.desired = Math.atan2(b.homeY - p.y, b.homeX - p.x);
  }
  const calm = b.state === 'hunt' || (!p.inside && p.trail.length > 0) ? 0.35 : 1;
  const wob = Math.sin(b.phase * 1.7) * b.pers.wobble * calm;
  const want = b.desired + wob;
  const g = world.grid;
  const n = p.trail.length;
  const recent = new Set(p.trail.slice(Math.max(0, n - 6)));
  const blocked = (a: number): boolean => {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let d = 0.7; d <= 3.6; d += 0.45) {
      const x = Math.floor(p.x + ca * d);
      const y = Math.floor(p.y + sa * d);
      if (!g.walkable(x, y)) return true;
      const i = g.idx(x, y);
      if (g.trail[i] === p.id && !recent.has(i)) return true;
    }
    return false;
  };
  if (!blocked(want)) {
    b.avoidSide = 0;
    p.targetAngle = want;
    return;
  }
  // Keep turning the same way we chose last time to avoid dithering into our own trail.
  const sides = b.avoidSide ? [b.avoidSide, -b.avoidSide] : [1, -1];
  let best: number | null = null;
  let bestCost = Infinity;
  for (const s of sides) {
    for (let k = 1; k <= 10; k++) {
      const a = wrapAngle(want + s * k * 0.3);
      if (blocked(a)) continue;
      const cost = k * 0.3 + Math.abs(wrapAngle(a - p.angle)) * 0.6 + (s === b.avoidSide ? 0 : 0.4);
      if (cost < bestCost) {
        bestCost = cost;
        best = a;
        b.avoidSide = s;
      }
      break;
    }
  }
  p.targetAngle = best ?? want;
}
