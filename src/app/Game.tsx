import { Suspense, memo, useEffect, useState, type ReactNode } from 'react';
import { ColliderStreaming } from '../systems/colliderStreaming';
import { LITE_DPR, LITE_KEY, lite, setLite } from '../perf/lite';
import '../perf/skipHidden'; // hidden objects skip their per-frame matrix update
import { prefetchModels } from '../systems/characterModels';
import { Canvas, useThree } from '@react-three/fiber';
import { Physics, useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { ride, vehicles } from '../systems/vehicles/state';
import { Driving } from '../systems/driving/Driving';
import { occ } from '../systems/vehicles/occupancy';
import { bike, useBodas } from '../systems/driving/Bike';
import { radio, useRadio } from '../systems/audio/radio';
import { MissionWorld } from '../game/MissionWorld';
import { Interiors } from '../systems/interiors/Interiors';
import { drive, useParking } from '../systems/driving/state';
import { usePrompt } from '../game/interactables';
import { useEconomy } from '../game/economy';
import { useMissions } from '../game/missions';
import { useGame } from './store';
import { Environment } from '../world/Environment';
import { StreamedCell, WorldStreamer } from '../world/streaming';
import { TEST_COURSE, TestMap } from '../districts/testmap/TestMap';
import { Terrain, terrainShown } from '../world/Terrain';
import { RoadNetwork } from '../world/Roads';
import { PostFX } from '../world/PostFX';
import { StreetLights } from '../world/StreetLights';
import { VehicleLights } from '../systems/vehicles/VehicleLights';
import { SpawnLetters } from '../districts/hub/SpawnLetters';
import { Hub } from '../districts/hub/Hub';
import { Pedestrians } from '../systems/npc/Pedestrians';
import { doorOf, Vehicles } from '../systems/vehicles/Vehicles';
import { Player, camOverride } from '../systems/player/Player';
import { playerIK } from '../systems/player/ik';
import { attachInput } from '../systems/input';
import { PerfMonitor, PerfOverlay, perfStats } from '../perf/PerfMonitor';
import { playerPosition, teleport } from '../systems/player/playerState';
import { useNav } from '../game/navigation';
import { Benchmark, benchmark, type BenchmarkResult } from '../perf/Benchmark';
import { Hud } from '../ui/Hud';
import { GameUI } from '../ui/GameUI';
import { HealthUI } from '../ui/HealthUI';
import { Ocean } from '../world/Ocean';
import { CutsceneCamera } from '../game/CutsceneCamera';
import { CombatDirector, StreetBrawlers } from '../systems/combat/CombatDirector';
import { Theatre } from '../districts/theatre/Theatre';
import { BeachWhenNear } from '../districts/beach/Beach';
import { GameLogic } from '../game/GameLogic';
import { isAvailable, loadContent } from '../content/episodes';
import { TouchControls } from '../ui/TouchControls';
import { useCutscene } from '../game/cutscene';
import { useHealth } from '../game/health';
import { seat, useTheatre } from '../game/theatre';
import { combatants, playerAttack } from '../systems/combat/combat';
import { playerAnim } from '../systems/player/AbelModel';
import { clock } from '../world/clock';
import { heightAt } from '../world/heights';
import { CityAudio } from '../systems/audio/CityAudio';
import { MAPRENDER, MapRenderCamera } from '../perf/MapRender';
import { ShaderWarmup } from '../perf/ShaderWarmup';
import { compileAll } from '../perf/compileAll';
import { BUDGETS } from '../perf/budgets';
import { LEARNED_KEY, tierInfo } from '../perf/tiers';
import { LightRig } from '../world/LightRig';
import { recordMix } from '../systems/audio/mixer';
import { missingVoice, say, speakerFor } from '../systems/audio/voice';
import { MISSIONS } from '../game/missions';
import { surfaceAt } from '../world/roadSurface';
import { ROADS } from '../config/roads';
import { TyreFx } from '../systems/driving/TyreFx';
import { TrafficLights } from '../world/TrafficLights';
import { Weather } from '../world/WeatherFx';
import { setWeather, weather } from '../world/weather';
import { junctions, lightAt } from '../world/junctions';
import { Secrets } from '../game/Secrets';
import { Bubbles } from '../systems/player/Bubbles';
import { diving } from '../systems/player/playerState';
import { useSecrets, findSecret, SECRETS, secretSpot } from '../game/collectibles';
import { stations } from '../game/stations';
import { bindKey, resetKeys } from '../systems/input';
import { useService } from '../systems/driving/state';
import { tyreFxStats } from '../systems/driving/tyreMarks';
import { useWardrobe } from '../game/wardrobe';
import { seatingDebug } from '../game/seating';
import { useStories } from '../systems/audio/stories';
import { abelLook } from '../systems/player/AbelModel';
import { audioContext } from '../systems/audio/music';
import { Attendants } from '../systems/npc/Attendants';
import { StagePassengers, passengerStats } from '../systems/npc/StagePassengers';

const params = new URLSearchParams(location.search);
const showPerf = import.meta.env.DEV || params.has('perf');
// Dev/test aid: ?minimal keeps every collider but skips district rendering, so physics tests
// run fast under software GL.
const minimal = params.has('minimal');
if (params.has('debug')) {
  // Read-only handles for automated tests and console debugging.
  (window as unknown as { __mk: object }).__mk = {
    playerPosition, perfStats, useGame, content: { loadContent, isAvailable }, ride, vehicles, usePrompt, useEconomy, drive, useParking, useMissions,
    useCutscene, useHealth, useTheatre, seat, combatants, playerAttack, playerAnim, clock, occ, bike, camOverride, playerIK, useBodas, useRadio, radio, teleport, useNav, doorOf, recordMix, audioContext, sayLine: say, missingVoice, speakerFor, MISSIONS, heightAt, surfaceAt, ROADS, tyreFxStats, useWardrobe, abelLook, seatingDebug, useStories, useSecrets, findSecret, passengerStats, diving, weather, setWeather, junctions, lightAt, stations, bindKey, resetKeys, useService, secretSpots: () => SECRETS.map((s) => ({ id: s.id, ...secretSpot(s) })),
  };
}

/** ?debug: expose the live scene/renderer for profiling from tests and the console. */
function DebugHandles() {
  const scene = useThree((st) => st.scene);
  const gl = useThree((st) => st.gl);
  const get = useThree((st) => st.get);
  useEffect(() => {
    const mk = (window as unknown as { __mk?: Record<string, unknown> }).__mk;
    if (mk) Object.assign(mk, { scene, gl, THREE, cameraRef: { get current() { return get().camera; } } });
  }, [scene, gl, get]);
  return null;
}

/**
 * Everything has loaded: before saying so, prime the world behind the splash so nothing compiles
 * after "Tap to enter":
 *   1. compile every shader in the background (KHR_parallel_shader_compile)
 *   2. draw a few frames (still under the splash): the sky's reflection map, shadow maps and the
 *      light pool are made on the first frames, and they change every material's shader variant
 *   3. compile again (the new variants), then ready
 * Capped at 40 s: a slow driver must never hold the splash forever.
 */
let primedOnce = false;
function Ready({ onReady }: { onReady: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const advance = useThree((s) => s.advance);
  const clock = useThree((s) => s.clock);
  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onReady();
    };
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
    // one frame drawn by hand. advance() takes the time in SECONDS and turns it into the frame's
    // delta: it was given milliseconds, so every priming frame told the game ~16 s had passed (the
    // animations, crowds and traffic caught up on all of it: 46 ms of CPU a frame, which made the
    // loading measurement drop a PC that plays at 58 fps into lite). Capped like play (FrameClamp).
    const tick = () => {
      const now = performance.now() / 1000;
      if (now - clock.elapsedTime > MAX_FRAME_S) clock.elapsedTime = now - 1 / 60;
      advance(now);
    };
    // once per page load, and never once playing (a remount in play must not re-measure or change
    // the tier: that dropped a smooth game to low mid-play)
    if (primedOnce || useGame.getState().phase === 'playing') {
      finish();
      return;
    }
    (async () => {
      performance.mark('mk:ready:start');
      await quiet();
      performance.mark('mk:ready:quiet');
      await prime();
      // the right quality BEFORE play: time real frames; too slow for this tier: step down (the
      // world rebuilds for the new tier) and prime again, all behind the splash. A tier change in
      // play rebuilt everything mid-game (a 9 s freeze measured on a PC rated "high" running 10 fps)
      for (let tries = 0; tries < 2 && !done; tries++) {
        const g = useGame.getState();
        if (g.quality !== 'auto' || g.tier === 'low' || tierInfo.learned) {
          performance.mark('mk:ready:skipmeasure', { detail: { q: g.quality, tier: g.tier, learned: tierInfo.learned } });
          break;
        } // a learned tier is trusted
        const ms = await timeFrames();
        performance.mark('mk:ready:measured', { detail: { ms, tier: g.tier } });
        // clearly too slow only (high ~100 ms here: down; mid ~33 ms: a steady 30 fps, kept)
        if (ms <= 1000 / (BUDGETS[g.tier].targetFps * 0.55)) break;
        g.setTier(g.tier === 'high' ? 'mid' : 'low');
        // the new tier re-suspends the world (the terrain rebuilds its heights): wait until it is
        // really back on screen, or the priming ran over a hidden half-built world and the real one
        // compiled its shaders in play
        const t0 = performance.now();
        while (!done && terrainShown.tier !== useGame.getState().tier && performance.now() - t0 < 20000) await frame();
        for (let k = 0; k < 3; k++) await frame();
        await prime();
      }
      // still too slow on low (weak phones, big screens on integrated GPUs): lite, behind the splash
      // too (no rebuild, no recompile: perf/lite), remembered for this device
      {
        const g = useGame.getState();
        if (!done && g.quality === 'auto' && g.tier === 'low' && !lite.on && !tierInfo.learned) {
          const ms = await timeFrames();
          performance.mark('mk:ready:measured', { detail: { ms, tier: 'low' } });
          if (ms > 1000 / (BUDGETS.low.targetFps * 0.55)) {
            setLite(true);
            const d = Math.min(g.dpr, LITE_DPR);
            g.setDpr(d);
            for (let k = 0; k < 3; k++) await frame(); // the canvas resizes
            for (let k = 0; k < 4; k++) {
              tick(); // a few frames at the new size (same shaders: nothing to compile)
              await frame();
            }
            try {
              localStorage.setItem(LITE_KEY, '1');
            } catch {
              /* storage blocked */
            }
          }
        }
      }
      performance.mark('mk:ready:primed', { detail: { lite: lite.on } });
      tick();
      await frame();
      if (!done) {
        primedOnce = true;
        try {
          if (useGame.getState().quality === 'auto') localStorage.setItem(LEARNED_KEY, useGame.getState().tier);
        } catch {
          /* storage blocked */
        }
      }
      finish();
    })();
    /** Average time of real frames back to back, as in play (frames overlap on the GPU; one read at
     *  the end waits for the last). A read after EVERY frame stalled the pipeline and doubled the
     *  figure: a PC that plays mid at a steady 30 fps measured 75-90 ms and was dropped to low. */
    async function timeFrames() {
      const ctx = gl.getContext();
      const px = new Uint8Array(4);
      for (let k = 0; k < 3; k++) {
        tick(); // warm-up: first draws still upload textures
        await frame();
      }
      const n = 10;
      const t = performance.now();
      let cpu = 0;
      for (let k = 0; k < n; k++) {
        const c = performance.now();
        tick();
        cpu += performance.now() - c;
        await frame();
      }
      ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
      performance.mark('mk:ready:frames', { detail: { cpu: cpu / n } });
      return (performance.now() - t) / n;
    }
    /** Wait until the downloads stop (late pieces still mounting would be primed too late and
     *  compile in play, and they made the tier check measure loading work, not the game). */
    async function quiet() {
      const loads = () =>
        performance
          .getEntriesByType('resource')
          .filter((e) => !/video|audio/.test((e as PerformanceResourceTiming).initiatorType)).length;
      const t0 = performance.now();
      let n = loads();
      let still = performance.now();
      while (!done && performance.now() - t0 < 8000) {
        await new Promise((r) => setTimeout(r, 150));
        const m = loads();
        if (m !== n) {
          n = m;
          still = performance.now();
        } else if (performance.now() - still > 1000) break;
      }
      for (let k = 0; k < 3; k++) await frame(); // what just loaded mounts
    }
    async function prime() {
      await compileAll(gl, scene, camera);
      performance.mark('mk:ready:compiled');
      // one ordinary frame first (it makes the sky's reflection map and the shadow maps, which
      // change every material's variant), then one real frame through the real pipeline with
      // EVERYTHING drawn: hidden objects shown and nothing culled, so every shader variant the game
      // will use is compiled now, behind the splash (the first frame in play used to compile ~50)
      tick();
      await frame();
      // twice: three draws the shadow maps with the PREVIOUS frame's light setup, so right after a
      // tier change (a different light pool) the first full frame compiled the shadow shaders for
      // the old light count, and the real ones compiled on the first frame in play (~0.8 s freeze)
      for (let pass = 0; pass < 2 && !done; pass++) {
        const restore: (() => void)[] = [];
        scene.traverse((o) => {
          if ((o as THREE.Light).isLight) return;
          if (!o.visible) {
            o.visible = true;
            restore.push(() => (o.visible = false));
          }
          if (o.frustumCulled) {
            o.frustumCulled = false;
            restore.push(() => (o.frustumCulled = true));
          }
          // an instanced mesh with no instances in view is skipped by the driver, so its GPU program
          // was only finished on its first real draw in play (ANGLE/D3D on Windows: ~0.8 s freezes)
          const im = o as THREE.InstancedMesh;
          if (im.isInstancedMesh && im.count === 0 && im.instanceMatrix.count > 0) {
            im.count = 1;
            restore.push(() => (im.count = 0));
          }
        });
        try {
          tick();
        } finally {
          for (const r of restore) r();
        }
        await frame();
      }
    }
    const t = setTimeout(finish, 40000);
    return () => {
      // unmounted (a tier change re-suspended the world): stop; the next mount starts over
      done = true;
      clearTimeout(t);
    };
  }, [onReady, gl, scene, camera, advance, clock]);
  return null;
}

/** The 3D world. Memoised: the phase change on "Tap to enter" re-rendered every world component
 *  (a 630 ms freeze the instant the game opened); only the parts that read the phase update now. */
const World = memo(function World({ onReady, onBench }: { onReady: () => void; onBench: (b: BenchmarkResult) => void }) {
  return (
    <>
          <Environment />
          {/* updatePriority -100: physics steps (and syncs bodies) before everything else each frame, so the
              vehicles (-50/-40) and the player (0) all read this frame's poses: a seated character
              can never trail the car it sits in */}
          <PhysicsRoot>
            <Terrain />
            <RoadNetwork />
            <TrafficLights />
            <Weather />
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
            {!minimal && !MAPRENDER && (
              <Suspense fallback={null}>
                <Pedestrians />
              </Suspense>
            )}
            {!minimal && !MAPRENDER && (
              <Suspense fallback={null}>
                <Vehicles />
              </Suspense>
            )}
            <Suspense fallback={null}>
              <Driving />
              <TyreFx />
              <Secrets />
              <Bubbles />
            </Suspense>
            <MissionWorld />
            {!minimal && <Theatre />}
            {!minimal && <BeachWhenNear />}
            {!minimal && (
              <Suspense fallback={null}>
                <StreetBrawlers />
              </Suspense>
            )}
            {!minimal && (
              <Suspense fallback={null}>
                <Interiors />
              </Suspense>
            )}
            {!minimal && (
              <Suspense fallback={null}>
                <Attendants />
                <StagePassengers />
              </Suspense>
            )}
            {/* solid poles (colliders), so inside Physics; streams in on its own */}
            {!minimal && (
              <Suspense fallback={null}>
                <StreetLights />
              </Suspense>
            )}
          </PhysicsRoot>
          {!minimal && <VehicleLights />}
          <Ocean />
          <WorldStreamer />
          <GameLogic />
          <CityAudio />
          {MAPRENDER && <MapRenderCamera />}
          <CutsceneCamera />
          <CombatDirector />
          <PerfMonitor />
          <ShaderWarmup />
          <PostFX />
          {benchmark.enabled && <BenchGate onDone={onBench} />}
          {params.has('debug') && <DebugHandles />}
          <Ready onReady={onReady} />
    </>
  );
});

/** A frame never advances the game more than 1/15 s. Physics catches up in fixed 1/60 s steps (up
 *  to 0.5 s per frame), so on a slow phone one slow frame meant ~30 physics steps, which made the
 *  next frame slower still: a spiral down to 3 fps (measured, 4x CPU throttle). Now a very slow
 *  device plays in slight slow motion instead, like most games. */
const MAX_FRAME_S = 1 / 15;
function FrameClamp() {
  const clock = useThree((s) => s.clock);
  useEffect(() => {
    const own = clock.getDelta;
    clock.getDelta = function (this: THREE.Clock) {
      return Math.min(own.call(this), MAX_FRAME_S);
    };
    return () => {
      clock.getDelta = own;
    };
  }, [clock]);
  return null;
}

/** ?debug: the physics world for tests (body / collider counts, step timing). */
function PhysicsDebug() {
  const { world } = useRapier();
  useEffect(() => {
    const mk = (window as unknown as { __mk?: Record<string, unknown> }).__mk;
    if (mk) mk.physics = world;
  }, [world]);
  return null;
}

/** Physics runs only in play (the world stays still behind the splash). */
function PhysicsRoot({ children }: { children: ReactNode }) {
  const playing = useGame((s) => s.phase === 'playing');
  return (
    <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} paused={!playing} updatePriority={-100}>
      {params.has('debug') && <PhysicsDebug />}
      <ColliderStreaming />
      {children}
    </Physics>
  );
}

function BenchGate({ onDone }: { onDone: (b: BenchmarkResult) => void }) {
  const playing = useGame((s) => s.phase === 'playing');
  const [done, setDone] = useState(false);
  if (!playing || done) return null;
  return (
    <Benchmark
      onDone={(b) => {
        setDone(true);
        onDone(b);
      }}
    />
  );
}

export default function Game({ onReady }: { onReady: () => void }) {
  const dpr = useGame((s) => s.dpr);
  const phase = useGame((s) => s.phase);
  const isTouch = useGame((s) => s.isTouch);
  const [bench, setBench] = useState<BenchmarkResult | null>(null);

  return (
    <div className={MAPRENDER ? 'game-root maprender' : 'game-root'}>
      <Canvas
        // nothing is drawn while the splash covers the screen: drawing during loading compiled
        // shaders on the spot and froze the page (they compile in the background instead, Ready)
        frameloop={phase === 'playing' || MAPRENDER ? 'always' : 'never'}
        dpr={dpr}
        shadows={{ type: THREE.PCFShadowMap }}
        camera={{ fov: 62, near: 0.1, far: 2500, position: [0, 3, 14] }}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
        onCreated={({ gl }) => {
          if (params.has('noshadow')) gl.shadowMap.enabled = false; // perf experiments
          // shader error checks wait for the driver after every compile (seconds of freezes on first
          // sight of each material): only while developing or with ?debug
          gl.debug.checkShaderErrors = import.meta.env.DEV || params.has('debug');
          gl.toneMapping = THREE.AgXToneMapping;
          gl.toneMappingExposure = 1.05;
          attachInput(gl.domElement);
          prefetchModels(gl); // every world model downloads at once, not one by one as React reaches it
        }}
      >
        {/* every dynamic light, from the first frame (never added later: no shader recompiles) */}
        <LightRig />
        <FrameClamp />
        <Suspense fallback={null}>
          <World onReady={onReady} onBench={setBench} />
        </Suspense>
      </Canvas>
      {phase === 'playing' && <Hud />}
      {phase === 'playing' && <GameUI />}
      {phase === 'playing' && <HealthUI />}
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
