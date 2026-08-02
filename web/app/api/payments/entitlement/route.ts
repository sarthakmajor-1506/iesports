// "Has this player paid, and what is still missing?"
//
// Payment now happens before profile setup, which creates a state that did not
// exist before: a player who holds a paid slot but is not yet in the tournament
// because their name, phone or game account is missing. The tournament page
// derives "Registered" from the players list, so without this it would show
// such a player a Register button for something they have already paid for.

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { PAID_GAMES, isPaidGame, entryFeeOf, loadTournament, paidEntryId } from "@/lib/paidEntry";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const game = req.nextUrl.searchParams.get("game") || "";
  const tournamentId = req.nextUrl.searchParams.get("tournamentId") || "";
  const uid = req.nextUrl.searchParams.get("uid") || "";

  if (!isPaidGame(game) || !tournamentId || !uid) {
    return NextResponse.json({ error: "Missing or invalid game, tournamentId or uid" }, { status: 400 });
  }

  const cfg = PAID_GAMES[game];

  const [tournament, entitlement, userSnap] = await Promise.all([
    loadTournament(game, tournamentId),
    adminDb.collection("paidEntries").doc(paidEntryId(game, tournamentId, uid)).get(),
    adminDb.collection("users").doc(uid).get(),
  ]);

  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

  const user = userSnap.data() || {};
  const registered = ((user as any)[cfg.registeredField] || []).includes(tournamentId);

  // What setup remains. Riot/Steam counts as done the moment it is LINKED —
  // whether the rank has been verified yet is an internal review concern and is
  // never surfaced to the player.
  const missing: string[] = [];
  if (!user.fullName) missing.push("name");
  if (!user.phone && !(user as any).phoneNumber) missing.push("phone");
  if (!user.discordId) missing.push("discord");
  if (game === "valorant") { if (!(user as any).riotGameName) missing.push("riot"); }
  else if (!(user as any).steamId) missing.push("steam");

  return NextResponse.json({
    game,
    tournamentId,
    entryFee: entryFeeOf(tournament),
    paid: entitlement.exists,
    registered,
    missing,
    // The state the tournament page renders as "Details pending".
    setupPending: entitlement.exists && !registered,
  });
}
