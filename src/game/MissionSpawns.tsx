import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { heightAt } from '../world/heights';
import { playerPosition } from '../systems/player/playerState';
import { routeSamples, type RouteSample } from '../systems/vehicles/routes';
import { useVehicleKit } from '../systems/vehicles/vehicleKit';
import { MissionFighters } from '../systems/combat/CombatDirector';
import { clock, skipTo } from '../world/clock';
import { useInterior } from '../systems/interiors/rooms';
import { emit } from './events';
import { useEconomy } from './economy';
import { currentStep, useMissions } from './missions';
import { missionScratch, type Spawn } from './missionData';

// What the current mission step puts into the world: opponents, pickups, a car to chase, or a
// wait for the golden hour. Everything is removed when the step ends (component unmounts).
export function MissionSpawns() {
  const active = useMissions((s) => s.active);
  const step = useMissions((s) => s.step);
  const spawn = useMemo(() => (active ? currentStep()?.step.spawn ?? null : null), [active, step]);
  if (!spawn || !active) return null;
  return (
    <Suspense fallback={null}>
      <SpawnOf key={`${active}-${step}`} spawn={spawn} />
    </Suspense>
  );
}

function SpawnOf({ spawn }: { spawn: Spawn }) {
  switch (spawn.kind) {
    case 'fight': {
      const at = spawn.at.name === '@chase' ? missionScratch.chaseEnd : spawn.at;
      return <MissionFighters x={at.x} z={at.z} count={spawn.count} toughness={spawn.toughness} />;
    }
    case 'collect':
      return <Pickups x={spawn.at.x} z={spawn.at.z} count={spawn.count} spread={spawn.spread} item={spawn.item} />;
    case 'chase':
      return <ChaseCar from={spawn.from} speed={spawn.speed} tolerance={spawn.tolerance} who={spawn.who} />;
    case 'sunset':
      return <GoldenHour hour={spawn.hour} />;
  }
}

// ------------------------------------------------------------------ pickups
const pickupGeo = new THREE.BoxGeometry(0.34, 0.06, 0.26);
const glowGeo = new THREE.RingGeometry(0.35, 0.55, 24);

function Pickups({ x, z, count, spread, item }: { x: number; z: number; count: number; spread: number; item: string }) {
  const items = useMemo(() => {
    const out: { x: number; z: number; got: boolean }[] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random();
      const r = spread * (0.35 + Math.random() * 0.65);
      out.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, got: false });
    }
    return out;
  }, [x, z, count, spread]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: /hoodie/.test(item) ? '#2b2b2f' : '#f4f1e8', roughness: 0.7, emissive: '#3a2c00', emissiveIntensity: 0.4 }),
    [item],
  );
  const glow = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd23c', transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false }), []);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    items.forEach((it, i) => {
      const g = refs.current[i];
      if (!g) return;
      g.visible = !it.got;
      if (it.got) return;
      g.rotation.y = t * 1.6 + i;
      g.position.y = heightAt(it.x, it.z) + 0.5 + Math.sin(t * 2 + i) * 0.08;
      if (Math.hypot(playerPosition.x - it.x, playerPosition.z - it.z) < 1.6) {
        it.got = true;
        emit({ type: 'collect', tag: 'mission' });
      }
    });
  });
  return (
    <>
      {items.map((it, i) => (
        <group key={i} ref={(g) => void (refs.current[i] = g)} position={[it.x, heightAt(it.x, it.z) + 0.5, it.z]}>
          <mesh geometry={pickupGeo} material={mat} castShadow />
          <mesh geometry={glowGeo} material={glow} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.45, 0]} />
        </group>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ chase
function sample(r: RouteSample, s: number) {
  const n = r.x.length;
  const f = (((s % r.length) + r.length) % r.length) / r.step;
  const i = Math.floor(f) % n;
  const j = (i + 1) % n;
  const t = f - Math.floor(f);
  let dh = r.heading[j]! - r.heading[i]!;
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  return { x: r.x[i]! + (r.x[j]! - r.x[i]!) * t, z: r.z[i]! + (r.z[j]! - r.z[i]!) * t, h: r.heading[i]! + dh * t };
}

/** The car you have to catch: drives the road network away from you; get within 7 m to catch it. */
function ChaseCar({ from, speed, tolerance, who }: { from: { x: number; z: number }; speed: number; tolerance: number; who: string }) {
  const kit = useVehicleKit();
  const group = useRef<THREE.Group>(null);
  const parts = useMemo(() => kit.get('rv_car_2')?.lods[0] ?? kit.get('car_saloon_0')?.lods[0] ?? [], [kit]);
  // nearest route point to the start place
  const route = useMemo(() => {
    let best = { r: null as RouteSample | null, s: 0, d: Infinity };
    for (const r of Object.values(routeSamples())) {
      for (let i = 0; i < r.x.length; i += 4) {
        const d = Math.hypot(r.x[i]! - from.x, r.z[i]! - from.z);
        if (d < best.d) best = { r, s: i * r.step, d };
      }
    }
    return best;
  }, [from.x, from.z]);
  const st = useRef({ s: route.s, lostFor: 0, caught: false, started: false });
  useEffect(() => {
    useEconomy.getState().toast(`${who} is getting away!`, 'info');
  }, [who]);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const r = route.r;
    const g = group.current;
    if (!r || !g || st.current.caught) return;
    const s = st.current;
    const p = sample(r, s.s);
    const d = Math.hypot(p.x - playerPosition.x, p.z - playerPosition.z);
    // waits until you are coming, then flees; slows in corners, a bit faster when you are close
    if (!s.started && d < 120) s.started = true;
    if (s.started) s.s += speed * (d < 30 ? 1.12 : 1) * dt;
    g.position.set(p.x, heightAt(p.x, p.z), p.z);
    g.rotation.y = p.h;
    missionScratch.chaseEnd = { x: p.x, z: p.z };
    if (d < 7) {
      s.caught = true;
      useEconomy.getState().toast(`You caught ${who}!`, 'earn');
      emit({ type: 'use', id: 'chase:caught' });
      return;
    }
    if (s.started && d > tolerance) {
      s.lostFor += dt;
      if (s.lostFor > 6) useMissions.getState().fail(`${who} got away.`);
    } else s.lostFor = 0;
  });
  return (
    <group ref={group}>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={p.material} matrix={p.local} matrixAutoUpdate={false} castShadow />
      ))}
      <mesh position={[0, 2.6, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.3, 0.6, 4]} />
        <meshBasicMaterial color="#e0302a" />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------------ golden hour
/** Arrive outside the golden hour and the clock fast-forwards (with a fade), GTA style. */
function GoldenHour({ hour }: { hour: number }) {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    const cur = currentStep();
    const at = cur?.step.at?.();
    if (!at || Math.hypot(playerPosition.x - at.x, playerPosition.z - at.z) > at.r + 4) return;
    done.current = true;
    const h = clock.hours;
    if (h > hour - 0.4 && h < hour + 0.6) return;
    useInterior.setState({ fading: true });
    useEconomy.getState().toast('Waiting for the golden hour...', 'info');
    setTimeout(() => {
      skipTo(hour - 0.15);
      useInterior.setState({ fading: false });
    }, 900);
  });
  return null;
}
