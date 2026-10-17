import { create } from 'zustand';

// Interiors from interior_kit.glb (blender/scripts/build_interior_kit.py). Coordinates are three.js
// local to the room: front wall (with the exit door) at +Z, floor at y = 0.

export type RoomType = 'int_kibera' | 'int_house' | 'int_shop' | 'int_hoteli' | 'int_kinyozi' | 'int_school';

export interface Spot {
  x: number;
  z: number;
  label: string;
  kind: 'eat' | 'drink' | 'tv' | 'shop' | 'exit' | 'read' | 'collect';
  text?: string; // read: what it says
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
  // the barber works beside his chair (blender/scripts/build_interior_kit.py int_kinyozi)
  int_kinyozi: { depth: 6.0, name: 'Kinyozi', spots: [{ x: 0.75, z: -0.75, label: 'Talk to the barber', kind: 'shop' }] },
  // Freddie's School (build_interior_kit.py int_school): reception hall, two classrooms, the office
  int_school: {
    depth: 12.0, name: "Freddie's School",
    spots: [
      { x: -6.6, z: 3.8, label: 'Read the notice board', kind: 'read', text: 'Sports Day Friday 2pm · Drama club auditions: Story Time! · Term 3 fees due on the 30th · Lost: blue sweater, Form 2 East' },
      { x: 1.0, z: -5.3, label: 'Look at the old class photo', kind: 'collect', item: 'oldboy-photo' },
      { x: -3.75, z: -5.0, label: 'Read the blackboard', kind: 'read', text: 'Methali: Haraka haraka haina baraka. Insha: "Siku niliyokutana na Mkurugenzi" (maneno 300, Ijumaa!)' },
    ],
  },
};

/**
 * Seats in each room (room-local, three.js: hips x/z, facing, exit spot in front), from the same
 * Blender layouts. Hoteli: two per bench either side of each table; kinyozi: the barber chair
 * (facing the mirror) and the waiting bench.
 */
export interface RoomSeat { id: string; x: number; z: number; facing: number; ex: number; ez: number; kind: 'bench' | 'chair' }
const hoteliSeats: RoomSeat[] = [];
for (const [bx, by] of [[-2.6, -1.0], [-2.6, 1.0], [0.0, -1.0], [0.0, 1.0]] as const) {
  for (const side of [1, -1]) {
    // bench at Blender y + side*0.7 -> three z = -(by + side*0.7); the table is towards -side*... in z
    const z = -(by + side * 0.7);
    const facing = side > 0 ? 0 : Math.PI; // towards the table
    for (const dx of [-0.35, 0.35]) hoteliSeats.push({ id: `t${bx},${by},${side},${dx}`, x: bx + dx, z, facing, ex: bx + dx, ez: z - side * 0.55, kind: 'bench' });
  }
}
// Freddie's School desks: benches 0.55 m behind each double desk, two pupils each, facing the board
const schoolSeats: RoomSeat[] = [];
for (const [room, cols] of [['f2e', [-5.6, -3.75, -1.9]], ['f1w', [3.6, 5.9]]] as const)
  for (const by of [3.3, 2.1, 0.9])
    for (const bx of cols)
      for (const dx of [-0.27, 0.27]) schoolSeats.push({ id: `${room}-${bx}-${by}-${dx}`, x: bx + dx, z: -(by - 0.55), facing: Math.PI, ex: bx + dx + (dx < 0 ? -0.62 : 0.62), ez: -(by - 0.55), kind: 'bench' });
schoolSeats.push({ id: 'visitor-bench-0', x: -6.6, z: 3.2, facing: Math.PI / 2, ex: -6.0, ez: 3.2, kind: 'bench' }, { id: 'visitor-bench-1', x: -6.6, z: 4.1, facing: Math.PI / 2, ex: -6.0, ez: 4.1, kind: 'bench' });

/** The school's people (Attendants spots, room-local): who, where, and what they say. */
export const SCHOOL_TEACHER = ['Karibu Mkurugenzi! Wanafunzi, msalimieni mgeni wetu.', 'Habari! Leo tunasoma methali. Keti kama unataka.'];
export const SCHOOL_DESK = ["Karibu Freddie's School! Mwalimu mkuu yuko ofisini.", 'Habari yako? Karibu sana, jisikie nyumbani.'];
export const SCHOOL_STUDENT = ['Ni Mkurugenzi! Habari yako?', 'Shikamoo! Tunaweza piga selfie baadaye?', 'Mwalimu, ni yeye wa Story Time!'];
export const SCHOOL_PEOPLE: { id: string; x: number; z: number; facing: number; model: 'office' | 'student' | 'young_woman'; pose: 'stand' | 'sit'; name: string; who: 'attendant_m' | 'attendant_f'; greet: string[]; seat?: string }[] = [
  { id: 'teacher', x: -2.6, z: -5.2, facing: 0, model: 'office', pose: 'stand', name: 'Mwalimu Otieno', who: 'attendant_m', greet: SCHOOL_TEACHER },
  { id: 'reception', x: 4.5, z: 3.5, facing: 0, model: 'young_woman', pose: 'stand', name: 'Receptionist', who: 'attendant_f', greet: SCHOOL_DESK },
  ...['f2e--5.6-3.3--0.27', 'f2e--3.75-3.3-0.27', 'f2e--1.9-2.1--0.27', 'f2e--5.6-2.1-0.27', 'f2e--3.75-0.9--0.27', 'f2e--1.9-0.9-0.27', 'f1w-3.6-3.3-0.27', 'f1w-5.9-2.1--0.27'].map((seat, i) => {
    const s = schoolSeats.find((q) => q.id === seat)!;
    return { id: `pupil-${i}`, x: s.x, z: s.z, facing: s.facing, model: 'student' as const, pose: 'sit' as const, name: 'Student', who: 'attendant_f' as const, greet: SCHOOL_STUDENT, seat };
  }),
];

export const ROOM_SEATS: Partial<Record<RoomType, RoomSeat[]>> = {
  int_school: schoolSeats,
  int_hoteli: hoteliSeats,
  int_kinyozi: [
    { id: 'barber-chair', x: 0, z: -1.6, facing: Math.PI, ex: 0.75, ez: -0.95, kind: 'chair' },
    ...[1.5, 0.5, -0.5].map((z, i) => ({ id: `wait-${i}`, x: -2.13, z, facing: Math.PI / 2, ex: -1.5, ez: z, kind: 'bench' as const })),
  ],
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
