import * as THREE from 'three';
import type { KitPart } from '../../world/kit/useKit';
import { SPECS, type VehicleKind } from './specs';

// Passenger layout of a matatu / nganya / bus, measured from ITS model (not a hand-typed table):
// the cabin's real length and width come from the mesh in the window band (robust percentiles, so
// a stray antenna or a far-flung decal can't stretch it), then seats are fitted inside like the
// real thing: a 14-seater's benches three abreast, a big nganya/bus 2 + aisle + 1, rows at a
// realistic pitch, the door on the kerb side (left, +X) where the model's cabin starts.
//
// Positions are vehicle-local (x, z); floor height from the spec.

export interface TransitLayout {
  seats: [number, number][];
  stand: [number, number][];
  door: [number, number]; // outside edge of the passenger door
  aisleX: number;
  length: number; // cabin z extent (front, rear)
  front: number;
  rear: number;
  halfW: number;
}

const cache = new Map<string, TransitLayout>();
const _v = new THREE.Vector3();

export function transitLayout(piece: string, kind: VehicleKind, parts: KitPart[]): TransitLayout {
  const hit = cache.get(piece);
  if (hit) return hit;
  const spec = SPECS[kind];
  // vertices of the body in the window band (above the wheels, below the roof)
  const zs: number[] = [];
  const xs: number[] = [];
  for (const p of parts) {
    if (p.wheel || /glass/.test((p.material as THREE.Material).name)) continue;
    const pos = p.geometry.getAttribute('position');
    if (!pos) continue;
    const stride = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += stride) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(p.local);
      if (_v.y < 0.9 || _v.y > 2.1) continue;
      zs.push(_v.z);
      xs.push(Math.abs(_v.x));
    }
  }
  let rearZ = -spec.length / 2;
  let frontZ = spec.length / 2;
  let halfW = spec.width / 2;
  if (zs.length > 50) {
    zs.sort((a, b) => a - b);
    xs.sort((a, b) => a - b);
    rearZ = zs[Math.floor(zs.length * 0.02)]!;
    frontZ = zs[Math.floor(zs.length * 0.98)]!;
    halfW = xs[Math.floor(xs.length * 0.97)]!;
  }
  const small = kind === 'matatu';
  // the driver's cab at the front (the engine sits under it on these forward-control vehicles)
  const cab = small ? 1.45 : kind === 'bus' ? 2.0 : 1.75;
  const front = frontZ - cab;
  const rear = rearZ + 0.4;
  const pitch = small ? 0.86 : 0.76;
  const rows = Math.max(1, Math.floor((front - rear) / pitch));
  const seatsX = small
    ? [halfW - 0.5, 0.02, -(halfW - 0.5)]
    : [-(halfW - 0.42), -(halfW - 0.42) + 0.46, halfW - 0.42]; // pair on the right, single on the left
  const aisleX = small ? halfW - 0.2 : (seatsX[1]! + seatsX[2]!) / 2;
  const seats: [number, number][] = [];
  // fill from the BACK (the conductor seats latecomers at the back first, and Abel takes the next free)
  for (let r = 0; r < rows; r++) {
    const z = rear + 0.35 + r * pitch;
    if (small && r === rows - 1) {
      // the row behind the cab: the sliding door opens beside it, only the far seats
      seats.push([seatsX[1]!, z], [seatsX[2]!, z]);
      continue;
    }
    for (const x of seatsX) seats.push([x, z]);
  }
  const doorZ = small ? front - 0.5 : front + 0.35;
  const stand: [number, number][] = [];
  for (let z = front - 0.4; z > rear + 0.6 && stand.length < 4; z -= 1.0) stand.push([aisleX, z]);
  const out: TransitLayout = { seats, stand: stand.length ? stand : [[aisleX, (front + rear) / 2]], door: [halfW + 0.05, doorZ], aisleX, length: front - rear, front, rear, halfW };
  cache.set(piece, out);
  return out;
}
