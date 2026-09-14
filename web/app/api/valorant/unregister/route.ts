import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { recalcTiers } from "@/lib/recalcTiers";
import { syncPlayerSnapshot } from "@/lib/valorantPlayerSnapshot";
import { releaseSoloSlot } from "@/lib/registrationSlots";
import { openRefund } from "@/lib/refunds";
import { verifyCaller } from "@/lib/apiAuth";
import { isTeamRegistration } from "@/lib/paidEntry";
import { findTeamFor } from "@/lib/valorantTeams";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, uid, upiId } = await req.json();
    if (!tournamentId || !uid) {
      return NextResponse.json({ error: "Missing tournamentId or uid" }, { status: 400 });
    }

    const caller = await verifyCaller(req, uid);
    if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const tournRef = adminDb.collection("valorantTournaments").doc(tournamentId);
    const tourn = await tournRef.get();
    if (!tourn.exists) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const data = tourn.data()!;

    // Don't allow unregister if teams are already formed or tournament is active/ended
    if (data.bracketsComputed) {
      return NextResponse.json({ error: "Cannot unregister after teams have been formed" }, { status: 400 });
    }
    if (data.status === "active" || data.status === "ended") {
      return NextResponse.json({ error: "Cannot unregister from an active or ended tournament" }, { status: 400 });
    }

    // On a team tournament, a player on a team leaves the team instead. Only a
    // player on no team (someone who paid solo before the switch) withdraws here.
    if (isTeamRegistration(data) && (await findTeamFor(tournamentId, uid))) {
      return NextResponse.json({ error: "You're on a team — leave the team instead." }, { status: 400 });
    }

    // Check if player is a team captain — can't unregister if you have a team
    const teamsSnap = await adminDb.collection("valorantTeams")
      .where("tournamentId", "==", tournamentId)
      .where("captainUid", "==", uid)
      .get();
    if (!teamsSnap.empty) {
      return NextResponse.json({ error: "Cannot unregister — you are a team captain. Disband your team first." }, { status: 400 });
    }

    // A UPI ID offered at the moment of withdrawal is saved before the refund is
    // opened, so the refund record carries somewhere to send the money.
    if (typeof upiId === "string" && upiId.trim()) {
      await adminDb.collection("users").doc(uid).set(
        { upiId: upiId.trim(), upiUpdatedAt: new Date().toISOString() },
        { merge: true }
      );
    }

    // Player document, slot counter and the user's tournament array in one
    // transaction, so a repeated call cannot decrement the counter twice.
    const released = await releaseSoloSlot({ game: "valorant", tournamentId, uid });
    if (!released.ok) {
      if (released.reason === "not_registered") {
        return NextResponse.json({ error: "You are not registered for this tournament" }, { status: 400 });
      }
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // The seat was paid for, so leaving it owes the player money. This voids the
    // entitlement (otherwise a refunded player keeps a free claim to a slot) and
    // opens a refund for a human to pay out from the PayU dashboard.
    const refund = await openRefund({ game: "valorant", tournamentId, uid });

    // Recalculate tiers for remaining players
    await recalcTiers(tournamentId);

    // Refresh denormalized playersSnapshot on the tournament doc
    await syncPlayerSnapshot(tournamentId);

    return NextResponse.json({
      success: true,
      refund: refund.opened
        ? { owed: true, amount: refund.amount, needsUpi: !refund.hasUpi }
        : { owed: false },
    });
  } catch (error: any) {
    console.error("Unregister error:", error);
    return NextResponse.json({ error: error.message || "Failed to unregister" }, { status: 500 });
  }
}
