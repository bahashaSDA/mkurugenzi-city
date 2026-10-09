import { useEffect } from 'react';
import { create } from 'zustand';
import { playerPosition } from '../systems/player/playerState';

// Lightweight interaction system (SPEC 8.7): anything can register a point of interest with a
// radius, a prompt and an action. The nearest one in range is shown as "E: <label>".

export interface Interactable {
  id: string;
  x: number;
  z: number;
  y?: number;
  radius: number;
  label: string;
  key?: 'KeyE' | 'KeyF';
  use: () => void;
}

const registry = new Map<string, Interactable>();

export const usePrompt = create<{ current: Interactable | null; set: (i: Interactable | null) => void }>((set) => ({
  current: null,
  set: (current) => set({ current }),
}));

export function register(i: Interactable) {
  registry.set(i.id, i);
  return () => {
    registry.delete(i.id);
  };
}

export function useInteractables(list: Interactable[]) {
  useEffect(() => {
    const offs = list.map(register);
    return () => offs.forEach((f) => f());
  }, [list]);
}

/** Called a few times per second: nearest interactable within its radius (ignores ones far above). */
export function updateNearest(): Interactable | null {
  let best: Interactable | null = null;
  let bestD = Infinity;
  for (const i of registry.values()) {
    const dx = i.x - playerPosition.x;
    const dz = i.z - playerPosition.z;
    const d = dx * dx + dz * dz;
    if (d < i.radius * i.radius && d < bestD && Math.abs((i.y ?? playerPosition.y) - playerPosition.y) < 3) {
      best = i;
      bestD = d;
    }
  }
  const cur = usePrompt.getState().current;
  if (cur !== best) usePrompt.getState().set(best);
  return best;
}

export function useCurrentInteraction() {
  return usePrompt.getState().current;
}
