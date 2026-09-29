import type { Difficulty } from '../sim/bot';
import type { MapShape } from '../sim/maps';

export interface LevelDef {
  id: string;
  name: string;
  shape: MapShape;
  size: number;
  rocks: number;
  bots: number;
  difficulty: Difficulty[];
  /** Territory share needed to win (ignored for boss levels). */
  goal: number;
  /** Seconds for 3 stars; 2 stars at 1.6x. */
  par: number;
  boss?: { name: string; charId: string };
  reward: number;
}

export interface RegionDef {
  id: string;
  name: string;
  blurb: string;
  color: string;
  levels: LevelDef[];
}

export const REGIONS: RegionDef[] = [
  {
    id: 'meadow',
    name: 'Meadow Isles',
    blurb: 'Gentle hills and gentle rivals. Learn the loop.',
    color: '#34d399',
    levels: [
      { id: 'm1', name: 'First Steps', shape: 'circle', size: 150, rocks: 0, bots: 5, difficulty: ['easy'], goal: 0.18, par: 60, reward: 150 },
      { id: 'm2', name: 'Pebble Park', shape: 'circle', size: 170, rocks: 6, bots: 6, difficulty: ['easy'], goal: 0.22, par: 75, reward: 200 },
      { id: 'm3', name: 'Hex Garden', shape: 'hexagon', size: 185, rocks: 3, bots: 7, difficulty: ['easy', 'normal'], goal: 0.24, par: 90, reward: 250 },
      { id: 'm4', name: 'The Donut', shape: 'ring', size: 210, rocks: 0, bots: 8, difficulty: ['easy', 'normal'], goal: 0.25, par: 100, reward: 300 },
      { id: 'm5', name: 'Big Brick\'s Yard', shape: 'square', size: 190, rocks: 8, bots: 6, difficulty: ['easy', 'normal'], goal: 0, par: 90, reward: 500, boss: { name: 'Big Brick', charId: 'mason' } },
    ],
  },
  {
    id: 'dunes',
    name: 'Sunset Dunes',
    blurb: 'Wide open sands. The locals bite back.',
    color: '#fb923c',
    levels: [
      { id: 'd1', name: 'Bloom Basin', shape: 'flower', size: 220, rocks: 4, bots: 9, difficulty: ['normal'], goal: 0.24, par: 100, reward: 350 },
      { id: 'd2', name: 'Boulder Box', shape: 'square', size: 230, rocks: 12, bots: 10, difficulty: ['normal'], goal: 0.26, par: 110, reward: 400 },
      { id: 'd3', name: 'Four Oases', shape: 'islands', size: 260, rocks: 0, bots: 10, difficulty: ['normal'], goal: 0.24, par: 120, reward: 450 },
      { id: 'd4', name: 'Honeycomb Flats', shape: 'hexagon', size: 260, rocks: 8, bots: 12, difficulty: ['normal', 'hard'], goal: 0.28, par: 130, reward: 500 },
      { id: 'd5', name: 'Duchess Dune', shape: 'flower', size: 240, rocks: 6, bots: 8, difficulty: ['normal', 'hard'], goal: 0, par: 110, reward: 800, boss: { name: 'Duchess Dune', charId: 'blaze' } },
    ],
  },
  {
    id: 'neon',
    name: 'Neon Peaks',
    blurb: 'Huge arenas, ruthless hunters. Only legends leave.',
    color: '#a78bfa',
    levels: [
      { id: 'n1', name: 'Halo Loop', shape: 'ring', size: 280, rocks: 4, bots: 12, difficulty: ['hard'], goal: 0.26, par: 130, reward: 600 },
      { id: 'n2', name: 'Archipelago', shape: 'islands', size: 300, rocks: 4, bots: 14, difficulty: ['hard'], goal: 0.26, par: 140, reward: 650 },
      { id: 'n3', name: 'Crystal Bloom', shape: 'flower', size: 300, rocks: 12, bots: 14, difficulty: ['hard'], goal: 0.3, par: 150, reward: 700 },
      { id: 'n4', name: 'The Grid', shape: 'square', size: 320, rocks: 14, bots: 16, difficulty: ['hard'], goal: 0.3, par: 160, reward: 800 },
      { id: 'n5', name: 'The Overlord', shape: 'circle', size: 280, rocks: 8, bots: 10, difficulty: ['hard'], goal: 0, par: 130, reward: 1500, boss: { name: 'The Overlord', charId: 'nova' } },
    ],
  },
];

export const ALL_LEVELS = REGIONS.flatMap((r) => r.levels);
export const LEVEL_BY_ID: Record<string, LevelDef> = Object.fromEntries(ALL_LEVELS.map((l) => [l.id, l]));

export function starsFor(level: LevelDef, seconds: number): number {
  if (seconds <= level.par) return 3;
  if (seconds <= level.par * 1.6) return 2;
  return 1;
}
