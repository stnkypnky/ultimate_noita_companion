import { forwardRef, useCallback, useRef, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { useHotkey } from './hooks';

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
          className="h-11 w-full rounded-xl border border-line bg-surface pr-10 pl-10 text-[15px] text-ink placeholder:text-faint focus:border-line-strong focus:bg-surface-2 focus:outline-none"
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
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] whitespace-nowrap transition-colors ${
        active ? 'border-transparent bg-ink text-bg' : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink'
      }`}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
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
        className="h-8 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink focus:outline-none"
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

export function StatTable({ rows }: { rows: { label: string; value: ReactNode; good?: boolean; bad?: boolean }[] }) {
  if (!rows.length) return null;
  return (
    <dl className="divide-y divide-line overflow-hidden rounded-[var(--radius-sm)] border border-line bg-raised">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
          <dt className="text-muted">{r.label}</dt>
          <dd className={`text-right font-medium tabular-nums ${r.good ? 'text-toxic' : r.bad ? 'text-blood' : 'text-ink'}`}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-[0.14em] text-faint uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
