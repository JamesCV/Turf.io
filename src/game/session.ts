import { CHAR_BY_ID, CHARACTERS } from '../content/characters';
import { BOT_NAMES } from '../content/names';
import { haptic } from '../platform/haptics';
import { sfx } from '../platform/audio';
import { Particles } from '../render/particles';
import type { Renderer } from '../render/renderer';
import { makeBotController, rollPersonality, type Difficulty } from '../sim/bot';
import type { MapSpec } from '../sim/maps';
import { World, type AbilityId, type Loadout, type Player, type WorldEvent } from '../sim/world';
import { CameraRig } from './camera';
import type { Input } from './input';
import { applySnapshot, type NetSnapshot } from './netstate';

export type Mode = 'classic' | 'arena' | 'conquest' | 'attract' | 'free' | 'party' | 'ranked';

export interface RemoteSeat {
  name: string;
  team: number;
  charId: string;
  key: string;
}

export interface MatchConfig {
  mode: Mode;
  map: MapSpec;
  bots: number;
  difficulty: Difficulty[];
  /** Arena / timed modes: match length in seconds. */
  duration?: number;
  /** Conquest: share needed to win. */
  goal?: number;
  /** Free play, party, ranked: share of the whole map that ends it. */
  winShare?: number;
  boss?: { name: string; charId: string };
  levelId?: string;
  /** Bring the local player back after a cut. */
  respawnYou?: boolean;
  /** Replace dead bots. Defaults on, so older modes keep their lobbies full. */
  respawnBots?: boolean;
  /** Two sides. Allies share a team id and cannot cut each other. */
  teams?: boolean;
  remotes?: RemoteSeat[];
  /** Local player's team in a party match. */
  youTeam?: number;
  /** Render a host snapshot. The guest does not step the simulation. */
  observe?: boolean;
  /** Name shown on the leaderboard for the local player. */
  youName?: string;
  /** Ability button when the local player is not spawned yet (a party guest). */
  ability?: AbilityId | null;
}

export interface MatchResult {
  mode: Mode;
  won: boolean;
  rank: number;
  /** Best leaderboard position reached during the match. */
  bestRank: number;
  players: number;
  bestShare: number;
  finalShare: number;
  kills: number;
  time: number;
  levelId?: string;
  killedBy?: string;
}

export interface FeedItem {
  text: string;
  color: string;
  you: boolean;
  t: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  big: boolean;
}

const DT = 1 / 60;
const ABILITIES: AbilityId[] = ['dash', 'shield', 'freeze'];

export class Session {
  readonly world: World;
  readonly cam = new CameraRig();
  readonly particles = new Particles();
  you: Player | null = null;
  over = false;
  paused = false;
  /** Seconds of play (excludes pause). */
  elapsed = 0;
  feed: FeedItem[] = [];
  bestShare = 0;
  kills = 0;
  bestRank = 999;
  /** Seconds until respawn (arena) or null. */
  respawnIn: number | null = null;
  youDiedAt: number | null = null;
  lastKiller = '';
  boss: Player | null = null;
  danger = 0;

  private acc = 0;
  private alpha = 1;
  private floats: FloatText[] = [];
  private respawns: { at: number; team: number }[] = [];
  private remoteWaits: { at: number; seat: RemoteSeat }[] = [];
  private guestAlpha = 1;
  private usedNames = new Set<string>();
  private attractTarget: Player | null = null;
  private attractSwitch = 0;
  private endTimer: number | null = null;
  private result: MatchResult | null = null;

  constructor(
    readonly cfg: MatchConfig,
    private loadout: Loadout | null,
    private onEnd: (r: MatchResult) => void = () => {},
  ) {
    this.world = new World(cfg.map);
    if (!cfg.observe) {
      if (cfg.boss) this.spawnBoss();
      if (cfg.mode === 'party') {
        if (loadout) {
          this.spawnYou();
          if (this.you) this.you.team = cfg.youTeam ?? 1;
        }
        for (const seat of cfg.remotes ?? []) this.spawnRemote(seat);
        const allies = (this.you && this.you.team === 1 ? 1 : 0) + (cfg.remotes ?? []).filter((r) => r.team === 1).length;
        const enemies = (cfg.remotes ?? []).filter((r) => r.team === 2).length;
        for (let i = allies; i < 3; i++) this.spawnBot(1);
        for (let i = enemies; i < 3; i++) this.spawnBot(2);
      } else {
        for (let i = 0; i < cfg.bots; i++) this.spawnBot();
        if (loadout) this.spawnYou();
      }
    }
    const focus = this.you ?? this.world.players[0];
    if (focus) this.cam.snap(focus.x, focus.y);
    this.cam.zoom = 18;
  }

  private botName(): string {
    const r = this.world.rng;
    for (let i = 0; i < 12; i++) {
      const n = r.pick(BOT_NAMES);
      if (!this.usedNames.has(n)) {
        this.usedNames.add(n);
        return n;
      }
    }
    return r.pick(BOT_NAMES) + r.int(2, 99);
  }

  private spawnBot(team = 0): Player | null {
    const r = this.world.rng;
    const char = r.pick(CHARACTERS);
    const ranked = this.cfg.mode === 'ranked';
    const loadout: Loadout = {
      charId: char.id,
      ability: r.chance(0.8) ? r.pick(ABILITIES) : null,
      abilityPower: 1,
      cooldownMul: ranked ? 1 : 1.15,
      startRadius: ranked ? 3.5 : r.range(3, 4.2),
    };
    const p = this.world.addPlayer(this.botName(), true, loadout);
    if (!p) return null;
    p.team = team;
    p.controller = makeBotController(rollPersonality(this.world, r.pick(this.cfg.difficulty)));
    return p;
  }

  private spawnRemote(seat: RemoteSeat): Player | null {
    const loadout: Loadout = {
      charId: CHAR_BY_ID[seat.charId] ? seat.charId : 'pip',
      ability: 'dash',
      abilityPower: 1,
      cooldownMul: 1,
      startRadius: 3.5,
    };
    const p = this.world.addPlayer(seat.name, false, loadout);
    if (!p) return null;
    p.team = seat.team;
    p.netKey = seat.key;
    return p;
  }

  private spawnBoss(): Player | null {
    const b = this.cfg.boss!;
    const w = this.world;
    const loadout: Loadout = { charId: b.charId, ability: 'dash', abilityPower: 1.2, cooldownMul: 0.8, startRadius: 9 };
    const p = w.addPlayer(b.name, true, loadout);
    if (!p) return null;
    p.tag = 'boss';
    p.controller = makeBotController(rollPersonality(w, 'boss'));
    this.boss = p;
    return p;
  }

  private spawnYou(): void {
    if (!this.loadout) return;
    if (this.you && !this.you.alive) this.world.reap(this.you);
    const p = this.world.addPlayer(this.cfg.youName || 'You', false, this.loadout);
    if (!p) return;
    this.you = p;
    this.respawnIn = null;
    this.youDiedAt = null;
    this.cam.shake(0.25);
  }

  get youAlive(): boolean {
    return !!this.you && this.you.alive;
  }

  /** Territory ranking of living players. */
  ranking(): Player[] {
    const w = this.world;
    return w.players.filter((p) => p.alive).sort((a, b) => w.cells(b) - w.cells(a) || a.id - b.id);
  }

  /** Living players by land, then the players who have already been cut. */
  standings(): Player[] {
    const w = this.world;
    const dead = w.players.filter((p) => !p.alive).sort((a, b) => b.deathTime - a.deathTime);
    return [...this.ranking(), ...dead];
  }

  teamShare(team: number): number {
    if (!team) return 0;
    let n = 0;
    for (const p of this.world.players) if (p.alive && p.team === team) n += this.world.cells(p);
    return n / this.world.grid.playable;
  }

  /** Point a remote human along the angle their phone sent. */
  setRemoteAngle(key: string, angle: number | null): void {
    if (angle === null) return;
    const p = this.world.players.find((q) => q.netKey === key && q.alive);
    if (p) p.targetAngle = angle;
  }

  remoteAbility(key: string): void {
    const p = this.world.players.find((q) => q.netKey === key && q.alive);
    if (p) this.world.useAbility(p);
  }

  /** Guest: adopt a host snapshot and keep the camera on your character. */
  applyNet(snap: NetSnapshot, youKey: string): void {
    applySnapshot(this.world, snap, this.alpha);
    const you = this.world.players.find((p) => p.netKey === youKey);
    if (you) this.you = you;
    this.elapsed = snap.t;
    if (you && you.alive) {
      const share = this.cfg.teams ? this.teamShare(you.team) : this.world.share(you);
      if (share > this.bestShare) this.bestShare = share;
      const rank = this.ranking().indexOf(you) + 1;
      if (rank > 0 && rank < this.bestRank) this.bestRank = rank;
    }
    this.guestAlpha = 0;
    this.alpha = 0;
    if (snap.over) this.forceFinish();
  }

  /** End from the current board. Used when a host tells guests the match is over. */
  forceFinish(): void {
    if (this.over || !this.you) return;
    const you = this.you;
    const youLead = this.cfg.teams
      ? this.teamShare(you.team) > this.teamShare(you.team === 1 ? 2 : 1)
      : this.ranking()[0] === you;
    this.finish(youLead);
  }

  update(frameDt: number, input: Input | null, minSide: number): void {
    if (this.paused) return;
    const dt = Math.min(frameDt, 0.1);
    if (this.cfg.observe) {
      this.guestAlpha = Math.min(1, this.guestAlpha + dt / 0.066);
      this.alpha = this.guestAlpha;
      this.particles.update(dt);
      this.updateCamera(dt, minSide);
      return;
    }
    this.acc += dt;
    let steps = 0;
    while (this.acc >= DT && steps < 6) {
      this.acc -= DT;
      steps++;
      this.tick(input);
    }
    this.alpha = this.acc / DT;
    this.particles.update(dt);
    for (const f of this.floats) f.t += dt;
    this.floats = this.floats.filter((f) => f.t < 1.4);
    const now = performance.now() / 1000;
    this.feed = this.feed.filter((f) => now - f.t < 4.5);
    this.updateCamera(dt, minSide);
  }

  private tick(input: Input | null): void {
    const w = this.world;
    const you = this.you;
    if (you && you.alive && input && !this.over) {
      input.poll();
      if (input.angle !== null) you.targetAngle = input.angle;
      if (input.consumeAbility()) this.tryAbility();
    }
    w.step(DT);
    if (!this.over) this.elapsed += DT;
    for (const e of w.events) this.handle(e);
    w.events.length = 0;

    // Backfill bots.
    const now = w.time;
    this.respawns = this.respawns.filter((job) => {
      if (job.at > now) return true;
      return !this.spawnBot(job.team);
    });
    this.remoteWaits = this.remoteWaits.filter((w) => {
      if (w.at > now) return true;
      return !this.spawnRemote(w.seat);
    });

    if (you && you.alive) {
      const share = w.share(you);
      if (share > this.bestShare) this.bestShare = share;
      const rank = this.ranking().indexOf(you) + 1;
      if (rank > 0 && rank < this.bestRank) this.bestRank = rank;
      this.danger = this.computeDanger(you);
    } else {
      this.danger = 0;
    }

    if (this.respawnIn !== null) {
      this.respawnIn -= DT;
      if (this.respawnIn <= 0) this.spawnYou();
    }
    this.checkEnd();
    if (this.endTimer !== null) {
      this.endTimer -= DT;
      if (this.endTimer <= 0 && this.result) {
        this.endTimer = null;
        this.onEnd(this.result);
      }
    }
  }

  tryAbility(): void {
    const you = this.you;
    if (you && this.world.useAbility(you)) {
      sfx.ability();
      haptic.light();
    }
  }

  private computeDanger(you: Player): number {
    if (you.inside || you.trailPts.length < 2) return 0;
    let best = Infinity;
    const pts = you.trailPts;
    for (const o of this.world.players) {
      if (o === you || !o.alive || this.world.allied(you, o)) continue;
      if (Math.hypot(o.x - you.x, o.y - you.y) > 40) continue;
      for (let k = 0; k < pts.length; k += 4) {
        best = Math.min(best, Math.hypot(o.x - pts[k], o.y - pts[k + 1]));
      }
    }
    return best < 10 ? 1 - best / 10 : 0;
  }

  private handle(e: WorldEvent): void {
    const you = this.you;
    const w = this.world;
    switch (e.type) {
      case 'capture': {
        const c = CHAR_BY_ID[e.p.loadout.charId];
        const n = Math.min(70, 8 + e.cells / 6);
        if (this.near(e.x, e.y)) {
          this.particles.burst(e.x, e.y, {
            count: n, colors: [c.c1, c.c2, '#ffffff'], speed: [3, 10 + Math.min(12, e.cells / 20)],
            size: [0.12, 0.3], life: [0.35, 0.8], square: 0.3, drag: 4,
          });
        }
        if (e.p === you) {
          const pct = (e.cells / w.grid.playable) * 100;
          sfx.capture(Math.min(1, e.cells / 400));
          haptic.light();
          if (pct >= 0.05) this.float(e.x, e.y, `+${pct < 1 ? pct.toFixed(2) : pct.toFixed(1)}%`, c.c1, pct > 2);
        }
        break;
      }
      case 'kill': {
        const v = e.victim;
        const c = CHAR_BY_ID[v.loadout.charId];
        if (this.near(e.x, e.y)) {
          this.particles.burst(e.x, e.y, {
            count: 46, colors: [c.c1, c.c2, c.c1, '#ffffff'], speed: [4, 16], size: [0.14, 0.4],
            life: [0.5, 1.1], square: 0.6, drag: 3.2,
          });
          this.particles.burst(e.x, e.y, { count: 18, colors: ['#ffffff'], speed: [10, 14], size: [0.1, 0.16], life: [0.25, 0.4], drag: 6 });
        }
        const killer = e.killer;
        let text: string;
        if (e.reason === 'self') text = `${v.name} tripped over their own trail`;
        else if (e.reason === 'wiped') text = `${killer?.name ?? '?'} swallowed ${v.name}`;
        else if (e.reason === 'head') text = `${killer?.name ?? '?'} bumped out ${v.name}`;
        else text = `${killer?.name ?? '?'} took ${v.name}'s turf`;
        const involvesYou = v === you || killer === you;
        this.feed.push({ text, color: CHAR_BY_ID[(killer ?? v).loadout.charId].c1, you: involvesYou, t: performance.now() / 1000 });
        if (this.feed.length > 5) this.feed.shift();

        if (killer === you && v !== you) {
          this.kills++;
          sfx.kill();
          haptic.medium();
          this.cam.shake(0.35);
          this.float(e.x, e.y, v.tag === 'boss' ? 'BOSS DOWN!' : 'TURF STOLEN', '#ffffff', true);
          if (e.taken > 0) {
            const gained = (e.taken / w.grid.playable) * 100;
            this.float(e.x, e.y - 1.4, `+${gained < 10 ? gained.toFixed(1) : Math.round(gained)}%`, '#ffd23f', gained > 4);
          }
        }
        if (v === you) {
          sfx.death();
          haptic.error();
          this.cam.shake(0.8);
          this.youDiedAt = w.time;
          this.lastKiller = e.reason === 'self' ? 'your own trail' : killer?.name ?? 'the unknown';
          if ((this.cfg.mode === 'arena' || this.cfg.respawnYou) && !this.over) this.respawnIn = 2.2;
        }
        if (v.isBot) {
          if (v.tag === 'boss') {
            if (killer !== you && !this.over) {
              this.boss = null;
              this.respawnBoss();
            }
            const vv = v;
            setTimeout(() => this.world.reap(vv), 0);
          } else if (this.cfg.respawnBots !== false) {
            this.respawns.push({ at: w.time + w.rng.range(1.2, 3.5), team: v.team });
            const vv = v;
            setTimeout(() => this.world.reap(vv), 0);
          }
        } else if (v !== you && this.cfg.respawnYou && !this.over) {
          const seat = { name: v.name, team: v.team, charId: v.loadout.charId, key: v.netKey };
          this.remoteWaits.push({ at: w.time + 2.2, seat });
          const vv = v;
          setTimeout(() => this.world.reap(vv), 0);
        }
        break;
      }
      case 'ability': {
        const c = CHAR_BY_ID[e.p.loadout.charId];
        if (!this.near(e.p.x, e.p.y)) break;
        if (e.ability === 'freeze') {
          this.particles.burst(e.p.x, e.p.y, { count: 40, colors: ['#bfe9ff', '#ffffff', '#7cc8ff'], speed: [8, 14], size: [0.12, 0.25], life: [0.5, 0.8], square: 1, drag: 3 });
        } else if (e.ability === 'dash') {
          this.particles.burst(e.p.x, e.p.y, { count: 16, colors: [c.c1, '#ffffff'], speed: [2, 5], size: [0.12, 0.22], life: [0.3, 0.5] });
        } else {
          this.particles.burst(e.p.x, e.p.y, { count: 24, colors: ['#8fe3ff', '#ffffff'], speed: [1, 3], size: [0.1, 0.2], life: [0.4, 0.7], radius: 1.4 });
        }
        break;
      }
      case 'spawn':
        if (this.near(e.p.x, e.p.y)) {
          const c = CHAR_BY_ID[e.p.loadout.charId];
          this.particles.burst(e.p.x, e.p.y, { count: 20, colors: [c.c1, c.c2], speed: [3, 7], size: [0.12, 0.26], life: [0.3, 0.6], radius: 1 });
        }
        break;
    }
  }

  private respawnBoss(): void {
    setTimeout(() => {
      if (!this.over && !this.boss) {
        const b = this.spawnBoss();
        if (b) this.feed.push({ text: `${b.name} has returned!`, color: '#ffd23f', you: true, t: performance.now() / 1000 });
      }
    }, 3500);
  }

  private near(x: number, y: number): boolean {
    return Math.abs(x - this.cam.x) < 60 && Math.abs(y - this.cam.y) < 60;
  }

  private float(x: number, y: number, text: string, color: string, big = false): void {
    this.floats.push({ x, y, text, color, t: 0, big });
  }

  private finish(won: boolean): void {
    if (this.over) return;
    this.over = true;
    const w = this.world;
    const rankList = this.standings();
    const you = this.you;
    const rank = you ? rankList.indexOf(you) + 1 : this.bestRank === 999 ? rankList.length : this.bestRank;
    this.result = {
      mode: this.cfg.mode,
      won,
      rank: Math.max(1, rank),
      bestRank: Math.min(this.bestRank, Math.max(1, rank)),
      players: Math.max(1, rankList.length),
      bestShare: this.bestShare,
      finalShare: you && you.alive ? w.share(you) : 0,
      kills: this.kills,
      time: this.elapsed,
      levelId: this.cfg.levelId,
      killedBy: you && !you.alive ? this.lastKiller : undefined,
    };
    if (won) {
      sfx.win();
      haptic.success();
      if (you) {
        const c = CHAR_BY_ID[you.loadout.charId];
        for (let i = 0; i < 4; i++) {
          this.particles.burst(you.x + (Math.random() - 0.5) * 10, you.y + (Math.random() - 0.5) * 8, {
            count: 40, colors: [c.c1, c.c2, '#ffd23f', '#ffffff'], speed: [5, 16], size: [0.15, 0.35], life: [0.8, 1.6], square: 0.7, drag: 2,
          });
        }
      }
    }
    this.endTimer = won ? 1.8 : 1.4;
  }

  private checkEnd(): void {
    if (this.over || !this.you) return;
    const cfg = this.cfg;
    const you = this.you;
    if (cfg.mode === 'classic') {
      if (!you.alive) this.finish(false);
    } else if (cfg.mode === 'arena') {
      if (this.elapsed >= (cfg.duration ?? 180)) {
        const alive = you.alive;
        this.finish(alive && this.ranking()[0] === you);
      }
    } else if (cfg.mode === 'conquest') {
      if (!you.alive) this.finish(false);
      else if (cfg.boss) {
        if (this.boss && !this.boss.alive && this.boss.deathTime > 0 && this.kills > 0) this.finish(true);
      } else if (this.world.share(you) >= (cfg.goal ?? 0.25)) this.finish(true);
    } else if (cfg.mode === 'free' || cfg.mode === 'party' || cfg.mode === 'ranked') {
      const winShare = cfg.winShare ?? 0.995;
      const youShare = cfg.teams ? this.teamShare(you.team) : you.alive ? this.world.share(you) : 0;
      let best = youShare;
      let youLead = false;
      if (cfg.teams) {
        const other = this.teamShare(you.team === 1 ? 2 : 1);
        best = Math.max(youShare, other);
        youLead = youShare > other;
      } else {
        const top = this.ranking()[0];
        best = top ? this.world.share(top) : 0;
        youLead = !!top && top === you;
      }
      if (best >= winShare) this.finish(youLead);
      else if (cfg.duration && this.elapsed >= cfg.duration) this.finish(youLead);
    }
  }

  /** Time left in an arena match. */
  get timeLeft(): number {
    return Math.max(0, (this.cfg.duration ?? 0) - this.elapsed);
  }

  private updateCamera(dt: number, minSide: number): void {
    const w = this.world;
    let target: Player | null = this.you && this.you.alive ? this.you : null;
    if (!target && (this.cfg.mode === 'free' || this.cfg.mode === 'party' || this.cfg.mode === 'ranked')) {
      target = this.ranking()[0] ?? null;
    }
    if (!target && this.cfg.mode === 'attract') {
      this.attractSwitch -= dt;
      if (!this.attractTarget || !this.attractTarget.alive || this.attractSwitch <= 0) {
        const r = this.ranking();
        this.attractTarget = r[Math.min(r.length - 1, Math.floor(Math.random() * Math.min(4, r.length)))] ?? null;
        this.attractSwitch = 14;
      }
      target = this.attractTarget;
    }
    let viewCells = 30;
    if (target) {
      const lx = target.px + (target.x - target.px) * this.alpha;
      const ly = target.py + (target.y - target.py) * this.alpha;
      const lead = 2.2;
      const tx = lx + Math.cos(target.angle) * lead;
      const ty = ly + Math.sin(target.angle) * lead;
      viewCells = 21 + Math.min(16, Math.sqrt(w.cells(target)) * 0.22);
      if (w.time < target.dashUntil) viewCells += 3;
      if (this.cfg.mode === 'attract') viewCells = 34;
      this.cam.update(dt, tx, ty, viewCells, minSide);
    } else {
      this.cam.update(dt, this.cam.x, this.cam.y, 30, minSide);
    }
  }

  render(r: Renderer, time: number): void {
    r.draw({ world: this.world, cam: this.cam.view, alpha: this.alpha, time, youId: this.you?.alive ? this.you.id : -1, particles: this.particles });
  }

  /** Names, floating texts and the joystick, drawn on the 2D overlay (CSS px). */
  renderOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, input: Input | null): void {
    const cam = this.cam.view;
    const z = cam.zoom;
    const toS = (x: number, y: number) => [(x - cam.x) * z + w / 2, (y - cam.y) * z + h / 2];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const fs = Math.max(10, Math.min(14, z * 0.8));
    ctx.font = `700 ${fs}px "Baloo 2", ui-rounded, system-ui, sans-serif`;
    for (const p of this.world.players) {
      if (!p.alive || this.cfg.mode === 'attract') continue;
      const lx = p.px + (p.x - p.px) * this.alpha;
      const ly = p.py + (p.y - p.py) * this.alpha;
      const [sx, sy] = toS(lx, ly);
      if (sx < -60 || sy < -60 || sx > w + 60 || sy > h + 60) continue;
      const boss = p.tag === 'boss';
      const yOff = (boss ? 2.2 : 1.6) * z;
      const label = boss ? `👑 ${p.name}` : p.name;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(20,16,40,0.55)';
      ctx.strokeText(label, sx, sy + yOff);
      ctx.fillStyle = p === this.you ? '#fff7b0' : '#ffffff';
      ctx.fillText(label, sx, sy + yOff);
    }
    for (const f of this.floats) {
      const [sx, sy] = toS(f.x, f.y);
      const t = f.t / 1.4;
      const s = (f.big ? 26 : 18) * (t < 0.15 ? 0.6 + (t / 0.15) * 0.5 : 1.1 - t * 0.1);
      ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      ctx.font = `800 ${s}px "Baloo 2", ui-rounded, system-ui, sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(20,16,40,0.7)';
      ctx.strokeText(f.text, sx, sy - t * 40);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, sx, sy - t * 40);
      ctx.globalAlpha = 1;
    }
    const st = input?.stick;
    if (st && this.youAlive) {
      ctx.beginPath();
      ctx.arc(st.ox, st.oy, 64, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(st.x, st.y, 24, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fill();
    }
  }

  youScreenPos(w: number, h: number): { x: number; y: number } {
    const cam = this.cam.view;
    const p = this.you;
    if (!p) return { x: w / 2, y: h / 2 };
    return { x: (p.x - cam.x) * cam.zoom + w / 2, y: (p.y - cam.y) * cam.zoom + h / 2 };
  }
}
