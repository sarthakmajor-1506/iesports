import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAdmin } from "@/lib/verifyAdmin";
import { settleCS2Match } from "@/lib/settleCS2Match";

/**
 * Manual CS2 match result entry — the admin fallback for when the MatchZy
 * webhook (api/cs2/matchzy-events) is unavailable or a result needs
 * correcting. Both routes settle through the same lib/settleCS2Match.ts, so
 * this stays a thin auth-and-validate wrapper: standings recompute, bracket
 * auto-seed (crossover from group standings, then semifinal winners into the
 * final) and champion stamping all live in one place.
 *
 * POST { adminKey|authToken, tournamentId, matchId, winner: "team1"|"team2",
 *        team1Rounds?, team2Rounds? }
 *
 * This only fires for the fixed 2-group / 4-team playoff shape (semifinal
 * match ids "cs2-sf1"/"cs2-sf2", final "cs2-final"). Tournaments that don't
 * use those ids are unaffected — the auto-seed steps silently no-op when
 * those match docs don't exist.
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
  const team1Rounds = Number.isFinite(body.team1Rounds) ? Number(body.team1Rounds) : null;
  const team2Rounds = Number.isFinite(body.team2Rounds) ? Number(body.team2Rounds) : null;

  if (!tournamentId || !matchId) return NextResponse.json({ error: "tournamentId and matchId required" }, { status: 400 });
  if (winner !== "team1" && winner !== "team2") return NextResponse.json({ error: "winner must be 'team1' or 'team2'" }, { status: 400 });

  const result = await settleCS2Match(adminDb, {
    tournamentId, matchId, winner, team1Rounds, team2Rounds,
    source: "manual-admin",
    enteredBy: "admin-panel",
  });

  if (!result.ok) return NextResponse.json({ error: result.error || "settle failed" }, { status: 404 });
  return NextResponse.json(result);
}
