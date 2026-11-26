// Image emitters' pictures (Circle and Sea spells): the game's own PNGs, copied to game/emitters/ by the extractor
// and read into emission buckets where they're needed. Pure logic here, so Node tests and the browser share it.

/**
 * A picture's lit pixels grouped by the time they emit: `buckets[g]` holds flat [dx, dy, weight, ...] for every
 * pixel whose green is g, dx/dy from the picture's centre (floor(w/2), floor(h/2)) and weight = red / 255, its
 * chance to emit. Checked on circle_256.png: red is 255 across the disc and green rises from 0 at the centre to 255
 * at the rim, so the ring grows outward; circle_reverse_64.png runs the other way.
 */
export type EmitterImage = { w: number; h: number; buckets: (number[] | undefined)[] };

/** Bucket an RGBA picture's pixels (red = chance, green = when). */
export function bakeEmitterImage(rgba: ArrayLike<number>, w: number, h: number): EmitterImage {
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const buckets: (number[] | undefined)[] = new Array(256);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = rgba[i]!;
      if (!r) continue;
      (buckets[rgba[i + 1]!] ??= []).push(x - cx, y - cy, r / 255);
    }
  }
  return { w, h, buckets };
}

/** Where the extractor puts a picture from data.wak: game/emitters/<its file name>. */
export const emitterImagePath = (file: string) => `emitters/${file.split('/').pop()}`;
