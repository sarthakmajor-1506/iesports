// Payment status for the result page.
//
// A payment that is still `initiated` or `pending` gets re-verified against
// PayU on read. That makes the result page self-healing: if the browser
// callback never fired (tab closed, network dropped) and no webhook is
// configured, simply opening this page settles the payment and completes the
// registration.

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { settlePayuPayment } from "@/lib/settlePayuPayment";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const txnid = req.nextUrl.searchParams.get("txnid") || "";
  if (!txnid) return NextResponse.json({ error: "Missing txnid" }, { status: 400 });

  const ref = adminDb.collection("payments").doc(txnid);
  let snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  let data = snap.data()!;

  // Re-settle while PayU has not reached a verdict, and also when a payment is
  // paid but its registration never landed — settling retries the registration
  // call, so a player who pays and somehow ends up unregistered fixes it simply
  // by opening this page.
  const open = data.status === "initiated" || data.status === "pending";
  const paidButNotRegistered = data.status === "paid" && !data.registration?.ok;

  if (open || paidButNotRegistered) {
    try {
      await settlePayuPayment({
        txnid,
        source: "poll",
        origin: process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin,
      });
      snap = await ref.get();
      data = snap.data()!;
    } catch { /* fall through and report what we have */ }
  }

  return NextResponse.json({
    txnid,
    status: data.status,
    amount: data.amount,
    game: data.game,
    tournamentId: data.tournamentId,
    tournamentName: data.tournamentName,
    mode: data.mode,
    registered: !!data.registration?.ok,
    registrationError: data.registration?.error || null,
    payuStatus: data.payuStatus || null,
    payuMode: data.payuMode || null,
    mihpayid: data.payuMihpayid || null,
    // Re-validated on the way out: whatever is stored, only a same-site path
    // ever reaches the browser as somewhere to navigate to.
    returnTo: typeof data.returnTo === "string" && /^\/(?!\/)[^\s]*$/.test(data.returnTo) ? data.returnTo : null,
    note: data.settleNote || null,
    createdAt: data.createdAt,
  });
}
