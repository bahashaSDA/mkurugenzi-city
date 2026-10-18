import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FILM } from '../perf/MapRender';
import { heightAt } from '../world/heights';
import { register } from './interactables';
import { availableMissions, currentStep, useMissionAction, useMissions } from './missions';
import { MissionSpawns } from './MissionSpawns';
import { drawIcon, MARK, missionIcon, type IconKind } from '../ui/icons';

// GTA-style mission markers in the world, in the same colour + shape system as the map
// (ui/icons MARK): GREEN rounded badge = a mission you can start, RED diamond = your active
// objective. Each marker is
//   - a ring on the ground at the exact spot (pulsing for the active objective)
//   - a light column: faint up close (it never hides the street), stronger far away so you can
//     find it across the city
//   - a floating badge with the mission's icon, kept a readable size at any distance
//   - the mission title, fading in as you walk up
// The badge and title are depth-tested: buildings hide them like any other object.

interface Marker {
  key: string;
  x: number;
  z: number;
  r: number;
  state: 'available' | 'objective';
  icon: IconKind;
  title: string;
  label?: string;
  side?: boolean;
  use?: () => void;
}

const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
const ringGeo = new THREE.RingGeometry(0.86, 1, 64);
const innerGeo = new THREE.RingGeometry(0.55, 0.62, 64);

const badgeCache = new Map<string, THREE.CanvasTexture>();
function badgeTexture(state: Marker['state'], icon: IconKind, side = false): THREE.CanvasTexture {
  const key = `${state}|${icon}|${side}`;
  const hit = badgeCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.translate(64, 64);
  g.shadowColor = 'rgba(0,0,0,0.5)';
  g.shadowBlur = 8;
  if (state === 'objective') {
    g.rotate(Math.PI / 4);
    g.fillStyle = MARK.active;
    g.fillRect(-36, -36, 72, 72);
    g.shadowBlur = 0;
    g.lineWidth = 5;
    g.strokeStyle = '#fff';
    g.strokeRect(-36, -36, 72, 72);
    g.rotate(-Math.PI / 4);
  } else {
    g.fillStyle = MARK.available;
    g.beginPath();
    if (side) g.arc(0, 0, 44, 0, Math.PI * 2);
    else g.roundRect(-44, -44, 88, 88, 16);
    g.fill();
    g.shadowBlur = 0;
    g.lineWidth = 5;
    g.strokeStyle = '#fff';
    g.stroke();
  }
  drawIcon(g, icon, 0, 0, 50, '#fff');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  badgeCache.set(key, t);
  return t;
}

function labelTexture(text: string): { tex: THREE.CanvasTexture; aspect: number } {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = '600 44px system-ui, sans-serif';
  const w = Math.ceil(g.measureText(text).width) + 48;
  c.width = w;
  c.height = 72;
  g.font = '600 44px system-ui, sans-serif';
  g.fillStyle = 'rgba(10,12,14,0.72)';
  g.beginPath();
  g.roundRect(0, 4, w, 64, 14);
  g.fill();
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, 37);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: w / 72 };
}

/** ?film cinematics: no mission beacons in the shot (the gameplay reel adds &markers) */
const HIDE_BEACONS = FILM && !new URLSearchParams(location.search).has('markers');

export function MissionWorld() {
  const active = useMissions((s) => s.active);
  const step = useMissions((s) => s.step);
  const completed = useMissions((s) => s.completed);

  const markers = useMemo<Marker[]>(() => {
    if (active) {
      const cur = currentStep();
      const at = cur?.step.at?.();
      if (!cur || !at) return [];
      return [{
        key: `obj-${active}-${step}`, x: at.x, z: at.z, r: Math.min(at.r, 6), state: 'objective',
        icon: missionIcon(cur.mission.chapter, cur.mission.title), title: cur.step.action ?? cur.mission.title,
        label: cur.step.action, use: cur.step.action ? useMissionAction : undefined,
      }];
    }
    return availableMissions().map((m) => {
      const p = m.start();
      return {
        key: `start-${m.id}`, x: p.x, z: p.z, r: 1.6, state: 'available', icon: missionIcon(m.chapter, m.title), title: m.title, side: m.side,
        label: `Start mission: ${m.title}`, use: () => useMissions.getState().begin(m.id),
      };
    });
    // completed changes the list of givers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step, completed]);

  useEffect(() => {
    const offs = markers
      .filter((m) => m.use && m.label)
      .map((m) => register({ id: `mission-${m.key}`, x: m.x, z: m.z, y: heightAt(m.x, m.z) + 0.9, radius: Math.max(2.5, m.r), label: m.label!, key: 'KeyE', priority: 2, use: m.use! }));
    return () => offs.forEach((f) => f());
  }, [markers]);

  return (
    <>
      {!HIDE_BEACONS && markers.map((m) => (
        <Beacon key={m.key} marker={m} />
      ))}
      <MissionSpawns />
    </>
  );
}

function Beacon({ marker }: { marker: Marker }) {
  const ring = useRef<THREE.Mesh>(null);
  const badge = useRef<THREE.Sprite>(null);
  const title = useRef<THREE.Sprite>(null);
  const y = useMemo(() => heightAt(marker.x, marker.z), [marker.x, marker.z]);
  const color = marker.state === 'objective' ? MARK.active : MARK.available;
  const mats = useMemo(() => {
    const lt = labelTexture(marker.title);
    return {
      beam: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
      ring: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
      inner: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
      badge: new THREE.SpriteMaterial({ map: badgeTexture(marker.state, marker.icon, marker.side), transparent: true, depthWrite: false, fog: false }),
      title: new THREE.SpriteMaterial({ map: lt.tex, transparent: true, depthWrite: false, opacity: 0, fog: false }),
      aspect: lt.aspect,
    };
  }, [color, marker.state, marker.icon, marker.side, marker.title]);
  useEffect(() => () => mats.title.map?.dispose(), [mats]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const cam = state.camera.position;
    const d = Math.hypot(cam.x - marker.x, cam.z - marker.z);
    const pulse = marker.state === 'objective' ? 0.1 * Math.sin(t * 4) : 0.04 * Math.sin(t * 2);
    if (ring.current) {
      const s = marker.r * (1 + pulse);
      ring.current.scale.set(s, s, s);
    }
    // column: faint near (doesn't hide the street), clearer far away
    mats.beam.opacity = THREE.MathUtils.clamp((d - 12) / 140, 0.04, 0.24) * (1 + pulse);
    // badge: readable at any distance, gently bobbing
    const size = THREE.MathUtils.clamp(d * 0.05, 1.1, 14);
    if (badge.current) {
      badge.current.scale.set(size, size, 1);
      badge.current.position.y = 2.6 + size * 0.5 + Math.sin(t * 2) * 0.12;
    }
    // title appears as you come close
    const near = THREE.MathUtils.clamp((32 - d) / 10, 0, 1);
    mats.title.opacity = near;
    if (title.current) {
      title.current.visible = near > 0.01;
      const h = 0.55;
      title.current.scale.set(h * mats.aspect, h, 1);
      title.current.position.y = 2.6 + size + 0.55;
    }
  });
  return (
    <group position={[marker.x, y, marker.z]}>
      <mesh geometry={beamGeo} material={mats.beam} scale={[marker.r * 0.45, 70, marker.r * 0.45]} position={[0, 35, 0]} renderOrder={5} />
      <mesh ref={ring} geometry={ringGeo} material={mats.ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} renderOrder={4} />
      <mesh geometry={innerGeo} material={mats.inner} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]} scale={[marker.r, marker.r, marker.r]} renderOrder={4} />
      <sprite ref={badge} material={mats.badge} renderOrder={6} />
      <sprite ref={title} material={mats.title} renderOrder={6} />
    </group>
  );
}
