import sharp from 'sharp';
import type { Icon } from '../../src/data/types.ts';

export type AtlasInput = { key: string; png: Buffer };

/**
 * Packs small icons into one grid atlas. Cell size is the largest icon; each icon sits at its cell's top-left.
 * Returns the PNG and each key's rectangle.
 */
export async function buildAtlas(
  inputs: AtlasInput[],
  columns = 32,
): Promise<{ png: Buffer; rects: Map<string, Icon>; size: [number, number] }> {
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
  return { png, rects, size: [cols * cw, rows * ch] };
}

/**
 * Packs sprites of mixed sizes into rows (tallest first) with a 1 px gutter, for atlases holding
 * animation frames where a uniform grid would waste most of the image.
 */
export async function buildPackedAtlas(inputs: AtlasInput[], maxWidth = 1024): Promise<{ png: Buffer; rects: Map<string, Icon>; size: [number, number] }> {
  const metas = await Promise.all(
    inputs.map(async (i) => {
      const m = await sharp(i.png).metadata();
      return { ...i, w: m.width ?? 1, h: m.height ?? 1 };
    }),
  );
  const order = [...metas].sort((a, b) => b.h - a.h || b.w - a.w || a.key.localeCompare(b.key));
  const rects = new Map<string, Icon>();
  let x = 0;
  let y = 0;
  let rowH = 0;
  let width = 1;
  for (const m of order) {
    if (x + m.w > maxWidth && x > 0) {
      y += rowH + 1;
      x = 0;
      rowH = 0;
    }
    rects.set(m.key, { x, y, w: m.w, h: m.h });
    x += m.w + 1;
    rowH = Math.max(rowH, m.h);
    width = Math.max(width, x);
  }
  const height = Math.max(1, y + rowH);
  const png = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(metas.map((m) => ({ input: m.png, left: rects.get(m.key)!.x, top: rects.get(m.key)!.y })))
    .png({ compressionLevel: 9 })
    .toBuffer();
  return { png, rects, size: [width, height] };
}

/** First frame of an icon that might be a horizontal strip. */
export async function firstFrame(png: Buffer, size = 16): Promise<Buffer> {
  const m = await sharp(png).metadata();
  if ((m.width ?? 0) > size * 1.5 && m.height === size) {
    return sharp(png).extract({ left: 0, top: 0, width: size, height: size }).png().toBuffer();
  }
  return png;
}
