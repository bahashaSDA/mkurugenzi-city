// One vector icon set for every map surface (radar, full map, mission panel, the 3D markers'
// sprites): drawn with canvas paths, so they look the same on every device (no emoji fonts) and
// stay crisp at any size. Each icon fits a unit box centred on (0, 0), radius ~1.

export type IconKind =
  | 'camera' | 'clapper' | 'mic' | 'briefcase' | 'cap' | 'masks' | 'pin' | 'car' | 'pen' | 'headphones'
  | 'play' | 'star' | 'people' | 'home' | 'fist' | 'wave' | 'check' | 'flag' | 'cross' | 'bus' | 'cart' | 'cup' | 'bike' | 'lock' | 'fuel';

type G = CanvasRenderingContext2D;

const round = (g: G, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
};

const PATHS: Record<IconKind, (g: G) => void> = {
  camera: (g) => {
    round(g, -0.85, -0.45, 1.25, 0.95, 0.15);
    g.fill();
    g.beginPath();
    g.moveTo(0.42, -0.1);
    g.lineTo(0.9, -0.38);
    g.lineTo(0.9, 0.38);
    g.lineTo(0.42, 0.1);
    g.fill();
    g.beginPath();
    g.arc(-0.45, -0.7, 0.22, 0, Math.PI * 2);
    g.arc(0.05, -0.7, 0.22, 0, Math.PI * 2);
    g.fill();
  },
  clapper: (g) => {
    round(g, -0.85, -0.3, 1.7, 1.05, 0.08);
    g.fill();
    g.save();
    g.translate(-0.85, -0.38);
    g.rotate(-0.28);
    g.fillRect(0, -0.32, 1.72, 0.32);
    g.restore();
  },
  mic: (g) => {
    round(g, -0.3, -0.95, 0.6, 1.15, 0.3);
    g.fill();
    g.lineWidth = 0.16;
    g.beginPath();
    g.arc(0, -0.1, 0.55, 0.1, Math.PI - 0.1);
    g.stroke();
    g.fillRect(-0.08, 0.45, 0.16, 0.35);
    g.fillRect(-0.4, 0.75, 0.8, 0.15);
  },
  briefcase: (g) => {
    round(g, -0.9, -0.45, 1.8, 1.25, 0.15);
    g.fill();
    g.lineWidth = 0.16;
    g.strokeRect(-0.35, -0.75, 0.7, 0.32);
  },
  cap: (g) => {
    g.beginPath();
    g.moveTo(0, -0.75);
    g.lineTo(1, -0.25);
    g.lineTo(0, 0.25);
    g.lineTo(-1, -0.25);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(-0.55, 0);
    g.lineTo(-0.55, 0.45);
    g.quadraticCurveTo(0, 0.8, 0.55, 0.45);
    g.lineTo(0.55, 0);
    g.fill();
    g.fillRect(0.82, -0.25, 0.1, 0.7);
  },
  masks: (g) => {
    g.beginPath();
    g.ellipse(-0.3, -0.1, 0.55, 0.7, -0.2, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(0.38, 0.12, 0.5, 0.65, 0.25, 0, Math.PI * 2);
    g.fill();
  },
  pin: (g) => {
    g.beginPath();
    g.arc(0, -0.25, 0.62, Math.PI * 0.85, Math.PI * 2.15);
    g.lineTo(0, 0.95);
    g.closePath();
    g.fill();
  },
  car: (g) => {
    g.beginPath();
    g.moveTo(-0.95, 0.35);
    g.lineTo(-0.95, -0.05);
    g.lineTo(-0.6, -0.15);
    g.lineTo(-0.35, -0.55);
    g.lineTo(0.4, -0.55);
    g.lineTo(0.65, -0.15);
    g.lineTo(0.95, -0.05);
    g.lineTo(0.95, 0.35);
    g.closePath();
    g.fill();
    g.beginPath();
    g.arc(-0.5, 0.4, 0.25, 0, Math.PI * 2);
    g.arc(0.5, 0.4, 0.25, 0, Math.PI * 2);
    g.fill();
  },
  pen: (g) => {
    g.save();
    g.rotate(Math.PI / 4);
    g.fillRect(-0.18, -0.95, 0.36, 1.4);
    g.beginPath();
    g.moveTo(-0.18, 0.5);
    g.lineTo(0.18, 0.5);
    g.lineTo(0, 0.95);
    g.closePath();
    g.fill();
    g.restore();
  },
  headphones: (g) => {
    g.lineWidth = 0.2;
    g.beginPath();
    g.arc(0, 0.1, 0.75, Math.PI, 0);
    g.stroke();
    round(g, -0.95, 0.05, 0.42, 0.75, 0.12);
    g.fill();
    round(g, 0.53, 0.05, 0.42, 0.75, 0.12);
    g.fill();
  },
  play: (g) => {
    round(g, -0.95, -0.65, 1.9, 1.3, 0.35);
    g.fill();
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.moveTo(-0.22, -0.35);
    g.lineTo(0.38, 0);
    g.lineTo(-0.22, 0.35);
    g.closePath();
    g.fill();
    g.restore();
  },
  star: (g) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.42 : 0.98;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  },
  people: (g) => {
    g.beginPath();
    g.arc(-0.38, -0.45, 0.28, 0, Math.PI * 2);
    g.arc(0.38, -0.45, 0.28, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(-0.38, 0.4, 0.45, 0.45, 0, Math.PI, 0);
    g.ellipse(0.38, 0.4, 0.45, 0.45, 0, Math.PI, 0);
    g.fill();
  },
  home: (g) => {
    g.beginPath();
    g.moveTo(0, -0.9);
    g.lineTo(0.95, -0.05);
    g.lineTo(0.65, -0.05);
    g.lineTo(0.65, 0.85);
    g.lineTo(-0.65, 0.85);
    g.lineTo(-0.65, -0.05);
    g.lineTo(-0.95, -0.05);
    g.closePath();
    g.fill();
  },
  fist: (g) => {
    round(g, -0.7, -0.6, 1.3, 1.1, 0.3);
    g.fill();
    round(g, -0.8, 0.25, 0.75, 0.6, 0.2);
    g.fill();
  },
  wave: (g) => {
    g.lineWidth = 0.22;
    for (const y of [-0.35, 0.25]) {
      g.beginPath();
      g.moveTo(-0.95, y);
      g.bezierCurveTo(-0.5, y - 0.45, -0.3, y + 0.45, 0.05, y);
      g.bezierCurveTo(0.4, y - 0.45, 0.6, y + 0.45, 0.95, y);
      g.stroke();
    }
  },
  check: (g) => {
    g.lineWidth = 0.32;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(-0.65, 0.02);
    g.lineTo(-0.15, 0.5);
    g.lineTo(0.7, -0.45);
    g.stroke();
  },
  flag: (g) => {
    g.fillRect(-0.7, -0.9, 0.16, 1.8);
    g.beginPath();
    g.moveTo(-0.54, -0.9);
    g.lineTo(0.85, -0.55);
    g.lineTo(-0.54, -0.15);
    g.closePath();
    g.fill();
  },
  cross: (g) => {
    g.fillRect(-0.25, -0.85, 0.5, 1.7);
    g.fillRect(-0.85, -0.25, 1.7, 0.5);
  },
  bus: (g) => {
    round(g, -0.95, -0.7, 1.9, 1.3, 0.2);
    g.fill();
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fillRect(-0.75, -0.5, 1.5, 0.45);
    g.restore();
    g.beginPath();
    g.arc(-0.5, 0.65, 0.2, 0, Math.PI * 2);
    g.arc(0.5, 0.65, 0.2, 0, Math.PI * 2);
    g.fill();
  },
  fuel: (g) => {
    // a petrol pump with its hose
    g.fillRect(-0.7, -0.75, 0.9, 1.5);
    g.clearRect(-0.55, -0.6, 0.6, 0.45);
    g.lineWidth = 0.16;
    g.beginPath();
    g.moveTo(0.2, -0.3);
    g.lineTo(0.6, -0.3);
    g.lineTo(0.6, 0.4);
    g.lineTo(0.85, 0.4);
    g.lineTo(0.85, -0.6);
    g.stroke();
  },
  cart: (g) => {
    g.lineWidth = 0.18;
    g.beginPath();
    g.moveTo(-0.95, -0.7);
    g.lineTo(-0.65, -0.7);
    g.lineTo(-0.4, 0.3);
    g.lineTo(0.75, 0.3);
    g.lineTo(0.9, -0.4);
    g.lineTo(-0.55, -0.4);
    g.stroke();
    g.beginPath();
    g.arc(-0.3, 0.7, 0.17, 0, Math.PI * 2);
    g.arc(0.6, 0.7, 0.17, 0, Math.PI * 2);
    g.fill();
  },
  cup: (g) => {
    g.beginPath();
    g.moveTo(-0.7, -0.45);
    g.lineTo(0.5, -0.45);
    g.lineTo(0.38, 0.75);
    g.lineTo(-0.58, 0.75);
    g.closePath();
    g.fill();
    g.lineWidth = 0.16;
    g.beginPath();
    g.arc(0.55, 0.05, 0.3, -Math.PI / 2, Math.PI / 2);
    g.stroke();
    g.beginPath();
    g.moveTo(-0.3, -0.65);
    g.quadraticCurveTo(-0.1, -0.95, -0.25, -1.1);
    g.stroke();
  },
  bike: (g) => {
    g.lineWidth = 0.16;
    g.beginPath();
    g.arc(-0.55, 0.35, 0.38, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(0.55, 0.35, 0.38, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(-0.55, 0.35);
    g.lineTo(-0.1, -0.2);
    g.lineTo(0.35, -0.2);
    g.lineTo(0.55, 0.35);
    g.moveTo(0.35, -0.2);
    g.lineTo(0.2, -0.55);
    g.stroke();
  },
  lock: (g) => {
    round(g, -0.65, -0.1, 1.3, 1.0, 0.15);
    g.fill();
    g.lineWidth = 0.2;
    g.beginPath();
    g.arc(0, -0.15, 0.38, Math.PI, 0);
    g.stroke();
  },
};

/** Draw an icon centred at (x, y), `size` px across, in `color`. */
export function drawIcon(g: G, kind: IconKind, x: number, y: number, size: number, color = '#fff') {
  g.save();
  g.translate(x, y);
  g.scale(size / 2, size / 2);
  g.fillStyle = color;
  g.strokeStyle = color;
  PATHS[kind](g);
  g.restore();
}

// ---- the mission marker system (shared by the radar, the full map and the 3D markers) ----
//
// Colour meaning (one rule everywhere, never colour alone: each state also has its own shape):
//   GREEN  = a mission you can start (available)           rounded square (main) / circle (side)
//   RED    = your ACTIVE objective: go here now            diamond pin with a pulsing ring
//   GREEN + check = completed (full map only, faint)       circle with a tick
//   GREY  + lock  = not available yet (never on the map: missions unlock one by one)
export const MARK = {
  available: '#2fbf71',
  availableDark: '#0f4a2c',
  active: '#e5383b',
  activeDark: '#5c1013',
  completed: '#2fbf71',
  locked: '#7c8187',
  waypoint: '#b46cff',
};

/** Icon for a mission, from its chapter (what the mission is about). */
export function missionIcon(chapter: number, title = ''): IconKind {
  const t = title.toLowerCase();
  if (/race|drive|car|chase/.test(t)) return 'car';
  if (/swim|beach|buoy/.test(t)) return 'wave';
  if (/fight|pirate|brawl/.test(t)) return 'fist';
  return (['home', 'cap', 'pen', 'camera', 'mic', 'masks', 'clapper', 'camera', 'mic', 'headphones', 'briefcase', 'people', 'play', 'star'] as IconKind[])[chapter] ?? 'pin';
}

export const CHAPTER_CATEGORY = [
  'Roots', 'School days', 'Writing', 'Film production', 'Storytelling', 'Theatre', 'Film', 'Film', 'Live show',
  'Podcast', 'Business', 'Community', 'Milestone', 'The big dream',
];
