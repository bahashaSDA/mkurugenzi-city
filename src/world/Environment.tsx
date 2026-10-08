import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment as EnvMap, Sky } from '@react-three/drei';
import * as THREE from 'three';
import { useGame } from '../app/store';
import { BUDGETS } from '../perf/budgets';
import { playerPosition } from '../systems/player/playerState';
import { dayOfYear, sunDirection } from './sun';

// Lighting foundation (VISUAL_OVERHAUL V1):
//  * Image-based lighting from the same sky the player sees, plus a warm murram ground bounce.
//    Without it PBR metals (mabati) render black and shade goes black (VISUAL_AUDIT C1).
//  * One warm directional sun with tier-sized shadows that follow the player.
//  * Aerial-perspective fog in the horizon haze colour (dusty highland air).
// Phase 0/1: fixed golden-hour time; V9 animates HOURS for the 24-minute day.
const HOURS = 16.75;
const DOY = dayOfYear(); // computed once; avoids a Date allocation per frame
const HAZE = '#cfc7b8'; // horizon haze measured against reference skies (warm, slightly dusty)
const SKY = { turbidity: 7, rayleigh: 1.2, mieCoefficient: 0.006, mieDirectionalG: 0.82 } as const;

const _sun = new THREE.Vector3();

export function Environment() {
  const light = useRef<THREE.DirectionalLight>(null);
  const tier = useGame((s) => s.tier);
  const budget = BUDGETS[tier];
  const scene = useThree((s) => s.scene);
  const sunPos = useMemo(() => sunDirection(HOURS, DOY, new THREE.Vector3()).multiplyScalar(100).toArray(), []);

  useEffect(() => {
    scene.fog = new THREE.Fog(HAZE, 70, tier === 'low' ? 380 : 650);
    return () => {
      scene.fog = null;
    };
  }, [scene, tier]);

  useEffect(() => {
    const l = light.current;
    if (!l) return;
    const d = budget.shadowDistance;
    const cam = l.shadow.camera;
    cam.left = -d;
    cam.right = d;
    cam.top = d;
    cam.bottom = -d;
    cam.near = 1;
    cam.far = 400;
    cam.updateProjectionMatrix();
    l.shadow.mapSize.set(budget.shadowMapSize, budget.shadowMapSize);
    l.shadow.map?.dispose();
    l.shadow.map = null;
    l.shadow.bias = -0.0003;
    l.shadow.normalBias = 0.04;
  }, [budget]);

  useFrame(() => {
    const l = light.current;
    if (!l) return;
    // Shadow frustum follows the player, snapped to shadow texels to stop edge shimmer.
    sunDirection(HOURS, DOY, _sun);
    const texel = (budget.shadowDistance * 2) / budget.shadowMapSize;
    const sx = Math.round(playerPosition.x / texel) * texel;
    const sz = Math.round(playerPosition.z / texel) * texel;
    l.target.position.set(sx, 0, sz);
    l.position.set(sx + _sun.x * 150, _sun.y * 150, sz + _sun.z * 150);
    l.target.updateMatrixWorld();
  });

  return (
    <>
      <Sky sunPosition={sunPos as [number, number, number]} {...SKY} distance={4500} />
      {/* IBL: rendered once into a small cube map; re-rendered when the time of day changes (V9). */}
      <EnvMap resolution={tier === 'low' ? 32 : 64} frames={1} environmentIntensity={0.85} near={1} far={1000}>
        <Sky sunPosition={sunPos as [number, number, number]} {...SKY} distance={450} />
        {/* lower hemisphere: sunlit murram bounces warm light up into shade */}
        <mesh scale={400}>
          <sphereGeometry args={[1, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
          <meshBasicMaterial color="#9a8467" side={THREE.BackSide} />
        </mesh>
      </EnvMap>
      <directionalLight ref={light} castShadow intensity={2.4} color="#ffdcae" />
    </>
  );
}
