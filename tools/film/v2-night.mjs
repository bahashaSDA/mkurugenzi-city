// Video 2: "Mkurugenzi City: Night" — lights, traffic, the skyline after dark.
import { open, encode, ease, lerp, camLerp } from './lib.mjs';
const OUT = process.argv[2];
const f = await open({ spawn: [14, 40], time: 20.5 });
const S = (n) => `${OUT}/v2_${n}`;
const go = async (x, z, h, warm = 4) => {
  await f.teleport(x, z);
  if (h != null) await f.clock(h);
  await f.warm(warm);
};
const follow = (id, fn) => f.ev(([id, src]) => {
  const v = window.__mk.vehicles[id];
  const c = new Function('v', 'fx', 'fz', 'sx', 'sz', src)(v, Math.sin(v.heading), Math.cos(v.heading), Math.cos(v.heading), -Math.sin(v.heading));
  Object.assign(window.__mk.camOverride, { on: true, x: c[0], y: c[1], z: c[2], lx: c[3], ly: c[4], lz: c[5] });
}, [id, fn]);
const pick = (filter) => f.ev((src) => {
  const ok = new Function('v', src);
  const l = window.__mk.vehicles.filter((v) => ok(v)).sort((a, b) => b.v - a.v);
  return l[0]?.id ?? window.__mk.vehicles.find((v) => v.kind !== 'car').id;
}, filter);
const shots = [];

// 1. the CBD skyline at night: slow orbit, windows lit
await go(60, -1000, 21);
shots.push(await f.shot(S(1), 7, async (t, k) => {
  const a = 1.75 + ease(k) * 0.7;
  await f.camRel([-18 + Math.cos(a) * 280, 110 - k * 25, -1100 + Math.sin(a) * 280, -18, 50, -1100]);
}));

// 2. the shopping street after dark: street lamps, kiosks, headlights coming down the avenue
await go(14, 20, 20.3);
shots.push(await f.shot(S(2), 7, async (t, k) => {
  const z = lerp(60, -20, ease(k));
  await f.camRel([11, 3.5 + k * 3, z, 15, 2, z - 60]);
}));

// 3. a nganya at night: chase from behind and low, its lights on the tarmac
await go(14, 60, 20.8);
const ng = await pick(`return v.kind === 'nganya' && Math.abs(v.x - 14) < 300 && Math.abs(v.z) < 400`);
await f.warm(1);
shots.push(await f.shot(S(3), 7, async (t, k) => {
  await follow(ng, `return [v.x - fx * (9 - ${k} * 3) - sx * 1.5, v.y + 1.4, v.z - fz * (9 - ${k} * 3) - sz * 1.5, v.x + fx * 6, v.y + 1.2, v.z + fz * 6];`);
  await f.ev(([id]) => { const v = window.__mk.vehicles[id]; Object.assign(window.__mk.teleport, { pending: true, x: v.x - Math.sin(v.heading) * 20, z: v.z - Math.cos(v.heading) * 20, y: window.__mk.surfaceAt(v.x, v.z) + 0.95, facing: 0 }); }, [ng]);
}));

// 4. the expressway: traffic streaming past under the lamps
await go(-200, -300, 21.5);
shots.push(await f.shot(S(4), 6, async (t, k) => {
  await f.camRel(camLerp([-240, 10, -290, -100, 1, -316], [-220, 6, -292, -60, 1, -314], ease(k)));
}));

// 5. Kibera: the video hall's bulb and the lane at night, a slow push in
await go(-330, 26, 21);
shots.push(await f.shot(S(5), 6, async (t, k) => {
  await f.camRel(camLerp([-322, 3.2, 30, -330, 1.6, 13.7], [-327, 2.2, 22.5, -330, 1.6, 13.7], ease(k)));
}));

// 6. night into dawn over the hub (timelapse)
await go(14, 60, 4.6);
shots.push(await f.shot(S(6), 8, async (t, k) => {
  await f.clock(4.6 + k * 2.4);
  await f.camRel(camLerp([60, 40, 190, 14, 10, -300], [50, 45, 170, 14, 25, -500], ease(k)));
}));

await f.close();
for (let i = 1; i <= 12; i++) encode(S(i), `${OUT}/v2_${i}.mp4`);
console.log('done', shots);
