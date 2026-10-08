import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { useGame } from './store';
import { Environment } from '../world/Environment';
import { StreamedCell, WorldStreamer } from '../world/streaming';
import { TestMap } from '../districts/testmap/TestMap';
import { SpawnLetters } from '../districts/hub/SpawnLetters';
import { Player } from '../systems/player/Player';
import { attachInput } from '../systems/input';
import { PerfMonitor, PerfOverlay, perfStats } from '../perf/PerfMonitor';
import { playerPosition } from '../systems/player/playerState';
import { Benchmark, benchmark, type BenchmarkResult } from '../perf/Benchmark';
import { Hud } from '../ui/Hud';
import { TouchControls } from '../ui/TouchControls';

const params = new URLSearchParams(location.search);
const showPerf = import.meta.env.DEV || params.has('perf');
if (params.has('debug')) {
  // Read-only handles for automated tests and console debugging.
  (window as unknown as { __mk: object }).__mk = { playerPosition, perfStats, useGame };
}

function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => onReady(), [onReady]);
  return null;
}

export default function Game({ onReady }: { onReady: () => void }) {
  const dpr = useGame((s) => s.dpr);
  const tier = useGame((s) => s.tier);
  const phase = useGame((s) => s.phase);
  const isTouch = useGame((s) => s.isTouch);
  const [bench, setBench] = useState<BenchmarkResult | null>(null);

  return (
    <div className="game-root">
      <Canvas
        dpr={dpr}
        shadows={{ type: THREE.PCFSoftShadowMap }}
        camera={{ fov: 62, near: 0.1, far: 2500, position: [0, 3, 14] }}
        gl={{ antialias: tier !== 'low', powerPreference: 'high-performance', stencil: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.AgXToneMapping;
          gl.toneMappingExposure = 1.05;
          attachInput(gl.domElement);
        }}
      >
        <Suspense fallback={null}>
          <Environment />
          <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} paused={phase !== 'playing'}>
            <TestMap />
            {/* The letters sit in the spawn cell; they unmount when it streams out. */}
            <StreamedCell x={0} z={0}>
              {/* Own boundary: streamed-in content must never suspend the whole scene. */}
              <Suspense fallback={null}>
                <SpawnLetters />
              </Suspense>
            </StreamedCell>
            <Player />
          </Physics>
          <WorldStreamer />
          <PerfMonitor />
          {benchmark.enabled && phase === 'playing' && !bench && <Benchmark onDone={setBench} />}
          <Ready onReady={onReady} />
        </Suspense>
      </Canvas>
      {phase === 'playing' && <Hud />}
      {phase === 'playing' && isTouch && <TouchControls />}
      {showPerf && <PerfOverlay />}
      {bench && (
        <div className="bench-result">
          <strong>Benchmark</strong>
          <pre>{JSON.stringify(bench, null, 2)}</pre>
          <button onClick={() => navigator.clipboard?.writeText(JSON.stringify(bench))}>Copy</button>
        </div>
      )}
    </div>
  );
}
