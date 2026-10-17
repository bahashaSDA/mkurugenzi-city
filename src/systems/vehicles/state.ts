import type { MusicSource } from '../audio/tracks';
import type { VehicleKind } from './specs';

export interface VehicleState {
  id: number;
  kind: VehicleKind;
  route: string;
  piece: string;
  s: number; // distance along the route loop
  v: number; // speed m/s
  accel: number; // m/s² (smoothed): engine load and the braking dive
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number; // nose up/down from the road slope (+ nose down), radians
  wheelSpin: number; // wheel rotation (radians at 1 m radius: divide by each wheel's radius)
  steer: number; // front wheel angle from the road's curvature
  dwell: number;
  lastStop: number;
  nextStopName: string;
  occupied: number; // seated passengers
  stopped: boolean;
  sound: MusicSource | null;
  hail: number; // route distance where someone waved it down (-1: none)
  waited: number; // seconds spent holding at a stop for Abel
  jackedUntil?: number; // carjacked: off the road until then (performance.now ms)
  callAt: number; // last time its conductor called out at a stage (ms)
  invited: boolean; // the conductor already invited Abel during this stop
  lod: number; // current render LOD (hysteresis)
  doorOpen: number; // the passenger door (sliding door on a matatu): 0 shut .. 1 open
}

/** Collider handles of all vehicles (the riding camera ignores them). */
export const vehicleColliders = new Set<number>();

/** Live vehicle states (shared with the player for riding). */
export const vehicles: VehicleState[] = [];

/**
 * Abel's public-transport ride: which vehicle (set from the moment he heads for the door, so it
 * waits for him), seated or standing. Getting in and out is systems/vehicles/occupancy.
 */
export const ride = {
  vehicle: -1,
  standing: false,
  seat: -1,
};
