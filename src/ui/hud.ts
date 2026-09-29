import { CHAR_BY_ID, hexToRgb } from '../content/characters';
import type { Session } from '../game/session';
import { ABILITY_INFO } from '../meta/profile';
import { ROCK, VOID } from '../sim/grid';
import type { Player } from '../sim/world';
import { h, pct } from './dom';

const MEDAL = ['gold', 'silver', 'bronze'];

export class Hud {
  readonly root: HTMLElement;
  private rank = h('div', { class: 'rank' }, '#1');
  private pctEl = h('div', { class: 'pct' }, '0%');
  private killsEl = h('div', { class: 'kills' }, '');
  private goalLabel = h('div', { class: 'lb-goal-label' }, 'Own the map');
  private goalPct = h('b', null, '0%');
  private goalBar = h('i');
  private teamBar = h('div', { class: 'lb-teams' });
  private podium = h('div', { class: 'podium' });
  private rest = h('div', { class: 'lb-rest' });
  private center = h('div', { class: 'hud-center' });
  private feed = h('div', { class: 'feed' });
  private abilityBtn: HTMLElement | null = null;
  private cd = h('div', { class: 'cd' });
  private mini = h('canvas', { width: 256, height: 256 }) as HTMLCanvasElement;
  private miniTop = h('canvas', { width: 256, height: 256 }) as HTMLCanvasElement;
  private miniSrc = document.createElement('canvas');
  private msg = h('div', { class: 'center-msg' });
  private slowT = 0;
  private miniT = 0;
  private rowSig = '';

  constructor(
    private s: Session,
    onPause: () => void,
    onAbility: () => void,
  ) {
    const ab = s.you?.loadout.ability ?? s.cfg.ability;
    if (ab) {
      this.abilityBtn = h(
        'button',
        {
          class: 'ability',
          onPointerdown: (e: PointerEvent) => {
            e.stopPropagation();
            e.preventDefault();
            onAbility();
          },
        },
        ABILITY_INFO[ab].icon,
        this.cd,
      );
    }
    const goal = h('div', { class: 'lb-goal' },
      h('div', { class: 'lb-goal-row' }, this.goalLabel, this.goalPct),
      h('div', { class: 'bar' }, this.goalBar),
    );
    const board = h('div', { class: 'lb' }, goal, this.teamBar, this.podium, this.rest);
    this.root = h(
      'div',
      null,
      h(
        'div',
        { class: 'hud-top' },
        h(
          'div',
          { class: 'hud-left' },
          h('div', { class: 'row' },
            h('button', { class: 'icon-btn pause', onClick: onPause, 'aria-label': 'Pause' }, 'II'),
            h('div', { class: 'stat' }, this.rank, h('div', { class: 'stat-copy' }, this.pctEl, this.killsEl)),
          ),
          this.center,
          this.feed,
        ),
        board,
      ),
      h('div', { class: 'minimap', 'aria-label': 'Map' }, this.mini, this.miniTop),
      this.abilityBtn ? h('div', { class: 'hud-btns' }, this.abilityBtn) : null,
      this.msg,
    );
    this.update(1);
  }

  update(dt: number): void {
    const s = this.s;
    const w = s.world;
    const you = s.you;
    this.slowT -= dt;
    this.miniT -= dt;

    if (this.abilityBtn && you) {
      const charge = you.alive ? w.abilityCharge(you) : 1;
      this.cd.style.setProperty('--p', String(charge));
      this.abilityBtn.classList.toggle('ready', charge <= 0 && you.alive);
    }

    if (this.slowT <= 0) {
      this.slowT = 0.1;
      this.paintBoard();
    }
    this.paintMinimapOverlay();
    if (this.miniT <= 0) {
      this.miniT = 0.12;
      this.paintMinimap();
    }
  }

  private paintBoard(): void {
    const s = this.s;
    const w = s.world;
    const you = s.you;
    const stand = s.standings();
    const aliveRank = you && you.alive ? s.ranking().indexOf(you) + 1 : 0;
    const yourShare = you && you.alive ? w.share(you) : 0;
    if (you) {
      this.rank.textContent = aliveRank ? '#' + aliveRank : '–';
      this.rank.className = 'rank' + (aliveRank === 1 ? ' lead' : '');
      this.pctEl.textContent = pct(yourShare);
    }
    this.killsEl.textContent = s.kills ? `${s.kills} cut` : '';

    const racing = s.cfg.mode === 'free' || s.cfg.mode === 'party' || s.cfg.mode === 'ranked';
    const shown = racing
      ? (s.cfg.teams ? s.teamShare(you?.team || 1) : yourShare)
      : yourShare;
    this.goalLabel.textContent = s.cfg.teams ? 'Team to 100%' : racing ? 'Own the map' : 'Your land';
    this.goalPct.textContent = pct(shown);
    this.goalBar.style.width = Math.min(100, shown * 100) + '%';

    if (s.cfg.teams) {
      const a = s.teamShare(1);
      const b = s.teamShare(2);
      this.teamBar.replaceChildren(
        h('div', { class: 'tm a' + (you?.team === 1 ? ' mine' : '') }, h('span', null, 'A'), h('b', null, pct(a))),
        h('div', { class: 'tm-track' }, h('i', { style: `width:${a + b > 0 ? (a / (a + b)) * 100 : 50}%` })),
        h('div', { class: 'tm b' + (you?.team === 2 ? ' mine' : '') }, h('b', null, pct(b)), h('span', null, 'B')),
      );
      this.teamBar.style.display = '';
    } else {
      this.teamBar.style.display = 'none';
    }

    const sig = stand.map((p) => p.id + (p.alive ? 'a' : 'd')).join(',');
    if (sig !== this.rowSig) {
      this.rowSig = sig;
      this.podium.replaceChildren(...stand.slice(0, 3).map((p, i) => this.row(p, i, true)));
      this.rest.replaceChildren(...stand.slice(3).map((p, i) => this.row(p, i + 3, false)));
    } else {
      this.patchRows(this.podium, stand.slice(0, 3), 0);
      this.patchRows(this.rest, stand.slice(3), 3);
    }

    const cfg = s.cfg;
    if (cfg.duration && (cfg.mode === 'arena' || cfg.mode === 'free' || cfg.mode === 'party' || cfg.mode === 'ranked')) {
      const t = Math.ceil(s.timeLeft);
      this.center.replaceChildren(h('div', { class: 'timer' + (t <= 15 ? ' hot' : '') }, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`));
    } else if (cfg.mode === 'conquest') {
      if (cfg.boss) {
        const b = s.boss;
        const bossShare = b && b.alive ? w.share(b) : 0;
        this.center.replaceChildren(
          h('div', { class: 'goal' }, `Defeat ${cfg.boss.name}`, h('div', { class: 'bar' }, h('i', { style: `width:${Math.min(100, bossShare * 400)}%;background:linear-gradient(90deg,#ff4d6d,#ff8fa3)` }))),
        );
      } else {
        const goal = cfg.goal ?? 0.25;
        const cur = you && you.alive ? w.share(you) : 0;
        this.center.replaceChildren(
          h('div', { class: 'goal' }, `Claim ${Math.round(goal * 100)}%`, h('div', { class: 'bar' }, h('i', { style: `width:${Math.min(100, (cur / goal) * 100)}%` }))),
        );
      }
    } else {
      this.center.replaceChildren();
    }

    const now = performance.now() / 1000;
    this.feed.replaceChildren(
      ...s.feed.map((f) => h('div', { class: f.you ? 'you' : '', style: `opacity:${Math.min(1, 4.5 - (now - f.t))}` }, f.text)),
    );

    if (s.respawnIn !== null && s.respawnIn > 0) {
      this.msg.replaceChildren(h('div', null, 'Back in'), h('big', null, String(Math.ceil(s.respawnIn))));
    } else if (you && !you.alive && !s.cfg.respawnYou && s.cfg.mode !== 'arena') {
      this.msg.replaceChildren(h('div', null, 'Cut down by ' + s.lastKiller));
    } else {
      this.msg.replaceChildren();
    }
  }

  private row(p: Player, index: number, pod: boolean): HTMLElement {
    const you = this.s.you;
    const c = CHAR_BY_ID[p.loadout.charId];
    const share = p.alive ? this.s.world.share(p) : 0;
    const medal = pod ? MEDAL[index] : '';
    return h('div', {
      class: 'r' + (p === you ? ' you' : '') + (pod ? ' pod ' + medal : '') + (p.alive ? '' : ' dead'),
      'data-id': String(p.id),
    },
      h('span', { class: 'place' }, String(index + 1)),
      h('span', { class: 'sw', style: `background:${c.c1}` }),
      h('span', { class: 'n' }, (p.tag === 'boss' ? '👑 ' : '') + p.name),
      h('span', { class: 'meter' }, h('i', { style: `width:${Math.min(100, share * 100)}%;background:${c.c1}` })),
      h('span', { class: 'p' }, pct(share)),
    );
  }

  private patchRows(root: HTMLElement, players: Player[], offset: number): void {
    const rows = [...root.children] as HTMLElement[];
    players.forEach((p, i) => {
      const row = rows[i];
      if (!row) return;
      const share = p.alive ? this.s.world.share(p) : 0;
      const place = row.querySelector('.place');
      const name = row.querySelector('.n');
      const meter = row.querySelector('.meter i') as HTMLElement | null;
      const pctEl = row.querySelector('.p');
      if (place) place.textContent = String(offset + i + 1);
      if (name) name.textContent = (p.tag === 'boss' ? '👑 ' : '') + p.name;
      if (meter) meter.style.width = Math.min(100, share * 100) + '%';
      if (pctEl) pctEl.textContent = pct(share);
      row.classList.toggle('you', p === this.s.you);
      row.classList.toggle('dead', !p.alive);
    });
  }

  private paintMinimap(): void {
    const s = this.s;
    const g = s.world.grid;
    if (this.miniSrc.width !== g.w || this.miniSrc.height !== g.h) {
      this.miniSrc.width = g.w;
      this.miniSrc.height = g.h;
    }
    const src = this.miniSrc.getContext('2d')!;
    const img = src.createImageData(g.w, g.h);
    const colors: Record<number, [number, number, number]> = {};
    for (const p of s.world.players) {
      const [r, gg, b] = hexToRgb(CHAR_BY_ID[p.loadout.charId].c1);
      colors[p.id] = [r * 255, gg * 255, b * 255];
    }
    const d = img.data;
    for (let i = 0; i < g.owner.length; i++) {
      const o = g.owner[i];
      const k = i * 4;
      if (o === VOID) continue;
      let c: [number, number, number] = [236, 232, 248];
      if (o === ROCK) c = [86, 82, 140];
      else if (o && colors[o]) c = colors[o];
      const mine = s.you && o === s.you.id;
      d[k] = mine ? Math.min(255, c[0] + 36) : c[0];
      d[k + 1] = mine ? Math.min(255, c[1] + 36) : c[1];
      d[k + 2] = mine ? Math.min(255, c[2] + 36) : c[2];
      d[k + 3] = 255;
    }
    src.putImageData(img, 0, 0);
    const ctx = this.mini.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, this.mini.width, this.mini.height);
    ctx.drawImage(this.miniSrc, 0, 0, this.mini.width, this.mini.height);
  }

  private paintMinimapOverlay(): void {
    const s = this.s;
    const g = s.world.grid;
    const ctx = this.miniTop.getContext('2d')!;
    const W = this.miniTop.width;
    ctx.clearRect(0, 0, W, W);
    const px = (x: number) => (x / g.w) * W;
    const py = (y: number) => (y / g.h) * W;

    for (const p of s.world.players) {
      if (!p.alive || p.trailPts.length < 4) continue;
      const c = CHAR_BY_ID[p.loadout.charId];
      ctx.beginPath();
      ctx.moveTo(px(p.trailPts[0]), py(p.trailPts[1]));
      for (let k = 2; k < p.trailPts.length; k += 2) ctx.lineTo(px(p.trailPts[k]), py(p.trailPts[k + 1]));
      ctx.strokeStyle = p === s.you ? '#ffffff' : c.c1;
      ctx.globalAlpha = p === s.you ? 0.95 : 0.8;
      ctx.lineWidth = p === s.you ? 3 : 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const cam = s.cam.view;
    const vw = window.innerWidth / Math.max(1, cam.zoom);
    const vh = window.innerHeight / Math.max(1, cam.zoom);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px(cam.x - vw / 2), py(cam.y - vh / 2), (vw / g.w) * W, (vh / g.h) * W);

    const dot = (x: number, y: number, r: number, fill: string, angle?: number) => {
      const cx = px(x);
      const cy = py(y);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#1c1a2e';
      ctx.stroke();
      if (angle !== undefined) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * (r + 7), cy + Math.sin(angle) * (r + 7));
        ctx.strokeStyle = fill;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    };
    for (const p of s.world.players) {
      if (!p.alive || p === s.you) continue;
      dot(p.x, p.y, 3.5, CHAR_BY_ID[p.loadout.charId].c1);
    }
    if (s.you && s.you.alive) dot(s.you.x, s.you.y, 5.5, '#ffffff', s.you.angle);
  }
}
