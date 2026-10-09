import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { onKeyPress } from '../systems/input';
import { cutsceneNow, useCutscene } from './cutscene';

const _p = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const ease = (t: number) => t * t * (3 - 2 * t);

/** Drives the camera through the active cutscene's shots (Player leaves the camera alone). */
export function CutsceneCamera() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const skip = () => useCutscene.getState().active && useCutscene.getState().skip();
    const offs = [onKeyPress('Space', skip), onKeyPress('Enter', skip)];
    return () => offs.forEach((f) => f());
  }, []);
  useFrame(() => {
    const now = cutsceneNow();
    if (!now) return;
    const { shot, t } = now;
    const k = ease(t);
    _a.fromArray(shot.from);
    _b.fromArray(shot.to);
    _p.lerpVectors(_a, _b, k);
    camera.position.copy(_p);
    _a.fromArray(shot.lookFrom);
    _b.fromArray(shot.lookTo);
    camera.lookAt(_p.lerpVectors(_a, _b, k));
  });
  return null;
}
