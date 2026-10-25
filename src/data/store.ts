import { create } from 'zustand';
import type { Enemy, GameData, GameVersion, Item, Material, Perk, Projectile, Reaction, Spell } from './types';

type Status = 'loading' | 'ready' | 'missing';

export type Indexed = GameData & {
  version: GameVersion;
  spellById: Map<string, Spell>;
  perkById: Map<string, Perk>;
  materialById: Map<string, Material>;
  /** Reactions each material (or tag) takes part in, as input or output. */
  reactionsByMaterial: Map<string, Reaction[]>;
};

type GameDataState = {
  status: Status;
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
    reactionsByMaterial,
  };
}

export const useGameData = create<GameDataState>((set, get) => ({
  status: 'loading',
  data: null,
  version: null,
  load: async () => {
    if (get().data) return;
    try {
      const version = await fetchJson<GameVersion>('version.json');
      const [spells, projectiles, perks, enemies, items, materials, reactions, defaultState] = await Promise.all([
        fetchJson<Spell[]>('data/spells.json'),
        fetchJson<Record<string, Projectile>>('data/projectiles.json'),
        fetchJson<Perk[]>('data/perks.json'),
        fetchJson<Enemy[]>('data/enemies.json'),
        fetchJson<Item[]>('data/items.json'),
        fetchJson<Material[]>('data/materials.json'),
        fetchJson<Reaction[]>('data/reactions.json'),
        fetchJson<GameData['defaultState']>('data/default_state.json'),
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
