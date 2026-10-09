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
  { name: 'Soko la Mkurugenzi (market)', x: -40, z: 60, r: 26, reward: 40 },
  { name: 'Matatu Stage', x: 14, z: 128, r: 24, reward: 40 },
  { name: 'Kibera', x: -300, z: 0, r: 190, reward: 80 },
  { name: 'Rocky Ridge', x: 300, z: 440, r: 150, reward: 60 },
  { name: 'Mkurugenzi Expressway', x: 14, z: -312, r: 40, reward: 30 },
  { name: 'Mtaa wa Mkurugenzi', x: 0, z: 0, r: 160, reward: 25 },
];
