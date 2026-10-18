// Video 4: "Ride the Matatu" — the stage, boarding through the sliding door, the ride.
import { open, encode, ease, camLerp } from './lib.mjs';
const OUT = process.argv[2];
const S = (n) => `${OUT}/v4_${n}`;
const shots = [];
const f = await open({ spawn: [8, 112], time: 10.5 });
await f.warm(4);
// wait (unfilmed) for a matatu / nganya taking passengers to pull in near Abel and stop
let vid = -1;
for (let i = 0; i < 1800 && vid < 0; i++) {
  await f.step(5);
  vid = await f.ev(() => {
    const p = window.__mk.playerPosition;
    const v = window.__mk.vehicles.find((v) => (v.kind === 'matatu' || v.kind === 'nganya') && v.stopped && v.dwell > 5 && Math.hypot(v.x - p.x, v.z - p.z) < 60);
    return v ? v.id : -1;
  });
}
console.log('vehicle', vid);
const door = () => f.ev((id) => {
  const v = window.__mk.vehicles[id];
  const [dx, dz] = window.__mk.doorOf(v);
  const c = Math.cos(v.heading), s = Math.sin(v.heading);
  return { x: v.x + dx * c + dz * s, z: v.z - dx * s + dz * c, vx: v.x, vy: v.y, vz: v.z, h: v.heading, ox: c * 2.2, oz: -s * 2.2 };
}, vid);
let d = await door();
// Abel a few steps from the door
await f.teleport(d.x + d.ox * 1.4, d.z + d.oz * 1.4, Math.atan2(-d.ox, -d.oz));
await f.step(3);
// 1. the matatu waiting at the stage, conductor in the doorway
shots.push(await f.shot(S(1), 5, async (t, k) => {
  const fx = Math.sin(d.h), fz = Math.cos(d.h);
  await f.cam(camLerp([d.vx + fx * 9 + d.ox * 3.5, d.vy + 2.2, d.vz + fz * 9 + d.oz * 3.5, d.vx, d.vy + 1.3, d.vz], [d.vx + fx * 7 + d.ox * 3, d.vy + 1.6, d.vz + fz * 7 + d.oz * 3, d.vx, d.vy + 1.2, d.vz], ease(k)));
}));
// 2. boarding: F, Abel steps in through the door
let pressed = false;
shots.push(await f.shot(S(2), 7, async (t, k) => {
  d = await door();
  await f.cam([d.x + d.ox * 2.2 + Math.sin(d.h) * 3, d.vy + 1.7, d.z + d.oz * 2.2 + Math.cos(d.h) * 3, d.x, d.vy + 1.1, d.z]);
  if (!pressed && t > 0.3) {
    pressed = true;
    await f.press('KeyF');
  }
}));
// 3. the ride: the game's camera following the matatu
await f.cam(null);
shots.push(await f.shot(S(3), 7));
// 4. alongside the matatu with Abel aboard
shots.push(await f.shot(S(4), 6, async (t, k) => {
  const v = await f.ev((id) => { const v = window.__mk.vehicles[id]; return { x: v.x, y: v.y, z: v.z, h: v.heading }; }, vid);
  const fx = Math.sin(v.h), fz = Math.cos(v.h);
  await f.cam([v.x - fz * 5 + fx * (4 - k * 6), v.y + 2.0, v.z + fx * 5 + fz * (4 - k * 6), v.x, v.y + 1.3, v.z]);
}));
await f.close();
for (let i = 1; i <= 12; i++) encode(S(i), `${OUT}/v4_${i}.mp4`);
console.log('done', shots);
