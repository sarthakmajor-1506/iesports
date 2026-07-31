import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAdmin } from "@/lib/verifyAdmin";
import { shuffleCS2Teams } from "@/lib/shuffleCS2Teams";

/**
 * POST /api/cs2/shuffle-teams
 *
 * CS2 equivalent of /api/dota/shuffle-teams and /api/valorant/shuffle-teams —
 * same path convention, same dryRun/deleteExisting/seed contract, so the
 * registration -> team-formation flow works identically across all three
 * games. See lib/shuffleCS2Teams.ts for what's actually different (no role
 * system, adds group assignment + round-robin schedule generation).
 *
 * Body:
 *   adminKey|authToken — verifyAdmin() gate
 *   tournamentId       — the CS2 tournament id
 *   groupCount?        — default 2
 *   dryRun?            — true (default): return preview only, no writes
 *   deleteExisting?    — false (default): on commit, wipe previously
 *                        generated teams/matches/standings first (reshuffle)
 *   seed?              — reuse a previewed seed so a re-publish matches the
 *                        preview exactly
 */
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  try { await verifyAdmin({ adminKey: body.adminKey, authToken: body.authToken }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  const tournamentId = String(body.tournamentId || "").trim();
  if (!tournamentId) return NextResponse.json({ error: "Missing tournamentId" }, { status: 400 });

  try {
    const result = await shuffleCS2Teams(adminDb, tournamentId, {
      groupCount: body.groupCount,
      dryRun: body.dryRun !== false,
      deleteExisting: !!body.deleteExisting,
      seed: body.seed,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
