// SPEC section 1 performance budgets. The perf overlay and benchmark compare against these.
export type Tier = 'low' | 'mid' | 'high';

export interface TierBudget {
  targetFps: number;
  maxDrawCalls: number;
  maxTriangles: number;
  maxNpcs: number;
  maxVehicles: number;
  streamRadiusCells: number;
  shadowMapSize: number;
  shadowDistance: number;
  dprMax: number;
}

export const BUDGETS: Record<Tier, TierBudget> = {
  low: {
    targetFps: 30,
    maxDrawCalls: 250,
    maxTriangles: 400_000,
    maxNpcs: 60,
    maxVehicles: 25,
    streamRadiusCells: 1,
    shadowMapSize: 1024,
    shadowDistance: 40,
    dprMax: 1,
  },
  mid: {
    targetFps: 45,
    maxDrawCalls: 500,
    maxTriangles: 1_200_000,
    maxNpcs: 100,
    maxVehicles: 35,
    streamRadiusCells: 2,
    shadowMapSize: 2048,
    shadowDistance: 60,
    dprMax: 1.5,
  },
  high: {
    targetFps: 60,
    maxDrawCalls: 900,
    maxTriangles: 3_000_000,
    maxNpcs: 150,
    maxVehicles: 50,
    streamRadiusCells: 2,
    shadowMapSize: 2048,
    shadowDistance: 80,
    dprMax: 2,
  },
};

export const DPR_MIN = 0.75;
export const FRAME_HITCH_MS = 50;
