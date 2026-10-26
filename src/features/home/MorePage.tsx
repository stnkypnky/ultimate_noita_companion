import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { NAV } from '@/app/nav';
import { Page } from '@/ui/Page';

/** Mobile overflow menu for sections not in the bottom bar. */
export function MorePage() {
  const items = NAV.filter((n) => !n.mobile);
  return (
    <Page title="Menu">
      <ul className="mt-2 divide-y divide-line overflow-hidden panel">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link to={to} className="flex items-center gap-4 px-4 py-4 active:bg-surface-2">
              <Icon size={20} className="text-ember" />
              <span className="font-game flex-1 text-[16px]">{label}</span>
              <ChevronRight size={18} className="text-faint" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-center text-xs text-faint">
        Unofficial fan project — not affiliated with Nolla Games.
        <br />
        Game data &amp; art © Nolla Games.
      </p>
    </Page>
  );
}
