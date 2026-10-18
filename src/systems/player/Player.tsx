import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier';
import type { Collider, KinematicCharacterController } from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { input, inputLock, keyHeld, onCameraToggle, pad, pollGamepad } from '../input';
import { useGame } from '../../app/store';
import { SPAWN } from '../../config/world';
import { heightAt } from '../../world/heights';
import { diving, playerPosition, playerView, teleport } from './playerState';
import { setUnderwater } from '../audio/mixer';
import { AbelModel, playerAnim } from './AbelModel';
import { vehicleColliders } from '../vehicles/state';
import { bike, CAR_DIMS, carKind, drive, FOOT_Y } from '../driving/state';
import { playerIK } from './ik';
import { abort, beginBoarding, occ, sampleFeet, samplePath, type Key } from '../vehicles/occupancy';
import { playSfx } from '../audio/sfx';
import { useEconomy } from '../../game/economy';
import { benchmark } from '../../perf/Benchmark';
import { MAPRENDER } from '../../perf/MapRender';
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
/** ?debug: test films can pin the camera (world position + look-at). */
export const camOverride = { on: false, x: 0, y: 0, z: 0, lx: 0, ly: 0, lz: 0 };
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _ride = new THREE.Vector3();
const _zero = { x: 0, y: 0, z: 0 };
const _w = new THREE.Vector3();
const _apInv = new THREE.Matrix4();
const _apLocal = new THREE.Vector3();
const _fq = new THREE.Quaternion();
const _fp = new THREE.Vector3();
const _fs = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _pm = new THREE.Matrix4();
const _vehPivot = new THREE.Vector3();
const _seatFrom = { p: new THREE.Vector3(), yaw: 0 };
const _ikv = new THREE.Vector3();

/** Yaw of a vehicle's world matrix (its local +Z projected on the ground). */
function frameYaw(m: THREE.Matrix4): number {
  const e = m.elements;
  return Math.atan2(e[8]!, e[10]!);
}
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
    tread: 0, // treading-water cycle (s)
    apClose: false, // walking to a door: stalled right beside it, close enough to step in
    stroke: 0, // front-crawl cycle (rad): the body rides up and rolls with each arm
    wasUnder: false,
    camUnder: false,
    surface: 0,
    tilt: 0,
    wastedPhase: 0, // 0 alive, 1 lying, 2 woken at the hospital
    seated: false,
    airTop: 0, // highest point since leaving the ground (fall damage is by height fallen, not speed)
    // vehicles (systems/vehicles/occupancy)
    apStuckAt: 0,
    apStuckX: 0,
    apStuckZ: 0,
    keyIndex: -1, // last boarding/exit key reached (its sound plays once)
    lastFrameX: 0,
    lastFrameZ: 0,
    vehSpeed: 0, // m/s of the vehicle Abel is in (from its rendered frame)
    camBlend: 0, // 0 walking camera .. 1 vehicle camera
    lastVehYaw: 0,
    wasInVehicle: false,
    poseX: 0, // last feet position on a boarding/exit path (animation speed)
    poseZ: 0,
    // the boarding / exit path being walked this frame (foot IK: one leg in, sit, the other in)
    pathKeys: null as Key[] | null,
    pathKey: 0,
    pathE: 0,
    pathYaw: 0,
  });

  // created in the effect that removes it (React dev mounts effects twice: a controller made in
  // useMemo was freed by the first cleanup and the game crashed on a black screen)
  const controllerRef = useRef<KinematicCharacterController | null>(null);
  useEffect(() => {
    const c = world.createCharacterController(0.02);
    c.setUp({ x: 0, y: 1, z: 0 });
    c.setMaxSlopeClimbAngle(MAX_SLOPE);
    c.setMinSlopeSlideAngle(MAX_SLOPE + 0.05);
    c.enableAutostep(STEP_HEIGHT, 0.15, false);
    c.enableSnapToGround(0.3);
    c.setApplyImpulsesToDynamicBodies(true);
    c.setCharacterMass(70);
    controllerRef.current = c;
    return () => {
      controllerRef.current = null;
      world.removeCharacterController(c);
    };
  }, [world]);

  // Ray holds references to the scratch vectors, so it always reads their current values.
  const camRay = useMemo(() => new rapier.Ray(_target, _dir), [rapier]);

  useEffect(() => {
    const mk = (window as unknown as { __mk?: Record<string, unknown> }).__mk;
    if (mk) mk.abelVisual = visual.current; // ?debug: tests measure the seated pose against the seat
  }, []);
  useEffect(() => onCameraToggle(toggleCamera), [toggleCamera]);

  useFrame((_, rawDt) => {
    const controller = controllerRef.current;
    if (!controller) return; // not created yet (first frame)
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

    // vehicles: simulated time in the phase, and how many frames since the vehicle wrote its pose
    occ.elapsed += dt * 1000;
    occ.frameAge++;

    // --- Walking to a vehicle's door (occupancy 'approaching'): collision-aware, cancels on input ---
    if (occ.phase === 'approaching' && occ.ride) {
      const r = occ.ride;
      const nowA = occ.elapsed;
      const rawMag = Math.hypot(input.moveX + input.touchMoveX + pad.x, input.moveY + input.touchMoveY + pad.y);
      if ((rawMag > 0.3 && nowA > 300) || occ.frameAge > 4 || !!wasted) {
        abort(rawMag > 0.3 ? 'input' : wasted ? 'wasted' : 'no-frame');
      } else {
        _w.copy(r.stand).applyMatrix4(occ.frame);
        // the door is on the far side of the vehicle: walk round its nearer end, not into it
        _apInv.copy(occ.frame).invert();
        _apLocal.set(playerPosition.x, playerPosition.y, playerPosition.z).applyMatrix4(_apInv);
        const hl = r.halfLength ?? 2.6;
        if (Math.sign(_apLocal.x) !== Math.sign(r.stand.x) && Math.abs(r.stand.x) > 0.3) {
          const zf = hl + 0.75;
          const zc = Math.abs(_apLocal.z - zf) + Math.abs(zf - r.stand.z) <= Math.abs(_apLocal.z + zf) + Math.abs(-zf - r.stand.z) ? zf : -zf;
          const wx = Math.max(Math.abs(r.stand.x), 1.3);
          // along our side to the corner, then across the end to the door's side
          const atEnd = Math.abs(_apLocal.z) > hl + 0.35;
          _w.set(atEnd ? Math.sign(r.stand.x) * wx : Math.sign(_apLocal.x || 1) * wx, r.stand.y, zc).applyMatrix4(occ.frame);
          if (Math.hypot(_w.x - playerPosition.x, _w.z - playerPosition.z) < 0.35) _w.set(Math.sign(r.stand.x) * wx, r.stand.y, zc).applyMatrix4(occ.frame);
        }
        const dx = _w.x - playerPosition.x;
        const dz = _w.z - playerPosition.z;
        const d = Math.hypot(dx, dz);
        if (nowA < s.apStuckAt) {
          s.apStuckAt = 0; // a new approach
          s.apClose = false;
        }
        if (nowA - s.apStuckAt > 1200) {
          // no progress for a while (a wall, a crowd): give up rather than walk on the spot forever.
          // Pressed against the car right by the door (the spot is just round the body): close
          // enough, he steps in from where he is
          if (s.apStuckAt && Math.hypot(playerPosition.x - s.apStuckX, playerPosition.z - s.apStuckZ) < 0.15 && d > 0.3) {
            if (d < 0.8) s.apClose = true;
            else {
              abort('stuck');
              useEconomy.getState().toast("Can't reach the door from here", 'info');
            }
          }
          s.apStuckAt = nowA;
          s.apStuckX = playerPosition.x;
          s.apStuckZ = playerPosition.z;
        }
        if (occ.phase === 'approaching') {
          if (d > 0.16 && !s.apClose) {
            s.speed = THREE.MathUtils.damp(s.speed, d > 4 ? RUN : WALK, 10, dt);
            _move.set(dx / d, 0, dz / d);
            let df = Math.atan2(dx, dz) - s.facing;
            df = Math.atan2(Math.sin(df), Math.cos(df));
            s.facing += df * Math.min(1, dt * 10);
            _move.multiplyScalar(Math.min(s.speed * dt, d));
          } else {
            // at the door: turn to face it, then the boarding sequence takes over
            _move.set(0, 0, 0);
            s.speed = 0;
            const want = frameYaw(occ.frame) + r.standYaw;
            let df = want - s.facing;
            df = Math.atan2(Math.sin(df), Math.cos(df));
            s.facing += df * Math.min(1, dt * 9);
            if (Math.abs(df) < 0.12) beginBoarding(r);
          }
        }
      }
    } else s.apStuckAt = 0;

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
      const swim = occ.phase === 'walking' && depth > SWIM_DEPTH && coastWeight(playerPosition.x, playerPosition.z) > 0.5;
      if (swim !== s.swimming) {
        s.swimming = swim;
        if (swim) {
          s.vy = Math.max(s.vy, -2); // splash in, don't plunge to the seabed
          splash();
        }
      }
      if (swim) s.surface = waveHeight(playerPosition.x, playerPosition.z, oceanTime.value, depth);
      // diving: hold C to go down, Space to come up; let go and he drifts back up. The seabed is
      // the floor; no breath left: it hurts, and he is pushed up to the air (never stuck below)
      if (swim) {
        // out of breath: no diving again until he has caught his breath
        if (diving.breath <= 0) diving.gasping = true;
        else if (diving.breath > 0.6) diving.gasping = false;
        const down = keyHeld('KeyC') && !locked && !diving.gasping;
        const up = input.jump || pad.jump;
        const floor = Math.max(0, s.surface - 0.5 - (ground + CAPSULE_HALF + CAPSULE_R + 0.2));
        const rate = down ? 1.6 : up || diving.gasping ? -2.4 : -0.6;
        diving.depth = THREE.MathUtils.clamp(diving.depth + rate * dt, 0, floor);
        diving.seabed = floor;
      } else diving.depth = 0;
      diving.under = diving.depth > 0.6;
      if (diving.under) {
        diving.breath = Math.max(0, diving.breath - dt / 30);
        if (diving.breath <= 0) useHealth.getState().damage(6 * dt, 'You ran out of breath');
      } else diving.breath = Math.min(1, diving.breath + dt / 4);
      if (diving.under !== s.wasUnder) {
        s.wasUnder = diving.under;
        if (!diving.under) splash();
      }
    }
    playerAnim.swimming = s.swimming;
    playerAnim.diving = diving.under;
    diving.swimming = s.swimming;
    diving.surface = s.surface;

    // --- Gravity / jump ---
    const wasGrounded = s.grounded;
    const fallVy = s.vy;
    if (s.swimming) {
      // capsule centre a little under the surface: head and shoulders out of the water
      s.vy = THREE.MathUtils.clamp((s.surface - 0.5 - diving.depth - playerPosition.y) * 4, -3, 3);
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
    } else if (occ.phase === 'boarding' || occ.phase === 'seated' || occ.phase === 'exiting') {
      // --- in (or getting into / out of) a vehicle: pose from its rendered frame, no controller ---
      jumped = true;
      if (col.collisionGroups() !== 0) {
        // no collision groups at all (membership 0): the capsule can't shove the vehicle it sits in
        col.setCollisionGroups(0);
        col.setSolverGroups(0);
      }
      const r = occ.ride!;
      const now = performance.now();
      if (occ.frameAge > 4 && occ.phase !== 'exiting') {
        // the vehicle vanished under us (despawned, quality change): step off where we are
        occ.exitWorld.set(playerPosition.x, heightAt(playerPosition.x, playerPosition.z), playerPosition.z);
        occ.phase = 'exiting';
        occ.elapsed = 1e6;
      }
      const elapsed = occ.elapsed;
      const seatKey = r.board[r.board.length - 1]!;
      let yaw = seatKey.yaw;
      let clip = r.seatClip;
      let keyIdx = -1;
      let finished = false;
      if (occ.phase === 'boarding') {
        const res = samplePath(r.board, { p: r.stand, yaw: r.standYaw }, elapsed, _ride);
        yaw = res.yaw;
        clip = res.clip;
        keyIdx = res.key;
        s.pathKeys = r.board;
        s.pathKey = res.key;
        s.pathE = res.e;
        s.pathYaw = res.yaw;
        occ.door = res.door;
        occ.progress = Math.min(1, elapsed / Math.max(1, r.board.reduce((a, k) => a + k.ms, 0)));
        if (res.done) {
          occ.phase = 'seated';
          occ.since = now;
          occ.elapsed = 0;
          r.onSeated?.();
        }
      } else if (occ.phase === 'seated') {
        _ride.copy(seatKey.p);
        occ.progress = 1;
        occ.door = 0;
        s.pathKeys = null;
      } else {
        _seatFrom.p.copy(seatKey.p);
        _seatFrom.yaw = seatKey.yaw;
        const res = samplePath(r.exit, _seatFrom, elapsed, _ride);
        yaw = res.yaw;
        clip = res.clip;
        keyIdx = res.key;
        s.pathKeys = r.exit;
        s.pathKey = res.key;
        s.pathE = res.e;
        s.pathYaw = res.yaw;
        occ.door = res.door;
        occ.progress = 1 - Math.min(1, elapsed / Math.max(1, r.exit.reduce((a, k) => a + k.ms, 0)));
        finished = res.done;
      }
      // one sound per key (door, step, kickstand) as the path reaches it
      if (keyIdx !== s.keyIndex) {
        const keys = occ.phase === 'exiting' ? r.exit : r.board;
        const k = keys[keyIdx];
        if (k?.sound && keyIdx > s.keyIndex) playSfx(k.sound, playerPosition);
        s.keyIndex = keyIdx;
      }
      if (occ.phase === 'seated') s.keyIndex = -1;
      if (finished) {
        // standing on the checked ground spot beside the vehicle: walking again
        s.keyIndex = -1;
        col.setCollisionGroups(0xffffffff);
        col.setSolverGroups(0xffffffff);
        const ex = occ.exitWorld;
        const by = ex.y + CAPSULE_HALF + CAPSULE_R + 0.05;
        rb.setTranslation({ x: ex.x, y: by, z: ex.z }, true);
        playerPosition.set(ex.x, by, ex.z);
        s.facing = frameYaw(occ.frame) + yaw;
        s.yaw = s.facing + Math.PI;
        playerAnim.riding = false;
        occ.phase = 'walking';
        occ.ride = null;
        r.onExited?.();
      } else {
        _w.copy(_ride).applyMatrix4(occ.frame);
        const by = _w.y + CAPSULE_HALF + CAPSULE_R + 0.02;
        rb.setNextKinematicTranslation({ x: _w.x, y: by, z: _w.z });
        playerPosition.set(_w.x, by, _w.z);
        s.facing = frameYaw(occ.frame) + yaw;
        // walking along the aisle / stepping out: the clip runs at the path's real speed
        playerAnim.speed = occ.phase === 'seated' ? 0 : Math.hypot(_ride.x - s.poseX, _ride.z - s.poseZ) / Math.max(dt, 1e-3);
        s.poseX = _ride.x;
        s.poseZ = _ride.z;
        playerAnim.riding = true;
        playerAnim.rideClip = clip;
      }
      s.vy = 0;
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
    }
    // a teleport this frame (interior door, getting out of a car/matatu) must not be overwritten below
    const occupied = occ.phase === 'boarding' || occ.phase === 'seated' || occ.phase === 'exiting';
    const riding = occupied || jumped;
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
    // (smoothed: a frame-to-frame wobble in the measured speed would flick between walk and jog clips)
    playerAnim.speed = THREE.MathUtils.damp(playerAnim.speed, Math.hypot(m.x, m.z) / dt, 14, dt);
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
      // (the Swim_Loop clip already leans the body forward: 1.05 more puts the back and the back of
      // the head at the surface; the old 1.3 pitched him head-down, face half a metre under)
      const wantTilt = s.swimming ? (playerAnim.speed > 0.4 || diving.under ? 1.05 : 0.15) : 0;
      s.tilt = THREE.MathUtils.damp(s.tilt, wantTilt, 4, dt);
      _q.setFromAxisAngle(_up, s.facing);
      _qTilt.setFromAxisAngle(_xAxis, s.tilt);
      visual.current.quaternion.copy(_q).multiply(_qTilt);
      // the crawl: the body rolls towards each pulling arm and rides up a little with every stroke
      const crawl = s.swimming ? THREE.MathUtils.clamp((s.tilt - 0.25) / 0.8, 0, 1) : 0;
      s.stroke += dt * (1.6 + playerAnim.speed * 1.4);
      if (crawl > 0) visual.current.quaternion.multiply(_qTilt.setFromAxisAngle(_up, Math.sin(s.stroke) * 0.38 * crawl));
      if (s.swimming || s.tilt > 0.01) {
        // treading water (upright): shoulders in the water, head out; crawling: hips at the surface
        const sink = THREE.MathUtils.lerp(0.5, 0.03, crawl) - 0.035 * Math.sin(2 * s.stroke) * crawl;
        const hipsY = (s.swimming ? s.surface - sink - diving.depth : ny - 0.85 + 1.0) - ny;
        const k = Math.min(1, s.tilt / 1.3);
        visual.current.position.set(
          -Math.sin(s.facing) * Math.sin(s.tilt),
          THREE.MathUtils.lerp(-(CAPSULE_HALF + CAPSULE_R), hipsY - Math.cos(s.tilt), s.swimming ? 1 : k),
          -Math.cos(s.facing) * Math.sin(s.tilt),
        );
      } else {
        visual.current.position.set(0, -(CAPSULE_HALF + CAPSULE_R), 0);
      }
      if (!riding) {
        // the body is drawn where physics last put it; this frame's move lands at the next step.
        // Draw Abel where he is NOW (the camera follows that), so he never shudders against it.
        const bp = rb.translation();
        visual.current.position.x += nx - bp.x;
        visual.current.position.y += ny - bp.y;
        visual.current.position.z += nz - bp.z;
      }
      if (occupied && occ.phase !== 'walking') {
        // Attach to the vehicle as it will be RENDERED this frame: its full rotation (slopes,
        // braking dive, body roll) and its interpolated physics pose, so Abel never trails the car,
        // pokes through the roof on a hill or sits sideways. The capsule body is only a carrier.
        const parent = visual.current.parent;
        if (parent) {
          occ.frame.decompose(_fp, _fq, _fs);
          _q.setFromAxisAngle(_up, s.facing - frameYaw(occ.frame));
          _fq.multiply(_q);
          _m.compose(_w.copy(_ride).applyMatrix4(occ.frame), _fq, _fs.set(1, 1, 1));
          parent.updateWorldMatrix(true, false);
          _pm.copy(parent.matrixWorld).invert().multiply(_m);
          _pm.decompose(visual.current.position, visual.current.quaternion, _fs);
        }
      }
      visual.current.visible = cameraMode === 'third' && !MAPRENDER;
    }

    // --- hands (and on a boda, feet) on the controls: IK targets in Abel's own frame ---
    {
      let want = 0;
      const r = occ.ride;
      playerIK.footW[0] = 1;
      playerIK.footW[1] = 1;
      if ((occ.phase === 'boarding' || occ.phase === 'exiting') && r && s.pathKeys) {
        // getting in / out: the path's feet (vehicle-local) into Abel's frame (his feet position on
        // the path and his facing), one foot at a time
        const feet = (playerIK.feet ??= [new THREE.Vector3(), new THREE.Vector3()]);
        if (sampleFeet(s.pathKeys, s.pathKey, s.pathE, feet, playerIK.footW)) {
          for (const f of feet) f.sub(_ride).applyAxisAngle(_up, -s.pathYaw);
          playerIK.hands = null;
          want = 1;
        }
      } else if (occ.phase === 'seated' && r && (r.kind === 'car' || r.kind === 'bike')) {
        const seatK = r.board[r.board.length - 1]!;
        const toAbel = (v: THREE.Vector3) => v.sub(seatK.p).applyAxisAngle(_up, -seatK.yaw);
        const hands = (playerIK.hands ??= [new THREE.Vector3(), new THREE.Vector3()]);
        if (r.kind === 'car') {
          const dims = CAR_DIMS[carKind(drive.piece)];
          const c = dims?.wheel;
          // feet on the pedals, knees up, inside the footwell: the seated clip alone hangs the legs
          // straight down through the floor (seen under the car from outside)
          if (dims) {
            const [sx, sy, sz] = dims.seat;
            const fy = FOOT_Y.get(drive.piece) ?? sy + 0.22;
            const feet = (playerIK.feet ??= [new THREE.Vector3(), new THREE.Vector3()]);
            feet[0]!.set(sx + 0.15, fy, sz + 0.64);
            feet[1]!.set(sx - 0.13, fy, sz + 0.68);
            toAbel(feet[0]!);
            toAbel(feet[1]!);
            if (!c) playerIK.hands = null;
            want = 1;
          }
          if (c) {
            // 9 and 3 on the rim (r 0.18), the wheel leaning back 25 degrees, turned with the steering
            const turn = -drive.steer * 7;
            for (const [i, side] of [[0, 1], [1, -1]] as const) {
              _ikv.set(side * 0.18 * Math.cos(turn), side * 0.18 * Math.sin(turn), 0).applyAxisAngle(_xAxis, -0.44);
              hands[i]!.set(c[0] + _ikv.x, c[1] + _ikv.y - 0.03, c[2] + _ikv.z - 0.07);
              toAbel(hands[i]!);
            }
            want = 1;
          }
        } else {
          // boda: grips measured on the model, turning about the steering head with the bars
          for (const [i, side] of [[0, 1], [1, -1]] as const) {
            _ikv.set(side * 0.27, 1.05, 0.17 - 0.36).applyAxisAngle(_up, bike.steer);
            hands[i]!.set(_ikv.x, _ikv.y - 0.02, _ikv.z + 0.36 - 0.05);
            toAbel(hands[i]!);
          }
          const feet = (playerIK.feet ??= [new THREE.Vector3(), new THREE.Vector3()]);
          feet[0]!.set(0.19, 0.5, 0.02);
          feet[1]!.set(-0.19, 0.5, 0.02);
          toAbel(feet[0]!);
          toAbel(feet[1]!);
          want = 1;
        }
      }
      if (!want && s.swimming && !diving.under && playerAnim.speed < 0.45 && occ.phase === 'walking') {
        // treading water: hands scull in flat figure-eights just under the surface, out in front of
        // the chest; the legs turn an eggbeater kick under him (Abel's own frame: feet at the origin)
        s.tread += dt;
        const t = s.tread * 2.4;
        const hands = (playerIK.hands ??= [new THREE.Vector3(), new THREE.Vector3()]);
        const feet = (playerIK.feet ??= [new THREE.Vector3(), new THREE.Vector3()]);
        for (const [i, side] of [[0, 1], [1, -1]] as const) {
          hands[i]!.set(side * (0.42 + 0.14 * Math.sin(t)), 1.32 + 0.03 * Math.sin(2 * t), 0.32 + 0.1 * Math.sin(2 * t) * side);
          const ph = t * 0.85 + (i ? Math.PI : 0);
          feet[i]!.set(side * (0.2 + 0.08 * Math.cos(ph)), 0.32 + 0.14 * Math.sin(ph), 0.12 + 0.12 * Math.cos(ph));
        }
        want = 1;
      }
      playerIK.w = THREE.MathUtils.damp(playerIK.w, want, want ? 5 : 12, dt);
    }

    playerView.facing = s.facing;
    playerView.lookX = -Math.sin(s.yaw);
    playerView.lookZ = -Math.cos(s.yaw);

    // --- Camera ---
    if (benchmark.running || cutscene || MAPRENDER) return; // the benchmark / a cutscene / the map camera
    if (seat.active && seat.fixedCam) {
      // in the theatre: a seat-height view over Abel's shoulder, onto the big screen (or the
      // barber's mirror view: game/seating)
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
    // vehicle camera: blend from the walking pivot to the vehicle's while boarding (no snap), and
    // track the vehicle's real speed from its rendered frame
    const vr = occ.ride;
    const inVehicle = vr !== null && occ.phase !== 'walking' && occ.phase !== 'approaching';
    // (getting in or out, the camera stays on Abel, as in GTA, so you see him open the door and climb
    // in; it moves to the vehicle's chase camera once he is in the seat)
    const wantBlend = inVehicle && occ.phase === 'seated' ? 1 : 0;
    s.camBlend = THREE.MathUtils.damp(s.camBlend, wantBlend, 6, dt);
    let vehYaw = 0;
    if (inVehicle) {
      const e = occ.frame.elements;
      vehYaw = frameYaw(occ.frame);
      const fx = e[12]!;
      const fz = e[14]!;
      const sp = Math.hypot(fx - s.lastFrameX, fz - s.lastFrameZ) / Math.max(dt, 1e-3);
      s.vehSpeed = THREE.MathUtils.damp(s.vehSpeed, sp < 80 ? sp : s.vehSpeed, 6, dt);
      s.lastFrameX = fx;
      s.lastFrameZ = fz;
      _vehPivot.set(fx, e[13]! + vr.cam.height, fz);
    }
    // riding as a passenger (matatu, nganya, bus): the camera is carried round with the vehicle,
    // so it turns when the vehicle turns; any free look settles back behind it within ~half a second
    if (inVehicle && vr.kind === 'transit') {
      let dv = vehYaw - s.lastVehYaw;
      dv = Math.atan2(Math.sin(dv), Math.cos(dv));
      if (s.wasInVehicle && (occ.phase === 'seated' || occ.phase === 'boarding')) s.yaw += dv;
    }
    s.lastVehYaw = vehYaw;
    s.wasInVehicle = inVehicle;
    const holdLook = vr?.kind === 'transit' ? 550 : 1200;
    if (inVehicle && occ.phase === 'seated' && cameraMode === 'third' && now - input.lastLookTime > holdLook) {
      // chase cam: swing in behind the vehicle (passengers: always; drivers: when moving, faster at speed)
      if (s.vehSpeed > 0.8 || vr.kind === 'transit') {
        let d = vehYaw + Math.PI - s.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        s.yaw += d * Math.min(1, dt * (vr.kind === 'transit' ? 3 : 1.2 + s.vehSpeed * 0.1));
      }
      s.pitch = THREE.MathUtils.damp(s.pitch, vr.cam.pitch, 2, dt);
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
      if (inVehicle) {
        // eyes in the seat, looking where the vehicle goes unless the player looks around
        _w.copy(vr.board[vr.board.length - 1]!.p);
        _w.y += vr.cam.eye;
        _w.applyMatrix4(occ.frame);
        camera.position.copy(_w);
        if (now - input.lastLookTime > 1500) {
          let d = vehYaw + Math.PI - s.yaw;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          s.yaw += d * Math.min(1, dt * 3);
        }
      } else camera.position.set(nx, ny - (CAPSULE_HALF + CAPSULE_R) + EYE_HEIGHT, nz);
      _dir.set(-Math.sin(s.yaw) * Math.cos(s.pitch), -Math.sin(s.pitch), -Math.cos(s.yaw) * Math.cos(s.pitch));
      _target.copy(camera.position).add(_dir);
      camera.lookAt(_target);
      return;
    }

    // Pull out when sprinting on open ground, in when near walls (handled by collision cast).
    const walkDist = s.eating ? 2.1 : 4.2 + (s.speed / SPRINT) * 1.6;
    const wantDist = inVehicle ? THREE.MathUtils.lerp(walkDist, vr.cam.dist + s.vehSpeed * 0.05, s.camBlend) : walkDist;
    s.camDist = THREE.MathUtils.damp(s.camDist, wantDist, 3, dt);

    // Over-the-shoulder pivot (walking), the vehicle's pivot when in one, blended in between
    if (s.swimming) _target.set(nx, s.surface + 0.7 - diving.depth * 0.95, nz).addScaledVector(_right, 0.3);
    else _target.set(nx, ny + (s.eating ? 0.55 : 0.65), nz).addScaledVector(_right, s.eating ? 0 : 0.45);
    if (inVehicle) _target.lerp(_vehPivot, s.camBlend);
    _dir.set(
      Math.sin(s.yaw) * Math.cos(s.pitch),
      Math.sin(s.pitch),
      Math.cos(s.yaw) * Math.cos(s.pitch),
    );

    // Camera collision: cast from the pivot toward the desired camera position.
    let dist = s.camDist;
    const hit = world.castRay(camRay, s.camDist, true, undefined, undefined, col, rb,
      inVehicle || riding ? (c) => !vehicleColliders.has(c.handle) && c.parent()?.handle !== drive.bodyHandle : undefined);
    if (hit) dist = Math.max(0.6, hit.timeOfImpact - 0.25);

    _camPos.copy(_target).addScaledVector(_dir, dist);
    // Smooth follow with slight lag; snap inward instantly to avoid clipping.
    const lag = dist < s.camDist - 0.01 ? 1 : 1 - Math.exp(-14 * dt);
    camera.position.lerp(_camPos, lag);
    camera.lookAt(_target);
    if (camOverride.on) {
      // ?debug: a fixed shot for test films (tools/board-film.mjs close-ups)
      camera.position.set(camOverride.x, camOverride.y, camOverride.z);
      camera.lookAt(camOverride.lx, camOverride.ly, camOverride.lz);
    }
    // the camera under the sea surface: water fog and colour (world/Environment), muffled sound
    const camUnder = s.swimming && camera.position.y < s.surface - 0.05;
    diving.cameraUnder = camUnder;
    if (camUnder !== s.camUnder) {
      s.camUnder = camUnder;
      setUnderwater(camUnder);
    }
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
