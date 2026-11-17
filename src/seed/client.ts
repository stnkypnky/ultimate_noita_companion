import type { SeedIn, SeedOut, SeedQuery, SeedReport } from './worker';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (r: SeedOut) => void>();

/** What the seed gives, computed in a worker (the first call also loads the game scripts). */
export function seedReport(query: SeedQuery): Promise<SeedReport> {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<SeedOut>) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, (r) => (r.ok ? resolve(r.report) : reject(new Error(r.error))));
    worker!.postMessage({ id, base: import.meta.env.BASE_URL, query } satisfies SeedIn);
  });
}
