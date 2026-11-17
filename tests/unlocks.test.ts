// "How to unlock" notes (src/data/unlocks.ts): every gated spell explains its unlock, and every note is sourced.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FLAG_UNLOCKS, ITEM_UNLOCKS } from '../src/data/unlocks.ts';
import { ITEM_FLAGS, SECRET_ITEMS } from '../src/data/spoilers.ts';

const read = <T,>(f: string) => JSON.parse(readFileSync(join(import.meta.dirname, '../public/game/data', f), 'utf8')) as T;
const spells = read<{ id: string; requiresFlag?: string }[]>('spells.json');
const items = new Set(read<{ id: string }[]>('items.json').map((i) => i.id));
const SOURCE = /^(https:\/\/noita\.wiki\.gg\/wiki\/|data\/)/;

describe('how to unlock', () => {
  it('every spell unlock flag has a note', () => {
    const flags = new Set(spells.flatMap((s) => (s.requiresFlag ? [s.requiresFlag] : [])));
    expect([...flags].filter((f) => !FLAG_UNLOCKS[f])).toEqual([]);
  });

  it('item notes belong to real items, and flag-gated items have one', () => {
    expect(Object.keys(ITEM_UNLOCKS).filter((id) => !items.has(id))).toEqual([]);
    for (const id of Object.keys(ITEM_FLAGS)) expect(ITEM_UNLOCKS[id], id).toBeDefined();
  });

  it('most secret items say how to get them', () => {
    const missing = [...SECRET_ITEMS].filter((id) => !ITEM_UNLOCKS[id]);
    // The golden statues are made, not found; nothing reliable to say yet.
    expect(missing.sort()).toEqual(['bloodmoney_x', 'goldnugget_x']);
  });

  it('every note cites a wiki page or a game file', () => {
    for (const [k, n] of Object.entries(FLAG_UNLOCKS)) expect(n.source, k).toMatch(SOURCE);
    for (const [k, ns] of Object.entries(ITEM_UNLOCKS)) for (const n of ns) expect(n.source, k).toMatch(SOURCE);
  });
});
