import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyResponseHash, getPayuConfig } from "@/lib/payu";
import { finalizeSuccessfulPayment, GAME_CONFIG, type Game } from "@/lib/payuBooking";

// Defense-in-depth only — PayU's published webhook source IPs. Never the sole
// authentication mechanism (hash verification is), since Vercel's edge/proxy
// layer can affect the observed source IP. Mismatches are logged, not rejected.
const PAYU_WEBHOOK_IPS = new Set([
  "180.179.174.1", "3.6.73.183", "3.6.83.44", // test
  "3.7.89.1", "3.7.89.2", "3.7.89.3", // production primary
  "52.140.8.88", "52.140.8.89", "52.140.8.64", // production DR
]);

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  const clientIp = getClientIp(req);
  if (!PAYU_WEBHOOK_IPS.has(clientIp)) {
    console.warn(`PayU webhook from unexpected IP: ${clientIp} (logged only, not rejected)`);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }
  const get = (k: string) => (form.get(k)?.toString() ?? "");

  const txnid = get("txnid");
  const status = get("status"); // "success" | "failure" | "pending" | ...
  const receivedHash = get("hash");
  const mihpayid = get("mihpayid") || null;
  const tournamentId = get("udf1");
  const game = get("udf2") as Game;
  const uid = get("udf3");

  if (!txnid || !receivedHash) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  let salt: string, key: string;
  try {
    ({ salt, key } = getPayuConfig());
  } catch (e: any) {
    console.error("PayU webhook: config error", e.message);
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const hashValid = verifyResponseHash(
    {
      key,
      txnid,
      amount: get("amount"),
      productinfo: get("productinfo"),
      firstname: get("firstname"),
      email: get("email"),
      udf1: get("udf1"),
      udf2: get("udf2"),
      udf3: get("udf3"),
      udf4: get("udf4"),
      udf5: get("udf5"),
      status,
    },
    salt,
    receivedHash
  );

  // Never log the full payload (PII: email/phone/name) or the hash/salt values.
  console.log(`PayU webhook: txnid=${txnid} status=${status} hashValid=${hashValid}`);

  if (!hashValid) {
    return NextResponse.json({ error: "Hash verification failed" }, { status: 400 });
  }

  if (!game || !(game in GAME_CONFIG) || !tournamentId || !uid) {
    // Hash was valid but the order metadata is nonsensical — nothing to book.
    return NextResponse.json({ ok: true, note: "no bookable metadata" });
  }

  const orderRef = adminDb.collection("payuOrders").doc(txnid);

  // Only a genuine "success" payment event may ever trigger booking logic —
  // refund/chargeback/failure callbacks update status only, never re-run booking.
  if (status !== "success") {
    await orderRef.set(
      { status: status === "failure" ? "failure" : "pending", payuStatus: status, mihpayid, updatedAt: new Date().toISOString() },
      { merge: true }
    );
    return NextResponse.json({ ok: true });
  }

  const result = await finalizeSuccessfulPayment({ txnid, tournamentId, game, uid, mihpayid, payuStatus: status });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 500 });
  }
  return NextResponse.json({ ok: true, booked: result.booked });
}
