import * as THREE from 'three';
import type { SoundSystem } from '../audio/music';
import type { VehicleKind } from './specs';

export interface VehicleState {
  id: number;
  kind: VehicleKind;
  route: string;
  piece: string;
  s: number; // distance along the route loop
  v: number; // speed m/s
  x: number;
  y: number;
  z: number;
  heading: number;
  dwell: number;
  lastStop: number;
  nextStopName: string;
  occupied: number; // seated passengers
  stopped: boolean;
  sound: SoundSystem | null;
  hail: number; // route distance where someone waved it down (-1: none)
  waited: number; // seconds spent holding at a stop for Abel
  jackedUntil?: number; // carjacked: off the road until then (performance.now ms)
}

/** Collider handles of all vehicles (the riding camera ignores them). */
export const vehicleColliders = new Set<number>();

/** Live vehicle states (shared with the player for riding). */
export const vehicles: VehicleState[] = [];

/** Abel's ride: which vehicle, where inside (local coords), and where to step out. */
export const ride = {
  vehicle: -1,
  local: new THREE.Vector3(),
  standing: false,
  exit: new THREE.Vector3(),
  justAlighted: false,
  boardedAt: 0,
};

const _v = new THREE.Vector3();

/** World position (feet) and heading of Abel's ride spot. */
export function rideWorld(out: THREE.Vector3): number {
  const v = vehicles[ride.vehicle];
  if (!v) return 0;
  const c = Math.cos(v.heading);
  const s = Math.sin(v.heading);
  _v.copy(ride.local);
  out.set(v.x + _v.x * c + _v.z * s, v.y + _v.y, v.z - _v.x * s + _v.z * c);
  return v.heading;
}
