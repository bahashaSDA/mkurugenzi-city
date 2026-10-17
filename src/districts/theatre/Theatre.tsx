import { Suspense, useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useKTX2 } from '../../world/useKTX2';
import { useGame } from '../../app/store';
import { playerPosition } from '../../systems/player/playerState';
import { register } from '../../game/interactables';
import { onKeyPress, inputLock } from '../../systems/input';
import { indoor, screenLight, seat, useTheatre } from '../../game/theatre';
import { variantsFor } from '../../systems/npc/Pedestrians';
import { bakeSeated, type BakedPart } from './audience';
import { groundY, insideTheatre, PRICE, rowY, rowZ, seats, TH } from './layout';
import { useCharacterModels } from '../../systems/characterModels';

// The Mkurugenzi Grand Theatre, CBD. Walk in through the glass lobby, buy a ticket at the booth,
// take the corridor to the hall, find Row J and watch an episode on the big screen with a full
// house. Built at real scale from CC0 PBR materials (ambientCG); about 25 draw calls inside.
const LOAD_DIST = 420;


export function Theatre() {
  const [near, setNear] = useState(false);
  useFrame(() => {
    const d = Math.hypot(playerPosition.x - TH.cx, playerPosition.z - TH.cz);
    if (!near && d < LOAD_DIST) setNear(true);
    else if (near && d > LOAD_DIST + 60) setNear(false);
    indoor.target = insideTheatre(playerPosition.x, playerPosition.z, playerPosition.y - 0.85) ? 1 : 0;
  });
  if (!near) return null;
  return (
    <Suspense fallback={null}>
      <TheatreBuilding />
    </Suspense>
  );
}

// ------------------------------------------------------------------ materials
function pbr(maps: (THREE.Texture | undefined)[], repeat: number, tint = '#ffffff', extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const [c, n, r] = maps;
  for (const t of [c, n, r]) {
    if (!t) continue;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
  }
  if (c) c.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: c, normalMap: n, roughnessMap: r, color: tint, ...extra });
}

/** Box geometry with UVs in metres (so tiling textures keep real scale on any size). */
function box(w: number, h: number, d: number, x: number, y: number, z: number, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const su = ax > 0.5 ? d : w;
    const sv = ay > 0.5 ? d : h;
    uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
  }
  g.translate(x, y, z);
  return g;
}

function signTexture(lines: { text: string; size: number; color: string; y: number; font?: string }[], w = 2048, h = 512, bg = 'transparent') {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  if (bg !== 'transparent') {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const l of lines) {
    g.font = `${l.font ?? '700'} ${l.size}px "Bebas Neue", "Oswald", Impact, sans-serif`;
    g.shadowColor = l.color;
    g.shadowBlur = l.size * 0.25;
    g.fillStyle = l.color;
    g.fillText(l.text, w / 2, l.y * h);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ------------------------------------------------------------------ the building
interface Part {
  geos: THREE.BufferGeometry[];
  mat: THREE.Material;
  shadow?: boolean;
}

function TheatreBuilding() {
  const tier = useGame((s) => s.tier);
  const tex = useKTX2([
    '/textures/th_stone_color.ktx2', '/textures/th_stone_normal.ktx2', '/textures/th_stone_rough.ktx2',
    '/textures/th_concrete_color.ktx2', '/textures/th_concrete_normal.ktx2', '/textures/th_concrete_rough.ktx2',
    '/textures/th_carpet_color.ktx2', '/textures/th_carpet_normal.ktx2', '/textures/th_carpet_rough.ktx2',
    '/textures/th_fabric_color.ktx2', '/textures/th_fabric_normal.ktx2', '/textures/th_fabric_rough.ktx2',
    '/textures/th_wood_color.ktx2', '/textures/th_wood_normal.ktx2', '/textures/th_wood_rough.ktx2',
    '/textures/th_terrazzo_color.ktx2', '/textures/th_terrazzo_normal.ktx2', '/textures/th_terrazzo_rough.ktx2',
    '/textures/th_stage_color.ktx2', '/textures/th_stage_normal.ktx2', '/textures/th_stage_rough.ktx2',
    '/textures/paving_color.ktx2', '/textures/paving_normal.ktx2', '/textures/paving_rough.ktx2',
  ]);
  const y0 = useMemo(groundY, []);

  const built = useMemo(() => {
    const M = {
      stone: pbr(tex.slice(0, 3), 1, '#f1e8d8', { roughness: 1 }),
      concrete: pbr(tex.slice(3, 6), 1, '#c9c6c0', { roughness: 1 }),
      carpet: pbr(tex.slice(6, 9), 1, '#b0303a', { roughness: 1 }),
      fabric: pbr(tex.slice(9, 12), 1, '#a3161f', { roughness: 1 }),
      wood: pbr(tex.slice(12, 15), 1, '#ffffff', { roughness: 1 }),
      terrazzo: pbr(tex.slice(15, 18), 1, '#ffffff', { roughness: 1 }),
      stage: pbr(tex.slice(18, 21), 1, '#ffffff', { roughness: 1 }),
      paving: pbr(tex.slice(21, 24), 1, '#d8d2c8', { roughness: 1 }),
      dark: new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.85 }),
      metal: new THREE.MeshStandardMaterial({ color: '#2a2b2e', roughness: 0.35, metalness: 0.8 }),
      gold: new THREE.MeshStandardMaterial({ color: '#c9a043', roughness: 0.3, metalness: 0.9 }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#9fb4c4', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false }),
      screen: new THREE.MeshStandardMaterial({ color: '#0d0e12', roughness: 0.6, emissive: '#1c2230', emissiveIntensity: 0.4 }),
      lamp: new THREE.MeshStandardMaterial({ color: '#fff1d6', emissive: '#ffd9a0', emissiveIntensity: 2.2 }),
    };
    const W2 = TH.W / 2;
    const D2 = TH.D / 2;
    const t = TH.wall;
    const parts: Part[] = [];
    const cols: [number, number, number, number, number, number][] = []; // half extents + centre
    const add = (mat: THREE.Material, g: THREE.BufferGeometry, collide = true, shadow = true) => {
      let p = parts.find((q) => q.mat === mat && q.shadow === shadow);
      if (!p) parts.push((p = { geos: [], mat, shadow }));
      p.geos.push(g);
      if (collide) {
        g.computeBoundingBox();
        const b = g.boundingBox!;
        cols.push([(b.max.x - b.min.x) / 2, (b.max.y - b.min.y) / 2, (b.max.z - b.min.z) / 2, (b.max.x + b.min.x) / 2, (b.max.y + b.min.y) / 2, (b.max.z + b.min.z) / 2]);
      }
    };
    // ---- outer shell: stone-clad side and back walls, concrete above the lobby
    add(M.stone, box(t, TH.H, TH.D, -W2 + t / 2, TH.H / 2, 0, 2.4));
    add(M.stone, box(t, TH.H, TH.D, W2 - t / 2, TH.H / 2, 0, 2.4));
    add(M.concrete, box(TH.W, TH.H, t, 0, TH.H / 2, -D2 + t / 2, 3));
    // fly tower (stage house) rising over the back: hollow, open towards the hall
    add(M.concrete, box(0.6, TH.flyH, 13, -18, TH.flyH / 2, -D2 + 6.5, 3));
    add(M.concrete, box(0.6, TH.flyH, 13, 18, TH.flyH / 2, -D2 + 6.5, 3));
    add(M.concrete, box(36.6, 0.5, 13, 0, TH.flyH, -D2 + 6.5, 3), false);
    add(M.concrete, box(36.6, TH.flyH - TH.H, 0.6, 0, TH.H + (TH.flyH - TH.H) / 2, -D2 + 13, 3), false);
    // roof slab and the lobby ceiling
    add(M.concrete, box(TH.W, 0.5, TH.D, 0, TH.H + 0.25, 0, 3), false);
    add(M.concrete, box(TH.W - 2 * t, 0.4, 32 - TH.lobbyZ, 0, TH.lobbyH + 0.2, (32 + TH.lobbyZ) / 2, 3), false);
    // ---- the front: glass lobby at street level, a stone block above with the marquee
    const doorXs = [-7, 0, 7];
    const frontZ = D2 - 0.3;
    // stone above the glass
    add(M.stone, box(TH.W, TH.H - TH.lobbyH, 1.2, 0, TH.lobbyH + (TH.H - TH.lobbyH) / 2, D2 - 0.6, 2.4));
    // glass curtain wall, with gaps for three double doors
    let gx = -W2 + t;
    for (const dx of [...doorXs.map((d) => d - 1.4), W2 - t]) {
      const w = dx - gx;
      if (w > 0.2) {
        add(M.glass, box(w, TH.lobbyH, 0.06, gx + w / 2, TH.lobbyH / 2, frontZ), true, false);
        for (let m = gx; m < dx; m += 2.4) add(M.metal, box(0.09, TH.lobbyH, 0.18, m, TH.lobbyH / 2, frontZ), false); // mullions
      }
      gx = dx + 2.8;
    }
    add(M.metal, box(TH.W - 2 * t, 0.2, 0.25, 0, 3.1, frontZ), false); // transom
    for (const dx of doorXs) {
      add(M.metal, box(2.8, 0.25, 0.25, dx, 2.75, frontZ), false); // door head
      add(M.glass, box(1.3, 2.6, 0.04, dx - 0.66, 1.3, frontZ + 0.6), false, false); // open door leaves
      add(M.glass, box(1.3, 2.6, 0.04, dx + 0.66, 1.3, frontZ + 0.6), false, false);
    }
    // vertical stone fins up the facade and a canopy on columns over the entrance
    for (let fx = -26; fx <= 26; fx += 4.33) add(M.stone, box(0.5, TH.H - TH.lobbyH - 1, 0.9, fx, TH.lobbyH + (TH.H - TH.lobbyH - 1) / 2, D2 + 0.45, 2.4), false);
    add(M.concrete, box(30, 0.5, 6, 0, 6.6, D2 + 3, 3), false);
    for (const cx of [-14, -7, 0, 7, 14]) {
      const col = new THREE.CylinderGeometry(0.32, 0.36, 6.4, 20);
      col.translate(cx, 3.2, D2 + 5.6);
      add(M.stone, col);
    }
    for (let lx = -13; lx <= 13; lx += 2.6) {
      const dl = new THREE.CylinderGeometry(0.16, 0.16, 0.04, 14);
      dl.translate(lx, 6.33, D2 + 3);
      add(M.lamp, dl, false, false);
    }
    // entrance plaza and steps
    add(M.paving, box(TH.W + 4, 0.3, 9, 0, 0.0, D2 + 4.5, 2), true, false);
    // ---- inside: lobby
    add(M.terrazzo, box(TH.W - 2 * t, 0.3, 32 - TH.lobbyZ, 0, 0, (32 + TH.lobbyZ) / 2, 2.5), true, false);
    // lobby back wall (wood panelled) with openings to the two side corridors
    const corrW = W2 - t - TH.hallX - 0.4;
    add(M.wood, box(2 * TH.hallX + 0.4, TH.lobbyH, 0.4, 0, TH.lobbyH / 2, TH.lobbyZ, 2));
    add(M.wood, box(2 * TH.hallX + 0.4, TH.H - TH.lobbyH, 0.4, 0, TH.lobbyH + (TH.H - TH.lobbyH) / 2, TH.lobbyZ, 2), false);
    // ticket booth (left of the lobby) and the bar counter (right)
    add(M.wood, box(6, 1.15, 1.4, -18, 0.58, 25, 1.5));
    add(M.glass, box(6, 1.6, 0.05, -18, 2.0, 24.4), false, false);
    add(M.dark, box(6.4, 0.9, 1.6, -18, 3.2, 25), false);
    add(M.wood, box(7, 1.1, 1.2, 18, 0.55, 22, 1.5));
    // ---- side corridors (lobby -> front of the hall)
    for (const sgn of [-1, 1]) {
      add(M.wood, box(0.4, TH.lobbyH + 3, TH.lobbyZ - TH.corridorEnd, sgn * TH.hallX, (TH.lobbyH + 3) / 2, (TH.lobbyZ + TH.corridorEnd) / 2, 2));
      add(M.carpet, box(corrW, 0.3, TH.lobbyZ - TH.stageBack, sgn * (TH.hallX + 0.2 + corrW / 2), 0, (TH.lobbyZ + TH.stageBack) / 2, 2), true, false);
      add(M.concrete, box(corrW, 0.3, TH.lobbyZ - TH.corridorEnd, sgn * (TH.hallX + 0.2 + corrW / 2), TH.lobbyH + 3, (TH.lobbyZ + TH.corridorEnd) / 2, 3), false);
    }
    // ---- the hall: raked rows (each a carpeted step), front floor, rear platform
    for (let r = 0; r < TH.rows; r++) {
      const y = rowY(r);
      add(M.carpet, box(2 * TH.hallX, 0.3, TH.rowPitch, 0, y - 0.15, rowZ(r) + 0.35, 2), true, false);
      add(M.dark, box(2 * TH.hallX, y, 0.05, 0, y / 2, rowZ(r) - 0.15), false, false); // riser
    }
    const lastZ = rowZ(TH.rows - 1) + 0.85;
    add(M.carpet, box(2 * TH.hallX, 0.3, TH.lobbyZ - lastZ, 0, TH.platformY - 0.15, (TH.lobbyZ + lastZ) / 2, 2), true, false);
    add(M.dark, box(2 * TH.hallX, TH.platformY, TH.lobbyZ - lastZ - 0.4, 0, TH.platformY / 2 - 0.3, (TH.lobbyZ + lastZ) / 2 + 0.2), true, false);
    add(M.carpet, box(2 * TH.hallX, 0.3, rowZ(0) - TH.stageFront, 0, 0, (rowZ(0) + TH.stageFront) / 2, 2), true, false);
    add(M.metal, box(2 * TH.hallX, 1.05, 0.06, 0, TH.platformY + 0.5, lastZ), true, false); // rail
    // hall side walls above the corridor walls, wood panels, a ceiling
    for (const sgn of [-1, 1]) add(M.wood, box(0.4, TH.H - (TH.lobbyH + 3), TH.lobbyZ - TH.stageBack, sgn * TH.hallX, TH.lobbyH + 3 + (TH.H - TH.lobbyH - 3) / 2, (TH.lobbyZ + TH.stageBack) / 2, 2), false);
    add(M.dark, box(2 * TH.hallX, 0.4, TH.lobbyZ - TH.stageFront, 0, TH.H - 1.2, (TH.lobbyZ + TH.stageFront) / 2, 3), false);
    // ---- stage, proscenium arch, curtains, screen
    add(M.stage, box(TH.proscenium.w + 6, TH.stageY, TH.stageFront - TH.stageBack, 0, TH.stageY / 2, (TH.stageFront + TH.stageBack) / 2, 2));
    const P = TH.proscenium;
    const pz = TH.stageFront - 0.6;
    add(M.wood, box((2 * TH.hallX - P.w) / 2, TH.H, 1, -(P.w / 2 + (2 * TH.hallX - P.w) / 4), TH.H / 2, pz, 2));
    add(M.wood, box((2 * TH.hallX - P.w) / 2, TH.H, 1, P.w / 2 + (2 * TH.hallX - P.w) / 4, TH.H / 2, pz, 2));
    add(M.wood, box(P.w, TH.H - P.h, 1, 0, P.h + (TH.H - P.h) / 2, pz, 2), false);
    add(M.gold, box(P.w + 0.6, 0.35, 1.1, 0, P.h, pz + 0.05), false);
    for (const sgn of [-1, 1]) add(M.gold, box(0.35, P.h, 1.1, sgn * (P.w / 2 + 0.15), P.h / 2, pz + 0.05), false);
    // drawn-back curtains: pleated velvet drapes either side, gathered toward the floor
    for (const sgn of [-1, 1]) {
      const drapeW = 4.2;
      const drapeH = P.h - 0.8;
      const c = new THREE.PlaneGeometry(drapeW, drapeH, 48, 8);
      const pos = c.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getX(i) / drapeW + 0.5; // 0..1 across
        const v = pos.getY(i) / drapeH + 0.5; // 0 bottom .. 1 top
        const gather = 1 - 0.35 * (1 - v); // tied back: narrower lower down
        pos.setX(i, (u - 0.5) * drapeW * gather);
        pos.setZ(i, Math.sin(u * Math.PI * 14) * 0.22 * (0.6 + 0.4 * v));
      }
      c.computeVertexNormals();
      const both = mergeGeometries([c, c.clone().rotateY(Math.PI)])!; // two-sided
      both.translate(sgn * (P.w / 2 - drapeW / 2 + 0.2), TH.stageY + drapeH / 2, pz - 1.2);
      add(M.fabric, both, false);
    }
    add(M.fabric, box(P.w, 1.6, 0.4, 0, P.h - 0.9, pz - 1.0, 1), false);
    add(M.screen, box(TH.screen.w + 0.6, TH.screen.h + 0.6, 0.15, 0, TH.screen.y, TH.screen.z - 0.1), false, false);
    // wall sconces along the hall
    for (const sgn of [-1, 1]) for (let z = -12; z <= 14; z += 6.5) add(M.lamp, box(0.12, 0.6, 0.3, sgn * (TH.hallX - 0.25), 5.2, z), false, false);

    const meshes = parts.map((p) => {
      const g = mergeGeometries(p.geos.map((q) => (q.index ? q.toNonIndexed() : q)), false)!;
      const mesh = new THREE.Mesh(g, p.mat);
      mesh.castShadow = !!p.shadow;
      mesh.receiveShadow = true;
      return mesh;
    });

    // ---- seats: cushion + back (velvet) and arms/frame (black), instanced
    const seatFab = mergeGeometries([box(0.5, 0.1, 0.46, 0, 0.44, 0, 0.5), box(0.5, 0.62, 0.08, 0, 0.78, 0.24, 0.5)].map((q) => q.toNonIndexed()))!;
    const seatFrame = mergeGeometries([box(0.06, 0.62, 0.5, -0.28, 0.31, 0.02), box(0.06, 0.62, 0.5, 0.28, 0.31, 0.02)].map((q) => q.toNonIndexed()))!;
    const all = seats();
    const fabInst = new THREE.InstancedMesh(seatFab, M.fabric, all.length);
    const frameInst = new THREE.InstancedMesh(seatFrame, M.dark, all.length);
    const m4 = new THREE.Matrix4();
    all.forEach((s, i) => {
      m4.makeTranslation(s.x, rowY(s.row), rowZ(s.row) + 0.55);
      fabInst.setMatrixAt(i, m4);
      frameInst.setMatrixAt(i, m4);
    });
    for (const inst of [fabInst, frameInst]) {
      inst.receiveShadow = true;
      inst.castShadow = false;
    }
    // seat blocks are solid for walking: you use the aisles (like a real theatre)
    for (let r = 0; r < TH.rows; r++) {
      for (const b of TH.blocks) {
        const w = b.n * TH.seatPitch;
        cols.push([w / 2, 0.45, 0.28, b.x0 + w / 2, rowY(r) + 0.45, rowZ(r) + 0.6]);
      }
    }
    // ---- signs: the marquee, posters, ticket booth price
    const marquee = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 4.6),
      new THREE.MeshStandardMaterial({
        map: signTexture([
          { text: 'MKURUGENZI', size: 230, color: '#ffe7a8', y: 0.42 },
          { text: 'GRAND  THEATRE', size: 120, color: '#ffffff', y: 0.82, font: '600' },
        ]),
        transparent: true,
        emissive: '#ffffff',
        emissiveIntensity: 1.4,
        depthWrite: false,
      }),
    );
    marquee.material.emissiveMap = marquee.material.map;
    marquee.position.set(0, 12.2, D2 + 0.95);
    const nowShowing = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 2.2),
      new THREE.MeshStandardMaterial({
        map: signTexture([{ text: 'NOW SHOWING · YOUNG & STUPID · HEADLINE HITTERS · I GOT YOU', size: 92, color: '#ffd23c', y: 0.5 }], 2048, 320, '#0b0b0d'),
        emissive: '#ffffff',
        emissiveIntensity: 0.9,
      }),
    );
    (nowShowing.material as THREE.MeshStandardMaterial).emissiveMap = (nowShowing.material as THREE.MeshStandardMaterial).map;
    nowShowing.position.set(0, 7.3, D2 + 6.02);
    const booth = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 0.85),
      new THREE.MeshStandardMaterial({
        map: signTexture([{ text: `TICKETS  ·  KSh ${PRICE.toLocaleString()}`, size: 150, color: '#ffffff', y: 0.5 }], 2048, 300, '#7a0f16'),
        emissive: '#ffffff',
        emissiveIntensity: 0.6,
      }),
    );
    (booth.material as THREE.MeshStandardMaterial).emissiveMap = (booth.material as THREE.MeshStandardMaterial).map;
    booth.position.set(-18, 3.2, 25 - 0.81);
    booth.rotation.y = Math.PI;
    return { meshes, cols, seats: [fabInst, frameInst], signs: [marquee, nowShowing, booth] };
  }, [tex]);

  // interactables: the booth, your seat
  const useTicket = useTheatre((s) => s.buy);
  useEffect(() => {
    const b = { x: TH.cx - 18, z: TH.cz + 23.2 };
    const mySeat = { x: TH.cx + (-9.6 + 16.5 * TH.seatPitch), z: TH.cz + rowZ(9) + 0.55 };
    const offs = [
      register({ id: 'theatre-booth', x: b.x, z: b.z, y: y0 + 0.9, radius: 2.4, key: 'KeyE', label: `Buy a ticket (KSh ${PRICE.toLocaleString()})`, use: useTicket }),
      register({
        id: 'theatre-seat', x: mySeat.x, z: mySeat.z - 0.7, y: y0 + rowY(9) + 0.9, radius: 1.6, key: 'KeyE', label: 'Sit down (Row J, seat 17)',
        use: () => {
          useTheatre.getState().sit();
          if (!useTheatre.getState().seated) return;
          Object.assign(seat, {
            active: true, fixedCam: true, x: mySeat.x, y: y0 + rowY(9) + 0.02, z: mySeat.z, facing: Math.PI,
            camX: mySeat.x + 0.55, camY: y0 + rowY(9) + 1.55, camZ: mySeat.z + 1.15,
            lookX: TH.cx, lookY: y0 + TH.screen.y - 1, lookZ: TH.cz + TH.screen.z,
            // back out into the centre-block aisle
            exitX: TH.cx - 10.4, exitY: y0 + rowY(9) + 1.2, exitZ: TH.cz + rowZ(9) + 0.3,
          });
          document.exitPointerLock?.();
        },
      }),
    ];
    return () => offs.forEach((f) => f());
  }, [y0, useTicket]);
  // E or Esc: get up and leave the seat
  useEffect(() => {
    const leave = () => {
      if (!useTheatre.getState().seated) return;
      useTheatre.getState().leave();
      seat.active = false;
    };
    const offs = [onKeyPress('Escape', leave), onKeyPress('KeyE', () => (useTheatre.getState().seated ? setTimeout(leave, 0) : undefined))];
    return () => offs.forEach((f) => f());
  }, []);

  const video = useTheatre((s) => s.video);
  const seated = useTheatre((s) => s.seated);
  useEffect(() => {
    inputLock.ui = seated;
    return () => {
      inputLock.ui = false;
    };
  }, [seated]);
  useFrame((state) => {
    // the screen lights the house while a show plays (a flicker of the picture)
    screenLight.position.set(TH.cx, y0 + TH.screen.y, TH.cz + TH.screen.z + 1);
    screenLight.target.position.set(TH.cx, y0 + 2, TH.cz + 6);
    screenLight.target.updateMatrixWorld();
    screenLight.intensity = video ? 60 * (0.8 + 0.2 * Math.sin(state.clock.elapsedTime * 7.3) * Math.sin(state.clock.elapsedTime * 2.1)) : seated ? 20 : 0;
  });

  return (
    <group position={[TH.cx, y0, TH.cz]}>
      {built.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      {built.seats.map((m, i) => (
        <primitive key={`s${i}`} object={m} />
      ))}
      {built.signs.map((m, i) => (
        <primitive key={`g${i}`} object={m} />
      ))}
      <RigidBody type="fixed" colliders={false}>
        {built.cols.map(([hx, hy, hz, x, y, z], i) => (
          <CuboidCollider key={i} args={[hx, hy, hz]} position={[x, y, z]} />
        ))}
      </RigidBody>
      <Suspense fallback={null}>
        <Audience tier={tier} />
      </Suspense>
      {video && seated && (
        <Html transform position={[0, TH.screen.y, TH.screen.z + 0.02]} scale={(TH.screen.w / 32) * 1.5} zIndexRange={[5, 0]}>
          <iframe
            width={1280}
            height={720}
            src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&modestbranding=1`}
            title={video.title}
            allow="autoplay; encrypted-media; picture-in-picture"
            style={{ border: 0, display: 'block', background: '#000' }}
          />
        </Html>
      )}
    </group>
  );
}

// ------------------------------------------------------------------ the full house
function Audience({ tier }: { tier: 'low' | 'mid' | 'high' }) {
  const urls = useMemo(() => variantsFor(tier).map((v) => `/models/npc_${v}.glb`), [tier]);
  const gltfs = useCharacterModels(urls);
  const [baked, setBaked] = useState<BakedPart[][] | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const out: BakedPart[][] = [];
      for (const g of gltfs) {
        out.push(await bakeSeated(g, tier === 'high' ? 0.3 : 0.18));
        await new Promise((r) => setTimeout(r, 0)); // spread the work over frames
      }
      if (alive) setBaked(out);
    })();
    return () => {
      alive = false;
    };
  }, [gltfs, tier]);

  const meshes = useMemo(() => {
    if (!baked) return [];
    const occupancy = tier === 'low' ? 0.25 : tier === 'mid' ? 0.45 : 0.62;
    const all = seats().filter(() => Math.random() < occupancy);
    // Abel's seat stays free
    const mine = { x: -9.6 + 16.5 * TH.seatPitch, row: 9 };
    const filled = all.filter((s) => !(s.row === mine.row && Math.abs(s.x - mine.x) < 0.1));
    const byVariant: number[][] = baked.map(() => []);
    filled.forEach((_, i) => byVariant[Math.floor(Math.random() * baked.length)]!.push(i));
    const out: THREE.InstancedMesh[] = [];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    baked.forEach((parts, v) => {
      const idx = byVariant[v]!;
      for (const p of parts) {
        const inst = new THREE.InstancedMesh(p.geometry, p.material, idx.length);
        idx.forEach((k, j) => {
          const s = filled[k]!;
          q.setFromAxisAngle(up, Math.PI + (Math.random() - 0.5) * 0.25); // facing the stage, a little turned
          m4.compose(new THREE.Vector3(s.x, rowY(s.row) + 0.02, rowZ(s.row) + 0.62), q, new THREE.Vector3(1, 1, 1));
          inst.setMatrixAt(j, m4);
        });
        inst.castShadow = false;
        inst.receiveShadow = true;
        inst.frustumCulled = false;
        out.push(inst);
      }
    });
    return out;
  }, [baked, tier]);

  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
}
