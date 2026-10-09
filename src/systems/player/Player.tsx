import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier';
import type { Collider, KinematicCharacterController } from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { input, inputLock, onCameraToggle, pad, pollGamepad } from '../input';
import { useGame } from '../../app/store';
import { SPAWN } from '../../config/world';
import { heightAt } from '../../world/heights';
import { playerPosition, playerView, teleport } from './playerState';
import { AbelModel, playerAnim } from './AbelModel';
import { ride, rideWorld, vehicleColliders } from '../vehicles/state';
import { drive } from '../driving/state';
import { benchmark } from '../../perf/Benchmark';
import { SEA_Y, coastWeight } from '../../config/coast';
import { oceanTime, waveHeight } from '../../world/Ocean';
import { useHealth } from '../../game/health';
import { useCutscene } from '../../game/cutscene';
import { seat } from '../../game/theatre';
import { splash } from '../audio/stingers';

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
// Swimming (GTA-style): deeper than this, Abel floats and swims a front crawl
const SWIM_DEPTH = 1.25;
const SWIM = 1.6;
const SWIM_FAST = 2.6;
// Falls: dropping further than this hurts
const FALL_SAFE_M = 4.5;
const FALL_DAMAGE = 9; // health per metre beyond that

const FIXED_CAM = (() => {
  const q = new URLSearchParams(location.search);
  const v = q.get('cam')?.split(',').map(Number);
  if (!v || v.length !== 6 || !v.every(Number.isFinite)) return null;
  if (q.has('camrel')) {
    // ?camrel: heights are above the ground under each point (towns sit on hills/plateaus)
    v[1]! += heightAt(v[0]!, v[2]!);
    v[4]! += heightAt(v[3]!, v[5]!);
  }
  return v;
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
const _qTilt = new THREE.Quaternion();
const _xAxis = new THREE.Vector3(1, 0, 0);

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
    swimming: false,
    surface: 0,
    tilt: 0,
    wastedPhase: 0, // 0 alive, 1 lying, 2 woken at the hospital
    seated: false,
    airTop: 0, // highest point since leaving the ground (fall damage is by height fallen, not speed)
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
    const wasted = useHealth.getState().wasted;
    const cutscene = useCutscene.getState().active;
    const locked = inputLock.ui || cutscene || performance.now() < playerAnim.actionUntil || playerAnim.riding || !!wasted || playerAnim.down;
    const mx = locked ? 0 : THREE.MathUtils.clamp(input.moveX + input.touchMoveX + pad.x, -1, 1);
    const my = locked ? 0 : THREE.MathUtils.clamp(input.moveY + input.touchMoveY + pad.y, -1, 1);
    const mag = Math.min(1, Math.hypot(mx, my));
    const sprinting = input.sprint || input.touchSprint || pad.sprint;
    const targetSpeed = mag < 0.01 ? 0 : s.swimming ? (sprinting ? SWIM_FAST : SWIM) : sprinting ? SPRINT : mag > 0.6 ? RUN : WALK;
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

    // fights: soft lock-on turns Abel toward his opponent while he swings
    if (performance.now() < playerAnim.faceUntil) {
      let d = playerAnim.faceTo - s.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      s.facing += d * Math.min(1, dt * 14);
    }
    // GTA-style eating: step back from the counter (turn away from it) so you can watch him eat
    const eating = playerAnim.action === 'Consume' && performance.now() < playerAnim.actionUntil && !playerAnim.riding;
    if (eating && !s.eating) s.eatFacing = s.facing + Math.PI;
    s.eating = eating;
    if (eating) {
      let d = s.eatFacing - s.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      s.facing += d * Math.min(1, dt * 4);
    }

    // --- Water: float at the wave surface, no gravity, no jumping ---
    {
      const ground = heightAt(playerPosition.x, playerPosition.z);
      const depth = SEA_Y - ground;
      const swim = ride.vehicle < 0 && !drive.active && depth > SWIM_DEPTH && coastWeight(playerPosition.x, playerPosition.z) > 0.5;
      if (swim !== s.swimming) {
        s.swimming = swim;
        if (swim) {
          s.vy = Math.max(s.vy, -2); // splash in, don't plunge to the seabed
          splash();
        }
      }
      if (swim) s.surface = waveHeight(playerPosition.x, playerPosition.z, oceanTime.value, depth);
    }
    playerAnim.swimming = s.swimming;

    // --- Gravity / jump ---
    const wasGrounded = s.grounded;
    const fallVy = s.vy;
    if (s.swimming) {
      // capsule centre a little under the surface: head and shoulders out of the water
      s.vy = THREE.MathUtils.clamp((s.surface - 0.5 - playerPosition.y) * 4, -3, 3);
    } else if (s.grounded && s.vy <= 0) {
      s.vy = -1;
      if ((input.jump || pad.jump) && !locked) s.vy = JUMP_V;
    } else {
      s.vy += GRAVITY * dt;
    }
    _move.y = s.vy * dt;

    let jumped = false;
    // --- WASTED: fall, lie still while the screen fades, wake up at the nearest hospital ---
    if (wasted) {
      const t = performance.now() - wasted.at;
      if (s.wastedPhase === 0) {
        s.wastedPhase = 1;
        playerAnim.down = true;
        playerAnim.combat = s.swimming ? '' : 'Knockdown';
        playerAnim.combatUntil = performance.now() + 800;
      }
      if (t > 5200 && s.wastedPhase === 1) {
        s.wastedPhase = 2;
        const h = wasted.hospital;
        const y = heightAt(h.x, h.z) + CAPSULE_HALF + CAPSULE_R + 0.3;
        teleport.pending = true;
        teleport.x = h.x;
        teleport.y = y;
        teleport.z = h.z;
        teleport.facing = 0;
        playerAnim.down = false;
        playerAnim.combat = 'GetUp';
        playerAnim.combatUntil = performance.now() + 3000;
        useHealth.getState().respawned();
      }
    } else if (s.wastedPhase === 2 && performance.now() > playerAnim.combatUntil) {
      s.wastedPhase = 0;
    }
    // --- sitting in the Grand Theatre: fixed in the seat; standing up puts him in the aisle ---
    if (seat.active) {
      const by = seat.y + CAPSULE_HALF + CAPSULE_R + 0.02;
      rb.setNextKinematicTranslation({ x: seat.x, y: by, z: seat.z });
      playerPosition.set(seat.x, by, seat.z);
      s.facing = seat.facing;
      s.vy = 0;
      s.seated = true;
      playerAnim.riding = true;
      playerAnim.rideClip = 'Sitting_Idle_Loop';
      playerAnim.speed = 0;
      playerAnim.grounded = true;
      jumped = true;
    } else if (s.seated) {
      s.seated = false;
      playerAnim.riding = false;
      jumped = true;
      rb.setTranslation({ x: seat.exitX, y: seat.exitY, z: seat.exitZ }, true);
      playerPosition.set(seat.exitX, seat.exitY, seat.exitZ);
    } else if (ride.vehicle >= 0) {
      // --- riding a matatu/nganya: follow the seat, no character controller ---
      const heading = rideWorld(_ride);
      const by = _ride.y + CAPSULE_HALF + CAPSULE_R + 0.02;
      rb.setNextKinematicTranslation({ x: _ride.x, y: by, z: _ride.z });
      playerPosition.set(_ride.x, by, _ride.z);
      s.facing = heading;
      s.vy = 0;
      playerAnim.speed = 0;
      playerAnim.grounded = true;
    } else if (teleport.pending) {
      teleport.pending = false;
      jumped = true;
      // setTranslation, not setNext...: a kinematic move is swept by CCD and would stop at the
      // underside of the terrain when coming up out of an interior
      rb.setTranslation({ x: teleport.x, y: teleport.y, z: teleport.z }, true);
      playerPosition.set(teleport.x, teleport.y, teleport.z);
      s.facing = teleport.facing;
      s.yaw = teleport.facing + Math.PI; // camera behind Abel
      s.vy = 0;
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
      jumped = true;
      col.setCollisionGroups(0xffffffff);
      col.setSolverGroups(0xffffffff);
      rb.setTranslation({ x: drive.exit.x, y: drive.exit.y + 0.3, z: drive.exit.z }, true);
      playerPosition.copy(drive.exit);
    } else if (ride.justAlighted) {
      ride.justAlighted = false;
      jumped = true;
      rb.setTranslation({ x: ride.exit.x, y: ride.exit.y + 0.3, z: ride.exit.z }, true);
      playerPosition.copy(ride.exit);
    }
    // a teleport this frame (interior door, getting out of a car/matatu) must not be overwritten below
    const riding = ride.vehicle >= 0 || drive.active || jumped;
    if (riding) _move.set(0, 0, 0);
    controller.computeColliderMovement(col, _move, rapier.QueryFilterFlags.EXCLUDE_SENSORS);
    const m = riding ? _zero : controller.computedMovement();
    s.grounded = riding || controller.computedGrounded();
    // fall damage on a hard landing: by the real height fallen (a paused or teleporting frame can
    // build up fall speed without any fall), never in water or vehicles
    if (riding || s.swimming || s.grounded) {
      if (!riding && !s.swimming && s.grounded && !wasGrounded) {
        const fell = s.airTop - playerPosition.y;
        if (fell > FALL_SAFE_M && -fallVy > 8) useHealth.getState().damage((fell - FALL_SAFE_M) * FALL_DAMAGE, 'You fell too far');
      }
      s.airTop = playerPosition.y;
    } else s.airTop = Math.max(s.airTop, playerPosition.y);
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
    // (interiors sit 60 m under their door, so measure from the terrain)
    if (ny < heightAt(nx, nz) - 80) rb.setNextKinematicTranslation({ x: SPAWN[0], y: SPAWN[1], z: SPAWN[2] });

    if (visual.current) {
      // swimming: pitch flat into a front crawl when moving, nearly upright when treading water;
      // keep the hips just under the surface whatever the tilt
      const wantTilt = s.swimming ? (playerAnim.speed > 0.4 ? 1.3 : 0.2) : 0;
      s.tilt = THREE.MathUtils.damp(s.tilt, wantTilt, 4, dt);
      _q.setFromAxisAngle(_up, s.facing);
      _qTilt.setFromAxisAngle(_xAxis, s.tilt);
      visual.current.quaternion.copy(_q).multiply(_qTilt);
      if (s.swimming || s.tilt > 0.01) {
        const hipsY = (s.swimming ? s.surface - 0.12 : ny - 0.85 + 1.0) - ny;
        const k = Math.min(1, s.tilt / 1.3);
        visual.current.position.set(
          -Math.sin(s.facing) * Math.sin(s.tilt),
          THREE.MathUtils.lerp(-(CAPSULE_HALF + CAPSULE_R), hipsY - Math.cos(s.tilt), s.swimming ? 1 : k),
          -Math.cos(s.facing) * Math.sin(s.tilt),
        );
      } else {
        visual.current.position.set(0, -(CAPSULE_HALF + CAPSULE_R), 0);
      }
      visual.current.visible = cameraMode === 'third';
    }

    playerView.facing = s.facing;
    playerView.lookX = -Math.sin(s.yaw);
    playerView.lookZ = -Math.cos(s.yaw);

    // --- Camera ---
    if (benchmark.running || cutscene) return; // the benchmark / a cutscene flies its own camera
    if (seat.active) {
      // in the theatre: a seat-height view over Abel's shoulder, onto the big screen
      camera.position.set(seat.camX, seat.camY, seat.camZ);
      camera.lookAt(seat.lookX, seat.lookY, seat.lookZ);
      return;
    }
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
    else if (s.swimming) _target.set(nx, s.surface + 0.7, nz).addScaledVector(_right, 0.3);
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
