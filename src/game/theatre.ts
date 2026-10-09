import { create } from 'zustand';
import * as THREE from 'three';
import { useEconomy } from './economy';
import { emit } from './events';
import { loadContent, onlyAvailable } from '../content/episodes';
import { PRICE } from '../districts/theatre/layout';

// The Grand Theatre night out: buy a ticket at the booth (expensive: earned with missions), find
// your seat, and the episode plays on the big screen in the hall, with the house around you.
interface TheatreState {
  ticket: boolean;
  seated: boolean;
  video: { id: string; title: string } | null;
  buy: () => void;
  sit: () => void;
  leave: () => void;
}

export const useTheatre = create<TheatreState>((set, get) => ({
  ticket: false,
  seated: false,
  video: null,
  buy: () => {
    const eco = useEconomy.getState();
    if (get().ticket) {
      eco.toast('You already have a ticket: find your seat (Row J, seat 17).', 'info');
      return;
    }
    if (eco.money < PRICE) {
      eco.toast(`A night at the Grand Theatre is KSh ${PRICE.toLocaleString()}. Finish more missions and come back.`, 'info');
      return;
    }
    if (!eco.spend(PRICE, 'Grand Theatre ticket')) return;
    set({ ticket: true });
    eco.toast('Ticket: Row J, seat 17. Enjoy the show, Mkurugenzi!', 'earn');
  },
  sit: () => {
    if (!get().ticket) {
      useEconomy.getState().toast('Usher: "Ticket please, boss." (buy one at the booth in the lobby)', 'info');
      return;
    }
    set({ seated: true });
    void loadContent()
      .then((c) => onlyAvailable(c.episodes.slice(0, 40)))
      .then((pool) => {
        const ep = pool[Math.floor(Math.random() * pool.length)];
        if (ep && get().seated) {
          set({ video: { id: ep.youtubeId, title: ep.title } });
          emit({ type: 'theatre', video: ep.youtubeId });
        }
      });
  },
  leave: () => set({ seated: false, video: null, ticket: false }),
}));

/** Where Abel sits (set by the theatre, read by the player controller). Feet position, facing. */
export const seat = { active: false, x: 0, y: 0, z: 0, facing: 0, camX: 0, camY: 0, camZ: 0, lookX: 0, lookY: 0, lookZ: 0, exitX: 0, exitY: 0, exitZ: 0 };

/** 0 outside, 1 inside a big building: the sky light dims like your eyes adjusting. */
export const indoor = { target: 0, value: 0 };

/** The screen's glow on the audience (always in the scene, dark unless a show is on). */
export const screenLight = (() => {
  const l = new THREE.SpotLight('#aac4ff', 0, 70, 0.9, 0.7, 1.2);
  l.castShadow = false;
  return l;
})();
