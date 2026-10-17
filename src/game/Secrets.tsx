import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { register } from './interactables';
import { SECRETS, findSecret, secretSpot, useSecrets } from './collectibles';
import { surfaceAt } from '../world/roadSurface';
import { playerPosition } from '../systems/player/playerState';

// The Story Tapes in the world (game/collectibles): a cassette hovering over the ground, turning,
// its label glowing a little so it catches the eye at dusk. Drawn only within ~30 m of Abel.

const SHOW = 30;

function cassette(): THREE.Group {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.26, 0.06), new THREE.MeshStandardMaterial({ color: '#1b1b1f', roughness: 0.35, metalness: 0.1 }));
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.12),
    new THREE.MeshStandardMaterial({ color: '#c86bff', emissive: '#7a2fd0', emissiveIntensity: 0.9, roughness: 0.6 }),
  );
  label.position.set(0, 0.04, 0.031);
  const back = label.clone();
  back.position.z = -0.031;
  back.rotation.y = Math.PI;
  for (const x of [-0.08, 0.08]) {
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.065, 14), new THREE.MeshStandardMaterial({ color: '#e9e4d8', roughness: 0.5 }));
    reel.rotation.x = Math.PI / 2;
    reel.position.set(x, -0.05, 0);
    g.add(reel);
  }
  g.add(shell, label, back);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

export function Secrets() {
  const found = useSecrets((s) => s.found);
  const items = useMemo(
    () =>
      SECRETS.map((s) => {
        const p = secretSpot(s);
        return p ? { s, x: p.x, z: p.z, y: surfaceAt(p.x, p.z) + 0.7, obj: cassette() } : null;
      }).filter((v): v is NonNullable<typeof v> => !!v),
    [],
  );
  const group = useRef<THREE.Group>(null);

  useEffect(() => {
    const offs = items
      .filter((i) => !found.includes(i.s.id))
      .map((i) => register({ id: `secret-${i.s.id}`, x: i.x, z: i.z, y: i.y, radius: 1.6, key: 'KeyE', priority: 1, label: `Pick up the ${i.s.name}`, use: () => findSecret(i.s.id) }));
    return () => offs.forEach((f) => f());
  }, [items, found]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (const i of items) {
      const on = !found.includes(i.s.id) && Math.hypot(i.x - playerPosition.x, i.z - playerPosition.z) < SHOW;
      i.obj.visible = on;
      if (!on) continue;
      i.obj.position.set(i.x, i.y + Math.sin(t * 1.6) * 0.06, i.z);
      i.obj.rotation.y = t * 0.9;
    }
  });

  return (
    <group ref={group}>
      {items.map((i) => (
        <primitive key={i.s.id} object={i.obj} />
      ))}
    </group>
  );
}
