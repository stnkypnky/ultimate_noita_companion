import { basename } from 'node:path';
import type { Enemy } from '../../src/data/types.ts';
import { comp, num, type EntityLoader } from './entity.ts';
import { humanize, tr, type Translations } from './translations.ts';
import type { Wak } from './wak.ts';

/**
 * Enemies as listed on the in-game Progress screen: one icon per id in data/ui_gfx/animal_icons/.
 * The same ids name the save's stats/stats_<id>.xml files.
 */
export function enemyIconFiles(wak: Wak): string[] {
  return wak.list('data/ui_gfx/animal_icons/').filter((f) => f.endsWith('.png') && !f.includes('/_'));
}

export function buildEnemies(iconFiles: string[], loader: EntityLoader, t: Translations, icons: Map<string, Enemy['icon']>): Enemy[] {
  return iconFiles.map((file) => {
    const id = basename(file, '.png');
    const e = loader.load(`data/entities/animals/${id}.xml`);
    const dm = comp(e, 'DamageModelComponent');
    return {
      id,
      name: tr(t, e?.attrs.name, humanize(id)),
      icon: icons.get(file) ?? { x: 0, y: 0, w: 0, h: 0 },
      ...(dm ? { hp: Math.round(num(dm.attrs.hp, 0) * 25) } : {}),
      ...(e?.attrs.tags ? { tags: e.attrs.tags.split(',').filter(Boolean) } : {}),
    };
  });
}
