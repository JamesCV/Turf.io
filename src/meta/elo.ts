export interface Tier {
  name: string;
  min: number;
  color: string;
}

export const TIERS: Tier[] = [
  { name: 'Bronze', min: 0, color: '#d08a45' },
  { name: 'Silver', min: 900, color: '#d5d8e8' },
  { name: 'Gold', min: 1100, color: '#ffd23f' },
  { name: 'Platinum', min: 1320, color: '#7ee0d6' },
  { name: 'Diamond', min: 1540, color: '#7aa2ff' },
  { name: 'Champion', min: 1800, color: '#ff4d6d' },
];

export function tierFor(elo: number): Tier {
  let t = TIERS[0];
  for (const next of TIERS) if (elo >= next.min) t = next;
  return t;
}

/**
 * Placement in a field of `players`, against a lobby at `oppElo`.
 * 1st of N scores 1, last scores 0.
 */
export function eloDelta(yourElo: number, oppElo: number, rank: number, players: number, games: number): number {
  const field = Math.max(2, players);
  const place = Math.min(field, Math.max(1, rank));
  const score = (field - place) / (field - 1);
  const expected = 1 / (1 + 10 ** ((oppElo - yourElo) / 400));
  const k = games < 8 ? 40 : 28;
  return Math.round(k * (score - expected));
}
