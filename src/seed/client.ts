import type { SeedIn, SeedOut, SeedQuery, SeedReport } from './worker';
import type { AreaLayout } from './layout';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (r: SeedOut) => void>();

type Request = { query: SeedQuery } | { layoutSeed: number };

function send(req: Request): Promise<SeedOut & { ok: true }> {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<SeedOut>) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, (r) => (r.ok ? resolve(r) : reject(new Error(r.error))));
    worker!.postMessage({ id, base: import.meta.env.BASE_URL, ...req } as SeedIn);
  });
}

/** What the seed gives, computed in a worker (the first call also loads the game scripts). */
export const seedReport = (query: SeedQuery): Promise<SeedReport> => send({ query }).then((r) => r.report!);

/** The seed's cave layouts, one per cave-biome patch of the world map. */
export const seedLayouts = (seed: number): Promise<AreaLayout[]> => send({ layoutSeed: seed }).then((r) => r.layouts ?? []);
