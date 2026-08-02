// Settling a PayU transaction — shared by the browser callback and the
// server-to-server webhook, which is why it lives here rather than in a route.
//
// Both entry points can fire for the same transaction, in either order, and
// either can be retried. So this is written to be idempotent: the money
// decision happens inside a Firestore transaction that refuses to re-settle an
// already-paid payment, and everything after it is a merge-write.
//
// Trust model: the callback arrives through the player's own browser and is
// therefore evidence, not proof. The hash proves it came from someone holding
// the salt; verifyPayment() asks PayU directly and is what we actually act on.
// A payment is only marked paid when PayU itself says success AND the amount
// matches what we recorded at initiate time — never what the caller claims.

import { adminDb } from "@/lib/firebaseAdmin";
import { verifyPayment, isResponseHashValid, payuConfig } from "@/lib/payu";
import { grantPaidEntry, PAID_GAMES, PaidGame, RegistrationMode } from "@/lib/paidEntry";

export type PaymentStatus = "initiated" | "paid" | "failed" | "pending" | "review";

export type SettleResult = {
  found: boolean;
  status: PaymentStatus;
  alreadySettled: boolean;
  payment?: any;
  note?: string;
};

/**
 * @param callback  raw form body from PayU, when settling from surl/furl or the
 *                  webhook. Absent when we are just re-polling status.
 * @param origin    absolute origin used for the internal registration call.
 */
export async function settlePayuPayment(args: {
  txnid: string;
  source: "callback" | "webhook" | "poll";
  callback?: Record<string, string>;
  origin?: string;
}): Promise<SettleResult> {
  const { txnid, source, callback, origin } = args;

  const ref = adminDb.collection("payments").doc(txnid);
  const snap = await ref.get();
  if (!snap.exists) return { found: false, status: "failed", alreadySettled: false, note: "unknown transaction" };

  const existing = snap.data()!;
  if (existing.status === "paid") {
    // Already done. Registration is still retried below in case it was the part
    // that failed last time.
    await ensureRegistered(txnid, existing, origin);
    const fresh = await ref.get();
    return { found: true, status: "paid", alreadySettled: true, payment: { txnid, ...fresh.data() } };
  }

  // ── Signature check on the callback, if we were given one ────────────────
  let hashValid: boolean | null = null;
  if (callback && callback.hash) {
    const { salt, key } = payuConfig();
    hashValid = isResponseHashValid(salt, key, callback);
  }

  // ── Ask PayU what actually happened. This is the authority ───────────────
  const verified = await verifyPayment(txnid);

  const expectedAmount = Number(existing.amount);
  const reportedAmount = verified.ok && verified.amount != null ? Number(verified.amount) : NaN;

  let status: PaymentStatus;
  let note = "";

  if (!verified.ok) {
    // Couldn't reach PayU. Never promote to paid on the callback's word alone.
    status = "pending";
    note = `could not reach PayU to verify (${verified.error || "unknown"}) — will settle on webhook or retry`;
  } else if (verified.status === "success") {
    if (Number.isFinite(reportedAmount) && Math.abs(reportedAmount - expectedAmount) < 0.01) {
      status = "paid";
    } else {
      status = "review";
      note = `amount mismatch — expected ₹${expectedAmount}, PayU reported ₹${verified.amount}`;
    }
  } else if (verified.status === "pending" || verified.status === "in progress") {
    status = "pending";
    note = "PayU reports the payment is still in progress";
  } else if (verified.status === "not found") {
    status = existing.status === "initiated" ? "initiated" : "failed";
    note = "PayU has no record of this transaction yet";
  } else {
    status = "failed";
    note = callback?.error_Message || callback?.field9 || verified.status || "payment failed";
  }

  if (hashValid === false) {
    // PayU's own verdict still governs, but a bad signature is worth flagging:
    // it means something posted to our callback that did not hold the salt.
    note = `${note ? note + "; " : ""}callback hash did not validate`;
    if (status === "paid") status = "review";
  }

  // ── Commit the decision, refusing to overwrite a settled payment ──────────
  const committed = await adminDb.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const curData = cur.data() || {};
    if (curData.status === "paid") return { status: "paid" as PaymentStatus, changed: false };

    tx.set(ref, {
      status,
      settleNote: note || null,
      settledFrom: source,
      settledAt: new Date().toISOString(),
      hashValid,
      payuStatus: verified.status || null,
      payuMihpayid: verified.mihpayid || callback?.mihpayid || null,
      payuMode: verified.mode || callback?.mode || null,
      payuAmount: verified.amount || callback?.amount || null,
      payuError: callback?.error_Message || callback?.error || null,
      bankRefNum: callback?.bank_ref_num || verified.raw?.bank_ref_num || null,
      ...(callback ? { callbackBody: callback } : {}),
      verifyRaw: verified.raw || null,
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return { status, changed: true };
  });

  if (committed.status === "paid") {
    await grantPaidEntry({
      game: existing.game,
      tournamentId: existing.tournamentId,
      uid: existing.uid,
      txnid,
      amount: expectedAmount,
    });
    await ensureRegistered(txnid, { ...existing, status: "paid" }, origin);
  }

  const fresh = await ref.get();
  return {
    found: true,
    status: committed.status,
    alreadySettled: !committed.changed,
    payment: { txnid, ...fresh.data() },
    note,
  };
}

/**
 * Finish the job the player actually paid for.
 *
 * Registration runs through the normal registration route rather than a copy of
 * its logic, so every existing validation, rank sync and Discord DM still
 * happens exactly once and can never drift from the free path. The paid-entry
 * grant above is what lets that route's own gate through.
 *
 * Team modes are deliberately not auto-completed — creating or joining a team
 * needs a choice (and a code) the player makes on the site. Their entitlement
 * is already granted, so returning and clicking through just works.
 */
async function ensureRegistered(txnid: string, payment: any, origin?: string) {
  if (payment.registration?.ok) return;

  const mode: RegistrationMode = payment.mode || "solo";
  if (mode !== "solo") return;

  const game = payment.game as PaidGame;
  const endpoint = PAID_GAMES[game]?.endpoints?.solo;
  if (!endpoint) return;

  const base = origin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const res = await fetch(`${base}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId: payment.tournamentId, uid: payment.uid }),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));

    // "Already registered" is a success from the payment's point of view — it
    // means an earlier attempt (or the player themselves) got there first.
    const ok = res.ok || /already registered|already in/i.test(data?.error || "");

    await adminDb.collection("payments").doc(txnid).set({
      registration: {
        ok,
        attemptedAt: new Date().toISOString(),
        endpoint,
        error: ok ? null : data?.error || `registration returned ${res.status}`,
      },
    }, { merge: true });
  } catch (e: any) {
    await adminDb.collection("payments").doc(txnid).set({
      registration: {
        ok: false,
        attemptedAt: new Date().toISOString(),
        endpoint,
        error: e?.message || "registration call failed",
      },
    }, { merge: true });
  }
}
