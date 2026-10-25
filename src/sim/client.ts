import type { LiveCast, SimRequest, SimResult } from './types';
import type { WorkerIn, WorkerOut } from './worker';

/** A simulation that takes longer than this is assumed stuck (e.g. a pathological recursion) and the worker is restarted. */
const TIMEOUT_MS = 4000;

type Message = WorkerIn extends infer M ? (M extends WorkerIn ? Omit<M, 'id'> : never) : never;

export class SimTimeout extends Error {
  constructor() {
    super('The simulation took too long and was stopped.');
  }
}

/** One Lua engine in its own Web Worker. */
class SimWorker {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, (r: WorkerOut) => void>();

  start(): Promise<void> {
    if (!this.worker) {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<WorkerOut>) => {
        this.pending.get(e.data.id)?.(e.data);
        this.pending.delete(e.data.id);
      };
      this.ready = this.post({ type: 'init', base: import.meta.env.BASE_URL }).then(() => {});
    }
    return this.ready!;
  }

  /** Send a message and wait for the reply; a timeout restarts the worker. */
  async send(msg: Message, timeout = TIMEOUT_MS): Promise<WorkerOut & { ok: true }> {
    await this.start();
    try {
      return await this.post(msg, timeout);
    } catch (e) {
      if (e instanceof SimTimeout) this.stop();
      throw e;
    }
  }

  stop() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    this.pending.clear();
  }

  private post(msg: Message, timeout = 30000): Promise<WorkerOut & { ok: true }> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        reject(new SimTimeout());
      }, timeout);
      this.pending.set(id, (r) => {
        clearTimeout(t);
        if (r.ok) resolve(r);
        else reject(new Error(r.error));
      });
      this.worker!.postMessage({ ...msg, id } as WorkerIn);
    });
  }
}

const shared = new SimWorker();

/** Start loading the Lua engine and game scripts in the background. */
export function warmUpSimulator(): Promise<void> {
  return shared.start();
}

export async function simulate(req: SimRequest): Promise<SimResult> {
  return (await shared.send({ type: 'run', req })).result!;
}

/**
 * A wand being played live: its own engine (so Casts-tab simulations can't disturb it) whose deck,
 * charges and recharge state carry over from one trigger pull to the next, like the wand in your hands.
 */
export class LiveSession {
  private w = new SimWorker();

  /** Equip a wand (also what swapping wands does in-game: the deck starts over). */
  async reset(req: SimRequest): Promise<void> {
    await this.w.send({ type: 'live:reset', req });
  }

  async cast(frame: number, mana: number): Promise<LiveCast> {
    return (await this.w.send({ type: 'live:cast', frame, mana })).live!;
  }

  dispose() {
    this.w.stop();
  }
}
