// Spoiler-free screenshots for the README (docs/readme/shots/*.webp), at laptop and phone sizes.
// The save is an early-game player's: common spells and perks, the Coal Pits creatures, and a live run in the
// Coal Pits, read through the real folder sync (a fake save00 in the browser's private file system).
// Nothing secret is ever shown: no bosses, orbs, secret items, revealed recipes, Heaven or Hell.
// Needs `npm run build && npx vite preview --port 4173`. Usage: npm run readme-shots [baseUrl]; ONLY=run,seed redoes a few.
import { chromium, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const BASE = process.argv[2] ?? 'http://localhost:4173/';
const OUT = join(process.cwd(), 'docs/readme/shots');
mkdirSync(OUT, { recursive: true });

const data = <T,>(name: string) => {
  const v = JSON.parse(readFileSync(join(process.cwd(), 'public/game/data', name), 'utf8')) as T[] | Record<string, T>;
  return Array.isArray(v) ? v : Object.values(v);
};

// ---------- The early-game save ----------
type Spell = { id: string; spawn: { level: number }[]; requiresFlag?: string; discoverFlag: string };
const WAND = ['BURST_2', 'LIGHT_BULLET_TRIGGER', 'BOMB', 'LIGHT_BULLET'];
const spells = data<Spell>('spells.json').filter((s) => !s.requiresFlag && s.spawn.some((p) => p.level <= 1));
const known = [...spells.slice(0, 70).map((s) => s.id), ...WAND];
const spellFlags = data<Spell>('spells.json')
  .filter((s) => known.includes(s.id))
  .map((s) => s.discoverFlag);
const PERKS = ['EXTRA_HP', 'EXTRA_MANA', 'FASTER_WANDS', 'SHIELD', 'PROTECTION_FIRE', 'MOVEMENT_FASTER', 'CRITICAL_HIT', 'EXTRA_PERK', 'GAMBLE', 'HOMUNCULUS', 'ORBIT', 'LOW_RECOIL'];
const perkFlags = data<{ id: string; discoverFlag: string }>('perks.json')
  .filter((p) => PERKS.includes(p.id))
  .map((p) => p.discoverFlag);
const CREATURES = ['zombie_weak', 'zombie', 'miner_weak', 'miner', 'shotgunner_weak', 'shotgunner', 'slimeshooter_weak', 'slimeshooter', 'acidshooter_weak', 'longleg', 'frog', 'fireskull', 'firemage_weak', 'giantshooter_weak', 'fungus'];

const liveRun = JSON.stringify({
  v: 1,
  mod: 2,
  status: 'alive',
  seed: 1492787966,
  ngPlus: 0,
  biome: { id: '$biome_coalmine', name: 'Coal Pits' },
  hp: 86,
  maxHp: 125,
  gold: 412,
  depth: 610,
  x: 380,
  y: 610,
  playtime: 734,
  kills: 23,
  orbs: 0,
  fungal: { count: 0, readyIn: 0 },
  seen: CREATURES.slice(0, 8),
  wands: [
    {
      name: 'Wand',
      active: true,
      shuffle: false,
      spellsPerCast: 1,
      castDelay: 9,
      rechargeTime: 28,
      manaMax: 420,
      mana: 260,
      manaChargeSpeed: 110,
      capacity: 6,
      spread: 0,
      speedMultiplier: 1,
      spells: WAND.map((id, slot) => ({ id, slot, ...(id === 'BOMB' ? { uses: 2 } : {}) })),
      alwaysCasts: [],
    },
    {
      name: 'Wand',
      active: false,
      shuffle: true,
      spellsPerCast: 2,
      castDelay: 4,
      rechargeTime: 18,
      manaMax: 280,
      mana: 280,
      manaChargeSpeed: 70,
      capacity: 4,
      spread: 6,
      speedMultiplier: 1,
      spells: [
        { id: 'LIGHT_BULLET', slot: 0 },
        { id: 'BUBBLESHOT', slot: 1 },
        { id: 'SPITTER', slot: 2 },
      ],
      alwaysCasts: [],
    },
  ],
  flasks: [
    { name: 'Flask', capacity: 1000, contents: [{ material: 'water', amount: 720 }] },
    { name: 'Flask', capacity: 1000, contents: [{ material: 'oil', amount: 400 }] },
  ],
  spells: [],
  perks: [
    { id: 'EXTRA_HP', count: 1 },
    { id: 'FASTER_WANDS', count: 1 },
  ],
  items: [],
});

const save: Record<string, string> = {
  'stats/_stats.salakieli': 'a',
  'companion_live.json': liveRun,
};
for (const f of [...spellFlags, ...perkFlags]) save[`persistent/flags/${f}`] = '';
for (const [i, id] of CREATURES.entries()) save[`stats/stats_${id}.xml`] = `<Stats deaths="${3 + ((i * 7) % 11)}" player_kills="${i === 0 ? 2 : 0}"></Stats>`;

// ---------- Browser ----------
const writeSave = (page: Page, files: Record<string, string>) =>
  page.evaluate(async (files) => {
    const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('save00', { create: true });
    for (const [path, text] of Object.entries(files)) {
      const parts = path.split('/');
      let dir = root;
      for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true });
      const w = await (await dir.getFileHandle(parts.at(-1)!, { create: true })).createWritable();
      await w.write(text);
      await w.close();
    }
  }, files);

const LAPTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: LAPTOP, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () =>
    (await navigator.storage.getDirectory()).getDirectoryHandle('save00', { create: true });
});
const page = await ctx.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(BASE);
await writeSave(page, save);
await page.goto(`${BASE}progress`);
await page.getByRole('button', { name: 'Choose save folder' }).first().dispatchEvent('click');
await page.getByText('Live sync on').waitFor({ timeout: 20000 });
console.log('save synced');

// The builder's wand, one spell at a time.
for (const id of WAND) {
  await page.goto(`${BASE}wand?add=${id}`);
  await page.getByText(/^Added /).waitFor({ timeout: 20000 });
}

/** A scene may return its own picture (a close-up); otherwise the whole viewport is taken. */
type Scene = { name: string; sizes: ('laptop' | 'phone')[]; run: (p: Page) => Promise<Buffer | void> };
const firing = async (p: Page, scroll: boolean) => {
  await p.goto(`${BASE}wand`);
  await p.getByRole('tab', { name: 'Preview' }).click();
  await p.getByTitle('Auto-fire at the target (F)').click();
  if (scroll) await p.getByLabel(/^Test range:/).scrollIntoViewIfNeeded();
  await p.waitForTimeout(3500);
};
const go = (path: string, wait = 2200) => async (p: Page) => {
  await p.goto(`${BASE}${path}`);
  await p.waitForTimeout(wait);
};
const scenes: Scene[] = [
  { name: 'home', sizes: ['phone'], run: go('') },
  { name: 'wand', sizes: ['laptop', 'phone'], run: go('wand') },
  { name: 'range', sizes: ['phone'], run: (p) => firing(p, true) },
  {
    name: 'range-close',
    sizes: ['laptop'],
    run: async (p) => {
      await firing(p, false);
      return p.getByLabel(/^Test range:/).screenshot();
    },
  },
  {
    name: 'run',
    sizes: ['laptop', 'phone'],
    run: async (p) => {
      // The live file counts as a running game only while it's fresh, so touch it first.
      await writeSave(p, { 'companion_live.json': liveRun });
      await p.goto(`${BASE}run`);
      await p.getByText('dps', { exact: true }).first().waitFor({ timeout: 30000 });
      await p.waitForTimeout(2500);
    },
  },
  { name: 'map', sizes: ['phone'], run: go('map', 4000) },
  {
    name: 'seed',
    sizes: ['laptop'],
    run: async (p) => {
      await p.goto(`${BASE}map`);
      await p.getByRole('button', { name: /^Seed: perks/ }).click();
      await p.getByPlaceholder('World seed').fill('1492787966');
      await p.getByRole('button', { name: 'Show', exact: true }).click();
      await p.waitForTimeout(9000);
    },
  },
  { name: 'bestiary', sizes: ['laptop', 'phone'], run: go('bestiary/zombie_weak', 2600) },
  { name: 'spell', sizes: ['phone'], run: go('spells/LIGHT_BULLET_TRIGGER') },
  { name: 'spells', sizes: ['laptop'], run: go('spells') },
  { name: 'perk', sizes: ['laptop'], run: go('perks/EXTRA_HP') },
  { name: 'material', sizes: ['laptop', 'phone'], run: go('materials/water') },
  { name: 'progress', sizes: ['laptop'], run: go('progress') },
];

for (const s of scenes.filter((x) => !process.env.ONLY || process.env.ONLY.split(',').includes(x.name))) {
  for (const size of s.sizes) {
    await page.setViewportSize(size === 'laptop' ? LAPTOP : PHONE);
    try {
      const own = await s.run(page);
      const png = own ?? (await page.screenshot());
      const file = join(OUT, `${s.name}-${size}.webp`);
      await sharp(png)
        .resize({ width: own ? 1200 : size === 'laptop' ? 1440 : 585, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(file);
      console.log('saved', file);
    } catch (e) {
      errors.push(`${s.name}-${size}: ${e}`);
    }
  }
}
if (errors.length) console.log(`errors:\n  ${errors.join('\n  ')}`);
await browser.close();
