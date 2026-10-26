import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowBigUp, ArrowLeftRight, Bot, ChevronLeft, ChevronRight, Dices, Gauge, Maximize2, Minimize2, Mountain, Pause, Play } from 'lucide-react';
import { fetchJson, useData } from '@/data/store';
import type { EntityVisual, RangeKit, RangeProp } from '@/data/types';
import { fmtNum } from '@/data/format';
import { LiveSession } from '@/sim/client';
import type { LiveCast } from '@/sim/types';
import { SpellIcon } from '@/ui/GameIcon';
import { toSimRequest, type SimOptions, type Wand } from '@/features/wand/model';
import { H, RangeWorld, W, type RangeData } from './world';
import { RangeRenderer, SCALE, loadRangeImages, type RangeImages } from './render';
import { pickWandSprite, type Controls } from './player';
import { WandRuntime } from './wand';
import { rangeSettings } from './settings';

const SPEEDS = [0.25, 0.5, 1] as const;
const DEFAULT_DISTANCE = 228;
const MIN_DISTANCE = 40;
const MAX_DISTANCE = 340;

type Extra = { visuals: Record<string, EntityVisual>; props: Record<string, RangeProp>; kit: RangeKit };
let extra: Promise<Extra> | null = null;
const loadExtra = () =>
  (extra ??= Promise.all([
    fetchJson<Record<string, EntityVisual>>('data/visuals.json'),
    fetchJson<Record<string, RangeProp>>('data/range_props.json'),
    fetchJson<RangeKit>('data/range_kit.json'),
  ]).then(([visuals, props, kit]) => ({ visuals, props, kit })));

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

/** Keys that walk, levitate and work the range, as in the game (WASD) plus arrows. */
const MOVE_KEYS: Record<string, keyof Controls> = { a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', w: 'up', arrowup: 'up', ' ': 'up' };

type Hud = {
  dps: number;
  total: number;
  self: number;
  casts: number;
  live: number;
  unsupported: string[];
  wandError: string | null;
  deck: LiveCast['deck'] | null;
  /** Deck cards (1-based) the last cast played. */
  played: number[];
};

/** Live pixel test range: hold the wand and cast it at a target dummy, with the wand's real mana and recharge. */
export function RangePreview({ wand, options, active }: { wand: Wand; options: SimOptions; active: boolean }) {
  const { projectiles, materials, materialById, reactions, spellById } = useData();
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
  const [look, setLook] = useState(0);
  // Performance mode and the frame-rate readout come from the Settings page.
  const [settings] = useState(rangeSettings);
  const [hud, setHud] = useState<Hud>({ dps: 0, total: 0, self: 0, casts: 0, live: 0, unsupported: [], wandError: null, deck: null, played: [] });
  const [fps, setFps] = useState<{ fps: number; step: number; draw: number } | null>(null);
  const req = useMemo(() => toSimRequest(wand, options, spellById).req, [wand, options, spellById]);
  const empty = req.deck.length === 0 && req.alwaysCasts.length === 0;
  const wandSprite = useMemo(() => (ready?.data.kit ? pickWandSprite(ready.data.kit.wands, wand, look) : undefined), [ready, wand, look]);
  const touch = useMemo(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches, []);

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
  useEffect(() => {
    if (worldRef.current) worldRef.current.wandSprite = wandSprite;
  }, [wandSprite, ready]);

  // Load range data + sprites once.
  useEffect(() => {
    let live = true;
    loadExtra()
      .then(async ({ visuals, props, kit }) => {
        const images = await loadRangeImages(props);
        if (!live) return;
        setReady({
          images,
          data: {
            projectiles,
            visuals,
            materialColor: new Map(materials.map((m) => [m.id, m.color])),
            rockDurability: materialById.get('rock_static')?.durability ?? 0,
            kit,
            materials,
            reactions,
          },
        });
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [projectiles, materials, materialById, reactions]);

  // A freshly built wand in hand whenever the wand changes.
  useEffect(() => {
    if (!ready) return;
    let w = worldRef.current;
    if (!w) {
      w = worldRef.current = new RangeWorld(ready.data);
      w.setDummyDistance(distance);
      w.auto = auto;
      w.wandSprite = wandSprite;
      const world = w;
      w.wand = new WandRuntime(session, (c) => world.fire(c));
    }
    w.clearShots();
    w.wand!.equip(req, w.frame);
  }, [ready, req, session]); // distance, auto and the sprite have their own effects; a new world just starts at the current settings

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
    // Opaque (every frame paints the whole scene), so the browser needn't blend it with the page behind.
    const renderer = new RangeRenderer(canvas.getContext('2d', { alpha: false })!, ready.images);
    // Performance mode: no glow, a quarter of the particles, and the picture redrawn about 30 times a second.
    renderer.lite = settings.performance;
    world.particleBudget = settings.performance ? 1500 : 6000;
    renderer.draw(world);
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    let lastDraw = 0;
    let acc = 0;
    let hudTimer = 0;
    // Frame-rate readout (Settings → Show frame rate): pictures drawn, and time spent simulating and drawing.
    let drawn = 0;
    let stepMs = 0;
    let stepCount = 0;
    let drawMs = 0;
    // Timing probe for performance checks: on when localStorage has range-perf=1 (read by scratch perf scripts).
    const probe =
      remembered('range-perf', '0') === '1'
        ? ((window as unknown as { __rangePerf?: { step: number[]; draw: number[]; frame: number[] } }).__rangePerf ??= { step: [], draw: [], frame: [] })
        : null;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!document.hidden) {
        acc += dt * speed;
        let steps = 0;
        const t0 = performance.now();
        // Catch up at most 3 steps; a device that can't keep up runs a little slow rather than spiralling into
        // ever longer frames.
        while (acc >= 1 / 60 && steps < 3) {
          world.step();
          acc -= 1 / 60;
          steps++;
        }
        if (acc > 1 / 60) acc = 0;
        const t1 = performance.now();
        stepMs += t1 - t0;
        stepCount += steps;
        if (!settings.performance || now - lastDraw >= 1000 / 30 - 2) {
          lastDraw = now;
          renderer.draw(world);
          drawn++;
          drawMs += performance.now() - t1;
        }
        if (probe) {
          probe.step.push(steps ? (t1 - t0) / steps : 0);
          probe.draw.push(performance.now() - t1);
          probe.frame.push(dt * 1000);
        }
        hudTimer += dt;
        if (hudTimer > 0.25) {
          if (settings.showFps) setFps({ fps: drawn / hudTimer, step: stepCount ? stepMs / stepCount : 0, draw: drawn ? drawMs / drawn : 0 });
          drawn = stepCount = 0;
          stepMs = drawMs = 0;
          hudTimer = 0;
          const rt = world.wand;
          setHud({
            dps: world.dps,
            total: world.totalDamage,
            self: world.selfDamage,
            casts: world.castsFired,
            live: world.projectiles.length,
            unsupported: [...world.unsupported],
            wandError: rt?.error ?? null,
            deck: rt?.deck ?? null,
            played: rt?.lastCast?.slots.filter((s) => s > 0) ?? [],
          });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // The background embers rest while the range runs (one animation at a time on slow devices).
    document.documentElement.dataset.rangeRunning = '1';
    return () => {
      cancelAnimationFrame(raf);
      delete document.documentElement.dataset.rangeRunning;
    };
  }, [ready, running, speed, settings]);

  // Keyboard: active while the pointer is over the range or it has focus, so the builder's own keys keep working.
  const engaged = useRef(false);
  useEffect(() => {
    const control = (e: KeyboardEvent, down: boolean) => {
      const w = worldRef.current;
      if (!w) return;
      const k = e.key.toLowerCase();
      const move = MOVE_KEYS[k];
      if (!down) {
        if (move) w.controls[move] = false;
        return;
      }
      if (!engaged.current || (e.target as HTMLElement).tagName === 'INPUT' || e.ctrlKey || e.metaKey) return;
      if (move) w.controls[move] = true;
      else if (k === '1') w.wand?.swap();
      else if (k === 'f') setAuto((a) => !a);
      else if (k === 'p') setPlaying((p) => !p);
      else return;
      e.preventDefault();
    };
    const down = (e: KeyboardEvent) => control(e, true);
    const up = (e: KeyboardEvent) => control(e, false);
    const blur = () => {
      const w = worldRef.current;
      if (w) w.controls = { left: false, right: false, up: false };
    };
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    addEventListener('blur', blur);
    return () => {
      removeEventListener('keydown', down);
      removeEventListener('keyup', up);
      removeEventListener('blur', blur);
    };
  }, []);

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
    if (!w) return;
    if (e.pointerType === 'mouse' || w.trigger) w.aim = toWorld(e);
    w.showCursor = e.pointerType === 'mouse';
  };
  const release = () => worldRef.current?.setTrigger(false);

  /** Hold-to-move buttons for touch screens. */
  const hold = (key: keyof Controls) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      if (worldRef.current) worldRef.current.controls[key] = true;
    },
    onPointerUp: () => worldRef.current && (worldRef.current.controls[key] = false),
    onPointerCancel: () => worldRef.current && (worldRef.current.controls[key] = false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

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
      tabIndex={-1}
      onPointerEnter={() => (engaged.current = true)}
      onPointerLeave={() => {
        engaged.current = false;
        if (worldRef.current) worldRef.current.showCursor = false;
      }}
      onFocus={() => (engaged.current = true)}
      className={`overflow-hidden outline-none ${
        expanded ? 'fixed inset-0 z-[90] flex flex-col justify-center bg-[#0b0910]' : fullscreen ? 'flex h-full flex-col justify-center bg-[#0b0910]' : 'panel p-0.5'
      }`}
    >
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={W * SCALE}
          height={H * SCALE}
          className="pixelated block w-full cursor-none touch-none select-none"
          style={{ aspectRatio: `${W} / ${H}` }}
          aria-label="Test range: aim and click or hold to cast; A/D walk, W or Space levitates"
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
          <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-muted">
            {touch ? 'Touch to aim and cast · buttons to move' : 'Click to cast · hold to keep casting · A/D walk · W or Space levitates'}
          </div>
        )}
        {hud.wandError && <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-blood">The wand misfired: {hud.wandError}</div>}
        <div className="pointer-events-none absolute top-2 left-2 flex gap-1.5 text-[11px] tabular-nums">
          <span className="rounded bg-black/60 px-1.5 py-0.5 text-ember">{fmtNum(hud.dps, 0)} DPS</span>
          <span className="rounded bg-black/60 px-1.5 py-0.5 text-muted">{fmtNum(hud.total, 0)} total</span>
          {fps && (
            <span className="rounded bg-black/60 px-1.5 py-0.5 text-gold" title="Pictures drawn per second · time per game step · time per picture">
              {fmtNum(fps.fps, 0)} fps · {fmtNum(fps.step, 1)} / {fmtNum(fps.draw, 1)} ms
            </span>
          )}
          {hud.self > 0 && (
            <span className="rounded bg-black/60 px-1.5 py-0.5 text-blood" title="Damage your own spells did to you">
              {fmtNum(hud.self, 0)} to you
            </span>
          )}
        </div>
      </div>

      {touch && ready && (
        // Under the scene rather than over it, so thumbs never hide the player.
        <div className="flex items-center gap-2 border-t border-line px-2 py-1.5">
          {(
            [
              ['left', <ChevronLeft key="l" size={22} />, 'Walk left'],
              ['right', <ChevronRight key="r" size={22} />, 'Walk right'],
              ['up', <ArrowBigUp key="u" size={22} />, 'Levitate'],
            ] as const
          ).map(([key, icon, label]) => (
            <button
              key={key}
              aria-label={label}
              {...hold(key)}
              className={`slot grid h-11 w-14 touch-none place-items-center text-ink select-none active:text-ember ${key === 'up' ? 'ml-auto' : ''}`}
            >
              {icon}
            </button>
          ))}
        </div>
      )}

      {!empty && <DeckStrip deck={req.deck} hud={hud} spellById={spellById} />}

      <div className="flex flex-wrap items-center gap-1 border-t border-line px-2 py-1.5 text-xs">
        <Btn label={playing ? 'Pause (P)' : 'Play (P)'} onClick={() => setPlaying(!playing)}>
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
          title="Auto-fire at the dummy (F)"
          className={`slot slot-hover font-game ml-1 inline-flex items-center gap-1 px-2 py-0.5 text-[16px] ${auto ? 'text-ember' : 'text-muted hover:text-ink'}`}
        >
          <Bot size={14} /> Auto
        </button>
        <Btn label="Swap wand (1): restarts the deck, like switching items in-game" onClick={() => worldRef.current?.wand?.swap()}>
          <ArrowLeftRight size={15} />
        </Btn>
        <Btn label="Another wand sprite for these stats" onClick={() => setLook(look + 1)}>
          <Dices size={15} />
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

/** The wand's spells in deck order, as the live wand sees them: next up, just cast, already drawn, out of charges. */
function DeckStrip({ deck, hud, spellById }: { deck: { id: string; uses: number }[]; hud: Hud; spellById: ReturnType<typeof useData>['spellById'] }) {
  const d = hud.deck;
  const next = d ? d.deck[0] : 1;
  const left = new Map(d?.uses.map((u) => [u.inv, u.uses]));
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-t border-line px-2 py-1.5" aria-label="Deck">
      {deck.map((card, i) => {
        const inv = i + 1;
        const spell = spellById.get(card.id);
        if (!spell) return null;
        const uses = left.get(inv) ?? card.uses;
        const spent = uses === 0;
        const drawn = d ? d.discarded.includes(inv) : false;
        const cast = hud.played.includes(inv);
        return (
          <span
            key={inv}
            title={`${spell.name}${uses >= 0 ? ` · ${uses} charges` : ''}${inv === next ? ' · next' : ''}`}
            className={`relative shrink-0 rounded-md p-0.5 ${inv === next && !spent ? 'ring-2 ring-gold' : cast ? 'ring-2 ring-ember' : ''} ${drawn || spent ? 'opacity-40' : ''} ${spent ? 'grayscale' : ''}`}
          >
            <SpellIcon type={spell.type} icon={spell.icon} scale={1} />
            {uses >= 0 && <span className="absolute right-0 bottom-0 rounded bg-black/70 px-0.5 text-[9px] leading-tight tabular-nums">{uses}</span>}
          </span>
        );
      })}
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
