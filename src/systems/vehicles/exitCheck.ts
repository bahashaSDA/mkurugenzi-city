import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { World } from '@dimforge/rapier3d-compat';
import { surfaceAt } from '../../world/roadSurface';
import { SEA_Y, coastWeight } from '../../config/coast';
import { vehicles } from './state';

// Where can Abel stand beside a vehicle? Used before opening a door to get in (is the door side
// free?) and before getting out (wall, parked car, a drop, the sea, or a matatu bearing down).

const CAP_HALF = 0.55;
const CAP_R = 0.3;

export interface SpotResult {
  ok: boolean;
  why?: 'blocked' | 'traffic' | 'drop' | 'water';
  ground: number;
}

/**
 * Is a person-sized capsule free at (x, z)? `ignore` excludes the vehicle's own colliders and the
 * player's capsule. `refY` is the vehicle's ground height (a big step up or down is a ledge).
 */
export function standSpot(
  world: World,
  rapier: typeof RAPIER,
  x: number,
  z: number,
  refY: number,
  ignore: (handle: number) => boolean,
  checkTraffic = true,
): SpotResult {
  // ground under the spot: the highest solid surface within reach (kerb, pavement, road)
  let ground = surfaceAt(x, z);
  const ray = new rapier.Ray({ x, y: refY + 1.6, z }, { x: 0, y: -1, z: 0 });
  const hit = world.castRay(ray, 3.5, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, (c) => !ignore(c.handle));
  if (hit) ground = refY + 1.6 - hit.timeOfImpact; // the real surface (heightAt is above carved banks)
  if (Math.abs(ground - refY) > 0.7) return { ok: false, why: 'drop', ground };
  if (SEA_Y - ground > 0.6 && coastWeight(x, z) > 0.5) return { ok: false, why: 'water', ground };
  let blocked = false;
  const shape = new rapier.Capsule(CAP_HALF - 0.05, CAP_R - 0.04);
  world.intersectionsWithShape(
    { x, y: ground + CAP_HALF + CAP_R + 0.06, z },
    { x: 0, y: 0, z: 0, w: 1 },
    shape,
    () => {
      blocked = true;
      return false; // one is enough
    },
    rapier.QueryFilterFlags.EXCLUDE_SENSORS,
    undefined,
    undefined,
    undefined,
    (c) => !ignore(c.handle),
  );
  if (blocked) return { ok: false, why: 'blocked', ground };
  if (checkTraffic && trafficComing(x, z)) return { ok: false, why: 'traffic', ground };
  return { ok: true, ground };
}

/** A moving vehicle about to pass through (x, z) within ~2.5 s. */
export function trafficComing(x: number, z: number): boolean {
  for (const v of vehicles) {
    if (v.jackedUntil || v.v < 1.5) continue;
    const dx = x - v.x;
    const dz = z - v.z;
    const fx = Math.sin(v.heading);
    const fz = Math.cos(v.heading);
    const ahead = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    if (ahead > -2 && ahead < v.v * 2.5 + 4 && side < 2.2) return true;
  }
  return false;
}

const _v = new THREE.Vector3();
/** World position of a vehicle-local point. */
export function toWorld(frame: THREE.Matrix4, lx: number, ly: number, lz: number): THREE.Vector3 {
  return _v.set(lx, ly, lz).applyMatrix4(frame);
}
