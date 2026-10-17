import { getGPUTier } from 'detect-gpu';
import type { Tier } from './budgets';

export function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  } catch {
    return false;
  }
}

export type DetectResult = { tier: Tier; tooWeak: boolean; gpu: string };

export const LEARNED_KEY = 'mk.tier.learned.v1';
/** The starting tier came from a previous visit's measurement (don't measure it again). */
export const tierInfo = { learned: false };

// Maps detect-gpu's 0-3 tier to our budgets. Never blocks startup for long: falls back to 'mid'.
export async function detectTier(): Promise<DetectResult> {
  const forced = new URLSearchParams(location.search).get('tier');
  if (forced === 'low' || forced === 'mid' || forced === 'high') {
    return { tier: forced, tooWeak: false, gpu: 'forced' };
  }
  // the tier this machine settled on last time (measured while loading, app/Game Ready): start
  // there, so the splash doesn't step down and prime the world twice again
  try {
    const learned = localStorage.getItem(LEARNED_KEY);
    if (learned === 'low' || learned === 'mid' || learned === 'high') {
      tierInfo.learned = true;
      return { tier: learned, tooWeak: false, gpu: 'learned' };
    }
  } catch {
    /* storage blocked */
  }
  try {
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), 4000));
    // the GPU benchmark tables are served from this site (public/benchmarks), not a CDN round trip
    const res = await Promise.race([getGPUTier({ benchmarksURL: '/benchmarks' }), timeout]);
    if (!res) return { tier: 'mid', tooWeak: false, gpu: 'unknown (timeout)' };
    const gpu = res.gpu ?? 'unknown';
    performance.mark('mk:gpu', { detail: { tier: res.tier, fps: res.fps, gpu, mobile: res.isMobile, type: res.type } });
    if (res.tier === 0) return { tier: 'low', tooWeak: res.type === 'BLOCKLISTED', gpu };
    // Phones, tablets and integrated laptop GPUs start on low: measured on an Intel Iris Xe (rated
    // tier 3, "60 fps"), mid ran 29 fps against its 45 target and low 43, and a wrong first guess
    // costs a second world build and shader compile behind the splash (~8 s, far more on a phone)
    const integrated = /intel|iris|uhd|hd graphics|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics|mali|powervr/i.test(gpu);
    if (res.tier === 1 || res.isMobile || integrated) return { tier: 'low', tooWeak: false, gpu };
    if (res.tier === 2) return { tier: 'mid', tooWeak: false, gpu };
    // "high" only with a clear margin (a wrong high guess means a step down and a second build)
    const strong = (res.fps ?? 0) >= 100;
    return { tier: strong ? 'high' : 'mid', tooWeak: false, gpu };
  } catch {
    return { tier: 'mid', tooWeak: false, gpu: 'unknown (error)' };
  }
}
