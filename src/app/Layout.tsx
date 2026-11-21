import { AnimatePresence, motion } from 'motion/react';
import { NavLink, useLocation, useOutlet } from 'react-router';
import { useState } from 'react';
import { Lock, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { RUN_ITEM, bottomItems, isOpenPath, railItems, type NavItem } from './nav';
import { UpdateToast } from './UpdateToast';
import { Onboarding } from './Onboarding';
import { SaveGate } from './SaveGate';
import { Embers } from '@/ui/game';
import { LiveCrystal } from '@/ui/LiveCrystal';
import { SyncChip } from '@/features/sync/SyncChip';
import { RunToast } from '@/features/live/RunToast';
import { useRunActive } from '@/features/live/state';
import { useRuns } from '@/features/live/runs';
import { useHasSave, useProgressHydrated } from '@/store/progress';

/**
 * Run shows in the nav while a game is running, and stays while you're on it after the game closes. The rail
 * (with room to spare) also keeps it while there are recorded runs to look back on; the phone bar doesn't.
 */
function useShowRun() {
  const active = useRunActive();
  const hasRuns = useRuns((s) => s.records.length > 0);
  const { pathname } = useLocation();
  const onRun = pathname === RUN_ITEM.to || pathname.startsWith(`${RUN_ITEM.to}/`);
  return { show: active || onRun, rail: active || onRun || hasRuns, active };
}

function NavIcon({ item, size, className, active }: { item: NavItem; size: number; className: string; active: boolean }) {
  if (item === RUN_ITEM) return <LiveCrystal size={size + 3} off={!active} />;
  const Icon = item.icon;
  return <Icon size={size} className={className} />;
}

/** Sections that wait for a synced save show a small lock in the nav until there is one. */
function useLocked() {
  const hasSave = useHasSave();
  const hydrated = useProgressHydrated();
  return (to: string) => hydrated && !hasSave && !isOpenPath(to);
}

export function Layout() {
  const location = useLocation();
  const outlet = useOutlet();
  // Animate between top-level sections only; detail routes inside a section stay put.
  const section = '/' + (location.pathname.split('/')[1] ?? '');

  return (
    <div className="app-backdrop flex h-full">
      <Embers />
      <Rail />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <main className="scrollbar-thin flex-1 overflow-x-hidden overflow-y-auto pb-[calc(var(--nav-h)+env(safe-area-inset-bottom))] md:pb-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="min-h-full"
            >
              <SaveGate>{outlet}</SaveGate>
            </motion.div>
          </AnimatePresence>
        </main>
        <BottomNav />
      </div>
      <SyncChip />
      <RunToast />
      <UpdateToast />
      <Onboarding />
    </div>
  );
}

const RAIL_KEY = 'rail-collapsed';
const readCollapsed = () => {
  try {
    return localStorage.getItem(RAIL_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * The side menu. On a big screen it shows names and can fold down to icons (remembered), to give the page more
 * room: a landscape tablet's Run dashboard, say. Smaller tablets always get the icon rail.
 */
function Rail() {
  const locked = useLocked();
  const run = useShowRun();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(RAIL_KEY, c ? '0' : '1');
      } catch {
        /* this visit only */
      }
      return !c;
    });
  };
  // Names show only on a big screen with the menu open.
  const named = !collapsed;
  return (
    <nav
      aria-label="Main"
      className={`safe-top hidden w-[72px] shrink-0 flex-col border-r-2 border-line-strong/60 bg-raised transition-[width] duration-150 md:flex ${
        named ? 'lg:w-[var(--rail-w)]' : ''
      }`}
    >
      <div className={`flex shrink-0 items-center gap-3 px-4 py-5 short:py-2 ${named ? 'lg:px-5' : ''}`}>
        <img src={`${import.meta.env.BASE_URL}icons/favicon-64.png`} alt="" className="pixelated h-8 w-8" />
        <div className={`hidden leading-none ${named ? 'lg:block' : ''}`}>
          <div className="font-game-caps text-[8px] text-gold">Ultimate</div>
          <div className="font-game mt-1 text-[16px] whitespace-nowrap">Noita Companion</div>
        </div>
      </div>
      {/* A landscape phone gets the rail too: its items scroll when they don't fit the height. */}
      <ul className={`scrollbar-thin flex min-h-0 flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto px-2 pb-2 short:gap-0.5 ${named ? 'lg:px-3' : ''}`}>
        {railItems(run.rail).map((item) => (
          <li key={item.to}>
            <RailLink item={item} locked={locked(item.to)} live={run.active} named={named} />
          </li>
        ))}
      </ul>
      <button
        onClick={toggle}
        aria-label={collapsed ? 'Expand the menu' : 'Collapse the menu'}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand the menu' : 'Collapse the menu'}
        className={`mx-2 mb-2 hidden shrink-0 items-center gap-3 px-3 py-2.5 text-muted transition-colors hover:bg-surface hover:text-ink lg:flex short:py-1.5 ${
          named ? 'lg:mx-3' : 'justify-center'
        }`}
      >
        {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
        {named && <span className="text-sm">Collapse</span>}
      </button>
      <p className={`hidden shrink-0 px-5 pb-4 text-[11px] leading-snug text-faint short:hidden ${named ? 'lg:block' : ''}`}>
        Unofficial fan project. Game data &amp; art © Nolla Games.
      </p>
    </nav>
  );
}

function RailLink({ item, locked, live, named }: { item: NavItem; locked: boolean; live: boolean; named: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      title={locked ? `${item.label} (sync your save first)` : item.label}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 px-3 py-2.5 transition-colors short:py-1.5 ${named ? 'max-lg:justify-center' : 'justify-center'} ${
          isActive ? 'slot text-ink' : 'text-muted hover:bg-surface hover:text-ink'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="rail-active"
              className="absolute inset-y-2 -left-1 w-[4px] bg-ember shadow-[0_0_10px_var(--ember)]"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <NavIcon item={item} size={19} active={live} className={`shrink-0 ${isActive ? 'text-ember' : locked ? 'opacity-50' : ''}`} />
          <span className={`font-game hidden text-[16px] whitespace-nowrap ${named ? 'lg:inline' : ''} ${locked ? 'opacity-50' : ''}`}>{item.label}</span>
          {locked && <Lock size={12} aria-label="locked" className={`ml-auto hidden text-faint ${named ? 'lg:block' : ''}`} />}
        </>
      )}
    </NavLink>
  );
}

function BottomNav() {
  const run = useShowRun();
  const items = bottomItems(run.show);
  const locked = useLocked();
  return (
    <nav
      aria-label="Main"
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t-2 border-line-strong/70 bg-raised md:hidden"
    >
      <ul className="flex h-[var(--nav-h)] items-stretch">
        {items.map((item) => {
          return (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `relative flex h-full flex-col items-center justify-center gap-1 text-[11px] transition-colors ${
                    isActive ? 'text-ink' : 'text-faint'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="bottom-active"
                        className="absolute top-0 h-[4px] w-10 bg-ember shadow-[0_0_10px_var(--ember)]"
                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      />
                    )}
                    <span className="relative">
                      <NavIcon item={item} size={21} active={run.active} className={isActive ? 'text-ember' : locked(item.to) ? 'opacity-50' : ''} />
                      {locked(item.to) && <Lock size={10} aria-label="locked" className="absolute -top-1 -right-2.5 text-faint" />}
                    </span>
                    <span>{item.label === 'Wand Builder' ? 'Wand' : item.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
