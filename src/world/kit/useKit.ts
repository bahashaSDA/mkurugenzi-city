import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { getKTX2Loader } from '../ktx2';

// A "kit" GLB (built by blender/scripts/build_*_kit.py) holds many pieces, each as nodes
//   <piece>_LOD0, <piece>_LOD1, <piece>_LOD2   render meshes (any number of primitives)
//   COL_<piece> or COL_<piece>__N               collider mesh(es), extras.collider = 'box' | 'hull'
//   materials named *_alpha*                    alpha-tested cards (foliage, impostors), wind sway
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
  colliders: KitCollider[];
}

/** Shared wind clock for foliage (advanced by <WindClock/>). */
export const wind = { uTime: { value: 0 } };

function prepareMaterial(m: THREE.Material) {
  const std = m as THREE.MeshStandardMaterial;
  if (m.name.includes('glass')) {
    // tinted vehicle/window glass: see-through so passengers and the street are visible
    m.transparent = true;
    m.opacity = 0.42;
    m.depthWrite = false;
    std.roughness = 0.05;
    std.envMapIntensity = 1.5;
    return;
  }
  if (m.name.includes('_glow')) {
    // LEDs, screens, lights, sign boxes: self-lit (bloom picks them up)
    std.emissive = std.color.clone();
    std.emissiveIntensity = 1.6;
    return;
  }
  if (!m.name.includes('_alpha')) return;
  // Alpha-tested foliage: no sorting, writes depth, casts cut-out shadows.
  m.transparent = false;
  m.alphaTest = 0.5;
  m.side = THREE.DoubleSide;
  m.depthWrite = true;
  if (!m.name.startsWith('foliage')) return;
  // Gentle wind sway, stronger higher up the tree; phase varies with world position.
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = wind.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 wpos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vec3 wpos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif
        float h = clamp(wpos.y / 9.0, 0.0, 1.0);
        float ph = wpos.x * 0.21 + wpos.z * 0.17;
        transformed.x += (sin(uTime * 1.3 + ph) * 0.07 + sin(uTime * 3.1 + ph * 2.3) * 0.025) * h;
        transformed.z += cos(uTime * 1.1 + ph) * 0.05 * h;`,
      );
  };
  m.customProgramCacheKey = () => 'foliage-wind';
}

export type Kit = Map<string, KitPiece>;

export function useKit(url: string): Kit {
  const gl = useThree((s) => s.gl);
  const gltf = useGLTF(url, false, true, (loader) => {
    const ktx2 = getKTX2Loader(gl); // shared with runtime materials (one worker pool)
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
      if (!p) kit.set(name, (p = { lods: [[], [], []], colliders: [] }));
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
          prepareMaterial(mesh.material as THREE.Material);
          lod.push({ geometry: mesh.geometry, material: mesh.material as THREE.Material, local: mesh.matrixWorld.clone() });
        });
        return;
      }
      if (o.name.startsWith('COL_') && (o as THREE.Mesh).isMesh) {
        const pieceName = o.name.slice(4).replace(/__\d+$/, '');
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
          get(pieceName).colliders.push({ kind, points: pts });
        } else {
          const box = new THREE.Box3();
          for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
          const size = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
          const c = box.getCenter(new THREE.Vector3());
          get(pieceName).colliders.push({ kind, halfExtents: [size.x, size.y, size.z], center: [c.x, c.y, c.z] });
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
