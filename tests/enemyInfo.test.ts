import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Enemy } from '../src/data/types.ts';
import { ENEMY_INFO, FAMILY_TIPS } from '../src/data/enemyInfo.ts';

const enemies = JSON.parse(readFileSync(join(import.meta.dirname, '../public/game/data/enemies.json'), 'utf8')) as Enemy[];
const ids = new Set(enemies.map((e) => e.id));

describe('creature notes', () => {
  it('only describe real creatures, with text and a source', () => {
    for (const [id, info] of Object.entries(ENEMY_INFO)) {
      expect(ids.has(id), id).toBe(true);
      expect(info.text.trim().length, id).toBeGreaterThan(20);
      expect(info.source, id).toMatch(/^(https:\/\/noita\.wiki\.gg\/wiki\/|data\/)/);
      for (const tip of info.tips ?? []) expect(tip.trim(), id).not.toBe('');
    }
  });

  it('say where every boss is when no spawn table does, or keep it secret', () => {
    for (const e of enemies.filter((x) => x.boss && !x.spawns?.length)) {
      const info = ENEMY_INFO[e.id];
      if (!info) continue;
      expect(!!info.where || !!info.secret, e.id).toBe(true);
    }
  });

  it('give family tips only to real creatures, with a source', () => {
    for (const f of FAMILY_TIPS) {
      expect(f.source).toMatch(/^https:\/\/noita\.wiki\.gg\/wiki\//);
      for (const id of f.ids) expect(ids.has(id), id).toBe(true);
      for (const tip of f.tips) expect(tip.trim()).not.toBe('');
    }
  });

  it('leave the Toxic Sludge weakness to the game files', () => {
    // The five Hiisi the wiki names as sludge-proof aren't allergic; the rest are (ALLERGY_RADIOACTIVE).
    const byId = new Map(enemies.map((e) => [e.id, e]));
    for (const id of ['scavenger_invis', 'scavenger_shield', 'scavenger_heal', 'scavenger_glue', 'alchemist']) expect(byId.get(id)!.weakTo, id).toBeUndefined();
    for (const id of ['shotgunner', 'miner', 'sniper_hell', 'scavenger_leader', 'coward']) expect(byId.get(id)!.weakTo, id).toContain('Toxic sludge');
    for (const f of FAMILY_TIPS) for (const tip of f.tips) expect(tip).not.toMatch(/Toxic Sludge/i);
  });

  it('covers Kalmamato and the mimics', () => {
    for (const id of ['worm_skull', 'chest_mimic', 'dark_alchemist', 'shaman_wind']) expect(ENEMY_INFO[id], id).toBeDefined();
  });
});
