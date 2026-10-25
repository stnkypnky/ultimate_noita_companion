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

const steps: Step[] = [
  { name: 'splash', run: async (p) => { await p.goto(base); await p.waitForTimeout(400); } },
  { name: 'onboarding', run: async (p) => { await p.getByText('How much do you want to know?').waitFor(); await p.waitForTimeout(500); } },
  { name: 'home', run: async (p) => { await p.getByText('Hide everything for now').click(); await p.waitForTimeout(600); } },
  { name: 'spells-hidden', run: async (p) => { await p.goto(`${base}/spells`); await p.waitForTimeout(1800); } },
  { name: 'spells-all', run: async (p) => {
      await p.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('noita-companion'); r.onsuccess = () => res(r.result); });
        const tx = db.transaction('kv', 'readwrite');
        const store = tx.objectStore('kv');
        const cur = await new Promise<{ value: string } | undefined>((res) => { const g = store.get('progress'); g.onsuccess = () => res(g.result); });
        const v = JSON.parse(cur!.value); v.state.mode = 'all';
        store.put({ key: 'progress', value: JSON.stringify(v) });
        await new Promise((r) => (tx.oncomplete = r));
      });
      await p.goto(`${base}/spells`); await p.waitForTimeout(1800);
    } },
  { name: 'spell-detail', run: async (p) => { await p.goto(`${base}/spells/LIGHT_BULLET_TRIGGER`); await p.waitForTimeout(1900); } },
  { name: 'perk-detail', run: async (p) => { await p.goto(`${base}/perks/EDIT_WANDS_EVERYWHERE`); await p.waitForTimeout(1900); } },
  { name: 'materials', run: async (p) => { await p.goto(`${base}/materials`); await p.waitForTimeout(1900); } },
  { name: 'material-detail', run: async (p) => { await p.goto(`${base}/materials/water`); await p.waitForTimeout(1900); } },
  { name: 'items', run: async (p) => { await p.goto(`${base}/items/heart`); await p.waitForTimeout(1900); } },
  { name: 'alchemy', run: async (p) => {
      await p.goto(`${base}/alchemy`); await p.waitForTimeout(1600);
      await p.getByLabel('World seed').fill('1517558277');
      await p.getByLabel('First material').click(); await p.getByLabel('First material').fill('water');
      await p.getByRole('button', { name: /^Water water$/ }).first().click();
      await p.getByLabel('Second material').click(); await p.getByLabel('Second material').fill('lava');
      await p.getByRole('button', { name: /^Lava lava$/ }).first().click();
      await p.waitForTimeout(500);
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
