import { useEffect, useMemo, useRef, useState } from 'react';
import { lite } from '../perf/lite';

const liteFrame = { n: 0 };
import { useFrame, useThree } from '@react-three/fiber';
import { Environment as EnvMap, Sky } from '@react-three/drei';
import * as THREE from 'three';
import { useGame } from '../app/store';
import { BUDGETS } from '../perf/budgets';
import { playerPosition } from '../systems/player/playerState';
import { dayOfYear, sunDirection } from './sun';
import { advanceClock, clock, daylight, lightsOn } from './clock';
import { glowMaterials, nightWindowUniforms } from './kit/useKit';
import { indoor, screenLight } from '../game/theatre';
import { weather } from './weather';
import { diving } from '../systems/player/playerState';

const _grey = new THREE.Color();
const fogBase = { near: 0, far: 0 };

// Lighting through a full GTA-style day (world/clock.ts: 48 real minutes per day).
//  * Real Nairobi sun path (sun.ts); a cool moon takes over the same shadow-casting light at night.
//  * Physical sky (three Sky) re-tuned for golden hour and dusk; stars and a moon at night.
//  * Image-based light re-rendered every half game hour so shade matches the sky.
//  * Fog colour follows the air: dusty haze by day, amber at sunset, deep blue at night.
//  * Signs, LEDs and lamps glow brighter after dark; exposure adapts like an eye/camera.
const DOY = dayOfYear();

// colour keys through the day: [hour, fog, sun colour, sky params]
const KEYS: { h: number; fog: string; sun: string; turbidity: number; rayleigh: number; mie: number }[] = [
  { h: 0, fog: '#0b1322', sun: '#8ea6d6', turbidity: 2, rayleigh: 0.4, mie: 0.004 },
  { h: 5.5, fog: '#1a2236', sun: '#8ea6d6', turbidity: 2, rayleigh: 0.5, mie: 0.004 },
  { h: 6.4, fog: '#c99c86', sun: '#ff9a52', turbidity: 9, rayleigh: 2.6, mie: 0.012 },
  { h: 7.5, fog: '#d8c9b2', sun: '#ffd2a0', turbidity: 7, rayleigh: 1.5, mie: 0.007 },
  { h: 12.4, fog: '#cdd3d6', sun: '#fff1df', turbidity: 6, rayleigh: 1.1, mie: 0.005 },
  { h: 16.8, fog: '#cfc7b8', sun: '#ffdcae', turbidity: 7, rayleigh: 1.2, mie: 0.006 },
  { h: 18.3, fog: '#d9946a', sun: '#ff8a3c', turbidity: 10, rayleigh: 3.0, mie: 0.014 },
  { h: 19.0, fog: '#5a4a62', sun: '#c86a5a', turbidity: 6, rayleigh: 2.0, mie: 0.01 },
  { h: 19.8, fog: '#141a2c', sun: '#8ea6d6', turbidity: 2, rayleigh: 0.5, mie: 0.004 },
  { h: 24, fog: '#0b1322', sun: '#8ea6d6', turbidity: 2, rayleigh: 0.4, mie: 0.004 },
];
const KEY_COLS = KEYS.map((k) => ({ fog: new THREE.Color(k.fog), sun: new THREE.Color(k.sun) }));

const _sun = new THREE.Vector3();
const _moon = new THREE.Vector3();
const _light = new THREE.Vector3();
const _fog = new THREE.Color();
const _sunCol = new THREE.Color();
const _air = { turbidity: 0, rayleigh: 0, mie: 0 };

function sample(h: number) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1]!.h <= h) i++;
  const a = KEYS[i]!;
  const b = KEYS[i + 1]!;
  const t = (h - a.h) / (b.h - a.h);
  _fog.copy(KEY_COLS[i]!.fog).lerp(KEY_COLS[i + 1]!.fog, t);
  _sunCol.copy(KEY_COLS[i]!.sun).lerp(KEY_COLS[i + 1]!.sun, t);
  _air.turbidity = a.turbidity + (b.turbidity - a.turbidity) * t;
  _air.rayleigh = a.rayleigh + (b.rayleigh - a.rayleigh) * t;
  _air.mie = a.mie + (b.mie - a.mie) * t;
}

/** Quantised time used for the IBL cube map (re-rendered when it changes). */
const envStep = (h: number) => Math.round(h * 2) / 2;

export function Environment() {
  const light = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sky = useRef<THREE.Mesh>(null);
  const tier = useGame((s) => s.tier);
  const budget = BUDGETS[tier];
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const [envH, setEnvH] = useState(() => envStep(clock.hours));
  const envSun = useMemo(() => sunDirection(envH, DOY, new THREE.Vector3()).multiplyScalar(100).toArray() as [number, number, number], [envH]);
  const envDay = daylight(envH);

  useEffect(() => {
    scene.fog = new THREE.Fog('#cfc7b8', 140, tier === 'low' ? 600 : tier === 'mid' ? 1000 : 1400);
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

  // stars: one Points draw call, faded in at night
  const stars = useMemo(() => {
    const n = 2600;
    const pos = new Float32Array(n * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.set(Math.random() * 2 - 1, Math.random() * 0.95 + 0.05, Math.random() * 2 - 1).normalize().multiplyScalar(2200);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: '#dfe8ff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    p.renderOrder = -1;
    return p;
  }, []);
  const moon = useMemo(() => {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(38, 32),
      new THREE.MeshBasicMaterial({ color: '#f2efe2', transparent: true, opacity: 0, fog: false, depthWrite: false }),
    );
    m.frustumCulled = false;
    return m;
  }, []);
  // night air: a faint blue gradient over the (black) physical sky so nights read deep blue, not void
  const nightDome = useMemo(() => {
    const m = new THREE.ShaderMaterial({
      uniforms: { uNight: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform float uNight; varying vec3 vP; void main(){ float h = clamp(vP.y, 0.0, 1.0); vec3 c = mix(vec3(0.10,0.13,0.22), vec3(0.012,0.02,0.05), pow(h, 0.45)); gl_FragColor = vec4(c, uNight); }',
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      fog: false,
    });
    const d = new THREE.Mesh(new THREE.SphereGeometry(2300, 32, 16), m);
    d.frustumCulled = false;
    d.renderOrder = -2;
    return d;
  }, []);

  useFrame((state, dt) => {
    // lite (perf/lite): the sun's shadow map is redrawn every 4th frame (most of its cost; turning
    // shadows off would change every shader and mean a full recompile)
    if (light.current) {
      const sh = light.current.shadow;
      sh.autoUpdate = !lite.on;
      // every frame while loading: the priming frames must draw (and compile) the shadow pass too
      if (lite.on && (useGame.getState().phase !== 'playing' || liteFrame.n++ % 4 === 0)) sh.needsUpdate = true;
    }
    advanceClock(Math.min(dt, 0.25));
    // indoors (the Grand Theatre): sky light fades like eyes adjusting, warm house light instead
    indoor.value += (indoor.target - indoor.value) * Math.min(1, dt * 2.5);
    const inside = indoor.value;
    const h = clock.hours;
    const day = daylight(h);
    const night = lightsOn(h);
    sample(h);

    sunDirection(h, DOY, _sun);
    _moon.copy(_sun).negate();
    _moon.y = Math.max(0.35, _moon.y);
    _moon.normalize();
    const sunUp = _sun.y > -0.02;
    _light.copy(sunUp ? _sun : _moon);

    // physical sky follows the real sun (also below the horizon: twilight)
    const skyMat = sky.current?.material as THREE.ShaderMaterial | undefined;
    if (skyMat?.uniforms) {
      skyMat.uniforms.sunPosition!.value.copy(_sun).multiplyScalar(100);
      // weather: haze and grey (world/weather)
      skyMat.uniforms.turbidity!.value = _air.turbidity + weather.cloud * 9;
      skyMat.uniforms.rayleigh!.value = _air.rayleigh * (1 - 0.6 * weather.cloud);
      skyMat.uniforms.mieCoefficient!.value = _air.mie;
    }
    (nightDome.material as THREE.ShaderMaterial).uniforms.uNight!.value = night * 0.92;
    (stars.material as THREE.PointsMaterial).opacity = night * 0.9 * (1 - weather.cloud);
    const cam = state.camera.position;
    stars.position.copy(cam);
    nightDome.position.copy(cam);
    moon.position.copy(cam).addScaledVector(_moon, 2000);
    moon.lookAt(cam);
    (moon.material as THREE.MeshBasicMaterial).opacity = night * (1 - 0.9 * weather.cloud);

    // fog and exposure
    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      // cloud greys the haze; rain closes it in
      fog.color.copy(_fog).lerp(_grey.setRGB(0.5 * day + 0.05, 0.52 * day + 0.06, 0.55 * day + 0.07), weather.cloud * 0.65);
      if (fogBase.far === 0) Object.assign(fogBase, { near: fog.near, far: fog.far });
      fog.near = fogBase.near * (1 - 0.7 * weather.rain);
      fog.far = fogBase.far * (1 - 0.6 * weather.rain);
      // under the sea: a few metres of green-blue water, darker with depth and at night
      if (diving.cameraUnder) {
        const lit = (0.35 + 0.65 * day) * Math.max(0.35, 1 - diving.depth / 12);
        fog.color.setRGB(0.06 * lit, 0.32 * lit, 0.36 * lit);
        fog.near = 0.5;
        fog.far = 22;
      }
    }

    const l = light.current;
    if (l) {
      const elev = Math.max(0, _sun.y);
      // sun: fades in over the first ~8 degrees; the moon is a fifth of a sunny day at most
      const sunI = 2.6 * Math.min(1, elev / 0.14);
      // clouds: the sun goes soft (most of its light becomes sky light, below)
      l.intensity = (sunUp ? sunI : 0.32 * night) * (1 - inside * 0.92) * (1 - 0.72 * weather.cloud);
      l.color.copy(_sunCol);
      const texel = (budget.shadowDistance * 2) / budget.shadowMapSize;
      const sx = Math.round(playerPosition.x / texel) * texel;
      const sz = Math.round(playerPosition.z / texel) * texel;
      l.target.position.set(sx, 0, sz);
      l.position.set(sx + _light.x * 150, Math.max(8, _light.y * 150), sz + _light.z * 150);
      l.target.updateMatrixWorld();
    }
    if (hemi.current) {
      hemi.current.intensity = (0.06 + 0.22 * night + 0.35 * weather.cloud * day) * (1 - inside) + inside * 0.55;
      hemi.current.color.set(inside > 0.5 ? '#ffd9a8' : '#5a6f9e');
    }
    scene.environmentIntensity = (0.12 + 0.75 * day) * (1 - inside * 0.8);
    gl.toneMappingExposure = 1.05 + 0.4 * Math.max(night, inside * 0.8);

    for (const m of glowMaterials) m.emissiveIntensity = m.userData.baseGlow * (1 + 1.6 * night);
    nightWindowUniforms.uNight.value = night;

    const e = envStep(h);
    if (e !== envH) setEnvH(e);
  });

  return (
    <>
      <Sky ref={sky as never} sunPosition={envSun} distance={4500} />
      <primitive object={nightDome} />
      <primitive object={stars} />
      <primitive object={moon} />
      {/* IBL: rendered once into a small cube map per half game hour */}
      <EnvMap key={envH} resolution={tier === 'low' ? 32 : 64} frames={1} near={1} far={1000}>
        <Sky sunPosition={envSun} distance={450} turbidity={7} rayleigh={envDay > 0.5 ? 1.2 : 2.5} mieCoefficient={0.006} mieDirectionalG={0.82} />
        {/* lower hemisphere: sunlit murram bounces warm light up into shade; at night a dim blue */}
        <mesh scale={400}>
          <sphereGeometry args={[1, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
          <meshBasicMaterial color={envDay > 0.3 ? '#9a8467' : '#1c2233'} side={THREE.BackSide} />
        </mesh>
        {envDay < 0.3 && (
          <mesh scale={420}>
            <sphereGeometry args={[1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshBasicMaterial color="#141c30" side={THREE.BackSide} />
          </mesh>
        )}
      </EnvMap>
      <hemisphereLight ref={hemi} args={['#5a6f9e', '#2a2016', 0.1]} />
      <directionalLight ref={light} castShadow intensity={2.4} color="#ffdcae" />
      <primitive object={screenLight} />
      <primitive object={screenLight.target} />
    </>
  );
}
