import { Suspense, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { useGame } from './store';
import { Environment } from '../world/Environment';
import { StreamedCell, WorldStreamer } from '../world/streaming';
import { TEST_COURSE, TestMap } from '../districts/testmap/TestMap';
import { Terrain } from '../world/Terrain';
import { Avenue } from '../world/Roads';
import { PostFX } from '../world/PostFX';
import { SpawnLetters } from '../districts/hub/SpawnLetters';
import { Hub } from '../districts/hub/Hub';
import { Pedestrians } from '../systems/npc/Pedestrians';
import { Player } from '../systems/player/Player';
import { attachInput } from '../systems/input';
import { PerfMonitor, PerfOverlay, perfStats } from '../perf/PerfMonitor';
import { playerPosition } from '../systems/player/playerState';
import { Benchmark, benchmark, type BenchmarkResult } from '../perf/Benchmark';
import { Hud } from '../ui/Hud';
import { isAvailable, loadContent } from '../content/episodes';
import { TouchControls } from '../ui/TouchControls';

const params = new URLSearchParams(location.search);
const showPerf = import.meta.env.DEV || params.has('perf');
// Dev/test aid: ?minimal keeps every collider but skips district rendering, so physics tests
// run fast under software GL.
const minimal = params.has('minimal');
if (params.has('debug')) {
  // Read-only handles for automated tests and console debugging.
  (window as unknown as { __mk: object }).__mk = { playerPosition, perfStats, useGame, content: { loadContent, isAvailable } };
}

/** ?debug: expose the live scene/renderer for profiling from tests and the console. */
function DebugHandles() {
  const scene = useThree((st) => st.scene);
  const gl = useThree((st) => st.gl);
  useEffect(() => {
    const mk = (window as unknown as { __mk?: Record<string, unknown> }).__mk;
    if (mk) Object.assign(mk, { scene, gl, THREE });
  }, [scene, gl]);
  return null;
}

function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => onReady(), [onReady]);
  return null;
}

export default function Game({ onReady }: { onReady: () => void }) {
  const dpr = useGame((s) => s.dpr);
  const phase = useGame((s) => s.phase);
  const isTouch = useGame((s) => s.isTouch);
  const [bench, setBench] = useState<BenchmarkResult | null>(null);

  return (
    <div className="game-root">
      <Canvas
        dpr={dpr}
        shadows={{ type: THREE.PCFShadowMap }}
        camera={{ fov: 62, near: 0.1, far: 2500, position: [0, 3, 14] }}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.AgXToneMapping;
          gl.toneMappingExposure = 1.05;
          attachInput(gl.domElement);
        }}
      >
        <Suspense fallback={null}>
          <Environment />
          <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} paused={phase !== 'playing'}>
            <Terrain />
            <Avenue />
            {TEST_COURSE && <TestMap />}
            <Hub render={!minimal} />
            {/* The letters sit in the spawn cell; they unmount when it streams out. */}
            <StreamedCell x={0} z={0}>
              {/* Own boundary: streamed-in content must never suspend the whole scene. */}
              <Suspense fallback={null}>
                <SpawnLetters />
              </Suspense>
            </StreamedCell>
            <Player />
            {!minimal && (
              <Suspense fallback={null}>
                <Pedestrians />
              </Suspense>
            )}
          </Physics>
          <WorldStreamer />
          <PerfMonitor />
          <PostFX />
          {benchmark.enabled && phase === 'playing' && !bench && <Benchmark onDone={setBench} />}
          {params.has('debug') && <DebugHandles />}
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
