#!/usr/bin/env node
// Wardrobe, kinyozi and seats, end to end in the running build (session 12, Parts 9, 10, 11).
//   npm run build && npx vite preview --port 4173
//   node tools/wardrobe-test.mjs <shotDir> [boutique] [kinyozi] [bench]
import { chromium } from 'playwright';
const SP = process.argv[2] ?? '.';
const which = process.argv.slice(3).length ? process.argv.slice(3) : ['boutique', 'kinyozi', 'bench'];
const GL = process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args: [...GL, '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
const errors = [];
const R = {};
const check = (sect, name, ok, info = '') => {
  (R[sect] ??= []).push({ name, ok: !!ok, info });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${sect}] ${name}${info ? ` (${info})` : ''}`);
};

async function open(q, fresh = false) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`http://localhost:4173/?debug&tier=low&${q}`);
  if (fresh) await page.evaluate(() => { try { localStorage.removeItem('mk.wardrobe.v1'); localStorage.removeItem('mk.economy.v2'); } catch {} });
  if (fresh) await page.reload();
  await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 420000 });
  await page.waitForTimeout(5000);
  return page;
}
const money = (p) => p.evaluate(() => window.__mk.useEconomy.getState().money);
const look = (p) => p.evaluate(() => ({ ...window.__mk.abelLook.current?.state }));
const until = async (p, f, ms = 20000) => { const t0 = Date.now(); for (;;) { const v = await p.evaluate(f); if (v || Date.now() - t0 > ms) return v; await p.waitForTimeout(200); } };

/** Spawn outside a named shop door, go in, walk up to the person serving, press E. */
async function enterAndServe(name, walkMs) {
  let page = await open('');
  const d = await page.evaluate((n) => window.__mk.doors?.find((x) => x.name === n), name);
  await page.close();
  if (!d) throw new Error(`no door ${name}`);
  const sx = d.x + Math.sin(d.rotY) * 1.0, sz = d.z + Math.cos(d.rotY) * 1.0;
  page = await open(`spawn=${sx.toFixed(2)},${sz.toFixed(2)}`, true);
  await page.waitForTimeout(1500);
  await page.keyboard.press('KeyE'); // enter
  await until(page, () => !!window.__mk.useInterior.getState().door, 15000);
  await page.waitForTimeout(1500);
  // walk in towards the counter / the barber
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(walkMs);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(600);
  await page.keyboard.press('KeyE');
  await until(page, () => !!window.__mk.useEconomy.getState().shop, 8000);
  return page;
}

if (which.includes('boutique')) {
  const page = await enterAndServe('Utafraaaia Boutique', 1300);
  const shop = await page.evaluate(() => window.__mk.useEconomy.getState().shop);
  check('boutique', 'attendant opens the boutique', shop === 'boutique', shop);
  await page.evaluate(() => window.__mk.useEconomy.setState({ money: 10000 })); // enough to shop
  const m0 = await money(page);
  const row = (n) => page.locator('.wardrobe-panel li', { hasText: n });
  await row('Black Excellence hoodie').getByRole('button', { name: 'Try on' }).click();
  const tried = await until(page, () => window.__mk.abelLook.current?.state.outfit === 'hoodie_black' && !window.__mk.abelLook.current?.state.loading, 30000);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SP}/boutique_1_try_on.png` });
  check('boutique', 'try-on changes the model', tried, JSON.stringify(await look(page)));
  check('boutique', 'try-on is free', (await money(page)) === m0, `${m0} -> ${await money(page)}`);
  await row('Black Excellence hoodie').getByRole('button', { name: 'Buy' }).click();
  check('boutique', 'first press only asks to confirm', (await money(page)) === m0);
  const confirmBtn = row('Black Excellence hoodie').getByRole('button', { name: /Confirm/ });
  await confirmBtn.click();
  await page.waitForTimeout(150);
  // a frantic second click must not charge again (the button is gone or disabled; force a store call too)
  await page.evaluate(() => window.__mk.useWardrobe.getState().buyOutfit('hoodie_black'));
  const m1 = await money(page);
  check('boutique', 'charged exactly once', m1 === m0 - 3000, `${m0} -> ${m1}`);
  const st = await page.evaluate(() => { const w = window.__mk.useWardrobe.getState(); return { owned: w.owned, outfit: w.outfit }; });
  check('boutique', 'owned and worn after buying', st.owned.includes('hoodie_black') && st.outfit === 'hoodie_black', JSON.stringify(st));
  await page.getByRole('button', { name: 'Back to the tweed' }).click();
  const back = await until(page, () => window.__mk.abelLook.current?.state.outfit === 'signature', 5000);
  check('boutique', 'default outfit always available', back);
  await row('Black Excellence hoodie').getByRole('button', { name: 'Wear' }).click();
  const again = await until(page, () => window.__mk.abelLook.current?.state.outfit === 'hoodie_black', 8000);
  check('boutique', 're-wearing an owned outfit is free', again && (await money(page)) === m1);
  await page.getByRole('button', { name: /Take the cap off|Put the cap on/ }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SP}/boutique_2_bought.png` });
  // broke: can't buy what you can't afford
  await page.evaluate(() => window.__mk.useEconomy.setState({ money: 500 }));
  const broke = await page.evaluate(() => window.__mk.useWardrobe.getState().buyOutfit('track_coffee'));
  check('boutique', 'insufficient funds: no purchase', !broke && (await money(page)) === 500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  check('boutique', 'leaving restores the camera', await page.evaluate(() => !window.__mk.camOverride.on));
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('mk.wardrobe.v1') || '{}'));
  check('boutique', 'saved', persisted.outfit === 'hoodie_black' && persisted.owned?.includes('hoodie_black'), JSON.stringify(persisted));
  await page.close();
  // a new session keeps it
  const p2 = await open('');
  const kept = await until(p2, () => window.__mk.abelLook.current?.state.outfit === 'hoodie_black' && !window.__mk.abelLook.current?.state.loading, 30000);
  check('boutique', 'outfit persists after reload', kept, JSON.stringify(await look(p2)));
  await p2.screenshot({ path: `${SP}/boutique_3_after_reload.png` });
  await p2.close();
}

if (which.includes('kinyozi')) {
  const page = await enterAndServe('Kinyozi Fresh Cuts', 1500);
  const shop = await page.evaluate(() => window.__mk.useEconomy.getState().shop);
  check('kinyozi', 'barber opens the kinyozi', shop === 'kinyozi', shop);
  const seated = await until(page, () => !!window.__mk.seatingDebug().mine, 4000);
  check('kinyozi', 'Abel sits in the barber chair', seated, JSON.stringify(await page.evaluate(() => window.__mk.seatingDebug())));
  const m0 = await money(page);
  const row = (n) => page.locator('.wardrobe-panel li', { hasText: n });
  await row('Afro').getByRole('button', { name: 'Preview' }).click();
  const pv = await until(page, () => window.__mk.abelLook.current?.state.hair === 'afro' && !window.__mk.abelLook.current?.state.loading, 30000);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SP}/kinyozi_1_preview_afro.png` });
  check('kinyozi', 'preview shows the style (cap off for an afro)', pv && (await look(page)).cap === false, JSON.stringify(await look(page)));
  check('kinyozi', 'preview is free', (await money(page)) === m0);
  await row('Taper').getByRole('button', { name: 'Cut' }).click();
  await row('Taper').getByRole('button', { name: /Confirm/ }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SP}/kinyozi_2_cutting.png` });
  check('kinyozi', 'not charged before the cut is done', (await money(page)) === m0);
  const cut = await until(page, () => window.__mk.useWardrobe.getState().hair === 'taper', 9000);
  await until(page, () => window.__mk.abelLook.current?.state.hair === 'taper' && !window.__mk.abelLook.current?.state.loading, 30000);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SP}/kinyozi_3_taper.png` });
  check('kinyozi', 'cut applied and charged once', cut && (await money(page)) === m0 - 350, `${m0} -> ${await money(page)}`);
  await page.getByRole('button', { name: /Done/ }).click();
  await page.waitForTimeout(800);
  const st = await page.evaluate(() => ({ seat: window.__mk.seatingDebug().mine, shop: window.__mk.useEconomy.getState().shop }));
  check('kinyozi', 'Done: stands up, panel closed', !st.seat && !st.shop, JSON.stringify(st));
  await page.screenshot({ path: `${SP}/kinyozi_4_done.png` });
  await page.close();
}

if (which.includes('bench')) {
  // a stage shelter bench: stand at a seat's exit spot, E to sit, E to stand up
  let page = await open(''); // shelters are district content (not mounted with ?minimal)
  const sp = await until(page, () => window.__mk.seatingDebug().list.find((s) => s.id.startsWith('stage-')), 15000);
  await page.close();
  check('bench', 'stage benches registered', !!sp, sp ? sp.id : 'none');
  if (sp) {
    page = await open(`spawn=${sp.exit.x.toFixed(2)},${sp.exit.z.toFixed(2)}`);
    await page.waitForTimeout(1500);
    console.log('[bench] seat', JSON.stringify(sp), 'abel', JSON.stringify(await page.evaluate(() => ({ ...window.__mk.playerPosition }))));
    const prompt = await page.evaluate(() => [window.__mk.usePrompt.getState().current?.label ?? '', window.__mk.usePrompt.getState().other?.label ?? ''].join(' | '));
    check('bench', 'prompt offers the seat (main or second line)', /Sit/.test(prompt), prompt);
    await page.keyboard.press('KeyE');
    const sat = await until(page, () => !!window.__mk.seatingDebug().mine, 4000);
    await page.waitForTimeout(1200);
    const pose = await page.evaluate(() => ({ mine: window.__mk.seatingDebug().mine, p: { ...window.__mk.playerPosition }, clip: window.__mk.playerAnim.rideClip, riding: window.__mk.playerAnim.riding }));
    await page.screenshot({ path: `${SP}/bench_1_seated.png` });
    const onIt = sat && Math.hypot(pose.p.x - sp.x, pose.p.z - sp.z) < 0.05 && pose.riding && pose.clip === 'Sitting_Idle_Loop';
    check('bench', 'sits exactly on the seat, seated pose', onIt, JSON.stringify(pose));
    const label = await page.evaluate(() => window.__mk.usePrompt.getState().current?.label ?? '');
    check('bench', 'prompt says Stand up', label === 'Stand up', label);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1500);
    const up = await page.evaluate(() => ({ mine: window.__mk.seatingDebug().mine, p: { ...window.__mk.playerPosition }, riding: window.__mk.playerAnim.riding }));
    await page.screenshot({ path: `${SP}/bench_2_stood.png` });
    check('bench', 'stands up at the exit spot', !up.mine && !up.riding && Math.hypot(up.p.x - sp.exit.x, up.p.z - sp.exit.z) < 0.6, JSON.stringify(up));
    await page.close();
  }
}

console.log('ERRORS', errors.length ? errors.slice(0, 8) : 'none');
console.log(JSON.stringify(R));
await browser.close();
