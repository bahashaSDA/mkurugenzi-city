import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { KitInstances } from '../../world/kit/KitInstances';
import { useKit, wind } from '../../world/kit/useKit';
import { Cables } from '../../world/Cables';
import { getHubLayout } from './layout';

export const HUB_KIT_URL = '/models/hub_kit.glb';
export const STREET_KIT_URL = '/models/street_kit.glb';

/** Advances the shared wind clock used by foliage materials. */
function WindClock() {
  useFrame((_, dt) => {
    wind.uTime.value += dt;
  });
  return null;
}

/** Mtaa wa Mkurugenzi: Blender-built kit pieces placed from the data layout. */
export function Hub({ render = true }: { render?: boolean }) {
  const hubKit = useKit(HUB_KIT_URL);
  const streetKit = useKit(STREET_KIT_URL);
  const placements = useMemo(() => getHubLayout(), []);
  const hubPlacements = useMemo(() => placements.filter((p) => hubKit.has(p.piece)), [placements, hubKit]);
  const streetPlacements = useMemo(() => placements.filter((p) => streetKit.has(p.piece)), [placements, streetKit]);
  useEffect(() => {
    const mk = (window as unknown as { __mk?: Record<string, unknown> }).__mk;
    if (mk) mk.hubPlacements = placements; // ?debug only: lets tests find real buildings
  }, [placements]);
  return (
    <>
      <KitInstances kit={hubKit} placements={hubPlacements} render={render} />
      <KitInstances kit={streetKit} placements={streetPlacements} render={render} />
      {render && <Cables placements={placements} />}
      {render && <WindClock />}
    </>
  );
}
