import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { syncPlayerSnapshot } from "@/lib/valorantPlayerSnapshot";

/**
 * POST /api/admin/rebuild-player-snapshot
 *
 * Rebuilds the denormalized `playersSnapshot` array on a Valorant tournament doc
 * from its `soloPlayers` subcollection. Use this:
 *   1. To backfill existing tournaments that pre-date the snapshot system.
 *   2. To recover from drift if a write path was added without hooking the helper.
 *   3. As a manual sanity-rebuild after editing soloPlayers via the Firestore console.
 *
 * Body: {
 *   adminKey: string,
 *   tournamentId?: string,   // single tournament
 *   all?: boolean,           // OR rebuild every valorantTournament
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { adminKey, tournamentId, all } = await req.json();

    if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!tournamentId && !all) {
      return NextResponse.json({ error: "Provide tournamentId or all=true" }, { status: 400 });
    }

    const results: { id: string; players: number; error?: string }[] = [];

    if (all) {
      const allDocs = await adminDb.collection("valorantTournaments").select().get();
      for (const doc of allDocs.docs) {
        try {
          const n = await syncPlayerSnapshot(doc.id);
          results.push({ id: doc.id, players: n });
        } catch (e: any) {
          results.push({ id: doc.id, players: 0, error: e.message || "sync failed" });
        }
      }
    } else {
      try {
        const n = await syncPlayerSnapshot(tournamentId);
        results.push({ id: tournamentId, players: n });
      } catch (e: any) {
        results.push({ id: tournamentId, players: 0, error: e.message || "sync failed" });
      }
    }

    const ok = results.filter(r => !r.error).length;
    const failed = results.filter(r => r.error).length;

    return NextResponse.json({
      success: failed === 0,
      tournaments: results.length,
      ok,
      failed,
      results,
    });
  } catch (e: any) {
    console.error("rebuild-player-snapshot error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
