import * as THREE from 'three';

// Nairobi solar geometry (research/references/nature.md).
const LAT = (-1.29 * Math.PI) / 180;
// Solar noon in Nairobi local clock time (UTC+3, longitude 36.8°E) is about 12:20 to 12:35.
const SOLAR_NOON_OFFSET_H = 0.4;

/** Writes a unit vector pointing toward the sun into `out` (three.js axes: +X east, +Y up, -Z north). */
export function sunDirection(clockHours: number, dayOfYear: number, out: THREE.Vector3): THREE.Vector3 {
  const decl = ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365);
  const H = ((clockHours - 12 - SOLAR_NOON_OFFSET_H) * 15 * Math.PI) / 180;
  const east = -Math.cos(decl) * Math.sin(H);
  const north = Math.cos(LAT) * Math.sin(decl) - Math.sin(LAT) * Math.cos(decl) * Math.cos(H);
  const up = Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(H);
  return out.set(east, up, -north).normalize();
}

export function dayOfYear(d = new Date()): number {
  const start = Date.UTC(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start) / 86_400_000);
}
