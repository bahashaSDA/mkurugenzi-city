import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { CELL_SIZE, WORLD_HALF } from '../config/world';
import { useGame } from '../app/store';
import { BUDGETS } from '../perf/budgets';
import { playerPosition } from '../systems/player/playerState';

// SPEC 10.1: 200 m cells. Cells within the tier radius are active; content mounts and
// unmounts with its cell (R3F disposes geometries/materials on unmount).
// Phase 2 adds a worker-based GLB prefetch on top of this bookkeeping.

const CELLS = (WORLD_HALF * 2) / CELL_SIZE;

export function cellOf(x: number, z: number): [number, number] {
  const cx = Math.floor((x + WORLD_HALF) / CELL_SIZE);
  const cz = Math.floor((z + WORLD_HALF) / CELL_SIZE);
  return [Math.min(CELLS - 1, Math.max(0, cx)), Math.min(CELLS - 1, Math.max(0, cz))];
}

export const cellKey = (cx: number, cz: number) => `${cx},${cz}`;

export function WorldStreamer() {
  const last = useRef({ key: '', radius: -1, t: 0 });
  const tier = useGame((s) => s.tier);
  const setActive = useGame((s) => s.setActiveCells);

  useFrame((state) => {
    const l = last.current;
    // Throttle to 4 Hz: streaming decisions do not need per-frame precision.
    if (state.clock.elapsedTime - l.t < 0.25) return;
    l.t = state.clock.elapsedTime;
    const [cx, cz] = cellOf(playerPosition.x, playerPosition.z);
    const key = cellKey(cx, cz);
    const radius = BUDGETS[tier].streamRadiusCells;
    if (key === l.key && radius === l.radius) return;
    l.key = key;
    l.radius = radius;
    const cells: string[] = [];
    for (let x = cx - radius; x <= cx + radius; x++) {
      for (let z = cz - radius; z <= cz + radius; z++) {
        if (x >= 0 && z >= 0 && x < CELLS && z < CELLS) cells.push(cellKey(x, z));
      }
    }
    setActive(cells);
  });
  return null;
}

/** Mounts children only while the cell containing (x, z) is streamed in. */
export function StreamedCell({ x, z, children }: { x: number; z: number; children: ReactNode }) {
  const [cx, cz] = cellOf(x, z);
  const key = cellKey(cx, cz);
  const active = useGame((s) => s.activeCells.includes(key));
  return active ? <>{children}</> : null;
}
