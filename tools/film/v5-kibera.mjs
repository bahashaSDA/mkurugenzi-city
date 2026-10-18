// Video 5: "Kibera" — the lanes, a mugging (they beat you and take your cash), the video hall.
import { open, encode, ease, lerp, camLerp } from './lib.mjs';
const OUT = process.argv[2];
const S = (n) => `${OUT}/v5_${n}`;
const shots = [];
const f = await open({ spawn: [-170, 18], time: 16.8 });
await f.warm(4);
// the main lane's centre line (kibera-main: (-147, 20) -> (-220, 10))
const laneZ = (x) => 20 - ((-147 - x) / 73) * 10;
const me = () => f.ev(() => ({ ...window.__mk.playerPosition, ...{ x: window.__mk.playerPosition.x, y: window.__mk.playerPosition.y, z: window.__mk.playerPosition.z } }));

// 1. rooftops of Kibera in the late sun, drifting down towards the main lane
shots.push(await f.shot(S(1), 6, async (t, k) => {
  await f.camRel(camLerp([-200, 26, 70, -260, 2, 10], [-190, 9, 40, -240, 1.5, 16], ease(k)));
}));
// 2. walking the main lane (the game's own camera)
await f.teleport(-175, 19, -Math.PI / 2);
await f.cam(null);
await f.key('KeyW');
shots.push(await f.shot(S(2), 7));
await f.key('KeyW', false);
await f.warm(0.5);
// 3. the mugging: they come up the lane, beat him and run with his money
// Abel stands in the open lane (not tucked behind a shack), facing west down it
await f.teleport(-196, laneZ(-196), -Math.PI / 2);
await f.warm(0.5);
await f.ev(() => (window.__mk.mugging.force = true));
let p = await me();
shots.push(await f.shot(S(3), 14, async (t, k) => {
  // a low wide shot from ahead and to the side, slowly closing in on Abel
  // down the lane ahead of him (the lane runs east-west here), never into a shack
  await f.cam([p.x - 8 + k * 2.5, p.y + 1.0, laneZ(p.x - 8 + k * 2.5), p.x, p.y + 0.2, p.z]);
}));
// 4. Abel hits back at whoever is still in reach
shots.push(await f.shot(S(4), 6, async (t, k) => {
  p = await me();
  await f.cam([p.x - 4.5, p.y + 0.9, laneZ(p.x - 4.5), p.x, p.y + 0.3, p.z]);
  if (Math.round(t * 30) % 14 === 0) await f.press(Math.round(t * 30) % 42 === 0 ? 'KeyQ' : 'KeyR');
}));
// 5. dusk: the video hall's bulb comes on over the lane
await f.teleport(-330, 25, Math.PI);
await f.clock(18.6);
await f.warm(3);
shots.push(await f.shot(S(5), 6, async (t, k) => {
  await f.clock(18.6 + k * 0.5);
  await f.camRel(camLerp([-321, 3.4, 31, -330, 1.6, 13.7], [-327, 2.4, 23, -330, 1.6, 13.7], ease(k)));
}));
await f.close();
for (let i = 1; i <= 12; i++) encode(S(i), `${OUT}/v5_${i}.mp4`);
console.log('done', shots);
