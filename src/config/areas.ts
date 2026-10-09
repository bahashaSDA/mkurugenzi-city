// Named places: shown on the HUD when you enter, and worth a one-time discovery reward.
// Order matters: smaller/more specific areas first.
export interface Area {
  name: string;
  x: number;
  z: number;
  r: number;
  reward: number;
}

export const AREAS: Area[] = [
  { name: 'Soko la Mkurugenzi (market)', x: -40, z: 60, r: 26, reward: 200 },
  { name: 'Matatu Stage', x: 14, z: 128, r: 24, reward: 200 },
  { name: 'Kibera', x: -300, z: 0, r: 190, reward: 500 },
  { name: 'Rocky Ridge', x: 300, z: 440, r: 150, reward: 400 },
  { name: 'Mkurugenzi Expressway', x: 14, z: -312, r: 40, reward: 200 },
  { name: 'CBD: Mkurugenzi Tower', x: 15, z: -1100, r: 330, reward: 800 },
  { name: 'Mkurugenzi Grand Theatre', x: -170, z: -995, r: 45, reward: 500 },
  { name: 'Wakurugenzi Arena', x: 1185, z: -1140, r: 110, reward: 600 },
  { name: 'Mkurugenzi Beach', x: 1530, z: 0, r: 1300, reward: 800 },
  { name: 'Phil-It Studios Town', x: 1150, z: 30, r: 290, reward: 600 },
  { name: 'Utafraaaia Estate', x: -1100, z: -950, r: 360, reward: 600 },
  { name: "Freddie's School Town", x: -1050, z: 780, r: 260, reward: 600 },
  { name: "Storyteller's Fire", x: 340, z: 1215, r: 60, reward: 1000 },
  { name: 'Mtaa wa Mkurugenzi', x: 0, z: 0, r: 160, reward: 100 },
];
