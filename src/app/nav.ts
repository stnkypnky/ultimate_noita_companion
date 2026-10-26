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
  Menu,
  Skull,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = { to: string; label: string; icon: LucideIcon; mobile?: boolean };

/** Order shown in the desktop rail. `mobile` marks the 4 bottom-bar items (+ "More"). */
export const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, mobile: true },
  { to: '/wand', label: 'Wand Builder', icon: Wand2, mobile: true },
  { to: '/spells', label: 'Spells', icon: Sparkles, mobile: true },
  { to: '/perks', label: 'Perks', icon: Gem },
  { to: '/items', label: 'Items', icon: Package },
  { to: '/bestiary', label: 'Bestiary', icon: Skull },
  { to: '/materials', label: 'Materials', icon: FlaskConical, mobile: true },
  { to: '/alchemy', label: 'Alchemy', icon: Beaker },
  { to: '/progress', label: 'Progress Sync', icon: RefreshCw },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export const MORE: NavItem = { to: '/more', label: 'More', icon: Menu };
