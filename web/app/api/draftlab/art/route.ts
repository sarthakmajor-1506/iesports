import { NextRequest, NextResponse } from "next/server";

/**
 * Draft — hero art, served from our own origin.
 *
 * This exists for exactly one reason: the share card is drawn in a canvas, and a
 * canvas that has drawn a cross-origin image cannot be exported. Valve's CDN
 * answers with `Access-Control-Allow-Origin: https://www.dota2.com`, so loading
 * the art directly — with or without `crossOrigin` — leaves the canvas tainted
 * and `toBlob()` throws a SecurityError. Proxying makes the pixels same-origin.
 *
 * IT IS NOT AN OPEN PROXY, AND MUST NOT BECOME ONE. The client sends a hero's
 * base name, never a URL: the URL is built here from a fixed template, so there
 * is nothing for a caller to point somewhere else. A route that forwarded a
 * caller-supplied URL would be an SSRF hole into anything the deployment can
 * reach, which on Vercel includes internal metadata endpoints.
 *
 * Everything else in the app still loads art straight from the CDN — this path
 * is only for the canvas, and adding a hop for every hero tile would be a real
 * cost for no benefit.
 */

const CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2";

/** Valve's internal hero names: lowercase, digits, underscores. Nothing else. */
const BASE = /^[a-z0-9_]{2,40}$/;

/**
 * Tried in order — the same chain the UI uses. The standing portrait exists for
 * 123 of 127 heroes; the crop and the icon exist for all of them, so this cannot
 * come back empty for a real hero.
 */
const CHAIN = (base: string) => [
  `${CDN}/images/heroes/${base}_vert.jpg`,
  `${CDN}/images/dota_react/heroes/crops/${base}.png`,
  `${CDN}/images/dota_react/heroes/icons/${base}.png`,
];

export async function GET(req: NextRequest) {
  const base = (req.nextUrl.searchParams.get("h") || "").toLowerCase();
  if (!BASE.test(base)) return NextResponse.json({ error: "Bad hero" }, { status: 400 });

  for (const url of CHAIN(base)) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) continue;
      const type = r.headers.get("content-type") || "";
      if (!type.startsWith("image/")) continue;
      const body = await r.arrayBuffer();
      return new NextResponse(body, {
        headers: {
          "Content-Type": type,
          // Hero art for a given patch never changes under the same URL, and a
          // share card redraws all ten every time it is opened.
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      // Try the next link in the chain; a transient failure on the portrait
      // should not cost the card its picture.
    }
  }

  return NextResponse.json({ error: "No art" }, { status: 404 });
}
