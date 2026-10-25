import { useEffect, useRef, useState } from 'react';
import { Gauge, Maximize2, Minimize2, Mountain, Pause, Play } from 'lucide-react';
import { fetchJson, useData } from '@/data/store';
import type { EntityVisual, RangeProp } from '@/data/types';
import { fmtNum } from '@/data/format';
import type { SimCast } from '@/sim/types';
import { H, RangeWorld, W, type RangeData } from './world';
import { RangeRenderer, SCALE, loadRangeImages, type RangeImages } from './render';

const SPEEDS = [0.25, 0.5, 1] as const;

let extra: Promise<{ visuals: Record<string, EntityVisual>; props: Record<string, RangeProp> }> | null = null;
const loadExtra = () =>
  (extra ??= Promise.all([fetchJson<Record<string, EntityVisual>>('data/visuals.json'), fetchJson<Record<string, RangeProp>>('data/range_props.json')]).then(
    ([visuals, props]) => ({ visuals, props }),
  ));

const humanize = (s: string) => s.replace(/_/g, ' ');

/** Live pixel test range: the wand fires its simulated cast cycle on loop at a target dummy. */
export function RangePreview({ casts, active }: { casts: SimCast[]; active: boolean }) {
  const { projectiles, materials, materialById } = useData();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<RangeWorld | null>(null);
  const [ready, setReady] = useState<{ data: RangeData; images: RangeImages } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [onScreen, setOnScreen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [hud, setHud] = useState({ dps: 0, total: 0, casts: 0, live: 0, unsupported: [] as string[] });

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

  // New cast cycle whenever the wand changes.
  useEffect(() => {
    if (!ready) return;
    worldRef.current ??= new RangeWorld(ready.data);
    worldRef.current.setCycle(casts);
  }, [ready, casts]);

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
          setHud({ dps: world.dps, total: world.totalDamage, casts: world.castsFired, live: world.projectiles.length, unsupported: [...world.unsupported] });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready, running, speed, casts]);

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
          className="pixelated block w-full"
          style={{ aspectRatio: `${W} / ${H}` }}
          aria-label="Test range: the wand firing at a target dummy"
          role="img"
        />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center text-sm text-muted">{error ? `Couldn't load the range: ${error}` : 'Setting up the range…'}</div>
        )}
        {ready && casts.length === 0 && <div className="absolute inset-0 grid place-items-center text-sm text-muted">Add spells to see them fly.</div>}
        <div className="pointer-events-none absolute top-2 left-2 flex gap-1.5 text-[11px] tabular-nums">
          <span className="rounded bg-black/60 px-1.5 py-0.5 text-ember">{fmtNum(hud.dps, 0)} DPS</span>
          <span className="rounded bg-black/60 px-1.5 py-0.5 text-muted">{fmtNum(hud.total, 0)} total</span>
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
