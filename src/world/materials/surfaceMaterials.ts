import * as THREE from 'three';
import { MASK_SIZE_M } from './groundMask';
import { RIDGE } from '../heights';
import { SHORE_GLSL } from './shoreGlsl';

// PBR surface materials for ground and roads, extended with small shader patches.
// Colours are measured from Nairobi reference photos (research/visual-references/PALETTES.md):
//   dry roadside murram #CDB596..#D7BE9E (dusty tan), worn/wet paths #B88F73 (red-brown),
//   sun-bleached tarmac reads #C6C7C0 in full sun (albedo much darker than that, ~#6E6E6A).

export interface SurfaceTextures {
  color: THREE.Texture;
  normal: THREE.Texture;
  rough: THREE.Texture;
}

const TILE_M = 3.2; // one ground texture tile covers ~3.2 m (stones read at real size)

function prep(t: SurfaceTextures, srgb = true) {
  for (const tex of [t.color, t.normal, t.rough]) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
  }
  if (srgb) t.color.colorSpace = THREE.SRGBColorSpace;
}

/**
 * Ground: base murram + worn path murram + grass tint, blended by the layout mask.
 * Anti-tiling: colour is sampled at two scales/rotations and mixed by macro noise.
 * The plane's UVs must be world metres / TILE_M (see groundGeometry).
 */
export function makeGroundMaterial(base: SurfaceTextures, path: SurfaceTextures, mask: THREE.Texture, rock: SurfaceTextures, sand?: THREE.Texture) {
  prep(base);
  prep(path);
  prep(rock);
  if (sand) {
    sand.wrapS = sand.wrapT = THREE.RepeatWrapping;
    sand.anisotropy = 8;
    sand.colorSpace = THREE.SRGBColorSpace;
  }
  const mat = new THREE.MeshStandardMaterial({
    map: base.color,
    normalMap: base.normal,
    roughnessMap: base.rough,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 1,
    metalness: 0,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPathMap = { value: path.color };
    shader.uniforms.uMask = { value: mask };
    shader.uniforms.uMaskSize = { value: MASK_SIZE_M };
    shader.uniforms.uRockMap = { value: rock.color };
    shader.uniforms.uRidge = { value: new THREE.Vector3(RIDGE.x, RIDGE.z, RIDGE.r) };
    shader.uniforms.uSandMap = { value: sand ?? base.color };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPosG;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldPosG = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWorldPosG;
uniform sampler2D uPathMap;
uniform sampler2D uMask;
uniform float uMaskSize;
uniform sampler2D uRockMap;
uniform vec3 uRidge;
uniform sampler2D uSandMap;
${SHORE_GLSL}
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), u.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), u.x), u.y);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `
vec2 guv = vWorldPosG.xz / ${TILE_M.toFixed(2)};
vec2 mUv = vWorldPosG.xz / uMaskSize + 0.5;
vec4 mask = texture2D(uMask, clamp(mUv, 0.0, 1.0));
float inMask = step(0.0, mUv.x) * step(mUv.x, 1.0) * step(0.0, mUv.y) * step(mUv.y, 1.0);
float macro = mix(0.5, mask.b, inMask);
// anti-tiling: second sample rotated ~37 deg at 0.37x scale
mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
vec3 a = texture2D(map, guv).rgb;
vec3 b = texture2D(map, rot * guv * 0.37 + 0.17).rgb;
vec3 baseCol = mix(a, b, smoothstep(0.35, 0.65, macro));
// measured dusty-tan murram, varied in brightness/warmth over tens of metres
vec3 tint = mix(vec3(1.06, 0.95, 0.80), vec3(1.10, 0.86, 0.70), macro);
baseCol *= tint;
vec3 pathCol = texture2D(uPathMap, guv * 1.3).rgb * vec3(1.05, 0.78, 0.62);
vec3 grassCol = baseCol * vec3(0.52, 0.62, 0.36);
vec3 col = mix(baseCol, pathCol, mask.r * inMask);
col = mix(col, grassCol, mask.g * inMask * 0.85);
// outside the mtaa: wild grass/bush patches on open ground
float wildN = gNoise(vWorldPosG.xz * 0.035) * 0.7 + gNoise(vWorldPosG.xz * 0.15) * 0.3;
col = mix(col, grassCol * 0.9, (1.0 - inMask) * smoothstep(0.5, 0.75, wildN) * 0.8);
// Kibera: trodden red earth between the houses (owner photo)
float kib = smoothstep(-150.0, -175.0, vWorldPosG.x) * smoothstep(-300.0, -280.0, vWorldPosG.z) * smoothstep(310.0, 290.0, vWorldPosG.z);
col = mix(col, pathCol * vec3(1.0, 0.92, 0.85), kib * (0.55 + 0.25 * gNoise(vWorldPosG.xz * 0.2)));
// ...and dirt: dark wet mud patches, grey ash from jikos, scattered rubbish stains
float mud = smoothstep(0.55, 0.8, gNoise(vWorldPosG.xz * 0.11 + 7.0) * 0.7 + gNoise(vWorldPosG.xz * 0.6) * 0.3);
col = mix(col, col * vec3(0.42, 0.38, 0.32), kib * mud * 0.85);
float ash = smoothstep(0.7, 0.9, gNoise(vWorldPosG.xz * 0.23 - 3.0));
col = mix(col, vec3(0.32, 0.31, 0.3), kib * ash * 0.5);
// Rocky Ridge: cracked bare rock breaking through the soil
float rd = length(vWorldPosG.xz - uRidge.xy);
float rocky = smoothstep(uRidge.z, uRidge.z * 0.45, rd) * smoothstep(0.35, 0.6, gNoise(vWorldPosG.xz * 0.05) * 0.6 + 0.4);
vec3 rockCol = texture2D(uRockMap, guv * 0.6).rgb * vec3(1.05, 0.98, 0.9);
col = mix(col, rockCol, clamp(rocky * 1.4, 0.0, 1.0));
// Mkurugenzi Beach: pale coral sand, darker wet sand at the waterline, a tide line, seabed below
float sd = vWorldPosG.x - shoreX(vWorldPosG.z);
float beach = smoothstep(-175.0, -140.0, sd);
if (beach > 0.0) {
  vec3 sandA = texture2D(uSandMap, guv * 0.8).rgb;
  vec3 sandB = texture2D(uSandMap, rot * guv * 0.29 + 0.31).rgb;
  vec3 sandCol = mix(sandA, sandB, smoothstep(0.3, 0.7, gNoise(vWorldPosG.xz * 0.02))) * vec3(1.18, 1.1, 0.98);
  float wet = smoothstep(-14.0, -2.0, sd);
  sandCol = mix(sandCol, sandCol * vec3(0.62, 0.6, 0.56), wet);
  float tide = smoothstep(1.2, 0.0, abs(sd + 16.0 + 3.0 * sin(vWorldPosG.z * 0.05))) * smoothstep(0.4, 0.7, gNoise(vWorldPosG.xz * 0.4));
  sandCol = mix(sandCol, vec3(0.32, 0.28, 0.22), tide * 0.5);
  sandCol = mix(sandCol, sandCol * vec3(0.55, 0.68, 0.66), smoothstep(0.0, 25.0, sd)); // under water
  col = mix(col, sandCol, beach);
}
diffuseColor.rgb *= col;
`,
      );
  };
  mat.customProgramCacheKey = () => 'ground-v4';
  return mat;
}

/**
 * Tarmac: bleached asphalt, dusty murram creeping in from both edges, faded centre dashes,
 * darker oily wheel tracks. Plane UVs: u across the road (0..1), v along it (0..1).
 */
export function makeRoadMaterial(t: SurfaceTextures, widthM: number, lengthM: number) {
  prep(t);
  t.color.repeat.set(widthM / 4, lengthM / 4);
  t.normal.repeat.copy(t.color.repeat);
  t.rough.repeat.copy(t.color.repeat);
  const mat = new THREE.MeshStandardMaterial({
    map: t.color,
    normalMap: t.normal,
    roughnessMap: t.rough,
    roughness: 1,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLen = { value: lengthM };
    shader.uniforms.uWidth = { value: widthM };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRoadUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvRoadUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRoadUv;\nuniform float uLen;\nuniform float uWidth;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
float xm = (vRoadUv.x - 0.5) * uWidth;      // metres from centre line
float ym = vRoadUv.y * uLen;                // metres along the road
diffuseColor.rgb *= vec3(0.62, 0.62, 0.60); // asphalt albedo (bleached look comes from the sun)
// wheel tracks: slightly darker, smoother bands ~1 m either side of each lane centre
float lane = abs(abs(xm) - uWidth * 0.25);
float track = smoothstep(0.9, 0.35, abs(lane - 0.75)) ;
diffuseColor.rgb *= 1.0 - track * 0.10;
// edge dust: murram blown onto the last ~0.8 m of tarmac
float edge = smoothstep(uWidth * 0.5 - 0.9, uWidth * 0.5, abs(xm));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.70, 0.58, 0.45), edge * 0.75);
// faded centre dashes (3 m paint, 6 m gap), worn by traffic
float dash = step(mod(ym, 9.0), 3.0) * step(abs(xm), 0.06);
float wear = 0.45 + 0.35 * fract(sin(floor(ym / 9.0) * 12.9898) * 43758.5453);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.85, 0.80), dash * wear);
`,
      );
  };
  mat.customProgramCacheKey = () => 'road-v1';
  return mat;
}

/** Plane in the XZ plane whose UVs are world metres / tile size (for world-aligned tiling). */
export function groundGeometry(sizeM: number, segments = 1) {
  const g = new THREE.PlaneGeometry(sizeM, sizeM, segments, segments);
  g.rotateX(-Math.PI / 2);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * sizeM) / TILE_M, (uv.getY(i) * sizeM) / TILE_M);
  uv.needsUpdate = true;
  return g;
}
