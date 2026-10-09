import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { heightAt } from '../world/heights';
import { register } from './interactables';
import { availableMissions, currentStep, useMissionAction, useMissions } from './missions';

// GTA-style mission markers: a tall glowing beam (visible from far) and a pulsing ring on the
// ground at each mission giver, and at the current objective while a mission is running.

interface Marker {
  key: string;
  x: number;
  z: number;
  r: number;
  color: string;
  label?: string;
  use?: () => void;
}

const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
const ringGeo = new THREE.RingGeometry(0.85, 1, 48);

export function MissionWorld() {
  const active = useMissions((s) => s.active);
  const step = useMissions((s) => s.step);
  const completed = useMissions((s) => s.completed);

  const markers = useMemo<Marker[]>(() => {
    if (active) {
      const cur = currentStep();
      const at = cur?.step.at?.();
      if (!cur || !at) return [];
      return [{ key: `obj-${active}-${step}`, x: at.x, z: at.z, r: Math.min(at.r, 6), color: '#ffd23c', label: cur.step.action, use: cur.step.action ? useMissionAction : undefined }];
    }
    return availableMissions().map((m) => {
      const p = m.start();
      return { key: `start-${m.id}`, x: p.x, z: p.z, r: 1.6, color: '#ffc72c', label: `Start mission: ${m.title}`, use: () => useMissions.getState().begin(m.id) };
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
      {markers.map((m) => (
        <Beacon key={m.key} marker={m} />
      ))}
    </>
  );
}

function Beacon({ marker }: { marker: Marker }) {
  const ring = useRef<THREE.Mesh>(null);
  const y = useMemo(() => heightAt(marker.x, marker.z), [marker.x, marker.z]);
  const mats = useMemo(
    () => ({
      beam: new THREE.MeshBasicMaterial({ color: marker.color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
      ring: new THREE.MeshBasicMaterial({ color: marker.color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }),
    }),
    [marker.color],
  );
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ring.current) {
      const s = marker.r * (0.92 + 0.08 * Math.sin(t * 3));
      ring.current.scale.set(s, s, s);
    }
    mats.beam.opacity = 0.16 + 0.06 * Math.sin(t * 2);
  });
  return (
    <group position={[marker.x, y, marker.z]}>
      <mesh geometry={beamGeo} material={mats.beam} scale={[marker.r * 0.5, 60, marker.r * 0.5]} position={[0, 30, 0]} renderOrder={5} />
      <mesh ref={ring} geometry={ringGeo} material={mats.ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]} />
    </group>
  );
}
