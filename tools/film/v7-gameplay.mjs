// Video 7: "Gameplay" — with the HUD: a mission briefing, the objective, filling up at a pump,
// the radio playing Mkurugenzi Stories.
import { open, encode } from './lib.mjs';
const OUT = process.argv[2];
const S = (n) => `${OUT}/v7_${n}`;
const shots = [];
const f = await open({ spawn: [12, 40], time: 9.5, hud: true, query: 'markers' });
await f.warm(4);
// 1. the mission briefing (the game's cinematic, letterboxed)
await f.ev(() => window.__mk.useMissions.getState().begin('chai'));
shots.push(await f.shot(S(1), 11));
// (the rest of the briefing, unfilmed) then 2. the objective on screen, Abel heading off
for (let i = 0; i < 900 && (await f.ev(() => window.__mk.useCutscene.getState().active)); i++) await f.step(3);
await f.warm(0.5);
await f.key('KeyW');
shots.push(await f.shot(S(2), 6));
await f.key('KeyW', false);
await f.close();

// 3. the petrol station: pull up under the canopy and fill up (E)
const g = await open({ spawn: [80, 340], time: 11, hud: true });
await g.ev(() => window.__mk.useParking.getState().park({ piece: 'rv_car_2', x: 80, z: 345, y: window.__mk.surfaceAt(80, 345), rotY: Math.PI / 2, health: 1000, fuel: 6 }));
await g.teleport(80.4, 347.1, Math.PI);
await g.warm(4);
await g.press('KeyF');
await g.warm(9);
let pressed = false;
shots.push(await g.shot(S(3), 8, async (t) => {
  if (!pressed && t > 1.5) {
    pressed = true;
    await g.press('KeyE');
  }
}));
await g.close();
for (let i = 1; i <= 12; i++) encode(S(i), `${OUT}/v7_${i}.mp4`);
console.log('done', shots);
