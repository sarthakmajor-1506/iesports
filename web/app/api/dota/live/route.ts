import { NextRequest, NextResponse } from "next/server";
import { getLiveLeagueMatch, type LiveMatch } from "@/lib/dotaLive";
import { adminDb } from "@/lib/firebaseAdmin";

// On-demand live feed for a league-tagged Dota match. Overlays/match page poll
// this. Accepts either ?dotaMatchId=<id> directly, or ?tournamentId=&matchId=
// (resolves the dotaMatchId + team names/logos/sides/series score from the match
// doc, so overlay URLs stay simple). We cache the Steam feed briefly so N
// concurrent viewers don't each hit the Web API.
export const dynamic = "force-dynamic";

const cache = new Map<string, { at: number; data: LiveMatch }>();
const TTL_MS = 25_000;

type Meta = {
  dotaMatchId: string;
  radiantName: string; direName: string;
  radiantLogo: string | null; direLogo: string | null;
  bestOf: number;
  radiantSeriesScore: number; direSeriesScore: number;
};

async function resolveMeta(tid: string, mid: string): Promise<Meta | null> {
  try {
    const m: any = (await adminDb.collection("tournaments").doc(tid).collection("matches").doc(mid).get()).data();
    if (!m) return null;
    const dotaMatchId = String(m.dotaMatchId || m.game1?.dotaMatchId || "");
    const isT1Rad = m.vetoState?.radiantTeam !== "team2"; // default Radiant = team1
    const radiantName = isT1Rad ? m.team1Name : m.team2Name;
    const direName = isT1Rad ? m.team2Name : m.team1Name;
    const radiantTeamId = isT1Rad ? m.team1Id : m.team2Id;
    const direTeamId = isT1Rad ? m.team2Id : m.team1Id;
    let radiantLogo = (isT1Rad ? m.team1Logo : m.team2Logo) || null;
    let direLogo = (isT1Rad ? m.team2Logo : m.team1Logo) || null;
    const valid = (s: any) => typeof s === "string" && s && s !== "TBD";
    if ((!radiantLogo && valid(radiantTeamId)) || (!direLogo && valid(direTeamId))) {
      const [rt, dt] = await Promise.all([
        valid(radiantTeamId) ? adminDb.collection("tournaments").doc(tid).collection("teams").doc(radiantTeamId).get().catch(() => null) : null,
        valid(direTeamId) ? adminDb.collection("tournaments").doc(tid).collection("teams").doc(direTeamId).get().catch(() => null) : null,
      ]);
      if (!radiantLogo) radiantLogo = (rt?.data() as any)?.teamLogo || null;
      if (!direLogo) direLogo = (dt?.data() as any)?.teamLogo || null;
    }
    return {
      dotaMatchId,
      radiantName: radiantName || "Radiant", direName: direName || "Dire",
      radiantLogo, direLogo,
      bestOf: Number(m.bestOf || 1),
      radiantSeriesScore: isT1Rad ? Number(m.team1Score || 0) : Number(m.team2Score || 0),
      direSeriesScore: isT1Rad ? Number(m.team2Score || 0) : Number(m.team1Score || 0),
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const tournamentId = req.nextUrl.searchParams.get("tournamentId") || "";
  const matchId = req.nextUrl.searchParams.get("matchId") || "";
  let dotaMatchId = req.nextUrl.searchParams.get("dotaMatchId") || "";
  let meta: Meta | null = null;

  if (tournamentId && matchId) {
    meta = await resolveMeta(tournamentId, matchId);
    if (meta?.dotaMatchId) dotaMatchId = meta.dotaMatchId;
  }
  if (!dotaMatchId) return NextResponse.json({ found: false, meta, error: "dotaMatchId (or tournamentId+matchId) required" }, { status: 400 });

  const hit = cache.get(dotaMatchId);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ...hit.data, meta, cached: true });
  }

  const key = process.env.STEAM_API_KEY || "";
  const data = await getLiveLeagueMatch(dotaMatchId, key);
  cache.set(dotaMatchId, { at: Date.now(), data });
  if (cache.size > 50) for (const [k, v] of cache) if (Date.now() - v.at > 5 * 60_000) cache.delete(k);

  return NextResponse.json({ ...data, meta });
}
