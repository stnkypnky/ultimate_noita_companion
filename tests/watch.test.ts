import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSave } from '../src/features/progress/scan.ts';
import { fingerprint, resolveSaveDir, startSaveWatch } from '../src/features/progress/watch.ts';
import { mergeRevealLogs, sameProgress, saveTime } from '../src/store/progress.ts';
import { FakeDir } from './fakefs.ts';

const save = () =>
  new FakeDir('save00')
    .write('persistent/flags/action_bomb', '', 1000)
    .write('persistent/orbs_new/0', '', 1000)
    .write('stats/_stats.salakieli', 'x', 2000)
    .write('stats/stats_ant.xml', '<Stats deaths="1" player_kills="0">', 2000)
    .write('world/area_0.bin', '', 9999);

describe('save timestamps', () => {
  it('dates progress by the newest save file, ignoring the live file', async () => {
    const p = await parseSave([
      { path: 'save00/persistent/flags/action_bomb', text: async () => '', lastModified: Date.parse('2026-11-01T00:00:00Z') },
      { path: 'save00/stats/_stats.salakieli', text: async () => '', lastModified: Date.parse('2026-11-02T00:00:00Z') },
      { path: 'save00/companion_live.json', text: async () => '{}', lastModified: Date.parse('2026-11-09T00:00:00Z') },
    ]);
    expect(p.savedAt).toBe('2026-11-02T00:00:00.000Z');
    expect(saveTime(p)).toBe(Date.parse('2026-11-02T00:00:00Z'));
  });

  it('compares discoveries, not read times', () => {
    const a = { syncedAt: '1', flags: ['b', 'a'], enemies: [], orbs: [], enemyStats: { x: { died: 1, killedYou: 0 }, a: { died: 2, killedYou: 0 } } };
    const b = { syncedAt: '2', savedAt: '3', source: 'PC', flags: ['a', 'b'], enemies: [], orbs: [], enemyStats: { a: { died: 2, killedYou: 0 }, x: { died: 1, killedYou: 0 } } };
    expect(sameProgress(a, b)).toBe(true);
    expect(sameProgress(a, { ...b, flags: ['a'] })).toBe(false);
  });
});

describe('reveal merging', () => {
  it('keeps the newest entry per key, preferring reveal on a tie', () => {
    const mine = { a: { on: true, t: 5 }, b: { on: true, t: 5 } };
    const theirs = { a: { on: false, t: 6 }, b: { on: false, t: 4 }, c: { on: true, t: 1 }, d: { on: true, t: 5 } };
    expect(mergeRevealLogs(mine, theirs)).toEqual({ a: { on: false, t: 6 }, b: { on: true, t: 5 }, c: { on: true, t: 1 }, d: { on: true, t: 5 } });
    expect(mergeRevealLogs(mine, { a: { on: true, t: 1 } })).toBe(mine);
    expect(mergeRevealLogs({ a: { on: false, t: 3 } }, { a: { on: true, t: 3 } })).toEqual({ a: { on: true, t: 3 } });
  });

  it('ignores malformed entries', () => {
    const mine = {};
    expect(mergeRevealLogs(mine, { a: { on: 'yes', t: 1 } as never, b: null as never })).toBe(mine);
  });
});

describe('save folder watching', () => {
  afterEach(() => vi.useRealTimers());

  it('finds save00 inside the Nolla_Games_Noita folder', async () => {
    const root = new FakeDir('Nolla_Games_Noita');
    const s = save();
    root.children.set('save00', s);
    expect(await resolveSaveDir(root.asHandle())).toBe(s);
    expect(await resolveSaveDir(new FakeDir('Desktop').asHandle())).toBeNull();
  });

  it('fingerprint ignores world chunks but sees new flags and end-of-run stats', async () => {
    const s = save();
    const before = await fingerprint(s.asHandle());
    s.write('world/area_1.bin', '', 10000);
    expect(await fingerprint(s.asHandle())).toBe(before);
    s.write('persistent/flags/action_nuke');
    const withFlag = await fingerprint(s.asHandle());
    expect(withFlag).not.toBe(before);
    s.write('stats/_stats.salakieli', 'y', 3000);
    expect(await fingerprint(s.asHandle())).not.toBe(withFlag);
  });

  it('scans at start, then only when something changed', async () => {
    vi.useFakeTimers();
    const s = save();
    const onScan = vi.fn();
    const onLive = vi.fn();
    const w = startSaveWatch(s.asHandle(), { onScan, onLive }, { pollMs: 100, hiddenPollMs: 100 });
    await vi.advanceTimersByTimeAsync(10);
    expect(onScan).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(onScan).toHaveBeenCalledTimes(1);

    s.write('persistent/flags/action_nuke');
    await vi.advanceTimersByTimeAsync(150);
    expect(onScan).toHaveBeenCalledTimes(2);
    const files = onScan.mock.calls[1]![0] as { path: string }[];
    expect(files.some((f) => f.path.endsWith('action_nuke'))).toBe(true);

    s.write('companion_live.json', '{"hp":1}', 5000);
    await vi.advanceTimersByTimeAsync(150);
    expect(onLive).toHaveBeenCalledWith('{"hp":1}', 5000);
    expect(onScan).toHaveBeenCalledTimes(2);

    await w.syncNow();
    expect(onScan).toHaveBeenCalledTimes(3);
    w.stop();
    s.write('persistent/flags/action_x');
    await vi.advanceTimersByTimeAsync(500);
    expect(onScan).toHaveBeenCalledTimes(3);
  });

  it('reads the live file while the mod keeps writing it (moving), not only once it stops', async () => {
    vi.useFakeTimers();
    let notify: ((records: { relativePathComponents?: string[] }[]) => void) | null = null;
    const g = globalThis as { FileSystemObserver?: unknown };
    g.FileSystemObserver = class {
      constructor(cb: typeof notify) {
        notify = cb;
      }
      observe = async () => {};
      disconnect = () => {};
    };
    try {
      const s = save();
      const onScan = vi.fn();
      const onLive = vi.fn();
      const w = startSaveWatch(s.asHandle(), { onScan, onLive });
      await vi.advanceTimersByTimeAsync(10);
      expect(onScan).toHaveBeenCalledTimes(1);
      // Four writes a second for two seconds, each followed by its observer record.
      for (let i = 1; i <= 8; i++) {
        s.write('companion_live.json', `{"x":${i}}`, 10000 + i);
        notify!([{ relativePathComponents: ['companion_live.json.tmp'] }, { relativePathComponents: ['companion_live.json'] }]);
        await vi.advanceTimersByTimeAsync(250);
      }
      expect(onLive.mock.calls.length).toBeGreaterThanOrEqual(6);
      expect(onLive).toHaveBeenLastCalledWith('{"x":8}', 10008);
      // The live file alone never re-reads the whole save.
      expect(onScan).toHaveBeenCalledTimes(1);
      w.stop();
    } finally {
      delete g.FileSystemObserver;
    }
  });

  it('without an observer, a visible tab still checks the live file about every second', async () => {
    vi.useFakeTimers();
    const s = save();
    const onLive = vi.fn();
    const w = startSaveWatch(s.asHandle(), { onScan: vi.fn(), onLive }, { pollMs: 60_000 });
    await vi.advanceTimersByTimeAsync(10);
    s.write('companion_live.json', '{"x":1}', 20001);
    await vi.advanceTimersByTimeAsync(1100);
    expect(onLive).toHaveBeenLastCalledWith('{"x":1}', 20001);
    w.stop();
  });
});
