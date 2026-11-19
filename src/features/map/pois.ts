// Points of interest as the maps show them: the fixed ones (from the world's fixed scenes) and the ones the
// seed's biome scripts placed, each with its name, a line about it and its wiki page (data/pois.json).
import type { MapScene, WorldMap } from '@/data/types';
import type { PoiData, PoiInfo, PoiKind, SeedPoi } from '@/seed/poi';

export type MapPoi = {
  id: string;
  name: string;
  kind: PoiKind;
  text?: string;
  wiki?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fixed: boolean;
  /** A fixed one's scene (it's a spoiler exactly when the scene is). */
  scene?: MapScene;
  /** A portal: where it sends you. */
  to?: { x: number; y: number };
};

/** Where a portal at (x, y) sends you, from its entity's TeleportComponent. */
export function portalDestination(map: WorldMap, entity: string, x: number, y: number) {
  const t = map.portalTargets?.[entity];
  return t && { x: t.absX ? t.x : x + t.x, y: t.absY ? t.y : y + t.y };
}

const withDestination = (map: WorldMap | undefined, p: MapPoi, entity: string): MapPoi => {
  const c = poiCentre(p);
  const to = map && portalDestination(map, entity, c.x, c.y);
  return to ? { ...p, to } : p;
};

/** The fixed points of interest: one per curated scene file, or one over each spliced group's pieces. */
export function fixedPois(map: WorldMap, data: PoiData): MapPoi[] {
  const out: MapPoi[] = [];
  const fixed = data.fixed ?? {};
  const groups = new Map<string, { x1: number; y1: number; x2: number; y2: number; scene: MapScene }>();
  map.scenes.forEach((s, i) => {
    const byFile = fixed[s.file];
    if (byFile) out.push({ ...make(`fixed:${i}`, byFile, s.x, s.y, s.w, s.h, true), scene: s });
    if (fixed[`group:${s.from}`]) {
      const g = groups.get(s.from) ?? { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity, scene: s };
      groups.set(s.from, { x1: Math.min(g.x1, s.x), y1: Math.min(g.y1, s.y), x2: Math.max(g.x2, s.x + s.w), y2: Math.max(g.y2, s.y + s.h), scene: g.scene });
    }
  });
  for (const [from, g] of groups) out.push({ ...make(`group:${from}`, fixed[`group:${from}`]!, g.x1, g.y1, g.x2 - g.x1, g.y2 - g.y1, true), scene: g.scene });
  // Portals at fixed spots (map.json), named from the table by their entity file.
  (map.portals ?? []).forEach((p, i) => {
    const info = data.scenes[p.entity];
    if (info) out.push(withDestination(map, make(`portal:${i}`, info, p.x - info.w / 2, p.y - info.h / 2, info.w, info.h, true), p.entity));
  });
  return out;
}

/** This seed's placed rooms and portals, with what the curated table says about each. */
export function placedPois(data: PoiData, placed: SeedPoi[], map?: WorldMap): MapPoi[] {
  return placed.flatMap((p, i) => {
    const info = data.scenes[p.file];
    if (!info) return [];
    const poi = make(`seed:${i}`, info, p.x, p.y, info.w, info.h, false);
    return [info.kind === 'portal' ? withDestination(map, poi, p.file) : poi];
  });
}

const make = (id: string, info: PoiInfo, x: number, y: number, w: number, h: number, fixed: boolean): MapPoi => ({
  id,
  name: info.name,
  kind: info.kind,
  ...(info.text ? { text: info.text } : {}),
  ...(info.wiki ? { wiki: info.wiki } : {}),
  x,
  y,
  w,
  h,
  fixed,
});

/** The middle of a point of interest, where its pin goes. */
export const poiCentre = (p: MapPoi) => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 });

/** "340 m east", "1.2 km down-left": from (x, y) to a point of interest, 1 pixel ≈ 1 m as the game's depth counter. */
export function poiDirection(from: { x: number; y: number }, p: MapPoi) {
  const c = poiCentre(p);
  const dx = c.x - from.x;
  const dy = c.y - from.y;
  const d = Math.hypot(dx, dy);
  const dist = d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.max(10, Math.round(d / 10) * 10)} m`;
  const h = Math.abs(dx) > d * 0.38 ? (dx > 0 ? 'right' : 'left') : '';
  const v = Math.abs(dy) > d * 0.38 ? (dy > 0 ? 'down' : 'up') : '';
  return `${dist} ${[v, h].filter(Boolean).join('-') || 'here'}`;
}
