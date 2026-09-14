// Where a player's money goes back to.
//
// We deliberately do NOT ask everyone for a UPI ID. Most players never need
// one, and an extra field in front of registration costs entries. It is asked
// for at the two moments it is actually needed (a refund after a withdrawal, a
// prize payout) and kept on the account afterwards so it is asked once.
//
// It is written through this route rather than straight from the browser
// because it is a payout destination: it gets validated, timestamped, and its
// history kept, and `firestore.rules` locks the field so the client cannot set
// it another way.

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyCaller } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

/** A UPI VPA: handle@psp. Deliberately permissive, since PSP suffixes keep appearing. */
const VPA = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,63})@[a-zA-Z][a-zA-Z0-9.]{1,63}$/;

export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid") || "";
  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

  const caller = await verifyCaller(req, uid);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const snap = await adminDb.collection("users").doc(uid).get();
  const data = snap.data() || {};
  return NextResponse.json({ upiId: data.upiId || null, upiUpdatedAt: data.upiUpdatedAt || null });
}

export async function POST(req: NextRequest) {
  try {
    const { uid, upiId } = await req.json();
    if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

    const caller = await verifyCaller(req, uid);
    if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const value = typeof upiId === "string" ? upiId.trim() : "";

    // An empty value clears it. A player who mistyped one should be able to
    // take it off the account rather than leave money pointed somewhere wrong.
    if (value && !VPA.test(value)) {
      return NextResponse.json({ error: "That doesn't look like a UPI ID. It should look like yourname@bank." }, { status: 400 });
    }

    const userRef = adminDb.collection("users").doc(uid);
    const before = (await userRef.get()).data()?.upiId || null;

    await userRef.set(
      { upiId: value || null, upiUpdatedAt: new Date().toISOString() },
      { merge: true }
    );

    // Payout destinations are worth an audit trail: if a refund lands in the
    // wrong place, the question is always when the address changed.
    if (before !== (value || null)) {
      await userRef.collection("upiHistory").add({
        changedAt: new Date().toISOString(),
        before,
        after: value || null,
        via: caller.via,
      }).catch(() => {});
    }

    // A refund already waiting on this player should pick up the new address
    // rather than sit there marked "UPI not on file".
    const owed = await adminDb
      .collection("refunds")
      .where("uid", "==", uid)
      .where("status", "==", "owed")
      .get();
    for (const d of owed.docs) {
      await d.ref.set({ upiId: value || null }, { merge: true }).catch(() => {});
    }

    return NextResponse.json({ success: true, upiId: value || null, refundsUpdated: owed.size });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not save that" }, { status: 500 });
  }
}
