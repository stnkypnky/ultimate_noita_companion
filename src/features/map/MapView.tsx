import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { gameUrl } from '@/data/store';
import type { Material, WorldMap } from '@/data/types';
import { biomeName, chunkWorld, namedInGame, type makeVisibility } from './world';

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

/** Connected areas of each named biome, for labels: [biome index, centre x, centre y, chunks]. */
function labelSpots(map: WorldMap) {
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
    if (namedInGame(map.biomes[k]!) && n >= 2) out.push([k, sx / n + 0.5, sy / n + 0.5, n]);
  }
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

/** The world map: biomes in their own rock, the game's fixed rooms on top. Drag to pan, wheel or pinch to zoom. */
export function MapView({
  map,
  vis,
  materialById,
  selected,
  onSelect,
}: {
  map: WorldMap;
  vis: Vis;
  materialById: Map<string, Material>;
  selected: { cx: number; cy: number } | null;
  onSelect: (cx: number, cy: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const view = useRef<View | null>(null);
  const [tick, setTick] = useState(0);
  const redraw = useCallback(() => setTick((t) => t + 1), []);
  const spots = useMemo(() => labelSpots(map), [map]);
  const worldW = map.w * map.chunk;
  const worldH = map.h * map.chunk;
  const left = -(map.w / 2) * map.chunk;
  const top = -map.offsetY * map.chunk;

  const fit = useCallback(() => {
    if (!size.w) return;
    const s = Math.min(size.w / worldW, size.h / worldH);
    view.current = { s, x: left - (size.w / s - worldW) / 2, y: top - (size.h / s - worldH) / 2 };
    redraw();
  }, [size, worldW, worldH, left, top, redraw]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e!.contentRect.width), h: Math.round(e!.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!view.current) fit();
  }, [fit]);

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
      const color = m ? m.color.slice(0, 7) : '#5a5048';
      let fill: CanvasPattern | string = color;
      if (m?.texture) {
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
        // Rooms with no rock of their own (Holy Mountains, secret rooms) underground: just their backdrop.
        const roomOnly = !b.material && b.background && cy >= map.offsetY;
        const cave = (b.wang || roomOnly) && b.background ? backdropFor(b.background) : null;
        ctx.fillStyle = roomOnly ? '#0b0910' : fillFor(b.material);
        ctx.fillRect(rx, ry, rs, rs);
        if (cave) {
          ctx.globalAlpha = roomOnly ? 1 : 0.72;
          ctx.fillStyle = cave;
          ctx.fillRect(rx, ry, rs, rs);
          ctx.globalAlpha = 1;
        }
      }
    }
    // Shade the plain rock and sky so the areas stand out.
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const b = map.biomes[map.cells[cy * map.w + cx]!]!;
        if (!vis.biome(b) || namedInGame(b) || !b.material) continue;
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
      for (const key of [sc.background, sc.image]) {
        if (!key) continue;
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
        if (cx + 1 < map.w && map.cells[cy * map.w + cx + 1] !== k) {
          ctx.moveTo(Math.round(sx + cs) + 0.5, sy);
          ctx.lineTo(Math.round(sx + cs) + 0.5, sy + cs);
        }
        if (cy + 1 < map.h && map.cells[(cy + 1) * map.w + cx] !== k) {
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
    // Names of the areas you can see.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${cs > 40 ? 15 : 12}px ui-sans-serif, system-ui`;
    // Biggest areas first; a label that would overlap one already drawn is left out.
    const taken: [number, number, number, number][] = [];
    for (const [k, mx, my] of spots) {
      const b = map.biomes[k]!;
      if (!vis.biome(b)) continue;
      const [sx, sy] = toScreen(left + mx * map.chunk, top + my * map.chunk);
      if (sx < -80 || sy < -20 || sx > size.w + 80 || sy > size.h + 20) continue;
      const label = biomeName(b);
      const half = ctx.measureText(label).width / 2 + 3;
      const box: [number, number, number, number] = [sx - half, sy - 9, sx + half, sy + 9];
      if (taken.some((t) => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1])) continue;
      taken.push(box);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(label, sx, sy);
      ctx.fillStyle = '#f2e6c9';
      ctx.fillText(label, sx, sy);
    }
    if (selected) {
      const w = chunkWorld(map, selected.cx, selected.cy);
      const [sx, sy] = toScreen(w.x, w.y);
      ctx.strokeStyle = '#ffd36b';
      ctx.lineWidth = 2;
      ctx.strokeRect(Math.round(sx) + 1, Math.round(sy) + 1, Math.max(4, cs - 2), Math.max(4, cs - 2));
    }
  }, [tick, size, map, vis, materialById, selected, spots, left, top, redraw]);

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
      if (Math.abs(dx) + Math.abs(dy) > 2) gesture.current.moved = true;
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
      <div className="absolute right-2 bottom-2 flex flex-col gap-1">
        <button className={button} aria-label="Zoom in" onClick={() => zoomAt(size.w / 2, size.h / 2, 1.6)}>
          <Plus size={16} />
        </button>
        <button className={button} aria-label="Zoom out" onClick={() => zoomAt(size.w / 2, size.h / 2, 1 / 1.6)}>
          <Minus size={16} />
        </button>
        <button className={button} aria-label="Whole map" onClick={fit}>
          <Maximize size={16} />
        </button>
      </div>
    </div>
  );
}
