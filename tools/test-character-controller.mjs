#!/usr/bin/env node
// Regression test for the player's Rapier character controller on the world ground collider.
// History: a single 1.6 km cuboid ground made the controller sink ~17 cm while walking
// (shape-cast precision loss). The ground is now a heightfield; this guards against regressions.
//   node tools/test-character-controller.mjs
import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init({});

const REST_Y = 0.85 + 0.02; // capsule half-height + radius + controller offset
// Sprinting across heightfield triangle edges dips up to ~1.7 cm for a frame (invisible).
// The bug this guards against was 17 cm, so 3 cm separates "fine" from "broken" clearly.
const TOLERANCE = 0.03;

const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
const n = 64;
world.createCollider(RAPIER.ColliderDesc.heightfield(n, n, new Float32Array((n + 1) * (n + 1)), { x: 1600, y: 1, z: 1600 }));
const rb = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 2, 8));
const col = world.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.3), rb);
const c = world.createCharacterController(0.02);
c.enableAutostep(0.35, 0.15, false);
c.enableSnapToGround(0.3);
c.setMaxSlopeClimbAngle(Math.PI / 4);

let vy = 0, grounded = false, minY = Infinity;
for (let f = 0; f < 600; f++) {
  if (grounded && vy <= 0) vy = -1; else vy += -18 / 60;
  const walking = f > 30;
  c.computeColliderMovement(col, { x: walking ? 1.5 / 60 : 0, y: vy / 60, z: walking ? -7 / 60 : 0 });
  const m = c.computedMovement();
  grounded = c.computedGrounded();
  if (grounded && vy < 0) vy = 0;
  const p = rb.translation();
  rb.setNextKinematicTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z });
  world.step();
  if (f > 40) minY = Math.min(minY, rb.translation().y);
}
const ok = minY > REST_Y - TOLERANCE;
console.log(`[kcc] min height while sprinting ${minY.toFixed(3)} (rest ${REST_Y.toFixed(3)}) ${ok ? 'PASS' : 'FAIL: player sinks into the ground'}`);
process.exit(ok ? 0 : 1);
