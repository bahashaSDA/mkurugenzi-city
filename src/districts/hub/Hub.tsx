import { Suspense, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { KitInstances, type Placement } from '../../world/kit/KitInstances';
import { useGame } from '../../app/store';
import { useKit, wind } from '../../world/kit/useKit';
import { KiberaDrains } from '../kibera/Drains';
import { KIBERA_POLE_LINES } from '../kibera/layout';
import { Cables } from '../../world/Cables';
import { getHubLayout } from './layout';
import { heightAt } from '../../world/heights';
import { useInteractables, type Interactable } from '../../game/interactables';
import { useEconomy } from '../../game/economy';
import { SHOPS } from '../../game/catalog';
import { registerSpot, serve, setGreetings, type ServiceSpot } from '../../systems/npc/Attendants';
import { KIBERA_HALLS } from '../kibera/layout';
import { loadContent, onlyAvailable } from '../../content/episodes';

export const MARKET_KIT_URL = '/models/market_kit.glb';
export const KIBERA_KIT_URL = '/models/kibera_kit.glb';
export const ROCKS_KIT_URL = '/models/rocks_kit.glb';
export const TOWN_KIT_URL = '/models/town_kit.glb';
/** Real buildings from Sketchfab (blender/scripts/build_real_kit.py --kit buildings); streams after the splash. */
export const REAL_BUILDINGS_KIT_URL = '/models/real_buildings_kit.glb';
/** Real trees (acacia, jacaranda, palms) with alpha-tested, wind-swayed leaf cards. */
export const REAL_TREES_KIT_URL = '/models/real_trees_kit.glb';

function RealKit({ url, placements, render }: { url: string; placements: Placement[]; render: boolean }) {
  const kit = useKit(url);
  const tier = useGame((st) => st.tier);
  const list = useMemo(() => placements.filter((p) => kit.has(p.piece)), [placements, kit]);
  return <KitInstances kit={kit} placements={list} render={render} reach={tier === 'low' ? 1.5 : 3} />;
}

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

// Which kit pieces are shops: shop id, where the customer stands (in front), and where the
// attendant works (piece-local forward offset, from the kit geometry: inside the kiosk window,
// behind the stall table, on the bench of a ground stall, inside the chips counter ring).
const SHOP_OF: Record<string, { shop: string; front: number; staff: number; model: ServiceSpot['model']; name: string; pose?: 'sit' }> = {
  kiosk_duka: { shop: 'kiosk', front: 1.9, staff: 0.05, model: 'auntie', name: 'Mama Wanjiku' },
  kiosk_pesa: { shop: 'kiosk', front: 1.9, staff: 0.05, model: 'office', name: 'Agent' },
  // shop_hoteli / shop_butchery / shop_boutique: walk in (interiors) and buy at the counter
  chips_booth: { shop: 'chips', front: 2.4, staff: -0.15, model: 'hustler', name: 'Chipo Express' },
  market_stall: { shop: 'market', front: 2.0, staff: -0.95, model: 'mama_mboga', name: 'Mama Mboga' },
  market_stall_b: { shop: 'market', front: 2.0, staff: -1.05, model: 'mama_mboga', name: 'Mama Mboga', pose: 'sit' },
};

function shopInteractables(placements: ReturnType<typeof getHubLayout>): Interactable[] {
  return placements.flatMap((p, i) => {
    const def = SHOP_OF[p.piece];
    if (!def) return [];
    return [{
      id: `shop-${i}`,
      x: p.x + Math.sin(p.rotY) * def.front,
      z: p.z + Math.cos(p.rotY) * def.front,
      radius: 1.8,
      label: `Buy at ${SHOPS[def.shop]!.title}`,
      use: () => serve(`hub-${i}`),
    }];
  });
}

/** The person behind each hub counter. */
function shopStaff(placements: ReturnType<typeof getHubLayout>): ServiceSpot[] {
  return placements.flatMap((p, i) => {
    const def = SHOP_OF[p.piece];
    if (!def) return [];
    const x = p.x + Math.sin(p.rotY) * def.staff;
    const z = p.z + Math.cos(p.rotY) * def.staff;
    const female = def.model === 'auntie' || def.model === 'mama_mboga' || def.model === 'young_woman';
    return [{ id: `hub-${i}`, x, z, y: p.y ?? heightAt(x, z), facing: p.rotY, model: def.model, name: def.name, who: female ? 'attendant_f' : 'attendant_m', shop: def.shop, pose: def.pose }];
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
  const tier = useGame((st) => st.tier);
  const placements = useMemo(() => getHubLayout(), []);
  const shops = useMemo(() => [...shopInteractables(placements), ...hallInteractables()], [placements]);
  useInteractables(shops);
  useEffect(() => {
    const offs = shopStaff(placements).map(registerSpot);
    setGreetings(Object.fromEntries(Object.values(SHOPS).map((d) => [d.id, d.greeting])));
    return () => offs.forEach((f) => f());
  }, [placements]);
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
      <KitInstances kit={townKit} placements={townPlacements} render={render} reach={tier === 'low' ? 1.5 : 3} />
      <Suspense fallback={null}>
        <RealKit url={REAL_BUILDINGS_KIT_URL} placements={placements} render={render} />
      </Suspense>
      <Suspense fallback={null}>
        <RealKit url={REAL_TREES_KIT_URL} placements={placements} render={render} />
      </Suspense>
      {render && <Cables placements={placements} lines={KIBERA_POLE_LINES} />}
      {render && <KiberaDrains />}
      {render && <WindClock />}
    </>
  );
}
