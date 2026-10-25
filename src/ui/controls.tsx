import { forwardRef, useCallback, useRef, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { useHotkey } from './hooks';
import { StatIcon, statIconFor, type StatIconName } from './game';

export const SearchInput = forwardRef<HTMLInputElement, { value: string; onChange: (v: string) => void; placeholder?: string }>(
  function SearchInput({ value, onChange, placeholder = 'Search…' }, ref) {
    return (
      <label className="relative flex items-center">
        <Search size={17} className="pointer-events-none absolute left-3 text-faint" />
        <input
          ref={ref}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-11 w-full border-2 border-line-strong/70 bg-black/55 pr-10 pl-10 text-[15px] text-ink placeholder:text-faint focus:border-gold/70 focus:bg-black/70 focus:outline-none"
        />
        {value ? (
          <button aria-label="Clear search" className="absolute right-2 rounded-md p-1.5 text-faint hover:text-ink" onClick={() => onChange('')}>
            <X size={16} />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-3 hidden rounded border border-line px-1.5 text-[11px] text-faint lg:block">/</kbd>
        )}
      </label>
    );
  },
);

/** Search box wired to the "/" shortcut. */
export function useSearchFocus() {
  const ref = useRef<HTMLInputElement>(null);
  useHotkey(
    '/',
    useCallback((e: KeyboardEvent) => {
      e.preventDefault();
      ref.current?.focus();
    }, []),
  );
  return ref;
}

export function Chip({ active, onClick, children, color }: { active?: boolean; onClick?: () => void; children: ReactNode; color?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`slot slot-hover font-game inline-flex h-9 shrink-0 items-center gap-2 px-3 text-[16px] whitespace-nowrap transition-colors ${
        active ? 'text-ink' : 'text-muted hover:text-ink'
      }`}
    >
      {color && <span className="h-2 w-2" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />}
      {children}
    </button>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <div className="scrollbar-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">{children}</div>;
}

export function Select<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <label className="inline-flex items-center gap-2 text-[13px] text-muted">
      <span className="sr-only md:not-sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-9 border-2 border-line-strong/70 bg-black/55 px-2 text-[13px] text-ink focus:border-gold/70 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Stat rows like the game's tooltips: an inventory icon, a label, and the value in the game font. */
export function StatTable({ rows }: { rows: { label: string; value: ReactNode; good?: boolean; bad?: boolean; icon?: StatIconName }[] }) {
  if (!rows.length) return null;
  const icons = rows.map((r) => r.icon ?? statIconFor(r.label));
  const iconColumn = icons.some(Boolean);
  return (
    <dl className="panel divide-y divide-line/70 px-1 py-0.5">
      {rows.map((r, i) => {
        const icon = icons[i];
        return (
        <div key={i} className="flex items-center justify-between gap-4 px-2.5 py-2 text-sm">
          <dt className="flex items-center gap-2 text-muted">
            {iconColumn && <span className="grid w-[18px] shrink-0 place-items-center">{icon && <StatIcon name={icon} />}</span>}
            {r.label}
          </dt>
          <dd className={`font-game text-right text-[16px] ${r.good ? 'text-toxic' : r.bad ? 'text-blood' : 'text-ink'}`}>{r.value}</dd>
        </div>
        );
      })}
    </dl>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-game-caps text-[16px] text-gold/80">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
