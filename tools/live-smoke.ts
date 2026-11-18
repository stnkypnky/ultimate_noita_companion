// End-to-end check of live sync: a fake save folder in the browser's private file system (OPFS) stands in
// for save00, the folder picker is stubbed to return it, and a paired "phone" should follow every change.
// Needs `npm run build && npx vite preview --port 4173` running. Usage: npx tsx tools/live-smoke.ts [shots dir]
import { chromium, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:4173/';
const shots = process.argv[2];
const key = randomBytes(16).toString('base64url');

const liveRun = (hp: number, gold: number) =>
  JSON.stringify({
    v: 1,
    status: 'alive',
    seed: 1492787966,
    ngPlus: 0,
    biome: { id: '$biome_coalmine', name: 'Coal Pits' },
    hp,
    maxHp: 100,
    gold,
    depth: 240,
    wands: [
      {
        name: 'Wand',
        active: true,
        shuffle: false,
        spellsPerCast: 1,
        castDelay: 8,
        rechargeTime: 25,
        manaMax: 350,
        mana: 200,
        manaChargeSpeed: 90,
        capacity: 5,
        spread: 0,
        speedMultiplier: 1,
        spells: [
          { id: 'LIGHT_BULLET', slot: 0 },
          { id: 'BOMB', slot: 1, uses: 2 },
        ],
        alwaysCasts: [],
      },
    ],
    flasks: [{ name: 'Flask', capacity: 1000, contents: [{ material: 'water', amount: 700 }] }],
    spells: [],
    perks: [{ id: 'SHIELD', count: 1 }],
    // Mod 2
    mod: 2,
    x: 300,
    y: 2400,
    playtime: 312,
    kills: 4,
    orbs: 0,
    fungal: { count: 0, readyIn: 0 },
    seen: ['zombie_weak', 'slimeshooter_weak'],
    items: [{ id: 'evil_eye', name: '$item_evil_eye' }],
  });

/** Write files into the OPFS save00 folder from inside the page. */
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

const browser = await chromium.launch();
const open = async (name: string, pc: boolean) => {
  const ctx = await browser.newContext({ viewport: pc ? { width: 1280, height: 900 } : { width: 390, height: 844 }, isMobile: !pc, hasTouch: !pc });
  await ctx.addInitScript((n) => localStorage.setItem('device-name', n), name);
  if (pc)
    await ctx.addInitScript(() => {
      (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () =>
        (await navigator.storage.getDirectory()).getDirectoryHandle('save00', { create: true });
    });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message));
  page.on('console', (m) => /\[sync\]/.test(m.text()) && console.log(`[${name}]`, m.text()));
  await page.goto(`${BASE}pair#k=${key}`);
  await page.getByText('Paired', { exact: true }).waitFor({ timeout: 30000 });
  return page;
};

const [pc, phone] = await Promise.all([open('Gaming PC', true), open('Phone', false)]);
await phone.getByText('Connected to Gaming PC').waitFor({ timeout: 60000 });
console.log('paired');

await writeSave(pc, {
  'persistent/flags/action_bomb': '',
  'persistent/flags/action_light_bullet': '',
  'persistent/orbs_new/0': '',
  'stats/_stats.salakieli': 'a',
  'stats/stats_ant.xml': '<Stats deaths="3" player_kills="1"></Stats>',
  'companion_live.json': liveRun(80, 120),
});
await pc.goto(`${BASE}progress`);
// The first-run welcome dialog covers the page; the picker itself is stubbed, so dispatch the click.
await pc.getByRole('button', { name: 'Choose save folder' }).first().dispatchEvent('click');
await pc.getByText('Live sync on').waitFor({ timeout: 15000 });
console.log('PC: live sync on');

await pc.goto(BASE);
try {
  await pc.getByText('Run in progress').first().waitFor({ timeout: 15000 });
  console.log('PC: run banner on Home');
} catch {
  console.log('PC home:', (await pc.locator('main').innerText()).slice(0, 500));
}
await pc.getByRole('link', { name: 'Run', exact: true }).waitFor({ timeout: 5000 });
console.log('PC: Run in the nav');
await pc.goto(`${BASE}run`);
await pc.getByRole('heading', { name: 'Current run' }).waitFor({ timeout: 15000 });
await pc.getByText('Damage / sec').first().waitFor({ timeout: 15000 });
console.log('PC: Run page with a simulated wand');
for (const text of ['Where you are', /^Next: Holy Mountain \d$/, 'Next fungal shift', 'ready now', 'Kills']) {
  try {
    await pc.getByText(text, { exact: true }).first().waitFor({ timeout: 20000 });
  } catch (e) {
    console.log('PC run page:', (await pc.locator('main').innerText()).slice(0, 1500));
    throw e;
  }
}
console.log('PC: map, next Holy Mountain, fungal shift and run stats');
await phone.goto(BASE);
try {
  await phone.getByText('Run in progress').first().waitFor({ timeout: 30000 });
} catch (e) {
  console.log('phone home:', (await phone.locator('main').innerText()).slice(0, 400));
  await phone.goto(`${BASE}progress`);
  await phone.waitForTimeout(8000);
  console.log('phone progress:', (await phone.locator('main').innerText()).slice(0, 1500));
  throw e;
}
await phone.getByText(/from Gaming PC/).first().waitFor({ timeout: 30000 });
console.log('phone: current run relayed from the PC');
await phone.locator('nav[aria-label="Main"]:visible').getByRole('link', { name: 'Run' }).click();
await phone.getByRole('heading', { name: 'Current run' }).waitFor({ timeout: 15000 });
console.log('phone: Run page from the bottom bar');

// Play on: a new spell found and some damage taken. The phone should follow without a reload.
const t0 = Date.now();
await writeSave(pc, { 'persistent/flags/action_nuke': '', 'companion_live.json': liveRun(55, 300) });
await phone.getByText('55 / 100').waitFor({ timeout: 30000 });
console.log(`phone: live HP update in ${Date.now() - t0} ms`);

// Phones: sections start folded with a summary line; a tap opens one, and it stays open after a reload.
const flasksToggle = phone.getByRole('button', { name: /^Flasks/ });
if ((await flasksToggle.getAttribute('aria-expanded')) !== 'false') throw new Error('Flasks should start folded on a phone');
await flasksToggle.click();
await phone.getByText('700', { exact: true }).waitFor({ timeout: 5000 });
await phone.reload();
await phone.getByText('700', { exact: true }).waitFor({ timeout: 30000 });
console.log('phone: folded sections open on tap and are remembered');

// Run history: what the run found reaches the phone; a death and a new run turn it into a past run.
try {
  await phone.getByText(/\+\d+ creatures/).first().waitFor({ timeout: 40000 });
} catch (e) {
  console.log('phone run page:', (await phone.locator('main').innerText()).slice(0, 2500));
  console.log('PC run page:', (await pc.locator('main').innerText()).slice(0, 2500));
  throw e;
}
console.log('phone: creatures met this run counted in Found this run');
const dead = JSON.parse(liveRun(0, 300));
await writeSave(pc, { 'companion_live.json': JSON.stringify({ ...dead, status: 'dead', killedBy: 'zombie_weak', x: 320, y: 2450 }) });
await phone.getByText('You died').first().waitFor({ timeout: 30000 });
await writeSave(pc, { 'companion_live.json': JSON.stringify({ ...JSON.parse(liveRun(100, 0)), seed: 777, playtime: 3 }) });
// The died run is in the switcher; it opens in the same Run page, as it was at the end.
const pastChip = phone.locator('nav[aria-label="Runs"] a[href*="/run/1492787966-"]');
await pastChip.waitFor({ timeout: 40000 });
await pastChip.click();
await phone.getByText(/^Died · killed by zombie weak$/).waitFor({ timeout: 15000 });
await phone.getByText('Damage / sec').first().waitFor({ timeout: 30000 });
await phone.getByRole('button', { name: 'Open in builder' }).first().waitFor();
await phone.getByRole('button', { name: /^Where you died/ }).waitFor();
console.log('phone: the died run reopens in the Run page with its wands and where you died');
await phone.goto(BASE);
await phone.getByText('Run in progress').first().waitFor({ timeout: 15000 });
await phone.goto(`${BASE}progress`);
await phone.getByText(/^3\s*\/\s*\d+/).first().waitFor({ timeout: 30000 });
console.log('phone: new spell discovery arrived (3 spells)');

// A phone turned sideways gets the side rail: its last item must still be reachable.
{
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const land = await ctx.newPage();
  await land.goto(BASE);
  const settings = land.locator('nav[aria-label="Main"]:visible').getByRole('link', { name: 'Settings' });
  await settings.scrollIntoViewIfNeeded();
  const box = await settings.boundingBox();
  if (!box || box.y < 0 || box.y + box.height > 390) throw new Error(`Settings is off screen in landscape: ${JSON.stringify(box)}`);
  // The first-run welcome dialog covers the page in a fresh browser: dispatch the click.
  await settings.dispatchEvent('click');
  await land.waitForURL(/\/settings$/, { timeout: 5000 });
  if (shots) await land.screenshot({ path: join(shots, 'phone-landscape.png') });
  await ctx.close();
  console.log('landscape phone: the rail scrolls to its last item');
}

if (shots) {
  await phone.goto(`${BASE}run`);
  await phone.locator('nav[aria-label="Runs"] a[href*="/run/1492787966-"]').click();
  await phone.getByText('Damage / sec').first().waitFor({ timeout: 30000 });
  await phone.getByRole('button', { name: /^Where you died/ }).click();
  await phone.waitForTimeout(2500);
  await phone.screenshot({ path: join(shots, 'phone-past-run.png'), fullPage: true });
  await pc.goto(BASE);
  await pc.getByText('Run in progress').first().waitFor();
  await pc.screenshot({ path: join(shots, 'pc-home-live.png') });
  await pc.goto(`${BASE}run`);
  await pc.getByText('Damage / sec').first().waitFor();
  await pc.waitForTimeout(800);
  await pc.screenshot({ path: join(shots, 'pc-run.png'), fullPage: true });
  await phone.goto(`${BASE}run`);
  await phone.getByText('Damage / sec').first().waitFor({ timeout: 30000 });
  await phone.waitForTimeout(800);
  await phone.screenshot({ path: join(shots, 'phone-run.png') });
  await phone.locator('main').evaluate((m) => m.scrollTo(0, 99999));
  await phone.waitForTimeout(400);
  await phone.screenshot({ path: join(shots, 'phone-run-bottom.png') });
  await pc.goto(`${BASE}progress`);
  await pc.getByText('Live sync on').waitFor();
  await pc.screenshot({ path: join(shots, 'pc-progress-live.png') });
}
await browser.close();
