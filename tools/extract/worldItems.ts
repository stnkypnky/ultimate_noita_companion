// What the map's Items layer needs from the game files: every item entity the biome scripts can load (what it is,
// how a wand rolls, which script picks a flask's material), and the spawn markers inside each room picture (a
// wand altar's wand, a vat's chest), which the engine runs when it loads the room.
import { basename } from 'node:path';
import sharp from 'sharp';
import type { Item } from '../../src/data/types.ts';
import type { ItemEntity, SceneSpawns } from '../../src/seed/items.ts';
import type { Wak } from './wak.ts';

const ITEMS = 'data/entities/items/';

/** A wand's script: generate_gun( cost, level, unshuffle ). */
function wandRoll(wak: Wak, xml: string): ItemEntity['wand'] {
  const script = /script_source_file="([^"]+\.lua)"/.exec(xml)?.[1];
  if (!script || !wak.has(script)) return undefined;
  const m = /generate_gun\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(true|false)?/.exec(wak.text(script));
  return m ? { cost: Number(m[1]), level: Number(m[2]), unshuffle: m[3] === 'true' } : undefined;
}

/**
 * Every item entity, by file. Only things a player picks up and the Items page knows (so nothing unnamed or secret
 * slips in unflagged): wands, chests, hearts, flasks and pouches, spell refreshers, and other known pickups.
 */
export function itemEntities(wak: Wak, items: Item[]): Record<string, ItemEntity> {
  const known = new Map(items.map((i) => [i.id, i]));
  const out: Record<string, ItemEntity> = {};
  for (const file of wak.list(ITEMS).filter((f) => f.endsWith('.xml'))) {
    const id = basename(file, '.xml');
    const xml = wak.text(file);
    const item = (k: string) => (known.has(k) ? { item: k, name: known.get(k)!.name } : null);
    if (/\/wands?\//.test(file) || /^wand_(level|unshuffle)_/.test(id)) {
      if (!/use_gun_script|AbilityComponent/.test(xml)) continue;
      const wand = wandRoll(wak, xml);
      out[file] = { kind: 'wand', name: 'Wand', ...(wand ? { wand } : {}) };
      continue;
    }
    if (!file.startsWith(`${ITEMS}pickup/`)) continue;
    if (id.startsWith('chest_')) {
      const k = item(id);
      if (k) out[file] = { kind: 'chest', ...k };
    } else if (id.startsWith('heart')) {
      const k = item(id) ?? item('heart');
      if (k) out[file] = { kind: 'heart', ...k };
    } else if (id.startsWith('potion') || id === 'powder_stash' || id === 'jar') {
      const k = item(id) ?? item('potion');
      const init = /script_source_file="([^"]+\.lua)"/.exec(xml)?.[1];
      if (k) out[file] = { kind: 'flask', ...k, ...(init ? { init } : {}) };
    } else if (id === 'spell_refresh') {
      const k = item(id);
      if (k) out[file] = { kind: 'refresh', ...k };
    } else {
      const k = item(id);
      if (k) out[file] = { kind: 'other', ...k };
    }
  }
  return out;
}

/** The spawn markers in every room's material picture: pixels in a spawn colour, with the picture's size. */
export async function sceneSpawns(wak: Wak, colours: Set<number>): Promise<SceneSpawns> {
  const out: SceneSpawns = {};
  const files = wak.list('data/biome_impl/').filter((f) => f.endsWith('.png') && !/_(visual|background|bg)\.png$/.test(f));
  for (const f of files) {
    try {
      const { data, info } = await sharp(wak.bytes(f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const m: [number, number, number][] = [];
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        if (data[i + 3]! < 255) continue;
        const rgb = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
        if (colours.has(rgb)) m.push([rgb, p % info.width, Math.floor(p / info.width)]);
      }
      if (m.length) out[f] = { w: info.width, h: info.height, m };
    } catch {
      /* not a picture sharp reads */
    }
  }
  return out;
}
