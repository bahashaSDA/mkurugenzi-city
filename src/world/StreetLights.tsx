import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROADS } from '../config/roads';
import { ROUTES } from '../systems/vehicles/routes';
import { heightAt } from './heights';
import { clock, lightsOn } from './clock';

// Nairobi street lighting: galvanised poles with a cantilever arm and a sodium (orange) or LED
// (white, CBD and expressway) head every ~32 m, alternating sides. At dusk the heads glow, a soft
// halo blooms around them and a pool of light falls on the road. No real lights: 3 draw calls
// for poles, 1 for halos, 1 for pools, whatever the number of lamps.
const SPACING = 32;
const HEIGHT = 8.5;
const ARM = 1.8;

interface Lamp {
  x: number;
  y: number;
  z: number;
  hx: number; // head position (over the road)
  hz: number;
  rot: number;
  led: boolean;
}

function planLamps(): Lamp[] {
  const out: Lamp[] = [];
  const stops = ROUTES.flatMap((r) => r.stops);
  for (const rd of ROADS) {
    if (rd.kind === 'murram' || rd.id === 'avenue') continue; // the shopping avenue has its own timber poles
    const led = rd.kind === 'highway' || rd.id.startsWith('cbd') || rd.id === 'arena-road';
    let side = 1;
    for (let i = 0; i < rd.pts.length - 1; i++) {
      const [ax, az] = rd.pts[i]!;
      const [bx, bz] = rd.pts[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / len;
      const dz = (bz - az) / len;
      for (let s = 10; s < len - 6; s += SPACING) {
        side = rd.kind === 'highway' ? 0 : -side; // highway: lamps on the median
        const off = side === 0 ? 0 : side * (rd.width / 2 + 0.9);
        const x = ax + dx * s + dz * off;
        const z = az + dz * s - dx * off;
        if (stops.some((st) => Math.hypot(st.x - x, st.z - z) < 8)) continue;
        if (ROADS.some((o) => o !== rd && o.pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 10))) continue;
        const inward = side === 0 ? 1 : -side;
        const hx = x - dz * ARM * inward;
        const hz = z + dx * ARM * inward;
        out.push({ x, y: heightAt(x, z), z, hx, hz, rot: Math.atan2(hx - x, hz - z), led });
        if (side === 0) {
          // double-armed median lamp: second head over the other carriageway
          out.push({ x, y: heightAt(x, z), z, hx: x + dz * ARM, hz: z - dx * ARM, rot: Math.atan2(dz, -dx), led });
        }
      }
    }
  }
  return out;
}

function poleGeometry() {
  const pole = new THREE.CylinderGeometry(0.07, 0.11, HEIGHT, 8, 1, true);
  pole.translate(0, HEIGHT / 2, 0);
  const base = new THREE.CylinderGeometry(0.18, 0.2, 0.5, 8);
  base.translate(0, 0.25, 0);
  const arm = new THREE.CylinderGeometry(0.045, 0.05, ARM, 6, 1, true);
  arm.rotateX(Math.PI / 2);
  arm.translate(0, HEIGHT - 0.15, ARM / 2);
  const head = new THREE.BoxGeometry(0.32, 0.12, 0.7);
  head.translate(0, HEIGHT - 0.2, ARM + 0.15);
  return mergeGeometries([pole, base, arm, head].map((g) => g.toNonIndexed()))!;
}

const glowTex = (() => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

const SODIUM = new THREE.Color('#ffae5a');
const LED = new THREE.Color('#e8f0ff').multiplyScalar(0.6);

export function StreetLights() {
  const lamps = useMemo(planLamps, []);
  const halo = useRef<THREE.InstancedMesh>(null);
  const pool = useRef<THREE.InstancedMesh>(null);

  const { poles, haloMat, poolMat, haloGeo, poolGeo } = useMemo(() => {
    const geo = poleGeometry();
    const mat = new THREE.MeshStandardMaterial({ color: '#8c9196', roughness: 0.45, metalness: 0.7 });
    const poles = new THREE.InstancedMesh(geo, mat, lamps.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    lamps.forEach((l, i) => {
      m.compose(new THREE.Vector3(l.x, l.y, l.z), q.setFromAxisAngle(up, l.rot), new THREE.Vector3(1, 1, 1));
      poles.setMatrixAt(i, m);
    });
    poles.castShadow = true;
    poles.receiveShadow = true;
    const haloMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, vertexColors: false });
    const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 });
    const haloGeo = new THREE.PlaneGeometry(1, 1);
    const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    return { poles, haloMat, poolMat, haloGeo, poolGeo };
  }, [lamps]);

  // colours per instance (sodium vs LED) set once
  const colours = useMemo(() => lamps.map((l) => (l.led ? LED : SODIUM)), [lamps]);
  const _m = useMemo(() => new THREE.Matrix4(), []);
  const _q = useMemo(() => new THREE.Quaternion(), []);
  const _p = useMemo(() => new THREE.Vector3(), []);
  const _s = useMemo(() => new THREE.Vector3(), []);
  const st = useRef({ t: 1, on: -1 });

  useFrame((state, dt) => {
    const on = lightsOn(clock.hours);
    haloMat.opacity = on * 0.85;
    poolMat.opacity = on * 0.55;
    const h = halo.current;
    const p = pool.current;
    if (!h || !p) return;
    h.visible = p.visible = on > 0.02;
    if (!h.visible) return;
    // halos face the camera; refresh a few times a second (cheap, no allocation)
    const s = st.current;
    s.t += dt;
    if (s.t < 0.1 && Math.abs(s.on - on) < 0.05) return;
    s.t = 0;
    s.on = on;
    _q.copy(state.camera.quaternion);
    lamps.forEach((l, i) => {
      _p.set(l.hx, l.y + HEIGHT - 0.35, l.hz);
      _m.compose(_p, _q, _s.setScalar(2.6));
      h.setMatrixAt(i, _m);
      _p.set(l.hx, heightAt(l.hx, l.hz) + 0.04, l.hz);
      _m.compose(_p, _q.identity(), _s.set(15, 1, 15));
      p.setMatrixAt(i, _m);
      _q.copy(state.camera.quaternion);
    });
    h.instanceMatrix.needsUpdate = true;
    p.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <primitive object={poles} />
      <instancedMesh ref={halo} args={[haloGeo, haloMat, lamps.length]} frustumCulled={false} renderOrder={3}
        onUpdate={(m) => colours.forEach((c, i) => m.setColorAt(i, c))} />
      <instancedMesh ref={pool} args={[poolGeo, poolMat, lamps.length]} frustumCulled={false} renderOrder={2}
        onUpdate={(m) => colours.forEach((c, i) => m.setColorAt(i, c))} />
    </group>
  );
}
