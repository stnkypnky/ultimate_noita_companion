import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Bot, Gauge, Maximize2, Minimize2, Mountain, Pause, Play } from 'lucide-react';
import { fetchJson, useData } from '@/data/store';
import type { EntityVisual, RangeProp } from '@/data/types';
import { fmtNum } from '@/data/format';
import { LiveSession } from '@/sim/client';
import { toSimRequest, type SimOptions, type Wand } from '@/features/wand/model';
import { H, RangeWorld, W, type RangeData } from './world';
import { RangeRenderer, SCALE, loadRangeImages, type RangeImages } from './render';
import { WandRuntime } from './wand';

const SPEEDS = [0.25, 0.5, 1] as const;
const DEFAULT_DISTANCE = 228;
const MIN_DISTANCE = 40;
const MAX_DISTANCE = 340;

let extra: Promise<{ visuals: Record<string, EntityVisual>; props: Record<string, RangeProp> }> | null = null;
const loadExtra = () =>
  (extra ??= Promise.all([fetchJson<Record<string, EntityVisual>>('data/visuals.json'), fetchJson<Record<string, RangeProp>>('data/range_props.json')]).then(
    ([visuals, props]) => ({ visuals, props }),
  ));

const humanize = (s: string) => s.replace(/_/g, ' ');

const remembered = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not remembered without storage */
  }
};

/** Live pixel test range: hold the wand and cast it at a target dummy, with the wand's real mana and recharge. */
export function RangePreview({ wand, options, active }: { wand: Wand; options: SimOptions; active: boolean }) {
  const { projectiles, materials, materialById, spellById } = useData();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<RangeWorld | null>(null);
  const [session] = useState(() => new LiveSession());
  const [ready, setReady] = useState<{ data: RangeData; images: RangeImages } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [onScreen, setOnScreen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [auto, setAuto] = useState(() => remembered('range-auto', '0') === '1');
  const [hud, setHud] = useState({ dps: 0, total: 0, self: 0, casts: 0, live: 0, unsupported: [] as string[], wandError: null as string | null });
  const req = useMemo(() => toSimRequest(wand, options, spellById).req, [wand, options, spellById]);
  const empty = req.deck.length === 0 && req.alwaysCasts.length === 0;

  useEffect(() => () => session.dispose(), [session]);
  useEffect(() => {
    if (worldRef.current) worldRef.current.auto = auto;
    remember('range-auto', auto ? '1' : '0');
  }, [auto, ready]);
  const [distance, setDistance] = useState(() => Number(remembered('range-distance', '')) || DEFAULT_DISTANCE);
  useEffect(() => {
    worldRef.current?.setDummyDistance(distance);
    remember('range-distance', String(distance));
  }, [distance, ready]);

  // Load range data + sprites once.
  useEffect(() => {
    let live = true;
    loadExtra()
      .then(async ({ visuals, props }) => {
        const images = await loadRangeImages(props);
        if (!live) return;
        setReady({
          images,
          data: {
            projectiles,
            visuals,
            materialColor: new Map(materials.map((m) => [m.id, m.color])),
            rockDurability: materialById.get('rock_static')?.durability ?? 0,
          },
        });
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [projectiles, materials, materialById]);

  // A freshly built wand in hand whenever the wand changes.
  useEffect(() => {
    if (!ready) return;
    let w = worldRef.current;
    if (!w) {
      w = worldRef.current = new RangeWorld(ready.data);
      w.setDummyDistance(distance);
      w.auto = auto;
      const world = w;
      w.wand = new WandRuntime(session, (c) => world.fire(c));
    }
    w.clearShots();
    w.wand!.equip(req, w.frame);
  }, [ready, req, session]); // distance and auto have their own effects; a new world just starts at the current settings

  // Pause when scrolled away or the tab is hidden.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(!!e?.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const running = ready && active && playing && onScreen;

  // Fixed 60 Hz simulation, rendered every animation frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    const world = worldRef.current;
    if (!ready || !canvas || !world) return;
    const renderer = new RangeRenderer(canvas.getContext('2d')!, ready.images);
    renderer.draw(world);
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let hudTimer = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!document.hidden) {
        acc += dt * speed;
        let steps = 0;
        while (acc >= 1 / 60 && steps < 6) {
          world.step();
          acc -= 1 / 60;
          steps++;
        }
        renderer.draw(world);
        hudTimer += dt;
        if (hudTimer > 0.25) {
          hudTimer = 0;
          setHud({
            dps: world.dps,
            total: world.totalDamage,
            self: world.selfDamage,
            casts: world.castsFired,
            live: world.projectiles.length,
            unsupported: [...world.unsupported],
            wandError: world.wand?.error ?? null,
          });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready, running, speed]);

  // Aim with the pointer; press to cast once, hold to keep casting. Taking aim switches Auto off.
  const toWorld = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const w = worldRef.current;
    if (!w || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    setAuto(false);
    w.auto = false;
    w.aim = toWorld(e);
    w.setTrigger(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const w = worldRef.current;
    if (w && (e.pointerType === 'mouse' || w.trigger)) w.aim = toWorld(e);
  };
  const release = () => worldRef.current?.setTrigger(false);

  useEffect(() => {
    const h = () => setFullscreen(document.fullscreenElement === boxRef.current);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  // iPhone Safari has no element fullscreen; fall back to covering the viewport ourselves.
  const [expanded, setExpanded] = useState(false);
  const toggleFullscreen = () => {
    const el = boxRef.current;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (el?.requestFullscreen) void el.requestFullscreen().catch(() => setExpanded(true));
    else setExpanded(!expanded);
  };
  const big = fullscreen || expanded;

  return (
    <div
      ref={boxRef}
      className={`overflow-hidden bg-[#0b0910] ${
        expanded ? 'fixed inset-0 z-[90] flex flex-col justify-center' : fullscreen ? 'flex h-full flex-col justify-center' : 'rounded-[var(--radius)] border border-line'
      }`}
    >
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={W * SCALE}
          height={H * SCALE}
          className="pixelated block w-full cursor-crosshair touch-none select-none"
          style={{ aspectRatio: `${W} / ${H}` }}
          aria-label="Test range: aim and click or hold to cast the wand at a target dummy"
          role="img"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={release}
          onPointerCancel={release}
          onLostPointerCapture={release}
          onContextMenu={(e) => e.preventDefault()}
        />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted">{error ? `Couldn't load the range: ${error}` : 'Setting up the range…'}</div>
        )}
        {ready && empty && <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted">Add spells to see them fly.</div>}
        {ready && !empty && !auto && hud.casts === 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-muted">Click to cast · hold to keep casting</div>
        )}
        {hud.wandError && <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-blood">The wand misfired: {hud.wandError}</div>}
        <div className="pointer-events-none absolute top-2 left-2 flex gap-1.5 text-[11px] tabular-nums">
          <span className="rounded bg-black/60 px-1.5 py-0.5 text-ember">{fmtNum(hud.dps, 0)} DPS</span>
          <span className="rounded bg-black/60 px-1.5 py-0.5 text-muted">{fmtNum(hud.total, 0)} total</span>
          {hud.self > 0 && (
            <span className="rounded bg-black/60 px-1.5 py-0.5 text-blood" title="Damage your own spells did to you">
              {fmtNum(hud.self, 0)} to you
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-t border-line px-2 py-1.5 text-xs">
        <Btn label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(!playing)}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </Btn>
        <span className="ml-1 inline-flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5" role="group" aria-label="Speed">
          <Gauge size={13} className="mx-1 text-faint" />
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              aria-pressed={speed === s}
              className={`rounded-md px-1.5 py-0.5 tabular-nums ${speed === s ? 'bg-ember text-bg' : 'text-muted hover:text-ink'}`}
            >
              {s === 1 ? '1×' : s === 0.5 ? '½×' : '¼×'}
            </button>
          ))}
        </span>
        <button
          onClick={() => setAuto(!auto)}
          aria-pressed={auto}
          title="Auto-fire at the dummy"
          className={`ml-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 ${auto ? 'bg-ember text-bg' : 'bg-surface-2 text-muted hover:text-ink'}`}
        >
          <Bot size={14} /> Auto
        </button>
        <Btn label="Swap wand (restarts the deck, like switching items in-game)" onClick={() => worldRef.current?.wand?.swap()}>
          <ArrowLeftRight size={15} />
        </Btn>
        <Btn
          label="Rebuild terrain"
          onClick={() => {
            worldRef.current?.resetTerrain();
          }}
        >
          <Mountain size={15} />
        </Btn>
        <span className="ml-auto text-faint">{hud.live} in flight</span>
        <Btn label={big ? 'Exit full screen' : 'Full screen'} onClick={() => (expanded ? setExpanded(false) : toggleFullscreen())}>
          {big ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </Btn>
      </div>
      <label className="flex items-center gap-3 border-t border-line px-3 py-2 text-xs text-muted">
        <span className="shrink-0">Dummy distance</span>
        <input
          type="range"
          min={MIN_DISTANCE}
          max={MAX_DISTANCE}
          step={2}
          value={distance}
          onChange={(e) => setDistance(Number(e.target.value))}
          className="h-1.5 min-w-0 flex-1 accent-[var(--ember)]"
          aria-label="Dummy distance in pixels"
        />
        <span className="w-12 shrink-0 text-right tabular-nums">{distance} px</span>
      </label>
      {hud.unsupported.length > 0 && (
        <p className="border-t border-line px-3 py-1.5 text-[11px] text-faint">
          Not shown in the preview yet: {hud.unsupported.map(humanize).join(', ')}. The Casts tab numbers aren't affected.
        </p>
      )}
    </div>
  );
}

function Btn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink">
      {children}
    </button>
  );
}
