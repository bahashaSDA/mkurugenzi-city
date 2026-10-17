import { useEffect, useState } from 'react';
import { SECRETS, useSecrets } from '../game/collectibles';
import { loadContent } from '../content/episodes';
import { useEconomy } from '../game/economy';
import type { Episode } from '../content/classify';

/**
 * The bag's "Secrets" section: how many are found, and each Story Tape found with its episode
 * (Watch opens it in the video panel). Tape n is the n-th classic from Abel's series (stable order).
 */
export function SecretsList() {
  const found = useSecrets((s) => s.found);
  const [eps, setEps] = useState<Episode[]>([]);
  useEffect(() => {
    void loadContent().then((c) => setEps(c.episodes.filter((e) => /minisode|diastor|young and stupid|headline|stories of my life/i.test(e.show)).reverse()));
  }, []);
  const tapes = SECRETS.filter((s) => !s.room);
  return (
    <section className="secrets">
      <h3>
        Secrets found {found.length}/{SECRETS.length}
      </h3>
      <ul>
        {tapes.map((s, i) => {
          if (!found.includes(s.id)) return null;
          const ep = eps.length ? eps[(i * 37) % eps.length] : undefined;
          return (
            <li key={s.id}>
              <div>
                <b>{s.name}</b>
                <small>{ep ? ep.title : 'Loading the episode...'}</small>
              </div>
              {ep && <button onClick={() => useEconomy.getState().openVideo(ep.youtubeId, ep.title)}>Watch</button>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
