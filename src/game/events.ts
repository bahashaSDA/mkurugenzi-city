// Tiny game event bus: systems announce what the player did, missions listen.
export type GameEvent =
  | { type: 'buy'; item: string }
  | { type: 'consume'; item: string }
  | { type: 'watch'; video: string }
  | { type: 'talk'; npc: number; area: string }
  | { type: 'board'; vehicle: number }
  | { type: 'alight'; x: number; z: number }
  | { type: 'drive'; piece: string }
  | { type: 'use'; id: string }; // mission objects: scout spots, pick-ups, drop-offs

type Listener = (e: GameEvent) => void;
const listeners = new Set<Listener>();

export function emit(e: GameEvent) {
  for (const l of listeners) l(e);
}

export function listen(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
