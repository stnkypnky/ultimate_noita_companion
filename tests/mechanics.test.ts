import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MECHANICS } from '../src/data/mechanics.ts';
import { itemNotes, projectileNotes } from '../src/ui/HiddenMechanics.tsx';
import type { Item, Material, Perk, Projectile, Spell } from '../src/data/types.ts';

const GAME = join(import.meta.dirname, '../public/game/data');
const json = <T>(f: string) => JSON.parse(readFileSync(join(GAME, f), 'utf8')) as T;
const spells = json<Spell[]>('spells.json');
const items = json<Item[]>('items.json');
const materials = json<Material[]>('materials.json');
const perks = json<Perk[]>('perks.json');
const projectiles = json<Record<string, Projectile>>('projectiles.json');

const ids: Record<string, Set<string>> = {
  spell: new Set(spells.map((s) => s.id)),
  item: new Set(items.map((i) => i.id)),
  material: new Set(materials.map((m) => m.id)),
  perk: new Set(perks.map((p) => p.id)),
};
const projs = (id: string) => spells.find((s) => s.id === id)!.projectiles.map((f) => projectiles[f]!);

describe('hidden mechanics', () => {
  it('every curated note belongs to a real spell, item, material or perk and cites the wiki or a game script', () => {
    for (const [key, notes] of Object.entries(MECHANICS)) {
      const [kind, id] = key.split(':') as [string, string];
      expect(ids[kind]?.has(id), key).toBe(true);
      expect(notes.length, key).toBeGreaterThan(0);
      for (const n of notes) expect(n.source, key).toMatch(/^(https:\/\/noita\.wiki\.gg\/wiki\/|data\/scripts\/)/);
    }
  });

  it('reads the speed-scaled damage, fizzle speed, fuses and caster damage from the game files', () => {
    const burst = projectileNotes(projs('RUBBER_BALL')).map((n) => n.text).join(' ');
    expect(burst).toMatch(/scales with speed/);
    expect(burst).toMatch(/below 5 px\/s/);
    const dynamite = projectileNotes(projs('DYNAMITE')).map((n) => n.text).join(' ');
    expect(dynamite).toMatch(/800 × throw strength 2\.5, on a 0\.83 s fuse/);
    expect(projectileNotes(projs('LIGHTNING')).some((n) => /hurts you/.test(n.text))).toBe(true);
    expect(projectileNotes(projs('LIGHT_BULLET'))).toEqual([]);
  });

  it('thrown stones and eggs deal speed-scaled melee damage that never hits you', () => {
    const egg = items.find((i) => i.id === 'egg_monster')!;
    expect(egg.thrown).toEqual({ damage: 12.5, maxSpeed: 200, hitsPlayer: false });
    expect(itemNotes(egg)[0]!.text).toMatch(/12\.5 melee damage at 200 px\/s.*never hurts you/);
    expect(itemNotes(items.find((i) => i.id === 'potion')!)).toEqual([]);
  });
});
