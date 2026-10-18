import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { useModel } from '../../systems/characterModels';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useGame } from '../../app/store';

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
  /** Vehicles (tools/split-wheels.mjs): this part is a wheel that spins about its axle. */
  wheel?: KitWheel;
  /** Vehicles (build_real_kit.py separate_doors): this part is a door (or its window). */
  door?: KitDoor;
}

export interface KitDoor {
  index: number;
  kind: 'swing' | 'rear' | 'slide';
  side: 1 | -1; // +1 left (+X, the kerb side in Kenya), -1 right (the driver's side)
  front: boolean;
  hinge: THREE.Vector3; // piece space
  size: THREE.Vector3; // width (x), height (y), length (z)
}

export interface KitWheel {
  index: number; // stable between LODs: front axle first, then +X (left) before -X
  radius: number;
  front: boolean;
  center: THREE.Vector3; // axle centre, piece space (ground at y = 0)
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

/** Self-lit materials (signs, LEDs, lamps): Environment brightens them after dark. */
export const glowMaterials = new Set<THREE.MeshStandardMaterial>();
/** 0 by day, 1 at night: building windows light up (Environment drives it). */
export const nightWindowUniforms = { uNight: { value: 0 } };

/** Facades: at night a random share of the windows (dark glass in the texture) glow warm. */
function nightWindows(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = nightWindowUniforms.uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vWP;`)
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        #ifdef USE_INSTANCING
          vWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uNight; varying vec3 vWP;`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        #ifdef USE_MAP
        if (uNight > 0.01) {
          vec4 tx = texture2D(map, vMapUv);
          float lum = dot(tx.rgb, vec3(0.299, 0.587, 0.114));
          float win = smoothstep(0.34, 0.16, lum) * step(tx.r, tx.b + 0.08);
          vec3 cell = floor(vWP / vec3(2.6, 3.0, 2.6));
          float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          vec3 warm = mix(vec3(1.0, 0.68, 0.36), vec3(0.75, 0.85, 1.0), step(0.85, h));
          totalEmissiveRadiance += warm * win * step(0.42, h) * uNight * 1.6;
        }
        #endif`,
      );
  };
  m.customProgramCacheKey = () => 'night-windows';
}

function prepareMaterial(m: THREE.Material) {
  const std = m as THREE.MeshStandardMaterial;
  // sharp at a distance and at grazing angles (walls along a street, roofs seen from the road):
  // without anisotropic filtering the mipmaps smear every texture into a blur past ~30 m
  for (const t of [std.map, std.normalMap, std.roughnessMap, std.metalnessMap, std.aoMap]) if (t) t.anisotropy = 8;
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
    std.emissive = std.map ? new THREE.Color(1, 1, 1) : std.color.clone();
    if (std.map) std.emissiveMap = std.map; // painted signs (nganya headboards) glow with their artwork
    std.emissiveIntensity = std.map ? 0.9 : 1.6;
    std.userData.baseGlow = std.emissiveIntensity;
    glowMaterials.add(std);
    return;
  }
  if (/^fac_|_facade/.test(m.name)) {
    nightWindows(std);
    return;
  }
  if (!m.name.includes('_alpha')) return;
  // Alpha-tested foliage: no sorting, writes depth, casts cut-out shadows.
  m.transparent = false;
  // real (Sketchfab) trees have fine leaflets: their mipmapped alpha averages low, so cut lower or
  // whole crowns vanish at distance (acacia)
  m.alphaTest = m.name.startsWith('foliage_rt_') ? 0.22 : 0.5;
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

const kitCache = new WeakMap<THREE.Object3D, Map<string, Kit>>();

/**
 * `keepMid`: keep LOD1 textured on the low tier too. Vehicles need it: their mid LOD is seen from
 * ~40 m, where an untextured average-colour mesh reads as a blurry, unfinished vehicle.
 */
export function useKit(url: string, opts: { keepMid?: boolean } = {}): Kit {
  const gl = useThree((s) => s.gl);
  const tier = useGame((s) => s.tier);
  const gltf = useModel(url); // shared per-file cache, prefetched at boot (systems/characterModels)

  return useMemo(() => {
    // the same kit is used by several systems (districts, interiors, street lights...): build it once
    // per file, tier and option and share it (it was rebuilt for every caller: seconds of loading)
    const cacheKey = `${tier}:${opts.keepMid ? 1 : 0}`;
    let perScene = kitCache.get(gltf.scene);
    if (!perScene) kitCache.set(gltf.scene, (perScene = new Map()));
    const hit = perScene.get(cacheKey);
    if (hit) return hit;
    const built = buildKit();
    perScene.set(cacheKey, built);
    return built;
    function buildKit(): Kit {
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
          const w = (mesh.userData.wheel !== undefined ? mesh.userData : mesh.parent?.userData) as
            | { wheel?: number; radius: number; front: boolean; center: [number, number, number] }
            | undefined;
          const wheel = w && w.wheel !== undefined && w.center
            ? { index: w.wheel, radius: w.radius, front: w.front, center: new THREE.Vector3(...w.center) }
            : undefined;
          const dd = (mesh.userData.door !== undefined ? mesh.userData : mesh.parent?.userData) as
            | { door?: number; kind: KitDoor['kind']; side: number; front: boolean; hinge: [number, number, number]; size: [number, number, number] }
            | undefined;
          const door = dd && dd.door !== undefined && dd.hinge
            ? { index: dd.door, kind: dd.kind, side: (dd.side > 0 ? 1 : -1) as 1 | -1, front: !!dd.front, hinge: new THREE.Vector3(...dd.hinge), size: new THREE.Vector3(...dd.size) }
            : undefined;
          lod.push({ geometry: mesh.geometry, material: mesh.material as THREE.Material, local: mesh.matrixWorld.clone(), wheel, door });
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
    // Far LOD: one merged, untextured mesh per piece (average texture colour baked into vertex
    // colours) instead of one draw call per material. Alpha cards and glowing parts stay as they are.
    for (const p of kit.values()) {
      p.lods[2] = mergeFar(p.lods[2]!, gl);
      if (tier === 'low' && !opts.keepMid) p.lods[1] = mergeFar(p.lods[1]!, gl); // phones: mid distance untextured too
    }
    return kit;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }
  }, [gltf, gl, tier, opts.keepMid]);
}

const farMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0, name: 'kit_far' });
const avgCache = new WeakMap<THREE.Texture, THREE.Color>();
let avgRig: { rt: THREE.WebGLRenderTarget; scene: THREE.Scene; cam: THREE.Camera; mat: THREE.ShaderMaterial } | null = null;

/** Average colour (linear) of a texture: sample its smallest mip on the GPU (works for KTX2). */
function averageColour(tex: THREE.Texture, gl: THREE.WebGLRenderer): THREE.Color {
  const hit = avgCache.get(tex);
  if (hit) return hit;
  avgRig ??= (() => {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType });
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: null } },
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D map; void main() { gl_FragColor = textureLod(map, vec2(0.5), 16.0); }',
    });
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    return { rt, scene, cam: new THREE.OrthographicCamera(), mat };
  })();
  const out = new THREE.Color(0.5, 0.5, 0.5);
  try {
    avgRig.mat.uniforms.map!.value = tex;
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(avgRig.rt);
    gl.render(avgRig.scene, avgRig.cam);
    const px = new Float32Array(4);
    gl.readRenderTargetPixels(avgRig.rt, 0, 0, 1, 1, px);
    gl.setRenderTarget(prev);
    if (px.every(Number.isFinite)) out.setRGB(px[0]!, px[1]!, px[2]!);
  } catch {
    /* keep grey */
  }
  avgCache.set(tex, out);
  return out;
}

function mergeFar(parts: KitPart[], gl: THREE.WebGLRenderer): KitPart[] {
  const keep: KitPart[] = [];
  const geos: THREE.BufferGeometry[] = [];
  for (const part of parts) {
    const m = part.material as THREE.MeshStandardMaterial;
    // alpha cards, self-lit parts, glass and lamp lenses (lit at night) keep their own material
    if (/_alpha|_glow|glass|_lens/.test(m.name) || !part.geometry.getAttribute('position')) {
      keep.push(part);
      continue;
    }
    const base = m.color ? m.color.clone() : new THREE.Color(1, 1, 1);
    if (m.map) base.multiply(averageColour(m.map, gl));
    // meshopt-quantised attributes (int16/int8) can't take a transform: rebuild them as float
    const src0 = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
    const g = new THREE.BufferGeometry();
    for (const k of ['position', 'normal'] as const) {
      const a = src0.getAttribute(k);
      if (!a) continue;
      const f = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) f.set([a.getX(i), a.getY(i), a.getZ(i)], i * 3);
      g.setAttribute(k, new THREE.BufferAttribute(f, 3));
    }
    g.applyMatrix4(part.local);
    const n = g.getAttribute('position').count;
    const src = src0.getAttribute('color');
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const f = src ? [src.getX(i), src.getY(i), src.getZ(i)] : [1, 1, 1];
      cols[i * 3] = base.r * f[0]!;
      cols[i * 3 + 1] = base.g * f[1]!;
      cols[i * 3 + 2] = base.b * f[2]!;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    geos.push(g);
  }
  if (geos.length < 2) return parts;
  const merged = mergeGeometries(geos);
  if (!merged) return parts;
  return [{ geometry: merged, material: farMaterial, local: new THREE.Matrix4() }, ...keep];
}

// No module-level preload: KTX2 support needs the live renderer, so kits load inside the
// Canvas (while the splash screen is still up).
