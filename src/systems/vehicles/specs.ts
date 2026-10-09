// Vehicle specs mirrored from blender/scripts/build_vehicles_kit.py (Blender -> three: x, z_b, -y_b).
// Vehicles face local +Z. Kenya is right-hand drive: the driver sits on the RIGHT (local -X) and the
// passenger/conductor door is on the LEFT (local +X).

export type VehicleKind = 'matatu' | 'nganya' | 'bus' | 'car';

export interface VehicleSpec {
  kind: VehicleKind;
  pieces: string[]; // kit piece variants
  length: number;
  width: number;
  height: number;
  seatY: number; // seat surface height above ground
  floorY: number; // cabin floor height above ground (feet of seated/standing passengers)
  seats: [number, number][]; // passenger seat anchors (local x, z)
  stand: [number, number][]; // standing spots in the aisle when full
  door: [number, number]; // local x, z of the passenger door (outside edge)
  fare: number;
  music: 'nganya' | 'radio' | 'none';
  townSpeed: number; // m/s
}

const flipY = (pts: [number, number][]) => pts.map(([x, y]) => [x, -y] as [number, number]);

export const SPECS: Record<VehicleKind, VehicleSpec> = {
  matatu: {
    kind: 'matatu',
    // real VW Crafter (sketchfab, baked by build_real_kit.py): NTSA white x2, black "Story Time" pimped
    pieces: ['rv_matatu_0', 'rv_matatu_1', 'rv_matatu_2'],
    length: 5.94, width: 1.94, height: 2.14, seatY: 0.82, floorY: 0.45,
    seats: flipY([[-0.55, -0.55], [0, -0.55], [0.55, -0.55], [-0.55, 0.35], [0, 0.35], [0.55, 0.35],
      [-0.55, 1.25], [0, 1.25], [0.55, 1.25], [-0.55, 2.1], [0, 2.1], [0.55, 2.1]]),
    stand: [[0.6, 1.4]],
    door: [1.0, 0.6],
    fare: 50, music: 'radio', townSpeed: 9.5,
  },
  nganya: {
    kind: 'nganya',
    pieces: ['rv_nganya_0', 'rv_nganya_1', 'rv_nganya_2'], // real Isuzu NQR nganya, airbrushed liveries
    length: 7.6, width: 2.2, height: 2.46, seatY: 1.0, floorY: 0.6,
    seats: flipY(Array.from({ length: 24 }, (_, k) => [[-0.75, -0.3, 0.55][k % 3]!, -2.6 + 0.75 * Math.floor(k / 3)] as [number, number])),
    stand: [[0.15, 1.6], [0.15, 0.6], [0.15, -0.4], [0.15, -1.4]],
    door: [1.2, 2.6],
    fare: 80, music: 'nganya', townSpeed: 9,
  },
  bus: {
    kind: 'bus',
    pieces: ['rv_nganya_0', 'rv_nganya_2'], // until a real Sacco bus model is downloaded (tools/sketchfab-models.json)
    length: 8.2, width: 2.35, height: 3.0, seatY: 1.05, floorY: 0.62,
    seats: flipY(Array.from({ length: 27 }, (_, k) => [[-0.75, -0.3, 0.55][k % 3]!, -2.9 + 0.75 * Math.floor(k / 3)] as [number, number])),
    stand: [[0.15, 1.8], [0.15, 0.8], [0.15, -0.2], [0.15, -1.2]],
    door: [1.22, 3.0],
    fare: 40, music: 'radio', townSpeed: 8.5,
  },
  car: {
    kind: 'car',
    pieces: ['rv_car_0', 'rv_car_1', 'rv_car_2', 'rv_car_3'],
    length: 4.28, width: 1.8, height: 1.49, seatY: 0.6, floorY: 0.35,
    seats: [], stand: [], door: [0.9, 0],
    fare: 0, music: 'none', townSpeed: 11,
  },
};
