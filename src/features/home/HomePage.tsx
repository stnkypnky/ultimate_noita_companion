import { Link } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight, Beaker, FlaskConical, RefreshCw, Sparkles, Wand2, type LucideIcon } from 'lucide-react';
import { useGameData } from '@/data/store';

const TILES: { to: string; title: string; text: string; icon: LucideIcon; accent: string }[] = [
  { to: '/wand', title: 'Wand Builder', text: 'Drag spells onto a wand and simulate every cast.', icon: Wand2, accent: 'var(--ember)' },
  { to: '/spells', title: 'Spells', text: 'Every spell, straight from the game files.', icon: Sparkles, accent: 'var(--arcane)' },
  { to: '/materials', title: 'Materials', text: 'Properties and reactions of every material.', icon: FlaskConical, accent: 'var(--toxic)' },
  { to: '/alchemy', title: 'Alchemy', text: 'Seed-based Lively Concoction & Alchemic Precursor.', icon: Beaker, accent: 'var(--gold)' },
];

export function HomePage() {
  const version = useGameData((s) => s.version);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-10 md:px-8 md:pt-10">
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-[22px] border border-line bg-surface p-6 md:p-10"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full opacity-60 blur-3xl"
          style={{ background: 'radial-gradient(circle, #ff7a1a66, transparent 70%)' }}
        />
        <div className="relative">
          <div className="font-display text-xs tracking-[0.35em] text-gold uppercase">Ultimate</div>
          <h1 className="font-display text-3xl font-bold md:text-5xl">Noita Companion</h1>
          <p className="mt-3 max-w-xl text-muted">
            Wands, spells, perks and alchemy — pulled straight from your game files, with spoilers kept hidden until
            you've found them yourself.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/wand"
              className="inline-flex items-center gap-2 rounded-xl bg-ember px-4 py-2.5 font-semibold text-bg shadow-[0_0_30px_#ff7a1a55] transition hover:brightness-110"
            >
              <Wand2 size={18} /> Build a wand
            </Link>
            <Link
              to="/progress"
              className="inline-flex items-center gap-2 rounded-xl border border-line-strong bg-surface-2 px-4 py-2.5 font-medium transition hover:bg-surface-3"
            >
              <RefreshCw size={17} /> Sync progress
            </Link>
          </div>
        </div>
      </motion.section>

      <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TILES.map(({ to, title, text, icon: Icon, accent }, i) => (
          <motion.div
            key={to}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 + i * 0.05, duration: 0.35 }}
          >
            <Link
              to={to}
              className="group flex h-full items-start gap-4 rounded-[var(--radius)] border border-line bg-surface p-5 transition hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface-2"
            >
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}
              >
                <Icon size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-semibold">
                  {title}
                  <ArrowRight size={15} className="text-faint transition group-hover:translate-x-0.5 group-hover:text-ink" />
                </span>
                <span className="mt-1 block text-sm text-muted">{text}</span>
              </span>
            </Link>
          </motion.div>
        ))}
      </section>

      <p className="mt-8 text-center text-xs text-faint">
        {version
          ? `Game data from build ${version.gameHash.slice(0, 8)} (${version.branch})`
          : 'Game data not extracted yet — run `npm run extract`.'}
      </p>
    </div>
  );
}
