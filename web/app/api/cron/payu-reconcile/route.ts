import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyPaymentByTxnId } from "@/lib/payu";
import { finalizeSuccessfulPayment, type Game } from "@/lib/payuBooking";

/**
 * GET /api/cron/payu-reconcile
 *
 * Fallback for PayU webhooks that never arrive (PayU's own S2S integration
 * checklist recommends the Verify Payment API as exactly this kind of
 * secondary check). Sweeps payuOrders stuck in initiated/pending past a few
 * minutes, asks PayU directly what happened, and resolves them the same way
 * the webhook would — via the same finalizeSuccessfulPayment helper, so
 * behavior can never drift between the two paths.
 *
 * Auth mirrors app/api/cron/registration-close/route.ts exactly.
 *
 * NOTE: registered in vercel.json at a 10-minute cadence. Vercel's Hobby
 * plan only allows daily cron schedules (the existing registration-close
 * cron runs "0 0 * * *") — if this project is on Hobby, this schedule will
 * be rejected/coerced at deploy time and needs either a Pro plan or a
 * daily-cadence fallback (accepting up to ~24h staleness on stuck orders,
 * which is still strictly better than no reconciliation at all).
 */
const STALE_AFTER_MS = 5 * 60 * 1000;

function authorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") || "";
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  const secret = req.nextUrl.searchParams.get("secret");
  if (process.env.ADMIN_SECRET && secret === process.env.ADMIN_SECRET) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const results: any[] = [];

  try {
    // NOTE: needs a Firestore composite index (status ASC, createdAt ASC) —
    // Firestore throws with a direct console link to create it on first run.
    const snap = await adminDb
      .collection("payuOrders")
      .where("status", "in", ["initiated", "pending"])
      .where("createdAt", "<", cutoff)
      .get();

    for (const doc of snap.docs) {
      const order = doc.data();
      const txnid = order.txnid;
      try {
        const verified = await verifyPaymentByTxnId(txnid);
        if (!verified) {
          results.push({ txnid, action: "verify_failed_no_response" });
          continue;
        }
        const payuStatus = (verified.status || "").toLowerCase();
        if (payuStatus === "success") {
          const result = await finalizeSuccessfulPayment({
            txnid,
            tournamentId: order.tournamentId,
            game: order.game as Game,
            uid: order.uid,
            mihpayid: verified.mihpayid || null,
            payuStatus,
          });
          results.push({ txnid, action: "resolved_success", booked: result.ok ? result.booked : false });
        } else if (payuStatus === "failure" || payuStatus === "failed") {
          await doc.ref.set({ status: "failure", payuStatus, updatedAt: new Date().toISOString() }, { merge: true });
          results.push({ txnid, action: "resolved_failure" });
        } else {
          results.push({ txnid, action: "still_pending", payuStatus });
        }
      } catch (e: any) {
        results.push({ txnid, action: "error", error: e.message });
      }
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
