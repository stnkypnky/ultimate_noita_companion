// Runs the companion mod's export.lua with a stubbed Noita API and checks the JSON it writes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LuaFactory } from 'wasmoon';
import { describe, expect, it } from 'vitest';
import { parseLiveRun } from '../src/features/live/parse.ts';

const exportLua = readFileSync(join(import.meta.dirname, '../mod/noita_companion/files/export.lua'), 'utf8');

// A player with a wand (one always-cast, two spells), a flask, a spell in the bag and one perk.
const STUB = `
E = {}
C = {}
local function ent(id, name, tags, comps, children) E[id] = { name = name, tags = tags or {}, comps = comps or {}, children = children or {} } end
local function comp(id, values, objects) C[id] = { values = values, objects = objects or {} } end

ent(1, "player", { player_unit = true }, { DamageModelComponent = 10, WalletComponent = 11, Inventory2Component = 12 }, { 2, 3 })
comp(10, { hp = 4, max_hp = 4 })
comp(11, { money = 1234 })
comp(12, { mActiveItem = 20 })
ent(2, "inventory_quick", {}, {}, { 20, 30 })
ent(3, "inventory_full", {}, {}, { 40 })
ent(20, "wand", { wand = true }, { AbilityComponent = 21 }, { 22, 23, 24 })
comp(21, { ui_name = "$item_wand", sprite_file = "data/items_gfx/wands/wand_0042.png", mana_max = 350.5, mana = 100, mana_charge_speed = 90 },
  { gun_config = { deck_capacity = 6, actions_per_round = 2, shuffle_deck_when_empty = false, reload_time = 25 },
    gunaction_config = { fire_rate_wait = 8, spread_degrees = -3, speed_multiplier = 1.25 } })
ent(22, "", {}, { ItemActionComponent = 221, ItemComponent = 222 }); comp(221, { action_id = "BOMB" }); comp(222, { uses_remaining = 2, inventory_slot = 1, permanently_attached = false })
ent(23, "", {}, { ItemActionComponent = 231, ItemComponent = 232 }); comp(231, { action_id = "LIGHT_BULLET" }); comp(232, { uses_remaining = -1, inventory_slot = 0, permanently_attached = false })
ent(24, "", {}, { ItemActionComponent = 241, ItemComponent = 242 }); comp(241, { action_id = "BURST_2" }); comp(242, { uses_remaining = -1, inventory_slot = 0, permanently_attached = true })
ent(30, "potion", { potion = true }, { MaterialInventoryComponent = 31, ItemComponent = 32, MaterialSuckerComponent = 33 })
comp(31, { count_per_material_type = { [1] = 0, [4] = 700, [9] = 299.6 } })
comp(32, { item_name = "$item_potion" })
comp(33, { barrel_size = 1000 })
ent(40, "", {}, { ItemActionComponent = 401, ItemComponent = 402 }); comp(401, { action_id = "NUKE" }); comp(402, { uses_remaining = 1, inventory_slot = 0 })

function EntityGetWithTag(tag) local out = {} for id, e in pairs(E) do if e.tags[tag] then out[#out + 1] = id end end return out end
function EntityGetAllChildren(id) return E[id] and E[id].children or nil end
function EntityGetName(id) return E[id].name end
function EntityHasTag(id, tag) return E[id].tags[tag] == true end
function EntityGetTransform(id) return 100, 2400 end
function EntityGetFirstComponentIncludingDisabled(id, name) return E[id].comps[name] end
function ComponentGetValue2(c, f) return C[c].values[f] end
function ComponentObjectGetValue2(c, o, f) return C[c].objects[o][f] end
function BiomeMapGetName(x, y) return "$biome_coalmine" end
function GameTextGetTranslatedOrNot(k) local t = { ["$biome_coalmine"] = "Coal Pits", ["$item_wand"] = "Wand", ["$item_potion"] = "Flask" } return t[k] or k end
function StatsGetValue(k) if k == "world_seed" then return "123456" end end
function SessionNumbersGetValue(k) return "1" end
function CellFactory_GetName(i) local t = { [3] = "water", [8] = "blood" } return t[i] or ("mat" .. i) end
perk_list = { { id = "SHIELD" }, { id = "PROTECTION_FIRE" }, { id = "EXTRA_HP" } }
local G = { PERK_PICKED_SHIELD_PICKUP_COUNT = "2" }
function GlobalsGetValue(k, d) return G[k] or d end

written = {}
function companion_writer(path, text) written[#written + 1] = text end
`;

async function host() {
  const lua = await new LuaFactory().createEngine();
  await lua.doString(STUB);
  await lua.doString(exportLua);
  return lua;
}

describe('companion mod export', () => {
  it('describes the run as JSON the app accepts', async () => {
    const lua = await host();
    const json = (await lua.doString('return companion_json(companion_state())')) as string;
    const raw = JSON.parse(json);
    expect(raw).toMatchObject({ v: 1, status: 'alive', seed: 123456, ngPlus: 1, hp: 100, maxHp: 100, gold: 1234, biome: { id: '$biome_coalmine', name: 'Coal Pits' } });
    expect(raw.wands[0]).toMatchObject({
      name: 'Wand',
      active: true,
      capacity: 5,
      spellsPerCast: 2,
      castDelay: 8,
      rechargeTime: 25,
      spread: -3,
      speedMultiplier: 1.25,
      alwaysCasts: ['BURST_2'],
      spells: [
        { id: 'LIGHT_BULLET', slot: 0 },
        { id: 'BOMB', slot: 1, uses: 2 },
      ],
    });
    expect(raw.flasks[0]).toEqual({ name: 'Flask', capacity: 1000, contents: [{ material: 'water', amount: 700 }, { material: 'blood', amount: 300 }] });
    expect(raw.spells).toEqual([{ id: 'NUKE', uses: 1 }]);
    expect(raw.perks).toEqual([{ id: 'SHIELD', count: 2 }]);

    const run = parseLiveRun(json);
    expect(run?.wands[0]?.spells.map((s) => s.id)).toEqual(['LIGHT_BULLET', 'BOMB']);
    lua.global.close();
  });

  it('writes only on change, plus a heartbeat', async () => {
    const lua = await host();
    const count = async () => (await lua.doString('return #written')) as number;
    await lua.doString('companion_tick(30, 1000)');
    expect(await count()).toBe(1);
    await lua.doString('companion_tick(31, 1001)'); // not a check frame
    await lua.doString('companion_tick(60, 1005)'); // nothing changed
    expect(await count()).toBe(1);
    await lua.doString('C[11].values.money = 2000; companion_tick(90, 1006)');
    expect(await count()).toBe(2);
    await lua.doString('companion_tick(120, 1040)'); // heartbeat after 30 s
    expect(await count()).toBe(3);
    await lua.doString('companion_write("dead", 1041)');
    expect(JSON.parse((await lua.doString('return written[#written]')) as string)).toMatchObject({ status: 'dead', time: 1041 });
    lua.global.close();
  });

  it('copes with no player (main menu, between runs)', async () => {
    const lua = await host();
    const raw = JSON.parse((await lua.doString('E[1].tags = {}; return companion_json(companion_state())')) as string);
    expect(raw).toEqual({ v: 1, mod: 6, status: 'no_player', seed: 123456, ngPlus: 1 });
    lua.global.close();
  });

  it('samples the overworld ground near the surface, each column once, and not deep down', async () => {
    const lua = await host();
    // Deep in the caves (the stub player stands at y 2400): no samples.
    const deep = JSON.parse((await lua.doString('return companion_json(companion_state())')) as string);
    expect(deep.surface).toBeUndefined();
    // On the surface, with the ground 30 px below the player: one ray per 16 px column across ±480 px.
    await lua.doString(`
      function EntityGetTransform(id) return 100, 200 end
      rays = 0
      function RaytraceSurfaces(x1, y1, x2, y2) rays = rays + 1 return true, x1, 230 end`);
    const up = JSON.parse((await lua.doString('return companion_json(companion_state())')) as string);
    expect(up.surface.length).toBe(61);
    expect(up.surface[0]).toEqual([-376, 230]);
    expect(up.surface.every((p: number[]) => p[1] === 230 && (p[0] - 8) % 16 === 0)).toBe(true);
    // Same place again: no new rays.
    const before = (await lua.doString('return rays')) as number;
    await lua.doString('companion_state()');
    expect(await lua.doString('return rays')).toBe(before);
    expect(parseLiveRun(JSON.stringify(up))?.surface?.length).toBe(61);
    lua.global.close();
  });

  it('keeps reporting the death, with where you fell, after the player entity is gone', async () => {
    const lua = await host();
    const last = async () => JSON.parse((await lua.doString('return written[#written]')) as string);
    await lua.doString('companion_tick(15, 1000)');
    expect(await last()).toMatchObject({ status: 'alive', x: 100, y: 2400 });
    // The game records the killer a moment after the death callback; the player is gone by then.
    await lua.doString('E[1].tags = {}; companion_write("dead", 1001)');
    const dead = await last();
    expect(dead).toMatchObject({ status: 'dead', x: 100, y: 2400, hp: 0, maxHp: 100, gold: 1234, biome: { name: 'Coal Pits' } });
    expect(dead.wands).toHaveLength(1);
    expect(dead.killedBy).toBeUndefined();
    await lua.doString('function StatsGetValue(k) if k == "world_seed" then return "123456" end if k == "killed_by" then return "$animal_zombie" end end');
    // Ticks on the death screen don't turn it into "no player".
    await lua.doString('companion_tick(30, 1002)');
    expect(await last()).toMatchObject({ status: 'dead', x: 100, killedBy: '$animal_zombie' });
    const n = (await lua.doString('return #written')) as number;
    await lua.doString('companion_tick(45, 1003)');
    expect((await lua.doString('return #written')) as number).toBe(n);
    await lua.doString('companion_tick(60, 1040)'); // heartbeat
    expect(await last()).toMatchObject({ status: 'dead', time: 1040 });
    lua.global.close();
  });

  it('reports a win, with the wands you carried when the ending began (the gold takes them)', async () => {
    const lua = await host();
    const last = async () => JSON.parse((await lua.doString('return written[#written]')) as string);
    await lua.doString('companion_tick(15, 1000)');
    expect((await last()).won).toBeUndefined();
    // The ending starts: the run flag is set, then the gold turns your wands and flasks to gold.
    await lua.doString('RUN_FLAGS = { ending_game_completed = true }; function GameHasFlagRun(f) return RUN_FLAGS[f] == true end');
    await lua.doString('E[2].children = {}; companion_tick(30, 1001)');
    const ending = await last();
    expect(ending).toMatchObject({ status: 'alive', won: true });
    expect(ending.wands).toHaveLength(1);
    expect(ending.flasks).toHaveLength(1);
    await lua.doString('function StatsGetValue(k) if k == "world_seed" then return "123456" end if k == "killed_by" then return " | midas" end end');
    await lua.doString('companion_write("dead", 1002)');
    const dead = await last();
    expect(dead).toMatchObject({ status: 'dead', won: true, killedBy: ' | midas' });
    expect(dead.wands[0].spells).toHaveLength(2);
    expect(parseLiveRun(JSON.stringify(dead))?.won).toBe(true);
    lua.global.close();
  });

  it('names the creature that just hurt you when the game leaves it out of killed_by', async () => {
    const lua = await host();
    const damageLua = readFileSync(join(import.meta.dirname, '../mod/noita_companion/files/damage.lua'), 'utf8');
    await lua.doString(`
      FRAME = 500
      function GameGetFrameNum() return FRAME end
      local G2 = {}
      function GlobalsSetValue(k, v) G2[k] = v end
      function GlobalsGetValue(k, d) return G2[k] or d end
      function GetUpdatedEntityID() return 1 end
      E[50] = { name = "worm", tags = {}, comps = {}, children = {} }
      function EntityGetFilename(id) if id == 50 then return "data/entities/animals/worm_skull.xml" end return "data/entities/player.xml" end
      function StatsGetValue(k) if k == "world_seed" then return "123456" end if k == "killed_by" then return " | bite" end end
    `);
    await lua.doString(damageLua);
    await lua.doString('damage_received(1.2, "", 1, false, 0)'); // your own damage doesn't count
    await lua.doString('damage_received(4, "", 50, true, 0)');
    const dead = JSON.parse((await lua.doString('return companion_json(companion_state("dead"))')) as string);
    expect(dead.killedBy).toBe('worm_skull | bite');
    // Long after the last hit, it isn't blamed.
    await lua.doString('FRAME = 5000');
    const later = JSON.parse((await lua.doString('return companion_json(companion_state("dead"))')) as string);
    expect(later.killedBy).toBe(' | bite');
    lua.global.close();
  });

  it('gives the player the damage watcher once', async () => {
    const lua = await host();
    await lua.doString(`
      ADDED = 0
      LUA = {}
      function EntityGetComponentIncludingDisabled(id, name) return LUA end
      function EntityAddComponent2(id, name, values) ADDED = ADDED + 1; C[900 + ADDED] = { values = values, objects = {} }; LUA[#LUA + 1] = 900 + ADDED end
      companion_watch_damage(1)
      companion_watch_damage(1)
    `);
    expect(await lua.doString('return ADDED')).toBe(1);
    expect(await lua.doString('return C[901].values.script_damage_received')).toBe('mods/noita_companion/files/damage.lua');
    lua.global.close();
  });

  it('looks four times a second', async () => {
    const lua = await host();
    await lua.doString('companion_tick(15, 1000); companion_tick(20, 1000)');
    expect((await lua.doString('return #written')) as number).toBe(1);
    lua.global.close();
  });

  it('leaves out what an older Noita build has no API for', async () => {
    const lua = await host();
    const raw = JSON.parse((await lua.doString('return companion_json(companion_state())')) as string);
    expect(raw).toMatchObject({ x: 100, y: 2400, seen: [], items: [], fungal: { count: 0, readyIn: 0 } });
    expect(raw.orbs).toBeUndefined();
    expect(raw.kills).toBeUndefined();
    lua.global.close();
  });

  it('reports position, stats, carried items, creatures met and the fungal cooldown', async () => {
    const lua = await host();
    await lua.doString(`
      F = { [50] = "data/entities/items/pickup/evil_eye.xml", [60] = "data/entities/animals/zombie.xml", [61] = "data/entities/animals/longleg.xml", [62] = "data/entities/animals/zombie.xml" }
      function EntityGetFilename(id) return F[id] or "" end
      function EntityGetInRadiusWithTag(x, y, r, tag) if tag == "enemy" then return { 60, 61, 62 } end return {} end
      function GameGetOrbCountThisRun() return 2 end
      function GameGetFrameNum() return 6000 end
      S = { world_seed = "123456", playtime = "321.5", enemies_killed = "17", killed_by = "zombie" }
      function StatsGetValue(k) return S[k] end
      local G = { fungal_shift_iteration = "1", fungal_shift_last_frame = "3000" }
      function GlobalsGetValue(k, d) return G[k] or d end
      E[2].children = { 20, 30, 50 }
      E[50] = { name = "", tags = {}, comps = { ItemComponent = 51 }, children = {} }
      C[51] = { values = { item_name = "$item_evil_eye" }, objects = {} }
      C[12].values.mActiveItem = 50
    `);
    const raw = JSON.parse((await lua.doString('return companion_json(companion_state())')) as string);
    expect(raw).toMatchObject({ mod: 6, x: 100, y: 2400, playtime: 321.5, kills: 17, orbs: 2, seen: ['zombie', 'longleg'] });
    expect(raw.items).toEqual([{ id: 'evil_eye', name: '$item_evil_eye', held: true }]);
    // Shifted at frame 3000; the 5-minute cooldown (18000 frames) ends at frame 21000, 250 s after frame 6000.
    expect(raw.fungal).toEqual({ count: 1, readyIn: 250 });
    expect(JSON.parse((await lua.doString('return companion_json(companion_state("dead"))')) as string).killedBy).toBe('zombie');

    // Ticking play time alone doesn't cause a write; meeting a new creature does.
    await lua.doString('companion_tick(30, 1000)');
    await lua.doString('S.playtime = "400"; companion_tick(60, 1001)');
    expect((await lua.doString('return #written')) as number).toBe(1);
    await lua.doString('F[63] = "data/entities/animals/shotgunner.xml"; function EntityGetInRadiusWithTag() return { 63 } end; companion_tick(90, 1002)');
    expect((await lua.doString('return #written')) as number).toBe(2);
    expect(JSON.parse((await lua.doString('return written[2]')) as string).seen).toEqual(['zombie', 'longleg', 'shotgunner']);
    lua.global.close();
  });
});
