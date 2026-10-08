import { useEffect, useMemo } from 'react';
import { KitInstances } from '../../world/kit/KitInstances';
import { useKit } from '../../world/kit/useKit';
import { getHubLayout } from './layout';

export const HUB_KIT_URL = '/models/hub_kit.glb';

/** Mtaa wa Mkurugenzi: Blender-built kit pieces placed from the data layout. */
export function Hub({ render = true }: { render?: boolean }) {
  const kit = useKit(HUB_KIT_URL);
  const placements = useMemo(() => getHubLayout(), []);
  useEffect(() => {
    const mk = (window as unknown as { __mk?: Record<string, unknown> }).__mk;
    if (mk) mk.hubPlacements = placements; // ?debug only: lets tests find real buildings
  }, [placements]);
  return <KitInstances kit={kit} placements={placements} render={render} />;
}
