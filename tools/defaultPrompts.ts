/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Resolution } from '../types.ts';

export interface PromptPair {
  resolution: Resolution;
  prompt: string;
}

export const DEFAULT_TEST_SUITE: Record<Resolution, string[]> = {
  [Resolution.R64x64]: [
    'Glowing red health potion in a faceted glass flask with a cork',
    'Ancient wooden treasure chest with iron bands and a golden lock',
    'Pixel art cheeseburger with melted cheddar, lettuce, and sesame bun',
    'Floating purple arcane crystal shard emitting small energy sparks',
    'Blue translucent slime monster with cute white eyes and a core',
    'Battle-worn iron knight helmet with a red feather plume',
    'Lit dynamite stick with a burning fuse and bright sparks',
    'Golden royal crown encrusted with rubies and emeralds',
    'Campfire with burning wooden logs, orange flames, and rising embers',
    'Retro green circuit board microchip with gold contact pins'
  ],
  [Resolution.R64x128]: [
    'Dark armored knight standing with a cape and glowing visor',
    'Tall ancient pine tree covered in snow and icicles',
    'Legendary greatsword with a golden hilt and glowing blue runic blade',
    'Cyberpunk vending machine with neon signs and glowing drink cans',
    'Gothic stone grandfather clock with a golden pendulum',
    'Medieval stone watchtower with a wooden roof and a red banner',
    'Wandering mage holding a wooden staff topped with a fiery orb',
    'Cascading mountain waterfall hitting dark rocks with white foam',
    'Ornate wooden dungeon door reinforced with iron spikes and skull ring',
    'Sci-fi cryogenic stasis pod with green liquid and glass tube'
  ],
  [Resolution.R128x64]: [
    'Cyberpunk sports car in side profile with glowing cyan neon rims',
    'Medieval stone arch bridge crossing over a calm blue river',
    'Pirate galleon ship sailing on pixel waves in side view',
    'Giant red sleeping dragon curled over a pile of gold coins',
    'Steam locomotive train engine with black smoke coming from the chimney',
    'Desert horizon panorama with sand dunes, cacti, and a twin sunset',
    'Futuristic spaceship cockpit dashboard with radar screens and buttons',
    'Long wooden tavern counter stocked with barrels, mugs, and candles',
    'Mechanical giant crab boss with heavy iron claws and steam vents',
    'Overgrown stone ruins of a fallen statue in a jungle clearing'
  ]
};

/**
 * Returns the flat list of PromptPair items from DEFAULT_TEST_SUITE,
 * optionally filtered by resolution and limited to `limit` per category.
 */
export function getDefaultPromptPairs(
  filterResolution?: Resolution,
  limitPerCategory?: number
): PromptPair[] {
  const resolutions = filterResolution
    ? [filterResolution]
    : [Resolution.R64x64, Resolution.R64x128, Resolution.R128x64];

  const out: PromptPair[] = [];
  for (const res of resolutions) {
    const list = DEFAULT_TEST_SUITE[res] || [];
    const sliced =
      limitPerCategory !== undefined && limitPerCategory > 0
        ? list.slice(0, limitPerCategory)
        : list;
    for (const prompt of sliced) {
      out.push({ resolution: res, prompt });
    }
  }
  return out;
}

