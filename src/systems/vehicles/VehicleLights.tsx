import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clock, lightsOn } from '../../world/clock';
import { heightAt } from '../../world/heights';
import { SPECS } from './specs';
import { vehicles } from './state';
import { drive, CAR_DIMS, carKind } from '../driving/state';

// Headlights and tail-lights after dark for all traffic and the car Abel drives: glowing lamp
// sprites (camera-facing) and a pool of light on the road ahead. Four draw calls in total.
const MAX = 96;

const glowTex = (() => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _qy = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

export function VehicleLights() {
  const head = useRef<THREE.InstancedMesh>(null);
  const tail = useRef<THREE.InstancedMesh>(null);
  const beam = useRef<THREE.InstancedMesh>(null);
  const mats = useMemo(
    () => ({
      head: new THREE.MeshBasicMaterial({ map: glowTex, color: '#fff4dc', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
      tail: new THREE.MeshBasicMaterial({ map: glowTex, color: '#ff1a10', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
      beam: new THREE.MeshBasicMaterial({ map: glowTex, color: '#fff1d0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 }),
    }),
    [],
  );
  const quad = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const flat = useMemo(() => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);

  useFrame((state) => {
    const on = lightsOn(clock.hours);
    const h = head.current;
    const t = tail.current;
    const b = beam.current;
    if (!h || !t || !b) return;
    const visible = on > 0.05;
    h.visible = t.visible = b.visible = visible;
    if (!visible) return;
    mats.head.opacity = on;
    mats.tail.opacity = on * 0.9;
    mats.beam.opacity = on * 0.35;
    const cam = state.camera;
    let n = 0;
    let nb = 0;
    const put = (x: number, y: number, z: number, heading: number, L: number, W: number, H: number) => {
      if (n + 2 > MAX) return;
      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      const rx = fz;
      const rz = -fx;
      const ly = y + Math.min(0.8, H * 0.35);
      for (const side of [-1, 1]) {
        const ox = rx * side * W * 0.36;
        const oz = rz * side * W * 0.36;
        _m.compose(_p.set(x + fx * L * 0.5 + ox, ly, z + fz * L * 0.5 + oz), cam.quaternion, _s.setScalar(0.9));
        h.setMatrixAt(n, _m);
        _m.compose(_p.set(x - fx * L * 0.5 + ox, ly, z - fz * L * 0.5 + oz), cam.quaternion, _s.setScalar(0.55));
        t.setMatrixAt(n, _m);
        n++;
      }
      const bx = x + fx * (L * 0.5 + 7);
      const bz = z + fz * (L * 0.5 + 7);
      _qy.setFromAxisAngle(_up, heading);
      _m.compose(_p.set(bx, heightAt(bx, bz) + 0.05, bz), _qy, _s.set(W * 2.2, 1, 13));
      b.setMatrixAt(nb++, _m);
    };
    for (const v of vehicles) {
      if (v.jackedUntil) continue;
      if (Math.hypot(v.x - cam.position.x, v.z - cam.position.z) > 380) continue;
      const sp = SPECS[v.kind];
      put(v.x, v.y, v.z, v.heading, sp.length, sp.width, sp.height);
    }
    if (drive.active) {
      const d = CAR_DIMS[carKind(drive.piece)]!;
      put(drive.x, drive.y, drive.z, drive.heading, d.L, d.W, d.H); // the car body origin sits at road level
    }
    h.count = t.count = n;
    b.count = nb;
    h.instanceMatrix.needsUpdate = t.instanceMatrix.needsUpdate = b.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={head} args={[quad, mats.head, MAX]} frustumCulled={false} renderOrder={4} />
      <instancedMesh ref={tail} args={[quad, mats.tail, MAX]} frustumCulled={false} renderOrder={4} />
      <instancedMesh ref={beam} args={[flat, mats.beam, MAX / 2]} frustumCulled={false} renderOrder={2} />
    </>
  );
}
