import { useEffect, useState } from 'react';
import { ITEMS, SHOPS } from '../game/catalog';
import { useEconomy } from '../game/economy';
import { usePrompt } from '../game/interactables';
import { inputLock, onKeyPress, pressKey } from '../systems/input';
import { useGame } from '../app/store';

/** Contextual prompt, points wallet, fullness, bag, shop counter and toasts. */
export function GameUI() {
  const prompt = usePrompt((s) => s.current);
  const points = useEconomy((s) => s.points);
  const fullness = useEconomy((s) => s.fullness);
  const area = useEconomy((s) => s.area);
  const shop = useEconomy((s) => s.shop);
  const toasts = useEconomy((s) => s.toasts);
  const inventory = useEconomy((s) => s.inventory);
  const isTouch = useGame((s) => s.isTouch);
  const video = useEconomy((s) => s.video);
  const [bag, setBag] = useState(false);

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
    <div className="game-ui">
      <div className="wallet">
        <div className="wallet-points">
          <b>{points.toLocaleString()}</b> pts
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

      {prompt && !shop && (
        <button className="prompt" onClick={() => pressKey(prompt.key ?? 'KeyE')}>
          <kbd>{prompt.key === 'KeyF' ? 'F' : 'E'}</kbd> {prompt.label}
        </button>
      )}

      {def && (
        <div className="panel shop-panel" role="dialog" aria-label={def.title}>
          <header>
            <h2>{def.title}</h2>
            <p>“{def.greeting}”</p>
          </header>
          <ul>
            {def.items.map((id) => {
              const it = ITEMS[id]!;
              const afford = points >= it.price;
              return (
                <li key={id}>
                  <div>
                    <b>{it.name}</b>
                    <small>{it.desc}</small>
                  </div>
                  <span className="price">{it.price} pts</span>
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
            <span>Wallet: {points} pts</span>
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
