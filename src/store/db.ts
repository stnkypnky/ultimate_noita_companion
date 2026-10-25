import Dexie, { type EntityTable } from 'dexie';
import type { StateStorage } from 'zustand/middleware';

export type SavedBuild = {
  id: string;
  name: string;
  /** Encoded wand (same format as share links). */
  code: string;
  createdAt: number;
  updatedAt: number;
};

type KV = { key: string; value: string };

class CompanionDB extends Dexie {
  kv!: EntityTable<KV, 'key'>;
  builds!: EntityTable<SavedBuild, 'id'>;
  constructor() {
    super('noita-companion');
    this.version(1).stores({ kv: 'key', builds: 'id, updatedAt, name' });
  }
}

export const db = new CompanionDB();

/** zustand persist storage backed by IndexedDB (survives storage pressure better than localStorage). */
export const idbStorage: StateStorage = {
  getItem: async (key) => (await db.kv.get(key))?.value ?? null,
  setItem: async (key, value) => {
    await db.kv.put({ key, value });
  },
  removeItem: async (key) => {
    await db.kv.delete(key);
  },
};
