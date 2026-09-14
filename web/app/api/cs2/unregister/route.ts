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

    const tournRef = adminDb.collection("cs2Tournaments").doc(tournamentId);
    const tourn = await tournRef.get();
    if (!tourn.exists) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const data = tourn.data()!;

    if (data.bracketsComputed) {
      return NextResponse.json({ error: "Cannot unregister after teams have been formed" }, { status: 400 });
    }
    if (data.status === "active" || data.status === "ended") {
      return NextResponse.json({ error: "Cannot unregister from an active or ended tournament" }, { status: 400 });
    }

    if (typeof upiId === "string" && upiId.trim()) {
      await adminDb.collection("users").doc(uid).set(
        { upiId: upiId.trim(), upiUpdatedAt: new Date().toISOString() },
        { merge: true }
      );
    }

    const released = await releaseSoloSlot({ game: "cs2", tournamentId, uid });
    if (!released.ok) {
      if (released.reason === "not_registered") {
        return NextResponse.json({ error: "You are not registered for this tournament" }, { status: 400 });
      }
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    const refund = await openRefund({ game: "cs2", tournamentId, uid });

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
