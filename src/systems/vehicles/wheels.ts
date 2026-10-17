import * as THREE from 'three';
import type { KitDoor, KitPart, KitWheel } from '../../world/kit/useKit';

// Wheels split out of the real vehicle models (tools/split-wheels.mjs): each wheel part spins about
// its own axle (local X), the front pair steers about the vertical through the axle centre, and the
// whole wheel can drop/rise with the suspension. Everything else stays in the body.

const _t = new THREE.Matrix4();
const _r = new THREE.Matrix4();
const _s = new THREE.Matrix4();
const _back = new THREE.Matrix4();

/** out = T(centre + drop) · Ry(steer) · Rx(spin) · T(-centre) · part.local */
export function wheelLocal(out: THREE.Matrix4, part: KitPart, spin: number, steer: number, drop = 0): THREE.Matrix4 {
  const w = part.wheel!;
  _back.makeTranslation(-w.center.x, -w.center.y, -w.center.z);
  _r.makeRotationX(spin);
  if (steer) _r.premultiply(_s.makeRotationY(steer));
  _t.makeTranslation(w.center.x, w.center.y + drop, w.center.z);
  return out.copy(_t).multiply(_r).multiply(_back).multiply(part.local);
}

/** Wheel layout of a piece (from its LOD0): centres and radii, sorted front first. */
export function wheelLayout(parts: KitPart[]): KitWheel[] {
  const seen = new Map<number, KitWheel>();
  for (const p of parts) if (p.wheel && !seen.has(p.wheel.index)) seen.set(p.wheel.index, p.wheel);
  return [...seen.values()].sort((a, b) => a.index - b.index);
}

/** Wheelbase (front axle to rear axle) of a layout, or a fallback. */
export function wheelbase(ws: KitWheel[], fallback: number): number {
  if (ws.length < 2) return fallback;
  const zs = ws.map((w) => w.center.z);
  return Math.max(...zs) - Math.min(...zs) || fallback;
}

const _f = new THREE.Matrix4();
/**
 * Draw any wheel of a vehicle with the geometry of its wheel 0 (one instanced batch for all four):
 * a wheel turned 180 degrees about its vertical axis is the same wheel seen from the other side.
 * out = T(target) · Ry(steer) · Rx(spin) · [Ry(pi) if on the other side] · T(-proto) · proto.local
 */
export function sharedWheelLocal(out: THREE.Matrix4, proto: KitPart, target: KitWheel, spin: number, steer: number): THREE.Matrix4 {
  const p = proto.wheel!;
  _back.makeTranslation(-p.center.x, -p.center.y, -p.center.z);
  _r.makeRotationX(spin);
  if (steer) _r.premultiply(_s.makeRotationY(steer));
  if (Math.sign(target.center.x || 1) !== Math.sign(p.center.x || 1)) _r.multiply(_f.makeRotationY(Math.PI));
  _t.makeTranslation(target.center.x, target.center.y, target.center.z);
  return out.copy(_t).multiply(_r).multiply(_back).multiply(proto.local);
}

const _dt = new THREE.Matrix4();
/**
 * A door at `open` (0 closed .. 1 fully open), relative to the piece:
 *   swing / rear  turn about the vertical hinge line, outwards (side doors ~68 deg, barn doors ~100)
 *   slide         pop out a few cm, then run back along the body
 */
export function doorLocal(out: THREE.Matrix4, part: KitPart, open: number): THREE.Matrix4 {
  const d = part.door as KitDoor;
  if (open <= 0.001) return out.copy(part.local);
  if (d.kind === 'slide') {
    const outward = Math.min(1, open * 4) * 0.075 * d.side;
    const back = Math.max(0, (open - 0.15) / 0.85) * Math.min(0.95, d.size.z * 0.9);
    return out.makeTranslation(outward, 0, -back).multiply(part.local);
  }
  const max = d.kind === 'rear' ? 1.75 : 1.18;
  const a = -d.side * max * open;
  _back.makeTranslation(-d.hinge.x, -d.hinge.y, -d.hinge.z);
  _dt.makeRotationY(a);
  _t.makeTranslation(d.hinge.x, d.hinge.y, d.hinge.z);
  return out.copy(_t).multiply(_dt).multiply(_back).multiply(part.local);
}
