// The app scales icons by the sheet sizes recorded in version.json; a stale size squashes every icon on the sheet.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import type { GameVersion, Icon } from '../src/data/types.ts';

const GAME = join(import.meta.dirname, '../public/game');
const version = JSON.parse(readFileSync(join(GAME, 'version.json'), 'utf8')) as GameVersion & { atlases: Record<string, [number, number]> };

describe('icon sheets', () => {
  for (const [name, [w, h]] of Object.entries(version.atlases)) {
    it(`${name}.png matches the size in version.json`, async () => {
      const m = await sharp(join(GAME, `sprites/${name}.png`)).metadata();
      expect([m.width, m.height]).toEqual([w, h]);
    });
  }

  it('every item icon lies inside the item sheet', () => {
    const items = JSON.parse(readFileSync(join(GAME, 'data/items.json'), 'utf8')) as { id: string; icon: Icon }[];
    const [w, h] = version.atlases.items!;
    for (const { icon } of items) {
      expect(icon.x + icon.w).toBeLessThanOrEqual(w);
      expect(icon.y + icon.h).toBeLessThanOrEqual(h);
    }
  });
});
