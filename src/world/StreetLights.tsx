import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ROADS } from '../config/roads';
import { ROUTES } from '../systems/vehicles/routes';
import { heightAt } from './heights';
import { clock, lightsOn } from './clock';
import { useKit } from './kit/useKit';
import { KitInstances, type Placement } from './kit/KitInstances';
import { rig } from './LightRig';

// Nairobi street lighting (models: blender/scripts/build_lights_kit.py -> lights_kit.glb):
//   town roads      lamp_cobra       galvanised octagonal pole, cobra-head HPS lantern (sodium, 2000 K)
//   CBD, arterials  lamp_led         tall grey column, LED luminaire (4000 K)
//   expressway      lamp_led_double  on the median, a luminaire over each carriageway
//   estates         lamp_post        cast post-top lantern (warm 2700 K)
// Every ~32 m, alternating sides; instanced with LODs and a solid collider each.
//
// Light, in layers (GTA-style budget):
//   - the lenses glow after dark only (bloom picks them up), with a small glare sprite far away
//   - the nearest lamps get REAL spot lights pointing down from the head: the road, the pavement,
//     cars, people and walls are lit by them, falling off naturally (inverse square, soft edge).
//     The pool of lights is a fixed size per quality tier (no shader recompiles at dusk); lights
//     hand over from lamp to lamp by fading, never popping. On high, the nearest one casts shadows.
//   - lamps beyond the real lights keep a soft, modest pool of light on the ground under the head,
//     so a street still reads lit into the distance without a flat glow everywhere
const SPACING = 32;
export const LIGHTS_KIT_URL = '/models/lights_kit.glb';

type Kind = 'lamp_cobra' | 'lamp_led' | 'lamp_led_double' | 'lamp_post';
// head offset (local: along the arm +Z, up +Y) of each model, from the Blender script
const HEADS: Record<Kind, [number, number][]> = {
  lamp_cobra: [[2.11, 8.5]],
  lamp_led: [[2.52, 10.1]],
  lamp_led_double: [[2.52, 10.1], [-2.52, 10.1]],
  lamp_post: [[0, 3.82]],
};
const COLOR: Record<Kind, THREE.Color> = {
  lamp_cobra: new THREE.Color('#ffa65a'),
  lamp_led: new THREE.Color('#e9f0ff'),
  lamp_led_double: new THREE.Color('#e9f0ff'),
  lamp_post: new THREE.Color('#ffc98a'),
};
// luminous intensity (candela) and beam: tuned so the road under a lamp is a few times brighter
// than moonlight and fades out within a lamp spacing (overlaps never blow out the tarmac)
const CANDELA: Record<Kind, number> = { lamp_cobra: 150, lamp_led: 230, lamp_led_double: 230, lamp_post: 38 };

interface Head {
  x: number;
  y: number;
  z: number;
  ground: number;
  dirX: number; // the arm's direction (towards the road)
  dirZ: number;
  kind: Kind;
}

function planLamps(): { placements: Placement[]; heads: Head[] } {
  const placements: Placement[] = [];
  const heads: Head[] = [];
  const stops = ROUTES.flatMap((r) => r.stops);
  for (const rd of ROADS) {
    if (rd.kind === 'murram' || rd.id === 'avenue') continue; // the shopping avenue has its own timber poles
    const kind: Kind =
      rd.kind === 'highway'
        ? 'lamp_led_double'
        : rd.id.startsWith('cbd') || rd.id.startsWith('arena') || rd.id === 'east-link' || rd.id === 'beach-road'
          ? 'lamp_led'
          : rd.id.startsWith('estate')
            ? 'lamp_post'
            : 'lamp_cobra';
    let side = 1;
    for (let i = 0; i < rd.pts.length - 1; i++) {
      const [ax, az] = rd.pts[i]!;
      const [bx, bz] = rd.pts[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / len;
      const dz = (bz - az) / len;
      for (let s = 10; s < len - 6; s += kind === 'lamp_post' ? SPACING * 0.75 : SPACING) {
        side = kind === 'lamp_led_double' ? 0 : -side; // expressway: on the median
        const off = side === 0 ? 0 : side * (rd.width / 2 + (kind === 'lamp_post' ? 1.3 : 0.9));
        const x = ax + dx * s + dz * off;
        const z = az + dz * s - dx * off;
        if (stops.some((st) => Math.hypot(st.x - x, st.z - z) < 8)) continue;
        if (ROADS.some((o) => o !== rd && o.pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 10))) continue;
        // arm towards the road centre (perpendicular to the road)
        const inward = side === 0 ? 1 : -side;
        const ax2 = dz * inward;
        const az2 = -dx * inward;
        const rot = Math.atan2(ax2, az2);
        const y = heightAt(x, z);
        placements.push({ piece: kind, x, z, y, rotY: rot });
        for (const [along, up] of HEADS[kind]) {
          const hx = x + ax2 * along;
          const hz = z + az2 * along;
          heads.push({ x: hx, y: y + up, z: hz, ground: heightAt(hx, hz), dirX: ax2 * Math.sign(along || 1), dirZ: az2 * Math.sign(along || 1), kind });
        }
      }
    }
  }
  return { placements, heads };
}

const glowTex = (() => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

const REAL_RANGE = 60; // metres from the camera: real lights within, glow + pools beyond
const POOL_FROM = 40;

export function StreetLights() {
  const kit = useKit(LIGHTS_KIT_URL);
  const { placements, heads } = useMemo(planLamps, []);
  const halo = useRef<THREE.InstancedMesh>(null);
  const pool = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);

  // lens materials of the kit: lit by the clock
  const lenses = useMemo(() => {
    const out: { m: THREE.MeshStandardMaterial; c: THREE.Color }[] = [];
    const seen = new Set<THREE.Material>();
    for (const [name, piece] of kit)
      for (const lod of piece.lods)
        for (const p of lod) {
          const m = p.material as THREE.MeshStandardMaterial;
          if (!/_lens/.test(m.name) || seen.has(m)) continue;
          seen.add(m);
          out.push({ m, c: COLOR[name as Kind] ?? COLOR.lamp_cobra });
        }
    return out;
  }, [kit]);

  // the real lights: the fixed pool in world/LightRig (in the scene from the first frame, so the
  // light count never changes and no shader ever recompiles); this component only drives it
  const slotsRef = useRef<{ light: THREE.SpotLight; head: number; want: number; level: number }[]>([]);

  const { haloMat, poolMat, haloGeo, poolGeo } = useMemo(() => {
    const haloMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 });
    return { haloMat, poolMat, haloGeo: new THREE.PlaneGeometry(1, 1), poolGeo: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2) };
  }, []);
  const colours = useMemo(() => heads.map((h) => COLOR[h.kind]), [heads]);

  const _m = useMemo(() => new THREE.Matrix4(), []);
  const _q = useMemo(() => new THREE.Quaternion(), []);
  const _p = useMemo(() => new THREE.Vector3(), []);
  const _s = useMemo(() => new THREE.Vector3(), []);
  const _up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const st = useRef({ t: 1, assign: 1 });
  const dist = useMemo(() => new Float32Array(heads.length), [heads]);

  useFrame((state, rawDt) => {
    // the rig is made by world/LightRig (and remade on a tier change): follow it
    if (slotsRef.current.length !== rig.spots.length || slotsRef.current[0]?.light !== rig.spots[0]) slotsRef.current = rig.spots.map((light) => ({ light, head: -1, want: -1, level: 0 }));
    const slots = slotsRef.current;
    const dt = Math.min(rawDt, 0.1);
    const on = lightsOn(clock.hours);
    for (const { m, c } of lenses) {
      m.emissive.copy(c);
      m.emissiveIntensity = on * 2.6;
    }
    const cam = state.camera.position;
    const h = halo.current;
    const p = pool.current;
    if (!h || !p) return;
    const night = on > 0.02;
    h.visible = p.visible = night;
    // ---- real lights: assign the nearest heads (4x a second), fade in/out every frame ----
    const s0 = st.current;
    s0.assign += dt;
    if (night && s0.assign > 0.25) {
      s0.assign = 0;
      for (let i = 0; i < heads.length; i++) {
        const hd = heads[i]!;
        dist[i] = Math.hypot(hd.x - cam.x, hd.z - cam.z);
      }
      const best: number[] = [];
      for (let i = 0; i < heads.length; i++) {
        if (dist[i]! > REAL_RANGE) continue;
        best.push(i);
      }
      best.sort((a, b) => dist[a]! - dist[b]!);
      const want = new Set(best.slice(0, slots.length));
      // keep lights on heads that are still wanted; free the rest; hand free lights the new heads
      const taken = new Set<number>();
      for (const sl of slots) {
        if (sl.head >= 0 && want.has(sl.head)) {
          taken.add(sl.head);
          sl.want = sl.head;
        } else sl.want = -1;
      }
      const todo = [...want].filter((i) => !taken.has(i));
      for (const sl of slots) if (sl.want < 0 && todo.length) sl.want = todo.shift()!;
    }
    for (const sl of slots) {
      const l = sl.light;
      // fade out before moving to another lamp, then fade in there
      if (!night || sl.want !== sl.head) {
        sl.level = Math.max(0, sl.level - dt * 4);
        if (sl.level === 0) {
          sl.head = night ? sl.want : -1;
          if (sl.head >= 0) {
            const hd = heads[sl.head]!;
            l.position.set(hd.x, hd.y - 0.12, hd.z);
            // aimed down and a little out over the road (cobra/LED optics throw light forward)
            l.target.position.set(hd.x + hd.dirX * 2.2, hd.ground, hd.z + hd.dirZ * 2.2);
            l.target.updateMatrixWorld();
            l.color.copy(COLOR[hd.kind]);
            l.distance = hd.kind === 'lamp_post' ? 16 : 34;
            l.angle = hd.kind === 'lamp_post' ? 1.25 : 1.05;
          }
        }
      } else sl.level = Math.min(1, sl.level + dt * 3);
      const hd = sl.head >= 0 ? heads[sl.head] : undefined;
      // distance fade at the edge of the real-light range (no pop when the set changes)
      const edge = hd ? THREE.MathUtils.clamp((REAL_RANGE - Math.hypot(hd.x - cam.x, hd.z - cam.z)) / 15, 0, 1) : 0;
      l.intensity = hd ? CANDELA[hd.kind] * on * sl.level * edge : 0;
    }
    if (!night) return;
    // ---- glare sprites and far pools (refreshed ~10x a second; no allocation) ----
    s0.t += dt;
    if (s0.t < 0.1) return;
    s0.t = 0;
    haloMat.opacity = on * 0.75;
    poolMat.opacity = on * 0.32;
    _q.copy(state.camera.quaternion);
    for (let i = 0; i < heads.length; i++) {
      const hd = heads[i]!;
      const d = Math.hypot(hd.x - cam.x, hd.z - cam.z);
      // glare only where bloom on the lens can't carry it (far): small, never a giant disc
      const g = THREE.MathUtils.clamp((d - 25) / 40, 0, 1) * (hd.kind === 'lamp_post' ? 0.9 : 1.6);
      _p.set(hd.x, hd.y - 0.15, hd.z);
      _m.compose(_p, _q, _s.setScalar(Math.max(0.001, g)));
      h.setMatrixAt(i, _m);
      // ground pool under the head, along the road, only beyond the real lights
      const k = THREE.MathUtils.clamp((d - POOL_FROM) / 25, 0, 1);
      const r = hd.kind === 'lamp_post' ? 6 : 11;
      _p.set(hd.x + hd.dirX * 1.5, hd.ground + 0.05, hd.z + hd.dirZ * 1.5);
      const yaw = Math.atan2(hd.dirX, hd.dirZ);
      _m.compose(_p, _q.setFromAxisAngle(_up, yaw), _s.set(r * 1.25 * k + 0.001, 1, r * 0.95 * k + 0.001));
      p.setMatrixAt(i, _m);
      _q.copy(state.camera.quaternion);
    }
    h.instanceMatrix.needsUpdate = true;
    p.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={group}>
      <KitInstances kit={kit} placements={placements} reach={0.6} />
      <instancedMesh ref={halo} args={[haloGeo, haloMat, heads.length]} frustumCulled={false} renderOrder={3}
        onUpdate={(m) => colours.forEach((c, i) => m.setColorAt(i, c))} />
      <instancedMesh ref={pool} args={[poolGeo, poolMat, heads.length]} frustumCulled={false} renderOrder={2}
        onUpdate={(m) => colours.forEach((c, i) => m.setColorAt(i, c))} />
    </group>
  );
}
