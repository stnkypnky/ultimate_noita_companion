// LaserEmitterComponent beams as the game draws them: no sprite or line, only cosmetic particles of the
// ConfigLaser's beam_particle_type, rebuilt every frame. Written straight into a pixel layer (no particle
// objects, no allocations), so it costs about a thousand pixel writes a beam.

/** A laser beam this frame (world → render): where it runs and what it's drawn with. */
export type Beam = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** beam_radius: pixels within this distance either side of the beam's line can light. */
  radius: number;
  /** beam_particle_chance: % of those pixels lit each frame. */
  chance: number;
  /** beam_particle_type's colour (#rrggbb) and alpha (plasma_fading 0x77, spark_green 0x7f). */
  color: string;
  alpha: number;
  glow: boolean;
  /** gfx_glow / 255. */
  glowStrength: number;
};

/** How many pixels can light on a beam of `length` px and `radius`: one per px along it, ±floor(radius) across. */
export const beamSlots = (length: number, radius: number) => (Math.ceil(length) + 1) * (2 * Math.floor(Math.max(0, radius)) + 1);

/**
 * Light the beam's pixels for one frame. ConfigLaser's fields are undocumented; the rule follows their names and
 * the look in game: for each pixel along the beam and each across its ±beam_radius, beam_particle_chance% of
 * them become a one-frame particle of beam_particle_type, so the beam is a fizzy column that flickers every frame.
 *
 * Each lit pixel is blended over `data` (RGBA, `w`×`h`) at the material's colour and alpha, as a particle is, or
 * (`additive`, performance mode's stand-in for glow) added. When `glowSrc` is given, glowing materials also put
 * colour × alpha × `glowK` (gfx_glow/255 × 2.5 per texel, as particles do) into its ¼-resolution texel, once per
 * pixel a frame (`stamp`/`id`, shared with the particles). Returns how many pixels lit.
 */
export function fillBeam(
  b: Beam,
  rgb: number,
  data: Uint8ClampedArray,
  w: number,
  h: number,
  additive: boolean,
  glowSrc: Float32Array | null,
  glowW: number,
  glowK: number,
  stamp: Uint32Array | null,
  id: number,
  rnd: () => number = Math.random,
) {
  const dx = b.x1 - b.x0;
  const dy = b.y1 - b.y0;
  const len = Math.hypot(dx, dy);
  const n = Math.ceil(len);
  const ux = len > 0 ? dx / len : 1;
  const uy = len > 0 ? dy / len : 0;
  const across = Math.floor(Math.max(0, b.radius));
  const p = b.chance / 100;
  const a = Math.min(1, b.alpha);
  if (p <= 0 || a <= 0) return 0;
  const r = rgb >> 16;
  const g = (rgb >> 8) & 255;
  const bl = rgb & 255;
  const s = b.glow && glowSrc ? a * b.glowStrength * glowK : 0;
  let lit = 0;
  for (let i = 0; i <= n; i++) {
    const t = Math.min(i, len);
    const cx = b.x0 + ux * t;
    const cy = b.y0 + uy * t;
    for (let o = -across; o <= across; o++) {
      if (rnd() >= p) continue;
      // The perpendicular is (−uy, ux).
      const xi = Math.round(cx - uy * o);
      const yi = Math.round(cy + ux * o);
      if (xi < 0 || yi < 0 || xi >= w || yi >= h) continue;
      lit++;
      const pi = yi * w + xi;
      const di = pi * 4;
      if (s > 0 && stamp![pi] !== id) {
        stamp![pi] = id;
        const ti = ((yi >> 2) * glowW + (xi >> 2)) * 3;
        glowSrc![ti] += r * s;
        glowSrc![ti + 1] += g * s;
        glowSrc![ti + 2] += bl * s;
      }
      if (additive) {
        data[di] = data[di]! + r * a;
        data[di + 1] = data[di + 1]! + g * a;
        data[di + 2] = data[di + 2]! + bl * a;
        data[di + 3] = 255;
      } else {
        const da = data[di + 3]! / 255;
        const oa = a + da * (1 - a);
        const keep = (da * (1 - a)) / oa;
        data[di] = r * (a / oa) + data[di]! * keep;
        data[di + 1] = g * (a / oa) + data[di + 1]! * keep;
        data[di + 2] = bl * (a / oa) + data[di + 2]! * keep;
        data[di + 3] = oa * 255;
      }
    }
  }
  return lit;
}
