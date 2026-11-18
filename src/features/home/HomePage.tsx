import { Link } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight, Beaker, FlaskConical, Gem, Lock, Map as MapIcon, Package, RefreshCw, Settings, Skull, Sparkles, Wand2, type LucideIcon } from 'lucide-react';
import { useGameData } from '@/data/store';
import { useHasSave, useProgress, useProgressHydrated } from '@/store/progress';
import { SyncSave } from '@/features/progress/SyncSave';
import { CurrentRun } from '@/features/live/CurrentRun';
import { HudBar, Runes } from '@/ui/game';
import { DiscoveryBar } from '@/features/progress/DiscoveryBar';

// Every section of the app (Home is also the phone's menu). `open`: usable before a save is synced.
const TILES: { to: string; title: string; text: string; icon: LucideIcon; accent: string; open?: boolean }[] = [
  { to: '/wand', title: 'Wand Builder', text: 'Drag spells onto a wand and simulate every cast.', icon: Wand2, accent: 'var(--ember)' },
  { to: '/spells', title: 'Spells', text: 'Every spell, straight from the game files.', icon: Sparkles, accent: 'var(--arcane)' },
  { to: '/materials', title: 'Materials', text: 'Properties and reactions of every material.', icon: FlaskConical, accent: 'var(--toxic)' },
  { to: '/alchemy', title: 'Alchemy', text: 'Seed-based Lively Concoction & Alchemic Precursor.', icon: Beaker, accent: 'var(--gold)' },
  { to: '/perks', title: 'Perks', text: 'What every perk really does, and how they stack.', icon: Gem, accent: 'var(--gold)' },
  { to: '/items', title: 'Items', text: 'Chests, eggs, stones and every other world pickup.', icon: Package, accent: 'var(--ember)' },
  { to: '/bestiary', title: 'Bestiary', text: 'Every creature: health, attacks, drops and weaknesses.', icon: Skull, accent: 'var(--blood)' },
  { to: '/map', title: 'World Map', text: 'The whole world, with biomes, places and your seed.', icon: MapIcon, accent: 'var(--frost)' },
  { to: '/progress', title: 'Progress Sync', text: 'Read your save so the companion knows what you’ve found.', icon: RefreshCw, accent: 'var(--mana)', open: true },
  { to: '/settings', title: 'Settings', text: 'Spoiler mode, performance and app data.', icon: Settings, accent: 'var(--text-muted)', open: true },
];

/** Discovery progress at a glance, or a nudge to sync. */
function ProgressCard() {
  const progress = useProgress((s) => s.progress);
  const data = useGameData((s) => s.data);
  if (!data) return null;
  // Without a save, the hero above asks for one.
  if (!progress) return null;
  const flags = new Set(progress.flags);
  const rows = [
    { label: 'Spells', n: data.spells.filter((s) => flags.has(s.discoverFlag)).length, of: data.spells.length, color: 'var(--arcane)' },
    { label: 'Perks', n: data.perks.filter((p) => flags.has(p.discoverFlag)).length, of: data.perks.length, color: 'var(--gold)' },
    { label: 'Creatures', n: progress.enemies.filter((e) => data.enemies.some((x) => x.id === e)).length, of: data.enemies.length, color: 'var(--blood)' },
  ];
  return (
    <Link to="/progress" className="panel mt-6 block p-5">
      <div className="flex items-baseline justify-between">
        <span className="font-game-caps text-[16px] text-gold/80">Your discoveries</span>
        <span className="text-[11px] text-faint">synced {new Date(progress.syncedAt).toLocaleDateString()}</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex justify-between text-sm">
              <span className="text-muted">{r.label}</span>
              <span className="font-game text-[16px]">
                {r.n}
                <span className="text-faint">/{r.of}</span>
              </span>
            </div>
            <HudBar className="mt-2" value={r.n / r.of} color={r.color} label={`${r.label} discovered`} />
          </div>
        ))}
      </div>
    </Link>
  );
}

export function HomePage() {
  const version = useGameData((s) => s.version);
  const hydrated = useProgressHydrated();
  const hasSave = useHasSave();
  const needsSave = hydrated && !hasSave;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-10 md:px-8 md:pt-10">
      <div className="safe-top mb-4">
        <DiscoveryBar kind="overall" />
      </div>
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="panel overflow-hidden p-6 md:p-10"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full opacity-60 blur-3xl"
          style={{ background: 'radial-gradient(circle, #f8900066, transparent 70%)' }}
        />
        <div className="relative">
          <div className="font-game-caps text-[16px] text-gold">Ultimate</div>
          <h1 className="font-game mt-1 text-[32px] leading-none md:text-[48px]">Noita Companion</h1>
          <Runes className="mt-2 block text-[16px] text-gold/40">seek the wand that ends all wands</Runes>
          <p className="mt-3 max-w-xl text-muted">
            Wands, spells, perks and alchemy — pulled straight from your game files, with spoilers kept hidden until
            you've found them yourself.
          </p>
          {needsSave ? (
            <div className="mt-6">
              <div className="font-game-caps flex items-center gap-2 text-[16px] text-ember">
                <Lock size={15} /> Sync your save to begin
              </div>
              <p className="mt-1 mb-4 max-w-xl text-sm text-muted">
                The companion is tailored to your own game, so it needs your save first. It’s read in your browser and never uploaded.
              </p>
              <SyncSave compact />
            </div>
          ) : (
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/wand" className="inline-flex items-center gap-2 btn-game font-game text-[16px] px-4 py-2.5">
                <Wand2 size={18} /> Build a wand
              </Link>
              <Link to="/progress" className="inline-flex items-center gap-2 btn-game quiet font-game text-[16px] px-4 py-2.5">
                <RefreshCw size={17} /> Sync progress
              </Link>
            </div>
          )}
        </div>
      </motion.section>

      <CurrentRun />

      <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TILES.map(({ to, title, text, icon: Icon, accent, open }, i) => (
          <motion.div
            key={to}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 + i * 0.05, duration: 0.35 }}
          >
            <Link
              to={to}
              title={needsSave && !open ? 'Sync your save first' : undefined}
              className={`slot slot-hover group flex h-full items-start gap-4 p-5 transition hover:-translate-y-0.5 ${needsSave && !open ? 'opacity-55' : ''}`}
            >
              <span
                className="grid h-11 w-11 shrink-0 place-items-center"
                style={{ background: `color-mix(in srgb, ${accent} 16%, #000a)`, color: accent, boxShadow: `inset 0 0 0 2px color-mix(in srgb, ${accent} 35%, transparent)` }}
              >
                <Icon size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-game flex items-center gap-2 text-[16px]">
                  {title}
                  {needsSave && !open ? (
                    <Lock size={14} aria-label="locked until a save is synced" className="text-faint" />
                  ) : (
                    <ArrowRight size={15} className="text-faint transition group-hover:translate-x-0.5 group-hover:text-ink" />
                  )}
                </span>
                <span className="mt-1 block text-sm text-muted">{text}</span>
              </span>
            </Link>
          </motion.div>
        ))}
      </section>

      <ProgressCard />

      <p className="mt-8 text-center text-xs text-faint">
        {version
          ? `Game data from build ${version.gameHash.slice(0, 8)} (${version.branch})`
          : 'Game data not extracted yet — run `npm run extract`.'}
        <br />
        Unofficial fan project — not affiliated with Nolla Games. Game data &amp; art © Nolla Games.
      </p>
    </div>
  );
}
