import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useGame } from '../app/store';
import { MAPRENDER } from '../perf/MapRender';

// Tiered post-processing (VISUAL_OVERHAUL 42 / SPEC 10.7). Subtle on purpose: it grounds
// objects and smooths edges; it must never hide weak assets.
//   low : no composer; the renderer applies AgX tone mapping directly (cheapest)
//   mid : SMAA + light bloom + AgX
//   high: N8AO contact shadows (half-res) + SMAA + light bloom + faint vignette + AgX
const NOPOST = typeof location !== 'undefined' && new URLSearchParams(location.search).has('nopost'); // perf experiments

export function PostFX() {
  const tier = useGame((s) => s.tier);
  if (tier === 'low' || NOPOST) return null;
  // photographing the satellite map: no vignette or screen-space AO (they'd darken every tile edge)
  const high = tier === 'high' && !MAPRENDER;
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {/* AO only where it's on: N8AO at intensity 0 computes pow(ao, 0), undefined for ao = 0, and
          the NaN it writes is spread over the whole frame by the bloom blur: a black screen */}
      {high ? (
        <N8AO aoRadius={1.6} distanceFalloff={1.2} intensity={2.2} quality="performance" halfRes color="#2a1d14" />
      ) : (
        <></>
      )}
      <Bloom mipmapBlur intensity={0.22} luminanceThreshold={0.92} luminanceSmoothing={0.2} />
      <Vignette darkness={high ? 0.28 : 0} offset={0.32} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      <SMAA />
    </EffectComposer>
  );
}
