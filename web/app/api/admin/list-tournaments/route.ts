import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/admin/list-tournaments
 *
 * Lists all tournaments across all game collections.
 * Used by the admin "Tournament Creation" tab to show existing tournaments.
 *
 * Body: { adminKey, game? }
 * - If game is provided, only lists that game's tournaments
 * - If omitted, lists all games
 */

const GAME_COLLECTIONS: Record<string, string> = {
  valorant: "valorantTournaments",
  dota2: "tournaments",
};

export async function POST(req: NextRequest) {
  try {
    const { adminKey, game } = await req.json();

    if (!adminKey) {
      return NextResponse.json({ error: "Missing admin key" }, { status: 400 });
    }
    if (adminKey !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const gamesToFetch = game ? { [game]: GAME_COLLECTIONS[game] } : GAME_COLLECTIONS;
    const allTournaments: any[] = [];

    for (const [gameName, collectionName] of Object.entries(gamesToFetch)) {
      if (!collectionName) continue;
      const snap = await adminDb.collection(collectionName).get();
      snap.docs.forEach(doc => {
        const data = doc.data();
        allTournaments.push({
          id: doc.id,
          game: gameName,
          collection: collectionName,
          name: data.name || doc.id,
          format: data.format || "standard",
          status: data.status || "unknown",
          totalSlots: data.totalSlots ?? 0,
          slotsBooked: data.slotsBooked ?? 0,
          entryFee: data.entryFee ?? 0,
          prizePool: data.prizePool || "TBD",
          startDate: data.startDate || "",
          isTestTournament: data.isTestTournament || false,
          createdAt: data.createdAt || "",
        });
      });
    }

    // Sort: active first, then upcoming, then by name
    const statusOrder: Record<string, number> = { active: 0, upcoming: 1, completed: 2 };
    allTournaments.sort((a, b) => {
      const sa = statusOrder[a.status] ?? 3;
      const sb = statusOrder[b.status] ?? 3;
      if (sa !== sb) return sa - sb;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      success: true,
      count: allTournaments.length,
      tournaments: allTournaments,
    });
  } catch (e: any) {
    console.error("[API] List tournaments error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}