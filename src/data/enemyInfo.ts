// Companion notes for creatures whose tricks the game files don't spell out (they live in Lua scripts, or in
// where and how the game places them). Each is checked against noita.wiki.gg or read from the script named.

export type EnemyInfo = {
  text: string;
  tips?: string[];
  /** Where it's found, when no biome spawn table places it (bosses, rooms, events). */
  where?: string;
  /** A noita.wiki.gg URL, or the data.wak path of the script it was read from. */
  source: string;
  /** Spoiler part: shown only after a tap. */
  secret?: string;
};

export const WIKI = 'https://noita.wiki.gg/wiki/';

export const ENEMY_INFO: Record<string, EnemyInfo> = {};
