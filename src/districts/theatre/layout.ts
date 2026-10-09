import { heightAt } from '../../world/heights';
import { THEATRE } from '../../game/places';

// Mkurugenzi Grand Theatre (CBD), inspired by the Kenya National Theatre and Nairobi Cinema,
// where Abel's first live audiences sat (SPEC 2.2, 7.8). Original name, no real signage.
// Local frame: origin at the building centre on the ground, the front (glass lobby) faces +Z
// (south, onto CBD street 1). Metres.
export const TH = {
  cx: THEATRE.x,
  cz: THEATRE.z,
  W: 60, // outside width (x)
  D: 64, // outside depth (z)
  H: 22, // main roof
  flyH: 31, // stage house (fly tower)
  wall: 0.6,
  lobbyZ: 18, // lobby occupies z 18..32
  lobbyH: 7.2,
  hallX: 25.6, // inner face of the corridor walls (the hall is |x| < hallX)
  corridorEnd: -12, // corridors open into the front of the hall here
  stageFront: -18.5, // stage edge (z)
  stageBack: -29,
  stageY: 1.1,
  rows: 22,
  rowPitch: 1.0,
  rowRise: 0.17,
  firstRowZ: -14,
  seatPitch: 0.6,
  blocks: [
    { x0: -23.2, n: 20 },
    { x0: -9.6, n: 32 },
    { x0: 11.2, n: 20 },
  ],
  platformY: 3.9, // standing room / control booth behind the last row
  screen: { w: 20, h: 11.25, z: -27.6, y: 1.1 + 1.6 + 11.25 / 2 },
  proscenium: { w: 28, h: 14 },
};

export const PRICE = 50000; // KSh: a night at the Grand Theatre (about 45-50 missions of pay)

export function groundY() {
  return heightAt(TH.cx, TH.cz);
}

/** Local (building) -> world. The building is not rotated: local axes = world axes. */
export const toWorld = (lx: number, lz: number) => ({ x: TH.cx + lx, z: TH.cz + lz });

/** Floor height of seat row i (local y). */
export const rowY = (i: number) => 0.15 + i * TH.rowRise;
export const rowZ = (i: number) => TH.firstRowZ + i * TH.rowPitch;

/** Every seat: local x, row index. */
export function seats(): { x: number; row: number }[] {
  const out: { x: number; row: number }[] = [];
  for (let r = 0; r < TH.rows; r++) {
    for (const b of TH.blocks) for (let i = 0; i < b.n; i++) out.push({ x: b.x0 + (i + 0.5) * TH.seatPitch, row: r });
  }
  return out;
}

/** Inside the hall or lobby (world x, z, feet y)? Used to dim the sky light indoors. */
export function insideTheatre(x: number, z: number, y: number) {
  const lx = x - TH.cx;
  const lz = z - TH.cz;
  return Math.abs(lx) < TH.W / 2 - TH.wall && lz > -TH.D / 2 + TH.wall && lz < TH.D / 2 - 0.3 && y < groundY() + 12;
}
