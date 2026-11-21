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
      file('Nolla_Games_Noita/save00/stats/stats_ant.xml', '<Stats deaths="16" kills="2" player_kills="1" player_projectile_count="0" ><death_map></death_map></Stats>'),
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
    expect(p.enemyStats).toEqual({ ant: { died: 16, killedYou: 1 } });
    expect(p.runs).toMatchObject({ runs: 1, deaths: 1, kills: 33, bestGold: 505 });
    expect(p.runs!.recent[0]).toMatchObject({ seed: 1492787966, killedBy: 'Haulikkohiisi', date: '2025-03-30T17:50:39' });
  });

  it('finds the creature that killed you in the session kills file', async () => {
    const s = 'Nolla_Games_Noita/save00/stats/';
    const p = await parseSave([
      file('Nolla_Games_Noita/save00/persistent/flags/action_bomb'),
      file(
        `${s}stats_acidshooter.xml`,
        '<Stats deaths="38" kills="4" player_kills="1" ><death_map><E key="NULL | $damage_fire" value="3" ></E><E key="player | $damage_projectile" value="14" ></E><E key="skullfly | $damage_fire" value="1" ></E></death_map><kill_map><E key="player" value="1" ></E><E key="rat" value="2" ></E></kill_map></Stats>',
      ),
      file(`${s}sessions/20261119-184913_stats.xml`, '<Stats><stats dead="1" killed_by=" | bite" playtime="10" world_seed="2046258427" ></stats></Stats>'),
      file(`${s}sessions/20261119-184913_kills.xml`, '<Stats deaths="1"><death_map><E key="worm_skull | bite" value="1" ></E></death_map><kill_map></kill_map></Stats>'),
      file(`${s}sessions/20261118-201824_stats.xml`, '<Stats><stats dead="1" killed_by=" | explosion" world_seed="5" ></stats></Stats>'),
      file(`${s}sessions/20261118-201824_kills.xml`, '<Stats><death_map><E key="NULL | $damage_explosion" value="1" ></E></death_map></Stats>'),
    ]);
    expect(p.enemies).toContain('worm_skull');
    expect(p.enemyStats!.worm_skull).toEqual({ died: 0, killedYou: 1 });
    expect(p.enemyStats!.acidshooter).toEqual({
      died: 38,
      killedYou: 1,
      byWorld: { $damage_fire: 3 },
      byYou: { $damage_projectile: 14 },
      byOthers: { skullfly: 1 },
      victims: { rat: 2 },
    });
    expect(p.deaths).toEqual([
      { date: '2026-11-19T18:49:13', seed: 2046258427, killer: 'worm_skull', cause: 'bite' },
      { date: '2026-11-18T20:18:24', seed: 5, cause: 'explosion' },
    ]);
    expect(p.runs!.recent[0]!.killedBy).toBe('worm_skull');
    // The game counts acidshooter (it has died), not worm_skull (no stats file of its own).
    expect(p.counted).toEqual(['acidshooter']);
  });

  it('counts creatures the way the game does: one died, or one killed you', async () => {
    const s = 'Nolla_Games_Noita/save00/stats/';
    const zero = '<Stats deaths="0" kills="0" player_kills="0" ></Stats>';
    const p = await parseSave([
      file('Nolla_Games_Noita/save00/persistent/flags/action_bomb'),
      file(`${s}stats_sheep.xml`, zero),
      file(`${s}stats_player.xml`, zero),
      file(`${s}stats_lurker.xml`, '<Stats deaths="0" kills="2" player_kills="1" ></Stats>'),
      file(`${s}stats_rat.xml`, '<Stats deaths="4" kills="0" player_kills="0" ></Stats>'),
    ]);
    expect([...p.enemies].sort()).toEqual(['lurker', 'player', 'rat', 'sheep']);
    expect(p.counted).toEqual(['lurker', 'rat']);
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

  it('carries creature history (deaths, times it killed you)', async () => {
    const enemyStats = Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`e${i}`, { died: 40 + i, killedYou: i % 3 }]));
    const progress = { syncedAt: '', flags: [], enemies: Object.keys(enemyStats), enemyStats, orbs: [] };
    const code = await encodeProgress(progress, lists, 'abcdef1234');
    // Still fits a QR code comfortably.
    expect(code.length).toBeLessThan(1500);
    expect((await decodeProgress(code, lists, 'abcdef1234')).progress.enemyStats).toEqual(enemyStats);
  });

  it('carries the creatures that killed you, but not the per-creature maps', async () => {
    const enemyStats = { e1: { died: 3, killedYou: 1, byYou: { $damage_fire: 3 } } };
    const deaths = [
      { date: '2026-11-19T18:49:13', seed: 7, killer: 'e1', cause: 'bite' },
      { date: '2026-11-18T10:00:00', seed: 8, cause: 'explosion' },
    ];
    const code = await encodeProgress({ syncedAt: '', flags: [], enemies: ['e1'], enemyStats, deaths, orbs: [] }, lists, 'abcdef1234');
    const { progress } = await decodeProgress(code, lists, 'abcdef1234');
    expect(progress.deaths).toEqual([deaths[0]]);
    expect(progress.enemyStats).toEqual({ e1: { died: 3, killedYou: 1 } });
  });

  it('carries which creatures the game counts', async () => {
    const code = await encodeProgress({ syncedAt: '', flags: [], enemies: ['e1', 'e2'], counted: ['e2'], orbs: [] }, lists, 'abcdef1234');
    expect((await decodeProgress(code, lists, 'abcdef1234')).progress.counted).toEqual(['e2']);
    const old = await encodeProgress({ syncedAt: '', flags: [], enemies: ['e1'], orbs: [] }, lists, 'abcdef1234');
    expect((await decodeProgress(old, lists, 'abcdef1234')).progress.counted).toBeUndefined();
  });

  it('flags codes from a different game build', async () => {
    const code = await encodeProgress({ syncedAt: '', flags: [], enemies: [], orbs: [] }, lists, '11111111');
    expect((await decodeProgress(code, lists, '22222222')).versionMismatch).toBe(true);
  });

  it('rejects garbage', async () => {
    await expect(decodeProgress('not-a-code', lists, 'x')).rejects.toThrow(/couldn't be read/);
  });
});
