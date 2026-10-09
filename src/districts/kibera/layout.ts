import type { Placement } from '../../world/kit/KitInstances';
import { heightAt, KIBERA } from '../../world/heights';
import { distToRoad, ROADS } from '../../config/roads';

// Kibera (owner photo): terraced rows of rooms squeezed back-to-back down the hillside, doors on
// ~1.4 m alleys, murram lanes and the old railway path cutting through, homes you can enter and
// video halls on the main lane. Rows run along the contour (north-south) so they sit on the slope.

export const ROOM_W = 3.2;
export const ROOM_D = 3.4;
const ALLEY = 1.3;
const PAIR = ROOM_D * 2 + ALLEY; // two rows back-to-back + one squeezed alley
const FACE_EAST = Math.PI / 2;
const FACE_WEST = -Math.PI / 2;
const ROWS = [3, 4, 6] as const;

export const KIBERA_HOMES: { x: number; z: number; rotY: number }[] = [];
export const KIBERA_HALLS: { x: number; z: number; rotY: number }[] = [];
/** Alley centre lines between row pairs (pedestrian walk segments): [x, z0, z1]. */
export const KIBERA_ALLEYS: [number, number, number][] = [];
/** Power lines along Kibera's lanes (poles in order), wired by Cables. */
export const KIBERA_POLE_LINES: Placement[][] = [];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Ground height under a footprint: the lowest corner, so nothing floats on the slope. */
function footY(x: number, z: number, halfX: number, halfZ: number) {
  return Math.min(heightAt(x - halfX, z - halfZ), heightAt(x + halfX, z - halfZ), heightAt(x - halfX, z + halfZ), heightAt(x + halfX, z + halfZ)) - 0.08;
}

// video halls beside the lanes (north of the lane, door facing it)
const HALLS: [number, number][] = [[-215, 5.7], [-330, 13.7], [-262, -111.4]];

function blocked(x: number, z: number, halfLen: number) {
  for (const [hx, hz] of HALLS) if (Math.abs(x - hx) < 6 && Math.abs(z - hz) < halfLen + 4) return true;
  for (const r of ROADS) {
    const pad = r.width / 2 + 1.2;
    for (const dz of [-halfLen, 0, halfLen]) if (distToRoad(r, x, z + dz) < pad + ROOM_D / 2) return true;
  }
  return false;
}

export function buildKiberaLayout(seed = 2026): Placement[] {
  const r = rng(seed);
  const out: Placement[] = [];
  KIBERA_HOMES.length = 0;
  KIBERA_HALLS.length = 0;
  KIBERA_ALLEYS.length = 0;
  for (let cx = KIBERA.x1 - 12; cx > KIBERA.x0 + 20; cx -= PAIR) {
    for (let z = KIBERA.z0 + 10; z < KIBERA.z1 - 50; z += 45) KIBERA_ALLEYS.push([cx - ROOM_D - ALLEY / 2, z, z + 45]);
    for (const side of [-1, 1] as const) {
      const x0 = cx + side * (ROOM_D / 2); // backs touch at cx; doors face the outer alleys
      let z = KIBERA.z0 + 6 + r() * 4;
      while (z < KIBERA.z1 - 6) {
        let n: number = ROWS[Math.floor(r() * ROWS.length)]!;
        if (blocked(x0, z + (n * ROOM_W) / 2, (n * ROOM_W) / 2)) n = 3; // short rows crowd right up to lanes
        const len = n * ROOM_W;
        const zc = z + len / 2;
        if (zc + len / 2 > KIBERA.z1) break;
        // photo: nothing lines up; rows lean a little off the grid
        const x = x0 + (r() - 0.5) * 0.24;
        if (blocked(x, zc, len / 2)) {
          z += 1.5; // creep up to the lane instead of leaving a row-length gap
          continue;
        }
        if (r() < 0.05) {
          // a tree grows in the gap (avocado/mango trees rise above the roofs in the photo)
          out.push({ piece: r() < 0.5 ? 'tree_street' : 'tree_jacaranda', x, z: zc, rotY: r() * 6.28, y: heightAt(x, zc) - 0.1 });
        } else if (r() > 0.03) {
          const rotY = (side < 0 ? FACE_WEST : FACE_EAST) + (r() - 0.5) * 0.05;
          if (r() < 0.035) {
            // an enterable home in the gap (door onto the alley)
            out.push({ piece: 'kib_home_open', x, z: zc, rotY, y: footY(x, zc, 1.8, 1.8) });
            KIBERA_HOMES.push({ x, z: zc, rotY });
          } else {
            // rows are modelled along local X with doors on local +Z: rotY = +-90 deg puts the
            // length along the contour (world Z) and the doors onto the east/west alley
            out.push({ piece: `kib_row${n}`, x, z: zc, rotY, y: footY(x, zc, ROOM_D / 2, len / 2) });
          }
        }
        z += len + 0.25 + r() * 0.7; // squeezed: barely a gap between rows
      }
    }
  }
  // alley life: washing lines across the alleys, rubbish underfoot
  for (const [ax, z0, z1] of KIBERA_ALLEYS) {
    for (let z = z0 + 3; z < z1 - 3; z += 3 + r() * 7) {
      const y = heightAt(ax, z);
      if (r() < 0.55) out.push({ piece: 'kib_washline', x: ax, z, rotY: Math.PI / 2 + (r() - 0.5) * 0.3, y: y - 0.05 });
      if (r() < 0.5) out.push({ piece: 'kib_litter', x: ax + (r() - 0.5) * 0.4, z: z + 1.5, rotY: r() * 6.28, y: y + 0.01 });
    }
  }
  // power lines along the murram lanes, with a tangle of drops onto the roofs
  KIBERA_POLE_LINES.length = 0;
  for (const rd of ROADS) {
    if (rd.kind !== 'murram' || !rd.id.startsWith('kibera')) continue;
    const line: Placement[] = [];
    for (let i = 0; i < rd.pts.length - 1; i++) {
      const [ax, az] = rd.pts[i]!;
      const [bx, bz] = rd.pts[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      for (let s = i === 0 ? 4 : 0; s < len; s += 32) {
        const t = s / len;
        const x = ax + (bx - ax) * t + ((bz - az) / len) * (rd.width / 2 + 0.8);
        const z = az + (bz - az) * t - ((bx - ax) / len) * (rd.width / 2 + 0.8);
        const p = { piece: 'power_pole', x, z, rotY: Math.atan2(bx - ax, bz - az) + Math.PI / 2, y: heightAt(x, z) - 0.1 };
        line.push(p);
        out.push(p);
        if (r() < 0.6) out.push({ piece: 'kib_litter', x: x + (r() - 0.5) * 2, z: z + (r() - 0.5) * 2, rotY: r() * 6.28, y: heightAt(x, z) + 0.01 });
      }
    }
    KIBERA_POLE_LINES.push(line);
  }
  // video halls on the main lane (watch Abel's episodes)
  for (const [x, z] of HALLS) {
    const y = footY(x, z, 2.5, 2.5);
    out.push({ piece: 'kib_video_hall', x, z, rotY: 0, y });
    KIBERA_HALLS.push({ x, z, rotY: 0 });
  }
  return out;
}
