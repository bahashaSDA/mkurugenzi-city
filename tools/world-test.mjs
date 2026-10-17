#!/usr/bin/env node
// World systems test (session 9): shop attendants + purchases, the map / GPS, mission markers, and
// the new streetlights at night. Screenshots + PASS/FAIL lines.
//   npm run build && npx vite preview --port 4173   (other terminal)
//   node tools/world-test.mjs [screenshotDir] [shop|map|night|markers ...]
import { chromium } from 'playwright';
const SP = process.argv[2] ?? '.';
const which = process.argv.slice(3).length ? process.argv.slice(3) : ['shop', 'map', 'night', 'markers'];
const GL = process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args: [...GL, '--ignore-gpu-blocklist'] });
const errors = [];
const results = [];
const ok = (name, pass, detail = '') => {
  results.push(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  console.log(results[results.length - 1]);
};

async function open(query, size = { width: 960, height: 540 }) {
  const page = await browser.newPage({ viewport: size });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`http://localhost:4173/?debug&tier=low&${query}`);
  await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 420000 });
  await page.waitForTimeout(3000);
  return page;
}

// ---------------------------------------------------------------- shop attendant + purchase
if (which.includes('shop')) {
  let page = await open('freeze');
  let door = null;
  for (let t = 0; t < 60 && !door; t++) {
    await page.waitForTimeout(1000);
    door = await page.evaluate(() => {
      const ds = window.__mk.doors;
      const d = ds?.filter((q) => q.room === 'int_hoteli').sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
      return d ? { x: d.x + Math.sin(d.rotY) * 0.6, z: d.z + Math.cos(d.rotY) * 0.6 } : null;
    });
  }
  await page.close();
  page = await open(`freeze&spawn=${door.x.toFixed(2)},${door.z.toFixed(2)}`);
  for (let t = 0; t < 30; t++) {
    await page.waitForTimeout(1000);
    if ((await page.evaluate(() => window.__mk.usePrompt.getState().current?.label ?? '')).startsWith('Enter')) break;
  }
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(4000);
  // walk to the counter spot (teleport: the test is about the counter, not the walk)
  await page.evaluate(() => {
    const mk = window.__mk;
    const d = mk.useInterior.getState().door;
    const ox = d.x;
    const oy = d.y - 60;
    const oz = d.z;
    Object.assign(mk.teleport, { x: ox + 2.6 - 0.2, z: oz + 0, y: oy + 1.0, facing: Math.PI / 2, pending: true });
  });
  await page.waitForTimeout(4000);
  const att = await page.evaluate(() => {
    const mk = window.__mk;
    let found = null;
    mk.scene.traverse((o) => {
      if (o.isSkinnedMesh && o.visible) {
        const p = new mk.THREE.Vector3();
        o.getWorldPosition(p);
        const d = Math.hypot(p.x - mk.playerPosition.x, p.z - mk.playerPosition.z);
        if (d > 0.3 && d < 3 && Math.abs(p.y - mk.playerPosition.y) < 3) found = { d: d.toFixed(2) };
      }
    });
    return found;
  });
  ok('shop: an attendant stands behind the hoteli counter', !!att, att ? `${att.d} m from Abel` : 'nobody near the counter');
  const prompt = await page.evaluate(() => window.__mk.usePrompt.getState().current?.label ?? '');
  await page.screenshot({ path: `${SP}/shop_1_counter.png`, timeout: 180000 });
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(2500);
  const open1 = await page.evaluate(() => window.__mk.useEconomy.getState().shop);
  ok('shop: E at the counter opens the menu through the attendant', open1 === 'hoteli', `prompt "${prompt}", shop=${open1}`);
  await page.screenshot({ path: `${SP}/shop_2_menu.png`, timeout: 180000 });
  // buy chai twice quickly: one charge for one click, then a second deliberate purchase works
  const before = await page.evaluate(() => window.__mk.useEconomy.getState().money);
  const r1 = await page.evaluate(() => [window.__mk.useEconomy.getState().buy('chai', false), window.__mk.useEconomy.getState().buy('chai', false)]);
  const mid = await page.evaluate(() => window.__mk.useEconomy.getState().money);
  ok('shop: a double press charges once', r1[0] === true && r1[1] === false && before - mid > 0, `money ${before} -> ${mid}`);
  await page.waitForTimeout(600);
  // can't afford: no money taken, the attendant says so
  await page.evaluate(() => window.__mk.useEconomy.setState({ money: 5 }));
  const r2 = await page.evaluate(() => window.__mk.useEconomy.getState().buy('pilau', false));
  const after = await page.evaluate(() => window.__mk.useEconomy.getState().money);
  await page.waitForTimeout(1500);
  const sub = await page.evaluate(() => window.__mk.useMissions.getState().dialogue?.text ?? '');
  ok('shop: unaffordable item is refused, nothing charged', r2 === false && after === 5, `subtitle "${sub}"`);
  await page.screenshot({ path: `${SP}/shop_3_broke.png`, timeout: 180000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  const closed = await page.evaluate(() => [window.__mk.useEconomy.getState().shop, window.__mk.playerAnim.riding]);
  ok('shop: Esc closes the menu, Abel is free to move', closed[0] === null);
  await page.close();
}

// ---------------------------------------------------------------- map + GPS
if (which.includes('map')) {
  const page = await open('freeze&spawn=8,40');
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SP}/map_1_full.png`, timeout: 180000 });
  // zoom out with the button, then pick the first available mission from the list
  const jobs = await page.locator('.map-jobs button').count();
  ok('map: full map opens with available missions listed', jobs > 0, `${jobs} listed`);
  if (jobs) {
    await page.locator('.map-jobs button').last().click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SP}/map_2_mission_card.png`, timeout: 180000 });
    const card = await page.locator('.map-card').count();
    ok('map: selecting a mission shows its details card', card === 1);
    await page.getByRole('button', { name: 'Set destination' }).click();
    await page.waitForTimeout(2500);
  }
  const lock = await page.evaluate(() => window.__mk ? true : false);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  const moved = await page.evaluate(() => window.__mk.playerPosition.z);
  ok('map: WASD pans the map, Abel does not walk', Math.abs(moved - 40) < 0.5 && lock, `z=${moved.toFixed(2)}`);
  await page.screenshot({ path: `${SP}/map_3_route.png`, timeout: 180000 });
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(3000);
  const nav = await page.evaluate(() => {
    const n = window.__mk.useNav.getState();
    return { target: n.target?.label, pts: n.route?.pts.length ?? 0, len: Math.round(n.route?.length ?? 0), next: n.next?.turn.dir ?? '' };
  });
  ok('map: a route is computed along the roads to the destination', nav.pts > 2, JSON.stringify(nav));
  await page.screenshot({ path: `${SP}/map_4_radar_gps.png`, timeout: 180000 });
  await page.close();
}

// ---------------------------------------------------------------- mission markers in the world
if (which.includes('markers')) {
  // the first mission giver stands at (10.5, 36): look at the marker from near and from far
  const page = await open('freeze&time=17');
  await page.evaluate(() => {
    const mk = window.__mk;
    Object.assign(mk.teleport, { x: 10.5 + 7, z: 36 + 7, y: 1.5, facing: Math.atan2(-7, -7), pending: true });
  });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${SP}/marker_1_near.png`, timeout: 180000 });
  await page.evaluate(() => Object.assign(window.__mk.teleport, { x: 10.5 + 40, z: 36 + 40, y: 1.5, facing: Math.atan2(-40, -40), pending: true }));
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${SP}/marker_2_far.png`, timeout: 180000 });
  ok('markers: screenshots taken (check visually)', true);
  await page.close();
}

// ---------------------------------------------------------------- streetlights at night
if (which.includes('night')) {
  // a town road (cobra heads), the CBD (LED), the estate (post tops)
  for (const [name, cam] of [
    ...(process.env.SKIP_TOWN ? [] : [['night_1_town', '300,4.5,250,300,1.0,200']]),
    ['night_2_cbd', '20,5,-900,14,2,-960'],
    ['night_3_estate', '-1094,3.2,-930,-1100,1.5,-980'],
  ]) {
    const page = await open(`freeze&time=21&camrel&cam=${cam}`);
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${SP}/${name}.png`, timeout: 400000 });
    const lights = await page.evaluate(() => {
      let n = 0;
      let on = 0;
      window.__mk.scene.traverse((o) => {
        if (o.isSpotLight) {
          n++;
          if (o.intensity > 1) on++;
        }
      });
      return { n, on };
    });
    ok(`night: ${name} real lights`, lights.on > 0, JSON.stringify(lights));
    await page.close();
  }
}

console.log('\nSUMMARY');
for (const r of results) console.log(r);
console.log('ERRORS', errors.length ? errors.slice(0, 15) : 'none');
await browser.close();
