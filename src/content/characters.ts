/**
 * Every character sets two things at once: how your blob looks, and the
 * pattern your territory is painted with. Patterns are rendered on the GPU
 * (see render/glsl.ts) so they stay razor sharp at any zoom.
 */

export enum Pattern {
  Solid = 0,
  Stripes = 1,
  Dots = 2,
  Checker = 3,
  Waves = 4,
  Honeycomb = 5,
  Chevron = 6,
  Scales = 7,
  Stars = 8,
  Hearts = 9,
  Plaid = 10,
  Bricks = 11,
  Confetti = 12,
  Prism = 13,
  Zebra = 14,
  Circuit = 15,
  Bubbles = 16,
  Shards = 17,
  Flames = 18,
}

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export type Accessory =
  | 'none'
  | 'sprout'
  | 'foxEars'
  | 'antennae'
  | 'bow'
  | 'beanie'
  | 'mane'
  | 'hardhat'
  | 'partyHat'
  | 'flame'
  | 'crown'
  | 'halo'
  | 'horns'
  | 'catEars'
  | 'shades'
  | 'fin'
  | 'icicles'
  | 'leaf';

export type EyeStyle = 'round' | 'happy' | 'visor' | 'sleepy' | 'star';
export type BodyShape = 'block' | 'round' | 'squircle';

export interface CharacterDef {
  id: string;
  name: string;
  tagline: string;
  rarity: Rarity;
  price: { coins?: number; gems?: number };
  /** Main colour (hex). */
  c1: string;
  /** Secondary / pattern colour (hex). */
  c2: string;
  pattern: Pattern;
  /** Pattern period in cells. */
  scale: number;
  shape: BodyShape;
  eyes: EyeStyle;
  accessory: Accessory;
  /** Accessory tint (hex); defaults to a darker c1. */
  accent?: string;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'pip', name: 'Pip', tagline: 'Polka-dot optimist', rarity: 'common', price: {},
    c1: '#ff4d6d', c2: '#ffd1dc', pattern: Pattern.Dots, scale: 2.4, shape: 'block', eyes: 'round', accessory: 'none',
  },
  {
    id: 'minty', name: 'Minty', tagline: 'Fresh stripes, fresh land', rarity: 'common', price: {},
    c1: '#14cc97', c2: '#c4ffec', pattern: Pattern.Stripes, scale: 2.2, shape: 'block', eyes: 'happy', accessory: 'sprout', accent: '#2fbf4a',
  },
  {
    id: 'blu', name: 'Blu', tagline: 'Rides the waves', rarity: 'common', price: { coins: 400 },
    c1: '#3a86ff', c2: '#cfe2ff', pattern: Pattern.Waves, scale: 2.6, shape: 'round', eyes: 'round', accessory: 'fin', accent: '#2563d9',
  },
  {
    id: 'sunny', name: 'Sunny', tagline: 'Too cool for shade', rarity: 'common', price: { coins: 600 },
    c1: '#ffb703', c2: '#fff1bf', pattern: Pattern.Chevron, scale: 2.4, shape: 'block', eyes: 'round', accessory: 'shades', accent: '#1d1d2b',
  },
  {
    id: 'grape', name: 'Grape', tagline: 'Checkmate, everyone', rarity: 'common', price: { coins: 800 },
    c1: '#8338ec', c2: '#e2d0ff', pattern: Pattern.Checker, scale: 2.0, shape: 'squircle', eyes: 'sleepy', accessory: 'leaf', accent: '#3fbf5f',
  },
  {
    id: 'tango', name: 'Tango', tagline: 'Sly fox, scaly turf', rarity: 'rare', price: { coins: 1500 },
    c1: '#fb5607', c2: '#ffd9c4', pattern: Pattern.Scales, scale: 2.0, shape: 'block', eyes: 'happy', accessory: 'foxEars', accent: '#fb5607',
  },
  {
    id: 'bubbles', name: 'Bubbles', tagline: 'Pops up everywhere', rarity: 'rare', price: { coins: 1800 },
    c1: '#00b4f0', c2: '#dff8ff', pattern: Pattern.Bubbles, scale: 3.0, shape: 'round', eyes: 'round', accessory: 'none',
  },
  {
    id: 'honey', name: 'Honey', tagline: 'Builds a hive empire', rarity: 'rare', price: { coins: 2200 },
    c1: '#ffb000', c2: '#7a4a00', pattern: Pattern.Honeycomb, scale: 2.2, shape: 'round', eyes: 'round', accessory: 'antennae', accent: '#3b2a10',
  },
  {
    id: 'lovey', name: 'Lovey', tagline: 'Spreads the love (and the land)', rarity: 'rare', price: { coins: 2500 },
    c1: '#ff4fb8', c2: '#ffe0f2', pattern: Pattern.Hearts, scale: 2.6, shape: 'squircle', eyes: 'happy', accessory: 'bow', accent: '#ff2e7e',
  },
  {
    id: 'jack', name: 'Jack', tagline: 'Lumberjack of the map', rarity: 'rare', price: { coins: 3000 },
    c1: '#d62839', c2: '#2b2d42', pattern: Pattern.Plaid, scale: 3.2, shape: 'block', eyes: 'sleepy', accessory: 'beanie', accent: '#2b2d42',
  },
  {
    id: 'fern', name: 'Fern', tagline: 'Grows on you', rarity: 'rare', price: { coins: 3500 },
    c1: '#2d9d5f', c2: '#a8f0c6', pattern: Pattern.Shards, scale: 2.6, shape: 'squircle', eyes: 'round', accessory: 'sprout', accent: '#1f7a45',
  },
  {
    id: 'mason', name: 'Mason', tagline: 'Brick by brick', rarity: 'epic', price: { gems: 40 },
    c1: '#d1495b', c2: '#f5e6da', pattern: Pattern.Bricks, scale: 2.2, shape: 'block', eyes: 'round', accessory: 'hardhat', accent: '#ffc300',
  },
  {
    id: 'ziggy', name: 'Ziggy', tagline: 'Never changes its stripes', rarity: 'epic', price: { gems: 50 },
    c1: '#f4f4f8', c2: '#1d1b2e', pattern: Pattern.Zebra, scale: 2.8, shape: 'block', eyes: 'round', accessory: 'mane', accent: '#1d1b2e',
  },
  {
    id: 'rajah', name: 'Rajah', tagline: 'Apex predator', rarity: 'epic', price: { gems: 60 },
    c1: '#ff8a00', c2: '#241c15', pattern: Pattern.Zebra, scale: 3.0, shape: 'squircle', eyes: 'sleepy', accessory: 'catEars', accent: '#ff8a00',
  },
  {
    id: 'frost', name: 'Frost', tagline: 'Cold, calculated, crystalline', rarity: 'epic', price: { gems: 60 },
    c1: '#5ec8ff', c2: '#f0fbff', pattern: Pattern.Shards, scale: 2.2, shape: 'block', eyes: 'sleepy', accessory: 'icicles', accent: '#d6f3ff',
  },
  {
    id: 'confetti', name: 'Confetti', tagline: 'Every capture is a party', rarity: 'epic', price: { gems: 70 },
    c1: '#fffaf0', c2: '#ff4d6d', pattern: Pattern.Confetti, scale: 2.4, shape: 'round', eyes: 'happy', accessory: 'partyHat', accent: '#7b2ff7',
  },
  {
    id: 'volt', name: 'Volt', tagline: 'Wired for conquest', rarity: 'epic', price: { gems: 80 },
    c1: '#12162a', c2: '#18ffc4', pattern: Pattern.Circuit, scale: 3.0, shape: 'block', eyes: 'visor', accessory: 'antennae', accent: '#18ffc4',
  },
  {
    id: 'blaze', name: 'Blaze', tagline: 'Leaves scorched earth', rarity: 'legendary', price: { gems: 150 },
    c1: '#ff3d00', c2: '#ffd000', pattern: Pattern.Flames, scale: 3.0, shape: 'round', eyes: 'round', accessory: 'flame', accent: '#ffb000',
  },
  {
    id: 'nova', name: 'Nova', tagline: 'Claims the cosmos', rarity: 'legendary', price: { gems: 180 },
    c1: '#1b1045', c2: '#c9b6ff', pattern: Pattern.Stars, scale: 3.2, shape: 'round', eyes: 'star', accessory: 'halo', accent: '#ffe66d',
  },
  {
    id: 'prism', name: 'Prism', tagline: 'All colours. All land.', rarity: 'legendary', price: { gems: 220 },
    c1: '#ff5f6d', c2: '#ffffff', pattern: Pattern.Prism, scale: 3.0, shape: 'squircle', eyes: 'happy', accessory: 'crown', accent: '#ffd23f',
  },
  {
    id: 'imp', name: 'Imp', tagline: 'Mischief with a checkered past', rarity: 'epic', price: { gems: 55 },
    c1: '#7a1fa2', c2: '#ff5ce1', pattern: Pattern.Checker, scale: 1.6, shape: 'squircle', eyes: 'sleepy', accessory: 'horns', accent: '#2b0a3d',
  },
];

export const CHAR_BY_ID: Record<string, CharacterDef> = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#8e9aaf',
  rare: '#3a86ff',
  epic: '#a24bff',
  legendary: '#ffb703',
};

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const EYE_INDEX: Record<EyeStyle, number> = { round: 0, happy: 1, visor: 2, sleepy: 3, star: 4 };
export const SHAPE_INDEX: Record<BodyShape, number> = { block: 0, round: 1, squircle: 2 };
