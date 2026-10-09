import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier';
import type { Collider, KinematicCharacterController } from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { input, inputLock, onCameraToggle, pad, pollGamepad } from '../input';
import { useGame } from '../../app/store';
import { SPAWN } from '../../config/world';
import { playerPosition } from './playerState';
import { AbelModel, playerAnim } from './AbelModel';
import { ride, rideWorld, vehicleColliders } from '../vehicles/state';
import { drive } from '../driving/state';
import { benchmark } from '../../perf/Benchmark';

// Tuning (SPEC 8.1). Relaxed exploration speeds, no stamina.
const WALK = 2.2;
const RUN = 4.2;
const SPRINT = 7.0;
const JUMP_V = 5.2;
const GRAVITY = -18;
const MAX_SLOPE = (45 * Math.PI) / 180;
const STEP_HEIGHT = 0.35;
const CAPSULE_HALF = 0.55;
const CAPSULE_R = 0.3; // total height ~1.7 m + offset
const EYE_HEIGHT = 1.62;
const LOOK_SENS = 0.0025;
const RECENTER_DELAY = 2000;

const FIXED_CAM = (() => {
  const v = new URLSearchParams(location.search).get('cam')?.split(',').map(Number);
  return v && v.length === 6 && v.every(Number.isFinite) ? v : null;
})();

// Scratch objects: allocated once, reused every frame (SPEC 10.9).
const _move = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _target = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _ride = new THREE.Vector3();
const _zero = { x: 0, y: 0, z: 0 };

export function Player() {
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<Collider>(null);
  const visual = useRef<THREE.Group>(null);
  const { world, rapier } = useRapier();
  const camera = useThree((s) => s.camera);
  const cameraMode = useGame((s) => s.cameraMode);
  const toggleCamera = useGame((s) => s.toggleCamera);

  const state = useRef({
    vy: 0,
    grounded: false,
    yaw: 0, // camera yaw; 0 looks toward -Z (north)
    pitch: 0.25,
    facing: Math.PI,
    camDist: 4.5,
    speed: 0,
    eating: false,
    eatFacing: 0,
  });

  const controller = useMemo<KinematicCharacterController>(() => {
    const c = world.createCharacterController(0.02);
    c.setUp({ x: 0, y: 1, z: 0 });
    c.setMaxSlopeClimbAngle(MAX_SLOPE);
    c.setMinSlopeSlideAngle(MAX_SLOPE + 0.05);
    c.enableAutostep(STEP_HEIGHT, 0.15, false);
    c.enableSnapToGround(0.3);
    c.setApplyImpulsesToDynamicBodies(true);
    c.setCharacterMass(70);
    return c;
  }, [world]);

  // Ray holds references to the scratch vectors, so it always reads their current values.
  const camRay = useMemo(() => new rapier.Ray(_target, _dir), [rapier]);

  useEffect(() => () => world.removeCharacterController(controller), [world, controller]);
  useEffect(() => onCameraToggle(toggleCamera), [toggleCamera]);

  useFrame((_, rawDt) => {
    const rb = body.current;
    const col = collider.current;
    if (!rb || !col) return;
    const dt = Math.min(rawDt, 1 / 20);
    const s = state.current;
    pollGamepad();

    // --- Look ---
    const lookX = input.lookDX + pad.lx * 900 * dt;
    const lookY = input.lookDY + pad.ly * 600 * dt;
    if (pad.lx || pad.ly) input.lastLookTime = performance.now();
    input.lookDX = input.lookDY = 0;
    s.yaw -= lookX * LOOK_SENS;
    s.pitch = THREE.MathUtils.clamp(s.pitch + lookY * LOOK_SENS, -1.2, 1.2);

    // --- Move intent (camera-relative) ---
    // movement is frozen while a shop/menu is open, while eating, and while riding a vehicle
    const locked = inputLock.ui || performance.now() < playerAnim.actionUntil || playerAnim.riding;
    const mx = locked ? 0 : THREE.MathUtils.clamp(input.moveX + input.touchMoveX + pad.x, -1, 1);
    const my = locked ? 0 : THREE.MathUtils.clamp(input.moveY + input.touchMoveY + pad.y, -1, 1);
    const mag = Math.min(1, Math.hypot(mx, my));
    const sprinting = input.sprint || input.touchSprint || pad.sprint;
    const targetSpeed = mag < 0.01 ? 0 : sprinting ? SPRINT : mag > 0.6 ? RUN : WALK;
    s.speed = THREE.MathUtils.damp(s.speed, targetSpeed, 10, dt);

    _fwd.set(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
    _right.set(-_fwd.z, 0, _fwd.x);
    _move.set(0, 0, 0).addScaledVector(_fwd, my).addScaledVector(_right, mx);
    if (_move.lengthSq() > 1e-4) {
      _move.normalize();
      const targetFacing = Math.atan2(_move.x, _move.z);
      let d = targetFacing - s.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      s.facing += d * Math.min(1, dt * 12);
    }
    _move.multiplyScalar(s.speed * dt);

    // GTA-style eating: step back from the counter (turn away from it) so you can watch him eat
    const eating = playerAnim.action === 'Consume' && performance.now() < playerAnim.actionUntil && !playerAnim.riding;
    if (eating && !s.eating) s.eatFacing = s.facing + Math.PI;
    s.eating = eating;
    if (eating) {
      let d = s.eatFacing - s.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      s.facing += d * Math.min(1, dt * 4);
    }

    // --- Gravity / jump ---
    if (s.grounded && s.vy <= 0) {
      s.vy = -1;
      if (input.jump || pad.jump) s.vy = JUMP_V;
    } else {
      s.vy += GRAVITY * dt;
    }
    _move.y = s.vy * dt;

    // --- riding a matatu/nganya: follow the seat, no character controller ---
    if (ride.vehicle >= 0) {
      const heading = rideWorld(_ride);
      const by = _ride.y + CAPSULE_HALF + CAPSULE_R + 0.02;
      rb.setNextKinematicTranslation({ x: _ride.x, y: by, z: _ride.z });
      playerPosition.set(_ride.x, by, _ride.z);
      s.facing = heading;
      s.vy = 0;
      playerAnim.speed = 0;
      playerAnim.grounded = true;
    } else if (drive.active) {
      // driving: Abel sits at the wheel; his capsule is switched off so it can't shove the car
      // no collision groups at all (membership 0): it can't shove the car it sits in
      if (col.collisionGroups() !== 0) {
        col.setCollisionGroups(0);
        col.setSolverGroups(0);
      }
      const by = drive.seat.y + CAPSULE_HALF + CAPSULE_R + 0.02;
      rb.setNextKinematicTranslation({ x: drive.seat.x, y: by, z: drive.seat.z });
      playerPosition.set(drive.seat.x, by, drive.seat.z);
      s.facing = drive.heading;
      s.vy = 0;
    } else if (drive.justExited) {
      drive.justExited = false;
      col.setCollisionGroups(0xffffffff);
      col.setSolverGroups(0xffffffff);
      rb.setNextKinematicTranslation({ x: drive.exit.x, y: drive.exit.y + 0.3, z: drive.exit.z });
      playerPosition.copy(drive.exit);
    } else if (ride.justAlighted) {
      ride.justAlighted = false;
      rb.setNextKinematicTranslation({ x: ride.exit.x, y: ride.exit.y + 0.3, z: ride.exit.z });
      playerPosition.copy(ride.exit);
    }
    const riding = ride.vehicle >= 0 || drive.active;
    if (riding) _move.set(0, 0, 0);
    controller.computeColliderMovement(col, _move, rapier.QueryFilterFlags.EXCLUDE_SENSORS);
    const m = riding ? _zero : controller.computedMovement();
    s.grounded = riding || controller.computedGrounded();
    // actual ground speed (not the input): animations follow what the body really does
    playerAnim.speed = Math.hypot(m.x, m.z) / dt;
    playerAnim.grounded = s.grounded;
    playerAnim.vy = s.vy;
    if (s.grounded && s.vy < 0) s.vy = 0;
    const p = riding ? playerPosition : rb.translation();
    const nx = p.x + m.x;
    const ny = p.y + m.y;
    const nz = p.z + m.z;
    if (!riding) {
      rb.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
      playerPosition.set(nx, ny, nz);
    }

    // Fell out of the world: respawn.
    if (ny < -30) rb.setNextKinematicTranslation({ x: SPAWN[0], y: SPAWN[1], z: SPAWN[2] });

    if (visual.current) {
      _q.setFromAxisAngle(_up, s.facing);
      visual.current.quaternion.copy(_q);
      visual.current.visible = cameraMode === 'third';
    }

    // --- Camera ---
    if (benchmark.running) return; // the benchmark flies its own fixed path
    if (FIXED_CAM) {
      // ?cam=x,y,z,tx,ty,tz : locked camera for visual regression screenshots
      camera.position.set(FIXED_CAM[0]!, FIXED_CAM[1]!, FIXED_CAM[2]!);
      camera.lookAt(FIXED_CAM[3]!, FIXED_CAM[4]!, FIXED_CAM[5]!);
      return;
    }
    const now = performance.now();
    if (drive.active && cameraMode === 'third' && now - input.lastLookTime > 1200) {
      // chase cam: swing in behind the car (faster at speed)
      let d = drive.heading + Math.PI - s.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      s.yaw += d * Math.min(1, dt * (1.5 + Math.abs(drive.speed) * 0.12));
      s.pitch = THREE.MathUtils.damp(s.pitch, 0.18, 2, dt);
    } else if (s.eating && cameraMode === 'third') {
      // three-quarter front view at head height
      let d = s.facing + 0.65 - s.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      s.yaw += d * Math.min(1, dt * 3);
      s.pitch = THREE.MathUtils.damp(s.pitch, 0.08, 3, dt);
    } else if (cameraMode === 'third' && mag > 0.1 && now - input.lastLookTime > RECENTER_DELAY) {
      // GTA-style auto recentre behind the player when moving without look input.
      const behind = s.facing + Math.PI;
      let d = behind - s.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      s.yaw += d * Math.min(1, dt * 1.5);
    }

    if (cameraMode === 'first') {
      camera.position.set(nx, ny - (CAPSULE_HALF + CAPSULE_R) + EYE_HEIGHT, nz);
      _dir.set(-Math.sin(s.yaw) * Math.cos(s.pitch), -Math.sin(s.pitch), -Math.cos(s.yaw) * Math.cos(s.pitch));
      _target.copy(camera.position).add(_dir);
      camera.lookAt(_target);
      return;
    }

    // Pull out when sprinting on open ground, in when near walls (handled by collision cast).
    const wantDist = drive.active ? 6.8 + Math.abs(drive.speed) * 0.05 : riding ? 7.5 : s.eating ? 2.1 : 4.2 + (s.speed / SPRINT) * 1.6; // wide chase view when riding
    s.camDist = THREE.MathUtils.damp(s.camDist, wantDist, 3, dt);

    // Over-the-shoulder pivot
    if (drive.active) _target.set(drive.x, drive.y + 1.9, drive.z);
    else _target.set(nx, ny + (s.eating ? 0.55 : 0.65), nz).addScaledVector(_right, s.eating ? 0 : 0.45);
    _dir.set(
      Math.sin(s.yaw) * Math.cos(s.pitch),
      Math.sin(s.pitch),
      Math.cos(s.yaw) * Math.cos(s.pitch),
    );

    // Camera collision: cast from the pivot toward the desired camera position.
    let dist = s.camDist;
    const hit = world.castRay(camRay, s.camDist, true, undefined, undefined, col, rb,
      riding ? (c) => !vehicleColliders.has(c.handle) && c.parent()?.handle !== drive.bodyHandle : undefined);
    if (hit) dist = Math.max(0.6, hit.timeOfImpact - 0.25);

    _camPos.copy(_target).addScaledVector(_dir, dist);
    // Smooth follow with slight lag; snap inward instantly to avoid clipping.
    const lag = dist < s.camDist - 0.01 ? 1 : 1 - Math.exp(-14 * dt);
    camera.position.lerp(_camPos, lag);
    camera.lookAt(_target);
  });

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={SPAWN}
      enabledRotations={[false, false, false]}
      ccd
    >
      <CapsuleCollider ref={collider} args={[CAPSULE_HALF, CAPSULE_R]} />
      {/* Abel: realistic MPFB2 stand-in with retargeted animations (final likeness via SPEC 5.5).
          The capsule only shows for a moment while the model streams in. */}
      <group ref={visual} position={[0, -(CAPSULE_HALF + CAPSULE_R), 0]}>
        <Suspense
          fallback={
            <mesh position={[0, 0.85, 0]} castShadow>
              <capsuleGeometry args={[0.24, 0.9, 4, 12]} />
              <meshStandardMaterial color="#1d1f24" roughness={0.8} />
            </mesh>
          }
        >
          <AbelModel />
        </Suspense>
      </group>
    </RigidBody>
  );
}
