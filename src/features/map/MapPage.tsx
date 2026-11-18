import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ExternalLink, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { fetchJson, useData } from '@/data/store';
import type { WorldMap } from '@/data/types';
import { useProgress, useSpoilers } from '@/store/progress';
import { Page } from '@/ui/Page';
import { Chip, Section, StatTable } from '@/ui/controls';
import { HiddenNotice } from '@/ui/Spoiler';
import { MasterDetail } from '@/ui/MasterDetail';
import { Runes } from '@/ui/game';
import { MapView } from './MapView';
import { SeedPanel } from './SeedPanel';
import { areaNotes } from './notes';
import type { SeedReport } from '@/seed/worker';
import { useSeedLayers } from './useSeedLayers';
import { biomeKey, biomeName, chunkWorld, holyMountains, loadMap, makeVisibility, namedInGame, onPath, orbOf, sceneKey } from './world';

/** Whose caves the map shows before you pick a seed. */
const EXAMPLE_SEED = 123;

const remembered = () => {
  try {
    return localStorage.getItem('map-spoilers') === '1';
  } catch {
    return false;
  }
};

/** /map/12-20 → chunk 12, 20. */
const parsePlace = (p: string | undefined) => {
  const m = p && /^(\d+)-(\d+)$/.exec(p);
  return m ? { cx: Number(m[1]), cy: Number(m[2]) } : null;
};

const humanize = (s: string) => s.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** /map?seed=123 (from the Run page) opens that seed: SeedPanel starts from the remembered seed. */
const adoptSeedFromUrl = () => {
  const s = new URLSearchParams(location.search).get('seed');
  if (!s || !/^\d{1,10}$/.test(s)) return;
  try {
    localStorage.setItem('map-seed', s);
  } catch {
    /* not remembered */
  }
};

export function MapPage() {
  useState(adoptSeedFromUrl);
  const { materialById } = useData();
  const [map, setMap] = useState<WorldMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { place } = useParams();
  const navigate = useNavigate();
  const { mode, visible, reveal } = useSpoilers();
  const orbs = useProgress((s) => s.progress?.orbs);
  const [spoilers, setSpoilers] = useState(remembered);

  useEffect(() => {
    loadMap().then(setMap, (e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('map-spoilers', spoilers ? '1' : '0');
    } catch {
      /* not remembered */
    }
  }, [spoilers]);

  const [report, setReport] = useState<SeedReport | null>(null);
  // The caves are drawn for the chosen seed; until one is chosen, for an example seed.
  const [seed, setSeed] = useState<number | null>(null);
  const caveSeed = seed ?? EXAMPLE_SEED;
  const { layouts, wangColors } = useSeedLayers(caveSeed);
  const all = mode === 'all' || spoilers;
  const vis = useMemo(() => (map ? makeVisibility(map, { all, visible, orbs: orbs ?? [] }) : null), [map, all, visible, orbs]);
  const selected = parsePlace(place);
  const close = useCallback(() => navigate('/map'), [navigate]);
  const select = useCallback((cx: number, cy: number) => navigate(`/map/${cx}-${cy}`), [navigate]);

  const [tab, setTab] = useState<'map' | 'seed'>(() => (location.hash === '#seed' ? 'seed' : 'map'));
  const revealedCount = useProgress((s) => s.revealed.length);
  // Everything back under wraps: the page's switch off, and every item revealed one at a time hidden again.
  const hideAll = () => {
    setSpoilers(false);
    useProgress.getState().hideAll();
  };

  return (
    <Page
      wide
      title="World map"
      subtitle={tab === 'map' ? 'The main world as the game lays it out. Tap an area for details.' : 'What a world seed gives, from the game’s own scripts.'}
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-2" role="tablist" aria-label="World map views">
            {(
              [
                ['map', 'Map'],
                ['seed', 'Seed: perks, shops, shifts'],
              ] as const
            ).map(([id, label]) => (
              <Chip key={id} active={tab === id} onClick={() => setTab(id)}>
                {label}
              </Chip>
            ))}
          </div>
          {mode !== 'all' ? (
          <div className="ml-auto flex flex-wrap justify-end gap-2">
            {(spoilers || revealedCount > 0) && (
              <button
                onClick={hideAll}
                title={`Hide the map's spoilers and re-hide ${revealedCount} item${revealedCount === 1 ? '' : 's'} you revealed one at a time (anywhere in the app)`}
                className="slot slot-hover inline-flex h-9 shrink-0 items-center gap-2 px-3 text-sm text-muted hover:text-ink"
              >
                <RotateCcw size={14} /> Hide all again
              </button>
            )}
            <button
              onClick={() => setSpoilers(!spoilers)}
              aria-pressed={spoilers}
              className={`slot slot-hover font-game inline-flex h-9 shrink-0 items-center gap-2 px-3 text-[16px] ${spoilers ? 'text-ember' : 'text-muted hover:text-ink'}`}
            >
              {spoilers ? <Eye size={15} /> : <EyeOff size={15} />} {spoilers ? 'Spoilers shown' : 'Show spoilers'}
            </button>
          </div>
        ) : (
          <Link to="/settings" className="ml-auto text-xs text-muted hover:text-ink" title="Spoiler protection is off for the whole app; turn it back on in Settings">
            Spoilers: all shown (Settings)
          </Link>
          )}
        </div>
      }
    >
      {tab === 'map' && (!map || !vis) ? (
        <p className="py-24 text-center text-sm text-muted">{error ? `Couldn't load the map: ${error}` : 'Loading the map…'}</p>
      ) : tab === 'map' && map && vis ? (
        <MasterDetail
          detailKey={place}
          onClose={close}
          detail={selected ? <AreaDetail map={map} vis={vis} cx={selected.cx} cy={selected.cy} orbs={orbs ?? []} onReveal={reveal} report={report} /> : null}
          empty={
            <div className="mt-24 text-center text-sm text-faint">
              <Runes className="mb-2 block text-[16px] text-gold/40">the world below</Runes>
              Tap an area of the map to see what it is.
              {!all && <p className="mt-3 text-xs">Dark areas marked ? are spoilers: tap one to reveal it.</p>}
            </div>
          }
          list={
            // Phones: tall, to pan and zoom in. Laptops: the world's own shape (70 × 48 chunks), up to the screen's height.
            <div>
              <div className="h-[calc(100dvh-var(--page-header-h,88px)-140px)] md:aspect-[70/48] md:h-auto md:max-h-[calc(100vh-var(--page-header-h,88px)-60px)]">
                <MapView map={map} vis={vis} materialById={materialById} selected={selected} onSelect={select} layouts={layouts} wangColors={wangColors} />
              </div>
              <p className="mt-1.5 text-xs text-faint">
                {layouts ? `Caves laid out as in seed ${caveSeed}` : 'Laying out the caves…'}
                {seed === null && (
                  <>
                    {' '}
                    (an example:{' '}
                    <button className="text-gold hover:underline" onClick={() => setTab('seed')}>
                      enter your seed
                    </button>
                    )
                  </>
                )}
                . Each pixel of a cave is 10 × 10 in the game; spawns, items and enemies aren't drawn.
              </p>
            </div>
          }
        />
      ) : null}
      {/* Kept mounted (just hidden) on the map tab, so the chosen seed's modifiers show in the area details. */}
      {map && (
        <div hidden={tab !== 'seed'}>
          <SeedPanel map={map} onReport={setReport} onSeed={setSeed} />
        </div>
      )}
    </Page>
  );
}

function AreaDetail({
  map,
  vis,
  cx,
  cy,
  orbs,
  onReveal,
  report,
}: {
  map: WorldMap;
  vis: ReturnType<typeof makeVisibility>;
  cx: number;
  cy: number;
  orbs: number[];
  onReveal: (key: string) => void;
  report: SeedReport | null;
}) {
  const [texts, setTexts] = useState<Record<string, string>>({});
  useEffect(() => {
    void fetchJson<Record<string, string>>('data/seed_strings.json').then(setTexts, () => {});
  }, []);
  if (cx >= map.w || cy >= map.h) return null;
  const b = map.biomes[map.cells[cy * map.w + cx]!]!;
  if (!vis.biome(b)) return <HiddenNotice what="area" onReveal={() => onReveal(biomeKey(b))} />;
  const w = chunkWorld(map, cx, cy);
  const hm = b.id.startsWith('temple_') || b.id === 'solid_wall_temple' ? holyMountains(map).get(cy) : undefined;
  const orb = orbOf(b);
  const chunks = map.cells.filter((k) => map.biomes[k] === b).length;
  const inside = map.scenes.filter((s) => s.x < w.x + map.chunk && s.x + s.w > w.x && s.y < w.y + map.chunk && s.y + s.h > w.y);
  const hidden = inside.filter((s) => !vis.scene(s));
  const name = biomeName(b);
  return (
    <div>
      <h2 className="font-game text-[28px] leading-tight">{name}</h2>
      <p className="mt-1 text-sm text-muted">
        {onPath(b) ? 'On the way down' : namedInGame(b) ? 'Off the main path' : 'Unnamed in the game'}
        {hm ? ` · Holy Mountain ${hm}` : ''}
      </p>
      <Section title="Where">
        <StatTable
          rows={[
            { label: 'World x', value: `${w.x} to ${w.x + map.chunk}` },
            { label: 'Depth (y)', value: `${w.y} to ${w.y + map.chunk}` },
            { label: 'Size', value: `${chunks} chunk${chunks === 1 ? '' : 's'} of 512 × 512` },
            ...(orb !== null ? [{ label: 'Orb', value: `Orb ${orb}${orbs.includes(orb) ? ' · collected' : ''}` }] : []),
          ]}
        />
      </Section>
      {areaNotes(b, cx, map.w).length > 0 && (
        <Section title="Good to know">
          <ul className="space-y-2 text-sm text-muted">
            {areaNotes(b, cx, map.w).map((n, i) => (
              <li key={i}>
                {n.text}{' '}
                <a href={n.source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-xs text-gold hover:underline">
                  wiki <ExternalLink size={11} />
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {report && (
        <Section title="This seed">
          <p className="text-sm text-muted">
            {report.modifiers[b.id] ? (texts[report.modifiers[b.id]!.description.replace(/^\$/, '')] ?? report.modifiers[b.id]!.id) : 'No biome modifier.'}
          </p>
        </Section>
      )}
      {inside.length > 0 && (
        <Section title="Here">
          <ul className="space-y-1 text-sm">
            {inside
              .filter((s) => vis.scene(s))
              .map((s, i) => (
                <li key={i} className="text-ink">
                  {humanize(s.from === 'biome' ? s.file.split('/').pop()!.replace(/\.png$/, '') : s.from === 'pixel_scenes' || s.from === 'background_images' ? s.id : s.from)}
                </li>
              ))}
            {hidden.length > 0 && (
              <li>
                <button onClick={() => hidden.forEach((s) => onReveal(sceneKey(s)))} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line-strong px-2.5 py-1 text-xs text-muted hover:text-ink">
                  <EyeOff size={13} /> {hidden.length} hidden thing{hidden.length === 1 ? '' : 's'} here: reveal
                </button>
              </li>
            )}
          </ul>
        </Section>
      )}
      <a
        href={`https://noita.wiki.gg/index.php?search=${encodeURIComponent(name)}`}
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-flex items-center gap-1.5 text-sm text-gold hover:underline"
      >
        Look it up on the wiki <ExternalLink size={13} />
      </a>
      <p className="mt-6 text-xs text-faint">
        Biome from <code>{b.file || 'biome_map.png'}</code>. The world repeats to each side as parallel worlds; New Game+ uses a different map.
      </p>
    </div>
  );
}
