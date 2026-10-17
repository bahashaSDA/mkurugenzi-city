import * as THREE from 'three';
import type { Surface } from '../../world/roadSurface';
import { clock, daylight } from '../../world/clock';

// Tyre marks, tracks, dust and tyre smoke (Parts 3.5 / 3.6), bounded:
//   * marks: ONE mesh, a ring buffer of MAX quads (oldest overwritten), each wheel laying a strip
//     along its real contact points, as wide as its tyre. Tarmac: dark rubber only while the tyre
//     slips (drift, handbrake, hard launch or braking). Murram / dirt / sand: the tyre always
//     prints a track while it rolls, deeper-coloured the more it slides. Old marks fade out.
//   * puffs: ONE Points mesh, a pool of PUFFS particles: dust off dirt and murram scaled by speed,
//     white-grey smoke off tarmac only while the tyre spins or slides.
// Callers (the driven car, the boda) report each wheel once per rendered frame: tyreContact().

const MAX = 2600; // quads in the ring
const PUFFS = 160;
const SEG = 0.32; // m between strip points
const LIFE = 120; // s before a mark starts to fade
const FADE = 40; // s to fade out
const LIFT = 0.012; // above the road (which has its own polygon offset)

const markPos = new Float32Array(MAX * 4 * 3);
const markCol = new Float32Array(MAX * 4 * 4);
const markBase = new Float32Array(MAX); // starting alpha of each quad
const markBorn = new Float32Array(MAX).fill(-1e9);
let head = 0;

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(markPos, 3).setUsage(THREE.DynamicDrawUsage));
geo.setAttribute('color', new THREE.BufferAttribute(markCol, 4).setUsage(THREE.DynamicDrawUsage));
{
  const idx = new Uint32Array(MAX * 6);
  for (let q = 0; q < MAX; q++) idx.set([q * 4, q * 4 + 2, q * 4 + 1, q * 4 + 1, q * 4 + 2, q * 4 + 3], q * 6);
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
}
geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6); // the ring spans the world
const mat = new THREE.MeshLambertMaterial({
  vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide,
});
export const marksMesh = new THREE.Mesh(geo, mat);
marksMesh.frustumCulled = false;
marksMesh.renderOrder = 1;
marksMesh.name = 'tyre-marks';

// colour of a mark by surface (linear RGB) and how strong it is
const INK: Record<Surface, [number, number, number]> = {
  tarmac: [0.012, 0.012, 0.012], // rubber
  murram: [0.16, 0.055, 0.03], // pressed red earth (darker than the road's dust)
  dirt: [0.12, 0.07, 0.04], // flattened dry grass and earth
  sand: [0.42, 0.34, 0.24], // churned damp sand
};

interface Track { x: number; y: number; z: number; lx: number; ly: number; lz: number; rx: number; ry: number; rz: number; t: number; on: boolean }
const tracks = new Map<string, Track>();
let dirtyLo = MAX;
let dirtyHi = -1;

// ------------------------------------------------------------------------------------- puffs
const pPos = new Float32Array(PUFFS * 3);
const pCol = new Float32Array(PUFFS * 4);
const pSize = new Float32Array(PUFFS);
const pVel = new Float32Array(PUFFS * 3);
const pAge = new Float32Array(PUFFS).fill(1e9);
const pLife = new Float32Array(PUFFS).fill(1);
const pGrow = new Float32Array(PUFFS);
const pA0 = new Float32Array(PUFFS);
let pNext = 0;
const pgeo = new THREE.BufferGeometry();
pgeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
pgeo.setAttribute('aCol', new THREE.BufferAttribute(pCol, 4).setUsage(THREE.DynamicDrawUsage));
pgeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage));
pgeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
const puffMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uScale: { value: 400 }, uLight: { value: 1 } },
  vertexShader: /* glsl */ `
    attribute vec4 aCol; attribute float aSize; uniform float uScale; varying vec4 vCol;
    void main() {
      vCol = aCol;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aCol.a > 0.0 ? aSize * uScale / max(0.1, -mv.z) : 0.0;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uLight; varying vec4 vCol;
    void main() {
      vec2 d = gl_PointCoord - 0.5;
      float r = dot(d, d) * 4.0;
      if (r > 1.0) discard;
      float soft = (1.0 - r) * (1.0 - r);
      gl_FragColor = vec4(vCol.rgb * uLight, vCol.a * soft);
      #include <colorspace_fragment>
    }`,
});
export const puffMesh = new THREE.Points(pgeo, puffMat);
puffMesh.frustumCulled = false;
puffMesh.renderOrder = 2;
puffMesh.name = 'tyre-puffs';

const DUST: Record<Surface, [number, number, number]> = {
  tarmac: [0.78, 0.78, 0.76], // tyre smoke
  murram: [0.62, 0.36, 0.24],
  dirt: [0.56, 0.45, 0.34],
  sand: [0.8, 0.72, 0.58],
};

function puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, s: Surface, size: number, alpha: number, life: number) {
  const i = pNext;
  pNext = (pNext + 1) % PUFFS;
  pPos.set([x, y, z], i * 3);
  pVel.set([vx, vy, vz], i * 3);
  const c = DUST[s];
  pCol.set([c[0], c[1], c[2], alpha], i * 4);
  pSize[i] = size;
  pGrow[i] = size * 1.6;
  pA0[i] = alpha;
  pAge[i] = 0;
  pLife[i] = life;
}

const emitAcc = new Map<string, number>();

/**
 * One wheel's contact this frame. `p`/`n`: contact point and ground normal (world); `fx, fz`: the
 * wheel's rolling direction on the ground; `width`: tyre width (m); `slip` 0..1 (lateral +
 * longitudinal slide); `speed`: ground speed (m/s). `inContact` false ends the strip.
 */
export function tyreContact(key: string, inContact: boolean, p: THREE.Vector3, n: THREE.Vector3, fx: number, fz: number, width: number, slip: number, speed: number, s: Surface, dt: number) {
  const now = performance.now() / 1000;
  const tr = tracks.get(key);
  if (!inContact || speed < 0.4) {
    if (tr) tr.on = false;
    return;
  }
  // how strong a mark this contact leaves
  let a = 0;
  if (s === 'tarmac') a = slip > 0.22 ? Math.min(0.85, (slip - 0.22) * 1.9) : 0;
  else a = Math.min(0.75, 0.3 + slip * 0.6) * (s === 'sand' ? 0.8 : 1);
  // axle direction on the ground (left of travel) and the tyre's two edges
  const l = Math.hypot(fx, fz) || 1;
  const ax = -fz / l;
  const az = fx / l;
  const hw = width / 2;
  const cx = p.x + n.x * LIFT;
  const cy = p.y + n.y * LIFT;
  const cz = p.z + n.z * LIFT;
  const lx = cx + ax * hw, ly = cy, lz = cz + az * hw;
  const rx = cx - ax * hw, ry = cy, rz = cz - az * hw;
  if (!tr) {
    tracks.set(key, { x: cx, y: cy, z: cz, lx, ly, lz, rx, ry, rz, t: now, on: a > 0 });
  } else {
    const d = Math.hypot(cx - tr.x, cz - tr.z);
    if (d >= SEG) {
      if (a > 0 && tr.on && d < 2.5) {
        // one quad from the last edge pair to this one
        const q = head;
        head = (head + 1) % MAX;
        markPos.set([tr.lx, tr.ly, tr.lz, tr.rx, tr.ry, tr.rz, lx, ly, lz, rx, ry, rz], q * 12);
        const c = INK[s];
        for (let k = 0; k < 4; k++) markCol.set([c[0], c[1], c[2], a], (q * 4 + k) * 4);
        markBase[q] = a;
        markBorn[q] = now;
        dirtyLo = Math.min(dirtyLo, q);
        dirtyHi = Math.max(dirtyHi, q);
      }
      Object.assign(tr, { x: cx, y: cy, z: cz, lx, ly, lz, rx, ry, rz, t: now, on: a > 0 });
    }
  }
  // dust off unsealed ground (by speed), smoke off tarmac (only while sliding / spinning)
  let rate = 0;
  let size = 0.5;
  let alpha = 0.25;
  if (s === 'tarmac') {
    if (slip > 0.35) {
      rate = (slip - 0.35) * 40;
      size = 0.8;
      alpha = 0.22;
    }
  } else {
    rate = Math.min(1, speed / 14) * 9 + slip * 14;
    size = 0.9 + Math.min(1.2, speed / 16);
    alpha = s === 'sand' ? 0.22 : 0.36; // dry red earth throws a visible plume
  }
  if (rate > 0) {
    let acc = (emitAcc.get(key) ?? 0) + rate * dt;
    while (acc >= 1) {
      acc -= 1;
      puff(cx + (Math.random() - 0.5) * width, cy + 0.08, cz + (Math.random() - 0.5) * 0.3,
        -fx / l * speed * 0.08 + (Math.random() - 0.5) * 0.6, 0.35 + Math.random() * 0.4, -fz / l * speed * 0.08 + (Math.random() - 0.5) * 0.6,
        s, size, alpha, s === 'tarmac' ? 2.2 : 1.6 + Math.random());
    }
    emitAcc.set(key, acc);
  }
}

let fadeAt = 0;
/** Advance puffs and fade old marks (call once per rendered frame). */
export function updateTyreFx(dt: number, viewportHeight: number) {
  // puffs drift, rise slowly, grow and fade
  let any = false;
  for (let i = 0; i < PUFFS; i++) {
    if (pAge[i]! > pLife[i]!) {
      if (pCol[i * 4 + 3]! !== 0) {
        pCol[i * 4 + 3] = 0;
        any = true;
      }
      continue;
    }
    pAge[i]! += dt;
    const k = pAge[i]! / pLife[i]!;
    pPos[i * 3]! += pVel[i * 3]! * dt;
    pPos[i * 3 + 1]! += pVel[i * 3 + 1]! * dt;
    pPos[i * 3 + 2]! += pVel[i * 3 + 2]! * dt;
    pVel[i * 3]! *= 1 - dt * 1.2;
    pVel[i * 3 + 2]! *= 1 - dt * 1.2;
    pSize[i] = pGrow[i]! * (0.6 + k * 1.4);
    pCol[i * 4 + 3] = pA0[i]! * (1 - k) * Math.min(1, k * 8);
    any = true;
  }
  if (any) {
    pgeo.attributes.position!.needsUpdate = true;
    pgeo.attributes.aCol!.needsUpdate = true;
    pgeo.attributes.aSize!.needsUpdate = true;
  }
  puffMat.uniforms.uScale!.value = viewportHeight * 0.9;
  // dust is lit by the sky: dim at night
  puffMat.uniforms.uLight!.value = 0.25 + 0.75 * daylight(clock.hours);
  // marks: upload what changed; twice a second fade the old ones
  const now = performance.now() / 1000;
  if (now > fadeAt) {
    fadeAt = now + 0.5;
    for (let q = 0; q < MAX; q++) {
      const age = now - markBorn[q]!;
      if (age < LIFE || markBase[q]! <= 0) continue;
      const a = Math.max(0, markBase[q]! * (1 - (age - LIFE) / FADE));
      for (let k = 0; k < 4; k++) markCol[(q * 4 + k) * 4 + 3] = a;
      if (a <= 0) markBase[q] = 0;
      dirtyLo = Math.min(dirtyLo, q);
      dirtyHi = Math.max(dirtyHi, q);
    }
  }
  if (dirtyHi >= dirtyLo) {
    const pa = geo.attributes.position as THREE.BufferAttribute;
    const ca = geo.attributes.color as THREE.BufferAttribute;
    pa.clearUpdateRanges();
    ca.clearUpdateRanges();
    pa.addUpdateRange(dirtyLo * 12, (dirtyHi - dirtyLo + 1) * 12);
    ca.addUpdateRange(dirtyLo * 16, (dirtyHi - dirtyLo + 1) * 16);
    pa.needsUpdate = true;
    ca.needsUpdate = true;
    dirtyLo = MAX;
    dirtyHi = -1;
  }
}

/** ?debug: counts for tests (quads laid, live puffs). */
export function tyreFxStats() {
  let live = 0;
  for (let i = 0; i < PUFFS; i++) if (pAge[i]! <= pLife[i]!) live++;
  let marks = 0;
  for (let q = 0; q < MAX; q++) if (markBase[q]! > 0) marks++;
  return { marks, live, head, max: MAX, puffs: PUFFS };
}
