import { getHubLayout } from '../districts/hub/layout';
import { KIBERA_HALLS } from '../districts/kibera/layout';
import { LANDMARKS } from '../districts/towns/layout';
import { ROUTES } from '../systems/vehicles/routes';
import { COAST_ROAD_X, shoreX } from '../config/coast';
import { HOSPITALS } from './health';

// Named places that missions send you to. Resolved lazily (layouts are built at runtime).
export interface Place {
  name: string;
  x: number;
  z: number;
}

type Resolver = () => { x: number; z: number };

function piece(name: string, fallback: { x: number; z: number }): Resolver {
  return () => {
    const p = getHubLayout().find((q) => q.piece === name);
    return p ? { x: p.x + Math.sin(p.rotY) * 6, z: p.z + Math.cos(p.rotY) * 6 } : fallback;
  };
}
const lm = (name: string, fb: { x: number; z: number }): Resolver => () => LANDMARKS[name] ?? fb;
const stop = (name: string, fb: { x: number; z: number }): Resolver => () => {
  for (const r of ROUTES) for (const s of r.stops) if (s.name === name) return { x: s.x + 5, z: s.z };
  return fb;
};
const at = (x: number, z: number): Resolver => () => ({ x, z });
const beach = (z: number, off = -35): Resolver => () => ({ x: shoreX(z) + off, z });

/** Grand Theatre (Kenya National Theatre / Nairobi Cinema inspired), CBD. Kept in sync with
 *  districts/theatre/layout.ts. */
export const THEATRE = { x: -170, z: -995, entrance: { x: -170, z: -958 } };

const PLACES: Record<string, Resolver> = {
  // mtaa (hub)
  'Chai Moto Hoteli': piece('shop_hoteli', { x: -6, z: -40 }),
  'Utafraaaia Boutique': piece('shop_boutique', { x: -6, z: 60 }),
  'the barber': piece('shop_barber', { x: 22, z: -10 }),
  'the butchery': piece('shop_butchery', { x: 22, z: 20 }),
  'the electronics shop': piece('shop_electronics', { x: -6, z: -80 }),
  'Soko la Mkurugenzi': at(-44, 62),
  'the matatu stage': at(20, 120),
  'Mtaa wa Mkurugenzi': at(10.5, 36),
  'Mtaa Health Centre': at(HOSPITALS[1]!.x, HOSPITALS[1]!.z),
  // Kibera
  'Kibera Main Lane': stop('Kibera (Main lane)', { x: -145, z: 20 }),
  'the Kibera railway': at(-250, -108),
  'the Kibera video hall': () => KIBERA_HALLS[0] ?? { x: -215, z: 8 },
  'the second video hall': () => KIBERA_HALLS[1] ?? KIBERA_HALLS[0] ?? { x: -300, z: -40 },
  'the top of Kibera hill': at(-430, 10),
  // roads and junctions
  'Expressway Junction': at(14, -300),
  'South Road': at(14, 300),
  'East Road': at(140, -40),
  'Mashinani Junction': at(-500, 520),
  // CBD
  'Mkurugenzi Tower': lm('Mkurugenzi Tower', { x: -18, z: -1100 }),
  'the Grand Theatre': at(THEATRE.entrance.x, THEATRE.entrance.z),
  'CBD East': at(290, -1150),
  'the CBD church': at(-200, -1288),
  'the CBD petrol station': at(120, -808),
  'Wakurugenzi Hospital': at(HOSPITALS[0]!.x, HOSPITALS[0]!.z),
  // towns
  'Wakurugenzi Arena': lm('Wakurugenzi Arena', { x: 1185, z: -1140 }),
  'Phil-It Studios': lm('Phil-It Studios', { x: 1300, z: -150 }),
  'Phil-It Studios Town': at(1100, 20),
  'Utafraaaia Estate': at(-1100, -900),
  'Utafraaaia House': at(-1100, -1300),
  "Freddie's School": lm("Freddie's School", { x: -940, z: 920 }),
  "Freddie's School Town": at(-1046, 760),
  'the media college': at(-860, 700),
  // countryside
  'Rocky Ridge': at(300, 420),
  "the Storyteller's Fire": lm("Storyteller's Fire", { x: 340, z: 1215 }),
  // coast
  'the coast road': at(COAST_ROAD_X, -60),
  'Mkurugenzi Beach': beach(0),
  'the north beach': beach(-700),
  'the south beach': beach(650),
  'the beach kiosk': beach(-120, -60),
  'the swimming buoy': beach(60, 70),
  'the far buoy': beach(-260, 130),
};

export const PLACE_NAMES = Object.keys(PLACES);

export function place(name: string): Place {
  const r = PLACES[name];
  if (!r) throw new Error(`unknown place ${name}`);
  const p = r();
  return { name, x: p.x, z: p.z };
}

/** Places on land reachable on foot from the hub without a car (early missions). */
export const NEAR_PLACES = ['Chai Moto Hoteli', 'Utafraaaia Boutique', 'the barber', 'the butchery', 'the electronics shop', 'Soko la Mkurugenzi', 'the matatu stage', 'Kibera Main Lane', 'the Kibera video hall', 'the Kibera railway', 'East Road', 'South Road', 'Mtaa Health Centre'];
/** Far places (need a car or a matatu). */
export const FAR_PLACES = ['Mkurugenzi Tower', 'the Grand Theatre', 'CBD East', 'Wakurugenzi Arena', 'Phil-It Studios', 'Phil-It Studios Town', 'Utafraaaia Estate', 'Utafraaaia House', "Freddie's School", "Freddie's School Town", 'the media college', 'Rocky Ridge', "the Storyteller's Fire", 'Mkurugenzi Beach', 'the north beach', 'the south beach', 'the beach kiosk', 'the CBD petrol station', 'Mashinani Junction', 'the top of Kibera hill'];
