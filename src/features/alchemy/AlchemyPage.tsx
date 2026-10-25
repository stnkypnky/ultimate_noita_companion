import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight, Dices, EyeOff, FlaskConical, Plus, RotateCcw, X } from 'lucide-react';
import { useData } from '@/data/store';
import type { Material, Reaction } from '@/data/types';
import { ALCHEMY_KEY } from '@/data/spoilers';
import { useProgress, useSpoilers } from '@/store/progress';
import { Page } from '@/ui/Page';
import { Section } from '@/ui/controls';
import { MaterialSwatch } from '@/features/materials/MaterialSwatch';
import { titleCase, useMaterialVisibility } from '@/features/materials/MaterialsPage';
import { MAX_SEED, alchemyRecipes, type Recipe } from './aplc';

export function AlchemyPage() {
  return (
    <Page title="Alchemy" subtitle="Seed recipes and material reactions">
      <SeedRecipes />
      <Section title="What happens if I mix…">
        <Mixer />
      </Section>
    </Page>
  );
}

function SeedRecipes() {
  const { visible, reveal } = useSpoilers();
  const runs = useProgress((s) => s.progress?.runs);
  const [seed, setSeed] = useState<string>(() => (runs?.recent[0] ? String(runs.recent[0].seed) : ''));
  const n = Number(seed);
  const valid = seed !== '' && Number.isInteger(n) && n >= 0 && n <= MAX_SEED;
  const recipes = useMemo(() => (valid ? alchemyRecipes(n) : null), [valid, n]);

  if (!visible(ALCHEMY_KEY)) {
    return (
      <div className="mt-2 panel p-6 text-center">
        <EyeOff className="mx-auto text-muted" />
        <h2 className="mt-3 font-game text-[24px]">Secret recipes ahead</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          Every world seed has two hidden alchemy recipes. Finding them is part of the mystery — reveal only if you want to know.
        </p>
        <button onClick={() => reveal(ALCHEMY_KEY)} className="mt-4 btn-game quiet font-game text-[16px] px-4 py-2">
          Reveal seed recipes
        </button>
      </div>
    );
  }

  return (
    <Section title="Seed recipes">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={seed}
          onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))}
          inputMode="numeric"
          placeholder="World seed"
          aria-label="World seed"
          className="h-11 w-48 rounded-xl border border-line bg-surface px-3 font-mono tabular-nums focus:border-line-strong focus:outline-none"
        />
        {seed && (
          <button onClick={() => setSeed('')} className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm text-muted hover:text-ink" title="Clear seed">
            <X size={16} /> Clear
          </button>
        )}
        <button onClick={() => setSeed(String(Math.floor(Math.random() * MAX_SEED)))} className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm text-muted hover:text-ink" title="Random seed">
          <Dices size={17} /> Random
        </button>
      </div>
      {runs?.recent.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-faint">Your recent runs:</span>
          {runs.recent.map((r) => (
            <button
              key={r.date}
              onClick={() => setSeed(String(r.seed))}
              className={`rounded-full border px-2.5 py-1 font-mono ${String(r.seed) === seed ? 'border-ember/60 bg-ember/10 text-ink' : 'border-line text-muted hover:text-ink'}`}
              title={new Date(r.date).toLocaleString()}
            >
              {r.seed}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-faint">
          Tip: <Link to="/progress" className="text-ember hover:underline">sync your save</Link> to pick seeds from your recent runs.
        </p>
      )}

      {recipes && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <RecipeCard title="Lively Concoction" recipe={recipes.lc} />
          <RecipeCard title="Alchemic Precursor" recipe={recipes.ap} />
        </div>
      )}
      <p className="mt-3 text-[11px] text-faint">
        Recipes come from the community's reverse-engineered algorithm (lamas_stats, noita-tools) — the game picks them in its engine, not its
        script files.
      </p>
    </Section>
  );
}

function RecipeCard({ title, recipe }: { title: string; recipe: Recipe }) {
  const { materialById } = useData();
  const result = materialById.get(recipe.result);
  return (
    <motion.div
      key={recipe.materials.join()}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel p-4"
    >
      <div className="flex items-center gap-3">
        {result && <MaterialSwatch material={result} size={36} />}
        <div>
          <h3 className="font-game text-[16px] leading-tight">{title}</h3>
          <p className="text-xs text-faint">Reaction chance {recipe.probability}%</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {recipe.materials.map((id, i) => {
          const m = materialById.get(id);
          return (
            <span key={id} className="contents">
              {i > 0 && <Plus size={14} className="text-faint" />}
              <Link to={`/materials/${id}`} className="inline-flex items-center gap-2 rounded-lg bg-raised py-1.5 pr-2.5 pl-1.5 text-sm hover:bg-surface-2">
                {m && <MaterialSwatch material={m} size={22} />}
                {m ? titleCase(m.name) : id}
              </Link>
            </span>
          );
        })}
      </div>
    </motion.div>
  );
}

/** Pick two materials, see every reaction the game defines between them (tags included). */
function Mixer() {
  const { materials, reactions } = useData();
  const { isVisible } = useMaterialVisibility();
  const [a, setA] = useState<Material | null>(null);
  const [b, setB] = useState<Material | null>(null);
  const options = useMemo(() => materials.filter((m) => m.showInCreative && isVisible(m.id)).sort((x, y) => x.name.localeCompare(y.name)), [materials, isVisible]);

  const matches = (m: Material, input: string) => input === m.id || m.tags.includes(input);
  const found = useMemo(() => {
    if (!a || !b) return [];
    return reactions.filter((r) => {
      const [i1, i2] = r.inputs;
      if (!i1 || !i2) return false;
      return (matches(a, i1) && matches(b, i2)) || (matches(b, i1) && matches(a, i2));
    });
  }, [a, b, reactions]);
  const safe = found.filter((r) => r.outputs.every((o) => o.startsWith('[') || isVisible(o)));

  return (
    <div className="panel p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <MaterialPicker value={a} onChange={setA} options={options} label="First material" />
        <Plus size={16} className="mx-auto shrink-0 text-faint sm:mx-0" />
        <MaterialPicker value={b} onChange={setB} options={options} label="Second material" />
        {(a || b) && (
          <button
            onClick={() => {
              setA(null);
              setB(null);
            }}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-sm text-muted hover:text-ink"
          >
            <RotateCcw size={15} /> Reset
          </button>
        )}
      </div>
      {a && b && (
        <div className="mt-4">
          {safe.length === 0 ? (
            <p className="text-sm text-muted">{found.length ? 'The result is a spoiler — reveal it from the material pages.' : 'Nothing happens — no reaction between these two.'}</p>
          ) : (
            <ul className="space-y-1.5">
              {safe.map((r, i) => (
                <ReactionResult key={i} r={r} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ReactionResult({ r }: { r: Reaction }) {
  const { materialById } = useData();
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] bg-raised px-3 py-2 text-sm">
      <FlaskConical size={15} className="text-toxic" />
      <ArrowRight size={14} className="text-faint" />
      {r.outputs.map((o, i) => {
        const m = materialById.get(o);
        return (
          <span key={i} className="inline-flex items-center gap-1.5">
            {m && <MaterialSwatch material={m} size={18} />}
            {m ? titleCase(m.name) : o}
          </span>
        );
      })}
      <span className="ml-auto text-xs text-faint">
        {r.probability}% {r.requiresLifetime ? `· after ${r.requiresLifetime} frames` : ''}
      </span>
    </li>
  );
}

function MaterialPicker({ value, onChange, options, label }: { value: Material | null; onChange: (m: Material | null) => void; options: Material[]; label: string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const list = useMemo(() => options.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()) || m.id.includes(q.toLowerCase())), [options, q]);
  return (
    <div className="relative flex-1">
      <div className="flex h-11 items-center gap-2 rounded-xl border border-line bg-raised px-2 focus-within:border-line-strong">
        {value && <MaterialSwatch material={value} size={24} />}
        <input
          aria-label={label}
          value={open ? q : value ? titleCase(value.name) : ''}
          placeholder={label}
          onFocus={() => {
            setOpen(true);
            setQ('');
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => setQ(e.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none focus-visible:outline-none"
        />
        {value && !open && (
          <button aria-label={`Clear ${label.toLowerCase()}`} onClick={() => onChange(null)} className="rounded-md p-1.5 text-faint hover:text-ink">
            <X size={15} />
          </button>
        )}
      </div>
      {open && (
        <ul className="scrollbar-thin absolute inset-x-0 top-12 z-20 max-h-64 overflow-y-auto panel p-1 shadow-[var(--shadow)]">
          {list.map((m) => (
            <li key={m.id}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(m);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-3"
              >
                <MaterialSwatch material={m} size={20} />
                {titleCase(m.name)}
                <span className="ml-auto text-[11px] text-faint">{m.id}</span>
              </button>
            </li>
          ))}
          {!list.length && <li className="px-2 py-2 text-sm text-faint">No match</li>}
        </ul>
      )}
    </div>
  );
}
