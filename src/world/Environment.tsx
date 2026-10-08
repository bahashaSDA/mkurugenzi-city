import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import * as THREE from 'three';
import { useGame } from '../app/store';
import { BUDGETS } from '../perf/budgets';
import { playerPosition } from '../systems/player/playerState';
import { dayOfYear, sunDirection } from './sun';

// Phase 0: fixed golden-hour time (SPEC 12 intro). Phase 1 animates `hours` for the 24-minute day.
const HOURS = 16.75;

const _sun = new THREE.Vector3();
const DOY = dayOfYear(); // computed once; avoids a Date allocation per frame

export function Environment() {
  const light = useRef<THREE.DirectionalLight>(null);
  const tier = useGame((s) => s.tier);
  const budget = BUDGETS[tier];
  const scene = useThree((s) => s.scene);
  const sunPos = useMemo(() => sunDirection(HOURS, DOY, new THREE.Vector3()).toArray(), []);

  useEffect(() => {
    // Warm highland haze with a hint of red dust.
    scene.fog = new THREE.Fog('#c9b9a4', 120, tier === 'low' ? 450 : 700);
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
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.03;
  }, [budget]);

  useFrame(() => {
    const l = light.current;
    if (!l) return;
    // Shadow frustum follows the player (shadows only near the player, SPEC 10.6).
    sunDirection(HOURS, DOY, _sun);
    l.target.position.copy(playerPosition);
    l.position.copy(playerPosition).addScaledVector(_sun, 150);
    l.target.updateMatrixWorld();
  });

  return (
    <>
      <Sky sunPosition={sunPos as [number, number, number]} turbidity={6} rayleigh={1.4} mieCoefficient={0.006} mieDirectionalG={0.85} distance={4500} />
      <hemisphereLight args={['#bcd4ef', '#7a4a32', 0.9]} />
      <directionalLight ref={light} castShadow intensity={2.6} color="#ffe2b8" />
    </>
  );
}
