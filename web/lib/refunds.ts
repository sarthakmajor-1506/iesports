// Withdrawals, and the money they owe.
//
// The registration screen promises, right next to the price: "Withdraw any time
// before registration closes and you get the whole ₹500 back." Until now the
// unregister route deleted a row, moved a counter and told nobody. The
// obligation existed only in the player's memory, `reconcile --apply` would
// happily put the withdrawn player back in the tournament, and the entitlement
// survived, so a player who WAS refunded kept a free claim to a slot.
//
// The actual refund stays manual, in the PayU dashboard. That is fine. What was
// missing is the record: a withdrawal now writes `refunds/{txnid}` as `owed`,
// voids the entitlement so the seat cannot be re-taken for free, and pings ops.
// Manual work with a queue behind it is an operation; manual work with nothing
// behind it is a leak.

import { adminDb } from "@/lib/firebaseAdmin";
import { PAID_GAMES, paidEntryId, type PaidGame } from "@/lib/paidEntry";
import { releaseHold } from "@/lib/registrationSlots";
import { sendDM, notifyOps } from "@/lib/discord";

export type RefundStatus = "owed" | "paid" | "cancelled";

export type OpenRefundResult =
  | { opened: true; txnid: string; amount: number; hasUpi: boolean }
  | { opened: false; reason: "no_payment" };

/**
 * Called when a player who paid leaves a tournament.
 *
 * Idempotent on the payment: the refund document id IS the transaction id, so
 * withdrawing twice (or a retry) cannot open two obligations for one payment.
 */
export async function openRefund(args: {
  game: PaidGame;
  tournamentId: string;
  uid: string;
  reason?: string;
}): Promise<OpenRefundResult> {
  const { game, tournamentId, uid, reason = "withdrew before registration closed" } = args;

  // The payment behind this seat. Newest wins if a player somehow paid twice.
  const paidSnap = await adminDb
    .collection("payments")
    .where("uid", "==", uid)
    .where("tournamentId", "==", tournamentId)
    .where("status", "==", "paid")
    .get();

  // A captain's team payment is not a solo seat: withdrawing as a player must
  // never refund the team. Team refunds are decided at close, by a human.
  const mine = paidSnap.docs
    .filter((d) => (d.data() as any).game === game && (d.data() as any).mode !== "team_create")
    .sort((a, b) => String((b.data() as any).settledAt || "").localeCompare(String((a.data() as any).settledAt || "")));

  const entRef = adminDb.collection("paidEntries").doc(paidEntryId(game, tournamentId, uid));

  if (!mine.length) {
    // Nothing was ever charged (free tournament, or grandfathered in). Still
    // void any entitlement so the books stay honest.
    await entRef.set({ voided: true, voidedAt: new Date().toISOString(), voidReason: reason }, { merge: true }).catch(() => {});
    await releaseHold(game, tournamentId, uid);
    return { opened: false, reason: "no_payment" };
  }

  const payment = mine[0];
  const p = payment.data() as any;
  const amount = Number(p.amount) || 0;

  const [userSnap, tSnap] = await Promise.all([
    adminDb.collection("users").doc(uid).get(),
    adminDb.collection(PAID_GAMES[game].collection).doc(tournamentId).get(),
  ]);
  const user = (userSnap.data() || {}) as any;
  const tournamentName = (tSnap.data() as any)?.name || p.tournamentName || tournamentId;
  const upiId = (user.upiId || "").trim();

  // The entitlement is voided rather than deleted so the history survives, and
  // `requirePaidEntry` treats a voided entitlement as no entitlement.
  await entRef.set(
    { voided: true, voidedAt: new Date().toISOString(), voidReason: reason, refundTxnid: payment.id },
    { merge: true }
  );
  await releaseHold(game, tournamentId, uid);

  await adminDb.collection("refunds").doc(payment.id).set(
    {
      txnid: payment.id,
      uid,
      game,
      tournamentId,
      tournamentName,
      amount,
      status: "owed" as RefundStatus,
      reason,
      upiId: upiId || null,
      playerName: user.fullName || user.riotGameName || user.steamName || "",
      discordId: user.discordId || (uid.startsWith("discord_") ? uid.replace("discord_", "") : ""),
      phone: user.phone || user.phoneNumber || "",
      payuMihpayid: p.payuMihpayid || null,
      openedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  const discordId = user.discordId || (uid.startsWith("discord_") ? uid.replace("discord_", "") : "");
  if (discordId) {
    sendDM(
      discordId,
      upiId
        ? `You have withdrawn from **${tournamentName}**. Your ₹${amount} refund is queued and will be sent to **${upiId}**. If that UPI ID is wrong, update it on your iesports profile and tell us.`
        : `You have withdrawn from **${tournamentName}**. Your ₹${amount} refund is queued. Add your UPI ID on your iesports profile so we can send it, then reply here.`
    ).catch(() => {});
  }

  notifyOps(
    [
      `**Refund owed** — ₹${amount}`,
      `${user.fullName || uid} (${uid})`,
      `${PAID_GAMES[game].label} · ${tournamentName}`,
      `txn \`${payment.id}\`${p.payuMihpayid ? ` · PayU \`${p.payuMihpayid}\`` : ""}`,
      upiId ? `UPI: \`${upiId}\`` : `UPI: **not on file** — ask before refunding`,
    ].join("\n")
  ).catch(() => {});

  return { opened: true, txnid: payment.id, amount, hasUpi: !!upiId };
}

/** Is there an open refund for this seat? Used to stop repair tools re-registering someone who quit. */
export async function hasOpenRefund(game: PaidGame, tournamentId: string, uid: string): Promise<boolean> {
  const snap = await adminDb
    .collection("refunds")
    .where("uid", "==", uid)
    .where("tournamentId", "==", tournamentId)
    .where("status", "==", "owed")
    .limit(1)
    .get();
  return !snap.empty && snap.docs.some((d) => (d.data() as any).game === game);
}
