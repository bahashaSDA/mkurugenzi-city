import { useMemo } from 'react';
import { useKit, type Kit } from '../../world/kit/useKit';

// Procedural vehicles (blender/scripts/build_vehicles_kit.py) plus the real Sketchfab models baked
// by blender/scripts/build_real_kit.py ("rv_*" pieces). Real pieces win when both exist.
export const VEHICLES_KIT_URL = '/models/vehicles_kit.glb';
export const REAL_VEHICLES_KIT_URL = '/models/real_vehicles_kit.glb';
export const REAL_VEHICLES2_KIT_URL = '/models/real_vehicles2_kit.glb'; // Hiace, Ma3, buses, Corolla, graffiti matatu, boda

export function useVehicleKit(): Kit {
  const procedural = useKit(VEHICLES_KIT_URL);
  const real = useKit(REAL_VEHICLES_KIT_URL);
  const real2 = useKit(REAL_VEHICLES2_KIT_URL);
  return useMemo(() => new Map([...procedural, ...real, ...real2]), [procedural, real, real2]);
}
