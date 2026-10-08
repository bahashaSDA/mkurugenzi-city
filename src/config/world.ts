// World layout (SPEC section 6). Metres; (0,0) = spawn; -Z = north.
export const WORLD_SIZE = 1600;
export const WORLD_HALF = WORLD_SIZE / 2;
export const CELL_SIZE = 200;

export interface DistrictDef {
  id: string;
  name: string;
  center: [number, number]; // x, z
  radius: number; // load trigger radius, m
  phase: 0 | 1 | 2 | 3;
}

export const DISTRICTS: DistrictDef[] = [
  { id: 'hub', name: 'Mtaa wa Mkurugenzi', center: [0, 0], radius: 180, phase: 1 },
  { id: 'stage', name: 'Matatu Stage', center: [0, 120], radius: 60, phase: 1 },
  { id: 'school', name: "Freddie's School", center: [-500, 0], radius: 160, phase: 2 },
  { id: 'backlot', name: 'Phil-It Studios Backlot', center: [500, 0], radius: 160, phase: 2 },
  { id: 'cbd', name: 'CBD: Mkurugenzi Tower', center: [0, -500], radius: 220, phase: 2 },
  { id: 'utafraaaia', name: 'Utafraaaia House', center: [-600, -550], radius: 120, phase: 3 },
  { id: 'arena', name: 'Wakurugenzi Arena', center: [600, -600], radius: 200, phase: 3 },
  { id: 'fire', name: "Storyteller's Fire", center: [250, 650], radius: 150, phase: 3 },
];

// Dev aid: ?spawn=x,z starts the player elsewhere (used by tests and level design).
function spawnFromUrl(): [number, number, number] {
  const raw = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('spawn') : null;
  const parts = raw?.split(',').map(Number);
  if (parts && parts.length === 2 && parts.every(Number.isFinite)) return [parts[0]!, 2, parts[1]!];
  return [0, 2, 8];
}

export const SPAWN: [number, number, number] = spawnFromUrl();
