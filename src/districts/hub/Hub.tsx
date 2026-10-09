import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { KitInstances } from '../../world/kit/KitInstances';
import { useKit, wind } from '../../world/kit/useKit';
import { KiberaDrains } from '../kibera/Drains';
import { KIBERA_POLE_LINES } from '../kibera/layout';
import { Cables } from '../../world/Cables';
import { getHubLayout } from './layout';
import { useInteractables, type Interactable } from '../../game/interactables';
import { useEconomy } from '../../game/economy';
import { SHOPS } from '../../game/catalog';
import { KIBERA_HALLS } from '../kibera/layout';
import { loadContent, onlyAvailable } from '../../content/episodes';

export const MARKET_KIT_URL = '/models/market_kit.glb';
export const KIBERA_KIT_URL = '/models/kibera_kit.glb';
export const ROCKS_KIT_URL = '/models/rocks_kit.glb';
export const TOWN_KIT_URL = '/models/town_kit.glb';

/** Kibera video halls: E to watch a random recent episode of Abel's (live list, removed videos skipped). */
function hallInteractables(): Interactable[] {
  return KIBERA_HALLS.map((h, i) => ({
    id: `hall-${i}`,
    x: h.x,
    z: h.z + 2.6,
    radius: 2.2,
    label: "Watch tonight's show (video hall, KSh 30)",
    use: async () => {
      if (!useEconomy.getState().spend(30, 'video hall ticket')) return;
      const c = await loadContent();
      const pool = await onlyAvailable(c.episodes.slice(0, 30));
      const ep = pool[Math.floor(Math.random() * pool.length)];
      if (ep) useEconomy.getState().openVideo(ep.youtubeId, ep.title);
    },
  }));
}

// Which kit pieces are shops (piece -> shop id) and how far in front of the piece you stand.
const SHOP_OF: Record<string, [string, number]> = {
  kiosk_duka: ['kiosk', 1.9],
  kiosk_pesa: ['kiosk', 1.9],
  // shop_hoteli / shop_butchery / shop_boutique: walk in (interiors) and buy at the counter
  chips_booth: ['chips', 2.4],
  market_stall: ['market', 2.0],
  market_stall_b: ['market', 2.0],
};

function shopInteractables(placements: ReturnType<typeof getHubLayout>): Interactable[] {
  return placements.flatMap((p, i) => {
    const def = SHOP_OF[p.piece];
    if (!def) return [];
    const [shop, d] = def;
    return [{
      id: `shop-${i}`,
      x: p.x + Math.sin(p.rotY) * d,
      z: p.z + Math.cos(p.rotY) * d,
      radius: 1.8,
      label: `Buy at ${SHOPS[shop]!.title}`,
      use: () => useEconomy.getState().openShop(shop),
    }];
  });
}

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
  const marketKit = useKit(MARKET_KIT_URL);
  const kiberaKit = useKit(KIBERA_KIT_URL);
  const rocksKit = useKit(ROCKS_KIT_URL);
  const townKit = useKit(TOWN_KIT_URL);
  const placements = useMemo(() => getHubLayout(), []);
  const shops = useMemo(() => [...shopInteractables(placements), ...hallInteractables()], [placements]);
  useInteractables(shops);
  const hubPlacements = useMemo(() => placements.filter((p) => hubKit.has(p.piece)), [placements, hubKit]);
  const streetPlacements = useMemo(() => placements.filter((p) => streetKit.has(p.piece)), [placements, streetKit]);
  const marketPlacements = useMemo(() => placements.filter((p) => marketKit.has(p.piece)), [placements, marketKit]);
  // small alley decor (washing lines, rubbish) only matters up close: its own short-range batch
  const DECOR = /^kib_(washline|litter)$/;
  const kiberaPlacements = useMemo(() => placements.filter((p) => kiberaKit.has(p.piece) && !DECOR.test(p.piece)), [placements, kiberaKit]);
  const kiberaDecor = useMemo(() => placements.filter((p) => DECOR.test(p.piece)), [placements]);
  const rockPlacements = useMemo(() => placements.filter((p) => rocksKit.has(p.piece)), [placements, rocksKit]);
  const townPlacements = useMemo(() => placements.filter((p) => townKit.has(p.piece)), [placements, townKit]);
  useEffect(() => {
    const mk = (window as unknown as { __mk?: Record<string, unknown> }).__mk;
    if (mk) mk.hubPlacements = placements; // ?debug only: lets tests find real buildings
  }, [placements]);
  return (
    <>
      <KitInstances kit={hubKit} placements={hubPlacements} render={render} />
      <KitInstances kit={streetKit} placements={streetPlacements} render={render} />
      <KitInstances kit={marketKit} placements={marketPlacements} render={render} />
      <KitInstances kit={kiberaKit} placements={kiberaPlacements} render={render} />
      <KitInstances kit={kiberaKit} placements={kiberaDecor} render={render} reach={0.15} />
      <KitInstances kit={rocksKit} placements={rockPlacements} render={render} />
      {/* outer towns: tall buildings stay visible on the skyline from across the map */}
      <KitInstances kit={townKit} placements={townPlacements} render={render} reach={3} />
      {render && <Cables placements={placements} lines={KIBERA_POLE_LINES} />}
      {render && <KiberaDrains />}
      {render && <WindClock />}
    </>
  );
}
