import { useEffect, useState } from 'react';

interface Content {
  links: Record<string, string>;
  episodes: { youtubeId: string; title: string; show: string }[];
  contact?: { email?: string };
}

/** SPEC 14: shown when WebGL2 is missing or the device is too weak for the 3D city. */
export function Fallback() {
  const [content, setContent] = useState<Content | null>(null);
  useEffect(() => {
    fetch('/content/content.json')
      .then((r) => r.json())
      .then(setContent)
      .catch(() => setContent(null));
  }, []);

  return (
    <main className="fallback">
      <h1>MKURUGENZI CITY</h1>
      <p>Your device can't run the 3D city, but the stories are all here.</p>
      {content && (
        <>
          <nav className="fallback-links">
            {Object.entries(content.links).map(([k, v]) => (
              <a key={k} href={v} target="_blank" rel="noreferrer">
                {k}
              </a>
            ))}
          </nav>
          <ul className="fallback-episodes">
            {content.episodes.map((e) => (
              <li key={e.youtubeId}>
                <a href={`https://www.youtube.com/watch?v=${e.youtubeId}`} target="_blank" rel="noreferrer">
                  <small>{e.show}</small> {e.title}
                </a>
              </li>
            ))}
          </ul>
          {content.contact?.email && <a href={`mailto:${content.contact.email}`}>Bookings & business</a>}
        </>
      )}
    </main>
  );
}
