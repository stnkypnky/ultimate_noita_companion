// Turns the game's bitmap fonts (data/fonts/*.png + .xml, next to data.wak) into vector web fonts:
// every lit pixel of a glyph becomes a square, so the text stays crisp at any whole-pixel scale.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import opentype from 'opentype.js';

/** Font units per game pixel; the em is 8 pixels, so font-size 16px draws each game pixel as 2×2. */
const PX = 100;
const EM_PX = 8;
/** Glyph cells are 11 rows; the baseline sits under row 7 (capitals span rows 2–7, descenders reach row 8). */
const BASELINE_ROW = 8;

type Quad = { id: number; x: number; y: number; w: number; h: number; ox: number; oy: number; width: number };

function quads(xml: string): Quad[] {
  return [...xml.matchAll(/<QuadChar ([^>]*)>/g)].map((m) => {
    const a = Object.fromEntries([...m[1]!.matchAll(/(\w+)="(-?[\d.]+)"/g)].map((x) => [x[1]!, Number(x[2])]));
    return { id: a.id!, x: a.rect_x!, y: a.rect_y!, w: a.rect_w!, h: a.rect_h!, ox: a.offset_x ?? 0, oy: a.offset_y ?? 0, width: a.width! };
  });
}

/**
 * Build an OpenType font from one of the game's bitmap fonts. Only the bright glyph pixels are kept; the
 * dark shadow/shade pixels some fonts bake in are left to CSS (text-shadow).
 */
export async function bitmapFont(fontsDir: string, file: string, family: string): Promise<Buffer> {
  const xml = readFileSync(join(fontsDir, `${file}.xml`), 'utf8');
  const { data, info } = await sharp(join(fontsDir, `${file}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const lit = (x: number, y: number) => {
    const i = (y * info.width + x) * 4;
    return data[i + 3]! > 127 && data[i]! > 160 && data[i + 1]! > 160 && data[i + 2]! > 160;
  };

  const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 4 * PX, path: new opentype.Path() })];
  const seen = new Set<number>();
  for (const q of quads(xml)) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    const path = new opentype.Path();
    for (let y = 0; y < q.h; y++) {
      // One rectangle per horizontal run of lit pixels, so no contours overlap.
      for (let x = 0; x < q.w; ) {
        if (!lit(q.x + x, q.y + y)) {
          x++;
          continue;
        }
        let end = x;
        while (end < q.w && lit(q.x + end, q.y + y)) end++;
        const left = (x + q.ox) * PX;
        const right = (end + q.ox) * PX;
        const top = (BASELINE_ROW - (y + q.oy)) * PX;
        const bottom = top - PX;
        // Clockwise in y-up font space (outer contour for CFF).
        path.moveTo(left, bottom);
        path.lineTo(left, top);
        path.lineTo(right, top);
        path.lineTo(right, bottom);
        path.close();
        x = end;
      }
    }
    glyphs.push(new opentype.Glyph({ name: `u${q.id.toString(16).padStart(4, '0')}`, unicode: q.id, advanceWidth: q.width * PX, path }));
  }
  // The space glyph in these fonts is narrow; the game spaces words wider than a 3-pixel gap.
  const space = glyphs.find((g) => g.unicode === 32);
  if (space) space.advanceWidth = 4 * PX;

  const font = new opentype.Font({
    familyName: family,
    styleName: 'Regular',
    unitsPerEm: EM_PX * PX,
    ascender: BASELINE_ROW * PX,
    descender: -3 * PX,
    glyphs,
  });
  return Buffer.from(font.toArrayBuffer());
}
