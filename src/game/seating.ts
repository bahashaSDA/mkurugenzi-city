import { register, type Interactable } from './interactables';
import { seat } from './theatre';
import { onKeyPress } from '../systems/input';
import { occ } from '../systems/vehicles/occupancy';
import { drive } from '../systems/driving/state';

// Seats Abel can sit on (Part 11.1): stage benches, hoteli benches, the kinyozi bench and chair,
// beach loungers... One reusable system on top of the theatre's `seat` (the player controller holds
// him there in Sitting_Idle_Loop, hips over the spot, feet on the floor):
//   * a seat shows "Sit down" (E) only when it's free and Abel is on foot nearby
//   * sitting puts him exactly on it, facing its way; E again stands him up at its exit spot
//     (in front of the seat, never inside the bench or the table)
//   * one sitter per seat: Abel, or an NPC who has claimed it (claimSeat)
//   * the camera stays free (orbit) unless the seat asks for a fixed view (the barber's mirror)

export interface SeatSpot {
  id: string;
  /** where his hips go (feet height y: the floor under the seat), and which way he faces */
  x: number;
  y: number;
  z: number;
  facing: number;
  /** where he stands up to (in front of the seat) */
  exit: { x: number; y: number; z: number };
  kind: 'bench' | 'chair' | 'stool' | 'lounger';
  label?: string;
  /** after he sits down (the barber chair: the barber comes over) */
  onSit?: () => void;
}

const seats = new Map<string, { s: SeatSpot; it: Interactable; off: () => void }>();
const claimed = new Set<string>(); // taken by an NPC
let mine: { id: string; onStand?: () => void; locked: boolean } | null = null;

/** Sitting on a registered seat right now (null = not). */
export const sitting = () => mine?.id ?? null;

export function registerSeat(s: SeatSpot): () => void {
  const it: Interactable = {
    id: `seat-${s.id}`, x: s.x, z: s.z, y: s.y + 0.9, radius: 1.2, key: 'KeyE', priority: 0,
    label: s.label ?? (s.kind === 'lounger' ? 'Lie back' : 'Sit down'),
    use: () => (mine?.id === s.id ? standUp() : sitDown(s.id)),
  };
  const off = register(it);
  seats.set(s.id, { s, it, off });
  refresh(s.id);
  return () => {
    if (mine?.id === s.id) standUp();
    seats.get(s.id)?.off();
    seats.delete(s.id);
  };
}

function refresh(id: string) {
  const e = seats.get(id);
  if (!e) return;
  const me = mine?.id === id;
  e.it.radius = me ? 3 : claimed.has(id) || mine ? 0 : 1.2;
  e.it.priority = me ? 3 : 0; // seated: "Stand up" beats every other prompt around
  e.it.label = me ? (mine!.locked ? '' : 'Stand up') : e.s.label ?? (e.s.kind === 'lounger' ? 'Lie back' : 'Sit down');
  if (me && mine!.locked) e.it.radius = 0;
}

/**
 * Sit Abel on a seat. `cam`: a fixed view while seated (otherwise the normal camera); `locked`: he
 * can't stand up himself (a haircut in progress); `onStand`: called when he gets up.
 */
export function sitDown(id: string, opts: { cam?: { x: number; y: number; z: number; lx: number; ly: number; lz: number }; locked?: boolean; onStand?: () => void } = {}): boolean {
  const e = seats.get(id);
  if (!e || claimed.has(id) || seat.active || occ.phase !== 'walking' || drive.active) return false;
  const s = e.s;
  Object.assign(seat, {
    active: true, x: s.x, y: s.y, z: s.z, facing: s.facing, exitX: s.exit.x, exitY: s.exit.y + 1.0, exitZ: s.exit.z,
    fixedCam: !!opts.cam,
    camX: opts.cam?.x ?? 0, camY: opts.cam?.y ?? 0, camZ: opts.cam?.z ?? 0, lookX: opts.cam?.lx ?? 0, lookY: opts.cam?.ly ?? 0, lookZ: opts.cam?.lz ?? 0,
  });
  mine = { id, onStand: opts.onStand, locked: !!opts.locked };
  for (const k of seats.keys()) refresh(k);
  s.onSit?.();
  return true;
}

/** Stand up from the seat Abel is on (back to its exit spot). */
export function standUp() {
  if (!mine) return;
  const m = mine;
  mine = null;
  seat.active = false;
  seat.fixedCam = true; // the theatre's default
  for (const k of seats.keys()) refresh(k);
  m.onStand?.();
}

/** Change a seated view or lock while seated (the barber chair: mirror view while cutting). */
export function seatLock(locked: boolean) {
  if (!mine) return;
  mine.locked = locked;
  refresh(mine.id);
}

/** NPCs: claim the nearest free seat of a set (false if all taken). */
export function claimSeat(id: string): boolean {
  if (claimed.has(id) || mine?.id === id) return false;
  claimed.add(id);
  refresh(id);
  return true;
}
export function releaseSeat(id: string) {
  claimed.delete(id);
  refresh(id);
}

// Esc also stands him up (E does it through the seat's own prompt)
onKeyPress('Escape', () => {
  if (mine && !mine.locked) standUp();
});

/** ?debug */
export const seatingDebug = () => ({ mine: mine?.id ?? null, seats: seats.size, claimed: [...claimed], list: [...seats.values()].map((e) => ({ id: e.s.id, x: e.s.x, z: e.s.z, exit: e.s.exit, kind: e.s.kind })) });
