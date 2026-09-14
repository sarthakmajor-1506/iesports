// "Has this player paid, and what is still missing?"
//
// Payment now happens before profile setup, which creates a state that did not
// exist before: a player who holds a paid slot but is not yet in the tournament
// because their name, phone or game account is missing. The tournament page
// derives "Registered" from the players list, so without this it would show
// such a player a Register button for something they have already paid for.

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { PAID_GAMES, isPaidGame, entryFeeOf, loadTournament, paidEntryId, isLiveEntitlement } from "@/lib/paidEntry";
import { verifyCaller } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const game = req.nextUrl.searchParams.get("game") || "";
  const tournamentId = req.nextUrl.searchParams.get("tournamentId") || "";
  const uid = req.nextUrl.searchParams.get("uid") || "";

  if (!isPaidGame(game) || !tournamentId || !uid) {
    return NextResponse.json({ error: "Missing or invalid game, tournamentId or uid" }, { status: 400 });
  }

  // This answers "has this person paid, and what are they missing?", which is
  // nobody else's business. It used to answer it for any uid a caller typed.
  const caller = await verifyCaller(req, uid);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

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

  const paid = isLiveEntitlement(entitlement);

  return NextResponse.json({
    game,
    tournamentId,
    entryFee: entryFeeOf(tournament),
    paid,
    registered,
    missing,
    // The state the tournament page renders as "Details pending".
    setupPending: paid && !registered,
    // Withdrawing from a seat they paid for owes them money, so the page needs
    // to know whether to ask where to send it before it lets them leave.
    refundOnWithdraw: paid && entryFeeOf(tournament) > 0,
    upiId: (user as any).upiId || null,
  });
}
