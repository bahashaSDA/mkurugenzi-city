// Serverless function: Abel's 15 newest uploads as JSON, read from the public channel feed.
// No API key needed. Runs as a Vercel Edge Function at /api/latest-episodes; the same handler
// is mounted by the Vite dev server (vite.config.ts) so it works locally too.
// Cached at the CDN for 30 min, so YouTube is asked at most twice an hour however busy the site is.

export const config = { runtime: 'edge' };

const CHANNEL_ID = 'UC4tjY2tTltEKePusozUxtSA'; // @mkurugenziii
const FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export function parseFeed(xml: string) {
  const videos: { id: string; title: string; published: string }[] = [];
  for (const entry of xml.split('<entry>').slice(1)) {
    const id = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(entry)?.[1];
    const title = /<title>([^<]*)<\/title>/.exec(entry)?.[1];
    const published = /<published>([^<]+)<\/published>/.exec(entry)?.[1] ?? '';
    if (id && title) videos.push({ id, title: decode(title), published });
  }
  return videos;
}

export default async function handler(): Promise<Response> {
  try {
    const r = await fetch(FEED, { headers: { 'user-agent': 'MkurugenziCity/1.0' } });
    if (!r.ok) throw new Error(`feed ${r.status}`);
    const videos = parseFeed(await r.text());
    return new Response(JSON.stringify({ videos, fetchedAt: new Date().toISOString() }), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, s-maxage=1800, stale-while-revalidate=86400',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ videos: [], error: String(e) }), {
      status: 502,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
}
