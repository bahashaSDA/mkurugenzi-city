#!/usr/bin/env node
// End-to-end vehicle occupancy test (systems/vehicles/occupancy): car, boda, matatu.
//   npm run build && npx vite preview --port 4173   (other terminal)
//   node tools/vehicle-test.mjs [screenshotDir] [car|bike|matatu ...]
// For each vehicle: F from a few metres away -> Abel walks to the door -> boards -> is seated
// -> the vehicle moves -> F -> he gets out onto clear ground. Checked along the way:
//   - the phase sequence (approaching, boarding, seated, exiting, walking)
//   - SEAT ERROR: distance between Abel's rendered body and the seat anchor in the vehicle's
//     rendered frame, sampled every 100 ms while moving (must stay ~0: no trailing, no floating)
//   - the vehicle really moved; wheels turned; Abel ends up walking, visible, outside the vehicle
// Under software GL the simulation runs slower than real time, hence the long holds.
import { chromium } from 'playwright';
const SP = process.argv[2] ?? '.';
const which = process.argv.slice(3).length ? process.argv.slice(3) : ['car', 'bike', 'matatu'];
const GL = process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args: [...GL, '--ignore-gpu-blocklist'] });
const results = {};
const errors = [];

async function open(query, size = { width: 800, height: 450 }) {
  const page = await browser.newPage({ viewport: size });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`http://localhost:4173/?debug&tier=low&${query}`);
  await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 420000 });
  await page.waitForTimeout(4000);
  // sampler: seat error + phase log, every 100 ms, in the page
  await page.evaluate(() => {
    const mk = window.__mk;
    window.__log = { phases: [], seatErr: 0, seatErrMoving: 0, samples: 0 };
    const v = new mk.THREE.Vector3();
    const w = new mk.THREE.Vector3();
    let last = '';
    setInterval(() => {
      const o = mk.occ;
      if (o.phase !== last) {
        window.__log.phases.push(o.phase);
        last = o.phase;
      }
      if (o.phase === 'seated' && o.ride && mk.abelVisual) {
        const seat = o.ride.board[o.ride.board.length - 1].p;
        v.copy(seat).applyMatrix4(o.frame);
        mk.abelVisual.updateWorldMatrix(true, false);
        w.setFromMatrixPosition(mk.abelVisual.matrixWorld);
        const err = v.distanceTo(w);
        window.__log.seatErr = Math.max(window.__log.seatErr, err);
        const speed = Math.max(Math.abs(mk.drive.speed), Math.abs(mk.bike.speed));
        if (speed > 2) window.__log.seatErrMoving = Math.max(window.__log.seatErrMoving, err);
        window.__log.samples++;
      }
    }, 100);
  });
  return page;
}

const state = (page) =>
  page.evaluate(() => {
    const mk = window.__mk;
    return {
      phase: mk.occ.phase, kind: mk.occ.ride?.kind ?? '', drive: mk.drive.active, bike: mk.bike.active, ride: mk.ride.vehicle,
      speed: Math.max(Math.abs(mk.drive.speed), Math.abs(mk.bike.speed)), p: { ...mk.playerPosition }, prompt: mk.usePrompt.getState().current?.label ?? '',
      abortWhy: mk.occ.lastAbort, visible: mk.abelVisual?.visible, toasts: mk.useEconomy.getState().toasts.map((t) => t.text), log: window.__log,
    };
  });

async function waitPhase(page, want, ms) {
  const t0 = Date.now();
  for (;;) {
    const s = await state(page);
    if (s.phase === want) return s;
    if (Date.now() - t0 > ms) return s;
    await page.waitForTimeout(250);
  }
}

// ---------------------------------------------------------------- car
if (which.includes('car')) {
  let page = await open('minimal');
  const car = await page.evaluate((pref) => {
    const cars = window.__mk.useParking.getState().cars;
    // a car on the long straight CBD avenue (x = 14), so the drive has road ahead of it
    // CAR=rv_cruiser picks that model (nearest to the CBD avenue), default any real car there
    const want = pref || 'rv_';
    const c = cars.filter((p) => p.piece.startsWith(want) && Math.abs(p.x - 14) < 12 && p.z < -500 && p.z > -1000)
      .sort((a, b) => b.z - a.z)[0] ?? cars.filter((p) => p.piece.startsWith(want)).sort((a, b) => Math.hypot(a.x - 14, a.z + 700) - Math.hypot(b.x - 14, b.z + 700))[0] ?? cars[0];
    // spawn ~4 m off the driver's side (local -X), so Abel has to walk to the door
    const lx = -3.2;
    return { ...c, sx: c.x + lx * Math.cos(c.rotY) + 1.0 * Math.sin(c.rotY), sz: c.z - lx * Math.sin(c.rotY) + 1.0 * Math.cos(c.rotY) };
  }, process.env.CAR ?? '');
  await page.close();
  page = await open(`minimal&spawn=${car.sx.toFixed(2)},${car.sz.toFixed(2)}`);
  const r = { piece: car.piece, phases: [], walked: false, seated: false, moved: 0, seatErr: 0, seatErrMoving: 0, exited: false, outside: false, wheels: 0 };
  let s = await state(page);
  console.log('[car]', car.piece, 'prompt:', s.prompt);
  const p0 = s.p;
  await page.keyboard.press('KeyF');
  s = await waitPhase(page, 'boarding', 20000);
  r.walked = Math.hypot(s.p.x - p0.x, s.p.z - p0.z) > 1.5;
  await page.screenshot({ path: `${SP}/car_1_boarding.png` });
  // the door swings open on its hinge before Abel gets in (occ.door 0..1)
  r.doorMax = 0;
  for (let k = 0; k < 40; k++) {
    const dv = await page.evaluate(() => window.__mk.occ.door ?? 0);
    if (dv > r.doorMax) r.doorMax = +dv.toFixed(2);
    if (dv > 0.85) { await page.screenshot({ path: `${SP}/car_1b_door_open.png` }); break; }
    await page.waitForTimeout(60);
  }
  s = await waitPhase(page, 'seated', 25000);
  r.seated = s.phase === 'seated' && s.drive;
  await page.screenshot({ path: `${SP}/car_2_seated.png` });
  const wr0 = await page.evaluate(() => window.__mk.vc?.wheelRotation(2) ?? 0);
  const start = await page.evaluate(() => ({ x: window.__mk.drive.x, z: window.__mk.drive.z }));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(14000);
  await page.screenshot({ path: `${SP}/car_3_driving.png` });
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${SP}/car_4_turning.png` });
  await page.keyboard.up('KeyA');
  await page.keyboard.up('KeyW');
  const wr1 = await page.evaluate(() => window.__mk.vc?.wheelRotation(2) ?? 0);
  r.wheels = +(wr1 - wr0).toFixed(1);
  const mid = await page.evaluate(() => ({ x: window.__mk.drive.x, z: window.__mk.drive.z }));
  r.moved = +Math.hypot(mid.x - start.x, mid.z - start.z).toFixed(1);
  await page.keyboard.down('Space');
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(5000);
  await page.keyboard.up('KeyS');
  await page.waitForTimeout(3000);
  await page.keyboard.up('Space');
  s = await state(page);
  console.log(`[car] speed before exit ${(s.speed * 3.6).toFixed(1)} km/h`);
  await page.keyboard.press('KeyF');
  s = await waitPhase(page, 'exiting', 5000);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SP}/car_5_exiting.png` });
  s = await waitPhase(page, 'walking', 20000);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SP}/car_6_out.png` });
  s = await state(page);
  r.exited = s.phase === 'walking' && !s.drive && s.visible;
  const parked = await page.evaluate(() => window.__mk.useParking.getState().cars.slice(-1)[0]);
  r.outside = Math.hypot(s.p.x - parked.x, s.p.z - parked.z) > 1.0;
  r.phases = s.log.phases;
  r.seatErr = +s.log.seatErr.toFixed(3);
  r.seatErrMoving = +s.log.seatErrMoving.toFixed(3);
  r.toasts = s.toasts;
  r.abortWhy = s.abortWhy;
  results.car = r;
  console.log('[car]', JSON.stringify(r));
  await page.close();
}

// ---------------------------------------------------------------- boda
if (which.includes('bike')) {
  let page = await open('minimal');
  const b = await page.evaluate(() => {
    const bs = window.__mk.useBodas.getState().bikes;
    const c = bs[0];
    return { ...c, sx: c.x + 2.4 * Math.cos(c.rotY), sz: c.z - 2.4 * Math.sin(c.rotY) };
  });
  await page.close();
  page = await open(`minimal&spawn=${b.sx.toFixed(2)},${b.sz.toFixed(2)}`);
  const r = { phases: [], seated: false, moved: 0, turned: 0, seatErr: 0, seatErrMoving: 0, exited: false };
  let s = await state(page);
  console.log('[bike] prompt:', s.prompt);
  await page.keyboard.press('KeyF');
  s = await waitPhase(page, 'boarding', 20000);
  await page.screenshot({ path: `${SP}/bike_1_mount.png` });
  s = await waitPhase(page, 'seated', 20000);
  r.seated = s.phase === 'seated' && s.bike;
  await page.screenshot({ path: `${SP}/bike_2_seated.png` });
  const h0 = await page.evaluate(() => ({ x: window.__mk.bike.x, z: window.__mk.bike.z, h: window.__mk.bike.heading }));
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${SP}/bike_3_riding.png` });
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${SP}/bike_4_lean.png` });
  await page.keyboard.up('KeyD');
  await page.keyboard.up('KeyW');
  const h1 = await page.evaluate(() => ({ x: window.__mk.bike.x, z: window.__mk.bike.z, h: window.__mk.bike.heading }));
  r.moved = +Math.hypot(h1.x - h0.x, h1.z - h0.z).toFixed(1);
  r.turned = +(((h1.h - h0.h) * 180) / Math.PI).toFixed(0);
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(6000);
  await page.keyboard.up('KeyS');
  await page.keyboard.press('KeyF');
  s = await waitPhase(page, 'exiting', 5000);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SP}/bike_5_dismount.png` });
  s = await waitPhase(page, 'walking', 15000);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SP}/bike_6_off.png` });
  s = await state(page);
  r.exited = s.phase === 'walking' && !s.bike && s.visible;
  r.phases = s.log.phases;
  r.seatErr = +s.log.seatErr.toFixed(3);
  r.seatErrMoving = +s.log.seatErrMoving.toFixed(3);
  r.toasts = s.toasts;
  r.abortWhy = s.abortWhy;
  results.bike = r;
  console.log('[bike]', JSON.stringify(r));
  await page.close();
}

// ---------------------------------------------------------------- matatu
if (which.includes('matatu')) {
  const page = await open('spawn=9,100');
  const r = { phases: [], vehicle: '', boarded: false, paid: 0, seatErr: 0, seatErrMoving: 0, rode: 0, alighted: false, outside: false };
  // put Abel on the kerb a few metres from the door of a matatu/bus that is dwelling at a stop
  for (let t = 0; t < 90 && !r.vehicle; t++) {
    const v = await page.evaluate(() => {
      const mk = window.__mk;
      const v = mk.vehicles.find((q) => q.kind !== 'car' && q.stopped && q.dwell > 3 && !q.jackedUntil && (!window.__want || q.piece === window.__want));
      if (!v) return null;
      const door = mk.doorOf(v);
      const lx = door[0] + 3.0;
      const x = v.x + lx * Math.cos(v.heading) + door[1] * Math.sin(v.heading);
      const z = v.z - lx * Math.sin(v.heading) + door[1] * Math.cos(v.heading);
      Object.assign(mk.teleport, { x, z, y: v.y + 1.2, facing: v.heading - Math.PI / 2, pending: true });
      v.dwell = Math.max(v.dwell, 12);
      return `${v.kind}${v.id}:${v.piece}`;
    });
    if (v) r.vehicle = v;
    else await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(1500);
  let s = await state(page);
  console.log('[matatu]', r.vehicle, 'prompt:', s.prompt);
  const money0 = await page.evaluate(() => window.__mk.useEconomy.getState().money);
  await page.keyboard.press('KeyF');
  await waitPhase(page, 'boarding', 20000);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SP}/matatu_1_boarding.png` });
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `${SP}/matatu_1b_aisle.png` });
  s = await waitPhase(page, 'seated', 180000);
  r.boarded = s.phase === 'seated' && s.ride >= 0;
  r.paid = money0 - (await page.evaluate(() => window.__mk.useEconomy.getState().money));
  await page.screenshot({ path: `${SP}/matatu_2_seated.png` });
  if (r.boarded) {
    const start = await state(page);
    let moved = 0;
    for (let t = 0; t < 200 && !r.alighted; t++) {
      const now = await state(page);
      moved = Math.max(moved, Math.hypot(now.p.x - start.p.x, now.p.z - start.p.z));
      // ONCE=1: press F a single time while the matatu is moving: it must stop at the next stage and
      // let Abel off by itself (request stop); default: keep pressing until he's off
      if (moved > 40 && now.phase === 'seated' && (!process.env.ONCE || !r.asked)) {
        if (process.env.ONCE) r.askedMoving = now.speed > 2;
        r.asked = true;
        await page.keyboard.press('KeyF');
      }
      if (t === 4) await page.screenshot({ path: `${SP}/matatu_3_riding.png` });
      if (now.phase === 'exiting') await page.screenshot({ path: `${SP}/matatu_4_alighting.png` });
      await page.waitForTimeout(2000);
      const s2 = await state(page);
      r.alighted = s2.phase === 'walking' && s2.ride < 0;
    }
    r.rode = Math.round(moved);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SP}/matatu_5_off.png` });
    s = await state(page);
    r.outside = await page.evaluate(() => !window.__mk.vehicles.some((v) => {
      const p = window.__mk.playerPosition;
      const dx = p.x - v.x; const dz = p.z - v.z;
      const lx = dx * Math.cos(v.heading) - dz * Math.sin(v.heading);
      const lz = dx * Math.sin(v.heading) + dz * Math.cos(v.heading);
      return Math.abs(lx) < 1.0 && Math.abs(lz) < 2.8;
    }));
  }
  s = await state(page);
  r.phases = s.log.phases;
  r.seatErr = +s.log.seatErr.toFixed(3);
  r.seatErrMoving = +s.log.seatErrMoving.toFixed(3);
  r.toasts = s.toasts;
  results.matatu = r;
  console.log('[matatu]', JSON.stringify(r));
  await page.close();
}

console.log('RESULTS', JSON.stringify(results, null, 1));
console.log('ERRORS', errors.length ? errors.slice(0, 20) : 'none');
await browser.close();
