import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/admin/create-tournament
 *
 * Creates a tournament in the appropriate Firestore collection based on `game`.
 * Supports: "valorant" → "valorantTournaments", "dota2" → "tournaments"
 * Extensible: add new game → collection mappings as needed.
 *
 * Body: { adminKey, game, tournamentId, ...tournamentFields }
 */

// ── Game → Firestore collection mapping ──────────────────────────────────────
const GAME_COLLECTIONS: Record<string, string> = {
  valorant: "valorantTournaments",
  dota2: "tournaments",
  // Future: cs2: "cs2Tournaments", cod: "codTournaments"
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { adminKey, game, tournamentId, ...fields } = body;

    // ── Validate ──────────────────────────────────────────────────────────────
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
    if (!fields.name) {
      return NextResponse.json({ error: "Missing tournament name" }, { status: 400 });
    }

    const collectionName = GAME_COLLECTIONS[game];

    // ── Check if tournament already exists ─────────────────────────────────────
    const existingDoc = await adminDb.collection(collectionName).doc(tournamentId).get();
    if (existingDoc.exists) {
      return NextResponse.json({
        error: `Tournament "${tournamentId}" already exists in ${collectionName}`,
      }, { status: 409 });
    }

    // ── Build tournament document ─────────────────────────────────────────────
    const tournamentData: Record<string, any> = {
      game,
      name: fields.name,
      format: fields.format || "standard",
      status: fields.status || "upcoming",
      bracketsComputed: false,
      registrationDeadline: fields.registrationDeadline || "",
      startDate: fields.startDate || "",
      endDate: fields.endDate || "",
      totalSlots: fields.totalSlots ?? 50,
      slotsBooked: 0,
      entryFee: fields.entryFee ?? 0,
      prizePool: fields.prizePool || "TBD",
      rules: fields.rules || [],
      desc: fields.desc || "",
      createdAt: new Date().toISOString(),
    };

    // ── Schedule object (timeline info for players) ───────────────────────────
    if (fields.schedule && typeof fields.schedule === "object") {
      const schedule: Record<string, string> = {};
      const scheduleKeys = [
        "registrationOpens",
        "registrationCloses",
        "squadCreation",
        "groupStageStart",
        "groupStageEnd",
      ];
      for (const key of scheduleKeys) {
        if (fields.schedule[key] && typeof fields.schedule[key] === "string") {
          schedule[key] = fields.schedule[key];
        }
      }
      if (Object.keys(schedule).length > 0) {
        tournamentData.schedule = schedule;
      }
    }

    // ── Game-specific fields ──────────────────────────────────────────────────
    if (game === "valorant") {
      if (fields.format === "auction") {
        tournamentData.maxTeams = fields.maxTeams ?? 8;
        tournamentData.minBidPoints = fields.minBidPoints || {};
        tournamentData.captainBudgets = fields.captainBudgets || {};
        tournamentData.sTierCapPerTeam = fields.sTierCapPerTeam ?? 2;
      }
    }

    // ── Optional flags ────────────────────────────────────────────────────────
    if (fields.isTestTournament) tournamentData.isTestTournament = true;
    if (fields.isDailyTournament) tournamentData.isDailyTournament = true;

    // ── Write to Firestore ────────────────────────────────────────────────────
    await adminDb.collection(collectionName).doc(tournamentId).set(tournamentData);

    return NextResponse.json({
      success: true,
      message: `Tournament "${fields.name}" created in ${collectionName}`,
      tournamentId,
      collection: collectionName,
    });
  } catch (e: any) {
    console.error("[API] Create tournament error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}