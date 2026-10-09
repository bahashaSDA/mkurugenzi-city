import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer';
import { prepareCharacter, prepareClips } from '../../systems/characters';

// A full house without hundreds of skinned characters: each crowd variant is posed once in its
// sitting clip, the skinned vertices are frozen into a static mesh (per material), simplified with
// meshoptimizer, and drawn as one InstancedMesh per (variant, material) across every filled seat.

export interface BakedPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

const _v = new THREE.Vector3();

export async function bakeSeated(src: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }, keep = 0.22): Promise<BakedPart[]> {
  await MeshoptSimplifier.ready;
  const obj = cloneSkinned(src.scene);
  prepareCharacter(obj, false);
  const clips = prepareClips(src.animations.map((c) => c.clone()));
  const sit = clips.find((c) => c.name === 'Sitting_Idle_Loop') ?? clips.find((c) => c.name.startsWith('Sitting'));
  const mixer = new THREE.AnimationMixer(obj);
  if (sit) {
    mixer.clipAction(sit).play();
    mixer.setTime(Math.random() * Math.min(1.5, sit.duration));
  }
  obj.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, { pos: number[]; uv: number[]; idx: number[] }>();
  obj.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh || /eye|brow|lash|teeth|tongue/i.test(m.name)) return;
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material;
    if (/eye|brow|lash/i.test(mat.name)) return;
    if (m.isSkinnedMesh) m.skeleton.update();
    const g = m.geometry;
    const pos = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    let acc = byMat.get(mat);
    if (!acc) byMat.set(mat, (acc = { pos: [], uv: [], idx: [] }));
    const base = acc.pos.length / 3;
    for (let i = 0; i < pos.count; i++) {
      m.getVertexPosition(i, _v); // skinned + morphed, mesh space
      _v.applyMatrix4(m.matrixWorld);
      acc.pos.push(_v.x, _v.y, _v.z);
      if (uv) acc.uv.push(uv.getX(i), uv.getY(i));
      else acc.uv.push(0, 0);
    }
    const index = g.index;
    if (index) for (let i = 0; i < index.count; i++) acc.idx.push(base + index.getX(i));
    else for (let i = 0; i < pos.count; i++) acc.idx.push(base + i);
  });
  mixer.stopAllAction();
  const out: BakedPart[] = [];
  for (const [mat, a] of byMat) {
    const positions = new Float32Array(a.pos);
    const indices = new Uint32Array(a.idx);
    const target = Math.max(60, Math.floor((indices.length * keep) / 3) * 3);
    const [simplified] = MeshoptSimplifier.simplify(indices, positions, 3, target, 0.02, ['LockBorder']);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(a.uv), 2));
    g.setIndex(new THREE.BufferAttribute(simplified, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    out.push({ geometry: g, material: mat });
  }
  return out;
}
