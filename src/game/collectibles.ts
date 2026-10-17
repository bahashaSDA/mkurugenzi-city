import { create } from 'zustand';
import { useEconomy } from './economy';
import { place } from './places';
import { nearRoad } from '../config/roads';

// Secrets to find (Part 18.3): twelve "Mkurugenzi Story Tapes" hidden in the open at landmarks
// (never inside a building, nothing to walk through), plus the old class photo in Freddie's School.
// No map markers: you find them by exploring (a tape glows and turns slowly, you see it from ~25 m).
// Each tape is one of Abel's episodes: picking it up pays a little and puts the episode in your bag
// to watch. Finding everything pays a bonus. Saved per browser (versioned, unknown ids ignored).

export interface Secret { id: string; name: string; where: string; reward: number; dx?: number; dz?: number; room?: boolean }

export const SECRETS: Secret[] = [
  { id: 'tape-kibera-hill', name: 'Story Tape #1', where: 'the top of Kibera hill', reward: 300 },
  { id: 'tape-fire', name: 'Story Tape #2', where: "the Storyteller's Fire", reward: 300, dx: 4, dz: 3 },
  { id: 'tape-north-beach', name: 'Story Tape #3', where: 'the north beach', reward: 250, dx: 6 },
  { id: 'tape-south-beach', name: 'Story Tape #4', where: 'the south beach', reward: 250, dx: 6 },
  { id: 'tape-ridge', name: 'Story Tape #5', where: 'Rocky Ridge', reward: 350 },
  { id: 'tape-junction', name: 'Story Tape #6', where: 'Mashinani Junction', reward: 200, dx: 9, dz: 9 },
  { id: 'tape-railway', name: 'Story Tape #7', where: 'the Kibera railway', reward: 200, dx: 3 },
  { id: 'tape-soko', name: 'Story Tape #8', where: 'Soko la Mkurugenzi', reward: 150 },
  { id: 'tape-stage', name: 'Story Tape #9', where: 'the matatu stage', reward: 150, dx: -3, dz: 4 },
  { id: 'tape-east', name: 'Story Tape #10', where: 'East Road', reward: 200, dx: 8 },
  { id: 'tape-south-road', name: 'Story Tape #11', where: 'South Road', reward: 200, dz: 8 },
  { id: 'tape-beach', name: 'Story Tape #12', where: 'Mkurugenzi Beach', reward: 250, dx: 5, dz: -6 },
  { id: 'oldboy-photo', name: "The Class of '99 photo", where: "Freddie's School, head teacher's office", reward: 500, room: true },
];
export const FIND_ALL_BONUS = 5000;

const KEY = 'mk.secrets.v1';
function load(): string[] {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '[]') as unknown;
    return Array.isArray(s) ? s.filter((id) => SECRETS.some((x) => x.id === id)) : [];
  } catch {
    return [];
  }
}

export const useSecrets = create<{ found: string[] }>(() => ({ found: load() }));

/** World position of a secret (not for the room one). */
export function secretSpot(s: Secret): { x: number; z: number } | null {
  if (s.room) return null;
  try {
    const p = place(s.where);
    const x = p.x + (s.dx ?? 0);
    const z = p.z + (s.dz ?? 0);
    if (!nearRoad(x, z, 1.5)) return { x, z };
    // never on a road (traffic): the nearest spot just off it, searching outwards
    for (let r = 1; r <= 20; r++)
      for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (!nearRoad(x + ux * r, z + uz * r, 1.5)) return { x: x + ux * r, z: z + uz * r };
    return { x, z };
  } catch {
    return null;
  }
}

/** Abel finds a secret: once only, reward, saved; everything found pays the bonus. */
export function findSecret(id: string): boolean {
  const s = SECRETS.find((x) => x.id === id);
  const st = useSecrets.getState();
  if (!s || st.found.includes(id)) return false;
  const found = [...st.found, id];
  useSecrets.setState({ found });
  try {
    localStorage.setItem(KEY, JSON.stringify(found));
  } catch {
    /* storage blocked */
  }
  const eco = useEconomy.getState();
  eco.earn(s.reward, `${s.name} found (${found.length}/${SECRETS.length})`);
  if (s.room) eco.toast("A circled face in the old class photo... 'Kwani mi huduu?' Looks like young Abel!", 'info');
  else eco.toast(`${s.name}: an episode is in your bag (I) to watch`, 'info');
  if (found.length === SECRETS.length) eco.earn(FIND_ALL_BONUS, 'Every Mkurugenzi secret found!');
  return true;
}
