import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGame } from '../app/store';
import { perfStats } from './PerfMonitor';

// SPEC 10.12: `?benchmark` flies a fixed camera path and logs average and 1% low FPS.

export const benchmark = {
  enabled: typeof location !== 'undefined' && new URLSearchParams(location.search).has('benchmark'),
  running: false,
};

const WARMUP_S = 3;
const DURATION_S = 30;
const MAX_SAMPLES = 20000;
const samples = new Float32Array(MAX_SAMPLES);
const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();

export interface BenchmarkResult {
  tier: string;
  dpr: number;
  gpu: string;
  frames: number;
  avgFps: number;
  low1Fps: number;
  worstFrameMs: number;
  hitches: number;
  maxCalls: number;
  maxTris: number;
  userAgent: string;
  date: string;
}

/** Fixed path: a low street-level loop round the spawn, then a high orbit. */
function pathAt(t: number, pos: THREE.Vector3, look: THREE.Vector3) {
  const k = t / DURATION_S;
  if (k < 0.5) {
    const a = k * 2 * Math.PI * 2;
    pos.set(Math.sin(a) * 35, 1.8, Math.cos(a) * 35 - 10);
    look.set(Math.sin(a + 0.6) * 35, 1.6, Math.cos(a + 0.6) * 35 - 10);
  } else {
    const a = (k - 0.5) * 2 * Math.PI * 2;
    pos.set(Math.sin(a) * 120, 45, Math.cos(a) * 120 - 20);
    look.set(0, 0, -20);
  }
}

export function Benchmark({ onDone }: { onDone: (r: BenchmarkResult) => void }) {
  const camera = useThree((s) => s.camera);
  const st = useRef({ t: 0, n: 0, maxCalls: 0, maxTris: 0, hitchStart: 0, done: false });

  useFrame((_, dt) => {
    const s = st.current;
    if (s.done) return;
    if (s.t === 0) {
      benchmark.running = true;
      s.hitchStart = perfStats.hitches;
    }
    s.t += dt;
    const t = Math.max(0, s.t - WARMUP_S);
    pathAt(Math.min(t, DURATION_S), _pos, _look);
    camera.position.copy(_pos);
    camera.lookAt(_look);
    if (s.t < WARMUP_S) return;

    if (s.n < MAX_SAMPLES) samples[s.n++] = dt * 1000;
    s.maxCalls = Math.max(s.maxCalls, perfStats.calls);
    s.maxTris = Math.max(s.maxTris, perfStats.tris);

    if (t >= DURATION_S) {
      s.done = true;
      benchmark.running = false;
      const arr = Array.from(samples.subarray(0, s.n)).sort((a, b) => b - a);
      const total = arr.reduce((a, b) => a + b, 0);
      const worstCount = Math.max(1, Math.floor(arr.length * 0.01));
      const worstAvg = arr.slice(0, worstCount).reduce((a, b) => a + b, 0) / worstCount;
      const g = useGame.getState();
      const result: BenchmarkResult = {
        tier: g.tier,
        dpr: g.dpr,
        gpu: g.gpu,
        frames: s.n,
        avgFps: +(1000 / (total / s.n)).toFixed(1),
        low1Fps: +(1000 / worstAvg).toFixed(1),
        worstFrameMs: +(arr[0] ?? 0).toFixed(1),
        hitches: perfStats.hitches - s.hitchStart,
        maxCalls: s.maxCalls,
        maxTris: s.maxTris,
        userAgent: navigator.userAgent,
        date: new Date().toISOString(),
      };
      console.log('[benchmark]', JSON.stringify(result));
      (window as unknown as { __benchmark: BenchmarkResult }).__benchmark = result;
      onDone(result);
    }
  });
  return null;
}
