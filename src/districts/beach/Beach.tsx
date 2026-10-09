import { Suspense, useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { KitInstances, type Placement } from '../../world/kit/KitInstances';
import { useKit } from '../../world/kit/useKit';
import { REAL_TREES_KIT_URL } from '../hub/Hub';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COAST_ROAD_X, shoreX } from '../../config/coast';
import { heightAt } from '../../world/heights';
import { register } from '../../game/interactables';
import { useEconomy } from '../../game/economy';
import { playerPosition } from '../../systems/player/playerState';
import { oceanTime, waveHeight } from '../../world/Ocean';
import { place } from '../../game/places';

// Mkurugenzi Beach life: real coconut palms (Sketchfab) along the coast road and the sand, makuti (palm-thatch)
// umbrellas with sun loungers, beach kiosks that sell cold drinks, and the swimming buoys.
const PALM_EVERY = 26;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function umbrellaGeometry() {
  const pole = new THREE.CylinderGeometry(0.05, 0.06, 2.6, 6).translate(0, 1.3, 0);
  const thatch = new THREE.ConeGeometry(1.9, 0.9, 14, 1, true).translate(0, 2.75, 0);
  const lounger = (x: number) => [
    new THREE.BoxGeometry(0.65, 0.08, 1.9).translate(x, 0.32, 1.1),
    new THREE.BoxGeometry(0.65, 0.08, 0.7).rotateX(-0.7).translate(x, 0.52, 0.25),
  ];
  return { pole, thatch, loungers: mergeGeometries([...lounger(-0.55), ...lounger(0.55)].map((g) => g.toNonIndexed()))! };
}

/** Only near the coast: the beach is 1.5 km from the mtaa. */
export function BeachWhenNear() {
  const [near, setNear] = useState(false);
  useFrame(() => {
    const n = playerPosition.x > 700;
    if (n !== near) setNear(n);
  });
  return near ? <Beach /> : null;
}

/** Coconut palms and taller fan palms (real Sketchfab trees, kit colliders on the trunks). */
function Palms({ placements }: { placements: Placement[] }) {
  const kit = useKit(REAL_TREES_KIT_URL);
  return <KitInstances kit={kit} placements={placements} reach={2} />;
}

export function Beach() {
  const plan = useMemo(() => {
    const r = rng(1585);
    const palms: { x: number; z: number; rot: number; v: number }[] = [];
    for (let z = -1320; z <= 1320; z += PALM_EVERY) {
      // a line along the sea side of the coast road, and clumps on the sand
      const zz = z + (r() - 0.5) * 8;
      palms.push({ x: COAST_ROAD_X + 7 + r() * 3, z: zz, rot: r() * 6.28, v: r() < 0.7 ? 0 : 1 });
      if (r() < 0.55) palms.push({ x: shoreX(zz) - 40 - r() * 70, z: zz + (r() - 0.5) * 12, rot: r() * 6.28, v: r() < 0.6 ? 0 : 1 });
    }
    const umbrellas: { x: number; z: number; rot: number }[] = [];
    for (let z = -900; z <= 900; z += 18 + r() * 22) {
      if (Math.abs(z + 120) < 25) continue; // room around the kiosk
      umbrellas.push({ x: shoreX(z) - 22 - r() * 18, z, rot: Math.PI / 2 + (r() - 0.5) * 0.5 });
    }
    const kiosk = place('the beach kiosk');
    const kiosks = [kiosk, { name: 'k2', x: shoreX(420) - 60, z: 420 }, { name: 'k3', x: shoreX(-640) - 60, z: -640 }];
    const buoys = [place('the swimming buoy'), place('the far buoy'), { name: 'b3', x: shoreX(380) + 90, z: 380 }];
    return { palms, umbrellas, kiosks, buoys };
  }, []);

  const meshes = useMemo(() => {
    const out: THREE.Object3D[] = [];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const u = umbrellaGeometry();
    const poleI = new THREE.InstancedMesh(u.pole, new THREE.MeshStandardMaterial({ color: '#8a6a44', roughness: 0.9 }), plan.umbrellas.length);
    const thatchI = new THREE.InstancedMesh(u.thatch, new THREE.MeshStandardMaterial({ color: '#b8995c', roughness: 1, side: THREE.DoubleSide }), plan.umbrellas.length);
    const loungeI = new THREE.InstancedMesh(u.loungers, new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.6 }), plan.umbrellas.length);
    plan.umbrellas.forEach((p, i) => {
      m4.compose(new THREE.Vector3(p.x, heightAt(p.x, p.z), p.z), q.setFromAxisAngle(up, p.rot), one);
      poleI.setMatrixAt(i, m4);
      thatchI.setMatrixAt(i, m4);
      loungeI.setMatrixAt(i, m4);
    });
    for (const m of [poleI, thatchI, loungeI]) {
      m.castShadow = true;
      m.receiveShadow = true;
      out.push(m);
    }
    // kiosks: a block hut painted turquoise, makuti roof, a counter, a sign
    const sign = (() => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 128;
      const g = c.getContext('2d')!;
      g.fillStyle = '#d9342b';
      g.fillRect(0, 0, 512, 128);
      g.fillStyle = '#fff';
      g.font = '700 54px "Bebas Neue", Impact, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('MAKUTI KIOSK · SODA BARIDI', 256, 66);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    for (const k of plan.kiosks) {
      const g = new THREE.Group();
      g.position.set(k.x, heightAt(k.x, k.z), k.z);
      g.rotation.y = Math.PI / 2; // counter faces the sea (+X)
      const wall = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 3.4), new THREE.MeshStandardMaterial({ color: '#3fb7b0', roughness: 0.85 }));
      wall.position.y = 1.3;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(4.3, 1.8, 4, 1), new THREE.MeshStandardMaterial({ color: '#b8995c', roughness: 1 }));
      roof.position.y = 3.4;
      roof.rotation.y = Math.PI / 4;
      const counter = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.0, 0.6), new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 0.8 }));
      counter.position.set(0, 0.5, 2.0);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05), new THREE.MeshStandardMaterial({ map: sign, emissive: '#ffffff', emissiveMap: sign, emissiveIntensity: 0.35 }));
      board.position.set(0, 2.45, 1.72);
      for (const m of [wall, roof, counter]) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
      g.add(wall, roof, counter, board);
      out.push(g);
    }
    return out;
  }, [plan]);

  // buoys bob on the swell
  const buoyMeshes = useMemo(
    () =>
      plan.buoys.map(() => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshStandardMaterial({ color: '#ff6a12', roughness: 0.4 }));
        m.castShadow = true;
        return m;
      }),
    [plan],
  );
  useFrame(() => {
    if (Math.abs(playerPosition.x - COAST_ROAD_X) > 900) return;
    plan.buoys.forEach((b, i) => buoyMeshes[i]!.position.set(b.x, waveHeight(b.x, b.z, oceanTime.value, 6) + 0.15, b.z));
  });

  // kiosk counters sell cold drinks
  useEffect(() => {
    const offs = plan.kiosks.map((k, i) =>
      register({ id: `beach-kiosk-${i}`, x: k.x + 2.6, z: k.z, radius: 2.6, label: 'Buy a cold drink (Makuti Kiosk)', key: 'KeyE', use: () => useEconomy.getState().openShop('beach') }),
    );
    return () => offs.forEach((f) => f());
  }, [plan]);

  const palmPlacements = useMemo<Placement[]>(
    () => plan.palms.map((p) => ({ piece: p.v === 0 ? 'rt_coconut' : 'rt_palm', x: p.x, z: p.z, rotY: p.rot, y: heightAt(p.x, p.z) - 0.1, scale: 0.85 + ((p.x * 7.13) % 1) * 0.35 })),
    [plan],
  );

  return (
    <>
      <Suspense fallback={null}>
        <Palms placements={palmPlacements} />
      </Suspense>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      {buoyMeshes.map((m, i) => (
        <primitive key={`b${i}`} object={m} />
      ))}
      <RigidBody type="fixed" colliders={false}>
        {plan.kiosks.map((k, i) => (
          <CuboidCollider key={i} args={[1.7, 1.3, 2.5]} position={[k.x, heightAt(k.x, k.z) + 1.3, k.z]} />
        ))}
      </RigidBody>
    </>
  );
}
