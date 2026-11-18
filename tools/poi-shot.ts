// Screenshots of the World Map's points of interest (dev check). Needs `npx vite preview --port 4173`.
// Usage: npx tsx tools/poi-shot.ts <out dir> [seed]
import { chromium } from '@playwright/test';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:4173/';
const out = process.argv[2]!;
const seed = process.argv[3] ?? '123';
const browser = await chromium.launch();
for (const [name, viewport, mobile] of [
  ['pc', { width: 1280, height: 900 }, false],
  ['phone', { width: 390, height: 844 }, true],
] as const) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript((s) => {
    localStorage.setItem('map-spoilers', '1');
    localStorage.setItem('map-seed', s);
  }, seed);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message));
  page.on('console', (m) => m.type() === 'error' && console.log(`[${name}]`, m.text()));
  // An empty synced save unlocks the map (as tools/shots.ts does).
  await page.goto(BASE);
  await page.getByText('Look around first').click();
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => {
      const r = indexedDB.open('noita-companion');
      r.onsuccess = () => res(r.result);
    });
    const tx = db.transaction('kv', 'readwrite');
    const store = tx.objectStore('kv');
    const cur = await new Promise<{ value: string } | undefined>((res) => {
      const g = store.get('progress');
      g.onsuccess = () => res(g.result);
    });
    const v = JSON.parse(cur!.value);
    Object.assign(v.state, { progress: { syncedAt: '2026-01-01T00:00:00.000Z', flags: [], enemies: [], orbs: [] } });
    store.put({ key: 'progress', value: JSON.stringify(v) });
    await new Promise((r) => (tx.oncomplete = r));
  });
  // Hiisi Base, around this seed's kitchen.
  await page.goto(`${BASE}map/32-25?seed=${seed}`);
  await page.getByText('Points of interest', { exact: true }).waitFor({ timeout: 60000 });
  console.log(`${name}: area details list points of interest`);
  const details = await page.locator('main').innerText();
  console.log(details.slice(details.indexOf('Points of interest'), details.indexOf('Points of interest') + 600));
  // Zoom the map in on the selected area.
  const canvas = page.locator('canvas[role="img"]');
  const box = (await canvas.boundingBox())!;
  if (!mobile) {
    // Hiisi Base sits about 47% across and half way down the whole-world view.
    await page.mouse.move(box.x + box.width * 0.466, box.y + box.height * 0.52);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -250);
      await page.waitForTimeout(60);
    }
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, `${name}-map-pois.png`) });
  // The seed tab's Holy Mountain shops: wands show every slot, empty ones too.
  await page.goto(`${BASE}map#seed`);
  const wandShop = page.getByText(/\d+\/cast · \d+ slots/).first();
  await wandShop.waitFor({ timeout: 60000 });
  await wandShop.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(out, `${name}-shop-wands.png`) });
  void box;
  await ctx.close();
}
await browser.close();
