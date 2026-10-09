import { heightAt } from '../world/heights';
// World layout (SPEC section 6). Metres; (0,0) = spawn; -Z = north.
export const WORLD_SIZE = 4000; // 4 km: outer towns 1-1.5 km from the mtaa, the sea off the east coast
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
  { id: 'school', name: "Freddie's School", center: [-1050, 780], radius: 260, phase: 2 },
  { id: 'backlot', name: 'Phil-It Studios Backlot', center: [1150, 30], radius: 290, phase: 2 },
  { id: 'cbd', name: 'CBD: Mkurugenzi Tower', center: [15, -1100], radius: 340, phase: 2 },
  { id: 'utafraaaia', name: 'Utafraaaia House', center: [-1100, -950], radius: 340, phase: 3 },
  { id: 'arena', name: 'Wakurugenzi Arena', center: [1100, -1100], radius: 140, phase: 3 },
  { id: 'fire', name: "Storyteller's Fire", center: [340, 1210], radius: 150, phase: 3 },
];

// Dev aid: ?spawn=x,z starts the player elsewhere (used by tests and level design).
function spawnFromUrl(): [number, number, number] {
  const raw = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('spawn') : null;
  const parts = raw?.split(',').map(Number);
  if (parts && parts.length === 2 && parts.every(Number.isFinite)) return [parts[0]!, heightAt(parts[0]!, parts[1]!) + 2, parts[1]!]; // on the terrain (Kibera is a hill)
  return [7.6, 2, 30]; // west pavement of the avenue, looking north up the shopping street
}

export const SPAWN: [number, number, number] = spawnFromUrl();
