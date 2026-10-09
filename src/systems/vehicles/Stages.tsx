import { useEffect, useMemo } from 'react';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

/** All stage signs in one canvas (one texture, one draw call): row k = stage k. */
function signAtlas(names: string[]) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128 * Math.max(1, names.length);
  const g = c.getContext('2d')!;
  names.forEach((text, k) => {
    const y = k * 128;
    g.fillStyle = '#f2c230';
    g.fillRect(0, y, 512, 128);
    g.fillStyle = '#141414';
    g.fillRect(0, y, 512, 10);
    g.fillRect(0, y + 118, 512, 10);
    g.font = 'bold 34px sans-serif';
    g.textAlign = 'center';
    g.fillText('STAGE', 256, y + 48);
    g.font = 'bold 30px sans-serif';
    g.fillText(text.toUpperCase().slice(0, 26), 256, y + 96);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.flipY = true;
  return t;
}

const STEEL = new THREE.Color('#4a4f55');
const ROOF = new THREE.Color('#8a5a3a');
const BENCH = new THREE.Color('#6b4a2e');

/** Merge every shelter into one vertex-coloured mesh and every sign into one atlas mesh. */
function buildShelters(spots: StageSpot[]) {
  const parts: THREE.BufferGeometry[] = [];
  const signs: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const add = (geo: THREE.BufferGeometry, color: THREE.Color, local: THREE.Matrix4, world: THREE.Matrix4) => {
    const g = geo.toNonIndexed();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(world, local));
    const n = g.getAttribute('position').count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) cols.set([color.r, color.g, color.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.deleteAttribute('uv');
    parts.push(g);
  };
  const T = (x: number, y: number, z: number, rx = 0) => new THREE.Matrix4().makeRotationX(rx).setPosition(x, y, z);
  spots.forEach((p, k) => {
    const world = m.clone().compose(new THREE.Vector3(p.x, p.y, p.z), q.setFromAxisAngle(up, p.rotY), new THREE.Vector3(1, 1, 1));
    for (const x of [-1.6, 1.6]) add(new THREE.BoxGeometry(0.08, 2.5, 0.08), STEEL, T(x, 1.25, -0.6), world);
    add(new THREE.BoxGeometry(3.8, 0.05, 2.0), ROOF, T(0, 2.55, 0, 0.12), world);
    add(new THREE.BoxGeometry(3.0, 0.08, 0.45), BENCH, T(0, 0.45, -0.55), world);
    add(new THREE.BoxGeometry(3.3, 1.4, 0.04), STEEL, T(0, 1.2, -0.85), world);
    add(new THREE.BoxGeometry(0.06, 2.1, 0.06), STEEL, T(2.3, 1.05, 0.2), world);
    // sign: a plane facing along the road, UVs on row k of the atlas
    const sg = new THREE.PlaneGeometry(1.6, 0.4);
    const uv = sg.getAttribute('uv') as THREE.BufferAttribute;
    const rows = spots.length;
    for (let i = 0; i < uv.count; i++) uv.setY(i, (rows - 1 - k + uv.getY(i)) / rows);
    sg.applyMatrix4(new THREE.Matrix4().multiplyMatrices(world, new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(2.3, 2.1, 0.2)));
    signs.push(sg);
  });
  const shelters = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.3 }));
  shelters.castShadow = true;
  shelters.receiveShadow = true;
  const signMesh = new THREE.Mesh(mergeGeometries(signs)!, new THREE.MeshStandardMaterial({ map: signAtlas(spots.map((p) => p.name)), roughness: 0.6, side: THREE.DoubleSide }));
  return { shelters, signMesh };
}

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
  const merged = useMemo(() => buildShelters(spots), [spots]);

  useEffect(() => {
    const offs = spots.map((p, i) =>
      register({ id: `stage-${i}`, x: p.x, z: p.z, radius: 4, label: `Wave down a matatu (${p.name})`, key: 'KeyE', use: hail }),
    );
    offs.push(onKeyPress('KeyH', hail));
    return () => offs.forEach((f) => f());
  }, [spots]);

  return (
    <>
      <primitive object={merged.shelters} />
      <primitive object={merged.signMesh} />
      <RigidBody type="fixed" colliders={false}>
        {spots.map((p, i) => {
          const c = Math.cos(p.rotY);
          const sn = Math.sin(p.rotY);
          const at = (lx: number, lz: number): [number, number, number] => [p.x + lx * c + lz * sn, p.y, p.z - lx * sn + lz * c];
          const b = at(0, -0.55);
          const w = at(0, -0.85);
          return (
            <group key={i}>
              <CuboidCollider args={[1.5, 0.25, 0.25]} position={[b[0], b[1] + 0.25, b[2]]} rotation={[0, p.rotY, 0]} />
              <CuboidCollider args={[1.65, 0.7, 0.05]} position={[w[0], w[1] + 1.2, w[2]]} rotation={[0, p.rotY, 0]} />
            </group>
          );
        })}
      </RigidBody>
    </>
  );
}
