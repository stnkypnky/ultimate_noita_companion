import { basename } from 'node:path';
import sharp from 'sharp';
import type { Item } from '../../src/data/types.ts';
import { comp, num, parseXml, type EntityLoader } from './entity.ts';
import { firstFrame } from './sprites.ts';
import { humanize, tr, type Translations } from './translations.ts';
import type { Wak } from './wak.ts';

const PICKUPS = 'data/entities/items/pickup/';

/** Items whose game name is shared with a different item. */
const RENAME: Record<string, string> = { chest_leggy: 'Treasure chest (mimic)' };

/** First frame of a sprite: a .png (maybe a strip) or a <Sprite> .xml with a RectAnimation. */
async function spriteImage(wak: Wak, file: string): Promise<Buffer | null> {
  if (!file || !wak.has(file)) return null;
  if (file.endsWith('.png')) return firstFrame(wak.bytes(file));
  if (!file.endsWith('.xml')) return null;
  const sprite = parseXml(wak.text(file)).find((e) => e.tag === 'Sprite');
  const png = sprite?.attrs.filename;
  if (!png || !wak.has(png)) return null;
  const rect = comp(sprite, 'RectAnimation');
  if (!rect) return wak.bytes(png);
  const w = num(rect.attrs.frame_width, 16);
  const h = num(rect.attrs.frame_height, 16);
  const meta = await sharp(wak.bytes(png)).metadata();
  const left = num(rect.attrs.pos_x, 0);
  const top = num(rect.attrs.pos_y, 0);
  if (left + w > (meta.width ?? 0) || top + h > (meta.height ?? 0)) return wak.bytes(png);
  return sharp(wak.bytes(png)).extract({ left, top, width: w, height: h }).png().toBuffer();
}

/** A few world items (the sun quest) have huge sprites; shrink them to icon size, keeping hard pixels. */
async function fitIcon(png: Buffer, max = 24): Promise<Buffer> {
  const m = await sharp(png).metadata();
  if ((m.width ?? 0) <= max && (m.height ?? 0) <= max) return png;
  return sharp(png).resize(max, max, { fit: 'contain', kernel: 'nearest', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

export async function collectItems(wak: Wak, loader: EntityLoader, t: Translations) {
  const items: (Omit<Item, 'icon'> & { iconKey: string })[] = [];
  const images: { key: string; png: Buffer }[] = [];
  const seenNames = new Set<string>();

  // runestone_base.xml is the template every runestone builds on (the "weight" one is runestone_slow).
  for (const file of wak.list(PICKUPS).filter((f) => f.endsWith('.xml') && !f.endsWith('_base.xml')).sort()) {
    const e = loader.load(file);
    const ic = comp(e, 'ItemComponent');
    const uiName = comp(e, 'UIInfoComponent')?.attrs.name;
    const rawName = ic?.attrs.item_name || uiName;
    if (!rawName) continue;
    const id = basename(file, '.xml');
    // All three chests say "$item_chest_treasure" on their ItemComponent. The great one's UIInfo
    // name tells it apart, and the mimic (chest_leggy.lua) needs its own name or it hides the real chest.
    const name = RENAME[id] ?? tr(t, uiName && uiName !== rawName && id.endsWith('_super') ? uiName : rawName, humanize(id));
    // Gold nugget / blood money / potion variants share a name; keep the first.
    if (seenNames.has(name)) continue;
    seenNames.add(name);

    // Auto-pickup gold never reaches the inventory, so a placeholder ui_sprite never shows in-game
    // (goldnugget_10.xml, the base of the 10-gold nuggets, points at book.png). Its physics image is a
    // material map, not art, so use the gold nugget icon every other nugget has.
    const tags = [...new Set((e?.attrs.tags ?? '').split(',').filter(Boolean))];
    const placeholder = ic?.attrs.auto_pickup === '1' && ic.attrs.ui_sprite === 'data/ui_gfx/items/book.png' && tags.includes('gold_nugget');
    const spriteFile =
      (placeholder && 'data/ui_gfx/items/goldnugget.png') ||
      ic?.attrs.ui_sprite ||
      comp(e, 'SpriteComponent')?.attrs.image_file ||
      comp(e, 'PhysicsImageShapeComponent')?.attrs.image_file ||
      '';
    const img = await spriteImage(wak, spriteFile);
    if (img) images.push({ key: id, png: await fitIcon(img) });
    // base_item_projectile.xml: a thrown stone or egg hurts what it hits, damage × speed / max speed.
    const pc = comp(e, 'ProjectileComponent');
    const melee = num(comp(pc, 'damage_by_type')?.attrs.melee, 0);
    const thrown =
      pc?.attrs.damage_scaled_by_speed === '1' && melee > 0
        ? { damage: Math.round(melee * 25 * 100) / 100, maxSpeed: num(pc.attrs.damage_scale_max_speed, 0), hitsPlayer: pc.attrs.never_hit_player !== '1' }
        : undefined;
    items.push({
      id,
      name,
      description: tr(t, ic?.attrs.ui_description),
      iconKey: id,
      ...(tags.length ? { tags } : {}),
      ...(thrown ? { thrown } : {}),
    });
  }
  return { items, images };
}
