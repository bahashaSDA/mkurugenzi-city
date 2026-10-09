import type { Placement } from '../../world/kit/KitInstances';
import { heightAt, RIDGE } from '../../world/heights';
import { nearRoad } from '../../config/roads';

// Footprint radius (m) of each rock piece at scale 1.
const RADIUS: Record<string, number> = { rock_a: 1.1, rock_b: 2.0, rock_outcrop: 3.6, rock_flat: 2.4 };

/** Lowest ground under a footprint, so rocks on slopes never float. */
function seat(x: number, z: number, r: number) {
  let y = heightAt(x, z);
  for (let a = 0; a < 6; a++) y = Math.min(y, heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r));
  return y;
}

// Rocky Ridge: crags of big outcrops with boulder fields around them, densest on the crest.
export function buildRidgeLayout(seed = 9): Placement[] {
  let s = seed >>> 0;
  const r = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out: Placement[] = [];
  const put = (piece: string, x: number, z: number, scale: number) => {
    if (Math.abs(x) > 1560 || Math.abs(z) > 1560 || nearRoad(x, z, 2 + RADIUS[piece]! * scale)) return;
    out.push({ piece, x, z, rotY: r() * Math.PI * 2, scale, y: seat(x, z, RADIUS[piece]! * scale * 0.8) - 0.12 * scale });
  };
  for (let c = 0; c < 70; c++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * RIDGE.r * 0.9;
    const cx = RIDGE.x + Math.cos(a) * d;
    const cz = RIDGE.z + Math.sin(a) * d;
    const core = 1 - d / RIDGE.r;
    put('rock_outcrop', cx, cz, 1.2 + core * 2.2 + r() * 0.8);
    const n = 6 + Math.floor(r() * 8);
    for (let i = 0; i < n; i++) {
      const b = r() * Math.PI * 2;
      const e = 5 + r() * 14;
      const k = r();
      put(k < 0.4 ? 'rock_b' : k < 0.8 ? 'rock_a' : 'rock_flat', cx + Math.cos(b) * e, cz + Math.sin(b) * e, 0.7 + r() * 1.4);
    }
  }
  // loose scree between the crags
  for (let i = 0; i < 260; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * RIDGE.r;
    put(r() < 0.5 ? 'rock_a' : 'rock_flat', RIDGE.x + Math.cos(a) * d, RIDGE.z + Math.sin(a) * d, 0.5 + r() * 0.9);
  }
  // a few rocks on the Kibera hilltop above the houses
  for (let i = 0; i < 40; i++) put(r() < 0.5 ? 'rock_a' : 'rock_b', -470 - r() * 40, -250 + r() * 520, 0.8 + r() * 1.2);
  return out;
}
