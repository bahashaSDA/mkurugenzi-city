import { useEffect, useState } from 'react';
import { ITEMS, SHOPS } from '../game/catalog';
import { useEconomy } from '../game/economy';
import { usePrompt } from '../game/interactables';
import { inputLock, keyFor, keyName, onKeyPress, pressKey } from '../systems/input';
import { useGame } from '../app/store';
import { drive, useService } from '../systems/driving/state';
import { TANK } from '../game/stations';
import { diving } from '../systems/player/playerState';
import { bike } from '../systems/driving/Bike';
import { BigMap, MissionHud, Minimap, NavDirector } from './MapUI';
import { useInterior } from '../systems/interiors/rooms';
import { CinematicUI, MissionBanner } from './CinematicUI';
import { useCutscene } from '../game/cutscene';
import { useTheatre } from '../game/theatre';
import { RadioHud } from './RadioHud';
import { WardrobePanel } from './WardrobePanel';
import { SecretsList } from './SecretsList';

/** Contextual prompt, KSh wallet, fullness, bag, shop counter and toasts. */
export function GameUI() {
  const prompt = usePrompt((s) => s.current);
  const otherPrompt = usePrompt((s) => s.other);
  const money = useEconomy((s) => s.money);
  const fullness = useEconomy((s) => s.fullness);
  const area = useEconomy((s) => s.area);
  const shop = useEconomy((s) => s.shop);
  const toasts = useEconomy((s) => s.toasts);
  const inventory = useEconomy((s) => s.inventory);
  const isTouch = useGame((s) => s.isTouch);
  const video = useEconomy((s) => s.video);
  const [bag, setBag] = useState(false);
  const fading = useInterior((s) => s.fading);
  const cinematic = useCutscene((s) => s.active);
  const watching = useTheatre((s) => s.seated);

  useEffect(() => onKeyPress('KeyI', () => setBag((b) => !b)), []);
  useEffect(() => {
    inputLock.ui = !!shop || bag || !!video;
  }, [shop, bag, video]);
  useEffect(
    () =>
      onKeyPress('Escape', () => {
        useEconomy.getState().openShop(null);
        useEconomy.getState().openVideo(null);
        setBag(false);
      }),
    [],
  );

  const bagItems = Object.entries(inventory).filter(([, n]) => n > 0);
  const def = shop ? SHOPS[shop] : null;

  return (
    <div className={cinematic || watching ? "game-ui in-cutscene" : "game-ui"}>
      <div className="wallet">
        <div className="wallet-points">
          KSh <b>{money.toLocaleString()}</b>
        </div>
        <div className="wallet-bar" title="Shiba (fullness)">
          <span style={{ width: `${fullness}%`, background: fullness < 25 ? '#ff5a3c' : '#ffc72c' }} />
        </div>
        <small>{fullness < 25 ? 'Njaa! Find something to eat' : 'Shiba'}</small>
        <button className="wallet-bag" onClick={() => setBag((b) => !b)}>
          Bag ({bagItems.reduce((a, [, n]) => a + n, 0)}) {isTouch ? '' : '· I'}
        </button>
      </div>

      {area && <div className="area-name">{area}</div>}
      <Speedo />
      <FuelGauge />
      <RadioHud />
      <div className="fade" style={{ opacity: fading ? 1 : 0 }} />
      <NavDirector />
      <Minimap />
      <MissionHud />
      <MissionBanner />
      <CinematicUI />
      <BigMap />

      <ServicePrompt />
      <Underwater />
      {prompt && !shop && (
        <div className="prompts">
          <button className="prompt" onClick={() => pressKey(prompt.key ?? 'KeyE')}>
            <kbd>{keyName(keyFor(prompt.key ?? 'KeyE'))}</kbd> {prompt.label}
          </button>
          {otherPrompt && otherPrompt.label && (
            <button className="prompt prompt-small" onClick={() => pressKey(otherPrompt.key ?? 'KeyE')}>
              <kbd>{keyName(keyFor(otherPrompt.key ?? 'KeyE'))}</kbd> {otherPrompt.label}
            </button>
          )}
        </div>
      )}

      {def && (def.id === 'boutique' || def.id === 'kinyozi') && (
        <WardrobePanel mode={def.id === 'kinyozi' ? 'hair' : 'outfits'} title={def.title} greeting={def.greeting} extras={def.items} />
      )}

      {def && def.id !== 'boutique' && def.id !== 'kinyozi' && (
        <div className="panel shop-panel" role="dialog" aria-label={def.title}>
          <header>
            <h2>{def.title}</h2>
            <p>“{def.greeting}”</p>
          </header>
          <ul>
            {def.items.map((id) => {
              const it = ITEMS[id]!;
              const afford = money >= it.price;
              return (
                <li key={id}>
                  <div>
                    <b>{it.name}</b>
                    <small>{it.desc}</small>
                  </div>
                  <span className="price">KSh {it.price.toLocaleString()}</span>
                  {it.fullness > 0 && (
                    <button disabled={!afford} onClick={() => useEconomy.getState().buy(id, true) && useEconomy.getState().openShop(null)}>
                      {it.kind === 'drink' ? 'Drink now' : 'Eat now'}
                    </button>
                  )}
                  <button disabled={!afford} onClick={() => useEconomy.getState().buy(id, false)}>
                    {it.kind === 'merch' ? 'Buy' : 'Take away'}
                  </button>
                </li>
              );
            })}
          </ul>
          <footer>
            <span>Wallet: KSh {money.toLocaleString()}</span>
            <button onClick={() => useEconomy.getState().openShop(null)}>Leave (Esc)</button>
          </footer>
        </div>
      )}

      {bag && (
        <div className="panel bag-panel" role="dialog" aria-label="Bag">
          <header>
            <h2>Bag</h2>
          </header>
          {bagItems.length === 0 && <p>Empty. Buy something at a stall, kiosk or hoteli.</p>}
          <ul>
            {bagItems.map(([id, n]) => {
              const it = ITEMS[id]!;
              return (
                <li key={id}>
                  <div>
                    <b>
                      {it.name} × {n}
                    </b>
                    <small>{it.desc}</small>
                  </div>
                  {it.fullness > 0 && (
                    <button
                      onClick={() => {
                        useEconomy.getState().consume(id);
                        setBag(false);
                      }}
                    >
                      {it.kind === 'drink' ? 'Drink' : 'Eat'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <SecretsList />
          <footer>
            <button onClick={() => setBag(false)}>Close</button>
          </footer>
        </div>
      )}

      {video && (
        <div className="panel video-panel" role="dialog" aria-label={video.title}>
          <header>
            <h2>Video hall</h2>
            <p>{video.title}</p>
          </header>
          <div className="video-frame">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0`}
              title={video.title}
              allow="autoplay; encrypted-media; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
          <footer>
            <span>From the official Mkurugenzi channel</span>
            <button onClick={() => useEconomy.getState().openVideo(null)}>Leave (Esc)</button>
          </footer>
        </div>
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/** km/h readout while driving (polled: the physics writes `drive` every frame). */
function Speedo() {
  const [kmh, setKmh] = useState<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => setKmh(drive.active ? Math.round(Math.abs(drive.speed) * 3.6) : bike.active ? Math.round(Math.abs(bike.speed) * 3.6) : null), 150);
    return () => clearInterval(id);
  }, []);
  if (kmh === null) return null;
  return (
    <div className="speedo">
      <b>{kmh}</b>
      <small>km/h</small>
    </div>
  );
}

/** In the car at a petrol station: what E does there (fill up / repair) and the price. */
function ServicePrompt() {
  const label = useService((s) => s.label);
  const busy = useService((s) => s.busy);
  if (!label) return null;
  return (
    <button className="prompt" disabled={busy} onClick={() => pressKey('KeyE')}>
      {!busy && <kbd>E</kbd>} {label}
    </button>
  );
}

/** Fuel gauge under the speedometer (cars only). */
function FuelGauge() {
  const [f, setF] = useState<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => setF(drive.active ? drive.fuel / TANK : null), 300);
    return () => clearInterval(id);
  }, []);
  if (f === null) return null;
  return (
    <div className="fuel" aria-label={`Fuel ${Math.round(f * 100)}%`}>
      <span>FUEL</span>
      <div className="wallet-bar"><span style={{ width: `${Math.round(f * 100)}%`, background: f < 0.12 ? '#ff5a3c' : '#3fd17f' }} /></div>
    </div>
  );
}

/** Under the sea: the water's colour over the view, and the breath bar while he holds his breath. */
function Underwater() {
  const [st, setSt] = useState({ under: false, breath: 1, show: false });
  useEffect(() => {
    const id = setInterval(() => setSt({ under: diving.cameraUnder, breath: diving.breath, show: diving.under || diving.breath < 0.999 }), 120);
    return () => clearInterval(id);
  }, []);
  return (
    <>
      {st.under && <div className="underwater" aria-hidden />}
      {st.show && (
        <div className="breath" aria-label={`Breath ${Math.round(st.breath * 100)}%`}>
          <span>BREATH</span>
          <div className="wallet-bar"><span style={{ width: `${Math.round(st.breath * 100)}%`, background: st.breath < 0.25 ? '#ff5a3c' : '#5fd0ff' }} /></div>
        </div>
      )}
    </>
  );
}
