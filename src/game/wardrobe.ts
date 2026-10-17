import { create } from 'zustand';
import { useEconomy } from './economy';
import { emit } from './events';

// Abel's wardrobe and haircuts (Parts 9, 10, 21.3). Owned outfits, the outfit he wears, the haircuts
// he has had and the one he has now; previews in a shop never cost anything. Persisted per browser
// like the wallet (versioned key; unknown or missing fields fall back to defaults, never crash).
//
// Rules:
//   * the tweed suit ("signature") is always owned and can always be put back on
//   * buying an outfit charges once, after an explicit confirm, then he wears it; owned outfits are
//     re-worn for free; buying again is impossible (no double charge)
//   * a haircut is a service at the kinyozi: a new style costs its price; a style he has had before
//     is redone free; the house buzz cut is always free
//   * the flat cap is his own accessory: on or off at the boutique mirror (big hair hides it)
// The meshes come from blender/scripts/build_wardrobe.py (systems/player/wardrobe binds them).

export interface Outfit { id: string; name: string; price: number; desc: string; merch?: boolean }
export interface Haircut { id: string; name: string; price: number; desc: string; hidesCap?: boolean }

export const DEFAULT_OUTFIT = 'signature';
export const DEFAULT_HAIR = 'buzz';

// Mkurugenzi range at the mkurugenzi.ke prices (same as the old boutique list), plus street wear
export const OUTFITS: Outfit[] = [
  { id: DEFAULT_OUTFIT, name: 'Signature tweed', price: 0, desc: 'Brown tweed jacket, white shirt and tie. His own.' },
  { id: 'hoodie_black', name: 'Black Excellence hoodie', price: 3000, desc: 'Black hoodie and joggers, MK chest logo.', merch: true },
  { id: 'hoodie_sand', name: 'Desert Sand hoodie', price: 3000, desc: 'Sand hoodie with jeans, brown MK logo.', merch: true },
  { id: 'tee_burgundy', name: 'Burgundy Bliss T-shirt', price: 1500, desc: 'Burgundy tee and jeans, MK logo.', merch: true },
  { id: 'tee_botanical', name: 'Botanical T-shirt', price: 1800, desc: 'White botanical print tee, MK chest logo, jeans.', merch: true },
  { id: 'track_coffee', name: 'Sweatsuit (Coffee Brown)', price: 6500, desc: 'Crewneck and joggers, script logo.', merch: true },
  { id: 'casual_khaki', name: 'Khaki shirt and chinos', price: 2200, desc: 'Pressed and ready for the office.' },
  { id: 'casual_navy', name: 'Navy jumper, charcoal trousers', price: 2800, desc: 'Smart casual for a cool Nairobi evening.' },
  { id: 'overalls', name: 'Jua kali overalls', price: 1200, desc: 'Blue work overalls. Tough as a garage floor.' },
];

// Kinyozi prices in KSh (a Nairobi barbershop, 2026)
export const HAIRCUTS: Haircut[] = [
  { id: DEFAULT_HAIR, name: 'House buzz cut', price: 0, desc: 'Close all over, the way he likes it.' },
  { id: 'short_natural', name: 'Short natural', price: 250, desc: 'Even all over, a little length on top.' },
  { id: 'taper', name: 'Taper', price: 350, desc: 'Tapered at the back and sides, neat neckline.' },
  { id: 'classic', name: 'Classic short', price: 300, desc: 'Side-parted short cut.' },
  { id: 'textured', name: 'Textured top', price: 400, desc: 'Short sides, textured length on top.' },
  { id: 'afro', name: 'Afro', price: 600, desc: 'Grown out, picked and shaped.', hidesCap: true },
];

const KEY = 'mk.wardrobe.v1';
// garments the old boutique sold as bag items (they never changed his look): owners get the outfit
const LEGACY: Record<string, string> = { hoodie: 'hoodie_black', tee: 'tee_botanical', tee_plain: 'tee_burgundy', sweatsuit: 'track_coffee', quarterzip: 'hoodie_black', jacket: 'hoodie_black' };

interface Saved {
  v: 1;
  owned: string[];
  outfit: string;
  cuts: string[]; // haircuts he has had
  hair: string;
  cap: boolean;
}

function defaults(): Saved {
  return { v: 1, owned: [DEFAULT_OUTFIT], outfit: DEFAULT_OUTFIT, cuts: [DEFAULT_HAIR], hair: DEFAULT_HAIR, cap: true };
}

const knownOutfit = (id: unknown): id is string => typeof id === 'string' && OUTFITS.some((o) => o.id === id);
const knownCut = (id: unknown): id is string => typeof id === 'string' && HAIRCUTS.some((h) => h.id === id);

function load(): Saved {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Partial<Saved>) : {};
    const owned = new Set([DEFAULT_OUTFIT, ...(Array.isArray(s.owned) ? s.owned.filter(knownOutfit) : [])]);
    // migrate garments bought as items before outfits existed
    const inv = useEconomy.getState().inventory;
    for (const [item, outfit] of Object.entries(LEGACY)) if ((inv[item] ?? 0) > 0) owned.add(outfit);
    const cuts = new Set([DEFAULT_HAIR, ...(Array.isArray(s.cuts) ? s.cuts.filter(knownCut) : [])]);
    return {
      v: 1,
      owned: [...owned],
      outfit: knownOutfit(s.outfit) && owned.has(s.outfit) ? s.outfit : d.outfit,
      cuts: [...cuts],
      hair: knownCut(s.hair) && cuts.has(s.hair) ? s.hair : d.hair,
      cap: typeof s.cap === 'boolean' ? s.cap : d.cap,
    };
  } catch {
    return d;
  }
}

function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, owned: s.owned, outfit: s.outfit, cuts: s.cuts, hair: s.hair, cap: s.cap }));
  } catch {
    useEconomy.getState().toast("Couldn't save your wardrobe (storage blocked)", 'info');
  }
}

interface WardrobeState extends Saved {
  /** what the shop mirror shows (not owned yet, nothing charged); null = what he wears */
  preview: { outfit?: string; hair?: string; cap?: boolean } | null;
  /** a purchase in flight: further buy presses are ignored until it settles */
  busy: boolean;
  previewOutfit: (id: string | null) => void;
  previewHair: (id: string | null) => void;
  clearPreview: () => void;
  wear: (id: string) => boolean;
  buyOutfit: (id: string) => boolean;
  cut: (id: string) => boolean;
  setCap: (on: boolean) => void;
}

export const useWardrobe = create<WardrobeState>((set, get) => ({
  ...load(),
  preview: null,
  busy: false,
  previewOutfit: (id) => set((s) => ({ preview: { ...s.preview, outfit: id ?? undefined } })),
  previewHair: (id) => set((s) => ({ preview: { ...s.preview, hair: id ?? undefined } })),
  clearPreview: () => set({ preview: null }),
  wear: (id) => {
    const s = get();
    if (!s.owned.includes(id)) return false;
    set({ outfit: id, preview: null });
    save(get());
    return true;
  },
  buyOutfit: (id) => {
    const s = get();
    const o = OUTFITS.find((x) => x.id === id);
    if (!o || s.busy) return false;
    if (s.owned.includes(id)) return get().wear(id); // already his: no charge
    set({ busy: true });
    try {
      if (!useEconomy.getState().spend(o.price, o.name)) {
        emit({ type: 'buyFailed', item: id });
        return false;
      }
      set({ owned: [...get().owned, id], outfit: id, preview: null });
      save(get());
      emit({ type: 'buy', item: id });
      return true;
    } finally {
      set({ busy: false });
    }
  },
  cut: (id) => {
    const s = get();
    const h = HAIRCUTS.find((x) => x.id === id);
    if (!h || s.busy) return false;
    const free = s.cuts.includes(id);
    set({ busy: true });
    try {
      if (!free && !useEconomy.getState().spend(h.price, `Haircut: ${h.name}`)) {
        emit({ type: 'buyFailed', item: id });
        return false;
      }
      set({ hair: id, cuts: free ? s.cuts : [...s.cuts, id], preview: s.preview?.cap === undefined ? null : { cap: s.preview.cap } });
      save(get());
      emit({ type: 'buy', item: id });
      return true;
    } finally {
      set({ busy: false });
    }
  },
  setCap: (on) => {
    set({ cap: on });
    save(get());
  },
}));

/** What Abel should look like right now: the preview in a shop, else what he wears. */
export function lookNow(s: Pick<WardrobeState, 'outfit' | 'hair' | 'cap' | 'preview'>) {
  const outfit = s.preview?.outfit ?? s.outfit;
  const hair = s.preview?.hair ?? s.hair;
  const cut = HAIRCUTS.find((h) => h.id === hair);
  return { outfit, hair, cap: (s.preview?.cap ?? s.cap) && !cut?.hidesCap };
}
