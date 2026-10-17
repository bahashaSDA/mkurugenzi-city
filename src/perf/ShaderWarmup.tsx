import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { compileAll } from './compileAll';

// No first-sight stutter: three.js compiles a material's shader the first time it is DRAWN, which
// freezes that frame for tens of milliseconds (a district streaming in, a new vehicle model, the
// night lights). Instead, whenever new materials have entered the scene, compile them in the
// background with compileAsync (KHR_parallel_shader_compile: the driver compiles off the main
// thread) before they are ever on screen. The check runs in idle time and costs ~1 ms when nothing
// is new; hidden objects are included (compile() collects every material, visible or not).

const seen = new WeakSet<THREE.Material>();

export function ShaderWarmup() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    let stop = false;
    let busy = false;
    let handle = 0;
    const idle: (cb: () => void) => number =
      typeof requestIdleCallback === 'function' ? (cb) => requestIdleCallback(cb, { timeout: 1500 }) : (cb) => window.setTimeout(cb, 200);
    const check = () => {
      if (stop || busy) return;
      let fresh = 0;
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (!m) return;
        if (Array.isArray(m)) {
          for (const x of m) if (!seen.has(x)) (seen.add(x), fresh++);
        } else if (!seen.has(m)) (seen.add(m), fresh++);
      });
      if (!fresh) return;
      busy = true;
      compileAll(gl, scene, camera).finally(() => (busy = false));
    };
    const loop = () => {
      if (stop) return;
      handle = window.setTimeout(() => idle(() => (check(), loop())), 1000);
    };
    check();
    loop();
    return () => {
      stop = true;
      clearTimeout(handle);
    };
  }, [gl, scene, camera]);
  return null;
}
