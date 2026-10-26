import { create } from 'zustand';
import type { Enemy, GameData, GameVersion, Item, Material, Perk, Projectile, Reaction, Spell } from './types';

type Status = 'loading' | 'ready' | 'missing';

export type Indexed = GameData & {
  version: GameVersion;
  spellById: Map<string, Spell>;
  perkById: Map<string, Perk>;
  materialById: Map<string, Material>;
  enemyById: Map<string, Enemy>;
  /** Reactions each material (or tag) takes part in, as input or output. */
  reactionsByMaterial: Map<string, Reaction[]>;
};

type GameDataState = {
  status: Status;
  /** Share of the game data files fetched so far, 0..1 (drives the splash mana bar). */
  progress: number;
  error?: string;
  data: Indexed | null;
  version: GameVersion | null;
  load: () => Promise<void>;
};

export const gameUrl = (path: string) => `${import.meta.env.BASE_URL}game/${path}`;

export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(gameUrl(path));
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

function index(version: GameVersion, d: GameData): Indexed {
  const reactionsByMaterial = new Map<string, Reaction[]>();
  const add = (k: string, r: Reaction) => {
    const list = reactionsByMaterial.get(k) ?? [];
    if (!list.includes(r)) list.push(r);
    reactionsByMaterial.set(k, list);
  };
  for (const r of d.reactions) for (const m of [...r.inputs, ...r.outputs]) add(m, r);
  return {
    ...d,
    version,
    spellById: new Map(d.spells.map((s) => [s.id, s])),
    perkById: new Map(d.perks.map((p) => [p.id, p])),
    materialById: new Map(d.materials.map((m) => [m.id, m])),
    enemyById: new Map(d.enemies.map((e) => [e.id, e])),
    reactionsByMaterial,
  };
}

export const useGameData = create<GameDataState>((set, get) => ({
  status: 'loading',
  progress: 0,
  data: null,
  version: null,
  load: async () => {
    if (get().data) return;
    const FILES = 9;
    let done = 0;
    const counted = async <T>(path: string) => {
      const v = await fetchJson<T>(path);
      set({ progress: ++done / FILES });
      return v;
    };
    try {
      const version = await counted<GameVersion>('version.json');
      const [spells, projectiles, perks, enemies, items, materials, reactions, defaultState] = await Promise.all([
        counted<Spell[]>('data/spells.json'),
        counted<Record<string, Projectile>>('data/projectiles.json'),
        counted<Perk[]>('data/perks.json'),
        counted<Enemy[]>('data/enemies.json'),
        counted<Item[]>('data/items.json'),
        counted<Material[]>('data/materials.json'),
        counted<Reaction[]>('data/reactions.json'),
        counted<GameData['defaultState']>('data/default_state.json'),
      ]);
      set({ status: 'ready', version, data: index(version, { spells, projectiles, perks, enemies, items, materials, reactions, defaultState }) });
    } catch (e) {
      set({ status: 'missing', error: String(e) });
    }
  },
}));

/** Game data for components rendered after the splash (data is guaranteed loaded or the app shows an error). */
export function useData(): Indexed {
  const data = useGameData((s) => s.data);
  if (!data) throw new Error('Game data not loaded');
  return data;
}
