import type { StateStorage } from 'zustand/middleware';

/**
 * The settings stores' key–value table, read with plain IndexedDB so the first page doesn't have to load Dexie
 * (db.ts, used by saved builds and save-folder handles, shares the same database and `kv` table).
 */
const NAME = 'noita-companion';
let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    // No version: open whatever version Dexie last upgraded it to.
    const req = indexedDB.open(NAME);
    req.onupgradeneeded = () => {
      // A brand-new database: make the table here; Dexie adds its others when it first opens.
      if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv', { keyPath: 'key' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Let Dexie upgrade the schema: step aside, and reopen next time.
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
  });
  return opening;
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction('kv', mode).objectStore('kv'));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** zustand persist storage backed by IndexedDB (survives storage pressure better than localStorage). */
export const idbStorage: StateStorage = {
  getItem: async (key) => ((await run<{ key: string; value: string } | undefined>('readonly', (s) => s.get(key))) ?? null)?.value ?? null,
  setItem: async (key, value) => {
    await run('readwrite', (s) => s.put({ key, value }));
  },
  removeItem: async (key) => {
    await run('readwrite', (s) => s.delete(key));
  },
};
