import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { junctions, lightAt } from './junctions';
import { surfaceAt } from './roadSurface';

// Traffic signals at the main junctions (world/junctions): one pole per approach on its LEFT kerb
// (Kenya drives on the left), a black three-lamp head facing the oncoming traffic. Lamps are lit by
// the shared cycle (lightAt), the same one the traffic obeys. Instanced: 5 draw calls for them all.

const OFF = { red: new THREE.Color('#2a0806'), amber: new THREE.Color('#2a1a04'), green: new THREE.Color('#06200c') };
const ON = { red: new THREE.Color('#ff2a1a'), amber: new THREE.Color('#ffb21a'), green: new THREE.Color('#2bff6a') };

export function TrafficLights() {
  const heads = useMemo(() => {
    const out: { j: number; axis: 0 | 1; x: number; y: number; z: number; yaw: number }[] = [];
    for (const j of junctions())
      for (const a of j.arms) {
        const d = j.axes[a.axis];
        const tx = d.dx * a.sign, tz = d.dz * a.sign; // the direction approaching traffic travels
        const lx = -tz, lz = tx; // left of travel
        const half = j.width[a.axis] / 2 + 0.8;
        const x = j.x - tx * j.stop[a.axis] + lx * half;
        const z = j.z - tz * j.stop[a.axis] + lz * half;
        out.push({ j: j.id, axis: a.axis, x, y: surfaceAt(x, z), z, yaw: Math.atan2(-tx, -tz) });
      }
    return out;
  }, []);

  const meshes = useMemo(() => {
    const n = heads.length;
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 8), new THREE.MeshStandardMaterial({ color: '#8d9196', roughness: 0.5, metalness: 0.6 }), n);
    const box = new THREE.InstancedMesh(new THREE.BoxGeometry(0.36, 1.0, 0.26), new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.6 }), n);
    const lamp = (c: THREE.Color) => {
      const m = new THREE.InstancedMesh(new THREE.CircleGeometry(0.11, 14), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), n);
      for (let i = 0; i < n; i++) m.setColorAt(i, c);
      return m;
    };
    const red = lamp(OFF.red), amber = lamp(OFF.amber), green = lamp(OFF.green);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    const v = new THREE.Vector3();
    heads.forEach((h, i) => {
      q.setFromAxisAngle(up, h.yaw);
      pole.setMatrixAt(i, m.compose(v.set(h.x, h.y + 1.7, h.z), q, one));
      box.setMatrixAt(i, m.compose(v.set(h.x, h.y + 3.0, h.z), q, one));
      const f = new THREE.Vector3(Math.sin(h.yaw), 0, Math.cos(h.yaw)).multiplyScalar(0.135); // the lens face
      [red, amber, green].forEach((lm, k) => lm.setMatrixAt(i, m.compose(v.set(h.x + f.x, h.y + 3.3 - k * 0.3, h.z + f.z), q, one)));
    });
    for (const x of [pole, box, red, amber, green]) {
      x.castShadow = x === pole || x === box;
      x.computeBoundingSphere();
    }
    return { pole, box, red, amber, green };
  }, [heads]);

  const t = useRef(0);
  useFrame((_, dt) => {
    t.current -= dt;
    if (t.current > 0) return;
    t.current = 0.25;
    const now = performance.now() / 1000;
    const js = junctions();
    heads.forEach((h, i) => {
      const l = lightAt(js[h.j]!, h.axis, now);
      meshes.red.setColorAt(i, l === 'red' ? ON.red : OFF.red);
      meshes.amber.setColorAt(i, l === 'amber' ? ON.amber : OFF.amber);
      meshes.green.setColorAt(i, l === 'green' ? ON.green : OFF.green);
    });
    for (const x of [meshes.red, meshes.amber, meshes.green]) x.instanceColor!.needsUpdate = true;
  });

  return (
    <>
      <primitive object={meshes.pole} />
      <primitive object={meshes.box} />
      <primitive object={meshes.red} />
      <primitive object={meshes.amber} />
      <primitive object={meshes.green} />
      <RigidBody type="fixed" colliders={false}>
        {heads.map((h, i) => (
          <CuboidCollider key={i} args={[0.1, 1.7, 0.1]} position={[h.x, h.y + 1.7, h.z]} />
        ))}
      </RigidBody>
    </>
  );
}
