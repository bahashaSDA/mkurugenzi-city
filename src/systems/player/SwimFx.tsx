import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { diving, playerPosition, playerView } from './playerState';
import { abelBones, playerAnim } from './AbelModel';

// The water around a swimmer: spray thrown up where each hand enters the water on the crawl, and
// foam rings spreading on the surface (a trail behind him swimming, small ripples treading water).
// Two draw calls, pooled, nothing allocated per frame; always in the scene (compiled while loading).

const DROPS = 96;
const RINGS = 14;

function sprayTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

function ringTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,0)');
  r.addColorStop(0.55, 'rgba(255,255,255,0.15)');
  r.addColorStop(0.8, 'rgba(255,255,255,0.75)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  // broken foam: knock holes in the ring
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 70; i++) {
    g.beginPath();
    g.arc(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 5, 0, Math.PI * 2);
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}

const _h = new THREE.Vector3();

export function SwimFx() {
  const fx = useMemo(() => {
    const pos = new Float32Array(DROPS * 3).fill(-1e4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const spray = new THREE.Points(g, new THREE.PointsMaterial({ map: sprayTexture(), color: '#eef8ff', size: 0.09, transparent: true, opacity: 0.85, depthWrite: false }));
    spray.frustumCulled = false;
    const ringMat = new THREE.MeshBasicMaterial({ map: ringTexture(), color: '#f4fbff', transparent: true, depthWrite: false, opacity: 1 });
    const rings = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), ringMat, RINGS);
    rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    rings.frustumCulled = false;
    rings.count = 0;
    const ring = Array.from({ length: RINGS }, () => ({ x: 0, y: 0, z: 0, age: 1e9, life: 1, grow: 1, size: 0.5 }));
    return {
      spray, pos, vel: new Float32Array(DROPS * 3), life: new Float32Array(DROPS), next: 0,
      rings, ring, nextRing: 0, ringAcc: 0, handY: [0, 0], m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3(),
    };
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const swimming = diving.swimming && !diving.under;
    const surf = diving.surface;
    const moving = playerAnim.speed > 0.45;
    if (swimming) {
      // spray: a hand dropping through the surface on the crawl throws water up and forward
      if (moving) {
        [abelBones.handL, abelBones.handR].forEach((hb, k) => {
          if (!hb) return;
          hb.getWorldPosition(_h);
          const prev = fx.handY[k]!;
          fx.handY[k] = _h.y;
          if (prev > surf + 0.02 && _h.y <= surf + 0.02) {
            for (let n = 0; n < 9; n++) {
              const i = fx.next;
              fx.next = (fx.next + 1) % DROPS;
              fx.pos.set([_h.x + (Math.random() - 0.5) * 0.2, surf + 0.03, _h.z + (Math.random() - 0.5) * 0.2], i * 3);
              const f = playerView.facing;
              fx.vel.set([Math.sin(f) * 0.6 + (Math.random() - 0.5) * 1.2, 1.4 + Math.random() * 1.6, Math.cos(f) * 0.6 + (Math.random() - 0.5) * 1.2], i * 3);
              fx.life[i] = 1;
            }
          }
        });
      }
      // foam: a trail of rings behind him swimming, slow ripples treading water
      fx.ringAcc += dt * (moving ? 4.5 : 0.9);
      while (fx.ringAcc >= 1) {
        fx.ringAcc -= 1;
        const r = fx.ring[fx.nextRing]!;
        fx.nextRing = (fx.nextRing + 1) % RINGS;
        const f = playerView.facing;
        const back = moving ? -0.3 : 0;
        r.x = playerPosition.x + Math.sin(f) * back + (Math.random() - 0.5) * 0.25;
        r.z = playerPosition.z + Math.cos(f) * back + (Math.random() - 0.5) * 0.25;
        r.y = surf + 0.02;
        r.age = 0;
        r.life = moving ? 1.6 : 2.6;
        r.grow = moving ? 1.6 : 0.8;
        r.size = moving ? 0.9 : 0.7;
      }
    }
    // drops fly and fall back into the sea
    for (let i = 0; i < DROPS; i++) {
      if (fx.life[i]! <= 0) continue;
      fx.vel[i * 3 + 1]! -= 9.8 * dt;
      fx.pos[i * 3]! += fx.vel[i * 3]! * dt;
      fx.pos[i * 3 + 1]! += fx.vel[i * 3 + 1]! * dt;
      fx.pos[i * 3 + 2]! += fx.vel[i * 3 + 2]! * dt;
      if (fx.pos[i * 3 + 1]! < surf - 0.05) {
        fx.life[i] = 0;
        fx.pos[i * 3 + 1] = -1e4;
      }
    }
    fx.spray.geometry.attributes.position!.needsUpdate = true;
    // rings spread and fade (opacity rides on the scale: an old ring is wide and thin)
    let n = 0;
    for (const r of fx.ring) {
      if (r.age >= r.life) continue;
      r.age += dt;
      const k = r.age / r.life;
      const size = r.size + r.grow * k * 2.2;
      fx.p.set(r.x, r.y, r.z);
      fx.s.set(size, 1, size);
      fx.m.compose(fx.p, fx.q, fx.s);
      fx.rings.setMatrixAt(n++, fx.m);
    }
    fx.rings.count = n;
    fx.rings.instanceMatrix.needsUpdate = true;
    (fx.rings.material as THREE.MeshBasicMaterial).opacity = swimming ? 0.55 : Math.max(0, (fx.rings.material as THREE.MeshBasicMaterial).opacity - dt);
  });
  return (
    <>
      <primitive object={fx.spray} />
      <primitive object={fx.rings} />
    </>
  );
}
