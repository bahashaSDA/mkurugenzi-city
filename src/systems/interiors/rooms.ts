import { create } from 'zustand';

// Interiors from interior_kit.glb (blender/scripts/build_interior_kit.py). Coordinates are three.js
// local to the room: front wall (with the exit door) at +Z, floor at y = 0.

export type RoomType = 'int_kibera' | 'int_house' | 'int_shop' | 'int_hoteli';

export interface Spot {
  x: number;
  z: number;
  label: string;
  kind: 'eat' | 'drink' | 'tv' | 'shop' | 'exit';
  item?: string; // eat/drink: free home food
}

export const ROOMS: Record<RoomType, { depth: number; name: string; spots: Spot[] }> = {
  int_kibera: {
    depth: 3.4,
    name: 'Kibera home',
    spots: [
      { x: -0.95, z: -0.15, label: 'Eat the ugali na sukuma', kind: 'eat', item: 'home_ugali' },
      { x: -0.7, z: -0.2, label: 'Pour chai from the thermos', kind: 'drink', item: 'home_chai' },
      { x: -1.25, z: 1.0, label: 'Watch a Mkurugenzi story on the TV', kind: 'tv' },
    ],
  },
  int_house: {
    depth: 6.5,
    name: 'Family home',
    spots: [
      { x: 2.0, z: -0.6, label: 'Eat chapati and stew', kind: 'eat', item: 'home_chapati' },
      { x: 3.1, z: 2.7, label: 'Take a cold drink from the fridge', kind: 'drink', item: 'home_juice' },
      { x: -1.8, z: 2.2, label: 'Watch a Mkurugenzi story on the TV', kind: 'tv' },
    ],
  },
  int_shop: { depth: 6.0, name: 'Duka', spots: [{ x: 0, z: -0.9, label: 'Buy at the counter', kind: 'shop' }] },
  int_hoteli: { depth: 6.0, name: 'Hoteli', spots: [{ x: 2.6, z: 0, label: 'Order at the counter', kind: 'shop' }] },
};

export interface Door {
  x: number;
  z: number;
  y: number;
  rotY: number; // facing out of the building
  room: RoomType;
  shop?: string; // SHOPS id for shop/hoteli counters
  name: string;
}

/** The room Abel is in (null = outside). The room is built 60 m under its door. */
export const useInterior = create<{ door: Door | null; fading: boolean; ate: string[] }>(() => ({ door: null, fading: false, ate: [] }));

export const INTERIOR_DEPTH = 60;
