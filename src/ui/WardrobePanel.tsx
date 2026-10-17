import { useEffect, useRef, useState } from 'react';
import { useEconomy } from '../game/economy';
import { ITEMS } from '../game/catalog';
import { DEFAULT_OUTFIT, HAIRCUTS, OUTFITS, useWardrobe } from '../game/wardrobe';
import { sitDown, seatLock, sitting, standUp } from '../game/seating';
import { seat } from '../game/theatre';
import { INTERIOR_DEPTH, useInterior } from '../systems/interiors/rooms';
import { camOverride } from '../systems/player/Player';
import { playerPosition, playerView, teleport } from '../systems/player/playerState';
import { attendantReact, servingSpot } from '../systems/npc/Attendants';
import { say } from '../systems/audio/voice';
import { clippers } from '../systems/audio/sfx';

// The boutique mirror and the kinyozi chair (Parts 9 and 10). Everything goes through game/wardrobe:
// previews are free, buying needs a second "Confirm" press within a few seconds, and a purchase is
// charged once. At the kinyozi Abel sits in the barber chair (game/seating) with the mirror's view of
// him; a cut takes a few seconds with the clippers going, and is paid when it's done.

const FEET = 0.85; // capsule centre -> feet
// Barber Kevo (voiced: tools/voice-lines.mjs reads these arrays)
const BARBER_START = ['Sawa boss, kaa vizuri.', 'Tulia kidogo, nakuweka fiti.', 'Poa, wacha nikuonyeshe kazi.'];
const BARBER_DONE = ['Ona hiyo! Uko fiti sasa. Kwani mi huduu?', 'Imekaa poa sana, boss.', 'Sasa uko smart kabisa!'];
const CUT_MS = 4200;
type Mode = 'outfits' | 'hair';

/**
 * Where Abel stands for the boutique mirror: the clear middle of the room, facing the door (room
 * local +Z), so the camera can stand just inside the door with nothing in between.
 */
function fittingSpot() {
  const door = useInterior.getState().door;
  if (!door) return null;
  return { x: door.x, y: door.y - INTERIOR_DEPTH, z: door.z + 0.6, facing: 0 };
}

/** A camera on Abel's face side: `dist` in front, at `h` above the floor, orbit `alpha` (rad). */
function mirrorView(alpha: number, mode: Mode) {
  const sat = mode === 'hair' && !!sitting();
  const fit = !sat ? fittingSpot() : null;
  const fx = sat ? seat.x : fit ? fit.x : playerPosition.x;
  const fz = sat ? seat.z : fit ? fit.z : playerPosition.z;
  const floor = sat ? seat.y : fit ? fit.y : playerPosition.y - FEET;
  const f = (sat ? seat.facing : fit ? fit.facing : playerView.facing) + alpha;
  const dist = mode === 'hair' ? 1.15 : 2.3;
  const h = mode === 'hair' ? 1.3 : 1.35;
  const look = mode === 'hair' ? 1.22 : 1.0;
  const cam = { x: fx + Math.sin(f) * dist, y: floor + h, z: fz + Math.cos(f) * dist, lx: fx, ly: floor + look, lz: fz };
  if (sat) Object.assign(seat, { fixedCam: true, camX: cam.x, camY: cam.y, camZ: cam.z, lookX: cam.lx, lookY: cam.ly, lookZ: cam.lz });
  else Object.assign(camOverride, { on: true, x: cam.x, y: cam.y, z: cam.z, lx: cam.lx, ly: cam.ly, lz: cam.lz });
}

function barberSays(text: string) {
  const s = servingSpot();
  say({ who: 'attendant_m', name: s?.name ?? 'Barber', text, pos: s ? { x: s.x, y: s.y + 1.6, z: s.z } : undefined });
}

export function WardrobePanel({ mode, title, greeting, extras = [] }: { mode: Mode; title: string; greeting: string; extras?: string[] }) {
  const money = useEconomy((s) => s.money);
  const w = useWardrobe();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [cutting, setCutting] = useState<{ id: string; until: number } | null>(null);
  const [, tick] = useState(0);
  const alpha = useRef(0);
  const confirmTimer = useRef(0);

  // the mirror: a camera facing Abel while the panel is open (left/right arrows turn round him);
  // at the kinyozi he sits in the barber chair first
  useEffect(() => {
    if (mode === 'hair') {
      // cap off in the barber's chair (back on when he leaves, if he wore it)
      useWardrobe.setState((s) => ({ preview: { ...s.preview, cap: false } }));
      const door = useInterior.getState().door;
      if (door) sitDown(`${door.x},${door.z}:barber-chair`, { onStand: () => useEconomy.getState().openShop(null) });
    }
    if (mode === 'outfits') {
      // step over to the fitting spot (in the open, facing the door) before the mirror view
      const fit = fittingSpot();
      if (fit) Object.assign(teleport, { pending: true, x: fit.x, y: fit.y + FEET + 0.05, z: fit.z, facing: fit.facing });
    }
    mirrorView(0, mode);
    const key = (e: KeyboardEvent) => {
      if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return;
      alpha.current += e.code === 'ArrowLeft' ? -0.35 : 0.35;
      mirrorView(alpha.current, mode);
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      camOverride.on = false;
      useWardrobe.getState().clearPreview();
      if (mode === 'hair' && sitting()) {
        seatLock(false);
        standUp();
      }
    };
  }, [mode]);

  useEffect(() => () => clearTimeout(confirmTimer.current), []);

  // the cut in progress: clippers, the barber working and talking, then the new style (paid now)
  useEffect(() => {
    if (!cutting) return;
    const iv = setInterval(() => {
      tick((n) => n + 1);
      attendantReact('talk');
    }, 700);
    const done = setTimeout(() => {
      clearInterval(iv);
      const ok = useWardrobe.getState().cut(cutting.id);
      seatLock(false);
      setCutting(null);
      if (ok) barberSays(pick(BARBER_DONE));
    }, CUT_MS);
    return () => {
      clearInterval(iv);
      clearTimeout(done);
    };
  }, [cutting]);

  const ask = (id: string, price: number, act: () => void) => {
    if (useWardrobe.getState().busy || cutting) return;
    if (confirm !== id) {
      // first press: show the price and ask for a confirm (nothing charged yet)
      setConfirm(id);
      clearTimeout(confirmTimer.current);
      confirmTimer.current = window.setTimeout(() => setConfirm(null), 5000);
      if (price > money) useEconomy.getState().toast(`You need KSh ${price.toLocaleString()} (you have ${money.toLocaleString()})`, 'info');
      return;
    }
    setConfirm(null);
    act();
  };

  const startCut = (id: string) => {
    const h = HAIRCUTS.find((x) => x.id === id)!;
    const free = useWardrobe.getState().cuts.includes(id);
    if (!free && useEconomy.getState().money < h.price) {
      useEconomy.getState().toast(`Pesa haitoshi: the ${h.name} is KSh ${h.price}`, 'info');
      attendantReact('no');
      return;
    }
    useWardrobe.getState().previewHair(null);
    seatLock(true); // he stays in the chair until the barber is done
    clippers(CUT_MS - 300, servingSpot() ? { x: seat.x, y: seat.y + 1.2, z: seat.z } : undefined);
    barberSays(pick(BARBER_START));
    setCutting({ id, until: performance.now() + CUT_MS });
  };

  const items = mode === 'outfits' ? OUTFITS : HAIRCUTS;
  const wearing = mode === 'outfits' ? w.outfit : w.hair;
  const shown = mode === 'outfits' ? w.preview?.outfit ?? w.outfit : w.preview?.hair ?? w.hair;
  const owned = (id: string) => (mode === 'outfits' ? w.owned.includes(id) : w.cuts.includes(id));
  const progress = cutting ? 1 - Math.max(0, cutting.until - performance.now()) / CUT_MS : 0;

  return (
    <div className="panel shop-panel wardrobe-panel" role="dialog" aria-label={title}>
      <header>
        <h2>{title}</h2>
        <p>“{greeting}”</p>
        <small className="wardrobe-hint">
          {mode === 'outfits' ? 'Try anything on for free. ← → to turn round.' : 'Preview a style in the mirror for free. ← → to turn your head.'}
        </small>
      </header>
      {cutting && (
        <div className="wardrobe-cutting" aria-live="polite">
          <span>The barber is working…</span>
          <div className="wallet-bar"><span style={{ width: `${Math.round(progress * 100)}%`, background: '#ffc72c' }} /></div>
        </div>
      )}
      <ul>
        {items.map((it) => {
          const mine = owned(it.id);
          const isOn = wearing === it.id;
          const isShown = shown === it.id;
          const afford = money >= it.price;
          return (
            <li key={it.id} className={isShown ? 'is-shown' : undefined}>
              <div>
                <b>
                  {it.name} {isOn && <em className="tag tag-on">Wearing</em>} {!isOn && mine && <em className="tag">{mode === 'outfits' ? 'Owned' : 'Had it before'}</em>}
                </b>
                <small>{it.desc}</small>
              </div>
              <span className="price">{mine || it.price === 0 ? (mode === 'outfits' ? 'Yours' : 'Free') : `KSh ${it.price.toLocaleString()}`}</span>
              {!isOn && (
                <button
                  disabled={!!cutting}
                  onClick={() => (mode === 'outfits' ? useWardrobe.getState().previewOutfit(isShown ? null : it.id) : useWardrobe.getState().previewHair(isShown ? null : it.id))}
                >
                  {isShown ? 'Back to mine' : mode === 'outfits' ? 'Try on' : 'Preview'}
                </button>
              )}
              {!isOn && mode === 'outfits' && mine && (
                <button disabled={!!cutting} onClick={() => useWardrobe.getState().wear(it.id)}>Wear</button>
              )}
              {!isOn && mode === 'outfits' && !mine && (
                <button className={confirm === it.id ? 'confirm' : undefined} disabled={!afford || w.busy} onClick={() => ask(it.id, it.price, () => useWardrobe.getState().buyOutfit(it.id))}>
                  {confirm === it.id ? `Confirm KSh ${it.price.toLocaleString()}` : 'Buy'}
                </button>
              )}
              {!isOn && mode === 'hair' && (
                <button className={confirm === it.id ? 'confirm' : undefined} disabled={!!cutting || (!mine && !afford) || !sitting()} onClick={() => ask(it.id, mine ? 0 : it.price, () => startCut(it.id))}>
                  {confirm === it.id ? (mine ? 'Confirm (free)' : `Confirm KSh ${it.price}`) : 'Cut'}
                </button>
              )}
            </li>
          );
        })}
        {extras.map((id) => {
          const it = ITEMS[id]!;
          return (
            <li key={id}>
              <div>
                <b>{it.name}</b>
                <small>{it.desc}</small>
              </div>
              <span className="price">KSh {it.price.toLocaleString()}</span>
              <button disabled={money < it.price} onClick={() => useEconomy.getState().buy(id, false)}>Buy</button>
            </li>
          );
        })}
      </ul>
      <footer>
        <span>Wallet: KSh {money.toLocaleString()}</span>
        {mode === 'outfits' && (
          <>
            <button onClick={() => useWardrobe.getState().setCap(!w.cap)}>{w.cap ? 'Take the cap off' : 'Put the cap on'}</button>
            {w.outfit !== DEFAULT_OUTFIT && <button onClick={() => useWardrobe.getState().wear(DEFAULT_OUTFIT)}>Back to the tweed</button>}
          </>
        )}
        <button disabled={!!cutting} onClick={() => useEconomy.getState().openShop(null)}>{mode === 'hair' ? 'Done (Esc)' : 'Leave (Esc)'}</button>
      </footer>
    </div>
  );
}

const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)]!;
