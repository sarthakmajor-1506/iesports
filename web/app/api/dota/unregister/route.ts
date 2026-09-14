import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { releaseSoloSlot } from "@/lib/registrationSlots";
import { openRefund } from "@/lib/refunds";
import { verifyCaller } from "@/lib/apiAuth";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, uid, upiId } = await req.json();
    if (!tournamentId || !uid) {
      return NextResponse.json({ error: "Missing tournamentId or uid" }, { status: 400 });
    }

    const caller = await verifyCaller(req, uid);
    if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const tournRef = adminDb.collection("tournaments").doc(tournamentId);
    const tourn = await tournRef.get();
    if (!tourn.exists) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const data = tourn.data()!;

    if (data.status === "ongoing" || data.status === "ended") {
      return NextResponse.json({ error: "Cannot unregister from an active or ended tournament" }, { status: 400 });
    }

    if (typeof upiId === "string" && upiId.trim()) {
      await adminDb.collection("users").doc(uid).set(
        { upiId: upiId.trim(), upiUpdatedAt: new Date().toISOString() },
        { merge: true }
      );
    }

    // Player document, the global counter, the per-bracket counter and the
    // user's tournament array in one transaction. The bracket to decrement is
    // read from the player document inside that same transaction, so it cannot
    // be applied to a document that has already gone.
    const released = await releaseSoloSlot({
      game: "dota2",
      tournamentId,
      uid,
      extraCounters: (player) =>
        player?.dotaBracket ? { [`brackets.${player.dotaBracket}.slotsBooked`]: -1 } : {},
    });
    if (!released.ok) {
      if (released.reason === "not_registered") {
        return NextResponse.json({ error: "You are not registered for this tournament" }, { status: 400 });
      }
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // Also remove from soloPool if exists
    const soloPoolSnap = await adminDb.collection("soloPool")
      .where("tournamentId", "==", tournamentId)
      .where("uid", "==", uid)
      .get();
    for (const doc of soloPoolSnap.docs) {
      await doc.ref.delete();
    }

    const refund = await openRefund({ game: "dota2", tournamentId, uid });

    return NextResponse.json({
      success: true,
      refund: refund.opened
        ? { owed: true, amount: refund.amount, needsUpi: !refund.hasUpi }
        : { owed: false },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to unregister" }, { status: 500 });
  }
}
