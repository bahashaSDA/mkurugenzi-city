import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { diving, playerPosition, playerView } from './playerState';

// Breath bubbles while Abel dives: a small pool rising from his head (he swims flat, head first),
// wobbling up and popping at the surface. 48 points, one draw call, nothing allocated per frame.

const N = 48;

export function Bubbles() {
  const b = useMemo(() => {
    const pos = new Float32Array(N * 3).fill(-1e4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.PointsMaterial({ color: '#dff6ff', size: 0.07, transparent: true, opacity: 0.75, depthWrite: false });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    return { pts, pos, life: new Float32Array(N), next: 0, acc: 0 };
  }, []);
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    if (diving.under) {
      b.acc += dt * 9;
      while (b.acc >= 1) {
        b.acc -= 1;
        const i = b.next;
        b.next = (b.next + 1) % N;
        const f = playerView.facing;
        b.pos.set([playerPosition.x + Math.sin(f) * 0.7 + (Math.random() - 0.5) * 0.15, playerPosition.y + 0.15, playerPosition.z + Math.cos(f) * 0.7 + (Math.random() - 0.5) * 0.15], i * 3);
        b.life[i] = 1;
      }
    }
    const t = state.clock.elapsedTime;
    const top = playerPosition.y + diving.depth + 0.4; // about the surface
    for (let i = 0; i < N; i++) {
      if (b.life[i]! <= 0) continue;
      b.pos[i * 3 + 1]! += dt * (0.9 + (i % 5) * 0.12);
      b.pos[i * 3]! += Math.sin(t * 6 + i) * dt * 0.08;
      if (b.pos[i * 3 + 1]! > top) {
        b.life[i] = 0;
        b.pos[i * 3 + 1] = -1e4;
      }
    }
    b.pts.geometry.attributes.position!.needsUpdate = true;
  });
  return <primitive object={b.pts} />;
}
