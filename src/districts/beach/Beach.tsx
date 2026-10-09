import { useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COAST_ROAD_X, shoreX } from '../../config/coast';
import { heightAt } from '../../world/heights';
import { register } from '../../game/interactables';
import { useEconomy } from '../../game/economy';
import { playerPosition } from '../../systems/player/playerState';
import { oceanTime, waveHeight } from '../../world/Ocean';
import { place } from '../../game/places';

// Mkurugenzi Beach life: coconut palms along the coast road and the sand, makuti (palm-thatch)
// umbrellas with sun loungers, beach kiosks that sell cold drinks, and the swimming buoys.
// Procedural stand-ins until the Sketchfab palms (tools/sketchfab-models.json) are downloaded.
const PALM_EVERY = 26;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A coconut palm: leaning, ringed trunk and a crown of drooping fronds (vertex-coloured). */
function palmGeometry(seed: number) {
  const r = rng(seed);
  const lean = 0.25 + r() * 0.35;
  const H = 9 + r() * 4;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new THREE.Vector3(Math.sin(t * 1.2) * lean * H * 0.35, t * H, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const trunk = new THREE.TubeGeometry(curve, 24, 0.2, 8, false);
  // taper and ring bands
  const tp = trunk.getAttribute('position') as THREE.BufferAttribute;
  const cols = new Float32Array(tp.count * 3);
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i) / H;
    const c = curve.getPoint(Math.min(1, Math.max(0, y)));
    const k = 1.25 - 0.45 * y;
    tp.setX(i, c.x + (tp.getX(i) - c.x) * k);
    tp.setZ(i, c.z + (tp.getZ(i) - c.z) * k);
    const band = 0.82 + 0.18 * Math.abs(Math.sin(tp.getY(i) * 7.5));
    cols.set([0.43 * band, 0.37 * band, 0.3 * band], i * 3);
  }
  trunk.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  trunk.computeVertexNormals();
  const top = curve.getPoint(1);
  const fronds: THREE.BufferGeometry[] = [];
  const n = 11 + Math.floor(r() * 4);
  for (let f = 0; f < n; f++) {
    const yaw = (f / n) * Math.PI * 2 + r() * 0.3;
    const len = 3.6 + r() * 1.4;
    const droop = 0.55 + r() * 0.5;
    const pos: number[] = [];
    const col: number[] = [];
    const seg = 14;
    for (let i = 0; i < seg; i++) {
      for (const side of [-1, 1]) {
        const t0 = i / seg;
        const t1 = (i + 1) / seg;
        const at = (t: number) => {
          const d = t * len;
          return new THREE.Vector3(Math.cos(yaw) * d, 0.6 * t - droop * t * t * len * 0.45, Math.sin(yaw) * d);
        };
        const a = at(t0);
        const b = at(t1);
        // a leaflet: a thin blade angled out from the rachis
        const w = (0.75 - Math.abs(t0 - 0.45)) * 0.9;
        const nx = -Math.sin(yaw) * side * w;
        const nz = Math.cos(yaw) * side * w;
        const tip = a.clone().add(new THREE.Vector3(nx, -0.25 * w, nz)).lerp(b, 0.4);
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z, tip.x, tip.y, tip.z);
        const g = 0.55 + 0.25 * t0 + r() * 0.08;
        for (let k = 0; k < 3; k++) col.push(0.25 * g, 0.42 * g + 0.05, 0.16 * g);
      }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    fg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    fg.translate(top.x, top.y, top.z);
    fronds.push(fg);
  }
  // coconuts
  for (let c = 0; c < 4; c++) {
    const s = new THREE.SphereGeometry(0.16, 8, 6).toNonIndexed();
    const a = (c / 4) * Math.PI * 2;
    s.translate(top.x + Math.cos(a) * 0.25, top.y - 0.25, top.z + Math.sin(a) * 0.25);
    const cc = new Float32Array(s.getAttribute('position').count * 3).fill(0.3);
    for (let i = 0; i < cc.length; i += 3) cc.set([0.36, 0.3, 0.12], i);
    s.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    s.deleteAttribute('uv');
    fronds.push(s);
  }
  const crown = mergeGeometries(fronds.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => {
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    return g;
  }))!;
  const t2 = trunk.toNonIndexed();
  t2.deleteAttribute('uv');
  return { trunk: t2, crown };
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

export function Beach() {
  const plan = useMemo(() => {
    const r = rng(1585);
    const palms: { x: number; z: number; rot: number; v: number }[] = [];
    for (let z = -1320; z <= 1320; z += PALM_EVERY) {
      // a line along the sea side of the coast road, and clumps on the sand
      const zz = z + (r() - 0.5) * 8;
      palms.push({ x: COAST_ROAD_X + 7 + r() * 3, z: zz, rot: r() * 6.28, v: Math.floor(r() * 3) });
      if (r() < 0.55) palms.push({ x: shoreX(zz) - 40 - r() * 70, z: zz + (r() - 0.5) * 12, rot: r() * 6.28, v: Math.floor(r() * 3) });
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
    const trunkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    const frondMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
    for (let v = 0; v < 3; v++) {
      const { trunk, crown } = palmGeometry(11 + v * 7);
      const list = plan.palms.filter((p) => p.v === v);
      const ti = new THREE.InstancedMesh(trunk, trunkMat, list.length);
      const ci = new THREE.InstancedMesh(crown, frondMat, list.length);
      list.forEach((p, i) => {
        m4.compose(new THREE.Vector3(p.x, heightAt(p.x, p.z) - 0.1, p.z), q.setFromAxisAngle(up, p.rot), one);
        ti.setMatrixAt(i, m4);
        ci.setMatrixAt(i, m4);
      });
      for (const m of [ti, ci]) {
        m.castShadow = true;
        m.receiveShadow = true;
        out.push(m);
      }
    }
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

  return (
    <>
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
        {plan.palms.map((p, i) => (
          <CylinderCollider key={`p${i}`} args={[2, 0.25]} position={[p.x, heightAt(p.x, p.z) + 2, p.z]} />
        ))}
      </RigidBody>
    </>
  );
}
