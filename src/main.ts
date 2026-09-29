import './ui/styles.css';
import { Capacitor } from '@capacitor/core';
import { CHARACTERS } from './content/characters';
import { ALL_LEVELS, LEVEL_BY_ID } from './content/levels';
import { Input } from './game/input';
import { captureSnapshot, type NetSnapshot } from './game/netstate';
import { Session, type MatchConfig, type MatchResult, type RemoteSeat } from './game/session';
import { claimDaily, currentLoadout, loadProfile, profile, rankedLoadout } from './meta/profile';
import { grantRewards } from './meta/rewards';
import { sfx } from './platform/audio';
import { setHapticsEnabled } from './platform/haptics';
import { PartyRoom } from './platform/room';
import { Renderer } from './render/renderer';
import { makeBotController, rollPersonality } from './sim/bot';
import type { MapShape } from './sim/maps';
import { h } from './ui/dom';
import { Hud } from './ui/hud';
import {
  charsScreen,
  conquestScreen,
  finderScreen,
  levelIntroModal,
  menuScreen,
  partyScreen,
  pauseModal,
  resultsModal,
  settingsScreen,
  upgradesScreen,
  type AppApi,
  type ScreenId,
} from './ui/screens';

const $ = (id: string) => document.getElementById(id)!;

class App implements AppApi {
  private renderer: Renderer;
  private overlay = $('overlay') as HTMLCanvasElement;
  private octx = this.overlay.getContext('2d')!;
  private screens = $('screens');
  private hudEl = $('hud');
  private dangerEl = $('danger');
  private cards: Record<string, string> = {};
  private session: Session;
  private input: Input | null = null;
  private hud: Hud | null = null;
  private inMatch = false;
  private lastCfg: MatchConfig | null = null;
  private room: PartyRoom | null = null;
  private netRole: 'host' | 'guest' | null = null;
  private youKey = '';
  private searchTimer = 0;
  private netAcc = 0;
  private gridAcc = 1;
  private lastSentAngle: number | null = null;
  private pendingSnap: NetSnapshot | null = null;
  private cssW = 1;
  private cssH = 1;
  private last = performance.now();
  private quality = 1; // dynamic resolution scale
  private slowFrames = 0;
  private fastFrames = 0;

  constructor() {
    const canvas = $('gl') as HTMLCanvasElement;
    // iOS may drop the GL context when backgrounded; progress is saved, so just reload.
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
    canvas.addEventListener('webglcontextrestored', () => location.reload());
    this.renderer = new Renderer(canvas);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.inMatch && !this.session.over) this.pause();
    });
    // First touch anywhere unlocks audio on iOS.
    window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });

    for (const c of CHARACTERS) this.cards[c.id] = this.renderer.renderCard(c.id, 256);
    this.session = this.attract();
    this.applySettings();
    const daily = claimDaily();
    this.show('menu');
    if (daily) {
      setTimeout(() => this.toast(`Daily reward (day ${daily.streak}): +${daily.coins} coins${daily.gems ? ` +${daily.gems} gems` : ''}`), 600);
    }
    requestAnimationFrame(this.frame);
  }

  private applySettings(): void {
    sfx.enabled = profile.settings.sound;
    setHapticsEnabled(profile.settings.haptics);
  }

  card(id: string): string {
    return this.cards[id];
  }

  private resize(): void {
    this.cssW = window.innerWidth;
    this.cssH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.renderer.resize(this.cssW, this.cssH, dpr * this.quality);
    this.overlay.width = Math.round(this.cssW * dpr);
    this.overlay.height = Math.round(this.cssH * dpr);
    this.octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private attract(): Session {
    return new Session(
      {
        mode: 'attract',
        map: { shape: 'circle', size: 220, rocks: 5, seed: (Math.random() * 1e9) | 0 },
        bots: 16,
        difficulty: ['normal', 'hard'],
      },
      null,
    );
  }

  // ---------------------------------------------------------------- screens

  show(id: ScreenId): void {
    let el: HTMLElement;
    switch (id) {
      case 'menu':
        el = menuScreen(this);
        break;
      case 'chars':
        el = charsScreen(this);
        break;
      case 'upgrades':
        el = upgradesScreen(this);
        break;
      case 'conquest':
        el = conquestScreen(this);
        break;
      case 'settings':
        el = settingsScreen(this, () => this.applySettings());
        break;
    }
    this.screens.replaceChildren(el);
  }

  toast(text: string): void {
    const t = h('div', { class: 'toast' }, text);
    $('toasts').append(t);
    setTimeout(() => {
      t.style.transition = 'opacity 0.3s';
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 300);
    }, 2200);
  }

  // ---------------------------------------------------------------- matches

  playFree(): void {
    this.queueSearch('Connecting to an open lobby', 'The table fills as soon as a seat is free. Own the whole map.', () => {
      this.start({
        mode: 'free',
        map: { shape: 'circle', size: 200, rocks: 6, seed: (Math.random() * 1e9) | 0 },
        bots: 9,
        difficulty: ['easy', 'normal', 'normal', 'hard'],
        duration: 300,
        winShare: 0.995,
        respawnYou: true,
        respawnBots: true,
        youName: profile.name,
      });
    });
  }

  playRanked(): void {
    this.queueSearch('Finding a ranked lobby', 'Same loadout for everyone. Your rating moves with the finish.', () => {
      this.start({
        mode: 'ranked',
        map: { shape: 'circle', size: 190, rocks: 5, seed: (Math.random() * 1e9) | 0 },
        bots: 7,
        difficulty: ['normal', 'normal', 'hard'],
        duration: 210,
        winShare: 0.995,
        respawnYou: false,
        respawnBots: false,
        youName: profile.name,
      }, rankedLoadout());
    });
  }

  playParty(): void {
    this.dropRoom();
    this.showParty('pick');
  }

  private queueSearch(title: string, detail: string, go: () => void): void {
    window.clearTimeout(this.searchTimer);
    this.dropRoom();
    this.screens.replaceChildren(finderScreen(title, detail, () => {
      window.clearTimeout(this.searchTimer);
      this.goHome();
    }));
    this.searchTimer = window.setTimeout(go, 720);
  }

  private showParty(phase: 'pick' | 'room'): void {
    const room = this.room;
    this.screens.replaceChildren(partyScreen({
      phase,
      code: room?.code ?? '',
      status: room?.status ?? '',
      seats: (room?.seats ?? []).map((s) => ({ name: s.name, team: s.team, self: s.self })),
      host: !!room?.isHost,
      onHost: () => void this.hostParty(),
      onJoin: (code) => void this.joinParty(code),
      onStart: () => this.beginParty(),
      onLeave: () => this.goHome(),
    }));
  }

  private bindRoom(room: PartyRoom): void {
    room.onRoster = () => {
      if (!this.inMatch) this.showParty('room');
    };
    room.onInput = (from, angle, ability) => {
      this.session.setRemoteAngle(from, angle);
      if (ability) this.session.remoteAbility(from);
    };
    room.onState = (snap) => {
      if (this.netRole === 'guest' && this.inMatch) this.session.applyNet(snap, this.youKey);
      else this.pendingSnap = snap;
    };
    room.onStart = (msg) => {
      this.youKey = msg.youKey;
      this.startGuest(msg.spec);
      if (this.pendingSnap) this.session.applyNet(this.pendingSnap, this.youKey);
    };
  }

  private async hostParty(): Promise<void> {
    const room = new PartyRoom();
    this.room = room;
    this.bindRoom(room);
    this.screens.replaceChildren(finderScreen('Opening a party', 'Share the code once it appears.', () => this.goHome()));
    try {
      await room.host(profile.name, profile.charId);
      if (this.room !== room) return;
      this.netRole = 'host';
      this.showParty('room');
    } catch (e) {
      this.toast(e instanceof Error ? e.message : 'Could not open a party.');
      this.goHome();
    }
  }

  private async joinParty(code: string): Promise<void> {
    const room = new PartyRoom();
    this.room = room;
    this.bindRoom(room);
    this.screens.replaceChildren(finderScreen('Joining party', code.toUpperCase(), () => this.goHome()));
    try {
      await room.join(code, profile.name, profile.charId);
      if (this.room !== room) return;
      this.netRole = 'guest';
      this.showParty('room');
    } catch (e) {
      this.toast(e instanceof Error ? e.message : 'Could not join that party.');
      this.dropRoom();
      this.showParty('pick');
    }
  }

  private partySpec(seed = (Math.random() * 1e9) | 0) {
    return { shape: 'circle' as MapShape, size: 168, rocks: 4, seed };
  }

  private beginParty(seed?: number): void {
    const room = this.room;
    if (!room?.isHost) return;
    const spec = this.partySpec(seed);
    room.locked = true;
    if (room.live) room.sendStart(spec);
    const remotes: RemoteSeat[] = room.remotes().map((s) => ({
      name: s.name,
      team: s.team,
      charId: s.charId,
      key: s.key,
    }));
    this.youKey = 'host';
    this.gridAcc = 1;
    this.start({
      mode: 'party',
      map: spec,
      bots: 0,
      difficulty: ['normal', 'hard'],
      duration: 240,
      winShare: 0.995,
      respawnYou: true,
      respawnBots: true,
      teams: true,
      youTeam: 1,
      remotes,
      youName: profile.name,
    });
  }

  private startGuest(spec: { shape: string; size: number; rocks: number; seed: number }): void {
    this.gridAcc = 1;
    this.start({
      mode: 'party',
      map: { shape: spec.shape as MapShape, size: spec.size, rocks: spec.rocks, seed: spec.seed },
      bots: 0,
      difficulty: ['normal'],
      duration: 240,
      winShare: 0.995,
      respawnYou: true,
      teams: true,
      youTeam: 1,
      observe: true,
      youName: profile.name,
      ability: profile.ability,
    });
  }

  playClassic(): void {
    this.start({
      mode: 'classic',
      map: { shape: 'circle', size: 340, rocks: 10, seed: (Math.random() * 1e9) | 0 },
      bots: 24,
      difficulty: ['easy', 'normal', 'normal', 'hard'],
    });
  }

  playArena(): void {
    const shapes = ['hexagon', 'flower', 'square', 'islands'] as const;
    this.start({
      mode: 'arena',
      map: { shape: shapes[(Math.random() * shapes.length) | 0], size: 260, rocks: 6, seed: (Math.random() * 1e9) | 0 },
      bots: 14,
      difficulty: ['normal', 'normal', 'hard'],
      duration: 180,
    });
  }

  playLevel(id: string): void {
    const l = LEVEL_BY_ID[id];
    const wrap = levelIntroModal(
      id,
      () => {
        wrap.remove();
        this.start({
          mode: 'conquest',
          map: { shape: l.shape, size: l.size, rocks: l.rocks, seed: 1000 + ALL_LEVELS.indexOf(l) * 7919 },
          bots: l.bots,
          difficulty: l.difficulty,
          goal: l.goal,
          boss: l.boss,
          levelId: l.id,
        });
      },
      () => wrap.remove(),
    );
    this.screens.append(wrap);
  }

  private start(cfg: MatchConfig, loadout = currentLoadout()): void {
    window.clearTimeout(this.searchTimer);
    this.endMatch();
    this.lastCfg = cfg;
    this.screens.replaceChildren();
    this.netAcc = 1;
    this.replaceSession(new Session(cfg, cfg.observe ? null : loadout, (r) => this.onEnd(r)));
    const s = this.session;
    this.input = new Input($('gl'), () => s.youScreenPos(this.cssW, this.cssH));
    this.hud = new Hud(s, () => this.pause(), () => {
      if (this.netRole === 'guest') this.room?.send({ type: 'input', angle: this.input?.angle ?? null, ability: true });
      else s.tryAbility();
    });
    this.hudEl.replaceChildren(this.hud.root);
    this.inMatch = true;
  }

  private endMatch(): void {
    this.input?.dispose();
    this.input = null;
    this.hud = null;
    this.hudEl.replaceChildren();
    this.dangerEl.style.opacity = '0';
    this.inMatch = false;
  }

  private pause(): void {
    if (!this.inMatch || this.session.paused) return;
    const guest = this.netRole === 'guest';
    if (!guest) this.session.paused = true;
    else if (this.input) this.input.enabled = false;
    const m = pauseModal({
      resume: () => {
        m.remove();
        if (!guest) this.session.paused = false;
        else if (this.input) this.input.enabled = true;
        this.last = performance.now();
      },
      quit: () => {
        m.remove();
        this.goHome();
      },
    });
    this.screens.append(m);
  }

  private goHome(): void {
    window.clearTimeout(this.searchTimer);
    this.endMatch();
    this.dropRoom();
    this.replaceSession(this.attract());
    this.show('menu');
  }

  private dropRoom(): void {
    this.room?.close();
    this.room = null;
    this.netRole = null;
    this.pendingSnap = null;
    this.youKey = '';
  }

  private replaceSession(next: Session): void {
    this.renderer.release(this.session.world.grid);
    this.session = next;
  }

  private onEnd(r: MatchResult): void {
    if (this.input) this.input.enabled = false;
    const rw = grantRewards(r);
    let next: (() => void) | undefined;
    if (r.mode === 'conquest' && r.won && r.levelId) {
      const i = ALL_LEVELS.findIndex((l) => l.id === r.levelId);
      const n = ALL_LEVELS[i + 1];
      if (n) next = () => this.playLevel(n.id);
    }
    const modal = resultsModal(r, rw, {
      again: () => {
        if (r.mode === 'conquest' && r.levelId) this.playLevel(r.levelId);
        else if (r.mode === 'party' && this.room?.isHost) this.beginParty();
        else if (r.mode === 'party' && this.netRole === 'guest') this.toast('Waiting for the host to start the next one');
        else if (this.lastCfg) {
          const loadout = r.mode === 'ranked' ? rankedLoadout() : currentLoadout();
          this.start({ ...this.lastCfg, map: { ...this.lastCfg.map, seed: (Math.random() * 1e9) | 0 } }, loadout);
        }
      },
      home: () => this.goHome(),
      next: next
        ? () => {
            modal.remove();
            next!();
          }
        : undefined,
    });
    this.hudEl.replaceChildren();
    this.screens.replaceChildren(modal);
  }

  /** Test hook: fast-forward the simulation (optionally with "you" on autopilot). */
  debugAdvance(seconds: number, autopilot = false): void {
    const s = this.session;
    if (autopilot && s.you) s.you.controller = makeBotController(rollPersonality(s.world, 'hard'));
    for (let t = 0; t < seconds; t += 1 / 60) s.update(1 / 60, null, Math.min(this.cssW, this.cssH));
  }

  // ---------------------------------------------------------------- loop

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const s = this.session;
    s.update(dt, this.inMatch ? this.input : null, Math.min(this.cssW, this.cssH));
    this.relay(dt);
    s.render(this.renderer, now / 1000);

    this.octx.clearRect(0, 0, this.cssW, this.cssH);
    if (this.inMatch) {
      s.renderOverlay(this.octx, this.cssW, this.cssH, this.input);
      this.hud?.update(dt);
      this.dangerEl.style.opacity = String(s.danger * (0.6 + 0.4 * Math.sin(now / 90)));
    } else {
      s.renderOverlay(this.octx, this.cssW, this.cssH, null);
    }
    this.adaptQuality(dt);
    requestAnimationFrame(this.frame);
  };

  /** Host streams the match. Guests send steering back. */
  private relay(dt: number): void {
    const room = this.room;
    if (!room?.live || !this.inMatch) return;
    if (this.netRole === 'host') {
      this.netAcc += dt;
      if (this.netAcc < 1 / 15) return;
      this.netAcc = 0;
      this.gridAcc += 1 / 15;
      const grid = this.gridAcc >= 0.45;
      if (grid) this.gridAcc = 0;
      const snap = captureSnapshot(this.session.world, grid, this.session.over);
      room.send({ type: 'state', t: snap.t, players: snap.players, rle: snap.rle, over: snap.over });
      return;
    }
    const input = this.input;
    if (this.netRole !== 'guest' || !input?.enabled) return;
    input.poll();
    const ability = input.consumeAbility();
    const angle = input.angle;
    this.netAcc += dt;
    if (!ability && this.netAcc < 1 / 20 && angle === this.lastSentAngle) return;
    this.netAcc = 0;
    this.lastSentAngle = angle;
    room.send({ type: 'input', angle, ability });
  }

  /** Drop render resolution on slow devices, recover when there is headroom. */
  private adaptQuality(dt: number): void {
    if (dt > 1 / 45) {
      this.slowFrames++;
      this.fastFrames = 0;
    } else {
      this.fastFrames++;
      this.slowFrames = Math.max(0, this.slowFrames - 1);
    }
    if (this.slowFrames > 40 && this.quality > 0.55) {
      this.quality = Math.max(0.55, this.quality - 0.15);
      this.slowFrames = 0;
      this.resize();
    } else if (this.fastFrames > 600 && this.quality < 1) {
      this.quality = Math.min(1, this.quality + 0.15);
      this.fastFrames = 0;
      this.resize();
    }
  }
}

async function boot(): Promise<void> {
  await loadProfile();
  if (Capacitor.isNativePlatform()) {
    try {
      const { StatusBar } = await import('@capacitor/status-bar');
      await StatusBar.hide();
    } catch {
      /* status bar plugin unavailable */
    }
    try {
      const { SplashScreen } = await import('@capacitor/splash-screen');
      await SplashScreen.hide();
    } catch {
      /* splash plugin unavailable */
    }
  }
  try {
    (window as any).__turf = new App();
  } catch (e) {
    document.body.innerHTML = `<div style="color:#fff;font:600 18px system-ui;padding:40px;text-align:center">Turf.io needs WebGL 2.<br><small>${String(e)}</small></div>`;
  }
}

void boot();
