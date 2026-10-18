import { create } from 'zustand';
import type { Placement } from '../../world/kit/KitInstances';
import { surfaceAt } from '../../world/roadSurface';
import { ROADS } from '../../config/roads';
import { ROUTES } from '../vehicles/routes';

// Drivable cars (GTA-style): parked along the road shoulders; F near one walks Abel to the driver's
// door (right side, Kenya is right-hand drive) and in; F again gets out and leaves the car where it
// stands. Getting in and out is the shared occupancy state machine (systems/vehicles/occupancy).

export interface CarDims {
  L: number;
  W: number;
  H: number;
  r: number; // wheel radius
  wb: number; // wheelbase
  track: number; // wheel x offset from centre
  seat: [number, number, number]; // driver hip anchor (three.js local: x, feet y, z)
  /** steering wheel centre (three.js local), measured on the model; the hands go on its rim */
  wheel?: [number, number, number];
  maxSpeed: number; // m/s
  power: number; // engine force per driven wheel, N
}

/** Footwell floor height per car piece (vehicle-local y), from the model's body underside; set when
 *  a ride is built (Driving). The seated driver's feet are planted there, on the pedals. */
export const FOOT_Y = new Map<string, number>();

// mirrored from blender/scripts/build_vehicles_kit.py CARS (Blender y -> three z = -y)
export const CAR_DIMS: Record<string, CarDims> = {
  saloon: { L: 4.6, W: 1.7, H: 1.47, r: 0.31, wb: 2.7, track: 0.71, seat: [-0.4, -0.06, 0.05], maxSpeed: 42, power: 1900 },
  suv: { L: 4.8, W: 1.88, H: 1.85, r: 0.38, wb: 2.8, track: 0.8, seat: [-0.49, 0.08, 0.2], maxSpeed: 40, power: 2600 },
  hatch: { L: 3.9, W: 1.69, H: 1.5, r: 0.3, wb: 2.45, track: 0.7, seat: [-0.4, -0.06, 0.0], maxSpeed: 38, power: 1500 },
  // real hatchback (rv_car_*, sketchfab VW Golf, baked by blender/scripts/build_real_kit.py)
  corolla: { L: 4.62, W: 1.78, H: 1.46, r: 0.32, wb: 2.7, track: 0.76, seat: [-0.38, -0.05, 0.0], wheel: [-0.38, 0.9, 0.58], maxSpeed: 44, power: 2000 },
  cruiser: { L: 4.2, W: 1.75, H: 1.95, r: 0.4, wb: 2.3, track: 0.72, seat: [-0.4, 0.15, -0.1], maxSpeed: 36, power: 2700 },
  car: { L: 4.28, W: 1.8, H: 1.49, r: 0.33, wb: 2.63, track: 0.78, seat: [-0.38, -0.05, -0.1], wheel: [-0.35, 0.92, 0.31], maxSpeed: 46, power: 2200 },
  pickup: { L: 5.3, W: 1.85, H: 1.8, r: 0.38, wb: 3.08, track: 0.78, seat: [-0.47, 0.12, 0.45], maxSpeed: 39, power: 2600 },
};

/**
 * How each kind of car drives (Part 3.4). Rapier's raycast vehicle scales the suspension spring by
 * the chassis mass, so `spring` is per kg (sag = g / 4 spring) and changing the mass doesn't change
 * the ride height. `ballastY`: height of the heavy part of the chassis (centre of mass): higher
 * rolls more in corners. `grip`: tyre friction slip on tarmac; murram, dirt and sand take a share of
 * it (`offroad`: how much of it a tyre keeps off the tarmac, 4x4 tyres more).
 */
export interface Handling {
  mass: number; // kg
  ballastY: number; // m
  spring: number; // per kg (Rapier "stiffness")
  compression: number; // damping while compressing
  relaxation: number; // damping while extending
  travel: number; // max suspension travel, m
  rest: number; // suspension rest length, m
  grip: number;
  side: number; // lateral stiffness
  offroad: number; // grip kept on murram/dirt/sand (x surface factor)
  drive: 'fwd' | 'rwd' | 'awd';
  brake: number; // per wheel
  steerLock: number; // rad at walking pace
  steerFade: number; // m/s at which the lock halves
  engine: 'petrol' | 'diesel';
  angularDamping: number;
}

const HANDLING_DEFAULT: Handling = {
  mass: 1300, ballastY: 0.35, spring: 30, compression: 4.2, relaxation: 3.2, travel: 0.22, rest: 0.32, grip: 2.4, side: 1.1,
  offroad: 0.7, drive: 'rwd', brake: 30, steerLock: 0.6, steerFade: 14, engine: 'petrol', angularDamping: 0.6,
};
export const HANDLING: Record<string, Handling> = {
  // VW Golf GTI: light, front-wheel drive, firm and quick to turn in
  car: { ...HANDLING_DEFAULT, mass: 1350, ballastY: 0.33, spring: 34, compression: 4.6, relaxation: 3.6, travel: 0.18, grip: 2.6, side: 1.2, drive: 'fwd', brake: 32, steerLock: 0.62, steerFade: 15 },
  // Corolla saloon: softer, a little heavier, front-wheel drive, relaxed steering
  corolla: { ...HANDLING_DEFAULT, mass: 1400, ballastY: 0.36, spring: 28, compression: 4.0, relaxation: 3.0, travel: 0.2, grip: 2.4, side: 1.1, drive: 'fwd', brake: 30, steerLock: 0.58, steerFade: 13 },
  // Land Cruiser: heavy body-on-frame 4x4: high centre of mass (rolls), soft long-travel springs,
  // all four wheels driven, keeps its grip on murram, slower steering, longer braking, diesel
  cruiser: { ...HANDLING_DEFAULT, mass: 2100, ballastY: 0.68, spring: 21, compression: 3.4, relaxation: 2.6, travel: 0.3, rest: 0.38, grip: 2.2, side: 1.0, offroad: 0.95, drive: 'awd', brake: 34, steerLock: 0.52, steerFade: 11, engine: 'diesel', angularDamping: 0.75 },
};
export const handlingOf = (piece: string): Handling => HANDLING[carKind(piece)] ?? HANDLING_DEFAULT;
/** Tyre grip on each surface, as a share of the tarmac grip (before the car's `offroad`). */
export const SURFACE_GRIP = { tarmac: 1, murram: 0.72, dirt: 0.66, sand: 0.5 } as const;

export function carKind(piece: string) {
  if (piece.startsWith('rv_corolla')) return 'corolla';
  if (piece.startsWith('rv_cruiser')) return 'cruiser';
  if (piece.startsWith('rv_')) return 'car';
  return piece.split('_')[1] ?? 'saloon';
}

export const CAR_PIECES = ['rv_car_0', 'rv_car_1', 'rv_car_2', 'rv_car_3', 'rv_corolla_0', 'rv_corolla_1', 'rv_corolla_2', 'rv_cruiser_0', 'rv_cruiser_1', 'rv_cruiser_2'];

/** Live state of the boda Abel rides (systems/driving/Bike writes it; HUD, map, traffic read it). */
export const bike = {
  active: false, x: 0, y: 0, z: 0, heading: 0, speed: 0, steer: 0,
  // diagnostics (tools/bike-probe.mjs): wheel spin (rad), ground under each wheel, wheel parts found
  spin: 0, groundF: 0, groundR: 0, pitch: 0, lean: 0, wheels: 0, susp: 0, frame: 0, t: 0,
  place: null as null | { x: number; z: number; heading: number },
  hits: [] as { at: number[]; col: number[]; shape: number; body: string; vehicle: boolean; v: number; groups: number }[],
};

/** Abel is in his own vehicle (a car he drives or a boda he rides), seated or getting in/out. */
export const ownVehicle = () => drive.active || bike.active;

/** Live state of the car Abel is driving (written by the physics each frame). */
export const drive = {
  active: false,
  piece: '',
  x: 0,
  y: 0,
  z: 0,
  heading: 0,
  speed: 0, // m/s, signed
  health: 1000, // engine health of the car being driven (0: dead)
  fuel: 45, // litres in the tank (game/stations: TANK)
  steer: 0, // front wheel angle (rad): the steering wheel turns with it
  enteredAt: 0,
  bodyHandle: -1,
};

interface Parked extends Placement {
  id: number;
  /** engine health 0..1000 (GTA style); a car you crashed stays crashed when you leave it */
  health?: number;
  /** litres left (parked cars have whatever their owner left in them) */
  fuel?: number;
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
        out.push({ id: out.length, piece: CAR_PIECES[Math.floor(r() * CAR_PIECES.length)]!, x, z, rotY: heading, y: surfaceAt(x, z) });
      }
    }
  }
  return out;
}

/** Carjacking: the traffic system parks the jacked car and asks Driving to put Abel in it. */
export const enterRequest = { id: -1 };

/** What the car Abel sits in can get where it stands (game/stations), shown as the in-car prompt. */
export const useService = create<{ label: string; busy: boolean }>(() => ({ label: '', busy: false }));

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
