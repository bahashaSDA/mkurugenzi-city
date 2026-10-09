import { drive } from '../systems/driving/state';
import { ride } from '../systems/vehicles/state';
import { place, type Place } from './places';
import type { GameEvent } from './events';

// ~200 missions, every one about Mkurugenzi: his public story (Kibera roots, the Freddie years,
// script writing, Phil-It, the lockdown stories, live shows, the premiere, Young & Stupid,
// Headline Hitters, the podcast, the merch, the Wakurugenzi, the Gold Play Button, the arena
// dream). Privacy (SPEC 2.5): no family, no home, no gossip; every other character is invented.
// The player is never told how many there are.

export interface Line {
  who: string;
  text: string;
}

export interface MissionCtx {
  counter: number;
  stepStartedAt: number;
  stepFrom: { x: number; z: number };
}

export interface Step {
  /** Objective text. {Words in braces} are highlighted yellow, GTA style. */
  text: string;
  at?: () => { x: number; z: number; r: number };
  action?: string;
  done?: (e: GameEvent | null, m: MissionCtx) => boolean;
  needCar?: boolean;
  /** Counter objectives (talk to 3 people, knock out 2 pirates, collect 5 pages). */
  count?: number;
  counterLabel?: string;
  /** Seconds allowed for this step (computed when the step starts, from where you are). */
  timer?: (from: { x: number; z: number }) => number;
  /** World entities this step needs (pickups, opponents, a car to chase, a time skip). */
  spawn?: Spawn;
  /** Must be swimming to finish this step. */
  swim?: boolean;
}

export type Spawn =
  | { kind: 'fight'; at: Place; count: number; toughness: number; who: string }
  | { kind: 'collect'; at: Place; count: number; spread: number; item: string }
  | { kind: 'chase'; from: Place; speed: number; tolerance: number; who: string }
  | { kind: 'sunset'; hour: number };

export interface MissionDef {
  id: string;
  chapter: number;
  title: string;
  giver: string;
  /** The cinematic briefing: who says what (2-4 lines). */
  lines: Line[];
  start: () => { x: number; z: number };
  reward: number;
  steps: Step[];
  difficulty: number; // 0..1
  side?: boolean;
}

export const CHAPTERS = [
  'Kibera Beginnings',
  'The Freddie Years',
  'The Script Writer',
  'Phil-It Productions',
  'Lockdown Stories',
  'Live at the Theatre',
  'Click Click Bang',
  'Young and Stupid',
  'Headline Hitters',
  'The Mkurugenzi Podcast',
  'Merch Hustle',
  'Wakurugenzi',
  'The Gold Play Button',
  'The Arena Dream',
];

/** Where the last chase ended (the fight that follows happens right there). */
export const missionScratch = { chaseEnd: { x: 0, z: 0 } };

// ------------------------------------------------------------------ step builders
const P = (n: string) => () => place(n);
const near = (n: string, r: number) => () => ({ ...place(n), r });
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** Timer for a trip: generous early in the game, tighter later, always beatable by car. */
const tripTimer = (to: string, d: number, speed = 13) => (from: { x: number; z: number }) =>
  Math.round(25 + (dist(from, place(to)) / speed) * (1.9 - 0.6 * d));

const go = (where: string, text = `Go to {${where}}.`, r = 8): Step => ({ text, at: near(where, r) });
const getCar = (): Step => ({ text: 'Get a {car} (F at the driver door of any parked car).', done: () => drive.active, needCar: true });
const driveTo = (where: string, d: number, text = `Drive to {${where}}.`, timed = true): Step => ({
  text,
  at: near(where, 14),
  needCar: true,
  done: () => drive.active,
  timer: timed ? tripTimer(where, d) : undefined,
});
const use = (where: string, action: string, text: string, r = 6): Step => ({ text, at: near(where, r), action });
const talk = (where: string, n: number, text: string): Step => ({
  text,
  at: near(where, 40),
  count: n,
  counterLabel: 'people',
  done: (_e, m) => m.counter >= n,
});
const eat = (item: string, where: string, text: string): Step => ({
  text,
  at: near(where, 10),
  done: (e) => e?.type === 'consume' && e.item === item,
});
const watchHall = (where: string): Step => ({
  text: `Watch tonight's story at {${where}} (E).`,
  at: near(where, 8),
  done: (e) => e?.type === 'watch',
});
const rideMatatu = (to: string, _stop: string, sx: number, sz: number): Step[] => [
  { text: 'Board a {matatu} at the stage (F).', at: near('the matatu stage', 12), done: () => ride.vehicle >= 0 },
  { text: `Get off at {${to}}.`, at: () => ({ x: sx, z: sz, r: 60 }), done: (e) => e?.type === 'alight' && Math.hypot(e.x - sx, e.z - sz) < 70 },
];
const fight = (where: string, count: number, d: number, who: string, text: string): Step => ({
  text,
  at: near(where, 30),
  count,
  counterLabel: who,
  spawn: { kind: 'fight', at: place(where), count, toughness: 1 + d * 1.2, who },
  done: (_e, m) => m.counter >= count,
});
const collect = (where: string, count: number, d: number, item: string, text: string): Step => ({
  text,
  at: near(where, 40 + 30 * d),
  count,
  counterLabel: item,
  spawn: { kind: 'collect', at: place(where), count, spread: 18 + 34 * d, item },
  done: (_e, m) => m.counter >= count,
  timer: () => Math.round(70 + count * (30 - 10 * d)),
});
/** A fight right where the chase ended. */
const fightThere = (count: number, d: number, who: string, text: string): Step => ({
  text,
  at: () => ({ ...missionScratch.chaseEnd, r: 30 }),
  count,
  counterLabel: who,
  spawn: { kind: 'fight', at: { name: '@chase', x: 0, z: 0 }, count, toughness: 1 + d * 1.2, who },
  done: (_e, m) => m.counter >= count,
});
const chase = (from: string, d: number, who: string, text: string): Step => ({
  text,
  spawn: { kind: 'chase', from: place(from), speed: 8 + 7 * d, tolerance: 170 - 70 * d, who },
  done: (e) => e?.type === 'use' && e.id === 'chase:caught',
});
const swimTo = (where: string, text = `Swim out to {${where}}.`): Step => ({ text, at: near(where, 6), swim: true });
const sunsetShot = (where: string, text: string): Step => ({
  text,
  at: near(where, 10),
  action: 'Film the golden hour shot',
  spawn: { kind: 'sunset', hour: 18.25 },
});
const raceLegs = (points: string[], d: number): Step[] =>
  points.map((p, i) => ({
    text: i === points.length - 1 ? `Final checkpoint: {${p}}!` : `Checkpoint ${i + 1}: {${p}}.`,
    at: near(p, 18),
    needCar: true,
    done: () => drive.active,
    timer: tripTimer(p, d, 16),
  }));

// ------------------------------------------------------------------ chapter beats
// Each beat builds one mission from (index within chapter, difficulty). Chapters cycle through
// their beats with different places, items and people so no two missions are the same.
type Beat = (k: number, d: number) => Omit<MissionDef, 'id' | 'chapter' | 'reward' | 'difficulty'>;

const pick = <T,>(list: T[], k: number) => list[k % list.length]!;
const TOWNS = ["Freddie's School Town", 'Phil-It Studios Town', 'Utafraaaia Estate', 'Mkurugenzi Tower', 'Wakurugenzi Arena', 'Mkurugenzi Beach', 'CBD East'];
const FOODS: [string, string][] = [['chai', 'a chai'], ['mandazi', 'a mandazi'], ['chips', 'chips'], ['pilau', 'pilau'], ['nyama_choma', 'nyama choma'], ['soda', 'a soda']];

const at = (n: string) => P(n);

const CH: Beat[][] = [
  // 1. Kibera Beginnings: where the stories started (public: grew up in Kibera)
  [
    (k) => ({
      title: pick(['Chai ya Asubuhi', 'Mandazi Morning', 'Breakfast at Chai Moto'], k),
      giver: 'Mama Wanjiku',
      lines: [
        { who: 'Mama Wanjiku', text: 'Mkurugenzi! Hujakunywa chai leo? A storyteller cannot work on an empty stomach.' },
        { who: 'Mkurugenzi', text: 'Mama, I got you. Chai kwanza, then stories.' },
      ],
      start: () => ({ x: 10.5, z: 36 }),
      steps: [go('Chai Moto Hoteli', 'Walk to {Chai Moto Hoteli}.', 6), eat(pick(FOODS, k)[0] === 'chai' ? 'chai' : 'chai', 'Chai Moto Hoteli', 'Buy and drink a {chai} at the hoteli (E).')],
    }),
    (k) => ({
      title: pick(['Story Night in Kibera', 'The Video Hall', 'Kibera Cinema Club'], k),
      giver: 'Conductor Kevo',
      lines: [
        { who: 'Conductor Kevo', text: 'Boss, kuna story mpya kwa video hall ya Kibera leo. The whole lane is going.' },
        { who: 'Mkurugenzi', text: 'Where it all started. Let me go and see how they tell it.' },
        { who: 'Conductor Kevo', text: 'Panda mat pale stage, shuka Kibera Main Lane. Fare ni hamsini tu.' },
      ],
      start: () => ({ x: 20, z: 120 }),
      steps: [...rideMatatu('Kibera Main Lane', 'Kibera (Main lane)', -145, 20), watchHall(pick(['the Kibera video hall', 'the second video hall'], k))],
    }),
    (k, d) => ({
      title: pick(['Along the Railway', 'Railway Walk', 'Tracks and Tales'], k),
      giver: 'Shosh Nyokabi',
      lines: [
        { who: 'Shosh Nyokabi', text: 'Every story in this mtaa walks along that railway line, mwanangu.' },
        { who: 'Shosh Nyokabi', text: 'Go and listen. Talk to the people on the tracks and bring me back three stories.' },
      ],
      start: at('Kibera Main Lane'),
      steps: [go('the Kibera railway', 'Walk to {the Kibera railway}.', 20), talk('the Kibera railway', 2 + Math.floor(d * 3), 'Talk to {people on the railway} (E near someone).'), go('Kibera Main Lane', 'Bring the stories back to {Shosh Nyokabi}.', 10)],
    }),
    (k) => ({
      title: pick(['Market Errand', 'Sokoni', 'Groceries for the Crew'], k),
      giver: 'Mama Mboga Akinyi',
      lines: [
        { who: 'Mama Mboga Akinyi', text: 'You used to carry my sukuma bags for five bob! Now come and buy like a big man.' },
        { who: 'Mkurugenzi', text: 'Hehe, Mama, those days... Utafraaaia, prices zimepanda!' },
      ],
      start: at('Soko la Mkurugenzi'),
      steps: [go('Soko la Mkurugenzi', 'Go into {Soko la Mkurugenzi}.', 20), { text: 'Buy {anything} from a stall (E at a stall).', at: near('Soko la Mkurugenzi', 30), done: (e) => e?.type === 'buy' }],
    }),
    (k, d) => ({
      title: pick(['View from the Hill', 'Top of Kibera', 'Mabati Skyline'], k),
      giver: 'Kamau the Cameraman',
      lines: [
        { who: 'Kamau the Cameraman', text: 'Mkurugenzi, the opening shot of the new story: Kibera rooftops, from the very top of the hill.' },
        { who: 'Mkurugenzi', text: 'Mabati shining like the sea. Let us go and get it.' },
      ],
      start: at('Kibera Main Lane'),
      steps: [go('the top of Kibera hill', 'Climb to {the top of Kibera hill}.', 14), use('the top of Kibera hill', 'Film the rooftops', 'Film {the rooftops} (E).', 14), ...(d > 0.02 ? [go('Kibera Main Lane', 'Back down to {Kibera Main Lane}.', 12)] : [])],
    }),
    (k) => ({
      title: pick(['A Haircut for the Camera', 'Kinyozi', 'Fresh Cut'], k),
      giver: 'Barber Juma',
      lines: [
        { who: 'Barber Juma', text: 'Hii kichwa haiwezi enda kwa camera hivi, boss. Sit down.' },
        { who: 'Mkurugenzi', text: 'Juma, just a clean one. Not like last time. Last time was a story by itself.' },
      ],
      start: () => ({ x: 10.5, z: 30 }),
      steps: [go('the barber', 'Go to {the barber}.', 6), use('the barber', 'Get a haircut', 'Sit in {the chair} (E).')],
    }),
  ],
  // 2. The Freddie Years (the high-school drama role; fictional school name)
  [
    (k, d) => ({
      title: pick(['First Day on Set', 'Call Time', 'Late for Set'], k),
      giver: 'Stage Manager Akinyi',
      lines: [
        { who: 'Stage Manager Akinyi', text: "Freddie! Call time was ten minutes ago. Freddie's School set, now!" },
        { who: 'Mkurugenzi', text: 'The matatu was full, Akinyi! I am coming, I am coming.' },
      ],
      start: at('the matatu stage'),
      steps: [getCar(), driveTo("Freddie's School", d, "Get to {Freddie's School} before the scene starts.")],
    }),
    (k) => ({
      title: pick(['Running Lines', 'The Script Pages', 'Lines, Freddie!'], k),
      giver: 'Mwalimu Omondi',
      lines: [
        { who: 'Mwalimu Omondi', text: 'Freddie, the wind took your script all over the compound. Pick up every page.' },
        { who: 'Mkurugenzi', text: 'Every page? Even the ones where Freddie gets caught?' },
      ],
      start: at("Freddie's School Town"),
      steps: [collect("Freddie's School", 3 + (k % 3), 0.2 + 0.1 * (k % 4), 'script pages', 'Collect the {script pages} blowing around the school.'), use("Freddie's School", 'Hand in the script', 'Give the pages to {Mwalimu Omondi} (E).', 10)],
    }),
    (k, d) => ({
      title: pick(['Mischief Scene', 'Freddie Strikes Again', 'The Prank'], k),
      giver: 'Director Muriuki',
      lines: [
        { who: 'Director Muriuki', text: 'In this scene Freddie runs from the deputy. Through the compound, out the gate, to the shopping centre.' },
        { who: 'Mkurugenzi', text: 'Freddie always runs. Freddie was born running.' },
      ],
      start: at("Freddie's School"),
      steps: [go("Freddie's School Town", "Run to {Freddie's School Town} (the scene!).", 16), ...(d > 0.1 ? [go("Freddie's School", 'Sneak back to {the school gate}.', 12)] : [])],
    }),
    (k) => ({
      title: pick(['The Media College', 'Learning the Craft', 'Camera School'], k),
      giver: 'Tutor Wambui',
      lines: [
        { who: 'Tutor Wambui', text: 'Talent is not enough, Abel. Come to class: lighting, sound, scripts. The craft.' },
        { who: 'Mkurugenzi', text: 'Mwalimu, I am ready. Show me how the camera sees.' },
      ],
      start: at("Freddie's School Town"),
      steps: [go('the media college', 'Go to {the media college}.', 12), use('the media college', 'Attend the class', 'Attend {the class} (E).', 12), talk("Freddie's School Town", 2, 'Interview {people in town} for your class project.')],
    }),
    (k, d) => ({
      title: pick(['Back to the Mtaa', 'Weekend Home', 'The Long Ride Home'], k),
      giver: 'Conductor Kevo',
      lines: [
        { who: 'Conductor Kevo', text: 'Freddie wa TV! Kila mtu anakujua sasa. Come, I will take you back to the mtaa.' },
        { who: 'Mkurugenzi', text: 'Kevo, sasa nikilipa fare ama bure? Haha.' },
      ],
      start: at("Freddie's School Town"),
      steps: [getCar(), driveTo('Mtaa wa Mkurugenzi', d, 'Drive back to {the mtaa}.')],
    }),
  ],
  // 3. The Script Writer (wrote for TV comedies: names invented)
  [
    (k, d) => ({
      title: pick(['Script Run', 'Deadline Delivery', 'Episode 12'], k),
      giver: 'Producer Otieno',
      lines: [
        { who: 'Producer Otieno', text: 'We shoot in two hours and I have no script! Abel, tell me you finished it.' },
        { who: 'Mkurugenzi', text: 'Finished at 4am, Otieno. I got you. Where do I bring it?' },
        { who: 'Producer Otieno', text: 'Phil-It Studios. Haraka!' },
      ],
      start: at('the electronics shop'),
      steps: [use('the electronics shop', 'Print the script', 'Print {the script} at the cyber (E).'), getCar(), driveTo('Phil-It Studios', d, 'Deliver the script to {Phil-It Studios} before the shoot.')],
    }),
    (k, d) => ({
      title: pick(['Real People, Real Stories', 'Research', 'Overheard in the Matatu'], k),
      giver: 'Mkurugenzi',
      lines: [
        { who: 'Mkurugenzi', text: 'The funniest lines are never written. They are overheard. In matatus, in markets, in queues.' },
        { who: 'Mkurugenzi', text: 'Today we listen.' },
      ],
      start: at('the matatu stage'),
      steps: [talk(pick(['the matatu stage', 'Soko la Mkurugenzi', 'Kibera Main Lane'], k), 3 + Math.floor(d * 2), 'Listen to {people} for story ideas (E near someone).'), go('Chai Moto Hoteli', 'Write it all down at {Chai Moto Hoteli}.', 6)],
    }),
    (k, d) => ({
      title: pick(['Table Read', 'The Writers Room', 'Read Through'], k),
      giver: 'Producer Otieno',
      lines: [
        { who: 'Producer Otieno', text: 'The cast is waiting at the Tower for the table read. Bring the pages and bring the jokes.' },
        { who: 'Mkurugenzi', text: 'If they do not laugh, I will laugh for them.' },
      ],
      start: at('Utafraaaia Boutique'),
      steps: [getCar(), driveTo('Mkurugenzi Tower', d), use('Mkurugenzi Tower', 'Lead the table read', 'Lead {the table read} (E).', 12)],
    }),
    (k) => ({
      title: pick(['Inspiration at the Ridge', 'Clear Your Head', 'Writer’s Block'], k),
      giver: 'Mkurugenzi',
      lines: [
        { who: 'Mkurugenzi', text: 'Blank page. Three days. When the words hide, you go where it is quiet.' },
        { who: 'Mkurugenzi', text: 'Rocky Ridge. Just the wind and the city.' },
      ],
      start: at('South Road'),
      steps: [go('Rocky Ridge', 'Find quiet at {Rocky Ridge}.', 14), use('Rocky Ridge', 'Write', 'Sit and {write} (E).', 14)],
    }),
    (k, d) => ({
      title: pick(['Matatu Writers Club', 'Script on the Move', 'Route 33'], k),
      giver: 'Conductor Kevo',
      lines: [
        { who: 'Conductor Kevo', text: 'You write best in my nganya, admit it. The bass, the people, the drama.' },
        { who: 'Mkurugenzi', text: 'Kevo, the bass is why I need a new script. But sawa, let us ride to tao.' },
      ],
      start: at('the matatu stage'),
      steps: [...rideMatatu('Mkurugenzi Tower', 'CBD: Mkurugenzi Tower', 14, -1090), ...(d > 0.15 ? [go('the Grand Theatre', 'Walk to {the Grand Theatre} to see the venue.', 10)] : [])],
    }),
  ],
  // 4. Phil-It Productions (co-founded production company)
  [
    (k, d) => ({
      title: pick(['Gear Run', 'Lights, Stands, Cables', 'Hire House'], k),
      giver: 'Kamau the Cameraman',
      lines: [
        { who: 'Kamau the Cameraman', text: 'The lights we hired are at the Tower and the shoot is at the studios. Si you have a car?' },
        { who: 'Mkurugenzi', text: 'Production company ya watu wawili. Director, writer, driver. Twende.' },
      ],
      start: at('Phil-It Studios Town'),
      steps: [getCar(), driveTo('Mkurugenzi Tower', d, 'Pick up the lights at {Mkurugenzi Tower}.'), use('Mkurugenzi Tower', 'Load the lights', 'Load {the lights} (E).', 14), driveTo('Phil-It Studios', d, 'Bring them to {Phil-It Studios}.')],
    }),
    (k, d) => ({
      title: pick(['Location Scout', 'Scouting', 'Find the Look'], k),
      giver: 'Phil-It Studios',
      lines: [
        { who: 'Phil-It Studios', text: 'The new film needs three locations. Something rough, something beautiful, something with a view.' },
        { who: 'Mkurugenzi', text: 'Rough I know. Beautiful I know. Let me take the car.' },
      ],
      start: at('Phil-It Studios Town'),
      steps: [
        getCar(),
        driveTo(pick(['Rocky Ridge', 'the top of Kibera hill', 'Mashinani Junction'], k), d, undefined, false),
        use(pick(['Rocky Ridge', 'the top of Kibera hill', 'Mashinani Junction'], k), 'Scout this location', 'Scout {the location} (E).', 16),
        driveTo(pick(["the Storyteller's Fire", 'Mkurugenzi Beach', 'Utafraaaia House'], k), d, undefined, false),
        use(pick(["the Storyteller's Fire", 'Mkurugenzi Beach', 'Utafraaaia House'], k), 'Scout this location', 'Scout {the location} (E).', 16),
      ],
    }),
    (k, d) => ({
      title: pick(['Catering Crisis', 'Feed the Crew', 'Lunch Break'], k),
      giver: 'Stage Manager Akinyi',
      lines: [
        { who: 'Stage Manager Akinyi', text: 'Thirty crew members, no lunch. If they get hungry, they become actors. Bad actors.' },
        { who: 'Mkurugenzi', text: 'Pilau for everyone. Leave it to me.' },
      ],
      start: at('Phil-It Studios'),
      steps: [getCar(), driveTo('Chai Moto Hoteli', d, 'Get food from {Chai Moto Hoteli}.'), use('Chai Moto Hoteli', 'Order 30 plates', 'Order {food for the crew} (E).', 8), driveTo('Phil-It Studios', d, 'Get the food to {Phil-It Studios} while it is hot.')],
    }),
    (k, d) => ({
      title: pick(['Generator Thieves', 'Set Protection', 'Not Our Cables!'], k),
      giver: 'Kamau the Cameraman',
      lines: [
        { who: 'Kamau the Cameraman', text: 'Some guys are walking off with our cables at the studio! Boss, those are hired!' },
        { who: 'Mkurugenzi', text: 'Hired cables? Utafraaaia. Not today.' },
      ],
      start: at('Phil-It Studios Town'),
      steps: [fight('Phil-It Studios', 1 + Math.floor(d * 2.5), d, 'thieves', 'Stop {the cable thieves} at the studio!'), use('Phil-It Studios', 'Coil the cables', 'Recover {the cables} (E).', 14)],
    }),
    (k) => ({
      title: pick(['Golden Hour', 'Magic Hour', 'The Last Light'], k),
      giver: 'Director of Photography Wanjiku',
      lines: [
        { who: 'Director of Photography Wanjiku', text: 'Twenty minutes of perfect light a day. If we miss it, we wait until tomorrow.' },
        { who: 'Mkurugenzi', text: 'Then we will not miss it.' },
      ],
      start: at('Phil-It Studios Town'),
      steps: [getCar(), driveTo(pick(['Mkurugenzi Beach', "the Storyteller's Fire", 'Rocky Ridge'], k), 0.3, undefined, false), sunsetShot(pick(['Mkurugenzi Beach', "the Storyteller's Fire", 'Rocky Ridge'], k), 'Film the {sunset} (E).')],
    }),
  ],
  // 5. Lockdown Stories (the YouTube storytelling era begins)
  [
    (k) => ({
      title: pick(['Ring Light', 'Home Studio', 'One Camera, One Chair'], k),
      giver: 'Mkurugenzi',
      lines: [
        { who: 'Mkurugenzi', text: 'Everything shut. No sets, no crew. Just a chair, a camera and a story.' },
        { who: 'Mkurugenzi', text: 'First, a ring light. The electronics shop should have one.' },
      ],
      start: at('Mtaa wa Mkurugenzi'),
      steps: [go('the electronics shop', 'Go to {the electronics shop}.', 6), use('the electronics shop', 'Buy a ring light', 'Buy {a ring light} (E).'), go('Utafraaaia Boutique', 'Set up the home studio behind {the boutique}.', 8)],
    }),
    (k, d) => ({
      title: pick(['Young and Stupid, Episode One', 'The First Upload', 'Press Record'], k),
      giver: 'Mkurugenzi',
      lines: [
        { who: 'Mkurugenzi', text: 'Ladies and gentlemen, Wakurugenzi... I got you. This one happened. I promise.' },
        { who: 'Mkurugenzi', text: 'Now: upload. The internet at the cyber is faster than mine.' },
      ],
      start: at('Utafraaaia Boutique'),
      steps: [use('Utafraaaia Boutique', 'Record the story', 'Record {the story} (E).', 8), go('the electronics shop', 'Upload it at {the cyber}.', 6), use('the electronics shop', 'Upload', 'Upload {the episode} (E).'), talk('Soko la Mkurugenzi', 2 + Math.floor(d * 3), 'Tell {people in the market} to watch it.')],
    }),
    (k, d) => ({
      title: pick(['Story Hunting', 'Your Stories, Wakurugenzi', 'Fan Mail'], k),
      giver: 'Mkurugenzi',
      lines: [
        { who: 'Mkurugenzi', text: 'The comments are full of stories. Real ones. Let me go and meet these people.' },
      ],
      start: at('the matatu stage'),
      steps: [talk(pick(['Kibera Main Lane', 'the matatu stage', 'Soko la Mkurugenzi'], k), 3, 'Collect stories from {people} (E).'), getCar(), driveTo(pick(TOWNS, k), d, `Meet the fan with the craziest story in {${pick(TOWNS, k)}}.`), use(pick(TOWNS, k), 'Listen', 'Listen to {the story} (E).', 16)],
    }),
    (k) => ({
      title: pick(['Thumbnail Day', 'The Perfect Thumbnail', 'Face for the Thumbnail'], k),
      giver: 'Kamau the Cameraman',
      lines: [
        { who: 'Kamau the Cameraman', text: 'A story is only as good as its thumbnail. We need the face. The UTAFRAAAIA face.' },
        { who: 'Mkurugenzi', text: 'This face? (makes the face)' },
      ],
      start: at('Mkurugenzi Tower'),
      steps: [use('Mkurugenzi Tower', 'Pose for the thumbnail', 'Shoot {the thumbnail} at the Tower (E).', 14), use('the Grand Theatre', 'Pose for the thumbnail', 'Second shot at {the Grand Theatre} (E).', 12)],
    }),
  ],
  // 6. Live at the Theatre (first live audiences, then the bigger cinema show)
  [
    (k, d) => ({
      title: pick(['Ticket Sales', 'Three Hundred Seats', 'Sold Out?'], k),
      giver: 'Stage Manager Akinyi',
      lines: [
        { who: 'Stage Manager Akinyi', text: 'First live show. Three hundred seats. We have sold... forty.' },
        { who: 'Mkurugenzi', text: 'Forty! Then we go to the people. Kila mtaa.' },
      ],
      start: at('the Grand Theatre'),
      steps: [talk(pick(['Soko la Mkurugenzi', 'the matatu stage', 'Kibera Main Lane'], k), 3 + Math.floor(d * 2), 'Sell tickets to {people} (E near someone).'), getCar(), driveTo('the Grand Theatre', d, 'Bring the ticket money to {the Grand Theatre}.')],
    }),
    (k, d) => ({
      title: pick(['Showtime', 'Curtain Call', 'Do Not Be Late'], k),
      giver: 'Stage Manager Akinyi',
      lines: [
        { who: 'Stage Manager Akinyi', text: 'Doors open in minutes! Where are you?!' },
        { who: 'Mkurugenzi', text: 'Traffic, Akinyi! Nairobi traffic! I am coming!' },
      ],
      start: at(pick(['Phil-It Studios Town', 'Utafraaaia Estate', "Freddie's School Town"], k)),
      steps: [getCar(), driveTo('the Grand Theatre', Math.min(1, d + 0.1), 'Get to {the Grand Theatre} before the doors open!'), use('the Grand Theatre', 'Take the stage', 'Go in and {take the stage} (E).', 10)],
    }),
    (k) => ({
      title: pick(['Merch Table', 'Hoodies at the Door', 'Show Merch'], k),
      giver: 'Utafraaaia Boutique',
      lines: [
        { who: 'Utafraaaia Boutique', text: 'The fans want hoodies at the show! Two boxes are packed, take them to the theatre.' },
      ],
      start: at('Utafraaaia Boutique'),
      steps: [use('Utafraaaia Boutique', 'Pick up the merch boxes', 'Pick up {the merch boxes} (E).'), getCar(), driveTo('the Grand Theatre', 0.3 + (k % 3) * 0.2, 'Deliver them to {the Grand Theatre}.'), use('the Grand Theatre', 'Set up the merch table', 'Set up {the merch table} (E).', 10)],
    }),
    (k, d) => ({
      title: pick(['Scalpers', 'Fake Tickets', 'Ticket Touts'], k),
      giver: 'Fan Club Chair Wanjiru',
      lines: [
        { who: 'Fan Club Chair Wanjiru', text: 'Some touts are selling fake tickets outside the theatre! Our people are getting conned!' },
        { who: 'Mkurugenzi', text: 'Conning Wakurugenzi? Mimi nitawaambia story yao.' },
      ],
      start: at('Mkurugenzi Tower'),
      steps: [fight('the Grand Theatre', 1 + Math.floor(d * 3), d, 'touts', 'Chase off {the ticket touts} at the theatre!')],
    }),
    (k) => ({
      title: pick(['Front Row', 'A Night at the Theatre', 'Watch the Recording'], k),
      giver: 'Stage Manager Akinyi',
      lines: [
        { who: 'Stage Manager Akinyi', text: 'They are screening last night’s recording at the Grand Theatre. You should watch it with an audience. Learn.' },
        { who: 'Mkurugenzi', text: 'Watching myself? Utafraaaia... but sawa.' },
      ],
      start: at('Mkurugenzi Tower'),
      steps: [go('the Grand Theatre', 'Go to {the Grand Theatre}.', 10), { text: 'Buy a ticket and {watch an episode} inside.', at: near('the Grand Theatre', 70), done: (e) => e?.type === 'theatre' }],
    }),
  ],
  // 7. Click Click Bang (the record-breaking premiere: event logistics, fictional award names)
  [
    (k, d) => ({
      title: pick(['Premiere Night', 'Red Carpet Run', 'Two Thousand Five Hundred'], k),
      giver: 'Producer Otieno',
      lines: [
        { who: 'Producer Otieno', text: 'Two thousand five hundred people. A record! And the film reels are still at the studio!' },
        { who: 'Mkurugenzi', text: 'Reels, the most important passenger. Nobody touches them.' },
      ],
      start: at('Mkurugenzi Tower'),
      steps: [getCar(), driveTo('Phil-It Studios', d, 'Pick up {the film} at Phil-It Studios.'), use('Phil-It Studios', 'Collect the film', 'Collect {the film} (E).', 14), driveTo('the Grand Theatre', Math.min(1, d + 0.15), 'Rush the film to {the Grand Theatre}!')],
    }),
    (k, d) => ({
      title: pick(['Pirate Hunter', 'Bootleg Benja', 'Copy Right?'], k),
      giver: 'Producer Otieno',
      lines: [
        { who: 'Producer Otieno', text: 'Bootleg DVDs of our film are on sale already! Some guy called Benja, he is driving off now!' },
        { who: 'Mkurugenzi', text: 'One day old and he is selling it? Follow that car!' },
      ],
      start: at('the matatu stage'),
      steps: [getCar(), chase(pick(['East Road', 'South Road', 'Expressway Junction'], k), d, 'Bootleg Benja', 'Catch {Bootleg Benja} (get close to his car).'), fightThere(1 + Math.floor(d * 2), d, 'pirates', 'Deal with {Benja and his crew}.')],
    }),
    (k) => ({
      title: pick(['Awards Night', 'Six Trophies', 'The Simba Awards'], k),
      giver: 'Stage Manager Akinyi',
      lines: [
        { who: 'Stage Manager Akinyi', text: 'We won six! The team is at the Tower and the trophies are... heavy.' },
        { who: 'Mkurugenzi', text: 'Heavy is good. Heavy means we worked.' },
      ],
      start: at('Mkurugenzi Tower'),
      steps: [use('Mkurugenzi Tower', 'Pick up the trophies', 'Collect {the trophies} (E).', 14), getCar(), driveTo('Phil-It Studios', 0.4 + (k % 4) * 0.12, 'Bring them home to {Phil-It Studios}.')],
    }),
    (k, d) => ({
      title: pick(['Press Run', 'Interviews', 'Radio Rounds'], k),
      giver: 'Publicist Nduta',
      lines: [
        { who: 'Publicist Nduta', text: 'Three interviews, three places, one hour. Go!' },
      ],
      start: at('Mkurugenzi Tower'),
      steps: [getCar(), ...raceLegs([pick(['CBD East', 'Wakurugenzi Arena', 'the CBD petrol station'], k), pick(['Phil-It Studios Town', 'Expressway Junction'], k + 1), pick(['Mkurugenzi Tower', 'the Grand Theatre'], k)], d)],
    }),
  ],
  // 8. Young and Stupid (fictional comic tales in the style of the show)
  [
    (k, d) => ({
      title: pick(['The Borrowed Car', 'Uncle’s Car', 'Just Around the Block'], k),
      giver: 'Mkurugenzi',
      lines: [
        { who: 'Mkurugenzi', text: 'This one is a story about a boy, a borrowed car, and a promise to be back by six.' },
        { who: 'Mkurugenzi', text: 'Ladies and gentlemen: young. And stupid.' },
      ],
      start: at('South Road'),
      steps: [getCar(), ...raceLegs([pick(['Rocky Ridge', 'East Road', 'Expressway Junction'], k), pick(['Mashinani Junction', 'Kibera Main Lane'], k), 'South Road'], d)],
    }),
    (k, d) => ({
      title: pick(['The Wrong Matatu', 'Kumbe Si Route Yangu', 'Last Stop'], k),
      giver: 'Mkurugenzi',
      lines: [
        { who: 'Mkurugenzi', text: 'Have you ever boarded a matatu so confidently, only to realise it is going the other way?' },
      ],
      start: at('the matatu stage'),
      steps: [...rideMatatu(pick(['Kibera Main Lane', 'Mkurugenzi Tower'], k), 'x', pick([-145, 14], k), pick([20, -1090], k)), ...(d > 0.2 ? [go('the matatu stage', 'Find your way back to {the stage}.', 12)] : [])],
    }),
    (k, d) => ({
      title: pick(['Ocean Dare', 'To the Buoy', 'Swim, Freddie, Swim'], k),
      giver: 'Mkurugenzi',
      lines: [
        { who: 'Mkurugenzi', text: 'A dare at the beach. The buoy. Nobody said how far it was. Nobody said I could barely swim.' },
      ],
      start: at('the coast road'),
      steps: [go('Mkurugenzi Beach', 'Walk down to {the beach}.', 20), swimTo(d > 0.5 ? 'the far buoy' : 'the swimming buoy'), go('Mkurugenzi Beach', 'Swim back to {the beach}.', 20)],
    }),
    (k, d) => ({
      title: pick(['Kibanda Brawl', 'The Pool Table', 'Wrong Answer'], k),
      giver: 'Mkurugenzi',
      lines: [
        { who: 'Mkurugenzi', text: 'Never, ever tell a man at a pool table that he is losing. I learned that... the hard way.' },
      ],
      start: at('Kibera Main Lane'),
      steps: [fight(pick(['Kibera Main Lane', 'the Kibera railway', 'East Road'], k), 1 + Math.floor(d * 3), d, 'angry players', 'Survive {the angry pool players}!'), go('Mtaa Health Centre', 'Get checked at {the health centre}.', 8)],
    }),
    (k, d) => ({
      title: pick(['Night Out', 'Curfew', 'Back Before the Gate Closes'], k),
      giver: 'Mkurugenzi',
      lines: [
        { who: 'Mkurugenzi', text: 'Boarding school. A party in town. A gate that locks at nine. You can guess the rest.' },
      ],
      start: at("Freddie's School"),
      steps: [getCar(), driveTo("Freddie's School Town", d, 'Sneak out to {town}.'), use("Freddie's School Town", 'Join the party', 'Join {the party} (E).', 16), driveTo("Freddie's School", Math.min(1, d + 0.2), 'Get back to {school} before the gate locks!')],
    }),
  ],
  // 9. Headline Hitters (news retold as stories)
  [
    (k, d) => ({
      title: pick(['Breaking', 'The Lead', 'Front Page'], k),
      giver: 'Researcher Baraka',
      lines: [
        { who: 'Researcher Baraka', text: 'Big story, Mkurugenzi. Three witnesses in three towns. We record tonight.' },
        { who: 'Mkurugenzi', text: 'Headline Hitters. Let us hit.' },
      ],
      start: at('Mkurugenzi Tower'),
      steps: [getCar(), driveTo(pick(TOWNS, k), d), use(pick(TOWNS, k), 'Interview the witness', 'Interview {the witness} (E).', 16), driveTo(pick(TOWNS, k + 2), d), use(pick(TOWNS, k + 2), 'Interview the witness', 'Interview {the second witness} (E).', 16), driveTo('Mkurugenzi Tower', d, 'Back to {the Tower} to record.')],
    }),
    (k, d) => ({
      title: pick(['Source in Kibera', 'The Informant', 'Off the Record'], k),
      giver: 'Researcher Baraka',
      lines: [
        { who: 'Researcher Baraka', text: 'My source will only talk in person. In Kibera. And he says people are following him.' },
      ],
      start: at('Mkurugenzi Tower'),
      steps: [...rideMatatu('Kibera Main Lane', 'x', -145, 20), go('the Kibera railway', 'Meet the source on {the railway}.', 16), fight('the Kibera railway', 1 + Math.floor(d * 2.5), d, 'goons', 'Protect {the source}!')],
    }),
    (k, d) => ({
      title: pick(['Fact Check', 'Who Said That?', 'Verify'], k),
      giver: 'Researcher Baraka',
      lines: [{ who: 'Researcher Baraka', text: 'Before we tell it, we check it. Ask around. Three people who were there.' }],
      start: at('the matatu stage'),
      steps: [talk(pick(['the matatu stage', 'Soko la Mkurugenzi', 'Kibera Main Lane'], k), 3 + Math.floor(d * 2), 'Ask {people who were there} (E).')],
    }),
    (k, d) => ({
      title: pick(['Deadline', 'Studio by Eight', 'Live at Eight'], k),
      giver: 'Researcher Baraka',
      lines: [{ who: 'Researcher Baraka', text: 'The episode goes out at eight. The edit is at the studio and you are... where are you?' }],
      start: at(pick(['Utafraaaia Estate', 'Mkurugenzi Beach', "Freddie's School Town"], k)),
      steps: [getCar(), driveTo('Phil-It Studios', Math.min(1, d + 0.2), 'Race to {Phil-It Studios}!')],
    }),
  ],
  // 10. The Mkurugenzi Podcast (guests are invented)
  [
    (k, d) => ({
      title: pick(['Guest Pickup', 'The Guest Is Waiting', 'Mic Check'], k),
      giver: 'Podcast Producer Njeri',
      lines: [
        { who: 'Podcast Producer Njeri', text: 'Our guest is waiting at ' + pick(TOWNS, k) + '. Bring them to the Tower. Gently. No crazy driving.' },
        { who: 'Mkurugenzi', text: 'Gently. Me? Always.' },
      ],
      start: at('Mkurugenzi Tower'),
      steps: [getCar(), driveTo(pick(TOWNS, k), d, `Pick up the guest at {${pick(TOWNS, k)}}.`, false), use(pick(TOWNS, k), 'Pick up the guest', 'Pick up {the guest} (E).', 16), driveTo('Mkurugenzi Tower', d, 'Drive the guest to {the Tower}.')],
    }),
    (k) => ({
      title: pick(['Microphones', 'Studio Upgrade', 'New Mics'], k),
      giver: 'Podcast Producer Njeri',
      lines: [{ who: 'Podcast Producer Njeri', text: 'Two mics died yesterday. The electronics shop has new ones.' }],
      start: at('Mkurugenzi Tower'),
      steps: [getCar(), driveTo('the electronics shop', 0.3, undefined, false), use('the electronics shop', 'Buy microphones', 'Buy {microphones} (E).'), driveTo('Mkurugenzi Tower', 0.4, 'Back to {the studio}.')],
    }),
    (k, d) => ({
      title: pick(['Listener Questions', 'Ask Mkurugenzi', 'Voices of the Mtaa'], k),
      giver: 'Podcast Producer Njeri',
      lines: [{ who: 'Podcast Producer Njeri', text: 'This episode is all listener questions. Go and collect them, Mkurugenzi. Real voices.' }],
      start: at('the matatu stage'),
      steps: [talk(pick(['Soko la Mkurugenzi', 'the matatu stage', 'Kibera Main Lane'], k), 3 + Math.floor(d * 2), 'Record {listener questions} (E near someone).'), go(pick(['Chai Moto Hoteli', 'Utafraaaia Boutique'], k), 'Edit them at {the hoteli}.', 6)],
    }),
    (k) => ({
      title: pick(['Episode by the Sea', 'Beach Episode', 'Sound of Waves'], k),
      giver: 'Podcast Producer Njeri',
      lines: [{ who: 'Podcast Producer Njeri', text: 'Special episode: recorded at the beach. Waves in the background. Very deep, very serious.' }, { who: 'Mkurugenzi', text: 'Very deep. Like the buoy you made me swim to.' }],
      start: at('Mkurugenzi Tower'),
      steps: [getCar(), driveTo('the beach kiosk', 0.3, undefined, false), use('the beach kiosk', 'Record the episode', 'Record {the episode} (E).', 10), eat(pick(['soda', 'chai'], k), 'the beach kiosk', 'Get a {drink} at the kiosk.')],
    }),
  ],
  // 11. Merch Hustle
  [
    (k, d) => ({
      title: pick(['Hoodies for ', 'Caps for ', 'Tees for ', 'Orders for '], k) + pick(TOWNS, k),
      giver: 'Utafraaaia Boutique',
      lines: [
        { who: 'Utafraaaia Boutique', text: `New order! ${pick(['Twelve hoodies', 'A box of caps', 'Fifteen tees', 'A mixed box'], k)} for a customer in ${pick(TOWNS, k)}. They have an event tonight.` },
        { who: 'Mkurugenzi', text: 'Delivered by the founder himself. Premium service.' },
      ],
      start: at('Utafraaaia Boutique'),
      steps: [use('Utafraaaia Boutique', 'Pick up the box', 'Pick up {the merch box} (E).'), getCar(), driveTo(pick(TOWNS, k), d, `Deliver to {${pick(TOWNS, k)}}.`), use(pick(TOWNS, k), 'Hand over the box', 'Hand over {the box} (E).', 16)],
    }),
    (k, d) => ({
      title: pick(['Fake Merch', 'Counterfeits', 'MK? Not Us'], k),
      giver: 'Utafraaaia Boutique',
      lines: [{ who: 'Utafraaaia Boutique', text: 'Someone is selling fake MK hoodies at ' + pick(['the matatu stage', 'Soko la Mkurugenzi', 'Kibera Main Lane'], k) + '. Bad stitching, wrong logo. Embarrassing!' }],
      start: at('Utafraaaia Boutique'),
      steps: [fight(pick(['the matatu stage', 'Soko la Mkurugenzi', 'Kibera Main Lane'], k), 1 + Math.floor(d * 3), d, 'counterfeiters', 'Shut down {the counterfeit sellers}!'), collect(pick(['the matatu stage', 'Soko la Mkurugenzi', 'Kibera Main Lane'], k), 3 + Math.floor(d * 3), d, 'fake hoodies', 'Collect {the fake hoodies}.')],
    }),
    (k, d) => ({
      title: pick(['Restock', 'Warehouse Run', 'Stock Day'], k),
      giver: 'Utafraaaia Boutique',
      lines: [{ who: 'Utafraaaia Boutique', text: 'We are sold out! The new stock is at Phil-It Studios.' }],
      start: at('Utafraaaia Boutique'),
      steps: [getCar(), driveTo('Phil-It Studios', d, undefined, true), use('Phil-It Studios', 'Load the stock', 'Load {the stock} (E).', 14), driveTo('Utafraaaia Boutique', d, 'Back to {the boutique}.')],
    }),
    (k, d) => ({
      title: pick(['Merch Drop', 'Pop-up Shop', 'Flash Sale'], k),
      giver: 'Fan Club Chair Wanjiru',
      lines: [{ who: 'Fan Club Chair Wanjiru', text: 'Pop-up merch drop! Tell everyone, the first ones get signed caps!' }],
      start: at('Utafraaaia Boutique'),
      steps: [talk(pick(['the matatu stage', 'Soko la Mkurugenzi'], k), 3 + Math.floor(d * 3), 'Tell {people} about the drop (E).'), use('Utafraaaia Boutique', 'Open the pop-up', 'Open {the pop-up} (E).')],
    }),
  ],
  // 12. Wakurugenzi (the fans)
  [
    (k, d) => ({
      title: pick(['Fan Meet', 'Selfies', 'Wakurugenzi Wakikutana'], k),
      giver: 'Fan Club Chair Wanjiru',
      lines: [{ who: 'Fan Club Chair Wanjiru', text: 'The fans are at ' + pick(TOWNS, k) + '! Just a few minutes, Mkurugenzi, they have waited all day.' }, { who: 'Mkurugenzi', text: 'For Wakurugenzi? I have all the minutes.' }],
      start: at('Mkurugenzi Tower'),
      steps: [getCar(), driveTo(pick(TOWNS, k), d), talk(pick(TOWNS, k), 3 + Math.floor(d * 2), 'Greet {the fans} (E).')],
    }),
    (k, d) => ({
      title: pick(['Phone Snatcher', 'Thief!', 'Mwizi!'], k),
      giver: 'A fan',
      lines: [{ who: 'A fan', text: 'Mkurugenzi! That guy took my phone! It has all my selfies with you!' }],
      start: at(pick(['the matatu stage', 'Soko la Mkurugenzi', 'Kibera Main Lane'], k)),
      steps: [getCar(), chase(pick(['East Road', 'South Road', 'Kibera Main Lane'], k), d, 'the thief', 'Catch {the thief}!'), fightThere(1, d, 'thief', 'Get {the phone} back!')],
    }),
    (k) => ({
      title: pick(['Storyteller’s Fire', 'Stories by the Fire', 'Campfire'], k),
      giver: 'Fan Club Chair Wanjiru',
      lines: [{ who: 'Fan Club Chair Wanjiru', text: 'The fan club is camping at the Storyteller’s Fire. Just one story, please, please.' }, { who: 'Mkurugenzi', text: 'One story. Okay. Two. Maybe three...' }],
      start: at('South Road'),
      steps: [getCar(), driveTo("the Storyteller's Fire", 0.3, undefined, false), use("the Storyteller's Fire", 'Tell a story', 'Tell {a story} by the fire (E).', 12)],
    }),
    (k, d) => ({
      title: pick(['Hecklers', 'Order at the Show', 'Respect the Story'], k),
      giver: 'Stage Manager Akinyi',
      lines: [{ who: 'Stage Manager Akinyi', text: 'A gang outside the theatre is harassing the fans. Security is overwhelmed!' }],
      start: at('Mkurugenzi Tower'),
      steps: [fight('the Grand Theatre', 2 + Math.floor(d * 2), d, 'hecklers', 'Clear {the hecklers} from the theatre steps!')],
    }),
  ],
  // 13. The Gold Play Button (the million-subscriber milestone)
  [
    (k, d) => ({
      title: pick(['Viral Shot', 'The Content Run', 'B-roll Day'], k),
      giver: 'Kamau the Cameraman',
      lines: [{ who: 'Kamau the Cameraman', text: 'For the million special: shots from all over the city. Fast, before the light changes.' }],
      start: at('Mkurugenzi Tower'),
      steps: [getCar(), ...raceLegs([pick(TOWNS, k), pick(TOWNS, k + 3), pick(['Rocky Ridge', 'Mkurugenzi Beach', "the Storyteller's Fire"], k)], d), use(pick(['Rocky Ridge', 'Mkurugenzi Beach', "the Storyteller's Fire"], k), 'Film the shot', 'Film {the shot} (E).', 18)],
    }),
    (k, d) => ({
      title: pick(['Sunset Special', 'Golden Million', 'Thank You Wakurugenzi'], k),
      giver: 'Kamau the Cameraman',
      lines: [{ who: 'Kamau the Cameraman', text: 'The thank-you video, at sunset, by the sea. One take.' }],
      start: at('the coast road'),
      steps: [go('Mkurugenzi Beach', 'Go to {the beach}.', 16), sunsetShot('Mkurugenzi Beach', 'Record {the thank-you} at sunset (E).'), ...(d > 0.6 ? [swimTo('the swimming buoy', 'Celebrate: swim to {the buoy}!')] : [])],
    }),
    (k) => ({
      title: pick(['The Gold Play Button', 'Delivery from YouTube', 'It Is Gold'], k),
      giver: 'Podcast Producer Njeri',
      lines: [{ who: 'Podcast Producer Njeri', text: 'A package arrived at the Tower. It is heavy and it is GOLD!' }, { who: 'Mkurugenzi', text: 'One million Wakurugenzi. I got you. You got me.' }],
      start: at('Phil-It Studios Town'),
      steps: [getCar(), driveTo('Mkurugenzi Tower', 0.5), use('Mkurugenzi Tower', 'Unbox the Gold Play Button', 'Unbox {the Gold Play Button} (E).', 14)],
    }),
  ],
  // 14. The Arena Dream (the 20,000-seat arena Abel has publicly called for)
  [
    (k, d) => ({
      title: pick(['Twenty Thousand Seats', 'The Dream', 'Bigger Than a Theatre'], k),
      giver: 'Mkurugenzi',
      lines: [{ who: 'Mkurugenzi', text: 'Kigali has one. Why not us? Twenty thousand seats, for our stories, our music, our people.' }, { who: 'Mkurugenzi', text: 'First, I need to see the arena with my own eyes.' }],
      start: at('Mkurugenzi Tower'),
      steps: [getCar(), driveTo('Wakurugenzi Arena', d), use('Wakurugenzi Arena', 'Walk the arena', 'Walk {the arena floor} (E).', 20)],
    }),
    (k, d) => ({
      title: pick(['Investors', 'The Pitch', 'Convince Them'], k),
      giver: 'Producer Otieno',
      lines: [{ who: 'Producer Otieno', text: 'Three investors, three towns, one pitch. Make them believe.' }],
      start: at('Mkurugenzi Tower'),
      steps: [getCar(), ...[pick(TOWNS, k), pick(TOWNS, k + 2), pick(TOWNS, k + 4)].flatMap((t) => [driveTo(t, d), use(t, 'Pitch the arena', 'Pitch {the arena} (E).', 16)])],
    }),
    (k, d) => ({
      title: pick(['Arena Night', 'Wakurugenzi Wote', 'The Biggest Story'], k),
      giver: 'Fan Club Chair Wanjiru',
      lines: [{ who: 'Fan Club Chair Wanjiru', text: 'Every Mkurugenzi fan in the country is at the arena tonight. Every single one!' }, { who: 'Mkurugenzi', text: 'Then let us tell them the biggest story yet.' }],
      start: at('Mkurugenzi Tower'),
      steps: [getCar(), driveTo('Wakurugenzi Arena', Math.min(1, d + 0.1), 'Get to {Wakurugenzi Arena}!'), fight('Wakurugenzi Arena', 2 + Math.floor(d * 2), d, 'gatecrashers', 'Stop {the gatecrashers}!'), use('Wakurugenzi Arena', 'Take the stage', 'Take {the stage} (E).', 20)],
    }),
  ],
];

/** Missions per chapter (sums to 200). */
const COUNTS = [14, 14, 14, 14, 14, 16, 14, 16, 14, 14, 16, 14, 14, 12];

/** GTA-like pay: grows steadily; chapter finales pay double. Sum of the first 50 is ~KSh 70,000. */
function rewardFor(i: number, finale: boolean) {
  const base = 400 + 40 * i;
  return Math.round((finale ? base * 2 : base) / 50) * 50;
}

function build(): MissionDef[] {
  const out: MissionDef[] = [];
  let i = 0;
  CH.forEach((beats, c) => {
    for (let k = 0; k < COUNTS[c]!; k++) {
      const d = Math.min(1, i / 199);
      const beat = beats[k % beats.length]!(Math.floor(k / beats.length) + k, d);
      const finale = k === COUNTS[c]! - 1;
      out.push({
        ...beat,
        id: i === 0 ? 'chai' : `m${String(i).padStart(3, '0')}`,
        chapter: c,
        reward: rewardFor(i, finale),
        difficulty: d,
        title: finale ? `${beat.title} (Finale)` : beat.title,
      });
      i++;
    }
  });
  return out;
}

export const MISSION_LIST: MissionDef[] = build();
