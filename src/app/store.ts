import { create } from 'zustand';
import type { Tier } from '../perf/budgets';

export type QualitySetting = 'auto' | Tier;
export type CameraMode = 'third' | 'first';

interface GameState {
  phase: 'detecting' | 'splash' | 'playing' | 'fallback';
  tier: Tier;
  quality: QualitySetting;
  gpu: string;
  dpr: number;
  cameraMode: CameraMode;
  activeCells: string[];
  isTouch: boolean;
  setPhase: (p: GameState['phase']) => void;
  setDetected: (tier: Tier, gpu: string) => void;
  setQuality: (q: QualitySetting) => void;
  setDpr: (d: number) => void;
  setTier: (t: Tier) => void;
  toggleCamera: () => void;
  setActiveCells: (cells: string[]) => void;
}

export const useGame = create<GameState>((set) => ({
  phase: 'detecting',
  tier: 'mid',
  quality: 'auto',
  gpu: '',
  dpr: 1,
  cameraMode: 'third',
  activeCells: [],
  isTouch: typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches,
  setPhase: (phase) => set({ phase }),
  setDetected: (tier, gpu) => set({ tier, gpu }),
  setQuality: (quality) => set((s) => (quality === 'auto' ? { quality } : { quality, tier: quality, dpr: Math.min(s.dpr, 2) })),
  setDpr: (dpr) => set({ dpr }),
  setTier: (tier) => set({ tier }),
  toggleCamera: () => set((s) => ({ cameraMode: s.cameraMode === 'third' ? 'first' : 'third' })),
  setActiveCells: (activeCells) => set({ activeCells }),
}));
