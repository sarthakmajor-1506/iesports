import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAdmin } from "@/lib/verifyAdmin";

/**
 * Manual Dota match result entry — fallback when GC/Web API/OpenDota all
 * refuse to serve the practice-lobby details (the common case for
 * bot-hosted custom lobbies). Admin picks the winner; we write the same
 * Firestore shape that resolveDotaResults() would have written so all
 * standings / leaderboard logic flows the same.
 *
 * POST { tournamentId, matchId, winner: "team1"|"team2", durationSec?, dotaMatchId? }
 */

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  try { await verifyAdmin({ adminKey: body.adminKey, authToken: body.authToken }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  const tournamentId = String(body.tournamentId || "").trim();
  const matchId = String(body.matchId || "").trim();
  const winner = String(body.winner || "").trim();
  const durationSec = Number.isFinite(body.durationSec) ? Number(body.durationSec) : null;
  const dotaMatchId = body.dotaMatchId ? String(body.dotaMatchId) : null;

  if (!tournamentId || !matchId) return NextResponse.json({ error: "tournamentId and matchId required" }, { status: 400 });
  if (winner !== "team1" && winner !== "team2") return NextResponse.json({ error: "winner must be 'team1' or 'team2'" }, { status: 400 });

  const ref = adminDb.collection("tournaments").doc(tournamentId).collection("matches").doc(matchId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "match not found" }, { status: 404 });
  const m: any = snap.data();

  const nowIso = new Date().toISOString();
  const winnerName = winner === "team1" ? m.team1Name : m.team2Name;

  await ref.set({
    status: "completed",
    team1Score: winner === "team1" ? 1 : 0,
    team2Score: winner === "team2" ? 1 : 0,
    winner,
    completedAt: nowIso,
    ...(dotaMatchId ? { dotaMatchId } : {}),
    result: {
      source: "manual-admin",
      dotaMatchId: dotaMatchId || m.dotaMatchId || null,
      durationSeconds: durationSec,
      winnerTeam: winner,
      fetchedAt: nowIso,
      enteredBy: "admin-panel",
    },
    games: {
      game1: {
        dotaMatchId: dotaMatchId || m.dotaMatchId || null,
        winner,
        durationSeconds: durationSec,
        completedAt: nowIso,
        status: "completed",
      },
    },
  }, { merge: true });

  return NextResponse.json({ ok: true, winner, winnerName, matchId });
}
