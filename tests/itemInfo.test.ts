// Every item page says something useful: the game's own text, or a companion note (src/data/itemInfo.ts).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ITEM_INFO, isPlaceholder } from '../src/data/itemInfo.ts';
import { SECRET_ITEMS } from '../src/data/spoilers.ts';

const items = JSON.parse(readFileSync(join(import.meta.dirname, '../public/game/data/items.json'), 'utf8')) as { id: string; name: string; description: string }[];
const ids = new Set(items.map((i) => i.id));

describe('item descriptions', () => {
  it('every item has a real game description or a companion note', () => {
    const missing = items.filter((i) => isPlaceholder(i.description) && !ITEM_INFO[i.id]).map((i) => i.id);
    expect(missing).toEqual([]);
  });

  it('every companion note belongs to an extracted item', () => {
    expect(Object.keys(ITEM_INFO).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('every note cites a wiki page or a game file', () => {
    for (const [id, info] of Object.entries(ITEM_INFO)) expect(info.source, id).toMatch(/^(https:\/\/noita\.wiki\.gg\/wiki\/|data\/)/);
  });

  it('all three chests are extracted, and the mimic one is a spoiler', () => {
    const chests = Object.fromEntries(items.filter((i) => i.id.startsWith('chest_')).map((i) => [i.id, i.name]));
    expect(chests).toEqual({ chest_leggy: 'Treasure chest (mimic)', chest_random: 'Treasure chest', chest_random_super: 'Great treasure chest' });
    expect(SECRET_ITEMS.has('chest_leggy')).toBe(true);
  });

  it('chest loot odds add up to 100%', () => {
    for (const id of ['chest_random', 'chest_random_super', 'utility_box']) {
      const total = ITEM_INFO[id]!.loot!.rows.reduce((s, r) => s + parseFloat(r.odds), 0);
      expect(total, id).toBe(100);
    }
  });
});
