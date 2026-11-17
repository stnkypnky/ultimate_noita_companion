import { basename } from 'node:path';
import sharp from 'sharp';
import type { Item } from '../../src/data/types.ts';
import { comp, num, parseXml, type EntityLoader } from './entity.ts';
import { firstFrame } from './sprites.ts';
import { humanize, tr, type Translations } from './translations.ts';
import type { Wak } from './wak.ts';

const PICKUPS = 'data/entities/items/pickup/';

/** Items whose game name is shared with a different item. */
const RENAME: Record<string, string> = { chest_leggy: 'Treasure chest (mimic)', bloodmoney_x: 'Bloody golden statue' };

/** materials.xml: gold_box2d and bloodgold_box2d are flat colours (no texture), lit by the game's normal mapping. */
const GOLD = [0xff, 0xc7, 0x4e];
const BLOOD_GOLD = [0xff, 0x4e, 0x4e];

/**
 * A gold pickup as it looks in the world. Nuggets are UV maps (blue 0): each facet's red/green picks its
 * lighting, so brighter coordinates read as the lit faces (c0c000 top, 404000 shadow). The idols and the
 * statue are drawn art: kept as painted, and recoloured red (by brightness) for blood money.
 */
async function goldImage(wak: Wak, file: string, blood: boolean): Promise<Buffer | null> {
  if (!wak.has(file)) return null;
  const { data, info } = await sharp(wak.bytes(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // golden_idol_big.png is a UV map with 10 faintly blue pixels out of 608, so allow a few.
  let opaque = 0;
  let blue = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i + 3]) (opaque++, data[i + 2]! > 48 && blue++);
  const uvMap = blue <= opaque * 0.05;
  const base = blood ? BLOOD_GOLD : GOLD;
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    let k: number;
    if (uvMap) k = 0.4 + 0.85 * ((data[i]! + data[i + 1]!) / 384);
    else if (blood) k = (0.3 * data[i]! + 0.59 * data[i + 1]! + 0.11 * data[i + 2]!) / 200;
    else continue;
    for (let c = 0; c < 3; c++) data[i + c] = Math.min(255, Math.round(base[c]! * k));
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

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

async function upscale(png: Buffer, k: number): Promise<Buffer> {
  const m = await sharp(png).metadata();
  return sharp(png).resize((m.width ?? 0) * k, (m.height ?? 0) * k, { kernel: 'nearest' }).png().toBuffer();
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

    // Gold is picked up on touch and never shows its ui_sprite (all share one icon, some point at
    // book.png), so show it as it lies in the world: its physics image in its material.
    const tags = [...new Set((e?.attrs.tags ?? '').split(',').filter(Boolean))];
    const shape = comp(e, 'PhysicsImageShapeComponent');
    // Eggs too: their inventory icon is a big upright egg, but in the world (and in hand) they're a
    // small 9×8 egg lying on its side.
    const img =
      tags.includes('gold_nugget') && shape?.attrs.image_file
        ? await goldImage(wak, shape.attrs.image_file, shape.attrs.material === 'bloodgold_box2d')
        : await spriteImage(
            wak,
            (id.startsWith('egg_') && shape?.attrs.image_file) || ic?.attrs.ui_sprite || comp(e, 'SpriteComponent')?.attrs.image_file || shape?.attrs.image_file || '',
          );
    // At 9×8 the world eggs read as dots next to the other icons: draw them at 2×, hard pixels.
    const scaled = img && id.startsWith('egg_') ? await upscale(img, 2) : img;
    if (scaled) images.push({ key: id, png: await fitIcon(scaled) });
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
