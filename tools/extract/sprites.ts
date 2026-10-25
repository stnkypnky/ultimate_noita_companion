import sharp from 'sharp';
import type { Icon } from '../../src/data/types.ts';

export type AtlasInput = { key: string; png: Buffer };

/**
 * Packs small icons into one grid atlas. Cell size is the largest icon; each icon sits at its cell's top-left.
 * Returns the PNG and each key's rectangle.
 */
export async function buildAtlas(inputs: AtlasInput[], columns = 32): Promise<{ png: Buffer; rects: Map<string, Icon> }> {
  const metas = await Promise.all(
    inputs.map(async (i) => {
      const m = await sharp(i.png).metadata();
      return { ...i, w: m.width ?? 16, h: m.height ?? 16 };
    }),
  );
  const cw = Math.max(1, ...metas.map((m) => m.w));
  const ch = Math.max(1, ...metas.map((m) => m.h));
  const cols = Math.min(columns, metas.length || 1);
  const rows = Math.ceil(metas.length / cols) || 1;

  const rects = new Map<string, Icon>();
  const composites = metas.map((m, i) => {
    const x = (i % cols) * cw;
    const y = Math.floor(i / cols) * ch;
    rects.set(m.key, { x, y, w: m.w, h: m.h });
    return { input: m.png, left: x, top: y };
  });

  const png = await sharp({ create: { width: cols * cw, height: rows * ch, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();
  return { png, rects };
}

/** First frame of an icon that might be a horizontal strip. */
export async function firstFrame(png: Buffer, size = 16): Promise<Buffer> {
  const m = await sharp(png).metadata();
  if ((m.width ?? 0) > size * 1.5 && m.height === size) {
    return sharp(png).extract({ left: 0, top: 0, width: size, height: size }).png().toBuffer();
  }
  return png;
}
