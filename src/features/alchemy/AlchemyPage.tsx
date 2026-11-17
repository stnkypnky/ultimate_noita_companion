import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight, BookOpen, Dices, EyeOff, Plus, X } from 'lucide-react';
import { useData } from '@/data/store';
import type { Material, Reaction } from '@/data/types';
import { ALCHEMY_ALL_KEY, ALCHEMY_KEY } from '@/data/spoilers';
import { useProgress, useSpoilers } from '@/store/progress';
import { DiscoveryBar } from '@/features/progress/DiscoveryBar';
import { Page } from '@/ui/Page';
import { SearchInput, Section } from '@/ui/controls';
import { useDebounced } from '@/ui/hooks';
import { MaterialSwatch } from '@/features/materials/MaterialSwatch';
import { titleCase, useMaterialVisibility } from '@/features/materials/MaterialsPage';
import { MAX_SEED, alchemyRecipes, type Recipe } from './aplc';
import { dedupeByName, lookupReactions, nameHints, tagLabel, unique } from './lookup';

export function AlchemyPage() {
  return (
    <Page title="Alchemy" progress={<DiscoveryBar kind="alchemy" />} subtitle="Look up a material, or this seed's secret recipes">
      <Section title="Look up a material">
        <MaterialLookup />
      </Section>
      <AllRecipes />
      <SeedRecipes />
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

/** Every reaction is shown, secrets included, once the player asks for it. */
function useAllRevealed() {
  const { visible } = useSpoilers();
  return visible(ALCHEMY_ALL_KEY);
}

/** Hints that tell same-named materials apart, worked out once per data set. */
const hintCache = new WeakMap<Material[], Map<string, string>>();
function useNameHints() {
  const { materials } = useData();
  let h = hintCache.get(materials);
  if (!h) hintCache.set(materials, (h = nameHints(materials)));
  return h;
}

/** What the player sees for a reaction slot: a material's name (plus its hint), or a tag's label. */
function useSlotName() {
  const { materialById } = useData();
  const hints = useNameHints();
  return useCallback(
    (x: string) => {
      if (x.startsWith('[')) return tagLabel(x);
      const name = materialById.get(x)?.name ?? x;
      const hint = hints.get(x);
      return hint ? `${name} ${hint}` : name;
    },
    [materialById, hints],
  );
}

/** Type one material: how it's made, and everything it reacts with. */
function MaterialLookup() {
  const { materials, reactions } = useData();
  const { isVisible: materialVisible } = useMaterialVisibility();
  const all = useAllRevealed();
  const name = useSlotName();
  const isVisible = useCallback((id: string) => all || materialVisible(id), [all, materialVisible]);
  const [m, setM] = useState<Material | null>(null);
  const options = useMemo(() => materials.filter((x) => x.showInCreative && isVisible(x.id)).sort((x, y) => x.name.localeCompare(y.name)), [materials, isVisible]);
  const found = useMemo(() => {
    if (!m) return null;
    const f = lookupReactions(m, reactions, isVisible);
    return { ...f, makes: dedupeByName(f.makes, name), mixes: dedupeByName(f.mixes, name) };
  }, [m, reactions, isVisible, name]);

  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2">
        <MaterialPicker value={m} onChange={setM} options={options} label="Type a material, e.g. Pheromone" />
        {m && (
          <Link to={`/materials/${m.id}`} className="inline-flex h-11 shrink-0 items-center gap-1.5 px-2 text-sm text-muted hover:text-ink" title="Open the material page">
            Details <ArrowRight size={14} />
          </Link>
        )}
      </div>
      {m && found && (
        <div className="mt-4 space-y-4">
          <ReactionGroup title="How to make it" reactions={found.makes} focus={m} onPick={setM} empty="Nothing makes it — it's found in the world." />
          <ReactionGroup title="Mixes with" reactions={found.mixes} focus={m} onPick={setM} empty="It doesn't react with anything." />
          {found.hidden > 0 && (
            <p className="text-xs text-faint">
              {found.hidden} more reaction{found.hidden > 1 ? 's' : ''} hidden to avoid spoilers.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ReactionGroup({ title, reactions, focus, onPick, empty }: { title: string; reactions: Reaction[]; focus: Material; onPick: (m: Material) => void; empty: string }) {
  return (
    <div>
      <h4 className="font-game-caps mb-1.5 text-[16px] text-gold/80">
        {title} <span className="text-faint">({reactions.length})</span>
      </h4>
      {reactions.length ? (
        <ul className="space-y-1.5">
          {reactions.map((r, i) => (
            <ReactionRow key={i} r={r} focus={focus} onPick={onPick} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{empty}</p>
      )}
    </div>
  );
}

/** One reaction as "A + B → C"; tapping a material looks it up next. */
function ReactionRow({ r, focus, onPick }: { r: Reaction; focus?: Material; onPick?: (m: Material) => void }) {
  // Looking up one material, a tag slot it fills ("any water") is that material, so name it.
  const own = (x: string) => (focus && x.startsWith('[') && focus.tags.includes(x) ? focus.id : x);
  const inputs = unique(r.inputs.map(own));
  const outputs = unique(r.outputs.map(own));
  return (
    <li className="slot flex flex-wrap items-center gap-1.5 px-2.5 py-2">
      {inputs.map((x, i) => (
        <span key={`i${i}`} className="contents">
          {i > 0 && <Plus size={13} className="text-faint" />}
          <Ingredient id={x} focus={focus} onPick={onPick} />
        </span>
      ))}
      <ArrowRight size={14} className="mx-0.5 text-faint" />
      {outputs.map((x, i) => (
        <Ingredient key={`o${i}`} id={x} focus={focus} onPick={onPick} />
      ))}
      <span className="ml-auto pl-2 text-[11px] text-faint tabular-nums">
        {r.probability}%{r.requiresLifetime ? ` · after ${r.requiresLifetime} frames` : ''}
      </span>
    </li>
  );
}

function Ingredient({ id, focus, onPick }: { id: string; focus?: Material; onPick?: (m: Material) => void }) {
  const { materialById } = useData();
  const hints = useNameHints();
  if (id.startsWith('[')) return <span className="rounded bg-arcane/15 px-1.5 py-0.5 text-xs text-arcane">{tagLabel(id)}</span>;
  const m = materialById.get(id);
  if (!m) return <span className="text-xs text-muted">{id}</span>;
  const mine = focus?.id === id;
  const hint = hints.get(id);
  const cls = `inline-flex items-center gap-1.5 rounded py-0.5 pr-1.5 pl-0.5 text-[13px] ${mine ? 'bg-gold/20 text-ink' : 'bg-surface-2 hover:bg-surface-3'}`;
  const body = (
    <>
      <MaterialSwatch material={m} size={18} />
      {titleCase(m.name)}
      {hint && <span className="text-[11px] text-faint">· {hint}</span>}
    </>
  );
  if (onPick && !mine)
    return (
      <button onClick={() => onPick(m)} className={cls} title={`Look up ${m.name} (${id})`}>
        {body}
      </button>
    );
  return (
    <Link to={`/materials/${id}`} className={cls}>
      {body}
    </Link>
  );
}

/** The whole reaction table, spoilers included, behind a confirm. */
function AllRecipes() {
  const { reactions } = useData();
  const { reveal } = useSpoilers();
  const hideAgain = useProgress((s) => s.hideAgain);
  const all = useAllRevealed();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const q = useDebounced(query).trim().toLowerCase();

  const name = useSlotName();
  const distinct = useMemo(() => dedupeByName(reactions, name), [reactions, name]);
  const shown = useMemo(() => {
    if (!q) return distinct;
    return distinct.filter((r) => [...r.inputs, ...r.outputs].some((x) => name(x).toLowerCase().includes(q) || x.includes(q)));
  }, [distinct, name, q]);

  if (!open) {
    return (
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button onClick={() => setOpen(true)} className="btn-game font-game px-4 py-2 text-[16px]">
          <BookOpen size={16} className="mr-2 inline" />
          Reveal all recipes
        </button>
        <span className="text-xs text-faint">{distinct.length} reactions</span>
      </div>
    );
  }

  if (!all) {
    return (
      <div className="mt-5 panel p-6 text-center">
        <EyeOff className="mx-auto text-muted" />
        <h2 className="mt-3 font-game text-[24px]">Every recipe, secrets included</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">The full list includes reactions with secret and endgame materials. Reveal only if you want to know.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={() => reveal(ALCHEMY_ALL_KEY)} className="btn-game font-game px-4 py-2 text-[16px]">
            Show everything
          </button>
          <button onClick={() => setOpen(false)} className="px-3 text-sm text-muted hover:text-ink">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <Section
      title={`All recipes (${shown.length})`}
      aside={
        <button
          onClick={() => {
            hideAgain(ALCHEMY_ALL_KEY);
            setOpen(false);
          }}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink"
        >
          <EyeOff size={14} /> Hide again
        </button>
      }
    >
      <SearchInput value={query} onChange={setQuery} placeholder="Filter by material…" />
      <ul className="mt-3 space-y-1.5">
        {shown.map((r, i) => (
          <ReactionRow key={i} r={r} />
        ))}
      </ul>
      {!shown.length && <p className="mt-3 text-sm text-faint">No reaction uses that.</p>}
    </Section>
  );
}

function MaterialPicker({ value, onChange, options, label }: { value: Material | null; onChange: (m: Material | null) => void; options: Material[]; label: string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  // Names that start with the query come first, so "phe" lands on Pheromone, not Worm Pheromone.
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const hits = options.filter((m) => m.name.toLowerCase().includes(s) || m.id.includes(s));
    return s ? [...hits].sort((a, b) => Number(!a.name.toLowerCase().startsWith(s)) - Number(!b.name.toLowerCase().startsWith(s))) : hits;
  }, [options, q]);
  return (
    <div className="relative min-w-0 flex-1">
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
          onKeyDown={(e) => {
            if (e.key === 'Enter' && open && list[0]) {
              onChange(list[0]);
              setOpen(false);
              e.currentTarget.blur();
            }
          }}
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
