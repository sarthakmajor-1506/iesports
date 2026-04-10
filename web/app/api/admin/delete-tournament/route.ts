import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/admin/delete-tournament
 *
 * Deletes a tournament and all its subcollections from Firestore.
 * Supports: "valorant" → "valorantTournaments", "dota2" → "tournaments"
 *
 * Body: { adminKey, game, tournamentId }
 */

const GAME_COLLECTIONS: Record<string, string> = {
  valorant: "valorantTournaments",
  dota2: "tournaments",
  cs2: "cs2Tournaments",
};

// Known subcollections per game (extend as needed)
const SUBCOLLECTIONS: Record<string, string[]> = {
  valorant: ["teams", "matches", "standings", "leaderboard", "soloPlayers"],
  dota2: ["teams", "matches", "standings", "soloPlayers", "brackets"],
  cs2: ["teams", "matches", "standings", "leaderboard", "soloPlayers"],
};

async function deleteSubcollection(docRef: FirebaseFirestore.DocumentReference, subName: string) {
  const snap = await docRef.collection(subName).get();
  if (snap.empty) return 0;

  let deleted = 0;
  const chunks: FirebaseFirestore.DocumentReference[][] = [];
  let current: FirebaseFirestore.DocumentReference[] = [];

  snap.docs.forEach(doc => {
    current.push(doc.ref);
    if (current.length >= 450) {
      chunks.push(current);
      current = [];
    }
  });
  if (current.length > 0) chunks.push(current);

  for (const chunk of chunks) {
    const batch = adminDb.batch();
    chunk.forEach(ref => batch.delete(ref));
    await batch.commit();
    deleted += chunk.length;
  }

  return deleted;
}

export async function POST(req: NextRequest) {
  try {
    const { adminKey, game, tournamentId } = await req.json();

    if (!adminKey) {
      return NextResponse.json({ error: "Missing admin key" }, { status: 400 });
    }
    if (adminKey !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!game || !GAME_COLLECTIONS[game]) {
      return NextResponse.json({
        error: `Invalid game. Supported: ${Object.keys(GAME_COLLECTIONS).join(", ")}`,
      }, { status: 400 });
    }
    if (!tournamentId) {
      return NextResponse.json({ error: "Missing tournamentId" }, { status: 400 });
    }

    const collectionName = GAME_COLLECTIONS[game];
    const docRef = adminDb.collection(collectionName).doc(tournamentId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const tournamentName = doc.data()?.name || tournamentId;

    // ── Delete all subcollections ─────────────────────────────────────────────
    const subs = SUBCOLLECTIONS[game] || [];
    const deletedCounts: Record<string, number> = {};

    for (const sub of subs) {
      deletedCounts[sub] = await deleteSubcollection(docRef, sub);
    }

    // ── Delete the tournament document itself ─────────────────────────────────
    await docRef.delete();

    return NextResponse.json({
      success: true,
      message: `Deleted "${tournamentName}" and all subcollections`,
      tournamentId,
      deletedSubcollections: deletedCounts,
    });
  } catch (e: any) {
    console.error("[API] Delete tournament error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}