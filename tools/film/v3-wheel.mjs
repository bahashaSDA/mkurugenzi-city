// Video 3: "Behind the Wheel" — get in a car, drive up the CBD avenue, then a boda on the expressway.
import { open, encode, ease, camLerp } from './lib.mjs';
const OUT = process.argv[2];
const S = (n) => `${OUT}/v3_${n}`;
const shots = [];
const f = await open({ spawn: [14, -400], time: 15.5 });
const CAR = { x: 9.5, z: -430, rot: Math.PI };
await f.ev((c) => window.__mk.useParking.getState().park({ piece: 'rv_car_2', x: c.x, z: c.z, y: window.__mk.surfaceAt(c.x, c.z), rotY: c.rot, health: 1000, fuel: 40 }), CAR);
// beside the driver's door (right-hand drive: the car's right), facing it
await f.teleport(CAR.x + 2.6, CAR.z + 1.2, -Math.PI / 2);
await f.warm(5);
const car = () => f.ev(() => ({ x: window.__mk.drive.x, y: window.__mk.drive.y, z: window.__mk.drive.z, h: window.__mk.drive.heading }));
// lane keeping: the car must hold x = CAR.x going north (A steers left = west, D right = east)
let lastX = CAR.x;
let steerKey = '';
const keepLane = async () => {
  const c = await car();
  const e = c.x - CAR.x + (c.x - lastX) * 12; // offset + its rate (damping)
  lastX = c.x;
  const want = e > 0.15 ? 'KeyA' : e < -0.15 ? 'KeyD' : '';
  if (want !== steerKey) {
    if (steerKey) await f.key(steerKey, false);
    if (want) await f.key(want);
    steerKey = want;
  }
  return c;
};

// 1. Abel walks up, opens the door and gets in
let pressed = false;
shots.push(await f.shot(S(1), 8, async (t, k) => {
  await f.camRel(camLerp([CAR.x + 5, 1.6, CAR.z - 4.5, CAR.x, 1.0, CAR.z], [CAR.x + 4, 1.4, CAR.z - 3.2, CAR.x + 0.3, 1.0, CAR.z], ease(k)));
  if (!pressed && t > 0.4) {
    pressed = true;
    await f.press('KeyF');
  }
}));
await f.warm(3);
// 2. pulling away up the avenue towards the towers (the game's own chase camera)
await f.cam(null);
await f.key('KeyW');
shots.push(await f.shot(S(2), 8, async () => { await keepLane(); }));
// 3. low tracking shot ahead of the car, looking back at it
shots.push(await f.shot(S(3), 6, async (t, k) => {
  const c = await keepLane();
  const fx = Math.sin(c.h), fz = Math.cos(c.h);
  await f.cam([c.x + fx * (9 - k * 2) - fz * 2.5, c.y + 0.9, c.z + fz * (9 - k * 2) + fx * 2.5, c.x, c.y + 0.8, c.z]);
}));
// 4. alongside at wheel height, the city sliding past
shots.push(await f.shot(S(4), 5, async (t, k) => {
  const c = await keepLane();
  const fx = Math.sin(c.h), fz = Math.cos(c.h);
  await f.cam([c.x + fz * 3.6 + fx * (1 - k * 2), c.y + 0.55, c.z - fx * 3.6 + fz * (1 - k * 2), c.x + fx * 1.5, c.y + 0.7, c.z + fz * 1.5]);
}));
await f.key('KeyW', false);
await f.close();

// --- the boda: east along the expressway
const b = await open({ spawn: [-500, -322], time: 16.5 });
const BODA = { x: -520, z: -319.8, rot: Math.PI / 2 };
await b.ev((c) => window.__mk.useBodas.getState().park({ piece: 'rv_boda', x: c.x, z: c.z, y: window.__mk.surfaceAt(c.x, c.z), rotY: c.rot }), BODA);
await b.teleport(BODA.x - 0.3, BODA.z - 1.4, 0);
await b.warm(5);
const bk = () => b.ev(() => ({ x: window.__mk.bike.x, y: window.__mk.bike.y, z: window.__mk.bike.z, h: window.__mk.bike.heading ?? Math.PI / 2 }));
await b.press('KeyF');
await b.warm(6);
await b.cam(null);
await b.key('KeyW');
await b.warm(1.5);
// 5. the boda: chase camera
shots.push(await b.shot(S(5), 7));
// 6. low, beside the rider
shots.push(await b.shot(S(6), 6, async (t, k) => {
  const c = await bk();
  const fx = Math.sin(c.h), fz = Math.cos(c.h);
  await b.cam([c.x - fz * 2.8 + fx * (2 - k * 3), c.y + 0.8, c.z + fx * 2.8 + fz * (2 - k * 3), c.x + fx, c.y + 1, c.z + fz]);
}));
await b.key('KeyW', false);
await b.close();
for (let i = 1; i <= 12; i++) encode(S(i), `${OUT}/v3_${i}.mp4`);
console.log('done', shots);
