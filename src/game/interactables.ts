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
  /** Higher wins over nearer (missions 2, people 1, doors/shops 0). */
  priority?: number;
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
  let bestP = -Infinity;
  for (const i of registry.values()) {
    const dx = i.x - playerPosition.x;
    const dz = i.z - playerPosition.z;
    const d = dx * dx + dz * dz;
    if (d >= i.radius * i.radius || Math.abs((i.y ?? playerPosition.y) - playerPosition.y) >= 3) continue;
    const p = i.priority ?? 0;
    if (p > bestP || (p === bestP && d < bestD)) {
      best = i;
      bestD = d;
      bestP = p;
    }
  }
  const cur = usePrompt.getState().current;
  if (cur !== best) usePrompt.getState().set(best);
  return best;
}

export function useCurrentInteraction() {
  return usePrompt.getState().current;
}
