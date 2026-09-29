import { CHAR_BY_ID, hexToRgb } from '../content/characters';
import type { Session } from '../game/session';
import { ABILITY_INFO } from '../meta/profile';
import { ROCK, VOID } from '../sim/grid';
import { h, pct } from './dom';

export class Hud {
  readonly root: HTMLElement;
  private rank = h('div', { class: 'rank' }, '#1');
  private pctEl = h('div', { class: 'pct' }, '0%');
  private killsEl = h('div', { class: 'kills' }, '');
  private board = h('div', { class: 'board' });
  private center = h('div', { class: 'hud-center' });
  private feed = h('div', { class: 'feed' });
  private abilityBtn: HTMLElement | null = null;
  private cd = h('div', { class: 'cd' });
  private mini = h('canvas', { width: 160, height: 160 }) as HTMLCanvasElement;
  private msg = h('div', { class: 'center-msg' });
  private slowT = 0;
  private miniT = 0;

  constructor(
    private s: Session,
    onPause: () => void,
    onAbility: () => void,
  ) {
    const ab = s.you?.loadout.ability;
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
            h('div', { class: 'stat' }, this.rank, h('div', null, this.pctEl, this.killsEl)),
          ),
          this.center,
          this.feed,
        ),
        this.board,
      ),
      h('div', { class: 'minimap' }, this.mini),
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
      this.slowT = 0.2;
      const rank = s.ranking();
      if (you && you.alive) {
        this.rank.textContent = '#' + (rank.indexOf(you) + 1);
        this.pctEl.textContent = pct(w.share(you));
      }
      this.killsEl.textContent = s.kills ? `💀 ${s.kills}` : '';

      // Leaderboard: top 5 plus you.
      const rows: HTMLElement[] = [];
      const top = rank.slice(0, 5);
      const addRow = (p: (typeof rank)[number], i: number) => {
        const c = CHAR_BY_ID[p.loadout.charId];
        rows.push(
          h('div', { class: 'r' + (p === you ? ' you' : '') },
            h('span', { class: 'p' }, i + 1 + '.'),
            h('span', { class: 'sw', style: `background:${c.c1}` }),
            h('span', { class: 'n' }, (p.tag === 'boss' ? '👑 ' : '') + p.name),
            h('span', { class: 'p' }, pct(w.share(p))),
          ),
        );
      };
      top.forEach(addRow);
      if (you && you.alive && !top.includes(you)) addRow(you, rank.indexOf(you));
      this.board.replaceChildren(...rows);

      // Mode-specific centre widget.
      const cfg = s.cfg;
      if (cfg.mode === 'arena') {
        const t = Math.ceil(s.timeLeft);
        const el = h('div', { class: 'timer' + (t <= 10 ? ' hot' : '') }, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
        this.center.replaceChildren(el);
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
            h('div', { class: 'goal' }, `Claim ${Math.round(goal * 100)}% of the land`, h('div', { class: 'bar' }, h('i', { style: `width:${Math.min(100, (cur / goal) * 100)}%` }))),
          );
        }
      }

      const now = performance.now() / 1000;
      this.feed.replaceChildren(
        ...s.feed.map((f) => h('div', { class: f.you ? 'you' : '', style: `opacity:${Math.min(1, 4.5 - (now - f.t))}` }, f.text)),
      );

      if (s.respawnIn !== null && s.respawnIn > 0) {
        this.msg.replaceChildren(h('div', null, 'Respawning'), h('big', null, String(Math.ceil(s.respawnIn))));
      } else if (you && !you.alive && s.cfg.mode !== 'arena') {
        this.msg.replaceChildren(h('div', null, 'Cut down by ' + s.lastKiller));
      } else {
        this.msg.replaceChildren();
      }
    }

    if (this.miniT <= 0) {
      this.miniT = 0.25;
      this.drawMinimap();
    }
  }

  private drawMinimap(): void {
    const s = this.s;
    const g = s.world.grid;
    const ctx = this.mini.getContext('2d')!;
    const W = this.mini.width;
    const img = ctx.createImageData(W, W);
    const colors: Record<number, [number, number, number]> = {};
    for (const p of s.world.players) {
      if (!p.alive) continue;
      const [r, gg, b] = hexToRgb(CHAR_BY_ID[p.loadout.charId].c1);
      colors[p.id] = [r * 255, gg * 255, b * 255];
    }
    const d = img.data;
    for (let y = 0; y < W; y++) {
      const gy = Math.floor((y / W) * g.h);
      for (let x = 0; x < W; x++) {
        const gx = Math.floor((x / W) * g.w);
        const o = g.owner[gy * g.w + gx];
        const k = (y * W + x) * 4;
        if (o === VOID) continue;
        let c: [number, number, number] = [236, 233, 248];
        if (o === ROCK) c = [110, 108, 170];
        else if (o && colors[o]) c = colors[o];
        d[k] = c[0];
        d[k + 1] = c[1];
        d[k + 2] = c[2];
        d[k + 3] = 235;
      }
    }
    ctx.putImageData(img, 0, 0);
    const dot = (x: number, y: number, r: number, fill: string) => {
      ctx.beginPath();
      ctx.arc((x / g.w) * W, (y / g.h) * W, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#1c1a2e';
      ctx.stroke();
    };
    if (s.boss && s.boss.alive) dot(s.boss.x, s.boss.y, 6, '#ffd23f');
    if (s.you && s.you.alive) dot(s.you.x, s.you.y, 6, '#ffffff');
  }
}
