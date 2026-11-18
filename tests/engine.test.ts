import { describe, expect, it } from 'vitest';
import { buildTime, startEngine, type BuildRecord, type Kind, type SettingsLog, type SyncAdapter } from '../src/features/sync/engine.ts';
import { memoryHub } from '../src/features/sync/transport.ts';
import { mergeRevealLogs, type RevealLog } from '../src/store/progress.ts';

/** A device's state, held in memory, behind the same adapter interface the app uses. */
function device(init: { save?: { code: string; at: number }; reveals?: RevealLog; settings?: SettingsLog; builds?: BuildRecord[] } = {}) {
  const s = {
    save: init.save ?? null,
    reveals: init.reveals ?? {},
    settings: init.settings ?? {},
    builds: new Map((init.builds ?? []).map((b) => [b.id, b])),
    live: null as { run: unknown; at: number; from?: string } | null,
  };
  const subs = new Set<(k: Kind) => void>();
  const changed = (k: Kind) => subs.forEach((f) => f(k));
  const adapter: SyncAdapter = {
    progress: {
      time: () => s.save?.at ?? 0,
      encode: async () => s.save?.code ?? null,
      apply: async (code, at) => {
        if (at > (s.save?.at ?? 0)) {
          s.save = { code, at };
          changed('progress');
        }
      },
    },
    reveals: {
      get: () => s.reveals,
      apply: (log) => {
        const m = mergeRevealLogs(s.reveals, log);
        if (m !== s.reveals) {
          s.reveals = m;
          changed('reveals');
        }
      },
    },
    settings: {
      get: () => s.settings,
      apply: (log) => {
        let any = false;
        for (const [k, e] of Object.entries(log))
          if (!s.settings[k] || s.settings[k]!.t < e.t) {
            s.settings = { ...s.settings, [k]: e };
            any = true;
          }
        if (any) changed('settings');
      },
    },
    builds: {
      all: async () => [...s.builds.values()],
      apply: async (recs) => {
        let any = false;
        for (const r of recs) {
          const mine = s.builds.get(r.id);
          if (!mine || buildTime(r) > buildTime(mine)) {
            s.builds.set(r.id, r);
            any = true;
          }
        }
        if (any) changed('builds');
      },
    },
    live: { get: () => s.live, apply: (run, at, from) => (s.live = { run, at, from }) },
    watch: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
  return { s, adapter, changed };
}

const settle = () => new Promise((r) => setTimeout(r, 20));
const build = (id: string, t: number, name = id): BuildRecord => ({ id, name, code: `code-${id}-${t}`, createdAt: 1, updatedAt: t });

describe('device sync engine', () => {
  it('converges on meeting: newest save, merged reveals, settings and builds', async () => {
    const hub = memoryHub();
    const pc = device({
      save: { code: 'pc-save', at: 200 },
      reveals: { a: { on: true, t: 5 } },
      settings: { 'wand-view': { value: 'preview', t: 10 } },
      builds: [build('x', 50), { id: 'gone', deletedAt: 70 }],
    });
    const phone = device({
      save: { code: 'old-save', at: 100 },
      reveals: { a: { on: false, t: 9 }, b: { on: true, t: 3 } },
      settings: { 'wand-view': { value: 'casts', t: 5 }, 'range-biome': { value: 'mines', t: 7 } },
      builds: [build('x', 40, 'renamed'), build('gone', 60), build('y', 30)],
    });
    startEngine(hub.connect(), pc.adapter, { id: 'pc', name: 'PC' });
    startEngine(hub.connect(), phone.adapter, { id: 'phone', name: 'Phone' });
    await settle();

    for (const d of [pc, phone]) {
      expect(d.s.save).toEqual({ code: 'pc-save', at: 200 });
      expect(d.s.reveals).toEqual({ a: { on: false, t: 9 }, b: { on: true, t: 3 } });
      expect(d.s.settings).toEqual({ 'wand-view': { value: 'preview', t: 10 }, 'range-biome': { value: 'mines', t: 7 } });
      expect(d.s.builds.get('x')).toMatchObject({ updatedAt: 50, name: 'x' });
      expect(d.s.builds.get('gone')).toEqual({ id: 'gone', deletedAt: 70 });
      expect(d.s.builds.get('y')).toMatchObject({ updatedAt: 30 });
    }
  });

  it('pushes live changes, and relays through a device in the middle', async () => {
    const hub = memoryHub();
    const pc = device({ save: { code: 's1', at: 1 } });
    const phone = device();
    const tablet = device();
    const pcEngine = startEngine(hub.connect(), pc.adapter, { id: 'pc', name: 'PC' });
    const phoneEngine = startEngine(hub.connect(), phone.adapter, { id: 'phone', name: 'Phone' });
    await settle();
    expect(phone.s.save?.code).toBe('s1');

    pc.s.save = { code: 's2', at: 2 };
    pc.changed('progress');
    pc.s.live = { run: { hp: 50 }, at: 9 };
    pc.changed('live');
    await settle();
    expect(phone.s.save?.code).toBe('s2');
    expect(phone.s.live).toEqual({ run: { hp: 50 }, at: 9, from: 'PC' });

    // The PC goes away; a tablet joins later and still gets the save from the phone.
    pcEngine.stop();
    await settle();
    expect(phoneEngine.peers()).toEqual([]);
    const tabletEngine = startEngine(hub.connect(), tablet.adapter, { id: 'tablet', name: 'Tablet' });
    await settle();
    expect(tablet.s.save?.code).toBe('s2');
    expect(tabletEngine.peers().map((p) => p.name)).toEqual(['Phone']);

    tablet.s.builds.set('b', build('b', 5));
    tablet.changed('builds');
    await settle();
    expect(phone.s.builds.has('b')).toBe(true);
    expect(pc.s.builds.has('b')).toBe(false);
  });

  it('ignores an older save and malformed or oversized messages', async () => {
    const hub = memoryHub();
    const phone = device({ save: { code: 'new', at: 500 }, reveals: { a: { on: true, t: 1 } } });
    startEngine(hub.connect(), phone.adapter, { id: 'phone', name: 'Phone' });
    const evil = hub.connect();
    const got: unknown[] = [];
    evil.onMessage((m) => got.push(m));
    await settle();
    evil.send({ k: 'progress', code: 'old', at: 100 });
    evil.send({ k: 'progress', code: 'x'.repeat(70000), at: 900 });
    evil.send({ k: 'reveals', log: { a: { on: 'nope', t: 99 } } });
    evil.send({ k: 'builds', recs: [{ id: 'z', name: 5, code: '', createdAt: 0, updatedAt: 0 }] });
    evil.send({ k: 'hello', v: 1, id: 'e', name: 'E', d: { p: 'nope' } });
    evil.send('garbage');
    await settle();
    expect(phone.s.save).toEqual({ code: 'new', at: 500 });
    expect(phone.s.reveals).toEqual({ a: { on: true, t: 1 } });
    expect(phone.s.builds.size).toBe(0);
  });

  it('ignores its own hello (another tab of the same device)', async () => {
    const hub = memoryHub();
    const a = device({ save: { code: 'a', at: 1 } });
    const b = device();
    const e1 = startEngine(hub.connect(), a.adapter, { id: 'same', name: 'PC' });
    startEngine(hub.connect(), b.adapter, { id: 'same', name: 'PC' });
    await settle();
    expect(e1.peers()).toEqual([]);
    expect(b.s.save).toBeNull();
  });
});
