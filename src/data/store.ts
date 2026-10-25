import { create } from 'zustand';
import type { GameVersion } from './types';

type Status = 'loading' | 'ready' | 'missing';

type GameDataState = {
  status: Status;
  version: GameVersion | null;
  load: () => Promise<void>;
};

export const gameUrl = (path: string) => `${import.meta.env.BASE_URL}game/${path}`;

export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(gameUrl(path));
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

export const useGameData = create<GameDataState>((set, get) => ({
  status: 'loading',
  version: null,
  load: async () => {
    if (get().version) return;
    try {
      const version = await fetchJson<GameVersion>('version.json');
      set({ status: 'ready', version });
    } catch {
      // No extracted data yet — the app shell still works.
      set({ status: 'missing' });
    }
  },
}));
