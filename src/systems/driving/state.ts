import * as THREE from 'three';
import { create } from 'zustand';
import type { Placement } from '../../world/kit/KitInstances';
import { heightAt } from '../../world/heights';
import { ROADS } from '../../config/roads';
import { ROUTES } from '../vehicles/routes';

// Drivable cars (GTA-style): parked along the road shoulders; F at the driver's door (right side,
// Kenya is right-hand drive) gets in, F again gets out and leaves the car where it stands.

export interface CarDims {
  L: number;
  W: number;
  H: number;
  r: number; // wheel radius
  wb: number; // wheelbase
  track: number; // wheel x offset from centre
  seat: [number, number, number]; // driver hip anchor (three.js local: x, feet y, z)
  maxSpeed: number; // m/s
  power: number; // engine force per driven wheel, N
}

// mirrored from blender/scripts/build_vehicles_kit.py CARS (Blender y -> three z = -y)
export const CAR_DIMS: Record<string, CarDims> = {
  saloon: { L: 4.6, W: 1.7, H: 1.47, r: 0.31, wb: 2.7, track: 0.71, seat: [-0.4, -0.06, 0.05], maxSpeed: 42, power: 1900 },
  suv: { L: 4.8, W: 1.88, H: 1.85, r: 0.38, wb: 2.8, track: 0.8, seat: [-0.49, 0.08, 0.2], maxSpeed: 40, power: 2600 },
  hatch: { L: 3.9, W: 1.69, H: 1.5, r: 0.3, wb: 2.45, track: 0.7, seat: [-0.4, -0.06, 0.0], maxSpeed: 38, power: 1500 },
  // real hatchback (rv_car_*, sketchfab VW Golf, baked by blender/scripts/build_real_kit.py)
  corolla: { L: 4.62, W: 1.78, H: 1.46, r: 0.32, wb: 2.7, track: 0.76, seat: [-0.38, -0.05, 0.0], maxSpeed: 44, power: 2000 },
  cruiser: { L: 4.2, W: 1.75, H: 1.95, r: 0.4, wb: 2.3, track: 0.72, seat: [-0.4, 0.15, -0.1], maxSpeed: 36, power: 2700 },
  car: { L: 4.28, W: 1.8, H: 1.49, r: 0.33, wb: 2.63, track: 0.78, seat: [-0.38, -0.05, -0.1], maxSpeed: 46, power: 2200 },
  pickup: { L: 5.3, W: 1.85, H: 1.8, r: 0.38, wb: 3.08, track: 0.78, seat: [-0.47, 0.12, 0.45], maxSpeed: 39, power: 2600 },
};

export function carKind(piece: string) {
  if (piece.startsWith('rv_corolla')) return 'corolla';
  if (piece.startsWith('rv_cruiser')) return 'cruiser';
  if (piece.startsWith('rv_')) return 'car';
  return piece.split('_')[1] ?? 'saloon';
}

export const CAR_PIECES = ['rv_car_0', 'rv_car_1', 'rv_car_2', 'rv_car_3', 'rv_corolla_0', 'rv_corolla_1', 'rv_corolla_2', 'rv_cruiser_0', 'rv_cruiser_1', 'rv_cruiser_2'];

/** Live state of the car Abel is driving (written by the physics each frame). */
export const drive = {
  active: false,
  piece: '',
  x: 0,
  y: 0,
  z: 0,
  heading: 0,
  speed: 0, // m/s, signed
  seat: new THREE.Vector3(), // world position of Abel's feet in the driver seat
  exit: new THREE.Vector3(),
  justExited: false,
  enteredAt: 0,
  bodyHandle: -1,
};

interface Parked extends Placement {
  id: number;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Cars parked on the shoulders of the tarmac roads, nose in the direction of travel on that side. */
function planParking(): Parked[] {
  const r = rng(77);
  const out: Parked[] = [];
  const stops = ROUTES.flatMap((rt) => rt.stops);
  const paved = ROADS.filter((rd) => rd.kind === 'tarmac' && rd.id !== 'avenue');
  for (const rd of paved) {
    for (let i = 0; i < rd.pts.length - 1; i++) {
      const [ax, az] = rd.pts[i]!;
      const [bx, bz] = rd.pts[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / len;
      const dz = (bz - az) / len;
      for (let s = 18; s < len - 18; s += 45 + r() * 70) {
        const side = r() < 0.5 ? 1 : -1;
        const off = rd.width / 2 + 1.5;
        const x = ax + dx * s + dz * off * side;
        const z = az + dz * s - dx * off * side;
        if (stops.some((st) => Math.hypot(st.x - x, st.z - z) < 16)) continue;
        if (ROADS.some((o) => o !== rd && o.pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 16))) continue;
        const heading = Math.atan2(dx * side, dz * side);
        out.push({ id: out.length, piece: CAR_PIECES[Math.floor(r() * CAR_PIECES.length)]!, x, z, rotY: heading, y: heightAt(x, z) });
      }
    }
  }
  return out;
}

/** Carjacking: the traffic system parks the jacked car and asks Driving to put Abel in it. */
export const enterRequest = { id: -1 };

export const useParking = create<{
  cars: Parked[];
  take: (id: number) => Parked | undefined;
  park: (p: Omit<Parked, 'id'>) => number;
}>((set, get) => ({
  cars: planParking(),
  take: (id) => {
    const c = get().cars.find((p) => p.id === id);
    if (c) set({ cars: get().cars.filter((p) => p.id !== id) });
    return c;
  },
  park: (p) => {
    const id = 1000 + Math.floor(Math.random() * 1e6);
    set({ cars: [...get().cars, { ...p, id }] });
    return id;
  },
}));
