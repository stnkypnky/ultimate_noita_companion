import { basename } from 'node:path';
import sharp from 'sharp';
import type { Item } from '../../src/data/types.ts';
import { comp, num, parseXml, type EntityLoader } from './entity.ts';
import { firstFrame } from './sprites.ts';
import { humanize, tr, type Translations } from './translations.ts';
import type { Wak } from './wak.ts';

const PICKUPS = 'data/entities/items/pickup/';

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

  for (const file of wak.list(PICKUPS).filter((f) => f.endsWith('.xml')).sort()) {
    const e = loader.load(file);
    const ic = comp(e, 'ItemComponent');
    const rawName = ic?.attrs.item_name || comp(e, 'UIInfoComponent')?.attrs.name;
    if (!rawName) continue;
    const id = basename(file, '.xml');
    const name = tr(t, rawName, humanize(id));
    // Gold nugget / blood money variants share a name; keep the first.
    if (seenNames.has(name)) continue;
    seenNames.add(name);

    const spriteFile = ic?.attrs.ui_sprite || comp(e, 'SpriteComponent')?.attrs.image_file || '';
    const img = await spriteImage(wak, spriteFile);
    if (img) images.push({ key: id, png: await fitIcon(img) });
    items.push({
      id,
      name,
      description: tr(t, ic?.attrs.ui_description),
      iconKey: id,
      ...(e?.attrs.tags ? { tags: e.attrs.tags.split(',').filter(Boolean) } : {}),
    });
  }
  return { items, images };
}
