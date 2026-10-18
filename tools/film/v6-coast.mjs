// Video 6: "The Coast" — the beach, running into the sea, the crawl, diving, treading at sunset.
import { open, encode, ease, lerp, camLerp } from './lib.mjs';
const OUT = process.argv[2];
const S = (n) => `${OUT}/v6_${n}`;
const shots = [];
const f = await open({ spawn: [1560, 10], time: 15.5 });
await f.warm(4);
const me = () => f.ev(() => ({ x: window.__mk.playerPosition.x, y: window.__mk.playerPosition.y, z: window.__mk.playerPosition.z, s: window.__mk.diving.surface }));

// 1. the beach from above, palms, kiosks and the waterline
shots.push(await f.shot(S(1), 6, async (t, k) => {
  await f.camRel(camLerp([1650, 30, 120, 1520, 0, -20], [1640, 22, -40, 1520, 0, -160], ease(k)));
}));
// 2. Abel runs down the sand into the sea
await f.teleport(1560, 10, Math.PI / 2);
await f.cam(null);
await f.key('KeyW');
await f.key('ShiftLeft');
shots.push(await f.shot(S(2), 8));
await f.key('ShiftLeft', false);
// 3. the crawl, chase camera
shots.push(await f.shot(S(3), 6));
// 4. at water level beside him
shots.push(await f.shot(S(4), 5, async (t, k) => {
  const p = await me();
  await f.cam([p.x + 1 - k * 2, p.s + 0.45, p.z + 3.2, p.x + 0.6, p.s, p.z]);
}));
await f.warm(2, 10);
await f.key('KeyC', false);
await f.key('KeyW', false);
await f.key('Space');
await f.warm(2.5, 10);
await f.key('Space', false);
// 6. treading water as the sun goes down
await f.clock(17.9);
await f.warm(1.5, 10);
shots.push(await f.shot(S(6), 6, async (t, k) => {
  await f.clock(17.9 + k * 0.5);
  const p = await me();
  await f.cam([p.x + 7 - k * 2, p.s + 1.6, p.z + 5, p.x, p.s + 0.4, p.z]);
}));
await f.close();
for (let i = 1; i <= 12; i++) encode(S(i), `${OUT}/v6_${i}.mp4`);
console.log('done', shots);
