import {
  Home,
  Wand2,
  Sparkles,
  FlaskConical,
  Beaker,
  Gem,
  Package,
  RefreshCw,
  Settings,
  Skull,
  Map as MapIcon,
  type LucideIcon,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { LiveCrystal } from '@/ui/LiveCrystal';

export type NavItem = { to: string; label: string; icon: LucideIcon | ComponentType<{ size?: number; className?: string }>; mobile?: boolean };

/** Shown only while a game is running: after Home in the rail, in Materials' place on the phone bar. */
export const RUN_ITEM: NavItem = { to: '/run', label: 'Run', icon: LiveCrystal };
/** The phone bar slot the Run item takes while a game is running. */
export const RUN_REPLACES = '/materials';

/** Order shown in the desktop rail. `mobile` marks the 4 bottom-bar items (Home doubles as the menu). */
export const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, mobile: true },
  { to: '/wand', label: 'Wand Builder', icon: Wand2, mobile: true },
  { to: '/spells', label: 'Spells', icon: Sparkles, mobile: true },
  { to: '/perks', label: 'Perks', icon: Gem },
  { to: '/items', label: 'Items', icon: Package },
  { to: '/bestiary', label: 'Bestiary', icon: Skull },
  { to: '/map', label: 'World Map', icon: MapIcon },
  { to: '/materials', label: 'Materials', icon: FlaskConical, mobile: true },
  { to: '/alchemy', label: 'Alchemy', icon: Beaker },
  { to: '/progress', label: 'Progress Sync', icon: RefreshCw },
  { to: '/settings', label: 'Settings', icon: Settings },
];

/** Sections that work before a save is synced: everything else waits for one (app/SaveGate.tsx). */
const OPEN = ['/', '/progress', '/import', '/pair', '/settings', '/run'];

/** The rail's items: Run joins after Home while a game is running. */
export const railItems = (live: boolean): NavItem[] => (live ? [NAV[0]!, RUN_ITEM, ...NAV.slice(1)] : NAV);
/** The phone bar's items: Run takes Materials' slot while a game is running. */
export const bottomItems = (live: boolean): NavItem[] => NAV.filter((n) => n.mobile).map((n) => (live && n.to === RUN_REPLACES ? RUN_ITEM : n));
export const isOpenPath = (pathname: string) => OPEN.some((p) => (p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(`${p}/`)));
