import { LEVEL_BY_ID, starsFor } from '../content/levels';
import type { MatchResult } from '../game/session';
import { eloDelta } from './elo';
import { addXp, coinMultiplier, profile, saveProfile } from './profile';

export interface Rewards {
  coins: number;
  gems: number;
  xp: number;
  levelsGained: number;
  stars: number;
  newStars: number;
  firstClear: boolean;
  newBest: boolean;
  eloFrom?: number;
  eloTo?: number;
  eloDelta?: number;
}

const CLASSIC_RANK_BONUS = [150, 90, 50];
const ARENA_PLACE_BONUS = [250, 150, 90, 50, 30];

/** Work out and apply the rewards for a finished match. */
export function grantRewards(r: MatchResult): Rewards {
  let coins = 0;
  let gems = 0;
  let stars = 0;
  let newStars = 0;
  let firstClear = false;
  let newBest = false;
  let eloFrom: number | undefined;
  let eloTo: number | undefined;
  let eloChange: number | undefined;
  const share = r.bestShare * 100;

  if (r.mode === 'classic') {
    coins = 20 + share * 12 + r.kills * 25 + r.time * 0.4 + (CLASSIC_RANK_BONUS[r.bestRank - 1] ?? 0);
    if (r.bestShare > profile.best.classicShare) {
      profile.best.classicShare = r.bestShare;
      newBest = true;
    }
    profile.best.classicKills = Math.max(profile.best.classicKills, r.kills);
  } else if (r.mode === 'arena') {
    coins = 30 + share * 8 + r.kills * 25 + (r.finalShare > 0 ? ARENA_PLACE_BONUS[r.rank - 1] ?? 0 : 0);
    if (r.won) {
      profile.best.arenaWins++;
      gems += 3;
    }
  } else if (r.mode === 'free' || r.mode === 'party' || r.mode === 'ranked') {
    const placeBonus = [220, 140, 90, 50, 30];
    coins = 24 + share * 10 + r.kills * 28 + (placeBonus[r.rank - 1] ?? 12);
    if (r.won) gems += r.mode === 'ranked' ? 4 : 2;
    if (r.mode === 'ranked') {
      const from = profile.elo;
      const delta = eloDelta(from, from, r.rank, r.players, profile.eloGames);
      profile.elo = Math.max(0, from + delta);
      profile.eloBest = Math.max(profile.eloBest, profile.elo);
      profile.eloGames++;
      eloFrom = from;
      eloTo = profile.elo;
      eloChange = delta;
    }
    if (r.bestShare > profile.best.classicShare) {
      profile.best.classicShare = r.bestShare;
      newBest = true;
    }
  } else if (r.mode === 'conquest' && r.levelId) {
    const lvl = LEVEL_BY_ID[r.levelId];
    const prev = profile.stars[r.levelId] ?? 0;
    if (r.won) {
      stars = starsFor(lvl, r.time);
      firstClear = prev === 0;
      coins = firstClear ? lvl.reward : lvl.reward * 0.35;
      if (stars > prev) {
        newStars = stars - prev;
        gems += newStars * (lvl.boss ? 5 : 3);
        profile.stars[r.levelId] = stars;
      }
    } else {
      coins = share * 4 + r.kills * 15;
    }
  }

  coins = Math.round(coins * coinMultiplier());
  const xp = Math.round(coins * 0.5 + 25 + r.kills * 10);
  profile.coins += coins;
  profile.gems += gems;
  profile.stats.games++;
  profile.stats.kills += r.kills;
  const lv = addXp(xp);
  saveProfile();
  return { coins, gems: gems + lv.gems, xp, levelsGained: lv.levels, stars, newStars, firstClear, newBest, eloFrom, eloTo, eloDelta: eloChange };
}
