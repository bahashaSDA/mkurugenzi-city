// Video 1: "Mkurugenzi City: Day" — aerial tour, morning to golden hour.
import { open, encode, ease, lerp, camLerp } from './lib.mjs';
const OUT = process.argv[2];
const f = await open({ spawn: [14, 40], time: 6.6 });
const S = (n) => `${OUT}/v1_${n}`;
const go = async (x, z, h, warm = 4) => {
  await f.teleport(x, z);
  if (h != null) await f.clock(h);
  await f.warm(warm);
};
const shots = [];

// 1. sunrise: rising over the shopping street, the CBD towers waking up on the horizon
await go(14, 60, 6.55);
shots.push(await f.shot(S(1), 6, async (t, k) => {
  await f.clock(6.5 + k * 0.7);
  await f.camRel(camLerp([16, 6, 175, 14, 4, -400], [18, 34, 150, 14, 30, -700], ease(k)));
}));

// 2. CBD: orbit Mkurugenzi Tower
await go(60, -1000, 10);
shots.push(await f.shot(S(2), 7, async (t, k) => {
  const a = 0.2 + ease(k) * 0.9;
  await f.camRel([-18 + Math.cos(a) * 190, 95 - k * 25, -1100 + Math.sin(a) * 190, -18, 45, -1100]);
}));

// 3. down the shopping street: a low drone along the avenue (people, kiosks, matatus)
await go(14, 40, 9.5);
shots.push(await f.shot(S(3), 7, async (t, k) => {
  const z = lerp(110, -60, ease(k));
  await f.camRel([12.5, 7 - k * 2.5, z, 14, 2, z - 30]);
}));

// 4. crane up over the market
await go(-30, 60, 11);
shots.push(await f.shot(S(4), 5, async (t, k) => {
  await f.camRel(camLerp([-20, 4, 90, -44, 1.5, 62], [-10, 30, 110, -60, 0, 40], ease(k)));
}));

// 6. traffic: tracking alongside a matatu on the avenue
await go(14, 0, 13);
const vid = await f.ev(() => {
  const v = window.__mk.vehicles.filter((v) => v.kind !== 'car' && Math.abs(v.x - 14) < 4 && v.z > -140 && v.z < 90).sort((a, b) => b.v - a.v)[0]
    ?? window.__mk.vehicles.filter((v) => v.kind !== 'car').sort((a, b) => Math.hypot(a.x - 14, a.z) - Math.hypot(b.x - 14, b.z))[0];
  return v.id;
});
await f.warm(1);
shots.push(await f.shot(S(6), 6, async (t, k) => {
  await f.ev(([id, k]) => {
    const v = window.__mk.vehicles[id];
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const sx = fz, sz = -fx;
    Object.assign(window.__mk.camOverride, { on: true, x: v.x - sx * 5 - fx * (3 - k * 4), y: v.y + 1.6, z: v.z - sz * 5 - fz * (3 - k * 4), lx: v.x + fx * 1, ly: v.y + 1.3, lz: v.z + fz * 1 });
  }, [vid, k]);
}));

// 7. Kibera: low over the rooftops along a lane, late sun
await go(-250, 20, 16.6);
shots.push(await f.shot(S(7), 7, async (t, k) => {
  await f.camRel(camLerp([-160, 9, 26, -260, 3, 14], [-215, 7, 22, -330, 3, 10], ease(k)));
}));

// 8. the beach: along the shoreline at palm height, waves rolling in
await go(1460, -40, 16.2);
shots.push(await f.shot(S(8), 6, async (t, k) => {
  const z = lerp(40, -60, ease(k));
  await f.camRel([1578, 3.2, z, 1606, 0.5, z - 45]);
}));

// 9. sunset over Kibera to the CBD skyline (timelapse into dusk)
await go(-420, 10, 17.9);
shots.push(await f.shot(S(9), 7, async (t, k) => {
  await f.clock(17.9 + k * 1.1);
  await f.camRel(camLerp([-440, 14, 40, 14, 60, -1100], [-430, 22, 30, 14, 70, -1100], ease(k)));
}));

await f.close();
for (let i = 1; i <= 12; i++) encode(S(i), `${OUT}/v1_${i}.mp4`);
console.log('done', shots);
