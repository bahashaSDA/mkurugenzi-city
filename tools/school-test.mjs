#!/usr/bin/env node
// Freddie's School interior + secrets (session 12).
//   npm run build && npx vite preview --port 4173 ; node tools/school-test.mjs <shotDir>
import { chromium } from 'playwright';
const SP = process.argv[2] ?? '.';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = [];
const check = (n, ok, info = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${info ? ` (${info})` : ''}`);
async function open(q, fresh) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`http://localhost:4173/?debug&tier=low&${q}`);
  if (fresh) { await page.evaluate(() => { try { localStorage.removeItem('mk.secrets.v1'); } catch {} }); await page.reload(); }
  await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 420000 });
  await page.waitForTimeout(5000);
  return page;
}
const until = async (page, f, ms) => { const t0 = Date.now(); for (;;) { const v = await page.evaluate(f); if (v || Date.now() - t0 > ms) return v; await page.waitForTimeout(250); } };
/** Put Abel at a room-local spot (three.js local x/z) and face him (0 = towards the door, PI = in). */
const goto = (page, lx, lz, facing) => page.evaluate(([lx, lz, facing]) => {
  const mk = window.__mk; const d = mk.useInterior.getState().door;
  Object.assign(mk.teleport, { pending: true, x: d.x + lx, y: d.y - 60 + 0.95, z: d.z + lz, facing });
}, [lx, lz, facing]);

let page = await open('');
const door = await page.evaluate(() => window.__mk.doors.find((d) => d.name === "Freddie's School"));
check('the school has a door', !!door, door ? `${door.x.toFixed(0)},${door.z.toFixed(0)}` : '');
await page.close();
page = await open(`spawn=${(door.x + Math.sin(door.rotY) * 1.0).toFixed(2)},${(door.z + Math.cos(door.rotY) * 1.0).toFixed(2)}`, true);
await page.waitForTimeout(1500);
const prompt = await page.evaluate(() => window.__mk.usePrompt.getState().current?.label ?? '');
check('prompt to enter the school', /Freddie/.test(prompt), prompt);
await page.keyboard.press('KeyE');
const inside = await until(page, () => window.__mk.useInterior.getState().door?.room === 'int_school', 12000);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SP}/school_1_reception.png` });
check('inside Freddie\'s School', !!inside);
const y0 = await page.evaluate(() => window.__mk.playerPosition.y);
await page.waitForTimeout(1500);
const y1 = await page.evaluate(() => window.__mk.playerPosition.y);
check('stands on the floor (no falling through)', Math.abs(y1 - y0) < 0.05, `${y0.toFixed(2)} -> ${y1.toFixed(2)}`);
// into Form 2 East through its doorway: walk from the hall to the room (collision on)
await goto(page, -3.75, 2.4, Math.PI);
await page.waitForTimeout(1200);
await page.keyboard.down('KeyW'); await page.waitForTimeout(1600); await page.keyboard.up('KeyW');
await page.waitForTimeout(800);
const p = await page.evaluate(() => { const mk = window.__mk; const d = mk.useInterior.getState().door; return { lz: mk.playerPosition.z - d.z, lx: mk.playerPosition.x - d.x }; });
check('walks through the doorway into the classroom', p.lz < 1.2, JSON.stringify(p));
await page.screenshot({ path: `${SP}/school_2_classroom.png` });
// sit at a free desk
const seat = await page.evaluate(() => window.__mk.seatingDebug().list.find((s) => /f2e-/.test(s.id) && !window.__mk.seatingDebug().claimed.includes(s.id)));
const pupils = await page.evaluate(() => window.__mk.seatingDebug().claimed.length);
check('pupils sit at their desks (seats taken)', pupils >= 8, `${pupils}`);
await page.evaluate((s) => Object.assign(window.__mk.teleport, { pending: true, x: s.exit.x, y: s.exit.y + 0.95, z: s.exit.z, facing: Math.PI }), seat);
await page.waitForTimeout(1200);
await page.keyboard.press('KeyE');
const sat = await until(page, () => !!window.__mk.seatingDebug().mine, 3000);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SP}/school_3_at_desk.png` });
check('sits at a free desk', sat);
await page.keyboard.press('KeyE');
await page.waitForTimeout(800);
// the office: the old class photo
await goto(page, 1.0, -4.6, Math.PI);
await page.waitForTimeout(1500);
const lbl = await page.evaluate(() => window.__mk.usePrompt.getState().current?.label ?? '');
await page.keyboard.press('KeyE');
await page.waitForTimeout(800);
const found = await page.evaluate(() => window.__mk.useSecrets.getState().found);
await page.screenshot({ path: `${SP}/school_4_office.png` });
check('the easter egg in the head teacher\'s office', found.includes('oldboy-photo'), `${lbl}; ${JSON.stringify(found)}`);
await page.close();
// a Story Tape at the matatu stage
page = await open('');
const tape = await page.evaluate(() => window.__mk.secretSpots().find((s) => s.id === 'tape-stage'));
await page.close();
page = await open(`spawn=${(tape.x + 1).toFixed(2)},${tape.z.toFixed(2)}`);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SP}/tape_1_seen.png` });
const tl = await page.evaluate(() => window.__mk.usePrompt.getState().current?.label ?? '');
const m0 = await page.evaluate(() => window.__mk.useEconomy.getState().money);
await page.keyboard.press('KeyE');
await page.waitForTimeout(800);
const m1 = await page.evaluate(() => window.__mk.useEconomy.getState().money);
const f2 = await page.evaluate(() => window.__mk.useSecrets.getState().found);
check('Story Tape picked up and rewarded once', f2.includes('tape-stage') && m1 - m0 === 150, `${tl}; ${m0} -> ${m1}`);
await page.keyboard.press('KeyE');
await page.waitForTimeout(500);
check('no second reward', (await page.evaluate(() => window.__mk.useEconomy.getState().money)) === m1);
await page.keyboard.press('KeyI');
await page.waitForTimeout(800);
await page.screenshot({ path: `${SP}/tape_2_bag.png` });
console.log('ERRORS', errors.length ? errors.slice(0, 6) : 'none');
await browser.close();
