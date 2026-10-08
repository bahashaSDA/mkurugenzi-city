import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

// A "kit" GLB (built by blender/scripts/build_*_kit.py) holds many pieces, each as nodes
//   <piece>_LOD0, <piece>_LOD1, <piece>_LOD2   render meshes (any number of primitives)
//   COL_<piece>                                 collider mesh, extras.collider = 'box' | 'hull'
// all authored at the origin with the ground at y = 0.

export interface KitPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Transform of this primitive relative to the piece origin (meshopt quantisation lives here). */
  local: THREE.Matrix4;
}

export type KitCollider =
  | { kind: 'box'; halfExtents: [number, number, number]; center: [number, number, number] }
  | { kind: 'hull'; points: Float32Array };

export interface KitPiece {
  lods: KitPart[][]; // [LOD0, LOD1, LOD2]
  collider: KitCollider | null;
}

export type Kit = Map<string, KitPiece>;

let ktx2: KTX2Loader | null = null;

export function useKit(url: string): Kit {
  const gl = useThree((s) => s.gl);
  const gltf = useGLTF(url, false, true, (loader) => {
    // One shared KTX2 loader per renderer: the transcoder runs in workers.
    if (!ktx2) ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(gl);
    // drei types its loader with three-stdlib; three's own KTX2Loader is used deliberately because
    // it matches the basis transcoder copied from three into /public/basis.
    loader.setKTX2Loader(ktx2 as unknown as Parameters<typeof loader.setKTX2Loader>[0]);
  });

  return useMemo(() => {
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const kit: Kit = new Map();
    const get = (name: string) => {
      let p = kit.get(name);
      if (!p) kit.set(name, (p = { lods: [[], [], []], collider: null }));
      return p;
    };

    root.traverse((o) => {
      const m = /^(.+)_LOD([0-2])$/.exec(o.name);
      if (m) {
        const piece = get(m[1]!);
        const lod = piece.lods[Number(m[2])]!;
        o.traverse((c) => {
          if (!(c as THREE.Mesh).isMesh) return;
          const mesh = c as THREE.Mesh;
          lod.push({ geometry: mesh.geometry, material: mesh.material as THREE.Material, local: mesh.matrixWorld.clone() });
        });
        return;
      }
      if (o.name.startsWith('COL_') && (o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        const kind = (mesh.userData.collider as string) === 'hull' ? 'hull' : 'box';
        const pos = mesh.geometry.getAttribute('position');
        const v = new THREE.Vector3();
        if (kind === 'hull') {
          const pts = new Float32Array(pos.count * 3);
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
            pts.set([v.x, v.y, v.z], i * 3);
          }
          get(o.name.slice(4)).collider = { kind, points: pts };
        } else {
          const box = new THREE.Box3();
          for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
          const size = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
          const c = box.getCenter(new THREE.Vector3());
          get(o.name.slice(4)).collider = { kind, halfExtents: [size.x, size.y, size.z], center: [c.x, c.y, c.z] };
        }
      }
    });

    // Fall back to the nearest available LOD if a level is missing.
    for (const p of kit.values()) {
      for (let i = 1; i < 3; i++) if (!p.lods[i]!.length) p.lods[i] = p.lods[i - 1]!;
    }
    return kit;
  }, [gltf]);
}

// No module-level preload: KTX2 support needs the live renderer, so kits load inside the
// Canvas (while the splash screen is still up).
