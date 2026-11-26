// How strongly a material glows, shared by the extractor (particles, sparks, beams) and the range's terrain
// so the two read materials.xml the same way.
import type { Material } from './types';

/**
 * materials.xml gfx_glow (inheritance resolved) as a strength: gfx_glow / 255. Fire and sparks are 1,
 * plasma_fading (a liquid) 254/255, spark_purple 60/255; a few materials go above 1 (gfx_glow 1000).
 * The cell type doesn't matter: only gfx_glow makes a material glow.
 */
export function materialGlow(m: Pick<Material, 'glowStrength'> | undefined): { glow: boolean; glowStrength: number } {
  const s = Math.max(0, m?.glowStrength ?? 0) / 255;
  return { glow: s > 0, glowStrength: s };
}
