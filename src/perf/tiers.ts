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

// Maps detect-gpu's 0-3 tier to our budgets. Never blocks startup for long: falls back to 'mid'.
export async function detectTier(): Promise<DetectResult> {
  const forced = new URLSearchParams(location.search).get('tier');
  if (forced === 'low' || forced === 'mid' || forced === 'high') {
    return { tier: forced, tooWeak: false, gpu: 'forced' };
  }
  try {
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), 4000));
    const res = await Promise.race([getGPUTier(), timeout]);
    if (!res) return { tier: 'mid', tooWeak: false, gpu: 'unknown (timeout)' };
    const gpu = res.gpu ?? 'unknown';
    if (res.tier === 0) return { tier: 'low', tooWeak: res.type === 'BLOCKLISTED', gpu };
    if (res.tier === 1) return { tier: 'low', tooWeak: false, gpu };
    if (res.tier === 2) return { tier: 'mid', tooWeak: false, gpu };
    return { tier: res.isMobile ? 'mid' : 'high', tooWeak: false, gpu };
  } catch {
    return { tier: 'mid', tooWeak: false, gpu: 'unknown (error)' };
  }
}
