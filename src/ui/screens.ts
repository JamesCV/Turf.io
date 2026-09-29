import { CHARACTERS, CHAR_BY_ID, Pattern, RARITY_COLOR, type CharacterDef } from '../content/characters';
import { LEVEL_BY_ID, REGIONS } from '../content/levels';
import type { MatchResult } from '../game/session';
import {
  ABILITY_INFO,
  MAX_UPGRADE,
  UPGRADES,
  levelUnlocked,
  profile,
  resetProfile,
  saveProfile,
  totalStars,
  xpToNext,
} from '../meta/profile';
import type { Rewards } from '../meta/rewards';
import { sfx } from '../platform/audio';
import { haptic, setHapticsEnabled } from '../platform/haptics';
import { tierFor } from '../meta/elo';
import type { AbilityId } from '../sim/world';
import { fmt, h, pct, starsHTML } from './dom';

export interface AppApi {
  card(charId: string): string;
  show(screen: ScreenId): void;
  playFree(): void;
  playParty(): void;
  playRanked(): void;
  playLevel(id: string): void;
  toast(text: string): void;
}

export type ScreenId = 'menu' | 'chars' | 'upgrades' | 'conquest' | 'settings';

const PATTERN_NAMES: Record<Pattern, string> = {
  [Pattern.Solid]: 'Solid',
  [Pattern.Stripes]: 'Stripes',
  [Pattern.Dots]: 'Polka Dots',
  [Pattern.Checker]: 'Diamonds',
  [Pattern.Waves]: 'Waves',
  [Pattern.Honeycomb]: 'Honeycomb',
  [Pattern.Chevron]: 'Chevron',
  [Pattern.Scales]: 'Scales',
  [Pattern.Stars]: 'Starfield (animated)',
  [Pattern.Hearts]: 'Hearts',
  [Pattern.Plaid]: 'Tartan',
  [Pattern.Bricks]: 'Bricks',
  [Pattern.Confetti]: 'Confetti',
  [Pattern.Prism]: 'Prism (animated)',
  [Pattern.Zebra]: 'Wild Stripes',
  [Pattern.Circuit]: 'Circuit (animated)',
  [Pattern.Bubbles]: 'Bubbles (animated)',
  [Pattern.Shards]: 'Crystal Shards',
  [Pattern.Flames]: 'Flames (animated)',
};

function click(fn: () => void): () => void {
  return () => {
    sfx.unlock();
    sfx.click();
    haptic.light();
    fn();
  };
}

function currencyBar(): HTMLElement {
  return h('div', { class: 'row' },
    h('div', { class: 'pill' }, h('span', { class: 'ic coin-ic' }, '$'), fmt(profile.coins)),
    h('div', { class: 'pill' }, h('span', { class: 'ic gem-ic' }, '◆'), fmt(profile.gems)),
  );
}

function levelBadge(): HTMLElement {
  const need = xpToNext(profile.level);
  return h('div', { class: 'lvl' },
    h('div', { class: 'badge' }, profile.level),
    h('div', { class: 'bar' }, h('i', { style: `width:${Math.min(100, (profile.xp / need) * 100)}%` })),
  );
}

function header(app: AppApi, title: string): HTMLElement {
  return h('div', { class: 'topbar' },
    h('div', { class: 'row' },
      h('button', { class: 'icon-btn', onClick: click(() => app.show('menu')), 'aria-label': 'Back' }, '‹'),
      h('div', { class: 'title' }, title),
    ),
    currencyBar(),
  );
}

function affordable(c: CharacterDef): boolean {
  if (c.price.gems) return profile.gems >= c.price.gems;
  return profile.coins >= (c.price.coins ?? 0);
}

function priceTag(c: CharacterDef): HTMLElement {
  if (c.price.gems) return h('span', { class: 'price' }, h('i', { class: 'mini-gem' }), c.price.gems);
  if (c.price.coins) return h('span', { class: 'price' }, h('i', { class: 'mini-coin' }), fmt(c.price.coins));
  return h('span', { class: 'price' }, 'Free');
}

// ---------------------------------------------------------------- menu

export function menuScreen(app: AppApi): HTMLElement {
  const owned = CHARACTERS.filter((c) => profile.owned.includes(c.id));
  const cur = CHAR_BY_ID[profile.charId];
  const cycle = (d: number) => {
    const i = owned.findIndex((c) => c.id === profile.charId);
    profile.charId = owned[(i + d + owned.length) % owned.length].id;
    saveProfile();
    app.show('menu');
  };
  const affordableCount = CHARACTERS.filter((c) => !profile.owned.includes(c.id) && affordable(c)).length;
  const stars = totalStars();
  return h('div', { class: 'screen dim' },
    h('div', { class: 'topbar' }, levelBadge(), currencyBar()),
    h('div', { class: 'menu-center' },
      h('div', null,
        h('div', { class: 'logo' }, 'Turf', h('span', null, '.io')),
      ),
      h('div', null,
        h('div', { class: 'hero' },
          owned.length > 1 ? h('button', { class: 'arrow', onClick: click(() => cycle(-1)), 'aria-label': 'Previous character' }, '‹') : null,
          h('img', { class: 'card-img', src: app.card(cur.id), alt: cur.name, onClick: click(() => app.show('chars')) }),
          owned.length > 1 ? h('button', { class: 'arrow', onClick: click(() => cycle(1)), 'aria-label': 'Next character' }, '›') : null,
        ),
        h('div', { style: 'height:12px' }),
        h('div', { class: 'hero-name' }, cur.name),
        h('div', { class: 'hero-tag' }, `${PATTERN_NAMES[cur.pattern]} turf · ${ABILITY_INFO[profile.ability].icon} ${ABILITY_INFO[profile.ability].name}`),
      ),
      h('div', { class: 'modes' },
        h('button', { class: 'mode free', onClick: click(() => app.playFree()) },
          h('span', { class: 'mark' }, '◎'),
          h('span', null, h('b', null, 'Free Play'), h('small', null, 'Open lobby · own the map')),
        ),
        h('button', { class: 'mode party', onClick: click(() => app.playParty()) },
          h('span', { class: 'mark' }, '3v3'),
          h('span', null, h('b', null, 'Party'), h('small', null, 'Friends · two teams of three')),
        ),
        h('button', { class: 'mode ranked', onClick: click(() => app.playRanked()) },
          h('span', { class: 'mark' }, '★'),
          h('span', null, h('b', null, 'Ranked'), h('small', null, `${tierFor(profile.elo).name} · ${profile.elo}`)),
        ),
        h('button', { class: 'text-link', onClick: click(() => app.show('conquest')) }, `Campaign · ★ ${stars}`),
      ),
    ),
    h('div', { class: 'navbar' },
      h('button', { class: 'nav', onClick: click(() => app.show('chars')) }, h('span', { class: 'ico' }, '🎨'), 'Characters',
        affordableCount ? h('span', { class: 'dot' }, affordableCount) : null),
      h('button', { class: 'nav', onClick: click(() => app.show('upgrades')) }, h('span', { class: 'ico' }, '⚡'), 'Power-ups'),
      h('button', { class: 'nav', onClick: click(() => app.show('settings')) }, h('span', { class: 'ico' }, '⚙️'), 'Settings'),
    ),
  );
}

// ---------------------------------------------------------------- characters

export function charsScreen(app: AppApi, focusId = profile.charId): HTMLElement {
  const focus = CHAR_BY_ID[focusId];
  const own = profile.owned.includes(focus.id);
  const equipped = profile.charId === focus.id;

  const buy = () => {
    if (!affordable(focus)) {
      app.toast(focus.price.gems ? 'Not enough gems — win Arena & Conquest!' : 'Not enough coins — keep playing!');
      haptic.error();
      return;
    }
    if (focus.price.gems) profile.gems -= focus.price.gems;
    else profile.coins -= focus.price.coins ?? 0;
    profile.owned.push(focus.id);
    profile.charId = focus.id;
    saveProfile();
    sfx.coin();
    haptic.success();
    app.toast(`${focus.name} unlocked!`);
    rerender(focus.id);
  };
  const equip = () => {
    profile.charId = focus.id;
    saveProfile();
    rerender(focus.id);
  };
  const root = h('div', { class: 'screen solid' });
  const rerender = (id: string) => {
    const scroll = root.querySelector('.scroll')?.scrollTop ?? 0;
    const next = charsScreen(app, id);
    root.replaceWith(next);
    const sc = next.querySelector('.scroll');
    if (sc) sc.scrollTop = scroll;
  };

  let action: HTMLElement;
  if (equipped) action = h('button', { class: 'btn small ghost', disabled: true }, '✓ Equipped');
  else if (own) action = h('button', { class: 'btn small green', onClick: click(equip) }, 'Equip');
  else
    action = h('button', { class: 'btn small ' + (focus.price.gems ? 'pink' : 'yellow'), onClick: click(buy) },
      'Unlock ', priceTag(focus));

  root.append(
    header(app, 'Characters'),
    h('div', { class: 'panel showcase', style: 'margin-top:10px' },
      h('img', { src: app.card(focus.id), alt: focus.name }),
      h('div', { class: 'info' },
        h('span', { class: 'rarity', style: `background:${RARITY_COLOR[focus.rarity]}` }, focus.rarity),
        h('h2', null, focus.name),
        h('p', null, focus.tagline, h('br'), `Turf pattern: ${PATTERN_NAMES[focus.pattern]}`),
        action,
      ),
    ),
    h('div', { class: 'scroll' },
      h('div', { class: 'grid' },
        ...CHARACTERS.map((c) => {
          const has = profile.owned.includes(c.id);
          return h('button', {
            class: 'char' + (c.id === focus.id ? ' sel' : '') + (has ? '' : ' locked'),
            onClick: click(() => rerender(c.id)),
          },
            h('img', { src: app.card(c.id), alt: c.name, loading: 'lazy' }),
            c.rarity !== 'common' ? h('span', { class: 'tagchip', style: `background:${RARITY_COLOR[c.rarity]}` }, c.rarity) : null,
            profile.charId === c.id ? h('span', { class: 'eq' }, '✓') : null,
            h('div', null, c.name),
            has ? h('span', { class: 'price' }, 'Owned') : priceTag(c),
          );
        }),
      ),
    ),
  );
  return root;
}

// ---------------------------------------------------------------- upgrades

export function upgradesScreen(app: AppApi): HTMLElement {
  const root = h('div', { class: 'screen solid' });
  const refresh = () => {
    const sc = root.querySelector('.scroll')?.scrollTop ?? 0;
    const next = upgradesScreen(app);
    root.replaceWith(next);
    const s2 = next.querySelector('.scroll');
    if (s2) s2.scrollTop = sc;
  };

  const abilityRow = (id: AbilityId) => {
    const info = ABILITY_INFO[id];
    const owned = profile.abilities.includes(id);
    const eq = profile.ability === id;
    let btn: HTMLElement;
    if (eq) btn = h('button', { class: 'btn small ghost', disabled: true }, 'Equipped');
    else if (owned) btn = h('button', { class: 'btn small green', onClick: click(() => { profile.ability = id; saveProfile(); refresh(); }) }, 'Equip');
    else
      btn = h('button', {
        class: 'btn small pink',
        onClick: click(() => {
          if (profile.gems < info.gems) {
            app.toast('Not enough gems');
            haptic.error();
            return;
          }
          profile.gems -= info.gems;
          profile.abilities.push(id);
          profile.ability = id;
          saveProfile();
          sfx.coin();
          haptic.success();
          refresh();
        }),
      }, h('i', { class: 'mini-gem' }), info.gems);
    return h('div', { class: 'item' },
      h('div', { class: 'big-ic' }, info.icon),
      h('div', { class: 'txt' }, h('b', null, info.name), h('small', null, info.desc)),
      btn,
    );
  };

  const upgradeRow = (u: (typeof UPGRADES)[number]) => {
    const lvl = profile.upgrades[u.id];
    const maxed = lvl >= MAX_UPGRADE;
    const cost = u.costs[lvl];
    const pips = h('div', { class: 'pips' });
    for (let i = 0; i < MAX_UPGRADE; i++) pips.append(h('i', { class: i < lvl ? 'on' : '' }));
    const btn = maxed
      ? h('button', { class: 'btn small ghost', disabled: true }, 'MAX')
      : h('button', {
          class: 'btn small yellow',
          onClick: click(() => {
            if (profile.coins < cost) {
              app.toast('Not enough coins');
              haptic.error();
              return;
            }
            profile.coins -= cost;
            profile.upgrades[u.id]++;
            saveProfile();
            sfx.coin();
            haptic.success();
            refresh();
          }),
        }, h('i', { class: 'mini-coin' }), fmt(cost));
    return h('div', { class: 'item' },
      h('div', { class: 'txt' }, h('b', null, u.name), h('small', null, u.desc(Math.max(1, maxed ? lvl : lvl + 1)) + (maxed ? '' : lvl ? ' (next)' : '')), pips),
      btn,
    );
  };

  root.append(
    header(app, 'Power-ups'),
    h('div', { class: 'scroll' },
      h('div', { class: 'section-title' }, 'Ability'),
      h('div', { class: 'list' }, ...(['dash', 'shield', 'freeze'] as AbilityId[]).map(abilityRow)),
      h('div', { class: 'section-title' }, 'Upgrades'),
      h('div', { class: 'list' }, ...UPGRADES.map(upgradeRow)),
      h('p', { style: 'color:rgba(255,255,255,0.6);font-weight:600;font-size:13px;text-align:center;margin-top:16px' },
        'Upgrades are capped so skill always wins fights. No real-money purchases — ever.'),
    ),
  );
  return root;
}

// ---------------------------------------------------------------- conquest

export function conquestScreen(app: AppApi): HTMLElement {
  return h('div', { class: 'screen solid' },
    header(app, 'Conquest'),
    h('div', { class: 'scroll' },
      ...REGIONS.map((r) => {
        const unlocked = levelUnlocked(r.levels[0].id);
        const got = r.levels.reduce((a, l) => a + (profile.stars[l.id] ?? 0), 0);
        return h('div', {
          class: 'region' + (unlocked ? '' : ' locked'),
          style: `background:linear-gradient(160deg, rgba(26,16,64,0) 0%, rgba(26,16,64,0.6) 100%), ${r.color}`,
        },
          h('div', { class: 'row' }, h('h3', null, r.name), h('div', { class: 'spacer' }), h('div', { class: 'stars' }, `★ ${got}/15`)),
          h('p', null, r.blurb),
          h('div', { class: 'nodes' },
            ...r.levels.map((l, i) => {
              const open = levelUnlocked(l.id);
              const st = profile.stars[l.id] ?? 0;
              const isNext = open && st === 0;
              return h('button', {
                class: 'node' + (l.boss ? ' boss' : '') + (open ? '' : ' locked') + (isNext ? ' next' : ''),
                onClick: click(() => {
                  if (!open) {
                    app.toast('Clear the previous level first');
                    return;
                  }
                  app.playLevel(l.id);
                }),
              },
                h('div', { class: 'ball' }, l.boss ? '👑' : open ? String(i + 1) : '🔒'),
                starsHTML(st),
                h('div', { class: 'nm' }, l.name),
              );
            }),
          ),
        );
      }),
    ),
  );
}

// ---------------------------------------------------------------- settings

export function settingsScreen(app: AppApi, onChange: () => void): HTMLElement {
  const toggle = (label: string, get: () => boolean, set: (v: boolean) => void) => {
    const sw = h('div', { class: 'switch' + (get() ? ' on' : '') });
    return h('button', {
      class: 'toggle',
      style: 'width:100%;background:none',
      onClick: click(() => {
        set(!get());
        sw.classList.toggle('on', get());
        saveProfile();
        onChange();
      }),
    }, label, sw);
  };
  let confirmReset = false;
  const resetBtn = h('button', {
    class: 'btn small pink',
    style: 'margin-top:16px',
    onClick: click(() => {
      if (!confirmReset) {
        confirmReset = true;
        resetBtn.textContent = 'Tap again to erase everything';
        return;
      }
      resetProfile();
      onChange();
      app.show('menu');
      app.toast('Progress reset');
    }),
  }, 'Reset progress');
  return h('div', { class: 'screen solid' },
    header(app, 'Settings'),
    h('div', { class: 'panel', style: 'margin-top:12px' },
      toggle('Sound', () => profile.settings.sound, (v) => (profile.settings.sound = v)),
      toggle('Haptics', () => profile.settings.haptics, (v) => {
        profile.settings.haptics = v;
        setHapticsEnabled(v);
      }),
      h('div', { style: 'margin-top:14px;color:#7b7894;font-weight:600;font-size:14px;line-height:1.4' },
        h('b', { style: 'color:#1c1a2e' }, 'How to play'), h('br'),
        'Drag anywhere to steer. Leave your land to draw a trail, then loop home to claim the inside. ',
        'Cross a rival who is out on a run and their whole territory becomes yours. Own the map — 100% — to win.', h('br'), h('br'),
        `Games played: ${profile.stats.games} · Cuts: ${profile.stats.kills} · Best land: ${pct(profile.best.classicShare)} · Ranked: ${tierFor(profile.elo).name} ${profile.elo}`,
      ),
      resetBtn,
      h('div', { style: 'margin-top:12px;color:#b0adc4;font-size:12px;font-weight:600' }, 'Turf.io v0.1 · No ads. No pay-to-win.'),
    ),
  );
}

// ---------------------------------------------------------------- results

export function resultsModal(
  r: MatchResult,
  rw: Rewards,
  actions: { again: () => void; home: () => void; next?: () => void },
): HTMLElement {
  let title = '';
  let sub = '';
  let win = false;
  if (r.mode === 'classic') {
    title = r.bestRank === 1 ? 'Top of the map!' : 'Game over';
    sub = r.killedBy ? `Cut down by ${r.killedBy}` : '';
    win = r.bestRank === 1;
  } else if (r.mode === 'arena') {
    win = r.won;
    title = r.won ? 'Victory!' : r.finalShare > 0 ? `#${r.rank} place` : 'Time!';
    sub = r.won ? 'You ruled the arena' : 'Most land at the buzzer wins';
  } else if (r.mode === 'free' || r.mode === 'party' || r.mode === 'ranked') {
    win = r.won;
    title = r.won ? 'Victory' : `#${r.rank}`;
    sub = r.mode === 'party' ? '3v3 · first team to own the map' : r.mode === 'ranked' ? 'Ranked · own the map' : 'Open lobby · own the map';
    if (r.killedBy && r.mode === 'ranked') sub = `Cut down by ${r.killedBy}`;
  } else {
    const lvl = r.levelId ? LEVEL_BY_ID[r.levelId] : null;
    win = r.won;
    title = r.won ? 'Level clear!' : 'Defeated';
    sub = lvl ? (r.won ? `${lvl.name} · ${Math.round(r.time)}s (par ${lvl.par}s)` : r.killedBy ? `Cut down by ${r.killedBy}` : lvl.name) : '';
  }

  const rewardEls: HTMLElement[] = [];
  let delay = 0.1;
  const addReward = (cls: string, sym: string, text: string) => {
    rewardEls.push(h('div', { class: 'reward', style: `animation-delay:${delay}s` }, h('span', { class: 'pill-ic ic ' + cls, style: 'width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:13px' }, sym), text));
    delay += 0.12;
  };
  addReward('coin-ic', '$', '+' + fmt(rw.coins));
  if (rw.gems) addReward('gem-ic', '◆', '+' + rw.gems);
  addReward('', '⭐', `+${rw.xp} XP`);

  const starsEl =
    r.mode === 'conquest' && r.won
      ? h('div', { class: 'big-stars' }, ...[0, 1, 2].map((i) => h('span', { class: i < rw.stars ? '' : 'off', style: `animation-delay:${0.2 + i * 0.18}s` }, '★')))
      : null;

  const lvl = r.levelId ? LEVEL_BY_ID[r.levelId] : null;
  const hint =
    r.mode === 'conquest' && r.won && lvl && rw.stars < 3
      ? h('div', { class: 'sub' }, `Finish in ${lvl.par}s or less for 3 stars`)
      : null;

  return h('div', { class: 'modal-wrap' },
    h('div', { class: 'modal' },
      h('h1', { class: win ? 'win' : '' }, title),
      sub ? h('div', { class: 'sub' }, sub) : null,
      starsEl,
      hint,
      rw.eloFrom !== undefined
        ? h('div', { class: 'sub', style: `color:${(rw.eloDelta ?? 0) >= 0 ? '#10c98f' : '#ff4d6d'}` },
          `${tierFor(rw.eloTo ?? rw.eloFrom).name}  ${rw.eloFrom} → ${rw.eloTo}  (${(rw.eloDelta ?? 0) >= 0 ? '+' : ''}${rw.eloDelta})`)
        : null,
      h('div', { class: 'statgrid' },
        h('div', null, h('b', null, pct(r.bestShare)), h('small', null, 'Best land')),
        h('div', null, h('b', null, r.kills), h('small', null, 'Cuts')),
        h('div', null, h('b', null, r.mode === 'conquest' || r.mode === 'classic' ? `${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}` : `#${r.rank}`), h('small', null, r.mode === 'conquest' ? 'Time' : r.mode === 'classic' ? 'Survived' : 'Place')),
      ),
      rw.newBest ? h('div', { class: 'sub', style: 'color:#10c98f' }, '🏆 New personal best!') : null,
      rw.levelsGained ? h('div', { class: 'sub', style: 'color:#7b5cff' }, `Level up! You're now level ${profile.level}`) : null,
      h('div', { class: 'rewards' }, ...rewardEls),
      h('div', { class: 'actions' },
        h('button', { class: 'btn ghost', onClick: click(actions.home) }, 'Home'),
        actions.next
          ? h('button', { class: 'btn green', onClick: click(actions.next) }, 'Next level ›')
          : h('button', { class: 'btn green', onClick: click(actions.again) }, r.mode === 'conquest' && !r.won ? 'Retry' : 'Play again'),
      ),
    ),
  );
}

export function pauseModal(actions: { resume: () => void; quit: () => void }): HTMLElement {
  return h('div', { class: 'modal-wrap' },
    h('div', { class: 'modal' },
      h('h1', null, 'Paused'),
      h('div', { class: 'sub' }, 'Take a breather.'),
      h('div', { class: 'actions', style: 'flex-direction:column' },
        h('button', { class: 'btn green', onClick: click(actions.resume) }, 'Resume'),
        h('button', { class: 'btn ghost', onClick: click(actions.quit) }, 'Quit match'),
      ),
    ),
  );
}

export function finderScreen(title: string, detail: string, cancel: () => void): HTMLElement {
  return h('div', { class: 'screen solid' },
    h('div', { class: 'finder' },
      h('div', { class: 'pulse' }),
      h('h1', null, title),
      h('p', null, detail),
      h('div', { style: 'height:18px' }),
      h('button', { class: 'btn ghost', onClick: click(cancel) }, 'Cancel'),
    ),
  );
}

export interface PartySeatView {
  name: string;
  team: number;
  self: boolean;
}

export function partyScreen(opts: {
  phase: 'pick' | 'room';
  code: string;
  status: string;
  seats: PartySeatView[];
  host: boolean;
  onHost: () => void;
  onJoin: (code: string) => void;
  onStart: () => void;
  onLeave: () => void;
}): HTMLElement {
  if (opts.phase === 'pick') {
    const field = h('input', {
      class: 'field',
      maxLength: 4,
      placeholder: 'CODE',
      autocomplete: 'off',
      autocapitalize: 'characters',
      enterkeyhint: 'go',
    }) as HTMLInputElement;
    const go = () => opts.onJoin(field.value);
    field.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') go();
    });
    return h('div', { class: 'screen solid' },
      headerLike('Party', opts.onLeave),
      h('div', { class: 'scroll' },
        h('p', { style: 'color:rgba(255,255,255,0.78);font-weight:700;text-align:center' },
          'Play 3v3 with friends. Each side shares land, and the first team to own the map wins.'),
        h('button', { class: 'btn big green', style: 'width:100%;margin-top:8px', onClick: click(opts.onHost) }, 'Create party'),
        h('div', { class: 'section-title' }, 'Join a code'),
        h('div', { class: 'row', style: 'justify-content:center' },
          field,
          h('button', { class: 'btn blue', onClick: click(go) }, 'Join'),
        ),
      ),
    );
  }
  const col = (team: number, title: string) => {
    const members = opts.seats.filter((s) => s.team === team);
    const open = Math.max(0, 3 - members.length);
    return h('div', { class: 'col' },
      h('h3', null, title),
      ...members.map((s) => h('div', { class: 'seat' + (s.self ? ' me' : '') }, s.self ? `${s.name} · you` : s.name)),
      ...Array.from({ length: open }, () => h('div', { class: 'seat', style: 'opacity:0.4' }, 'Open seat')),
    );
  };
  return h('div', { class: 'screen solid' },
    headerLike('Party', opts.onLeave),
    h('div', { class: 'party-code' }, opts.code || '----'),
    h('p', { style: 'text-align:center;color:rgba(255,255,255,0.75);font-weight:700;margin-top:0' }, opts.status || ' '),
    h('div', { class: 'teams' }, col(1, 'Team A'), col(2, 'Team B')),
    opts.host
      ? h('button', { class: 'btn big green', style: 'width:100%;margin-top:16px', onClick: click(opts.onStart) }, 'Fill & start')
      : h('p', { style: 'text-align:center;color:#fff;font-weight:800' }, 'Waiting for the host to start'),
  );
}

function headerLike(title: string, back: () => void): HTMLElement {
  return h('div', { class: 'topbar' },
    h('div', { class: 'row' },
      h('button', { class: 'icon-btn', onClick: click(back), 'aria-label': 'Back' }, '‹'),
      h('div', { class: 'title' }, title),
    ),
  );
}

export function levelIntroModal(id: string, start: () => void, back: () => void): HTMLElement {
  const l = LEVEL_BY_ID[id];
  const best = profile.stars[id] ?? 0;
  const boss = l.boss ? CHAR_BY_ID[l.boss.charId] : null;
  return h('div', { class: 'modal-wrap' },
    h('div', { class: 'modal' },
      h('h1', null, l.name),
      h('div', { class: 'sub' }, l.boss ? `Boss battle vs ${l.boss.name}` : `${l.bots} rivals · ${l.shape} map`),
      h('div', { class: 'big-stars', style: 'font-size:34px' }, ...[0, 1, 2].map((i) => h('span', { class: i < best ? '' : 'off' }, '★'))),
      h('div', { class: 'panel', style: 'box-shadow:none;background:#f3f0ff;margin:6px 0 14px;text-align:left;font-weight:700' },
        boss
          ? `Eliminate ${l.boss!.name} (the ${boss.name} with the crown) yourself. Beware — bosses are fast and ruthless.`
          : `Claim ${Math.round(l.goal * 100)}% of the land to win.`,
        h('br'),
        h('span', { style: 'color:#7b7894' }, `★★★ under ${l.par}s · ★★ under ${Math.round(l.par * 1.6)}s`),
      ),
      h('div', { class: 'actions' },
        h('button', { class: 'btn ghost', onClick: click(back) }, 'Back'),
        h('button', { class: 'btn green', onClick: click(start) }, 'Start'),
      ),
    ),
  );
}
