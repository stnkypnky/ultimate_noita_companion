// Every perk page explains itself (src/data/perkInfo.ts), and the rarity odds come from the real perk deck.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PERK_INFO } from '../src/data/perkInfo.ts';
import { deckCopies, perkRarity } from '../src/data/perkRarity.ts';
import type { Perk } from '../src/data/types.ts';

const perks = JSON.parse(readFileSync(join(import.meta.dirname, '../public/game/data/perks.json'), 'utf8')) as Perk[];
const byId = new Map(perks.map((p) => [p.id, p]));

describe('perk notes', () => {
  it('every perk has a note, and every note belongs to a perk', () => {
    expect(perks.filter((p) => !PERK_INFO[p.id]).map((p) => p.id)).toEqual([]);
    expect(Object.keys(PERK_INFO).filter((id) => !byId.has(id))).toEqual([]);
  });

  it('every note has text and links its wiki page', () => {
    for (const [id, info] of Object.entries(PERK_INFO)) {
      expect(info.text.length, id).toBeGreaterThan(20);
      expect(info.source, id).toMatch(/^https:\/\/noita\.wiki\.gg\/wiki\//);
      for (const row of info.numbers ?? []) expect(row.value, `${id} ${row.label}`).not.toBe('');
    }
  });
});

describe('perk odds', () => {
  it('every Holy Mountain perk has odds, and the special ones none', () => {
    for (const p of perks) expect(!!p.odds, p.id).toBe(p.inDefaultPool);
  });

  it('a run offers 21 perks: the shares add up to about 21 distinct perks per run', () => {
    // Each run counts a perk once, so a stackable perk offered twice counts once: a little under 21.
    const total = perks.reduce((s, p) => s + (p.odds?.any ?? 0), 0);
    expect(total).toBeGreaterThan(19.5);
    expect(total).toBeLessThanOrEqual(21);
  });

  it('rarity: multi-copy perks are common, single ones uncommon, special ones rare', () => {
    expect(perkRarity(byId.get('EXTRA_PERK')!)).toBe('Common');
    expect(perkRarity(byId.get('GLASS_CANNON')!)).toBe('Uncommon');
    expect(perkRarity(byId.get('MOON_RADAR')!)).toBe('Rare');
    expect(deckCopies(byId.get('EXTRA_HP')!)).toBe('1–3');
    expect(deckCopies(byId.get('GLASS_CANNON')!)).toBe('1');
  });
});
