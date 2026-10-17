import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { applyWetLook, updateWeather, weather } from './weather';
import { daylight, clock } from './clock';
import { indoor } from '../game/theatre';
import { useInterior } from '../systems/interiors/rooms';
import { audioContext } from '../systems/audio/music';
import { brownBuffer, bus } from '../systems/audio/mixer';
import { drive } from '../systems/driving/state';

// What you see and hear of the weather (world/weather has the state):
//   * a cloud layer: a dome of soft procedural cloud, drifting, as opaque as the cloud cover
//   * rain: 1,800 streaks falling (slanted by a little wind) in a box that follows the camera,
//     outdoors only (not in an interior, not under the theatre roof)
//   * the rain sound: a filtered noise bed on the ambience bus, muffled inside a car
// One draw call each; nothing is created per frame.

const DROPS = 1800;
const BOX = 36;

function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 512, 512);
  const r = (n: number) => Math.random() * n;
  for (let i = 0; i < 260; i++) {
    const x = r(512), y = r(512), s = 30 + r(90);
    const grd = g.createRadialGradient(x, y, 0, x, y, s);
    grd.addColorStop(0, `rgba(255,255,255,${0.10 + r(0.12)})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) g.fillRect(x - s + ox, y - s + oy, s * 2, s * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

export function Weather() {
  const rain = useMemo(() => {
    const pos = new Float32Array(DROPS * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.LineBasicMaterial({ color: '#c8d4e0', transparent: true, opacity: 0, depthWrite: false, fog: true });
    const l = new THREE.LineSegments(g, m);
    l.frustumCulled = false;
    const seeds = new Float32Array(DROPS * 3);
    for (let i = 0; i < DROPS; i++) seeds.set([Math.random() * BOX - BOX / 2, Math.random() * 20, Math.random() * BOX - BOX / 2], i * 3);
    return { l, pos, seeds };
  }, []);
  const clouds = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: '#8f969c', alphaMap: cloudTexture(), transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.BackSide });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), m);
    dome.renderOrder = -1;
    dome.frustumCulled = false;
    return dome;
  }, []);
  const sound = useRef<{ g: GainNode; src: AudioBufferSourceNode; lp: BiquadFilterNode } | null>(null);
  useEffect(
    () => () => {
      sound.current?.src.stop();
      sound.current = null;
    },
    [],
  );

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    updateWeather(dt);
    applyWetLook();
    const cam = state.camera.position;
    const inside = useInterior.getState().door !== null || indoor.value > 0.5;
    // clouds: grey by day, almost black at night, drifting with the wind
    const day = daylight(clock.hours);
    const cm = clouds.material as THREE.MeshBasicMaterial;
    cm.opacity = inside ? 0 : Math.min(0.92, weather.cloud * 1.05);
    cm.color.setRGB(0.12 + 0.46 * day, 0.13 + 0.47 * day, 0.15 + 0.47 * day).multiplyScalar(1 - 0.25 * weather.rain);
    cm.alphaMap!.offset.x += dt * 0.0012;
    clouds.position.set(cam.x, cam.y - 120, cam.z);
    // rain streaks around the camera
    const rm = rain.l.material as THREE.LineBasicMaterial;
    const on = !inside && weather.rain > 0.02;
    rm.opacity = on ? 0.18 + 0.35 * weather.rain : 0;
    rain.l.visible = on;
    if (on) {
      const n = Math.floor(DROPS * Math.min(1, 0.25 + weather.rain));
      const fall = 14 * dt;
      const len = 0.55;
      const wx = 0.12, wz = 0.06; // wind slant
      for (let i = 0; i < DROPS; i++) {
        let y = rain.seeds[i * 3 + 1]! - fall;
        if (y < 0) y += 20;
        rain.seeds[i * 3 + 1] = y;
        const k = i * 6;
        if (i >= n) {
          rain.pos.fill(0, k, k + 6);
          continue;
        }
        // wrap the drop into the box around the camera
        const x = cam.x + ((((rain.seeds[i * 3]! - cam.x) % BOX) + BOX * 1.5) % BOX) - BOX / 2;
        const z = cam.z + ((((rain.seeds[i * 3 + 2]! - cam.z) % BOX) + BOX * 1.5) % BOX) - BOX / 2;
        const yy = cam.y - 6 + y;
        rain.pos[k] = x;
        rain.pos[k + 1] = yy;
        rain.pos[k + 2] = z;
        rain.pos[k + 3] = x + wx * len;
        rain.pos[k + 4] = yy + len;
        rain.pos[k + 5] = z + wz * len;
      }
      rain.l.geometry.attributes.position!.needsUpdate = true;
    }
    // the sound: a steady hiss with weight, quieter and duller inside a car or a building
    const ac = audioContext();
    if (ac && ac.state === 'running') {
      if (!sound.current && weather.rain > 0.02) {
        const out = bus('ambience');
        if (out) {
          const src = ac.createBufferSource();
          src.buffer = brownBuffer(ac);
          src.loop = true;
          const hp = ac.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 400;
          const lp = ac.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 6000;
          const g = ac.createGain();
          g.gain.value = 0;
          src.connect(hp).connect(lp).connect(g).connect(out);
          src.start();
          sound.current = { g, src, lp };
        }
      }
      if (sound.current) {
        const muffled = inside || drive.active;
        sound.current.g.gain.setTargetAtTime(weather.rain * (muffled ? 0.12 : 0.35), ac.currentTime, 0.5);
        sound.current.lp.frequency.setTargetAtTime(muffled ? 1400 : 6000, ac.currentTime, 0.3);
      }
    }
  });

  return (
    <>
      <primitive object={clouds} />
      <primitive object={rain.l} />
    </>
  );
}
