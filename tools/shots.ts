// Screenshots of the running dev server at phone and laptop sizes, for visual review.
// Usage: npx tsx tools/shots.ts <outDir> [baseUrl]
import { chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'shots';
const base = process.argv[3] ?? 'http://localhost:5173';
mkdirSync(out, { recursive: true });

const viewports = {
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  laptop: { width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
};

type Step = { name: string; run: (p: Page) => Promise<void> };

/** Changes the stored progress state (IndexedDB kv 'progress'), then the next navigation picks it up. */
const patchProgress = (p: Page, patch: Record<string, unknown>) =>
  p.evaluate(async (patch) => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('noita-companion'); r.onsuccess = () => res(r.result); });
    const tx = db.transaction('kv', 'readwrite');
    const store = tx.objectStore('kv');
    const cur = await new Promise<{ value: string } | undefined>((res) => { const g = store.get('progress'); g.onsuccess = () => res(g.result); });
    const v = JSON.parse(cur!.value); Object.assign(v.state, patch);
    store.put({ key: 'progress', value: JSON.stringify(v) });
    await new Promise((r) => (tx.oncomplete = r));
  }, patch);

// An empty synced save: unlocks the app with nothing discovered yet.
const EMPTY_SAVE = { progress: { syncedAt: '2026-01-01T00:00:00.000Z', flags: [], enemies: [], orbs: [] } };

const steps: Step[] = [
  { name: 'splash', run: async (p) => { await p.goto(base); await p.waitForTimeout(400); } },
  { name: 'onboarding', run: async (p) => { await p.getByText('Bring your save').waitFor(); await p.waitForTimeout(500); } },
  { name: 'home-no-save', run: async (p) => { await p.getByText('Look around first').click(); await p.waitForTimeout(600); } },
  { name: 'spells-locked', run: async (p) => { await p.goto(`${base}/spells`); await p.waitForTimeout(1800); } },
  { name: 'home', run: async (p) => { await patchProgress(p, EMPTY_SAVE); await p.goto(base); await p.waitForTimeout(1500); } },
  { name: 'spells-hidden', run: async (p) => { await p.goto(`${base}/spells`); await p.waitForTimeout(1800); } },
  { name: 'bestiary-hidden', run: async (p) => { await p.goto(`${base}/bestiary/boss_alchemist`); await p.waitForTimeout(1800); } },
  { name: 'spells-all', run: async (p) => {
      await patchProgress(p, { mode: 'all' });
      await p.goto(`${base}/spells`); await p.waitForTimeout(1800);
    } },
  { name: 'spell-detail', run: async (p) => { await p.goto(`${base}/spells/LIGHT_BULLET_TRIGGER`); await p.waitForTimeout(1900); } },
  { name: 'perk-detail', run: async (p) => { await p.goto(`${base}/perks/EDIT_WANDS_EVERYWHERE`); await p.waitForTimeout(1900); } },
  { name: 'bestiary', run: async (p) => { await p.goto(`${base}/bestiary/acidshooter`); await p.waitForTimeout(1900); } },
  { name: 'bestiary-boss', run: async (p) => { await p.goto(`${base}/bestiary/boss_alchemist`); await p.waitForTimeout(1900); } },
  { name: 'wand', run: async (p) => {
      for (const id of ['BURST_2', 'LIGHT_BULLET_TRIGGER', 'BOMB', 'LIGHT_BULLET']) {
        await p.goto(`${base}/wand?add=${id}`);
        await p.getByText(/^Added /).waitFor({ timeout: 15000 });
      }
      await p.waitForTimeout(1500);
    } },
  { name: 'materials', run: async (p) => { await p.goto(`${base}/materials`); await p.waitForTimeout(1900); } },
  { name: 'material-detail', run: async (p) => { await p.goto(`${base}/materials/water`); await p.waitForTimeout(1900); } },
  { name: 'items', run: async (p) => { await p.goto(`${base}/items/heart`); await p.waitForTimeout(1900); } },
  { name: 'alchemy', run: async (p) => {
      await p.goto(`${base}/alchemy`); await p.waitForTimeout(1600);
      const pick = p.getByLabel(/Type a material/);
      await pick.click(); await pick.fill('pheromone'); await pick.press('Enter');
      await p.waitForTimeout(500);
    } },
  { name: 'alchemy-all', run: async (p) => {
      await p.getByRole('button', { name: /Reveal all recipes/ }).click();
      await p.getByRole('button', { name: 'Show everything' }).click().catch(() => {});
      await p.getByPlaceholder('Filter by material…').fill('blood');
      await p.waitForTimeout(500);
    } },
  { name: 'lightning', run: async (p) => {
      await p.goto(`${base}/wand`);
      await p.getByLabel('Clear spells').click();
      await p.goto(`${base}/wand?add=LIGHTNING`);
      await p.getByText(/^Added /).waitFor({ timeout: 15000 });
      await p.getByRole('tab', { name: 'Preview' }).click();
      await p.getByTitle('Auto-fire at the target (F)').click();
      await p.getByLabel(/^Test range:/).scrollIntoViewIfNeeded();
      await p.waitForTimeout(1500);
    } },
];

const browser = await chromium.launch();
for (const [vpName, vp] of Object.entries(viewports)) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch, deviceScaleFactor: vp.deviceScaleFactor });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  for (const s of steps) {
    try {
      await s.run(page);
      await page.screenshot({ path: join(out, `${vpName}-${s.name}.png`) });
    } catch (e) {
      errors.push(`${s.name}: ${e}`);
    }
  }
  if (errors.length) console.log(`[${vpName}] errors:\n  ${errors.join('\n  ')}`);
  await ctx.close();
}
await browser.close();
console.log('saved to', out);
