import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { useRef } from 'react';
import { playerPosition } from './player/playerState';
import { useGame } from '../app/store';

// Static colliders only exist near the player. The city has ~10 000 of them (a box or hull per
// shack, stall, wall and prop) and Rapier pays for every one on every step, even when nothing moves:
// 1.7 ms a step on a PC, ~0.3 ms with the far ones switched off (measured, tools/physics-step.mjs). On a
// phone that is several milliseconds per step, and a slow frame takes several steps.
// Kept always: the terrain (heightfield), the roads (trimeshes), triggers (sensors), and anything
// on a moving body. Switched in small batches with a gap between the on and off distances, so
// nothing flickers at the edge; a jump (teleport, entering a building) switches its area at once,
// before the next physics step (this runs just before physics).
// Positions: a collider reports where its body is only after a physics step (bodies placed after
// they are created report their old spot until then), so streaming starts a few frames into play,
// a collider's position is read again right before it is switched off, and cached positions are
// refreshed in rotation.

const ON_M = 170;
const OFF_M = 210;
const BATCH = 400;
const TICK_S = 0.25;
const JUMP_M = 60;
// Rapier ShapeType: 6 TriMesh, 7 HeightField
const ALWAYS = new Set([6, 7]);
const REFRESH = 600; // cached positions re-read per tick (all ~10 000 within ~4 s)

interface Entry {
  handle: number;
  x: number;
  z: number;
  on: boolean;
}

export function ColliderStreaming() {
  const { world } = useRapier();
  const st = useRef({ t: 99, list: [] as Entry[], count: -1, lx: Infinity, lz: Infinity, cursor: 0, playFrames: 0, refresh: 0 });

  useFrame((_, dt) => {
    const s = st.current;
    if (useGame.getState().phase !== 'playing') return;
    if (s.playFrames < 3) {
      s.playFrames++; // let physics step first (positions)
      return;
    }
    s.t += dt;
    const jumped = Math.hypot(playerPosition.x - s.lx, playerPosition.z - s.lz) > JUMP_M;
    if (s.t < TICK_S && !jumped) return;
    s.t = 0;
    s.lx = playerPosition.x;
    s.lz = playerPosition.z;

    // (re)index when colliders were added or removed (streamed cells, vehicles, rooms)
    const n = world.colliders.len();
    if (n !== s.count) {
      const old = new Map(s.list.map((e) => [e.handle, e]));
      const list: Entry[] = [];
      world.colliders.forEach((c) => {
        if (c.isSensor() || ALWAYS.has(c.shape.type as number)) return;
        const body = c.parent();
        if (body && !body.isFixed()) return;
        const prev = old.get(c.handle);
        if (prev) return list.push(prev);
        const t = c.translation();
        list.push({ handle: c.handle, x: t.x, z: t.z, on: c.isEnabled() });
      });
      s.list = list;
      s.count = n;
      s.cursor = 0;
    }
    // keep cached positions true (a few hundred per tick)
    for (let k = 0; k < REFRESH && s.list.length; k++) {
      s.refresh = (s.refresh + 1) % s.list.length;
      const e = s.list[s.refresh]!;
      const c = world.getCollider(e.handle);
      if (!c) continue;
      const t = c.translation();
      e.x = t.x;
      e.z = t.z;
    }

    // toggle what crossed the edge: everything after a jump, otherwise a batch at a time
    const px = playerPosition.x;
    const pz = playerPosition.z;
    const on2 = ON_M * ON_M;
    const off2 = OFF_M * OFF_M;
    let budget = jumped ? Infinity : BATCH;
    const L = s.list.length;
    for (let k = 0; k < L && budget > 0; k++) {
      const e = s.list[(s.cursor + k) % L]!;
      const d2 = (e.x - px) ** 2 + (e.z - pz) ** 2;
      let want = e.on ? d2 < off2 : d2 < on2;
      if (want === e.on) continue;
      const c = world.getCollider(e.handle);
      if (!c) continue;
      if (!want) {
        // about to switch it off: make sure it really is far (fresh position)
        const t = c.translation();
        e.x = t.x;
        e.z = t.z;
        want = (e.x - px) ** 2 + (e.z - pz) ** 2 < off2;
        if (want) continue;
      }
      c.setEnabled(want);
      e.on = want;
      budget--;
    }
    if (L) s.cursor = (s.cursor + 997) % L; // the next batches start elsewhere (no starvation)
  }, -101);

  return null;
}
