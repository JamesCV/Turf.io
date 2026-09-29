import { EMPTY, Grid, MAX_ID, ROCK, VOID, type Rect } from './grid';
import { buildMap, type MapSpec } from './maps';
import { Rng } from './rng';

export const BASE_SPEED = 10.2; // cells per second
export const TURN_RATE = 11.5; // radians per second — a flick shows up within a couple of frames
const RIPPLE_SPEED = 70; // cells per second the capture flash travels
const TRAIL_POINT_SPACING = 0.32;
const SELF_HIT_GRACE = 3; // ignore the newest trail cells when checking self-hits
const HEAD_HIT_DIST = 0.9;
const SPAWN_SHIELD = 2;

export type AbilityId = 'dash' | 'shield' | 'freeze';

export const ABILITIES: Record<AbilityId, { cooldown: number; duration: number; radius?: number }> = {
  dash: { cooldown: 11, duration: 1.1 },
  shield: { cooldown: 18, duration: 2.4 },
  freeze: { cooldown: 16, duration: 1.8, radius: 13 },
};

export interface Loadout {
  /** Character id; opaque to the sim, used by the renderer for skin + pattern. */
  charId: string;
  ability: AbilityId | null;
  /** Multiplies ability duration. 1 = base. */
  abilityPower: number;
  /** Multiplies ability cooldown. 1 = base, lower is faster. */
  cooldownMul: number;
  /** Starting territory radius in cells. */
  startRadius: number;
}

export type Controller = (world: World, p: Player, dt: number) => void;

export class Player {
  alive = true;
  x = 0;
  y = 0;
  /** Previous-tick position for render interpolation. */
  px = 0;
  py = 0;
  angle = 0;
  targetAngle = 0;
  /** Angular velocity of the last tick (for tilt / squash visuals). */
  turnVel = 0;
  cellX = 0;
  cellY = 0;
  inside = true;
  /** Cell indices of the current trail, in order. */
  trail: number[] = [];
  /** Smooth polyline of the current trail for rendering (x,y pairs). */
  trailPts: number[] = [];
  bbox: Rect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  kills = 0;
  bestCells = 0;
  spawnTime = 0;
  deathTime = 0;
  dashUntil = 0;
  shieldUntil = 0;
  slowUntil = 0;
  abilityReadyAt = 0;
  exitX = 0;
  exitY = 0;
  controller: Controller | null = null;
  /** Free slot for controllers (bot brains) to keep state. */
  brain: unknown = null;
  /** Arbitrary tag for game-mode rules (e.g. "boss"). */
  tag = '';
  /** 0 = free-for-all. Matching non-zero teams are allies. */
  team = 0;
  /** Party seat key for a remote human. Empty for local players and bots. */
  netKey = '';

  constructor(
    readonly id: number,
    readonly name: string,
    readonly isBot: boolean,
    readonly loadout: Loadout,
  ) {}
}

export type DeathReason = 'trail' | 'self' | 'head' | 'wiped';

export type WorldEvent =
  | { type: 'capture'; p: Player; cells: number; x: number; y: number }
  | { type: 'kill'; victim: Player; killer: Player | null; reason: DeathReason; x: number; y: number; taken: number }
  | { type: 'spawn'; p: Player }
  | { type: 'ability'; p: Player; ability: AbilityId };

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class World {
  readonly grid: Grid;
  readonly rng: Rng;
  readonly players: Player[] = [];
  /** Lookup by id; index 0 unused. */
  readonly byId: (Player | null)[] = new Array(256).fill(null);
  time = 0;
  events: WorldEvent[] = [];
  /** Bumped whenever the roster changes so the renderer can refresh palettes. */
  rosterVersion = 0;
  private lastId = 0;

  constructor(readonly spec: MapSpec) {
    const map = buildMap(spec);
    this.grid = new Grid(map.w, map.h);
    this.grid.setTerrain(map.terrain);
    this.rng = new Rng(spec.seed ^ 0x5bd1e995);
  }

  get alivePlayers(): Player[] {
    return this.players.filter((p) => p.alive);
  }

  share(p: Player): number {
    return this.grid.counts[p.id] / this.grid.playable;
  }

  cells(p: Player): number {
    return this.grid.counts[p.id];
  }

  private allocId(): number {
    for (let k = 0; k < MAX_ID; k++) {
      const id = ((this.lastId + k) % MAX_ID) + 1;
      if (!this.byId[id]) {
        this.lastId = id;
        return id;
      }
    }
    return 0;
  }

  /** Remove dead players from the roster (frees their ids). */
  reap(p: Player): void {
    if (p.alive) return;
    this.byId[p.id] = null;
    const k = this.players.indexOf(p);
    if (k >= 0) this.players.splice(k, 1);
    this.rosterVersion++;
  }

  /** Find a free spot for a new player; returns world coords or null. */
  findSpawn(radius: number): { x: number; y: number } | null {
    const g = this.grid;
    const need = Math.ceil(radius + 2);
    let best: { x: number; y: number } | null = null;
    let bestScore = -1;
    for (let t = 0; t < 90; t++) {
      const cx = this.rng.int(need, g.w - need - 1);
      const cy = this.rng.int(need, g.h - need - 1);
      let ok = true;
      for (let dy = -need; dy <= need && ok; dy++) {
        for (let dx = -need; dx <= need; dx++) {
          if (dx * dx + dy * dy > need * need) continue;
          const i = g.idx(cx + dx, cy + dy);
          if (g.owner[i] !== EMPTY || g.trail[i] !== 0) {
            ok = false;
            break;
          }
        }
      }
      if (!ok) continue;
      let minD = 60;
      for (const p of this.players) {
        if (!p.alive) continue;
        minD = Math.min(minD, Math.hypot(p.x - cx, p.y - cy));
      }
      if (minD > bestScore) {
        bestScore = minD;
        best = { x: cx + 0.5, y: cy + 0.5 };
        if (minD >= 40) break;
      }
    }
    return best;
  }

  addPlayer(name: string, isBot: boolean, loadout: Loadout, at?: { x: number; y: number }): Player | null {
    const pos = at ?? this.findSpawn(loadout.startRadius);
    if (!pos) return null;
    const id = this.allocId();
    if (!id) return null;
    const p = new Player(id, name, isBot, loadout);
    p.x = p.px = pos.x;
    p.y = p.py = pos.y;
    p.cellX = Math.floor(p.x);
    p.cellY = Math.floor(p.y);
    p.angle = p.targetAngle = this.rng.range(-Math.PI, Math.PI);
    p.spawnTime = this.time;
    p.shieldUntil = this.time + SPAWN_SHIELD;
    p.abilityReadyAt = this.time + 3;
    this.byId[id] = p;
    this.players.push(p);
    this.rosterVersion++;

    const g = this.grid;
    const r = loadout.startRadius;
    const R = Math.ceil(r);
    p.bbox = { x0: p.cellX - R, y0: p.cellY - R, x1: p.cellX + R + 1, y1: p.cellY + R + 1 };
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        const x = p.cellX + dx;
        const y = p.cellY + dy;
        if (!g.walkable(x, y)) continue;
        const i = g.idx(x, y);
        const o = g.owner[i];
        if (o !== EMPTY && o !== id) continue;
        g.setOwner(i, id);
        g.capTime[i] = this.time + d / 25;
      }
    }
    p.bestCells = g.counts[id];
    this.events.push({ type: 'spawn', p });
    return p;
  }

  shielded(p: Player): boolean {
    return this.time < p.shieldUntil;
  }

  /** Allies share a non-zero team and never cut each other. */
  allied(a: Player | null | undefined, b: Player | null | undefined): boolean {
    if (!a || !b) return false;
    return a.team !== 0 && a.team === b.team;
  }

  speedOf(p: Player): number {
    let s = BASE_SPEED;
    if (this.time < p.dashUntil) s *= 1.65;
    if (this.time < p.slowUntil) s *= 0.55;
    return s;
  }

  abilityCooldown(p: Player): number {
    if (!p.loadout.ability) return 0;
    return ABILITIES[p.loadout.ability].cooldown * p.loadout.cooldownMul;
  }

  /** 0 = ready, 1 = just used. */
  abilityCharge(p: Player): number {
    const cd = this.abilityCooldown(p);
    if (!cd) return 1;
    return Math.max(0, Math.min(1, (p.abilityReadyAt - this.time) / cd));
  }

  useAbility(p: Player): boolean {
    const ab = p.loadout.ability;
    if (!p.alive || !ab || this.time < p.abilityReadyAt) return false;
    const def = ABILITIES[ab];
    const dur = def.duration * p.loadout.abilityPower;
    if (ab === 'dash') p.dashUntil = this.time + dur;
    else if (ab === 'shield') p.shieldUntil = this.time + dur;
    else if (ab === 'freeze') {
      const r = def.radius ?? 12;
      for (const o of this.players) {
        if (o === p || !o.alive) continue;
        if (Math.hypot(o.x - p.x, o.y - p.y) <= r) o.slowUntil = this.time + dur;
      }
    }
    p.abilityReadyAt = this.time + this.abilityCooldown(p);
    this.events.push({ type: 'ability', p, ability: ab });
    return true;
  }

  step(dt: number): void {
    this.time += dt;
    for (const p of this.players) {
      if (p.alive && p.controller) p.controller(this, p, dt);
    }
    for (const p of this.players) {
      if (p.alive) this.move(p, dt);
    }
    this.headOnCollisions();
    for (const p of this.players) {
      if (!p.alive) continue;
      const c = this.grid.counts[p.id];
      if (c > p.bestCells) p.bestCells = c;
    }
  }

  private move(p: Player, dt: number): void {
    p.px = p.x;
    p.py = p.y;
    const maxTurn = TURN_RATE * dt;
    let da = wrapAngle(p.targetAngle - p.angle);
    if (da > maxTurn) da = maxTurn;
    else if (da < -maxTurn) da = -maxTurn;
    p.angle = wrapAngle(p.angle + da);
    p.turnVel = da / dt;

    const g = this.grid;
    const v = this.speedOf(p) * dt;
    let nx = p.x + Math.cos(p.angle) * v;
    let ny = p.y + Math.sin(p.angle) * v;
    if (!g.walkable(Math.floor(nx), Math.floor(ny))) {
      // Slide along walls instead of stopping dead.
      if (g.walkable(Math.floor(nx), Math.floor(p.y))) ny = p.y;
      else if (g.walkable(Math.floor(p.x), Math.floor(ny))) nx = p.x;
      else {
        nx = p.x;
        ny = p.y;
      }
    }

    const tx = Math.floor(nx);
    const ty = Math.floor(ny);
    const cx = p.cellX;
    const cy = p.cellY;
    if (tx !== cx || ty !== cy) {
      // Walk 4-connected so trails never leave diagonal gaps.
      if (tx !== cx && ty !== cy) {
        const bx = tx > cx ? cx + 1 : cx;
        const by = ty > cy ? cy + 1 : cy;
        const tX = (bx - p.x) / (nx - p.x || 1e-9);
        const tY = (by - p.y) / (ny - p.y || 1e-9);
        let mx = tX < tY ? tx : cx;
        let my = tX < tY ? cy : ty;
        if (!g.walkable(mx, my)) {
          mx = tX < tY ? cx : tx;
          my = tX < tY ? ty : cy;
        }
        if (!this.enter(p, mx, my, p.x, p.y)) return;
      }
      if (!this.enter(p, tx, ty, nx, ny)) return;
    }
    p.x = nx;
    p.y = ny;

    if (!p.inside) {
      const pts = p.trailPts;
      const lx = pts[pts.length - 2];
      const ly = pts[pts.length - 1];
      if (Math.hypot(nx - lx, ny - ly) >= TRAIL_POINT_SPACING) pts.push(nx, ny);
    }
  }

  /** Head enters a new cell. Returns false if the player died. */
  private enter(p: Player, x: number, y: number, wx: number, wy: number): boolean {
    const g = this.grid;
    const i = g.idx(x, y);
    p.cellX = x;
    p.cellY = y;

    const t = g.trail[i];
    if (t !== 0) {
      if (t === p.id) {
        const n = p.trail.length;
        let recent = false;
        for (let k = Math.max(0, n - SELF_HIT_GRACE); k < n; k++) {
          if (p.trail[k] === i) recent = true;
        }
        if (!recent && !this.shielded(p)) {
          this.kill(p, p, 'self');
          return false;
        }
      } else {
        const other = this.byId[t];
        // Crossing a trail outside its owner's land (they're attacking) kills them
        // and hands you everything they owned. Allies pass through.
        if (other && other.alive && !this.allied(p, other) && !this.shielded(other)) this.kill(other, p, 'trail');
      }
    }

    if (g.owner[i] === p.id) {
      if (p.trail.length) this.capture(p, x, y);
      p.inside = true;
    } else {
      if (p.inside) {
        p.inside = false;
        p.exitX = p.x;
        p.exitY = p.y;
        p.trailPts.length = 0;
        p.trailPts.push(p.x, p.y);
      }
      const trailOwner = g.trail[i] ? this.byId[g.trail[i]] : null;
      const allyTrail = this.allied(p, trailOwner);
      if (!allyTrail) {
        if (g.trail[i] === 0) g.trail[i] = p.id;
        p.trail.push(i);
      }
      if (p.trailPts.length === 0) p.trailPts.push(wx, wy);
    }
    return true;
  }

  private capture(p: Player, hx: number, hy: number): void {
    const g = this.grid;
    const box = p.bbox;
    const losers = new Set<number>();
    let n = 0;
    const take = (i: number) => {
      const o = g.owner[i];
      if (o !== EMPTY && o !== p.id && o !== VOID && o !== ROCK) losers.add(o);
      g.setOwner(i, p.id);
      const x = i % g.w;
      const y = (i - x) / g.w;
      g.capTime[i] = this.time + Math.hypot(x - hx, y - hy) / RIPPLE_SPEED;
      if (x < box.x0) box.x0 = x;
      if (y < box.y0) box.y0 = y;
      if (x + 1 > box.x1) box.x1 = x + 1;
      if (y + 1 > box.y1) box.y1 = y + 1;
      n++;
    };
    for (const c of p.trail) {
      if (g.trail[c] === p.id) g.trail[c] = 0;
      if (g.owner[c] !== p.id) take(c);
    }
    p.trail.length = 0;
    p.trailPts.length = 0;
    g.floodEnclosed(p.id, { ...box }, take);

    for (const id of losers) {
      const l = this.byId[id];
      if (l && l.alive && g.counts[id] === 0) this.kill(l, p, 'wiped');
    }
    this.events.push({ type: 'capture', p, cells: n, x: hx + 0.5, y: hy + 0.5 });
  }

  kill(victim: Player, killer: Player | null, reason: DeathReason): void {
    if (!victim.alive) return;
    const g = this.grid;
    victim.alive = false;
    victim.deathTime = this.time;
    const steal = reason === 'trail' && !!killer && killer !== victim && killer.alive;
    let taken = 0;
    if (steal && killer) taken = this.transferLand(victim, killer);
    else {
      for (const c of victim.trail) {
        if (g.trail[c] === victim.id) g.trail[c] = 0;
      }
      const b = victim.bbox;
      for (let y = Math.max(0, b.y0); y < Math.min(g.h, b.y1); y++) {
        for (let x = Math.max(0, b.x0); x < Math.min(g.w, b.x1); x++) {
          const i = y * g.w + x;
          if (g.owner[i] === victim.id) {
            g.setOwner(i, EMPTY);
            g.capTime[i] = -100;
          }
        }
      }
    }
    victim.trail.length = 0;
    victim.trailPts.length = 0;
    if (killer && killer !== victim) killer.kills++;
    this.events.push({ type: 'kill', victim, killer, reason, x: victim.x, y: victim.y, taken });
  }

  /**
   * The cutter inherits the victim's land, plus the attacking trail they were
   * drawing. The ripple starts at the cut so the steal reads instantly.
   */
  private transferLand(from: Player, to: Player): number {
    const g = this.grid;
    const ax = from.x;
    const ay = from.y;
    let n = 0;
    const give = (i: number) => {
      const o = g.owner[i];
      if (o === VOID || o === ROCK || o === to.id) {
        if (g.trail[i] === from.id) g.trail[i] = 0;
        return;
      }
      if (o !== from.id && o !== EMPTY) return;
      if (o === EMPTY && g.trail[i] !== from.id) return;
      g.trail[i] = 0;
      g.setOwner(i, to.id);
      const x = i % g.w;
      const y = (i - x) / g.w;
      g.capTime[i] = this.time + Math.hypot(x - ax, y - ay) / RIPPLE_SPEED;
      const box = to.bbox;
      if (x < box.x0) box.x0 = x;
      if (y < box.y0) box.y0 = y;
      if (x + 1 > box.x1) box.x1 = x + 1;
      if (y + 1 > box.y1) box.y1 = y + 1;
      n++;
    };
    const b = from.bbox;
    for (let y = Math.max(0, b.y0); y < Math.min(g.h, b.y1); y++) {
      for (let x = Math.max(0, b.x0); x < Math.min(g.w, b.x1); x++) {
        const i = y * g.w + x;
        if (g.owner[i] === from.id) give(i);
      }
    }
    for (const c of from.trail) {
      if (g.trail[c] === from.id || g.owner[c] === from.id) give(c);
    }
    return n;
  }

  private headOnCollisions(): void {
    const ps = this.players;
    for (let a = 0; a < ps.length; a++) {
      const A = ps[a];
      if (!A.alive) continue;
      for (let b = a + 1; b < ps.length; b++) {
        const B = ps[b];
        if (!B.alive || this.allied(A, B)) continue;
        const dx = A.x - B.x;
        const dy = A.y - B.y;
        if (dx * dx + dy * dy > HEAD_HIT_DIST * HEAD_HIT_DIST) continue;
        if (A.inside && B.inside) continue;
        if (A.inside) {
          if (!this.shielded(B)) this.kill(B, A, 'head');
        } else if (B.inside) {
          if (!this.shielded(A)) this.kill(A, B, 'head');
        } else {
          const ca = this.grid.counts[A.id];
          const cb = this.grid.counts[B.id];
          if (ca <= cb && !this.shielded(A)) this.kill(A, B, 'head');
          if (cb <= ca && !this.shielded(B)) this.kill(B, A, 'head');
        }
        if (!A.alive) break;
      }
    }
  }
}
