import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useKit, type Kit } from '../../world/kit/useKit';
import { getHubLayout } from '../../districts/hub/layout';
import { HUB_KIT_URL, KIBERA_KIT_URL, REAL_BUILDINGS_KIT_URL, STREET_KIT_URL, TOWN_KIT_URL } from '../../districts/hub/Hub';
import { ROOM_W } from '../../districts/kibera/layout';
import { heightAt } from '../../world/heights';
import { register, type Interactable } from '../../game/interactables';
import { useEconomy } from '../../game/economy';
import { ITEMS } from '../../game/catalog';
import { loadContent, onlyAvailable } from '../../content/episodes';
import { playerPosition, teleport } from '../player/playerState';
import { drive } from '../driving/state';
import { ride } from '../vehicles/state';
import { INTERIOR_DEPTH, ROOMS, useInterior, type Door, type RoomType } from './rooms';

// GTA-style interiors: E at (almost) any door fades to black and puts Abel inside a furnished
// room; E at the room's door takes him back out. Only the room you are in exists.

export const INTERIOR_KIT_URL = '/models/interior_kit.glb';

const ROOM_OF: Record<string, [RoomType, string, string?]> = {
  shack_mabati_green: ['int_kibera', 'home'],
  shack_mabati_blue: ['int_kibera', 'home'],
  shack_mud_plaster: ['int_kibera', 'home'],
  block_flat: ['int_house', 'flat'],
  shop_hoteli: ['int_hoteli', 'Chai Moto Hoteli', 'hoteli'],
  shop_butchery: ['int_shop', 'Nyama Bora Butchery', 'butchery'],
  shop_boutique: ['int_shop', 'Utafraaaia Boutique', 'boutique'],
  shop_hardware: ['int_shop', 'the duka', 'kiosk'],
  shop_barber: ['int_shop', 'the duka', 'kiosk'],
  shop_electronics: ['int_shop', 'the duka', 'kiosk'],
  shop_mshop: ['int_shop', 'the duka', 'kiosk'],
  house_bungalow_a: ['int_house', 'home'],
  house_bungalow_b: ['int_house', 'home'],
  house_maisonette: ['int_house', 'home'],
  bld_apart_5: ['int_house', 'flat'],
  bld_shops_2: ['int_shop', 'the shop', 'kiosk'],
  bld_shops_3: ['int_shop', 'the shop', 'kiosk'],
  bld_shops_4: ['int_shop', 'the shop', 'kiosk'],
  rb_flats: ['int_house', 'flat'],
  rb_residential: ['int_house', 'flat'],
  rb_shop: ['int_shop', 'the duka', 'kiosk'],
};

/** How far the front of a piece reaches (+Z, three.js), from its colliders. */
function frontOf(kits: Kit[], piece: string): number {
  for (const k of kits) {
    const def = k.get(piece);
    if (!def) continue;
    let z = 0;
    for (const c of def.colliders) {
      if (c.kind === 'box') z = Math.max(z, c.center[2] + c.halfExtents[2]);
      else for (let i = 2; i < c.points.length; i += 3) z = Math.max(z, c.points[i]!);
    }
    return z || 2;
  }
  return 2;
}

function buildDoors(kits: Kit[]): Door[] {
  const out: Door[] = [];
  const add = (px: number, pz: number, rotY: number, lx: number, lz: number, room: RoomType, name: string, shop?: string) => {
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    const x = px + lx * c + lz * s;
    const z = pz - lx * s + lz * c;
    out.push({ x, z, y: heightAt(x, z), rotY, room, name, shop });
  };
  for (const p of getHubLayout()) {
    const row = /^kib_row(\d)$/.exec(p.piece);
    if (row) {
      const n = Number(row[1]);
      const fz = frontOf(kits, p.piece) + 0.35;
      for (let i = 0; i < n; i++) add(p.x, p.z, p.rotY, (i - (n - 1) / 2) * ROOM_W, fz, 'int_kibera', 'home');
      continue;
    }
    const def = ROOM_OF[p.piece];
    if (def) add(p.x, p.z, p.rotY, 0, frontOf(kits, p.piece) + 0.5, def[0], def[1], def[2]);
  }
  return out;
}

export function Interiors() {
  const kits = [useKit(HUB_KIT_URL), useKit(STREET_KIT_URL), useKit(KIBERA_KIT_URL), useKit(TOWN_KIT_URL), useKit(REAL_BUILDINGS_KIT_URL)];
  const interiorKit = useKit(INTERIOR_KIT_URL);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const doors = useMemo(() => buildDoors(kits), kits);
  useEffect(() => {
    const mk = (window as unknown as { __mk?: Record<string, unknown> }).__mk;
    if (mk) Object.assign(mk, { doors, useInterior }); // ?debug: for tests
  }, [doors]);
  const grid = useMemo(() => {
    const g = new Map<string, Door[]>();
    for (const d of doors) {
      const k = `${Math.floor(d.x / 16)},${Math.floor(d.z / 16)}`;
      let l = g.get(k);
      if (!l) g.set(k, (l = []));
      l.push(d);
    }
    return g;
  }, [doors]);

  // one moving interactable: the nearest door (thousands of Kibera doors stay cheap)
  const finder = useMemo<Interactable>(() => ({ id: 'door-finder', x: 1e9, z: 1e9, y: 0, radius: 1.5, label: '', key: 'KeyE', use: () => {} }), []);
  useEffect(() => register(finder), [finder]);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    if (t.current < 0.2) return;
    t.current = 0;
    finder.x = 1e9;
    if (useInterior.getState().door || drive.active || ride.vehicle >= 0) return;
    const cx = Math.floor(playerPosition.x / 16);
    const cz = Math.floor(playerPosition.z / 16);
    let best: Door | null = null;
    let bd = 1.6;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const d of grid.get(`${cx + i},${cz + j}`) ?? []) {
          const dist = Math.hypot(d.x - playerPosition.x, d.z - playerPosition.z);
          if (dist < bd) {
            bd = dist;
            best = d;
          }
        }
    if (!best) return;
    const door = best;
    finder.x = door.x;
    finder.z = door.z;
    finder.y = door.y + 0.9;
    finder.label = `Enter ${door.name}`;
    finder.use = () => enter(door);
  });

  const door = useInterior((s) => s.door);
  return door ? <ActiveRoom key={`${door.x},${door.z}`} door={door} kit={interiorKit} /> : null;
}

function fade(then: () => void) {
  useInterior.setState({ fading: true });
  setTimeout(() => {
    then();
    setTimeout(() => useInterior.setState({ fading: false }), 250);
  }, 300);
}

function enter(door: Door) {
  fade(() => {
    useInterior.setState({ door, ate: [] });
    const room = ROOMS[door.room];
    teleport.x = door.x;
    teleport.z = door.z + room.depth / 2 - 0.9;
    teleport.y = door.y - INTERIOR_DEPTH + 0.95;
    teleport.facing = Math.PI; // into the room (-Z)
    teleport.pending = true;
    useEconomy.setState({ area: `Ndani: ${room.name}` });
  });
}

function exit(door: Door) {
  fade(() => {
    useInterior.setState({ door: null });
    teleport.x = door.x + Math.sin(door.rotY) * 0.9;
    teleport.z = door.z + Math.cos(door.rotY) * 0.9;
    teleport.y = door.y + 1.0;
    teleport.facing = door.rotY; // walking out, back to the street
    teleport.pending = true;
    useEconomy.setState({ area: '' });
  });
}

function ActiveRoom({ door, kit }: { door: Door; kit: Kit }) {
  const def = kit.get(door.room);
  const room = ROOMS[door.room];
  const origin: [number, number, number] = useMemo(() => [door.x, door.y - INTERIOR_DEPTH, door.z], [door]);

  useEffect(() => {
    const y = origin[1] + 0.9;
    const spots: Interactable[] = room.spots.map((sp, i) => ({
      id: `room-${i}`, x: origin[0] + sp.x, z: origin[2] + sp.z, y, radius: 1.4, label: sp.label, key: 'KeyE',
      use: () => {
        const eco = useEconomy.getState();
        if (sp.kind === 'shop' && door.shop) eco.openShop(door.shop);
        else if (sp.kind === 'tv') {
          // the home TV plays a real Mkurugenzi episode (YouTube embed, like the video halls)
          void loadContent()
            .then((c) => onlyAvailable(c.episodes.slice(0, 30)))
            .then((pool) => {
              const ep = pool[Math.floor(Math.random() * pool.length)];
              if (ep) useEconomy.getState().openVideo(ep.youtubeId, ep.title);
            });
        }
        else if (sp.item) {
          const ate = useInterior.getState().ate;
          if (ate.includes(sp.item)) {
            eco.toast('Umeshakula hiyo! (already finished)', 'info');
            return;
          }
          useInterior.setState({ ate: [...ate, sp.item] });
          eco.consume(sp.item);
          eco.toast(`${ITEMS[sp.item]?.name}: karibu, Mkurugenzi!`, 'info');
        }
      },
    }));
    spots.push({ id: 'room-exit', x: origin[0], z: origin[2] + room.depth / 2 - 0.35, y, radius: 1.3, label: 'Leave', key: 'KeyE', use: () => exit(door) });
    const offs = spots.map(register);
    return () => offs.forEach((f) => f());
  }, [door, origin, room]);

  if (!def) return null;
  return (
    <group>
      <group position={origin}>
        {def.lods[0]!.map((p, i) => (
          <mesh key={i} geometry={p.geometry} material={p.material} matrix={p.local} matrixAutoUpdate={false} receiveShadow castShadow={false} />
        ))}
        <pointLight position={[0, 2.2, 0]} intensity={14} distance={12} decay={1.6} color="#ffd9a0" />
        <pointLight position={[0, 1.6, room.depth / 2 - 1]} intensity={4} distance={8} decay={1.6} color="#dbe8ff" />
      </group>
      <RigidBody type="fixed" colliders={false} position={origin}>
        {def.colliders.map((c, i) =>
          c.kind === 'box' ? <CuboidCollider key={i} args={c.halfExtents} position={c.center} /> : null,
        )}
      </RigidBody>
    </group>
  );
}
