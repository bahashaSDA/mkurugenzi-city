import { useEffect, useMemo } from 'react';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { register } from '../../game/interactables';
import { onKeyPress } from '../input';
import { routeSamples } from './routes';
import { hail } from './Vehicles';

// Matatu stages: a roadside shelter (posts, mabati roof, bench, stage sign) at every stop on the
// kerb side (left of travel). E at a stage or H anywhere by a route waves a matatu down.

interface StageSpot {
  name: string;
  x: number;
  z: number;
  y: number;
  rotY: number;
}

function signTexture(text: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2c230';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#141414';
  g.fillRect(0, 0, 512, 10);
  g.fillRect(0, 118, 512, 10);
  g.font = 'bold 34px sans-serif';
  g.textAlign = 'center';
  g.fillText('STAGE', 256, 48);
  g.font = 'bold 30px sans-serif';
  g.fillText(text.toUpperCase().slice(0, 26), 256, 96);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const steel = new THREE.MeshStandardMaterial({ color: '#4a4f55', roughness: 0.6, metalness: 0.6 });
const roof = new THREE.MeshStandardMaterial({ color: '#8a5a3a', roughness: 0.8, metalness: 0.2 });
const bench = new THREE.MeshStandardMaterial({ color: '#6b4a2e', roughness: 0.85 });

export function Stages() {
  const spots = useMemo<StageSpot[]>(() => {
    const out: StageSpot[] = [];
    for (const rs of Object.values(routeSamples())) {
      for (const { s, stop } of rs.stops) {
        const i = Math.floor(s / rs.step);
        const h = rs.heading[i]!;
        // kerb side = left of travel: (cos h, -sin h)
        const x = rs.x[i]! + Math.cos(h) * 4.2;
        const z = rs.z[i]! - Math.sin(h) * 4.2;
        if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 8)) continue;
        out.push({ name: stop.name, x, z, y: rs.y[i]!, rotY: h - Math.PI / 2 }); // open side faces the road
      }
    }
    return out;
  }, []);
  const signs = useMemo(() => spots.map((p) => new THREE.MeshStandardMaterial({ map: signTexture(p.name), roughness: 0.6 })), [spots]);

  useEffect(() => {
    const offs = spots.map((p, i) =>
      register({ id: `stage-${i}`, x: p.x, z: p.z, radius: 4, label: `Wave down a matatu (${p.name})`, key: 'KeyE', use: hail }),
    );
    offs.push(onKeyPress('KeyH', hail));
    return () => offs.forEach((f) => f());
  }, [spots]);

  return (
    <>
      {spots.map((p, i) => (
        <group key={i} position={[p.x, p.y, p.z]} rotation={[0, p.rotY, 0]}>
          {[-1.6, 1.6].map((x) => (
            <mesh key={x} position={[x, 1.25, -0.6]} material={steel} castShadow>
              <boxGeometry args={[0.08, 2.5, 0.08]} />
            </mesh>
          ))}
          <mesh position={[0, 2.55, 0]} rotation={[0.12, 0, 0]} material={roof} castShadow receiveShadow>
            <boxGeometry args={[3.8, 0.05, 2.0]} />
          </mesh>
          <mesh position={[0, 0.45, -0.55]} material={bench} castShadow receiveShadow>
            <boxGeometry args={[3.0, 0.08, 0.45]} />
          </mesh>
          <mesh position={[0, 1.2, -0.85]} material={steel} receiveShadow>
            <boxGeometry args={[3.3, 1.4, 0.04]} />
          </mesh>
          <mesh position={[2.3, 2.1, 0.2]} rotation={[0, -Math.PI / 2, 0]} material={signs[i]}>
            <planeGeometry args={[1.6, 0.4]} />
          </mesh>
          <mesh position={[2.3, 1.05, 0.2]} material={steel}>
            <boxGeometry args={[0.06, 2.1, 0.06]} />
          </mesh>
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider args={[1.5, 0.25, 0.25]} position={[0, 0.25, -0.55]} />
            <CuboidCollider args={[1.65, 0.7, 0.05]} position={[0, 1.2, -0.85]} />
          </RigidBody>
        </group>
      ))}
    </>
  );
}
