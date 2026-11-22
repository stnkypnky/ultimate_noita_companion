import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Check, Dices, ExternalLink, Info, Loader2, Wand2 } from 'lucide-react';
import { fetchJson, gameUrl, useData } from '@/data/store';
import type { Material, WorldMap } from '@/data/types';
import { SECRET_MATERIALS, materialKey } from '@/data/spoilers';
import { useProgress, useSpoilers } from '@/store/progress';
import { Section } from '@/ui/controls';
import { AtlasIcon, SpellIcon } from '@/ui/GameIcon';
import { MaterialSwatch } from '@/features/materials/MaterialSwatch';
import { encodeWand } from '@/features/wand/model';
import { materialTable, type FungalShift, type ShopItem, type ShopWand } from '@/seed/seed';
import { seedReport } from '@/seed/client';
import type { SeedReport } from '@/seed/worker';
import { MAX_SEED } from '@/features/alchemy/aplc';
import { ModifierCard } from './ModifierCard';
import { PART_OF, biomeName, type makeVisibility } from './world';

let strings: Promise<Record<string, string>> | null = null;
const loadStrings = () => (strings ??= fetchJson<Record<string, string>>('data/seed_strings.json').catch(() => ({})));

const SEED_KEY = 'map-seed';
const remembered = () => {
  try {
    return Number(localStorage.getItem(SEED_KEY)) || null;
  } catch {
    return null;
  }
};

/** A seed's Holy Mountains, shops, fungal shifts and biome modifiers, from the game's own scripts. */
export function SeedPanel({
  map,
  vis,
  onReport,
  onSeed,
}: {
  map: WorldMap;
  /** Which areas you can see (as the map shows them): modifiers of hidden ones aren't named. */
  vis: ReturnType<typeof makeVisibility> | null;
  onReport: (r: SeedReport | null) => void;
  onSeed?: (seed: number | null) => void;
}) {
  const { materials } = useData();
  const progress = useProgress((s) => s.progress);
  const recent = progress?.runs?.recent.slice(0, 4) ?? [];
  const [seed, setSeed] = useState<number | null>(() => remembered() ?? recent[0]?.seed ?? null);
  const [text, setText] = useState(seed ? String(seed) : '');
  // With a synced save, its unlocks decide what can appear; without one, everything is taken as unlocked.
  const [allUnlocked, setAllUnlocked] = useState(!progress);
  const [picks, setPicks] = useState<string[][]>([]);
  const [report, setReport] = useState<SeedReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const matTable = useMemo(() => materialTable(materials), [materials]);

  useEffect(() => {
    void loadStrings().then(setTexts);
  }, []);

  useEffect(() => {
    onSeed?.(seed);
  }, [seed, onSeed]);
  useEffect(() => {
    if (seed === null) {
      setReport(null);
      onReport(null);
      return;
    }
    try {
      localStorage.setItem(SEED_KEY, String(seed));
    } catch {
      /* not remembered */
    }
    let live = true;
    setBusy(true);
    setError(null);
    seedReport({ seed, materials: matTable, allUnlocked, flags: progress?.flags ?? [], deaths: progress?.runs?.deaths, picks, shopSpots: map.shops })
      .then((r) => {
        if (!live) return;
        setReport(r);
        onReport(r);
      })
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [seed, allUnlocked, picks, matTable, progress, map.shops, onReport]);

  const choose = (s: number) => {
    setPicks([]);
    setSeed(s);
    setText(String(s));
  };
  const submit = () => {
    const n = Number(text.trim());
    if (Number.isInteger(n) && n > 0 && n <= MAX_SEED) choose(n);
    else setError(`A seed is a whole number from 1 to ${MAX_SEED}.`);
  };
  const togglePick = (level: number, perk: string) =>
    setPicks((p) => {
      const next = p.map((x) => [...x]);
      while (next.length <= level) next.push([]);
      next[level] = next[level]!.includes(perk) ? next[level]!.filter((x) => x !== perk) : [...next[level]!, perk];
      // A pick only changes the mountains after it; later picks may no longer be on offer, so they're cleared.
      return next.slice(0, level + 1);
    });

  return (
    <section className="panel mt-6 p-4 md:p-5" aria-label="Seed">
      <h2 className="font-game text-[24px]">What a seed gives</h2>
      <p className="mt-1 text-sm text-muted">
        Holy Mountain perks and shops, fungal shifts and biome modifiers for any seed. The seed is on the pause menu (and your synced runs have
        theirs).
      </p>
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          inputMode="numeric"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
          placeholder="World seed"
          aria-label="World seed"
          className="h-9 w-40 rounded-lg border border-line bg-surface-2 px-3 text-sm tabular-nums"
        />
        <button type="submit" className="btn-game font-game h-9 px-3 text-[16px]">
          Show
        </button>
        <button type="button" onClick={() => choose(1 + Math.floor(Math.random() * MAX_SEED))} className="slot slot-hover inline-flex h-9 items-center gap-1.5 px-3 text-sm text-muted hover:text-ink">
          <Dices size={15} /> Random
        </button>
        {recent.map((r) => (
          <button key={r.seed} type="button" onClick={() => choose(r.seed)} className="slot slot-hover h-9 px-3 text-xs text-muted tabular-nums hover:text-ink" title={`Your run of ${r.date}`}>
            {r.seed}
          </button>
        ))}
        {busy && <Loader2 size={16} className="animate-spin text-muted" aria-label="Working it out" />}
      </form>
      <label className="mt-2 flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={allUnlocked} onChange={(e) => setAllUnlocked(e.target.checked)} disabled={!progress} />
        Assume everything is unlocked
        {!progress && <span className="text-faint">(no synced save: every unlockable counts as unlocked)</span>}
      </label>
      {error && <p className="mt-2 text-sm text-blood">{error}</p>}
      {report && seed !== null && (
        <>
          <HolyMountains report={report} picks={picks} onPick={togglePick} />
          <Fungal shifts={report.fungal} />
          <Modifiers report={report} map={map} vis={vis} texts={texts} />
          <Limits />
        </>
      )}
    </section>
  );
}

export function PerkChip({ id, taken, onClick }: { id: string; taken?: boolean; onClick?: () => void }) {
  const { perkById } = useData();
  const { visible, reveal } = useSpoilers();
  const perk = perkById.get(id);
  if (!perk) return <span className="text-xs text-muted">{id}</span>;
  const hidden = !visible(perk.discoverFlag);
  if (hidden)
    return (
      <button onClick={() => reveal(perk.discoverFlag)} className="slot inline-flex items-center gap-1.5 px-2 py-1 text-xs text-faint" title="An undiscovered perk: tap to reveal it">
        ? Undiscovered perk
      </button>
    );
  return (
    <span className="inline-flex items-center gap-1">
      <Link to={`/perks/${perk.id}`} className="slot slot-hover inline-flex items-center gap-1.5 px-2 py-1 text-xs text-ink" title={perk.name}>
        <AtlasIcon atlas="perks" icon={perk.icon} scale={1} /> {perk.name}
      </Link>
      {onClick && (
        <button
          onClick={onClick}
          aria-pressed={taken}
          title={taken ? 'Taken: tap to undo' : 'Mark as taken (changes the mountains after this one)'}
          className={`grid h-6 w-6 place-items-center rounded-md border ${taken ? 'border-ember bg-ember text-bg' : 'border-line text-faint hover:text-ink'}`}
        >
          <Check size={13} />
        </button>
      )}
    </span>
  );
}

export function SpellChip({ id }: { id: string }) {
  const { spellById } = useData();
  const { visible } = useSpoilers();
  const s = spellById.get(id);
  if (!s) return <span className="text-xs text-muted">{id}</span>;
  const hidden = !visible(s.discoverFlag);
  return (
    <Link to={hidden ? '#' : `/spells/${s.id}`} title={hidden ? 'An undiscovered spell' : s.name} className="inline-grid place-items-center">
      <SpellIcon type={s.type} icon={s.icon} scale={1.5} hidden={hidden} />
    </Link>
  );
}

/** A wand's stats and spells, with a link to try it in the builder; a shop's shows its price. */
export function WandLink({ wand, cost, sale, name = 'Shop wand' }: { wand: ShopWand; cost?: number; sale?: boolean; name?: string }) {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    void encodeWand({ ...wand, name }).then((c) => setHref(`/wand#w=${c}`));
  }, [wand, name]);
  return (
    <div className="rounded-lg border border-line p-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">
          {wand.shuffle ? 'Shuffle' : 'No shuffle'} · {wand.spellsPerCast}/cast · {wand.capacity} slots
        </span>
        {cost !== undefined && (
          <span className={sale ? 'text-ember' : 'text-gold'}>
            {Math.round(cost)}${sale ? ' sale' : ''}
          </span>
        )}
      </div>
      <div className="mt-1 text-[11px] text-faint tabular-nums">
        delay {(wand.castDelay / 60).toFixed(2)}s · recharge {(wand.rechargeTime / 60).toFixed(2)}s · mana {Math.round(wand.manaMax)} (+{Math.round(wand.manaChargeSpeed)}/s) · spread {wand.spread}°
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {wand.alwaysCasts.map((id, i) => (
          <span key={`a${i}`} title="Always cast" className="rounded ring-1 ring-gold/70">
            <SpellChip id={id} />
          </span>
        ))}
        {/* Every slot the wand has, empty ones as empty inventory slots (as the game shows them). */}
        {Array.from({ length: Math.max(wand.capacity, wand.spells.length) }, (_, i) => wand.spells[i] ?? null).map((id, i) =>
          id ? (
            <SpellChip key={i} id={id} />
          ) : (
            <span
              key={i}
              title="Empty slot"
              className="pixelated inline-block shrink-0 opacity-60"
              style={{ width: 30, height: 30, backgroundImage: `url(${gameUrl('ui/full_inventory_box.png')})`, backgroundSize: '100% 100%' }}
            />
          ),
        )}
        {href && (
          <Link to={href} className="ml-auto inline-flex items-center gap-1 text-xs text-gold hover:underline">
            <Wand2 size={13} /> Open in builder
          </Link>
        )}
      </div>
    </div>
  );
}

export function ShopView({ items, type }: { items: ShopItem[]; type: 'spell' | 'wand' }) {
  if (type === 'wand')
    return (
      <div className="grid gap-2 md:grid-cols-2">
        {items.map((it, i) => (it.kind === 'wand' ? <WandLink key={i} wand={it.wand} cost={it.cost} sale={it.sale} /> : null))}
      </div>
    );
  const row = (r: 'top' | 'bottom') =>
    items.flatMap((it, i) =>
      it.kind === 'spell' && it.row === r
        ? [
            <span key={i} className="inline-flex flex-col items-center gap-0.5">
              <SpellChip id={it.spell} />
              <span className={`text-[10px] tabular-nums ${it.sale ? 'text-ember' : 'text-faint'}`}>
                {Math.round(it.cost)}
                {it.sale ? ' sale' : ''}
              </span>
            </span>,
          ]
        : [],
    );
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">{row('top')}</div>
      <div className="flex flex-wrap gap-2">{row('bottom')}</div>
    </div>
  );
}

/** One Holy Mountain this seed: the perks it offers (tickable where `onPick` is given), what Gamble gave, its shop. */
export function MountainCard({ report, index: i, picks, onPick }: { report: SeedReport; index: number; picks?: string[][]; onPick?: (level: number, perk: string) => void }) {
  const offered = report.perks.mountains[i] ?? [];
  const shop = report.shops[i];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-game w-28 shrink-0 text-[16px] text-gold">Mountain {i + 1}</span>
        {offered.map((p, j) => (
          <PerkChip key={`${p}${j}`} id={p} taken={picks?.[i]?.includes(p)} onClick={onPick && (() => onPick(i, p))} />
        ))}
      </div>
      {(report.perks.gambles[i]?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          Gamble gave: {report.perks.gambles[i]!.map((p) => <PerkChip key={p} id={p} />)}
        </div>
      )}
      {shop && (
        <div className="mt-3">
          <div className="mb-1.5 text-xs text-muted">Shop: {shop.type === 'wand' ? 'wands' : 'spells'}</div>
          <ShopView items={shop.items} type={shop.type} />
        </div>
      )}
    </>
  );
}

function HolyMountains({ report, picks, onPick }: { report: SeedReport; picks: string[][]; onPick: (level: number, perk: string) => void }) {
  return (
    <Section title="Holy Mountains">
      <p className="mb-2 text-xs text-faint">Tick the perks you take: perks that don't stack leave the deck, and Extra Perk, Gamble, Extra Shop Item and No More Shuffle change what comes later.</p>
      <ol className="space-y-3">
        {report.perks.mountains.map((_, i) => (
          <li key={i} className="rounded-xl border border-line p-3">
            <MountainCard report={report} index={i} picks={picks} onPick={onPick} />
          </li>
        ))}
      </ol>
      {report.perks.rerolls.length > 0 && (
        <div className="mt-3 text-xs text-muted">
          <div className="mb-1">The first rerolls (they share one sequence, in whichever mountain you reroll):</div>
          <ol className="space-y-1">
            {report.perks.rerolls.map((set, i) => (
              <li key={i} className="flex flex-wrap items-center gap-1.5">
                <span className="w-6 text-faint">{i + 1}.</span>
                {set.map((p, j) => (
                  <PerkChip key={`${p}${j}`} id={p} />
                ))}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Section>
  );
}

export function MaterialName({ id }: { id: string }) {
  const { materialById } = useData();
  const { visible, reveal } = useSpoilers();
  const m = materialById.get(id);
  if (!m) return <span className="text-xs">{id}</span>;
  const hidden = SECRET_MATERIALS.has(id) && !visible(materialKey(id));
  return (
    <button
      onClick={() => hidden && reveal(materialKey(id))}
      className="inline-flex items-center gap-1.5 text-xs"
      title={hidden ? 'A secret material: tap to reveal it' : m.name}
    >
      <MaterialSwatch material={m as Material} size={14} hidden={hidden} />
      {hidden ? '???' : m.name}
    </button>
  );
}

function Fungal({ shifts }: { shifts: FungalShift[] }) {
  return (
    <Section title="Fungal shifts">
      <p className="mb-2 text-xs text-faint">
        In order, with no flask in hand. Holding a flask or pouch, its material takes one side most of the time (as marked). At most 20 shifts, 5 minutes apart.
      </p>
      <ol className="grid gap-1.5 md:grid-cols-2">
        {shifts.map((s, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-line px-2.5 py-1.5">
            <span className="w-5 text-xs text-faint tabular-nums">{i + 1}</span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {s.from.map((m) => (
                <MaterialName key={m} id={m} />
              ))}
            </span>
            <span className="text-faint">→</span>
            <MaterialName id={s.to} />
            {s.flask !== 'none' && (
              <span className="ml-auto text-[11px] text-ember" title={s.flask === 'to' ? `A flask of gold turns things into ${s.goldTo}, holy grass into ${s.grassHolyTo}` : undefined}>
                flask = {s.flask === 'from' ? 'what changes' : 'what it becomes'}
              </span>
            )}
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Modifiers({ report, map, vis, texts }: { report: SeedReport; map: WorldMap; vis: ReturnType<typeof makeVisibility> | null; texts: Record<string, string> }) {
  const byId = useMemo(() => new Map(map.biomes.map((b) => [b.id, b])), [map]);
  const text = (d: string) => texts[d.replace(/^\$/, '')] ?? d;
  // One card per place and modifier (the Pyramid's four parts are one); places you haven't found are only counted.
  const { entries, hidden } = useMemo(() => {
    const seen = new Map<string, { name: string; m: SeedReport['modifiers'][string] }>();
    const hidden = new Set<string>();
    for (const [id, m] of Object.entries(report.modifiers)) {
      const b = byId.get(id);
      const name = PART_OF[id] ?? (b ? biomeName(b) : id.replace(/_/g, ' '));
      if (b && vis && !vis.biome(b)) {
        hidden.add(name);
        continue;
      }
      if (!seen.has(`${name}|${m.id}`)) seen.set(`${name}|${m.id}`, { name, m });
    }
    return { entries: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)), hidden: hidden.size };
  }, [report, byId, vis]);
  return (
    <Section title="Biome modifiers">
      <p className="mb-2 text-xs text-faint">The main biomes roll one at a time each run (the Mines only once you've died 8 times); the overworld ones are always there. Tap an area on the map to see its own.</p>
      <ul className="grid gap-3 text-sm md:grid-cols-2">
        {entries.map(({ name, m }) => (
          <li key={`${name}|${m.id}`} className="slot p-2.5" title={text(m.description)}>
            <div className="mb-1 text-ink">{name}</div>
            <ModifierCard modifier={m} compact />
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="mt-2 text-xs text-faint">
          {hidden} more in place{hidden === 1 ? '' : 's'} you haven't found yet.
        </p>
      )}
    </Section>
  );
}

function Limits() {
  return (
    <div className="mt-5 flex gap-2 rounded-lg bg-surface-2 p-3 text-xs text-muted">
      <Info size={15} className="mt-0.5 shrink-0 text-faint" />
      <p>
        What this can't know: what happens during your run (perk rerolls you take, Perk Lottery, stealing, unlocks you earn mid-run, a flask you hold for a shift), New Game+ and
        parallel worlds, and mods. It runs the scripts of the game version this site was built from; the RNG and spell picks follow{' '}
        <a href="https://github.com/TwoAbove/noita-tools" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-gold hover:underline">
          noita-tools <ExternalLink size={11} />
        </a>
        ' port of the engine, and match its tested seeds.
      </p>
    </div>
  );
}
