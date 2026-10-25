import { AnimatePresence, motion } from 'motion/react';
import { NavLink, useLocation, useOutlet } from 'react-router';
import { MORE, NAV, type NavItem } from './nav';
import { UpdateToast } from './UpdateToast';
import { Onboarding } from './Onboarding';
import { Embers } from '@/ui/game';

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
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>
        <BottomNav />
      </div>
      <UpdateToast />
      <Onboarding />
    </div>
  );
}

function Rail() {
  return (
    <nav
      aria-label="Main"
      className="safe-top hidden w-[72px] shrink-0 flex-col border-r-2 border-line-strong/60 bg-raised/85 backdrop-blur md:flex lg:w-[var(--rail-w)]"
    >
      <div className="flex items-center gap-3 px-4 py-5 lg:px-5">
        <img src={`${import.meta.env.BASE_URL}icons/favicon-64.png`} alt="" className="pixelated h-8 w-8" />
        <div className="hidden leading-none lg:block">
          <div className="font-game-caps text-[8px] text-gold">Ultimate</div>
          <div className="font-game mt-1 text-[16px]">Noita Companion</div>
        </div>
      </div>
      <ul className="flex flex-col gap-1 px-2 lg:px-3">
        {NAV.map((item) => (
          <li key={item.to}>
            <RailLink item={item} />
          </li>
        ))}
      </ul>
      <p className="mt-auto hidden px-5 py-4 text-[11px] leading-snug text-faint lg:block">
        Unofficial fan project. Game data &amp; art © Nolla Games.
      </p>
    </nav>
  );
}

function RailLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      title={item.label}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 px-3 py-2.5 transition-colors max-lg:justify-center ${
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
          <Icon size={19} className={isActive ? 'text-ember' : ''} />
          <span className="font-game hidden text-[16px] lg:inline">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

function BottomNav() {
  const items = [...NAV.filter((n) => n.mobile), MORE];
  return (
    <nav
      aria-label="Main"
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t-2 border-line-strong/70 bg-raised/92 backdrop-blur-lg md:hidden"
    >
      <ul className="flex h-[var(--nav-h)] items-stretch">
        {items.map((item) => {
          const Icon = item.icon;
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
                    <Icon size={21} className={isActive ? 'text-ember' : ''} />
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
