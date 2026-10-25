import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';

/** Full-screen launch splash: glowing orb, rising embers, title. */
export function Splash() {
  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-bg"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04, filter: 'blur(6px)' }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      aria-label="Loading"
      role="status"
    >
      <Embers />
      <div className="relative flex flex-col items-center gap-6">
        <motion.div
          className="h-24 w-24 rounded-full"
          style={{
            background: 'radial-gradient(circle at 35% 35%, #ffe2a0, #ff7a1a 45%, #5a1600 82%)',
          }}
          animate={{
            scale: [1, 1.08, 1],
            boxShadow: ['0 0 60px #ff7a1a88', '0 0 110px #ff7a1acc', '0 0 60px #ff7a1a88'],
          }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
        >
          <div className="font-display text-xs tracking-[0.35em] text-gold uppercase">Ultimate</div>
          <h1 className="font-display text-3xl font-bold tracking-wide text-ink">Noita Companion</h1>
          <p className="mt-3 text-sm text-muted">Reading the arcane files…</p>
        </motion.div>
      </div>
    </motion.div>
  );
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
