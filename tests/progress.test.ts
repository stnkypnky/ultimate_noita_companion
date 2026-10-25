import { describe, expect, it } from 'vitest';
import { decodeProgress, encodeProgress } from '../src/features/progress/codec.ts';
import { isWanted, parseSave, type SaveFile } from '../src/features/progress/scan.ts';

const file = (path: string, text = ''): SaveFile => ({ path, text: async () => text });

describe('parseSave', () => {
  it('reads flags, orbs, enemies and runs from save00', async () => {
    const files = [
      file('Nolla_Games_Noita/save00/persistent/flags/action_bomb'),
      file('Nolla_Games_Noita/save00/persistent/flags/perk_picked_shield'),
      file('Nolla_Games_Noita/save00/persistent/flags/steam_autocloud.vdf'),
      file('Nolla_Games_Noita/save00/persistent/orbs_new/7'),
      file('Nolla_Games_Noita/save00/persistent/orbs_new/0'),
      file('Nolla_Games_Noita/save00/stats/stats_ant.xml'),
      file('Nolla_Games_Noita/save00/stats/_stats.salakieli'),
      file(
        'Nolla_Games_Noita/save00/stats/sessions/20250330-175039_stats.xml',
        '<Stats><stats dead="1" enemies_killed="33" gold_all="505" killed_by="Haulikkohiisi | melee" playtime="413.917" world_seed="1492787966" ></stats></Stats>',
      ),
      // another slot that must be ignored
      file('Nolla_Games_Noita/save01/persistent/flags/action_nuke'),
    ];
    const p = await parseSave(files);
    expect(p.flags.sort()).toEqual(['action_bomb', 'perk_picked_shield']);
    expect(p.orbs).toEqual([0, 7]);
    expect(p.enemies).toEqual(['ant']);
    expect(p.runs).toMatchObject({ runs: 1, deaths: 1, kills: 33, bestGold: 505 });
    expect(p.runs!.recent[0]).toMatchObject({ seed: 1492787966, killedBy: 'Haulikkohiisi', date: '2025-03-30T17:50:39' });
  });

  it('rejects folders that are not saves', async () => {
    await expect(parseSave([file('Desktop/notes.txt')])).rejects.toThrow(/save/);
  });

  it('skips world chunks', () => {
    expect(isWanted('save00/world/area_0.bin')).toBe(false);
    expect(isWanted('save00/persistent/flags/action_bomb')).toBe(true);
  });
});

describe('sync codec', () => {
  const lists = {
    spells: Array.from({ length: 420 }, (_, i) => ({ discoverFlag: `action_s${i}` })),
    perks: Array.from({ length: 106 }, (_, i) => ({ discoverFlag: `perk_picked_p${i}` })),
    enemies: Array.from({ length: 185 }, (_, i) => ({ id: `e${i}` })),
  };

  it('round-trips progress compactly', async () => {
    const progress = {
      syncedAt: '2026-10-25T12:00:00.000Z',
      flags: ['action_s0', 'action_s419', 'perk_picked_p5', 'card_unlocked_kantele', 'progress_orb_1'],
      enemies: ['e0', 'e184'],
      orbs: [0, 1, 7],
    };
    const code = await encodeProgress(progress, lists, 'abcdef1234');
    expect(code.length).toBeLessThan(300);
    const { progress: back, versionMismatch } = await decodeProgress(code, lists, 'abcdef1234');
    expect(versionMismatch).toBe(false);
    expect(back.flags.sort()).toEqual([...progress.flags].sort());
    expect(back.enemies).toEqual(progress.enemies);
    expect(back.orbs).toEqual(progress.orbs);
  });

  it('flags codes from a different game build', async () => {
    const code = await encodeProgress({ syncedAt: '', flags: [], enemies: [], orbs: [] }, lists, '11111111');
    expect((await decodeProgress(code, lists, '22222222')).versionMismatch).toBe(true);
  });

  it('rejects garbage', async () => {
    await expect(decodeProgress('not-a-code', lists, 'x')).rejects.toThrow(/couldn't be read/);
  });
});
