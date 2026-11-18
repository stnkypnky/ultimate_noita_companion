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

export type NavItem = { to: string; label: string; icon: LucideIcon; mobile?: boolean };

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
const OPEN = ['/', '/progress', '/import', '/settings'];
export const isOpenPath = (pathname: string) => OPEN.some((p) => (p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(`${p}/`)));
