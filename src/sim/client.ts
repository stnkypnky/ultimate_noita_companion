import type { SimRequest, SimResult } from './types';
import type { WorkerIn, WorkerOut } from './worker';

/** A simulation that takes longer than this is assumed stuck (e.g. a pathological recursion) and the worker is restarted. */
const TIMEOUT_MS = 4000;

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: WorkerOut) => void }>();

function spawn() {
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<WorkerOut>) => {
    pending.get(e.data.id)?.resolve(e.data);
    pending.delete(e.data.id);
  };
  ready = send({ type: 'init', base: import.meta.env.BASE_URL }).then((r) => {
    if (!r.ok) throw new Error(r.error);
  });
}

type Message = WorkerIn extends infer M ? (M extends WorkerIn ? Omit<M, 'id'> : never) : never;

function send(msg: Message, timeout = 30000): Promise<WorkerOut> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      pending.delete(id);
      reject(new SimTimeout());
    }, timeout);
    pending.set(id, {
      resolve: (r) => {
        clearTimeout(t);
        resolve(r);
      },
    });
    worker!.postMessage({ ...msg, id } as WorkerIn);
  });
}

export class SimTimeout extends Error {
  constructor() {
    super('The simulation took too long and was stopped.');
  }
}

/** Start loading the Lua engine and game scripts in the background. */
export function warmUpSimulator(): Promise<void> {
  if (!worker) spawn();
  return ready!;
}

export async function simulate(req: SimRequest): Promise<SimResult> {
  await warmUpSimulator();
  try {
    const r = await send({ type: 'run', req }, TIMEOUT_MS);
    if (!r.ok) throw new Error(r.error);
    return r.result!;
  } catch (e) {
    if (e instanceof SimTimeout) {
      worker?.terminate();
      worker = null;
      ready = null;
    }
    throw e;
  }
}
