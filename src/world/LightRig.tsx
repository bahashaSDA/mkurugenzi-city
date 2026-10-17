import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGame } from '../app/store';

// Every dynamic light the game ever uses, in the scene from the first frame and never removed or
// hidden: three.js builds the number of lights into every shader, so a light appearing later (the
// street-light pool loading after the splash, a room's lamps on walking into a shop) recompiled
// every material in view and froze the game for seconds. Users move them and set their intensity
// (0 = off); the rig itself never changes while a quality tier lasts.
//   spots : the street-light pool (world/StreetLights): 3 / 6 / 10 by tier, the first casts a shadow on high
//   rooms : two point lights for the interior Abel is in (systems/interiors/Interiors)

export const STREET_SPOTS = { low: 3, mid: 6, high: 10 } as const;
export const rig: { spots: THREE.SpotLight[]; rooms: THREE.PointLight[] } = { spots: [], rooms: [] };

export function LightRig() {
  const scene = useThree((s) => s.scene);
  const tier = useGame((s) => s.tier);
  const lights = useMemo(() => {
    const spots = Array.from({ length: STREET_SPOTS[tier] }, (_, i) => {
      const l = new THREE.SpotLight('#ffffff', 0, 34, 1.05, 0.6, 2);
      l.castShadow = tier === 'high' && i === 0;
      if (l.castShadow) {
        l.shadow.mapSize.set(512, 512);
        l.shadow.bias = -0.0006;
        l.shadow.normalBias = 0.02;
        l.shadow.camera.near = 0.5;
        l.shadow.camera.far = 30;
      }
      l.position.set(0, -500, 0);
      return l;
    });
    const rooms = [new THREE.PointLight('#ffd9a0', 0, 12, 1.6), new THREE.PointLight('#dbe8ff', 0, 8, 1.6)];
    for (const r of rooms) r.position.set(0, -500, 0);
    return { spots, rooms };
  }, [tier]);
  useEffect(() => {
    for (const l of lights.spots) scene.add(l, l.target);
    for (const r of lights.rooms) scene.add(r);
    rig.spots = lights.spots;
    rig.rooms = lights.rooms;
    return () => {
      for (const l of lights.spots) {
        scene.remove(l, l.target);
        l.dispose();
      }
      for (const r of lights.rooms) {
        scene.remove(r);
        r.dispose();
      }
    };
  }, [scene, lights]);
  return null;
}
