import Dexie, { type EntityTable } from 'dexie';

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

class CompanionDB extends Dexie {
  kv!: EntityTable<KV, 'key'>;
  builds!: EntityTable<SavedBuild, 'id'>;
  handles!: EntityTable<Handle, 'key'>;
  constructor() {
    super('noita-companion');
    this.version(1).stores({ kv: 'key', builds: 'id, updatedAt, name' });
    this.version(2).stores({ handles: 'key' });
  }
}

/** Saved builds and save-folder handles (the settings stores read `kv` directly, see kv.ts). */
export const db = new CompanionDB();
