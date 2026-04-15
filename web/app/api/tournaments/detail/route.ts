import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const game = req.nextUrl.searchParams.get("game");

  if (!id || !game || !["dota2", "valorant", "cs2"].includes(game)) {
    return NextResponse.json({ error: "Missing id or invalid game" }, { status: 400 });
  }

  try {
    const col = game === "valorant" ? "valorantTournaments" : game === "cs2" ? "cs2Tournaments" : "tournaments";
    const playersCol = game === "valorant" || game === "cs2" ? "soloPlayers" : "players";

    // For valorant we read the denormalized `playersSnapshot` from the tournament doc
    // (1 read instead of 1 + N). For dota/cs2 and for valorant tournaments that haven't
    // been migrated yet we fall back to fetching the full subcollection.
    const tDocPromise = adminDb.collection(col).doc(id).get();
    const teamsSnapPromise = adminDb.collection(col).doc(id).collection("teams").orderBy("teamIndex").get();
    const standingsSnapPromise = adminDb.collection(col).doc(id).collection("standings").get();
    const matchesSnapPromise = adminDb.collection(col).doc(id).collection("matches").get();
    const lbSnapPromise = adminDb.collection(col).doc(id).collection("leaderboard").get();

    const tDoc = await tDocPromise;
    if (!tDoc.exists) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }
    const tDocData = tDoc.data() || {};

    // Decide whether to use the embedded snapshot (valorant only, when present)
    // or fetch the full subcollection.
    const useSnapshot =
      game === "valorant" && Array.isArray((tDocData as any).playersSnapshot);

    let players: any[];
    let teamsSnap: FirebaseFirestore.QuerySnapshot;
    let standingsSnap: FirebaseFirestore.QuerySnapshot;
    let matchesSnap: FirebaseFirestore.QuerySnapshot;
    let lbSnap: FirebaseFirestore.QuerySnapshot;

    if (useSnapshot) {
      const cached = ((tDocData as any).playersSnapshot || []) as any[];
      players = cached.map((p: any) => ({ id: p.uid, ...p }));
      [teamsSnap, standingsSnap, matchesSnap, lbSnap] = await Promise.all([
        teamsSnapPromise, standingsSnapPromise, matchesSnapPromise, lbSnapPromise,
      ]);
    } else {
      const playersSnap = await adminDb.collection(col).doc(id).collection(playersCol).get();
      players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      [teamsSnap, standingsSnap, matchesSnap, lbSnap] = await Promise.all([
        teamsSnapPromise, standingsSnapPromise, matchesSnapPromise, lbSnapPromise,
      ]);
    }

    // Strip the embedded snapshot from the response — `players` already contains it,
    // so sending it twice just bloats the payload.
    const { playersSnapshot: _stripped, ...tournamentRest } = tDocData as any;
    void _stripped;
    const tournament = { id: tDoc.id, ...tournamentRest };
    const teams = teamsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const standings = standingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const matches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const leaderboard = lbSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Rank refresh via ?refreshRank=1 query param (opt-in, NOT run on polled fetches).
    // The polled tournament detail calls must NOT trigger this — it's an N-read scan
    // across every registered player's user doc. Rank data stored on the player's
    // tournament doc at registration time is used by default; clients that need a
    // fresh snapshot can opt in with ?refreshRank=1 once (on mount, not on poll).
    const refreshRank = req.nextUrl.searchParams.get("refreshRank") === "1";
    if (refreshRank && game === "dota2" && players.length > 0) {
      const uids = players.map((p: any) => p.uid || p.id).filter(Boolean);
      if (uids.length > 0) {
        const userRefs = uids.map((uid: string) => adminDb.collection("users").doc(uid));
        const userDocs = await adminDb.getAll(...userRefs);
        const rankMap: Record<string, { dotaRankTier: number; dotaMMR: number }> = {};
        userDocs.forEach(ud => {
          if (ud.exists) {
            const d = ud.data();
            if (d?.dotaRankTier) rankMap[ud.id] = { dotaRankTier: d.dotaRankTier, dotaMMR: d.dotaMMR || 0 };
          }
        });
        players = players.map((p: any) => {
          const uid = p.uid || p.id;
          const fresh = rankMap[uid];
          if (fresh) return { ...p, dotaRankTier: fresh.dotaRankTier, dotaMMR: fresh.dotaMMR };
          return p;
        });
      }
    }

    return NextResponse.json({ tournament, players, teams, standings, matches, leaderboard });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
