// Image emitters' pictures (Circle and Sea spells): the game's own PNGs, copied to game/emitters/ by the extractor
// and read into emission buckets where they're needed. bakeEmitterImage is pure, so Node tests (decoding with sharp)
// and the browser share it; loadEmitterImage is the browser's loader.

/**
 * A picture's lit pixels grouped by the time they emit: `buckets[g]` holds flat [dx, dy, weight, ...] for every
 * pixel whose green is g, dx/dy from the picture's centre (floor(w/2), floor(h/2)) and weight = red / 255, its
 * chance to emit. Checked on circle_256.png: red is 255 across the disc and green rises from 0 at the centre to 255
 * at the rim (green ≈ radius), so the ring grows outward 1 px per level; circle_reverse_64.png runs the other way.
 * `reach` is the farthest pixel from the centre; `frames` the animation's length, its highest green + 1.
 */
export type EmitterImage = { w: number; h: number; buckets: (number[] | undefined)[]; reach: number; frames: number };

/** Bucket an RGBA picture's pixels (red = chance, green = when). */
export function bakeEmitterImage(rgba: ArrayLike<number>, w: number, h: number): EmitterImage {
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const buckets: (number[] | undefined)[] = new Array(256);
  let reach = 0;
  let frames = 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = rgba[i]!;
      if (!r) continue;
      const g = rgba[i + 1]!;
      (buckets[g] ??= []).push(x - cx, y - cy, r / 255);
      reach = Math.max(reach, Math.hypot(x - cx, y - cy));
      frames = Math.max(frames, g + 1);
    }
  }
  return { w, h, buckets, reach, frames };
}

/** Where the extractor puts a picture from data.wak: game/emitters/<its file name>. */
export const emitterImagePath = (file: string) => `emitters/${file.split('/').pop()}`;

const loading = new Map<string, Promise<EmitterImage>>();

/**
 * Fetch and bake a picture once per page (`url` from gameUrl(emitterImagePath(file))). Decoded without colour
 * management, so red and green are the stored values the game reads.
 */
export function loadEmitterImage(url: string): Promise<EmitterImage> {
  let p = loading.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${url}: ${r.status}`);
        return r.blob();
      })
      .then((b) => createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }))
      .then((bmp) => {
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(bmp, 0, 0);
        const img = bakeEmitterImage(ctx.getImageData(0, 0, bmp.width, bmp.height).data, bmp.width, bmp.height);
        bmp.close();
        return img;
      });
    // A failed fetch can be retried by a later cast.
    p.catch(() => loading.delete(url));
    loading.set(url, p);
  }
  return p;
}
