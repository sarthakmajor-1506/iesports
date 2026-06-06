import { NextRequest, NextResponse } from "next/server";
import { getLiveLeagueMatch, type LiveMatch } from "@/lib/dotaLive";

// On-demand live feed for a league-tagged Dota match. The match page polls this
// every ~60s while a game is live. We cache each match's result briefly so N
// concurrent viewers don't each hit the Steam Web API.
export const dynamic = "force-dynamic";

const cache = new Map<string, { at: number; data: LiveMatch }>();
const TTL_MS = 25_000;

export async function GET(req: NextRequest) {
  const dotaMatchId = req.nextUrl.searchParams.get("dotaMatchId") || "";
  if (!dotaMatchId) return NextResponse.json({ found: false, error: "dotaMatchId required" }, { status: 400 });

  const hit = cache.get(dotaMatchId);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ...hit.data, cached: true });
  }

  const key = process.env.STEAM_API_KEY || "";
  const data = await getLiveLeagueMatch(dotaMatchId, key);
  cache.set(dotaMatchId, { at: Date.now(), data });
  // keep the map from growing unbounded
  if (cache.size > 50) for (const [k, v] of cache) if (Date.now() - v.at > 5 * 60_000) cache.delete(k);

  return NextResponse.json(data);
}
