import './ui/styles.css';
import { Capacitor } from '@capacitor/core';
import { CHARACTERS } from './content/characters';
import { ALL_LEVELS, LEVEL_BY_ID } from './content/levels';
import { Input } from './game/input';
import { Session, type MatchConfig, type MatchResult } from './game/session';
import { claimDaily, currentLoadout, loadProfile, profile } from './meta/profile';
import { grantRewards } from './meta/rewards';
import { sfx } from './platform/audio';
import { setHapticsEnabled } from './platform/haptics';
import { Renderer } from './render/renderer';
import { makeBotController, rollPersonality } from './sim/bot';
import { h } from './ui/dom';
import { Hud } from './ui/hud';
import {
  charsScreen,
  conquestScreen,
  levelIntroModal,
  menuScreen,
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

  private start(cfg: MatchConfig): void {
    this.endMatch();
    this.lastCfg = cfg;
    this.screens.replaceChildren();
    this.replaceSession(new Session(cfg, currentLoadout(), (r) => this.onEnd(r)));
    const s = this.session;
    this.input = new Input($('gl'), () => s.youScreenPos(this.cssW, this.cssH));
    this.hud = new Hud(s, () => this.pause(), () => s.tryAbility());
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
    this.session.paused = true;
    const m = pauseModal({
      resume: () => {
        m.remove();
        this.session.paused = false;
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
    this.endMatch();
    this.replaceSession(this.attract());
    this.show('menu');
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
        else if (this.lastCfg) this.start({ ...this.lastCfg, map: { ...this.lastCfg.map, seed: (Math.random() * 1e9) | 0 } });
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
