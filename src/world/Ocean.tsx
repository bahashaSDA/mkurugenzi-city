import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGame } from '../app/store';
import { SEA_Y } from '../config/coast';
import { SHORE_GLSL } from './materials/shoreGlsl';

// The Indian Ocean off Mkurugenzi Beach. One camera-following grid whose vertices crowd near the
// viewer (|u|^2.2 spacing) and stretch to the horizon, so close waves are smooth and the sea
// still reaches the sky. Physically based (sky and sun/moon reflections come from the scene's
// lights and environment, so it follows the day/night cycle):
//  * five Gerstner waves rolling in from the east, shrinking over the shallow shelf (shoaling)
//  * turquoise over sand, deep blue past the drop-off, see-through in the shallows
//  * swash lines that run up the beach and fade, whitecaps on the biggest crests
//  * fine ripples in the fragment shader (three scrolling octaves)
const RADIUS = 6000;
const SEGMENTS = { low: 128, mid: 192, high: 256 } as const;

/** Gerstner waves (direction xz, wavelength m, steepness, speed m/s). Shared with swimming. */
export const WAVES: [number, number, number, number, number][] = [
  [-1.0, 0.18, 38, 0.32, 7.7],
  [-0.92, -0.38, 21, 0.28, 5.7],
  [-0.8, 0.6, 13, 0.24, 4.5],
  [-1.0, -0.1, 7.5, 0.2, 3.4],
  [-0.6, 0.8, 4.2, 0.16, 2.6],
];

/** Approximate water surface height at (x, z) for swimming and buoyancy (CPU twin of the shader). */
export function waveHeight(x: number, z: number, t: number, depth: number): number {
  const shoal = Math.min(1, Math.max(0.12, depth / 7));
  let y = 0;
  for (const [dx, dz, L, steep, c] of WAVES) {
    const len = Math.hypot(dx, dz);
    const k = (2 * Math.PI) / L;
    const a = (steep / k) * 0.3 * shoal;
    y += a * Math.sin(k * ((dx * x + dz * z) / len) - k * c * t);
  }
  return SEA_Y + y;
}

export const oceanTime = { value: 0 };

function makeGeometry(n: number) {
  const g = new THREE.PlaneGeometry(2, 2, n, n);
  g.rotateX(-Math.PI / 2);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i);
    const v = p.getZ(i);
    p.setXYZ(i, Math.sign(u) * Math.abs(u) ** 2.2 * RADIUS, 0, Math.sign(v) * Math.abs(v) ** 2.2 * RADIUS);
  }
  g.computeBoundingSphere();
  g.boundingSphere!.radius = RADIUS * 1.5;
  return g;
}

function makeMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.07,
    metalness: 0.0,
    transparent: true,
    envMapIntensity: 1.0,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = oceanTime;
    const waves = WAVES.map(([dx, dz, L, s, c]) => {
      const len = Math.hypot(dx, dz);
      return `gerstner(p, vec2(${(dx / len).toFixed(4)}, ${(dz / len).toFixed(4)}), ${L.toFixed(2)}, ${s.toFixed(3)}, ${c.toFixed(2)}, shoal, disp, tang, bin);`;
    }).join('\n    ');
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
varying vec3 vOceanW;
varying float vCrest;
${SHORE_GLSL}
void gerstner(vec2 p, vec2 dir, float L, float steep, float c, float shoal, inout vec3 disp, inout vec3 tang, inout vec3 bin) {
  float k = 6.28318 / L;
  float a = steep / k * 0.3 * shoal;
  float f = k * (dot(dir, p) - c * uTime);
  float s = sin(f), co = cos(f);
  disp += vec3(dir.x * a * co * 0.6, a * s, dir.y * a * co * 0.6);
  tang += vec3(-dir.x * dir.x * steep * s * 0.33, dir.x * steep * co * 0.55, -dir.x * dir.y * steep * s * 0.33);
  bin += vec3(-dir.x * dir.y * steep * s * 0.33, dir.y * steep * co * 0.55, -dir.y * dir.y * steep * s * 0.33);
}`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `vec4 wp0 = modelMatrix * vec4(position, 1.0);
vec2 p = wp0.xz;
float depth = max(0.0, -seabed(p.x - shoreX(p.y)));
float shoal = clamp(depth / 7.0, 0.12, 1.0) * smoothstep(-2.0, 3.0, p.x - shoreX(p.y));
vec3 disp = vec3(0.0);
vec3 tang = vec3(1.0, 0.0, 0.0);
vec3 bin = vec3(0.0, 0.0, 1.0);
${waves}
vec3 objectNormal = normalize(cross(bin, tang));
vCrest = disp.y;`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3(position) + disp;
vOceanW = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
varying vec3 vOceanW;
varying float vCrest;
${SHORE_GLSL}
float oHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float oNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(oHash(i), oHash(i + vec2(1, 0)), u.x), mix(oHash(i + vec2(0, 1)), oHash(i + vec2(1, 1)), u.x), u.y);
}
float ripples(vec2 p) {
  return oNoise(p * 0.55 + vec2(uTime * 0.45, uTime * 0.12)) * 0.5
       + oNoise(p * 1.3 - vec2(uTime * 0.6, -uTime * 0.31)) * 0.3
       + oNoise(p * 3.1 + vec2(-uTime * 0.9, uTime * 0.5)) * 0.2;
}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
float sd = vOceanW.x - shoreX(vOceanW.z);
if (sd < -40.0) discard; // never inland: hollows below sea level must stay dry`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float depthO = max(0.0, -seabed(sd));
vec3 shallow = vec3(0.16, 0.62, 0.6);
vec3 mid = vec3(0.04, 0.33, 0.42);
vec3 deep = vec3(0.012, 0.09, 0.16);
vec3 water = mix(shallow, mid, smoothstep(0.5, 6.0, depthO));
water = mix(water, deep, smoothstep(6.0, 30.0, depthO));
// swash: foam lines that run up the sand and fade, plus the breaker line on the shelf
float run = fract(sd * 0.045 + uTime * 0.11 + oNoise(vOceanW.xz * 0.05) * 0.6);
float swash = smoothstep(0.82, 1.0, run) * smoothstep(40.0, 2.0, sd) * smoothstep(-6.0, 0.0, sd);
float shoreFoam = smoothstep(1.2, 0.0, abs(sd + 1.0 - 2.0 * sin(uTime * 0.6 + vOceanW.z * 0.03)));
float crest = smoothstep(0.62, 0.95, vCrest) * smoothstep(0.6, 0.85, oNoise(vOceanW.xz * 0.35 + uTime * 0.2));
float foam = clamp((swash + shoreFoam) * (0.55 + 0.45 * oNoise(vOceanW.xz * 1.7)) + crest * 0.7, 0.0, 1.0);
diffuseColor.rgb = mix(water, vec3(0.93, 0.95, 0.95), foam);
diffuseColor.a = mix(mix(0.38, 0.93, smoothstep(0.2, 5.0, depthO)), 1.0, foam);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  float e = 0.25;
  vec2 q = vOceanW.xz;
  float h0 = ripples(q);
  vec3 rn = normalize(vec3(-(ripples(q + vec2(e, 0.0)) - h0) / e * 0.35, 1.0, -(ripples(q + vec2(0.0, e)) - h0) / e * 0.35));
  normal = normalize(normal + (viewMatrix * vec4(rn - vec3(0.0, 1.0, 0.0), 0.0)).xyz * (1.0 - foam));
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(0.06, 0.6, foam);`,
      );
  };
  mat.customProgramCacheKey = () => 'ocean-v1';
  return mat;
}

export function Ocean() {
  const tier = useGame((s) => s.tier);
  const mesh = useMemo(() => {
    const m = new THREE.Mesh(makeGeometry(SEGMENTS[tier]), makeMaterial());
    m.frustumCulled = false;
    m.receiveShadow = true;
    m.renderOrder = 1;
    return m;
  }, [tier]);
  useFrame((state, dt) => {
    oceanTime.value += Math.min(dt, 0.1);
    // follow the camera on a coarse grid (waves are in world space, so nothing swims)
    const c = state.camera.position;
    mesh.position.set(Math.round(c.x / 4) * 4, SEA_Y, Math.round(c.z / 4) * 4);
    // nobody sees the sea from deep inland: skip it entirely
    mesh.visible = c.x > 300 || c.y > 120;
  });
  return <primitive object={mesh} />;
}
