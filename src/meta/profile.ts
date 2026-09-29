import { CHARACTERS } from '../content/characters';
import { ALL_LEVELS } from '../content/levels';
import { loadJSON, saveJSON } from '../platform/storage';
import type { AbilityId, Loadout } from '../sim/world';

export type UpgradeId = 'start' | 'cooldown' | 'power' | 'coins';

export interface Profile {
  v: 1;
  name: string;
  coins: number;
  gems: number;
  xp: number;
  level: number;
  owned: string[];
  charId: string;
  ability: AbilityId;
  abilities: AbilityId[];
  upgrades: Record<UpgradeId, number>;
  stars: Record<string, number>;
  best: { classicShare: number; classicKills: number; arenaWins: number };
  stats: { games: number; kills: number };
  /** Ranked rating. 1000 is the floor everyone starts on. */
  elo: number;
  eloBest: number;
  eloGames: number;
  settings: { sound: boolean; haptics: boolean };
  daily: { day: string; streak: number };
}

const KEY = 'turf.profile.v1';

export function defaultProfile(): Profile {
  return {
    v: 1,
    name: 'You',
    coins: 250,
    gems: 10,
    xp: 0,
    level: 1,
    owned: ['pip', 'minty'],
    charId: 'pip',
    ability: 'dash',
    abilities: ['dash'],
    upgrades: { start: 0, cooldown: 0, power: 0, coins: 0 },
    stars: {},
    best: { classicShare: 0, classicKills: 0, arenaWins: 0 },
    stats: { games: 0, kills: 0 },
    elo: 1000,
    eloBest: 1000,
    eloGames: 0,
    settings: { sound: true, haptics: true },
    daily: { day: '', streak: 0 },
  };
}

export let profile: Profile = defaultProfile();

export async function loadProfile(): Promise<Profile> {
  const saved = await loadJSON<Partial<Profile>>(KEY);
  if (saved && saved.v === 1) {
    const d = defaultProfile();
    profile = {
      ...d,
      ...saved,
      upgrades: { ...d.upgrades, ...saved.upgrades },
      best: { ...d.best, ...saved.best },
      stats: { ...d.stats, ...saved.stats },
      elo: saved.elo ?? d.elo,
      eloBest: saved.eloBest ?? d.eloBest,
      eloGames: saved.eloGames ?? d.eloGames,
      settings: { ...d.settings, ...saved.settings },
      daily: { ...d.daily, ...saved.daily },
    } as Profile;
  }
  // Drop anything that no longer exists.
  profile.owned = profile.owned.filter((id) => CHARACTERS.some((c) => c.id === id));
  if (!profile.owned.includes(profile.charId)) profile.charId = profile.owned[0] ?? 'pip';
  return profile;
}

let saveTimer: number | undefined;
export function saveProfile(): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveJSON(KEY, profile), 150);
}

export function resetProfile(): void {
  profile = defaultProfile();
  saveProfile();
}

// ---------------------------------------------------------------- upgrades

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: (lvl: number) => string;
  costs: number[]; // coins per level
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'start', name: 'Head Start', desc: (l) => `Spawn with ${Math.round((startRadius(l) / 3.5) ** 2 * 100)}% starting land`, costs: [300, 700, 1400, 2500, 4000] },
  { id: 'cooldown', name: 'Quick Charge', desc: (l) => `Ability recharges ${Math.round(l * 7)}% faster`, costs: [400, 900, 1700, 2800, 4500] },
  { id: 'power', name: 'Overdrive', desc: (l) => `Ability lasts ${Math.round(l * 10)}% longer`, costs: [400, 900, 1700, 2800, 4500] },
  { id: 'coins', name: 'Coin Magnet', desc: (l) => `Earn ${Math.round(l * 12)}% more coins`, costs: [500, 1200, 2200, 3600, 6000] },
];

export const MAX_UPGRADE = 5;

function startRadius(lvl: number): number {
  return 3.5 + lvl * 0.45;
}

export const ABILITY_INFO: Record<AbilityId, { name: string; desc: string; gems: number; icon: string }> = {
  dash: { name: 'Dash', desc: 'Burst of speed. Escape or strike.', gems: 0, icon: '⚡' },
  shield: { name: 'Shield', desc: 'Your trail can’t be cut for a moment.', gems: 30, icon: '🛡' },
  freeze: { name: 'Freeze', desc: 'Slows every rival near you.', gems: 45, icon: '❄' },
};

export function currentLoadout(): Loadout {
  const u = profile.upgrades;
  return {
    charId: profile.charId,
    ability: profile.ability,
    abilityPower: 1 + u.power * 0.1,
    cooldownMul: 1 - u.cooldown * 0.07,
    startRadius: startRadius(u.start),
  };
}

/** Ranked ignores upgrades so the rating measures the player. */
export function rankedLoadout(): Loadout {
  return {
    charId: profile.charId,
    ability: profile.ability,
    abilityPower: 1,
    cooldownMul: 1,
    startRadius: 3.5,
  };
}

export function coinMultiplier(): number {
  return 1 + profile.upgrades.coins * 0.12;
}

// ---------------------------------------------------------------- xp

export function xpToNext(level: number): number {
  return 120 + (level - 1) * 70;
}

/** Adds XP, returns gems earned from level-ups. */
export function addXp(amount: number): { levels: number; gems: number } {
  profile.xp += amount;
  let levels = 0;
  let gems = 0;
  while (profile.xp >= xpToNext(profile.level)) {
    profile.xp -= xpToNext(profile.level);
    profile.level++;
    levels++;
    gems += profile.level % 5 === 0 ? 15 : 5;
  }
  profile.gems += gems;
  return { levels, gems };
}

export function levelUnlocked(levelId: string): boolean {
  const i = ALL_LEVELS.findIndex((l) => l.id === levelId);
  if (i <= 0) return true;
  return (profile.stars[ALL_LEVELS[i - 1].id] ?? 0) > 0;
}

export function totalStars(): number {
  return Object.values(profile.stars).reduce((a, b) => a + b, 0);
}

/** Daily login bonus. Returns reward if newly claimed today. */
export function claimDaily(): { coins: number; gems: number; streak: number } | null {
  const today = new Date().toISOString().slice(0, 10);
  if (profile.daily.day === today) return null;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const streak = profile.daily.day === yesterday ? Math.min(profile.daily.streak + 1, 7) : 1;
  profile.daily = { day: today, streak };
  const coins = 100 + streak * 50;
  const gems = streak === 7 ? 15 : streak >= 3 ? 3 : 0;
  profile.coins += coins;
  profile.gems += gems;
  saveProfile();
  return { coins, gems, streak };
}
