import type { SeedIn, SeedOut, SeedQuery, SeedReport, WandRoll } from './worker';
import type { AreaLayout } from './layout';
import type { ShopWand } from './seed';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (r: SeedOut) => void>();

type Request = { query: SeedQuery } | { layoutSeed: number } | { roll: WandRoll };

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
/**
 * A random wand of this tier, made by the game's own generate_gun with the cost and level its
 * wand_level_XX.lua passes (tier 10 is wand_level_10: cost 200, level 11).
 */
export const WAND_TIERS: Record<number, { cost: number; level: number }> = {
  1: { cost: 30, level: 1 },
  2: { cost: 40, level: 2 },
  3: { cost: 60, level: 3 },
  4: { cost: 80, level: 4 },
  5: { cost: 100, level: 5 },
  6: { cost: 120, level: 6 },
  10: { cost: 200, level: 11 },
};
export function rollWand(tier: number): Promise<ShopWand> {
  const t = WAND_TIERS[tier] ?? WAND_TIERS[1]!;
  const r = () => Math.floor(Math.random() * 2 ** 31);
  return send({ roll: { seed: r(), x: (r() % 70000) - 35000, y: (r() % 30000) - 2000, ...t } }).then((res) => res.wand!);
}

export const seedLayouts =(seed: number): Promise<AreaLayout[]> => send({ layoutSeed: seed }).then((r) => r.layouts ?? []);
