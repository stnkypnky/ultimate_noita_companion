import Dexie, { type EntityTable } from 'dexie';
import type { RunRecord } from '@/features/live/history';

export type SavedBuild = {
  id: string;
  name: string;
  /** Encoded wand (same format as share links). */
  code: string;
  createdAt: number;
  updatedAt: number;
};

type KV = { key: string; value: string };
/** File System Access handles can't be serialised to JSON, but IndexedDB stores them natively. */
type Handle = { key: string; handle: FileSystemDirectoryHandle };

/** A deleted build, remembered so paired devices delete it too instead of sending it back. */
export type BuildTombstone = { id: string; deletedAt: number };

class CompanionDB extends Dexie {
  kv!: EntityTable<KV, 'key'>;
  builds!: EntityTable<SavedBuild, 'id'>;
  handles!: EntityTable<Handle, 'key'>;
  tombstones!: EntityTable<BuildTombstone, 'id'>;
  /** Run history (features/live/history.ts), synced with paired devices. */
  runs!: EntityTable<RunRecord, 'id'>;
  constructor() {
    super('noita-companion');
    this.version(1).stores({ kv: 'key', builds: 'id, updatedAt, name' });
    this.version(2).stores({ handles: 'key' });
    this.version(3).stores({ tombstones: 'id' });
    this.version(4).stores({ runs: 'id, startedAt' });
  }
}

/** Saved builds and save-folder handles (the settings stores read `kv` directly, see kv.ts). */
export const db = new CompanionDB();

export async function putBuild(b: SavedBuild) {
  await db.transaction('rw', db.builds, db.tombstones, async () => {
    await db.tombstones.delete(b.id);
    await db.builds.put(b);
  });
}

export async function deleteBuild(id: string, at = Date.now()) {
  await db.transaction('rw', db.builds, db.tombstones, async () => {
    await db.builds.delete(id);
    await db.tombstones.put({ id, deletedAt: at });
  });
}
