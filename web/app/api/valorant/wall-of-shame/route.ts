import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";

/**
 * GET /api/valorant/wall-of-shame?tournamentId=X
 *
 * Returns every Wall of Shame entry for a tournament, plus the current user's
 * vote on each entry if a Bearer token is supplied. Unauthenticated reads are
 * allowed (entries are public); only the per-user vote map is gated.
 */
export async function GET(req: NextRequest) {
  try {
    const tournamentId = req.nextUrl.searchParams.get("tournamentId");
    if (!tournamentId) {
      return NextResponse.json({ error: "tournamentId required" }, { status: 400 });
    }

    const tournamentRef = adminDb.collection("valorantTournaments").doc(tournamentId);
    const shameCol = tournamentRef.collection("wallOfShame");
    const snap = await shameCol.get();
    // archived === true → kept for audit / future reference but hidden from
    // the public Wall (e.g. last week's entries after a refresh).
    const entries = snap.docs
      .map(d => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
      .filter((e: any) => e.archived !== true);

    // Enrich each entry with the player's top tournament agents (used by the
    // "agent ban" punishment block on the front-end). Leaderboard docs key on
    // puuid; we also need a uid-based fallback because some shamed players
    // may not have a riotPuuid yet — for those we look up via uid → users
    // doc → riotPuuid → leaderboard.
    const lbSnap = await tournamentRef.collection("leaderboard").get();
    const lbByPuuid: Record<string, any> = {};
    const lbByUid: Record<string, any> = {};
    for (const d of lbSnap.docs) {
      const data = d.data() as any;
      if (data.puuid) lbByPuuid[data.puuid] = data;
      if (data.uid) lbByUid[data.uid] = data;
    }
    // Build top-3 agents per shamed player by counting agent occurrences in
    // processedGames (most-played first). Falls back to the raw `agents` list
    // (which is order-of-first-use, not frequency) if processedGames absent.
    const topAgentsFor = (lb: any): string[] => {
      if (!lb) return [];
      const counts: Record<string, number> = {};
      const pg = lb.processedGames || {};
      for (const g of Object.values<any>(pg)) {
        if (g?.agent) counts[g.agent] = (counts[g.agent] || 0) + 1;
      }
      let ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (ranked.length === 0 && Array.isArray(lb.agents)) {
        ranked = lb.agents.map((a: string) => [a, 1] as [string, number]);
      }
      return ranked.slice(0, 3).map(([a]) => a);
    };

    for (const e of entries as any[]) {
      let lb = e.uid ? lbByUid[e.uid] : null;
      if (!lb && e.uid) {
        const userDoc = await adminDb.collection("users").doc(e.uid).get();
        const puuid = userDoc.data()?.riotPuuid;
        if (puuid) lb = lbByPuuid[puuid];
      }
      e.topAgents = topAgentsFor(lb);
      e.totalGames = lb?.matchesPlayed ?? 0;
    }

    // Resolve caller uid (optional).
    let callerUid: string | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const decoded = await adminAuth.verifyIdToken(authHeader.split("Bearer ")[1]);
        callerUid = decoded.uid;
      } catch {
        callerUid = null;
      }
    }

    // Pull this user's vote on each entry in parallel.
    const myVotes: Record<string, "tomato" | "bail"> = {};
    if (callerUid) {
      await Promise.all(
        entries.map(async (e: any) => {
          const v = await shameCol.doc(e.id).collection("votes").doc(callerUid!).get();
          if (v.exists) {
            const kind = v.data()?.kind;
            if (kind === "tomato" || kind === "bail") myVotes[e.id] = kind;
          }
        })
      );
    }

    return NextResponse.json({ entries, myVotes });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
