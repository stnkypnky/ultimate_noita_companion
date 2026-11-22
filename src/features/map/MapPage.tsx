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
import { MapView, POI_COLOR } from './MapView';
import { poiCentre, type MapPoi } from './pois';
import { MountainCard, SeedPanel } from './SeedPanel';
import { ModifierCard } from './ModifierCard';
import { areaNotes } from './notes';
import type { SeedReport } from '@/seed/worker';
import { useSeedLayers } from './useSeedLayers';
import { AreaItems } from './AreaItems';
import type { SeedItem } from '@/seed/items';
import { biomeKey, biomeName, chunkOf, chunkWorld, holyMountains, isCursedRock, loadMap, makeVisibility, namedInGame, onPath, orbOf, sceneKey } from './world';

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
  const { layouts, wangColors, pois, items } = useSeedLayers(caveSeed, map);
  const all = mode === 'all' || spoilers;
  const enemies = useProgress((s) => s.progress?.enemies);
  const vis = useMemo(() => (map ? makeVisibility(map, { all, visible, orbs: orbs ?? [], enemies }) : null), [map, all, visible, orbs, enemies]);
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
          detail={selected ? <AreaDetail map={map} vis={vis} cx={selected.cx} cy={selected.cy} orbs={orbs ?? []} onReveal={reveal} report={report} pois={pois} items={items} seed={caveSeed} onGo={select} /> : null}
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
                <MapView
                  map={map}
                  vis={vis}
                  materialById={materialById}
                  selected={selected}
                  onSelect={select}
                  layouts={layouts}
                  wangColors={wangColors}
                  pois={pois}
                  items={items}
                  // The example seed's caves have no report: its modifiers and mountains aren't offered.
                  report={seed === null ? undefined : report}
                  layersKey="map"
                />
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
                {layouts && !pois && '; placing points of interest…'}
              </p>
            </div>
          }
        />
      ) : null}
      {/* Kept mounted (just hidden) on the map tab, so the chosen seed's modifiers show in the area details. */}
      {map && (
        <div hidden={tab !== 'seed'}>
          <SeedPanel map={map} vis={vis} onReport={setReport} onSeed={setSeed} />
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
  pois,
  items,
  seed,
  onGo,
}: {
  map: WorldMap;
  vis: ReturnType<typeof makeVisibility>;
  cx: number;
  cy: number;
  orbs: number[];
  onReveal: (key: string) => void;
  report: SeedReport | null;
  pois: MapPoi[] | null;
  items: SeedItem[] | null;
  seed: number;
  onGo: (cx: number, cy: number) => void;
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
  const hidden = map.scenes.filter((s) => s.x < w.x + map.chunk && s.x + s.w > w.x && s.y < w.y + map.chunk && s.y + s.h > w.y && !vis.scene(s));
  const name = biomeName(b);
  // Filler (plain rock, open sky) gets no "off the path" line or wiki link: there's nothing more to know about it.
  const notable = namedInGame(b) || isCursedRock(b);
  const where = onPath(b) ? 'On the way down' : namedInGame(b) ? 'Off the main path' : '';
  return (
    <div>
      <h2 className="font-game text-[28px] leading-tight">{name}</h2>
      {(where || hm) && (
        <p className="mt-1 text-sm text-muted">
          {[where, hm ? `Holy Mountain ${hm}` : ''].filter(Boolean).join(' · ')}
        </p>
      )}
      <Section title="Where">
        <StatTable
          rows={[
            { label: 'World x', value: `${w.x} to ${w.x + map.chunk}` },
            { label: 'Depth (y)', value: `${w.y} to ${w.y + map.chunk}` },
            ...(namedInGame(b) ? [{ label: 'Size', value: `${chunks} chunk${chunks === 1 ? '' : 's'} of 512 × 512` }] : []),
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
      {report && hm !== undefined && report.perks.mountains[hm - 1] && (
        <Section title="This mountain">
          <MountainCard report={report} index={hm - 1} />
          <p className="mt-2 text-[11px] text-faint">Perks you tick on the Seed tab change the mountains after it.</p>
        </Section>
      )}
      {report && (report.modifiers[b.id] || namedInGame(b)) && (
        <Section title="This seed">
          {report.modifiers[b.id] ? (
            <ModifierCard modifier={report.modifiers[b.id]!} flavour={texts[report.modifiers[b.id]!.description.replace(/^\$/, '')]} />
          ) : (
            <p className="text-sm text-muted">No biome modifier.</p>
          )}
        </Section>
      )}
      <AreaPois map={map} vis={vis} biome={map.cells[cy * map.w + cx]!} chunk={{ cx, cy }} pois={pois} seed={seed} onGo={onGo} />
      <AreaItems map={map} vis={vis} biome={map.cells[cy * map.w + cx]!} chunk={{ cx, cy }} items={items} onGo={onGo} />
      {hidden.length > 0 && (
        <button
          onClick={() => hidden.forEach((s) => onReveal(sceneKey(s)))}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line-strong px-2.5 py-1 text-xs text-muted hover:text-ink"
        >
          <EyeOff size={13} /> {hidden.length} hidden thing{hidden.length === 1 ? '' : 's'} here: reveal
        </button>
      )}
      {notable && (
        <a
          href={`https://noita.wiki.gg/index.php?search=${encodeURIComponent(name)}`}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex items-center gap-1.5 text-sm text-gold hover:underline"
        >
          Look it up on the wiki <ExternalLink size={13} />
        </a>
      )}
    </div>
  );
}

/** Where a portal leads: the area there (unless it's still a spoiler), a tap away. */
function PortalTo({ map, vis, to, onGo }: { map: WorldMap; vis: ReturnType<typeof makeVisibility>; to: { x: number; y: number }; onGo: (cx: number, cy: number) => void }) {
  const { cx, cy } = chunkOf(map, to.x, to.y);
  const b = cx >= 0 && cy >= 0 && cx < map.w && cy < map.h ? map.biomes[map.cells[cy * map.w + cx]!]! : null;
  if (!b) return <p className="mt-0.5 text-xs text-muted">Leads off the map (a parallel world).</p>;
  return (
    <p className="mt-0.5 text-xs text-muted">
      Leads to{' '}
      <button onClick={() => onGo(cx, cy)} className="text-gold hover:underline">
        {vis.biome(b) ? biomeName(b) : 'somewhere still hidden'}
      </button>
    </p>
  );
}

/**
 * Points of interest in this biome: the ones in the tapped chunk first, then the rest of the biome by depth.
 * The seed's rooms are where its scripts put them; tapping one moves the selection to its chunk.
 */
function AreaPois({
  map,
  vis,
  biome,
  chunk,
  pois,
  seed,
  onGo,
}: {
  map: WorldMap;
  vis: ReturnType<typeof makeVisibility>;
  biome: number;
  chunk: { cx: number; cy: number };
  pois: MapPoi[] | null;
  seed: number;
  onGo: (cx: number, cy: number) => void;
}) {
  const where = (p: MapPoi) => {
    const c = poiCentre(p);
    return { cx: Math.floor(c.x / map.chunk + map.w / 2), cy: Math.floor(c.y / map.chunk + map.offsetY) };
  };
  // Areas of the same name count together (a biome can be split into several patches with the same rooms).
  const name = biomeName(map.biomes[biome]!);
  const mine = (pois ?? [])
    .map((p) => ({ p, at: where(p) }))
    .filter(({ p, at }) => {
      const k = map.cells[at.cy * map.w + at.cx];
      if (k === undefined || at.cx < 0 || at.cx >= map.w) return false;
      const b = map.biomes[k]!;
      return (k === biome || (name && biomeName(b) === name)) && vis.biome(b) && (!p.scene || vis.scene(p.scene));
    })
    .sort((a, b) => Number(b.at.cx === chunk.cx && b.at.cy === chunk.cy) - Number(a.at.cx === chunk.cx && a.at.cy === chunk.cy) || a.p.y - b.p.y)
    // A Holy Mountain row has a portal in every chunk: one of each kind is enough beyond the tapped chunk.
    .filter(({ p, at }, i, all) => p.kind !== 'portal' || (at.cx === chunk.cx && at.cy === chunk.cy) || all.findIndex((o) => o.p.kind === 'portal' && o.p.name === p.name) === i);
  if (!pois) return <p className="mt-5 text-xs text-faint">Placing this seed's points of interest…</p>;
  if (!mine.length) return null;
  return (
    <Section title="Points of interest">
      <ul className="space-y-1.5">
        {mine.map(({ p, at }) => {
          const here = at.cx === chunk.cx && at.cy === chunk.cy;
          return (
            <li key={p.id} className={`slot p-2.5 ${here ? 'ring-1 ring-gold/50' : ''}`}>
              <div className="flex items-start gap-2">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rotate-45" style={{ background: POI_COLOR[p.kind] }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <button onClick={() => onGo(at.cx, at.cy)} className="text-left text-sm text-ink hover:text-gold">
                    {p.name}
                    {here && <span className="ml-2 text-[11px] text-gold">here</span>}
                  </button>
                  {p.text && <p className="mt-0.5 text-xs text-muted">{p.text}</p>}
                  {p.to && <PortalTo map={map} vis={vis} to={p.to} onGo={onGo} />}
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-faint">
                    <span className="font-mono">
                      x {Math.round(p.x + p.w / 2)}, y {Math.round(p.y + p.h / 2)}
                    </span>
                    {p.fixed ? <span>always here</span> : <span>seed {seed}</span>}
                    {p.wiki && (
                      <a href={p.wiki} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-gold hover:underline">
                        wiki <ExternalLink size={10} />
                      </a>
                    )}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-faint">In New Game+ these differ.</p>
    </Section>
  );
}
