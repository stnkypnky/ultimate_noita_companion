import { useEffect, useRef, type RefObject } from 'react';
import { motion } from 'motion/react';
import { useGameData } from '@/data/store';

const TITLE = 'Noita Companion';
const BASE = import.meta.env.BASE_URL;

// Layout shared with the static boot screen in index.html; keep the two in sync.
/** CSS px per game pixel. */
const pixelSize = () => (innerWidth >= 768 ? 4 : 3);
/** Where the wand is held, in CSS px. */
const wandGrip = () => ({ x: innerWidth / 2 - Math.min(150, innerWidth * 0.28), y: innerHeight / 2 + 130 });
const BOOT_ANGLE = (-40 * Math.PI) / 180;
/** Grip point and muzzle distance within the 18×9 wand sprite. */
const GRIP = { x: 2, y: 4.5 };
const MUZZLE = 15;

/** Full-screen launch splash: the app's wand fires spark bolts that light up the title, while a mana bar tracks loading. */
export function Splash() {
  const progress = useGameData((s) => s.progress);
  const letters = useRef<(HTMLSpanElement | null)[]>([]);
  const kicker = useRef<HTMLDivElement>(null);

  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-hidden bg-bg"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04, filter: 'blur(6px)' }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      aria-label="Loading"
      role="status"
    >
      <Embers />
      <CastScene letters={letters} kicker={kicker} />
      <div className="relative grid h-full place-items-center">
        <div className="text-center">
          <div ref={kicker} className="splash-kicker font-display text-xs tracking-[0.35em] text-gold uppercase">
            Ultimate
          </div>
          <h1 aria-label={TITLE} className="font-display text-3xl font-bold tracking-wide text-ink sm:text-4xl">
            {[...TITLE].map((ch, i) => (
              <span
                key={i}
                ref={(el) => {
                  letters.current[i] = el;
                }}
                aria-hidden
                className="splash-letter"
              >
                {ch === ' ' ? ' ' : ch}
              </span>
            ))}
          </h1>
          <ManaBar progress={progress} />
          <p className="mt-2 text-xs text-muted">Reading the arcane files…</p>
        </div>
      </div>
    </motion.div>
  );
}

function ManaBar({ progress }: { progress: number }) {
  return (
    <div
      className="mx-auto mt-6 flex w-48 items-center gap-2"
      role="progressbar"
      aria-label="Loading game data"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <img src={`${BASE}icons/hud-mana.png`} alt="" className="pixelated h-4 w-4" />
      <div className="splash-mana h-2 flex-1">
        <motion.div initial={{ width: 0 }} animate={{ width: `${progress * 100}%` }} transition={{ duration: 0.35, ease: 'easeOut' }} />
      </div>
    </div>
  );
}

type Letters = RefObject<(HTMLSpanElement | null)[]>;

/** Pixel-scale canvas: the wand aims at a title letter, fires a spark bolt, and the impact lights the letters around it. */
function CastScene({ letters, kicker }: { letters: Letters; kicker: RefObject<HTMLDivElement | null> }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const spans = () => letters.current.filter((l): l is HTMLSpanElement => !!l && l.textContent !== ' ');
    const lightAll = () => {
      spans().forEach((l) => l.setAttribute('data-lit', ''));
      kicker.current?.setAttribute('data-lit', '');
    };
    // The title must never stay dark, whatever happens to the animation.
    const fallback = setTimeout(lightAll, 1800);

    let P = pixelSize();
    const resize = () => {
      P = pixelSize();
      canvas.width = Math.ceil(innerWidth / P);
      canvas.height = Math.ceil(innerHeight / P);
      ctx.imageSmoothingEnabled = false;
    };
    resize();
    addEventListener('resize', resize);
    const wand = new Image();
    wand.src = `${BASE}icons/wand.png`;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) lightAll();

    type Bolt = { x: number; y: number; vx: number; vy: number; age: number; ttl: number };
    type Spark = { x: number; y: number; vx: number; vy: number; age: number; ttl: number; color: string; g: number };
    const bolts: Bolt[] = [];
    const sparks: Spark[] = [];
    const flashes: { x: number; y: number; age: number }[] = [];
    const hit = new Map<HTMLSpanElement, number>();
    let angle = BOOT_ANGLE;
    let aim = BOOT_ANGLE;
    let target: { x: number; y: number } | null = null;
    let recoil = 0;
    let muzzleFlash = 0;
    let nextAim = 100;
    let nextCast = Infinity;
    const t0 = performance.now();
    let last = t0;
    let raf = 0;

    const centre = (l: HTMLSpanElement) => {
      const r = l.getBoundingClientRect();
      return { x: (r.left + r.width / 2) / P, y: (r.top + r.height * 0.55) / P };
    };
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;
    const burst = (x: number, y: number, n: number, colors: string[], speed: [number, number], ttl: [number, number], g: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = rand(...speed);
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, ttl: rand(...ttl), color: pick(colors), g });
      }
    };

    const impact = (x: number, y: number) => {
      burst(x, y, 18, ['#ffffff', '#bdf3ff', '#6fd6ff', '#6fd6ff', '#ffd27a'], [20, 75], [0.3, 0.8], 60);
      flashes.push({ x, y, age: 0 });
      const all = spans();
      for (const l of all) {
        const c = centre(l);
        const d = Math.hypot(c.x - x, c.y - y) * P;
        if (d > 52) continue;
        l.setAttribute('data-lit', '');
        hit.set(l, Math.max(hit.get(l) ?? 0, 1 - d / 70));
      }
      if (all.every((l) => l.hasAttribute('data-lit'))) {
        kicker.current?.setAttribute('data-lit', '');
        clearTimeout(fallback);
      }
    };

    const frame = (now: number) => {
      const t = now - t0;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const g = wandGrip();
      const gx = g.x / P;
      const gy = g.y / P;

      // aim at a dark letter (or any letter once all are lit), then fire
      if (t >= nextAim) {
        const all = spans();
        const dark = all.filter((l) => !l.hasAttribute('data-lit'));
        const l = (dark.length ? dark : all).length ? pick(dark.length ? dark : all) : null;
        if (l) {
          target = centre(l);
          aim = Math.atan2(target.y - gy, target.x - gx);
          nextCast = t + 80;
        }
        nextAim = Infinity;
      }
      angle += (aim - angle) * Math.min(1, dt * 16);
      const dir = { x: Math.cos(angle), y: Math.sin(angle) };
      const mx = gx - dir.x * recoil + dir.x * MUZZLE;
      const my = gy - dir.y * recoil + dir.y * MUZZLE;
      if (t >= nextCast && target) {
        const a = Math.atan2(target.y - my, target.x - mx) + rand(-0.03, 0.03);
        const dist = Math.hypot(target.x - mx, target.y - my);
        const speed = 300;
        bolts.push({ x: mx, y: my, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, age: 0, ttl: dist / speed });
        burst(mx, my, 5, ['#ffffff', '#bdf3ff'], [10, 30], [0.08, 0.2], 0);
        recoil = 2;
        muzzleFlash = 1;
        nextCast = Infinity;
        const lit = spans().every((l) => l.hasAttribute('data-lit'));
        nextAim = t + (lit ? rand(260, 520) : 60);
      }
      recoil = Math.max(0, recoil - dt * 14);
      muzzleFlash = Math.max(0, muzzleFlash - dt * 8);

      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i]!;
        b.age += dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        sparks.push({ x: b.x, y: b.y, vx: rand(-6, 6), vy: rand(-6, 6), age: 0, ttl: rand(0.15, 0.35), color: pick(['#6fd6ff', '#3f8fd8', '#bdf3ff']), g: 0 });
        if (b.age >= b.ttl) {
          bolts.splice(i, 1);
          impact(b.x, b.y);
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]!;
        s.age += dt;
        s.vy += s.g * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.age >= s.ttl) sparks.splice(i, 1);
      }
      for (let i = flashes.length - 1; i >= 0; i--) if ((flashes[i]!.age += dt) > 0.3) flashes.splice(i, 1);
      for (const [l, v] of hit) {
        const nv = v * Math.exp(-dt * 5);
        if (nv < 0.01) {
          hit.delete(l);
          l.style.removeProperty('--hit');
        } else {
          hit.set(l, nv);
          l.style.setProperty('--hit', nv.toFixed(2));
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'lighter';
      for (const f of flashes) glow(ctx, f.x, f.y, 10 + f.age * 40, '#6fd6ff', 1 - f.age / 0.3);
      glow(ctx, mx, my, 8 + muzzleFlash * 10, '#6fd6ff', 0.35 + muzzleFlash * 0.6);
      for (const s of sparks) {
        ctx.globalAlpha = 1 - s.age / s.ttl;
        ctx.fillStyle = s.color;
        ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
      }
      ctx.globalAlpha = 1;
      for (const b of bolts) {
        glow(ctx, b.x, b.y, 7, '#6fd6ff', 0.7);
        const len = Math.hypot(b.vx, b.vy);
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = k === 0 ? '#ffffff' : '#bdf3ff';
          ctx.fillRect(Math.round(b.x - (b.vx / len) * k), Math.round(b.y - (b.vy / len) * k), 1, 1);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      if (wand.complete && wand.naturalWidth) {
        ctx.save();
        ctx.translate(gx - dir.x * recoil, gy - dir.y * recoil);
        ctx.rotate(angle);
        ctx.drawImage(wand, -GRIP.x, -GRIP.y);
        ctx.restore();
      }
      if (!reduced) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fallback);
      removeEventListener('resize', resize);
    };
  }, [letters, kicker]);

  return <canvas ref={ref} className="pixelated pointer-events-none absolute inset-0 h-full w-full" />;
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  if (alpha <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'transparent');
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

function Embers() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
    };
    resize();
    addEventListener('resize', resize);

    type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number };
    const parts: P[] = [];
    const spawn = (): P => ({
      x: Math.random() * canvas.width,
      y: canvas.height + 10,
      vx: (Math.random() - 0.5) * 0.4 * dpr,
      vy: -(0.6 + Math.random() * 1.4) * dpr,
      life: 0,
      max: 160 + Math.random() * 220,
      size: (1 + Math.floor(Math.random() * 3)) * dpr,
    });
    for (let i = 0; i < 70; i++) {
      const p = spawn();
      p.y = Math.random() * canvas.height;
      p.life = Math.random() * p.max;
      parts.push(p);
    }

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of parts) {
        p.life++;
        p.x += p.vx + Math.sin((p.life + p.y) * 0.02) * 0.25 * dpr;
        p.y += p.vy;
        if (p.life > p.max || p.y < -10) Object.assign(p, spawn());
        const t = p.life / p.max;
        const a = Math.sin(Math.PI * t);
        // Square "pixel" embers, cooling from yellow to red.
        ctx.fillStyle = t < 0.4 ? `rgba(255,210,122,${a})` : `rgba(255,${Math.round(122 - t * 80)},26,${a})`;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full opacity-80" />;
}
