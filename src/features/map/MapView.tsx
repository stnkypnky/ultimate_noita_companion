import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, Maximize, Minus, Plus } from 'lucide-react';
import { gameUrl, useData } from '@/data/store';
import type { Icon, Material, WorldMap } from '@/data/types';
import { BIOME_MODIFIERS } from '@/data/biomeModifiers';
import { SECRET_ITEMS, itemKey } from '@/data/spoilers';
import { useSpoilers } from '@/store/progress';
import { GROUND_STEP, groundLine, surfaceAt, type GroundPoint } from './ground';
import { biomeName, bodyMaterial, chunkWorld, displayMaterial, groundBands, isCursedRock, isLayered, namedInGame, placeName, surfaceWave, type makeVisibility } from './world';
import type { AreaLayout } from '@/seed/layout';
import type { BiomeModifier } from '@/seed/seed';
import type { SeedReport } from '@/seed/worker';
import type { SeedItem } from '@/seed/items';
import { poiCentre, type MapPoi } from './pois';
import { ITEM_COLOR, MODIFIER_COLOR, MOUNTAIN_COLOR, POI_COLOR, useMapLayers } from './layers';
import { LayersControl, type LayerCounts } from './LayersControl';

type Vis = ReturnType<typeof makeVisibility>;
type View = { x: number; y: number; s: number };

const FOG = '#120f18';
const SKY = '#1c2638';
const MIN_SCALE = 0.008;
const MAX_SCALE = 1;

/** Images by URL, shared by every map on the page; null while loading or failed. */
const imageCache = new Map<string, HTMLImageElement | null>();
function image(url: string, onLoad: () => void) {
  if (imageCache.has(url)) return imageCache.get(url) ?? null;
  imageCache.set(url, null);
  const i = new Image();
  i.onload = () => {
    imageCache.set(url, i);
    onLoad();
  };
  i.src = url;
  return null;
}

/** Material-file pictures recoloured as their materials, by URL; null while loading. */
const recoloured = new Map<string, HTMLCanvasElement | null>();
/** A material texture's pixels by URL (null: failed). */
const texturePixels = new Map<string, Promise<ImageData | null>>();
function texture(url: string) {
  let p = texturePixels.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => r.blob())
      .then((b) => createImageBitmap(b))
      .then((bmp) => {
        const c = document.createElement('canvas');
        c.width = bmp.width;
        c.height = bmp.height;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(bmp, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height);
      })
      .catch(() => null);
    texturePixels.set(url, p);
  }
  return p;
}

function materialPicture(
  url: string,
  colorOf: (rgb: number) => readonly [number, number, number, number] | null,
  onLoad: () => void,
  variant = '',
  /** Solid materials drawn with their texture (as the game does), aligned to the world at the picture's corner. */
  textured?: { textureOf: (rgb: number) => string | undefined; x: number; y: number },
) {
  const key = `${url}#${variant}`;
  if (recoloured.has(key)) return recoloured.get(key) ?? null;
  recoloured.set(key, null);
  void fetch(url)
    .then((r) => r.blob())
    // The stored key colours, untouched by colour management.
    .then((b) => createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }))
    .then(async (bmp) => {
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0);
      const img = ctx.getImageData(0, 0, c.width, c.height);
      const d = img.data;
      // The textures this picture uses, by key colour.
      const tex = new Map<number, ImageData | null>();
      if (textured) {
        for (let i = 0; i < d.length; i += 4) {
          const rgb = (d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!;
          if (!d[i + 3] || tex.has(rgb)) continue;
          const t = textured.textureOf(rgb);
          tex.set(rgb, t ? await texture(t) : null);
        }
      }
      for (let i = 0; i < d.length; i += 4) {
        const rgb = (d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!;
        const m = d[i + 3] ? colorOf(rgb) : null;
        if (!m) {
          d[i + 3] = 0;
          continue;
        }
        const t = tex.get(rgb);
        if (t && textured) {
          const p = i / 4;
          const tx = (((textured.x + (p % c.width)) % t.width) + t.width) % t.width;
          const ty = (((textured.y + Math.floor(p / c.width)) % t.height) + t.height) % t.height;
          const o = (ty * t.width + tx) * 4;
          [d[i], d[i + 1], d[i + 2], d[i + 3]] = [t.data[o]!, t.data[o + 1]!, t.data[o + 2]!, m[3]];
          continue;
        }
        [d[i], d[i + 1], d[i + 2], d[i + 3]] = m;
      }
      ctx.putImageData(img, 0, 0);
      recoloured.set(key, c);
      onLoad();
    })
    .catch(() => {});
  return null;
}

/** Every connected area of one biome: [biome index, centre x, centre y, chunks] (in chunks). */
function connectedAreas(map: WorldMap) {
  const seen = new Uint8Array(map.cells.length);
  const out: [number, number, number, number][] = [];
  for (let i = 0; i < map.cells.length; i++) {
    if (seen[i]) continue;
    const k = map.cells[i]!;
    const stack = [i];
    seen[i] = 1;
    let n = 0;
    let sx = 0;
    let sy = 0;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % map.w;
      const y = (j - x) / map.w;
      n++;
      sx += x;
      sy += y;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
        const m = ny * map.w + nx;
        if (!seen[m] && map.cells[m] === k) {
          seen[m] = 1;
          stack.push(m);
        }
      }
    }
    out.push([k, sx / n + 0.5, sy / n + 0.5, n]);
  }
  return out;
}

/** Connected areas of each named biome, for labels: [biome index, centre x, centre y, chunks]. */
function labelSpots(map: WorldMap, areas: [number, number, number, number][]) {
  const out = areas.filter(([k, , , n]) => namedInGame(map.biomes[k]!) && n >= 2);
  // One label per name, on its biggest area (plus any other area that's large in its own right).
  const best = new Map<string, number>();
  for (const [k, , , n] of out) {
    const name = biomeName(map.biomes[k]!);
    best.set(name, Math.max(best.get(name) ?? 0, n));
  }
  const used = new Set<string>();
  return out
    .sort((a, b) => b[3] - a[3])
    .filter(([k, , , n]) => {
      const name = biomeName(map.biomes[k]!);
      if (n >= 40 || (n === best.get(name) && !used.has(name))) {
        used.add(name);
        return true;
      }
      return false;
    });
}

const rgbOfHex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as const;

/**
 * A cave layout as a picture (one pixel per 10 world pixels): the biome's rock in its colour with lit edges where it
 * meets open cave, other layout colours as their materials (materials.xml wang_color), open cave and spawn markers
 * clear, and nothing outside the biome's own chunks.
 */
function layoutCanvas(map: WorldMap, l: AreaLayout, wangColors: Record<string, string>, materialById: Map<string, Material>, copy?: { rows: number; biome: number }) {
  const a = map.areas[l.area]!;
  // A copy in Heaven or Hell: the same layout `rows` up or down, shown where that world's biome is `biome`, in its rock.
  const shift = copy?.rows ?? 0;
  const own = copy?.biome ?? a.biome;
  const biome = map.biomes[own]!;
  const lookOf = (m: Material | undefined) => m?.look ?? m?.color;
  const rock = rgbOfHex(lookOf(materialById.get(biome.material ?? '')) ?? '#6b5d52');
  const c = document.createElement('canvas');
  c.width = l.width;
  c.height = l.height;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(l.width, l.height);
  const d = img.data;
  const mat = new Map<number, readonly [number, number, number, number] | null>();
  const colorOf = (rgb: number) => {
    let v = mat.get(rgb);
    if (v !== undefined) return v;
    const m = materialById.get(wangColors[rgb.toString(16).padStart(6, '0')] ?? '');
    v = m ? ([...rgbOfHex(lookOf(m)!), m.state === 'gas' ? 90 : m.state === 'liquid' ? 210 : 255] as const) : null;
    mat.set(rgb, v);
    return v;
  };
  const at = (x: number, y: number) => {
    const p = (y * l.width + x) * 3;
    return (l.rgb[p]! << 16) | (l.rgb[p + 1]! << 8) | l.rgb[p + 2]!;
  };
  for (let y = 0; y < l.height; y++) {
    const cy = a.y1 + Math.floor((y * 10) / map.chunk);
    for (let x = 0; x < l.width; x++) {
      const cx = a.x1 + Math.floor((x * 10) / map.chunk);
      const ry = cy + shift;
      if (cx >= map.w || ry < 0 || ry >= map.h || map.cells[ry * map.w + cx] !== own) continue;
      const v = at(x, y);
      const o = (y * l.width + x) * 4;
      // Black and near-black: open cave.
      if (v === 0 || ((v >> 16) === (v & 0xff) && ((v >> 8) & 0xff) === (v & 0xff) && (v & 0xff) < 40)) continue;
      // White is the biome's rock; greys are its other rock layers (the <Materials> material_index colours), drawn as
      // darker shades of it.
      const shade = (v >> 16) === (v & 0xff) && ((v >> 8) & 0xff) === (v & 0xff) ? (v & 0xff) / 255 : -1;
      if (shade > 0.15) {
        // Rock: a little grain, and lit where it borders open cave (as the game's edges catch the light).
        const open = (x > 0 && at(x - 1, y) === 0) || (y > 0 && at(x, y - 1) === 0) || (x + 1 < l.width && at(x + 1, y) === 0) || (y + 1 < l.height && at(x, y + 1) === 0);
        const grain = ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 17) - 8;
        const k = (open ? 1.6 : 1) * (0.75 + 0.25 * shade);
        d[o] = Math.min(255, rock[0] * k + grain);
        d[o + 1] = Math.min(255, rock[1] * k + grain);
        d[o + 2] = Math.min(255, rock[2] * k + grain);
        d[o + 3] = 255;
        continue;
      }
      const m = colorOf(v);
      if (!m) continue;
      d[o] = m[0];
      d[o + 1] = m[1];
      d[o + 2] = m[2];
      d[o + 3] = m[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export type MarkerKind = 'here' | 'died' | 'last';
const MARKER_LOOK: Record<MarkerKind, { glow: string; edge: string; body: string; shine: string }> = {
  here: { glow: 'rgba(185,247,154,0.9)', edge: '#173d14', body: '#8fe86a', shine: '#e2ffd2' },
  died: { glow: 'rgba(226,68,92,0.85)', edge: '#1a0507', body: '#f2e6c9', shine: '#ffffff' },
  last: { glow: 'rgba(200,190,180,0.6)', edge: '#2a2420', body: '#b9aa9c', shine: '#f3ede6' },
};
export { POI_COLOR };
/** The game's portal sprite is 96 × 96 world pixels, centred on the portal. */
const PORTAL_SPRITE = 96;

/** A portal as the game shows it: its swirl sprite in a violet glow; zoomed out, a small swirl of fixed size. */
function drawPortal(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, sprite: HTMLImageElement | null) {
  const size = PORTAL_SPRITE * scale;
  const r = Math.max(9, size * 0.55);
  const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
  glow.addColorStop(0, 'rgba(190,120,255,0.75)');
  glow.addColorStop(0.5, 'rgba(120,60,220,0.3)');
  glow.addColorStop(1, 'rgba(60,20,140,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  if (sprite && size >= 14) {
    ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    return;
  }
  ctx.fillStyle = '#0a0807';
  ctx.beginPath();
  ctx.arc(x, y, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = POI_COLOR.portal;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 3, 0.4, Math.PI * 1.9);
  ctx.stroke();
  ctx.fillStyle = '#f1e2ff';
  ctx.fillRect(x - 1, y - 1, 2, 2);
}
/** A 7 × 7 pixel diamond (rows as [dx, dy, w, h]), and a 1-pixel rim around it. */
const DIAMOND: [number, number, number, number][] = [
  [-1, -3, 2, 1],
  [-2, -2, 4, 1],
  [-3, -1, 6, 2],
  [-2, 1, 4, 1],
  [-1, 2, 2, 1],
];
const DIAMOND_RIM: [number, number, number, number][] = [
  [-1, -4, 2, 1],
  [-2, -3, 4, 1],
  [-3, -2, 6, 1],
  [-4, -1, 8, 2],
  [-3, 1, 6, 1],
  [-2, 2, 4, 1],
  [-1, 3, 2, 1],
];
/** 7 × 7, centred on the marker. */
const SKULL = [' ##### ', '#######', '#  #  #', '#######', ' ## ## ', ' # # # ', '       '];
/** A Holy Mountain: a small peak with a doorway. */
const PEAK = ['   #   ', '  ###  ', '  ###  ', ' ##### ', ' ## ## ', '### ###', '### ###'];

/** A pixel picture (rows of '#'), centred, each pixel `px` screen pixels, on a dark rim. */
function pixelGlyph(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, px: number, color: string) {
  const w = rows[0]!.length;
  const h = rows.length;
  const ox = x - Math.floor((w * px) / 2);
  const oy = y - Math.floor((h * px) / 2);
  ctx.fillStyle = '#0a0807';
  rows.forEach((row, r) => [...row].forEach((c, k) => c === '#' && ctx.fillRect(ox + k * px - 1, oy + r * px - 1, px + 2, px + 2)));
  ctx.fillStyle = color;
  rows.forEach((row, r) => [...row].forEach((c, k) => c === '#' && ctx.fillRect(ox + k * px, oy + r * px, px, px)));
}

/** The world map: biomes in their own rock, the game's fixed rooms on top. Drag to pan, wheel or pinch to zoom. */
export function MapView({
  map,
  vis,
  materialById,
  selected,
  onSelect,
  layouts,
  wangColors,
  marker,
  follow,
  markerKind = 'here',
  pois,
  ground,
  layersKey,
  report,
  items,
}: {
  map: WorldMap;
  vis: Vis;
  materialById: Map<string, Material>;
  selected: { cx: number; cy: number } | null;
  onSelect: (cx: number, cy: number) => void;
  /** The seed's cave layouts, when generated. */
  layouts?: AreaLayout[] | null;
  wangColors?: Record<string, string> | null;
  /** "You are here": the player's world position, from the live run. */
  marker?: { x: number; y: number } | null;
  /** Start zoomed in on the marker and keep it centred as it moves. */
  follow?: boolean;
  /** What the marker means: you, live; where a past run died; where it was last seen. */
  markerKind?: MarkerKind;
  /** Points of interest to pin (fixed ones and the seed's rooms). */
  pois?: MapPoi[] | null;
  /** The real overworld ground line where the mod sampled it (live runs, mod 5). */
  ground?: GroundPoint[] | null;
  /** Gives the map a Layers panel, its choices remembered under this name. */
  layersKey?: string;
  /** The seed's report (biome modifiers, Holy Mountain perks); null while it's worked out, absent where it doesn't apply. */
  report?: SeedReport | null;
  /** The seed's items; null while they're placed, absent where they don't apply. */
  items?: SeedItem[] | null;
}) {
  const layers = useMapLayers(layersKey);
  const { perkById, spellById, items: itemList } = useData();
  const itemById = useMemo(() => new Map(itemList.map((i) => [i.id, i])), [itemList]);
  const { visible } = useSpoilers();
  const line = useMemo(() => (ground?.length ? groundLine(ground) : null), [ground]);
  const showCaves = layers.on('caves');
  const caves = useMemo(() => {
    const out = new Map<number, HTMLCanvasElement>();
    if (layouts && wangColors && showCaves) for (const l of layouts) out.set(l.area, layoutCanvas(map, l, wangColors, materialById));
    return out;
  }, [layouts, wangColors, map, materialById, showCaves]);
  // Heaven and Hell (the world one map-height up and down) show the main world's caves again, wherever their own
  // biome is a cave biome (the_sky, the_end, robobase's column), in that biome's rock (as noita-telescope draws them).
  const copies = useMemo(() => {
    const out: { area: number; rows: number; biome: number; canvas: HTMLCanvasElement }[] = [];
    if (!layouts || !wangColors || !map.mapRows || !showCaves) return out;
    // The world repeats every biome_map.png height (48 rows, 24576 px) up and down.
    const period = map.mapRows;
    for (const l of layouts) {
      const a = map.areas[l.area]!;
      for (const rows of [-period, period]) {
        const found = new Set<number>();
        for (let cy = a.y1 + rows; cy <= a.y2 + rows; cy++) {
          if (cy < 0 || cy >= map.h) continue;
          for (let cx = a.x1; cx <= a.x2; cx++) {
            const k = map.cells[cy * map.w + cx]!;
            if (map.biomes[k]!.wangTemplate) found.add(k);
          }
        }
        for (const biome of found) out.push({ area: l.area, rows, biome, canvas: layoutCanvas(map, l, wangColors, materialById, { rows, biome }) });
      }
    }
    return out;
  }, [layouts, wangColors, map, materialById, showCaves]);
  const caveBiomes = useMemo(() => new Set([...[...caves.keys()].map((i) => map.areas[i]!.biome), ...copies.map((c) => c.biome)]), [caves, copies, map]);
  // Areas a picture lays out whole (the Lava Lake): drawn as a room, the picture's rock over the backdrop.
  const sceneAreas = useMemo(() => new Set(map.scenes.flatMap((s) => (s.area ? [s.area] : []))), [map]);
  // A material file's key colour → what that material looks like (unknown keys and spawn markers: clear).
  const sceneColor = useCallback(
    (rgb: number, id?: string) => {
      const m = materialById.get(id ?? wangColors?.[rgb.toString(16).padStart(6, '0')] ?? '');
      // Air is empty, not a dark liquid.
      if (!m || m.id === 'air') return null;
      return [...rgbOfHex(m.look ?? m.color), m.state === 'gas' ? 90 : m.state === 'liquid' ? 210 : 255] as const;
    },
    [materialById, wangColors],
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const view = useRef<View | null>(null);
  const [tick, setTick] = useState(0);
  const redraw = useCallback(() => setTick((t) => t + 1), []);
  const areas = useMemo(() => connectedAreas(map), [map]);
  const spots = useMemo(() => labelSpots(map, areas), [map, areas]);
  // Each place's modifier, on its biggest area (the Pyramid's parts and the Mines' hall count as their place).
  const modifierSpots = useMemo(() => {
    const best = new Map<string, { k: number; x: number; y: number; n: number; m: BiomeModifier }>();
    if (!report) return [];
    for (const [k, x, y, n] of areas) {
      const b = map.biomes[k]!;
      const m = report.modifiers[b.id];
      if (!m) continue;
      const key = `${placeName(b)}|${m.id}`;
      if ((best.get(key)?.n ?? 0) < n) best.set(key, { k, x, y, n, m });
    }
    return [...best.values()].sort((a, b) => b.n - a.n);
  }, [areas, map, report]);
  /** By biome index: drawn in ground layers (the overworld). */
  const layered = useMemo(() => map.biomes.map(isLayered), [map]);
  const biomeById = useMemo(() => new Map(map.biomes.map((b) => [b.id, b])), [map]);
  const worldW = map.w * map.chunk;
  const left = -(map.w / 2) * map.chunk;
  const top = -map.offsetY * map.chunk;
  /** The biome index at a world position, or -1 outside the map. */
  const cellAt = useCallback(
    (x: number, y: number) => {
      const cx = Math.floor((x - left) / map.chunk);
      const cy = Math.floor((y - top) / map.chunk);
      return cx < 0 || cy < 0 || cx >= map.w || cy >= map.h ? -1 : map.cells[cy * map.w + cx]!;
    },
    [map, left, top],
  );
  /** Whether a spot is in an area you can see (nothing is pinned, or counted, in one you haven't found). */
  const inSight = useCallback(
    (x: number, y: number) => {
      const k = cellAt(x, y);
      return k >= 0 && vis.biome(map.biomes[k]!);
    },
    [cellAt, vis, map],
  );
  const seenPois = useMemo(() => (pois ?? []).filter((p) => inSight(poiCentre(p).x, poiCentre(p).y) && (!p.scene || vis.scene(p.scene))), [pois, inSight, vis]);
  const seenItems = useMemo(() => (items ?? []).filter((it) => inSight(it.x, it.y)), [items, inSight]);
  const seenModifiers = useMemo(() => modifierSpots.filter((s) => vis.biome(map.biomes[s.k]!)), [modifierSpots, vis, map]);
  // The Holy Mountains, where their shops stand, with what each offers this seed.
  const mountains = useMemo(
    () => (report ? map.shops.map((at, i) => ({ at, n: i + 1, perks: report.perks.mountains[i] ?? [], shop: report.shops[i] })).filter((m) => inSight(m.at.x, m.at.y)) : []),
    [report, map, inSight],
  );
  const counts = useMemo(() => {
    const c: LayerCounts = {};
    const poiKinds = ['room', 'puzzle', 'shop', 'treasure', 'secret', 'hazard', 'portal'] as const;
    for (const k of poiKinds) c[`poi:${k}`] = pois === undefined ? null : pois === null ? 'loading' : seenPois.filter((p) => p.kind === k).length;
    for (const k of Object.keys(ITEM_COLOR) as (keyof typeof ITEM_COLOR)[]) c[`item:${k}`] = items === undefined ? null : items === null ? 'loading' : seenItems.filter((it) => it.kind === k).length;
    c.modifiers = report === undefined ? null : report === null ? 'loading' : seenModifiers.length;
    c.mountains = report === undefined ? null : report === null ? 'loading' : mountains.length;
    if (!layouts && !wangColors) c.caves = 'loading';
    return c;
  }, [pois, items, report, seenPois, seenItems, seenModifiers, mountains, layouts, wangColors]);

  const mx = marker?.x;
  const my = marker?.y;
  // Following the marker stops when you drag the map away (or ask for the whole map); the locate button resumes it.
  const following = useRef(!!follow);
  // Close enough to see the terrain around you: about a biome's height across the map's shorter side.
  const followScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(size.w, size.h) / (map.chunk * 1.5)));
  const fitWorld = useCallback(() => {
    if (!size.w) return;
    // The main world (biome_map.png's rows); Heaven and Hell above and below are a zoom out or a pan away.
    const mainTop = top + (map.mapTop ?? 0) * map.chunk;
    const mainH = (map.mapRows ?? map.h) * map.chunk;
    const s = Math.min(size.w / worldW, size.h / mainH);
    view.current = { s, x: left - (size.w / s - worldW) / 2, y: mainTop - (size.h / s - mainH) / 2 };
    following.current = false;
    redraw();
  }, [size, worldW, left, top, redraw, map.chunk, map.mapTop, map.mapRows, map.h]);
  /** Back to you: centred on the marker, zoomed in at least as far as the starting view. */
  const locate = useCallback(() => {
    if (!size.w || mx === undefined || my === undefined) return;
    const s = Math.max(view.current?.s ?? 0, followScale);
    view.current = { s, x: mx - size.w / s / 2, y: my - size.h / s / 2 };
    following.current = !!follow;
    redraw();
  }, [size, mx, my, followScale, follow, redraw]);
  useEffect(() => {
    if (view.current || !size.w) return;
    // The marker only places the first view; following it is the effect below.
    if (follow && mx !== undefined) locate();
    else fitWorld();
  }, [fitWorld, locate, follow, mx, size.w]);
  useEffect(() => {
    const v = view.current;
    if (!following.current || !v || mx === undefined || my === undefined || !size.w) return;
    view.current = { ...v, x: mx - size.w / v.s / 2, y: my - size.h / v.s / 2 };
    redraw();
  }, [mx, my, size, redraw]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e!.contentRect.width), h: Math.round(e!.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoomAt = useCallback(
    (px: number, py: number, factor: number) => {
      const v = view.current;
      if (!v) return;
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.s * factor));
      const wx = v.x + px / v.s;
      const wy = v.y + py / v.s;
      view.current = { s, x: wx - px / s, y: wy - py / s };
      redraw();
    },
    [redraw],
  );

  // Draw.
  useEffect(() => {
    const c = canvasRef.current;
    const v = view.current;
    if (!c || !v || !size.w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== size.w * dpr || c.height !== size.h * dpr) {
      c.width = size.w * dpr;
      c.height = size.h * dpr;
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#07060a';
    ctx.fillRect(0, 0, size.w, size.h);
    const cs = map.chunk * v.s;
    const toScreen = (x: number, y: number) => [(x - v.x) * v.s, (y - v.y) * v.s] as const;
    const cx0 = Math.max(0, Math.floor((v.x - left) / map.chunk));
    const cy0 = Math.max(0, Math.floor((v.y - top) / map.chunk));
    const cx1 = Math.min(map.w - 1, Math.floor((v.x + size.w / v.s - left) / map.chunk));
    const cy1 = Math.min(map.h - 1, Math.floor((v.y + size.h / v.s - top) / map.chunk));
    // Material textures as world-aligned patterns.
    const patterns = new Map<string, CanvasPattern | string>();
    const fillFor = (id: string | undefined): CanvasPattern | string => {
      if (!id) return SKY;
      const have = patterns.get(id);
      if (have) return have;
      const m = materialById.get(id);
      const color = m ? (m.look ?? m.color).slice(0, 7) : '#5a5048';
      let fill: CanvasPattern | string = color;
      // Zoomed out, a scaled-down pixel texture picks stray texels (a gold chunk read as a brown speck): the
      // texture's average colour is the truer look. Close up, the texture itself.
      if (m?.texture && cs >= 24) {
        const img = image(gameUrl(`materials/${m.texture.split('/').pop()}`), redraw);
        const p = img && ctx.createPattern(img, 'repeat');
        if (p) {
          p.setTransform(new DOMMatrix([v.s, 0, 0, v.s, -v.x * v.s, -v.y * v.s]));
          fill = p;
        }
      }
      patterns.set(id, fill);
      return fill;
    };
    // Cave biomes show their in-game cave backdrop (what you see inside them), tinted by their rock.
    const backdrops = new Map<string, CanvasPattern | null>();
    const backdropFor = (bg: string) => {
      if (backdrops.has(bg)) return backdrops.get(bg)!;
      const img = image(gameUrl(`backgrounds/${bg}.png`), redraw);
      const p = img && ctx.createPattern(img, 'repeat');
      p?.setTransform(new DOMMatrix([v.s, 0, 0, v.s, -v.x * v.s, -v.y * v.s]));
      backdrops.set(bg, p ?? null);
      return p ?? null;
    };
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const b = map.biomes[map.cells[cy * map.w + cx]!]!;
        const w = chunkWorld(map, cx, cy);
        const [sx, sy] = toScreen(w.x, w.y);
        // Slight overlap hides seams between chunks.
        const rx = Math.floor(sx);
        const ry = Math.floor(sy);
        const rs = Math.ceil(cs) + 1;
        if (!vis.biome(b)) {
          ctx.fillStyle = FOG;
          ctx.fillRect(rx, ry, rs, rs);
          continue;
        }
        // Rooms with no rock of their own (Holy Mountains, secret rooms) underground: just their backdrop. Biomes with
        // a generated layout: the backdrop, dimmed, behind the layout's rock (drawn next).
        if (isLayered(b)) {
          // The overworld: sky, then its ground layers by depth, the top one with a rolling edge.
          ctx.fillStyle = SKY;
          ctx.fillRect(rx, ry, rs, rs);
          const wy0 = w.y;
          const wy1 = w.y + map.chunk;
          // Each layer from its (rolling) top edge down to the chunk's bottom; the next layer paints over the rest. The
          // whole column rolls together, so thin surface layers keep their thickness.
          const bands = groundBands(b);
          // Where the mod sampled the real ground, the column rolls to it (its top layer starts there); elsewhere a
          // made-up roll of at most ±80 px.
          const surfaceTop = bands[0]?.y0 ?? 0;
          const roll = (x: number) => {
            const real = line ? surfaceAt(line, x) : undefined;
            return real !== undefined ? surfaceTop - real : surfaceWave(x);
          };
          const R = line ? 2000 : 80;
          const step = line ? Math.max(GROUND_STEP, 2 / v.s) : Math.max(32, 4 / v.s);
          for (const band of bands) {
            // A layer the next one fully covers, or one still below the chunk, is skipped.
            if (band.y1 + R <= wy0 || band.y0 - R >= wy1) continue;
            ctx.fillStyle = fillFor(band.material);
            const flat = band.y0 + R <= wy0;
            if (flat) {
              ctx.fillRect(rx, ry, rs, rs);
              continue;
            }
            // Sampled every 32 world px, and at least every 4 screen px.
            ctx.beginPath();
            ctx.moveTo(rx, ry + rs);
            for (let x = w.x; ; x += step) {
              const xx = Math.min(x, w.x + map.chunk);
              const edge = Math.min(wy1, Math.max(wy0, band.y0 - roll(xx)));
              const [px, py] = toScreen(xx, edge);
              ctx.lineTo(xx === w.x ? rx : xx >= w.x + map.chunk ? rx + rs : px, edge <= wy0 ? ry : py);
              if (xx >= w.x + map.chunk) break;
            }
            ctx.lineTo(rx + rs, ry + rs);
            ctx.closePath();
            ctx.fill();
          }
          continue;
        }
        const laidOut = caveBiomes.has(map.cells[cy * map.w + cx]!) || sceneAreas.has(b.id);
        const roomOnly = (!b.material && b.background && cy >= map.offsetY) || laidOut;
        const cave = (b.wang || roomOnly) && b.background ? backdropFor(b.background) : null;
        ctx.fillStyle = roomOnly ? '#0b0910' : fillFor(displayMaterial(b, cy < map.offsetY));
        ctx.fillRect(rx, ry, rs, rs);
        if (cave) {
          ctx.globalAlpha = laidOut ? 0.55 : roomOnly ? 1 : 0.72;
          ctx.fillStyle = cave;
          ctx.fillRect(rx, ry, rs, rs);
          ctx.globalAlpha = 1;
        }
      }
    }
    // The seed's caves: each layout pixel is 10 × 10 world pixels.
    for (const [i, cnv] of caves) {
      const a = map.areas[i]!;
      if (!vis.biome(map.biomes[a.biome]!)) continue;
      const w = chunkWorld(map, a.x1, a.y1);
      const [sx, sy] = toScreen(w.x, w.y);
      const sw = cnv.width * 10 * v.s;
      const sh = cnv.height * 10 * v.s;
      if (sx > size.w || sy > size.h || sx + sw < 0 || sy + sh < 0) continue;
      ctx.drawImage(cnv, sx, sy, sw, sh);
    }
    for (const c of copies) {
      if (!vis.biome(map.biomes[c.biome]!)) continue;
      const a = map.areas[c.area]!;
      const w = chunkWorld(map, a.x1, a.y1 + c.rows);
      const [sx, sy] = toScreen(w.x, w.y);
      const sw = c.canvas.width * 10 * v.s;
      const sh = c.canvas.height * 10 * v.s;
      if (sx > size.w || sy > size.h || sx + sw < 0 || sy + sh < 0) continue;
      ctx.drawImage(c.canvas, sx, sy, sw, sh);
    }
    // Shade the plain rock and sky so the areas stand out.
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const b = map.biomes[map.cells[cy * map.w + cx]!]!;
        if (!vis.biome(b) || namedInGame(b) || isCursedRock(b) || isLayered(b) || !displayMaterial(b, cy < map.offsetY)) continue;
        const w = chunkWorld(map, cx, cy);
        const [sx, sy] = toScreen(w.x, w.y);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(Math.floor(sx), Math.floor(sy), Math.ceil(cs) + 1, Math.ceil(cs) + 1);
      }
    }
    // The game's rooms and props.
    for (const sc of map.scenes) {
      if (!vis.scene(sc)) continue;
      const [sx, sy] = toScreen(sc.x, sc.y);
      const sw = sc.w * v.s;
      const sh = sc.h * v.s;
      if (sx > size.w || sy > size.h || sx + sw < 0 || sy + sh < 0 || sw < 1) continue;
      // An overworld room's white is its biome's body rock (the mountain); a whole area's picture's, that area's rock.
      const body = sc.rock ? undefined : sc.from === 'biome' ? bodyMaterial(biomeById.get(sc.id)!) : undefined;
      const rockId = sc.rock ?? body;
      // The overworld's rooms show their solid materials' textures (the mountain's speckled rock).
      const textured = body
        ? {
            x: sc.x,
            y: sc.y,
            textureOf: (rgb: number) => {
              const m = materialById.get(rgb === 0xffffff ? body : (wangColors?.[rgb.toString(16).padStart(6, '0')] ?? ''));
              return m?.texture && m.state === 'solid' ? gameUrl(`materials/${m.texture.split('/').pop()}`) : undefined;
            },
          }
        : undefined;
      for (const key of [sc.background, sc.mask, sc.image]) {
        if (!key) continue;
        if (key === sc.mask || (key === sc.image && sc.materials)) {
          if (!wangColors) continue;
          const rock = rockId ? sceneColor(0, rockId) : null;
          const pic = materialPicture(gameUrl(`map/${key}.png`), (rgb) => (rock && rgb === 0xffffff ? rock : sceneColor(rgb)), redraw, `${rockId ?? ''}|${textured ? `${sc.x},${sc.y}` : ''}`, textured);
          if (pic) ctx.drawImage(pic, sx, sy, sw, sh);
          continue;
        }
        const img = image(gameUrl(`map/${key}.png`), redraw);
        if (img) ctx.drawImage(img, sx, sy, sw, sh);
      }
    }
    // Borders between areas, and fog marks.
    ctx.strokeStyle = 'rgba(255,240,200,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const k = map.cells[cy * map.w + cx]!;
        const w = chunkWorld(map, cx, cy);
        const [sx, sy] = toScreen(w.x, w.y);
        // The overworld's pieces read as one landscape: no lines between them.
        const scenery = (i: number, row: number) => layered[i]! || (row < map.offsetY && !map.biomes[i]!.wang && !displayMaterial(map.biomes[i]!, true));
        const open = (j: number) => scenery(k, cy) && scenery(map.cells[j]!, Math.floor(j / map.w));
        if (cx + 1 < map.w && map.cells[cy * map.w + cx + 1] !== k && !open(cy * map.w + cx + 1)) {
          ctx.moveTo(Math.round(sx + cs) + 0.5, sy);
          ctx.lineTo(Math.round(sx + cs) + 0.5, sy + cs);
        }
        if (cy + 1 < map.h && map.cells[(cy + 1) * map.w + cx] !== k && !open((cy + 1) * map.w + cx)) {
          ctx.moveTo(sx, Math.round(sy + cs) + 0.5);
          ctx.lineTo(sx + cs, Math.round(sy + cs) + 0.5);
        }
      }
    }
    if (cs >= 6) ctx.stroke();
    if (cs >= 16) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.font = `${Math.min(28, cs * 0.5)}px ui-sans-serif, system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          if (vis.biome(map.biomes[map.cells[cy * map.w + cx]!]!)) continue;
          const w = chunkWorld(map, cx, cy);
          const [sx, sy] = toScreen(w.x, w.y);
          ctx.fillText('?', sx + cs / 2, sy + cs / 2);
        }
      }
    }
    // Labels and pins skip a spot that would overlap one already drawn (biggest areas first).
    const taken: [number, number, number, number][] = [];
    const free = (box: [number, number, number, number]) => {
      if (taken.some((t) => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1])) return false;
      taken.push(box);
      return true;
    };
    const outlined = (text: string, x: number, y: number, color: string) => {
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    };
    const offScreen = (x: number, y: number, reach: number) => x < -reach || y < -reach || x > size.w + reach || y > size.h + reach;
    // Names of the areas you can see.
    const names = layers.on('names');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${cs > 40 ? 15 : 12}px ui-sans-serif, system-ui`;
    if (names) {
      for (const [k, mx, my] of spots) {
        const b = map.biomes[k]!;
        if (!vis.biome(b)) continue;
        const [sx, sy] = toScreen(left + mx * map.chunk, top + my * map.chunk);
        if (offScreen(sx, sy, 80)) continue;
        const label = biomeName(b);
        const half = ctx.measureText(label).width / 2 + 3;
        if (free([sx - half, sy - 9, sx + half, sy + 9])) outlined(label, sx, sy, '#f2e6c9');
      }
    }
    // This seed's biome modifiers: under the area's name, on the game's banner close up.
    if (layers.on('modifiers')) {
      ctx.font = `600 11px ui-sans-serif, system-ui`;
      for (const s of seenModifiers) {
        const b = map.biomes[s.k]!;
        const [sx, sy0] = toScreen(left + s.x * map.chunk, top + s.y * map.chunk);
        const labelled = names && namedInGame(b) && s.n >= 2;
        const sy = sy0 + (labelled ? (cs > 40 ? 18 : 15) : 0);
        if (offScreen(sx, sy, 80)) continue;
        const name = BIOME_MODIFIERS[s.m.id]?.name ?? s.m.id.toLowerCase().replace(/_/g, ' ');
        const tw = ctx.measureText(name).width;
        const banner = cs >= 40 && s.m.decoration ? image(gameUrl(`ui/modifiers/${s.m.decoration}.png`), redraw) : null;
        const half = Math.ceil(tw / 2 + (banner ? 20 : 3));
        if (!free([sx - half, sy - (banner ? 12 : 8), sx + half, sy + (banner ? 12 : 8)])) continue;
        if (banner) {
          // 72 × 24: the 17 px ends hold the emblems, the middle stretches.
          const bx = Math.round(sx - half);
          const by = Math.round(sy - 12);
          const bw = half * 2;
          ctx.drawImage(banner, 0, 0, 17, 24, bx, by, 17, 24);
          ctx.drawImage(banner, 17, 0, 38, 24, bx + 17, by, bw - 34, 24);
          ctx.drawImage(banner, 55, 0, 17, 24, bx + bw - 17, by, 17, 24);
        }
        outlined(name, sx, sy, banner ? '#f2e6c9' : MODIFIER_COLOR);
      }
    }
    // Points of interest: a pin each, the room's outline close up, and its name closer still (labels that would
    // overlap an area name or another pin's are left out).
    if (seenPois.length) {
      ctx.font = `600 11px ui-sans-serif, system-ui`;
      const portalSprite = map.portalImage ? image(gameUrl(`map/${map.portalImage}.png`), redraw) : null;
      for (const p of seenPois) {
        if (!layers.on(`poi:${p.kind}`)) continue;
        const c = poiCentre(p);
        const [fx, fy] = toScreen(c.x, c.y);
        const reach = p.kind === 'portal' ? Math.max(40, PORTAL_SPRITE * v.s) : 40;
        if (fx < -reach || fy < -reach || fx > size.w + reach || fy > size.h + reach) continue;
        const color = POI_COLOR[p.kind];
        const sw = p.w * v.s;
        const sh = p.h * v.s;
        if (p.kind === 'portal') drawPortal(ctx, fx, fy, v.s, portalSprite);
        else if (sw >= 28 && sh >= 16) {
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = 1;
          ctx.strokeRect(Math.round(fx - sw / 2) + 0.5, Math.round(fy - sh / 2) + 0.5, Math.round(sw), Math.round(sh));
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
        // A small pixel diamond: dark rim, the kind's colour, a light glint.
        const sx = Math.round(fx);
        const sy = Math.round(fy);
        if (p.kind !== 'portal') {
          ctx.fillStyle = '#0a0807';
          for (const [dx, dy, w, h] of DIAMOND_RIM) ctx.fillRect(sx + dx, sy + dy, w, h);
          ctx.fillStyle = color;
          for (const [dx, dy, w, h] of DIAMOND) ctx.fillRect(sx + dx, sy + dy, w, h);
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.fillRect(sx - 1, sy - 3, 2, 2);
        }
        if (cs >= 150) {
          // Below the pin, or below a portal's swirl.
          const below = p.kind === 'portal' ? Math.max(7, Math.round((PORTAL_SPRITE * v.s) / 2)) : 7;
          const half = ctx.measureText(p.name).width / 2 + 3;
          const box: [number, number, number, number] = [sx - half, sy + below, sx + half, sy + below + 14];
          if (taken.some((t) => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1])) continue;
          taken.push(box);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(0,0,0,0.85)';
          ctx.strokeText(p.name, sx, sy + below + 1);
          ctx.fillStyle = color;
          ctx.fillText(p.name, sx, sy + below + 1);
        }
      }
    }
    // The Holy Mountains: a gold peak at each shop, and close up the perks it offers this seed ("?" for ones you
    // haven't discovered) and which shop it has.
    if (layers.on('mountains') && mountains.length) {
      const perkAtlas = image(gameUrl('sprites/perks.png'), redraw);
      ctx.font = `600 11px ui-sans-serif, system-ui`;
      for (const m of mountains) {
        const [fx, fy] = toScreen(m.at.x, m.at.y);
        if (offScreen(fx, fy, 80)) continue;
        const sx = Math.round(fx);
        const sy = Math.round(fy);
        pixelGlyph(ctx, PEAK, sx, sy, 2, MOUNTAIN_COLOR);
        if (cs < 150) continue;
        const step = 20;
        const x0 = Math.round(sx - (m.perks.length * step) / 2 + 2);
        const py = sy - 34;
        if (m.perks.length && free([x0 - 2, py - 2, x0 + m.perks.length * step, py + 18])) {
          m.perks.forEach((id, i) => {
            const p = perkById.get(id);
            const px = x0 + i * step;
            ctx.fillStyle = 'rgba(10,8,7,0.85)';
            ctx.fillRect(px - 1, py - 1, 18, 18);
            if (p && visible(p.discoverFlag) && perkAtlas) ctx.drawImage(perkAtlas, p.icon.x, p.icon.y, p.icon.w, p.icon.h, px + 8 - p.icon.w / 2, py + 8 - p.icon.h / 2, p.icon.w, p.icon.h);
            else {
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              outlined('?', px + 8, py + 8, '#8a7f73');
            }
          });
        }
        const label = `Holy Mountain ${m.n}${m.shop ? ` · ${m.shop.type === 'wand' ? 'wand shop' : 'spell shop'}` : ''}`;
        const half = ctx.measureText(label).width / 2 + 3;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        if (free([sx - half, sy + 8, sx + half, sy + 22])) outlined(label, sx, sy + 9, MOUNTAIN_COLOR);
      }
    }
    // Items: a dot each once zoomed in a little (the whole world's would bury the area names), and close up its
    // picture (a secret item, or a spell you haven't found, stays a dot).
    if (seenItems.length && cs >= 40) {
      const atlas = image(gameUrl('sprites/items.png'), redraw);
      const spellAtlas = image(gameUrl('sprites/spells.png'), redraw);
      const wandPic = image(`${import.meta.env.BASE_URL}icons/wand.png`, redraw);
      for (const it of seenItems) {
        if (!layers.on(`item:${it.kind}`)) continue;
        const [fx, fy] = toScreen(it.x, it.y);
        if (offScreen(fx, fy, 20)) continue;
        const sx = Math.round(fx);
        const sy = Math.round(fy);
        const spell = it.kind === 'spell' ? spellById.get(it.file) : undefined;
        const hidden = (it.item && SECRET_ITEMS.has(it.item) && !visible(itemKey(it.item))) || (it.kind === 'spell' && !(spell && visible(spell.discoverFlag)));
        const icon: { img: HTMLImageElement | null; r: Icon } | null =
          cs < 150 || hidden
            ? null
            : it.kind === 'wand'
              ? wandPic && { img: wandPic, r: { x: 0, y: 0, w: wandPic.width, h: wandPic.height } }
              : spell
                ? { img: spellAtlas, r: spell.icon }
                : it.item && itemById.get(it.item)?.icon.w
                  ? { img: atlas, r: itemById.get(it.item)!.icon }
                  : null;
        if (icon?.img) {
          // At most 16 px across, as the game's own icons.
          const k = Math.min(1, 16 / Math.max(icon.r.w, icon.r.h));
          const w = Math.round(icon.r.w * k);
          const h = Math.round(icon.r.h * k);
          ctx.fillStyle = 'rgba(10,8,7,0.6)';
          ctx.fillRect(sx - w / 2 - 1, sy - h / 2 - 1, w + 2, h + 2);
          ctx.drawImage(icon.img, icon.r.x, icon.r.y, icon.r.w, icon.r.h, sx - w / 2, sy - h / 2, w, h);
          continue;
        }
        ctx.fillStyle = '#0a0807';
        ctx.fillRect(sx - 3, sy - 3, 6, 6);
        ctx.fillStyle = hidden ? '#8a7f73' : ITEM_COLOR[it.kind];
        ctx.fillRect(sx - 2, sy - 2, 4, 4);
      }
    }
    if (selected) {
      const w = chunkWorld(map, selected.cx, selected.cy);
      const [sx, sy] = toScreen(w.x, w.y);
      ctx.strokeStyle = '#ffd36b';
      ctx.lineWidth = 2;
      ctx.strokeRect(Math.round(sx) + 1, Math.round(sy) + 1, Math.max(4, cs - 2), Math.max(4, cs - 2));
    }
    if (mx !== undefined && my !== undefined) {
      const [fx, fy] = toScreen(mx, my);
      const sx = Math.round(fx);
      const sy = Math.round(fy);
      const look = MARKER_LOOK[markerKind];
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 16);
      glow.addColorStop(0, look.glow);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sx - 16, sy - 16, 32, 32);
      if (markerKind === 'died') {
        // A pixel skull: where the run ended.
        const px = 2;
        ctx.fillStyle = '#1a0507';
        ctx.fillRect(sx - 4 * px, sy - 4 * px, 8 * px, 8 * px);
        ctx.fillStyle = look.body;
        SKULL.forEach((row, r) =>
          [...row].forEach((c, k) => {
            if (c === '#') ctx.fillRect(sx + (k - 3) * px, sy + (r - 3) * px, px, px);
          }),
        );
      } else {
        // A "you are here" light like the live crystal; grey where a past run left off.
        ctx.fillStyle = look.edge;
        ctx.fillRect(sx - 4, sy - 4, 8, 8);
        ctx.fillStyle = look.body;
        ctx.fillRect(sx - 3, sy - 3, 6, 6);
        ctx.fillStyle = look.shine;
        ctx.fillRect(sx - 2, sy - 2, 2, 2);
      }
    }
  }, [tick, size, map, vis, materialById, selected, spots, left, top, redraw, caves, copies, caveBiomes, sceneAreas, wangColors, sceneColor, mx, my, markerKind, layered, biomeById, line, layers, seenPois, seenItems, seenModifiers, mountains, perkById, spellById, itemById, visible]);

  // Pointer: drag pans, two fingers pinch, a tap selects.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; dist: number }>({ moved: false, dist: 0 });
  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    gesture.current.moved = pointers.current.size > 1;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    const v = view.current;
    if (!prev || !v) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (gesture.current.dist > 0) zoomAt((a!.x + b!.x) / 2, (a!.y + b!.y) / 2, dist / gesture.current.dist);
      gesture.current.dist = dist;
      return;
    }
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    if (Math.abs(dx) + Math.abs(dy) > 0) {
      if (Math.abs(dx) + Math.abs(dy) > 2) {
        gesture.current.moved = true;
        following.current = false;
      }
      view.current = { ...v, x: v.x - dx / v.s, y: v.y - dy / v.s };
      redraw();
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const had = pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current.dist = 0;
    const v = view.current;
    if (!had || !v || gesture.current.moved || pointers.current.size) return;
    const p = local(e);
    const cx = Math.floor((v.x + p.x / v.s - left) / map.chunk);
    const cy = Math.floor((v.y + p.y / v.s - top) / map.chunk);
    if (cx >= 0 && cy >= 0 && cx < map.w && cy < map.h) onSelect(cx, cy);
  };
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
    };
    c.addEventListener('wheel', wheel, { passive: false });
    return () => c.removeEventListener('wheel', wheel);
  }, [zoomAt]);

  const button = 'grid h-9 w-9 place-items-center rounded-lg bg-black/70 text-ink hover:bg-black/90';
  return (
    <div ref={boxRef} className="relative h-full min-h-[320px] w-full overflow-hidden rounded-xl border border-line bg-[#07060a]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ width: size.w, height: size.h }}
        role="img"
        aria-label="World map: drag to move, scroll or pinch to zoom, tap an area for details"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
      />
      {layersKey && <LayersControl layers={layers} counts={counts} />}
      <div className="absolute right-2 bottom-2 flex flex-col gap-1">
        <button className={button} aria-label="Zoom in" onClick={() => zoomAt(size.w / 2, size.h / 2, 1.6)}>
          <Plus size={16} />
        </button>
        <button className={button} aria-label="Zoom out" onClick={() => zoomAt(size.w / 2, size.h / 2, 1 / 1.6)}>
          <Minus size={16} />
        </button>
        {marker && (
          <button className={button} aria-label="Centre on you" title="Centre on you" onClick={locate}>
            <LocateFixed size={16} />
          </button>
        )}
        <button className={button} aria-label="Whole map" title="Whole map" onClick={fitWorld}>
          <Maximize size={16} />
        </button>
      </div>
    </div>
  );
}
