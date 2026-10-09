import { create } from 'zustand';
import { ITEMS } from './catalog';
import { emit } from './events';

// Money wallet (Kenyan shillings, KSh), inventory, fullness and discoveries. Persisted per browser (localStorage, wrapped
// in try/catch: private windows and blocked storage must never break the game).

const KEY = 'mk.economy.v2'; // v2: points -> KSh
const START_MONEY = 1000;

export interface Toast {
  id: number;
  text: string;
  kind: 'earn' | 'spend' | 'info';
}

interface Saved {
  money: number; // KSh
  inventory: Record<string, number>;
  fullness: number;
  discovered: string[];
  metres: number;
}

interface EconomyState extends Saved {
  shop: string | null; // open shop id
  area: string; // current named place
  video: { id: string; title: string } | null;
  watched: string[];
  openVideo: (id: string | null, title?: string) => void;
  toasts: Toast[];
  action: { clip: string; until: number; prop: Prop } | null; // eating/drinking animation request
  earn: (n: number, why: string) => void;
  spend: (n: number, why: string) => boolean;
  buy: (itemId: string, eatNow: boolean) => boolean;
  consume: (itemId: string) => boolean;
  discover: (area: string, reward: number) => void;
  walked: (m: number) => void;
  openShop: (id: string | null) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  tick: (dt: number) => void;
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults(), ...(JSON.parse(raw) as Partial<Saved>) };
  } catch {
    /* storage unavailable */
  }
  return defaults();
}

function defaults(): Saved {
  return { money: START_MONEY, inventory: {}, fullness: 70, discovered: [], metres: 0 };
}

let saveTimer = 0;
function save(s: Saved) {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      const { money, inventory, fullness, discovered, metres } = s;
      localStorage.setItem(KEY, JSON.stringify({ money, inventory, fullness, discovered, metres }));
    } catch {
      /* ignore */
    }
  }, 500);
}

let toastId = 1;

/** What Abel holds while eating/drinking, and for how long (a meal takes several bites). */
export type Prop = 'bottle' | 'cup' | 'fruit' | 'snack' | 'plate' | '';
const FRUITS = ['banana', 'mango', 'avocado', 'orange', 'pineapple', 'watermelon', 'sugarcane'];
function propFor(itemId: string): { prop: Prop; ms: number } {
  const item = ITEMS[itemId]!;
  if (itemId === 'chai') return { prop: 'cup', ms: 4200 };
  if (item.kind === 'drink') return { prop: 'bottle', ms: 3800 };
  if (FRUITS.includes(itemId)) return { prop: 'fruit', ms: 4500 };
  if (item.fullness >= 25) return { prop: 'plate', ms: 9000 };
  return { prop: 'snack', ms: 4500 };
}

export const useEconomy = create<EconomyState>((set, get) => ({
  ...load(),
  shop: null,
  area: '',
  video: null,
  watched: [],
  openVideo: (id, title = '') => {
    set({ video: id ? { id, title } : null });
    if (id) {
      document.exitPointerLock?.();
      emit({ type: 'watch', video: id });
      if (!get().watched.includes(id)) {
        set((s) => ({ watched: [...s.watched, id] }));
        get().earn(100, 'Watched a Mkurugenzi story');
      }
    }
  },
  toasts: [],
  action: null,
  toast: (text, kind = 'info') => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3200);
  },
  earn: (n, why) => {
    set((s) => ({ money: s.money + n }));
    get().toast(`+KSh ${n.toLocaleString()} · ${why}`, 'earn');
    save(get());
  },
  spend: (n, why) => {
    if (get().money < n) {
      get().toast(`Pesa haitoshi: ${why} costs KSh ${n.toLocaleString()}`, 'info');
      return false;
    }
    set((s) => ({ money: s.money - n }));
    get().toast(`-KSh ${n.toLocaleString()} · ${why}`, 'spend');
    save(get());
    return true;
  },
  buy: (itemId, eatNow) => {
    const item = ITEMS[itemId];
    if (!item || !get().spend(item.price, item.name)) return false;
    emit({ type: 'buy', item: itemId });
    if (eatNow && item.fullness > 0) return get().consume(itemId) || true;
    set((s) => ({ inventory: { ...s.inventory, [itemId]: (s.inventory[itemId] ?? 0) + (eatNow ? 0 : 1) } }));
    save(get());
    return true;
  },
  consume: (itemId) => {
    const item = ITEMS[itemId];
    if (!item) return false;
    const inv = { ...get().inventory };
    if (inv[itemId]) inv[itemId]! -= 1;
    if (inv[itemId] === 0) delete inv[itemId];
    set((s) => ({
      inventory: inv,
      fullness: Math.min(100, s.fullness + item.fullness),
      action: { clip: 'Consume', until: performance.now() + propFor(itemId).ms, prop: propFor(itemId).prop },
    }));
    get().toast(item.kind === 'drink' ? `Drank ${item.name}` : `Ate ${item.name}`, 'info');
    emit({ type: 'consume', item: itemId });
    save(get());
    return true;
  },
  discover: (area, reward) => {
    if (get().discovered.includes(area)) return;
    set((s) => ({ discovered: [...s.discovered, area] }));
    get().earn(reward, `Discovered ${area}`);
  },
  walked: (m) => {
    const before = Math.floor(get().metres / 100);
    set((s) => ({ metres: s.metres + m }));
    const after = Math.floor(get().metres / 100);
    if (after > before) get().earn(10, 'Exploring the mtaa');
  },
  openShop: (id) => {
    set({ shop: id });
    if (id) document.exitPointerLock?.();
  },
  tick: (dt) => {
    set((s) => ({ fullness: Math.max(0, s.fullness - dt / 18) })); // ~30 min from full to empty
  },
}));
