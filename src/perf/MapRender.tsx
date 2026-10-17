import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// ?maprender: photograph the city from straight above for the satellite map (tools/render-map.mjs).
// An orthographic camera looks down on one square tile at a time (window.__maptile), fog off,
// full detail across the whole tile (kit LOD distances scaled up), no HUD, no Abel, no moving
// people or traffic. The tool screenshots each tile and stitches them into public/map/sat.

export const MAPRENDER = typeof location !== 'undefined' && new URLSearchParams(location.search).has('maprender');

/** Kit LOD/cull distance multiplier (1 in the game; large while photographing the map). */
export const kitLodScale = { value: MAPRENDER ? 6 : 1 };

declare global {
  interface Window {
    __maptile?: { x: number; z: number; size: number };
  }
}

export function MapRenderCamera() {
  const set = useThree((s) => s.set);
  const size = useThree((s) => s.size);
  const scene = useThree((s) => s.scene);
  const cam = useMemo(() => {
    const c = new THREE.OrthographicCamera(-100, 100, 100, -100, 1, 2000);
    c.up.set(0, 0, -1); // north (-Z) at the top of the image
    return c;
  }, []);
  useEffect(() => {
    set({ camera: cam });
  }, [cam, set]);
  useFrame(() => {
    scene.fog = null;
    const t = window.__maptile;
    if (!t) return;
    const h = t.size / 2;
    const aspect = size.width / size.height;
    cam.left = -h * aspect;
    cam.right = h * aspect;
    cam.top = h;
    cam.bottom = -h;
    cam.position.set(t.x, 900, t.z);
    cam.lookAt(t.x, 0, t.z);
    cam.updateProjectionMatrix();
  });
  return null;
}
