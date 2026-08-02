// PayU Hosted Checkout — hashing, config and server-to-server verification.
//
// The whole integration rests on two SHA-512 hashes and one verify call:
//
//   1. requestHash()   signs what we send TO PayU. PayU rejects the transaction
//                      if it doesn't match, so any drift between the hashed
//                      string and the posted form fields shows up as
//                      "hash mismatch" and nothing else.
//   2. isResponseHashValid()  proves a callback really came from PayU. Only
//                      someone holding the salt can produce it.
//   3. verifyPayment() asks PayU directly what it thinks happened. This is the
//                      authority — the callback is delivered through the user's
//                      own browser, so it is evidence, not proof.
//
// Nothing here touches Firestore or Next.js; it is pure and unit-testable.

import crypto from "crypto";

export type PayuMode = "test" | "live";

export type PayuConfig = {
  key: string;
  salt: string;
  mode: PayuMode;
  paymentUrl: string; // where the browser POSTs the checkout form
  verifyUrl: string;  // server-to-server transaction verification
};

/**
 * Credentials resolve per mode, so switching test↔live is a single env change
 * and it is impossible to pair a live salt with the test endpoint.
 * PAYU_MERCHANT_KEY / _SALT stay supported as the un-suffixed fallback.
 */
export function payuConfig(): PayuConfig {
  const mode: PayuMode = (process.env.PAYU_MODE || "test").toLowerCase() === "live" ? "live" : "test";

  const key = (mode === "live"
    ? process.env.PAYU_LIVE_KEY || process.env.PAYU_MERCHANT_KEY
    : process.env.PAYU_TEST_KEY || process.env.PAYU_MERCHANT_KEY) || "";

  const salt = (mode === "live"
    ? process.env.PAYU_LIVE_SALT || process.env.PAYU_MERCHANT_SALT
    : process.env.PAYU_TEST_SALT || process.env.PAYU_MERCHANT_SALT) || "";

  if (!key || !salt) {
    throw new Error(
      `PayU is not configured for ${mode} mode — set ${mode === "live" ? "PAYU_LIVE_KEY/PAYU_LIVE_SALT" : "PAYU_TEST_KEY/PAYU_TEST_SALT"} (or PAYU_MERCHANT_KEY/PAYU_MERCHANT_SALT).`
    );
  }

  return {
    key,
    salt,
    mode,
    paymentUrl: mode === "live" ? "https://secure.payu.in/_payment" : "https://test.payu.in/_payment",
    verifyUrl: mode === "live"
      ? "https://info.payu.in/merchant/postservice.php?form=2"
      : "https://test.payu.in/merchant/postservice.php?form=2",
  };
}

const sha512 = (s: string) => crypto.createHash("sha512").update(s).digest("hex");

export type PayuUdf = { udf1?: string; udf2?: string; udf3?: string; udf4?: string; udf5?: string };

export type PayuRequestFields = {
  txnid: string;
  amount: string;      // always 2dp — must be byte-identical to the posted field
  productinfo: string;
  firstname: string;
  email: string;
} & PayuUdf;

/**
 * sha512(key|txnid|amount|productinfo|firstname|email|udf1..udf5||||||salt)
 * The six empty fields before the salt are reserved slots — PayU requires them
 * even though they are never populated on this integration.
 */
export function requestHash(key: string, salt: string, f: PayuRequestFields): string {
  const parts = [
    key, f.txnid, f.amount, f.productinfo, f.firstname, f.email,
    f.udf1 || "", f.udf2 || "", f.udf3 || "", f.udf4 || "", f.udf5 || "",
    "", "", "", "", "", // reserved
    salt,
  ];
  return sha512(parts.join("|"));
}

/**
 * The response hash is the request hash reversed, with `status` spliced in and
 * the udf fields walked backwards from udf10.
 *
 * Two documented shapes exist and PayU picks one per account: the classic form
 * ending at txnid, and a newer form that appends the merchant key. This account
 * emits the trailing-key form. Both are accepted because checking only the one
 * in the older docs rejects every legitimate callback on a newer account — and
 * a rejected callback is indistinguishable from a forged one.
 *
 * `additionalCharges` is prepended when PayU applied any, giving four
 * candidates in total. All are derived from the salt, so accepting more shapes
 * does not weaken the check: an attacker still cannot produce any of them.
 */
export function isResponseHashValid(salt: string, key: string, body: Record<string, string>): boolean {
  const tail = [
    body.status || "",
    body.udf10 || "", body.udf9 || "", body.udf8 || "", body.udf7 || "", body.udf6 || "",
    body.udf5 || "", body.udf4 || "", body.udf3 || "", body.udf2 || "", body.udf1 || "",
    body.email || "", body.firstname || "", body.productinfo || "", body.amount || "", body.txnid || "",
  ];

  const shapes = [
    [salt, ...tail],            // classic — ends at txnid
    [salt, ...tail, key],       // newer — merchant key appended
  ];
  if (body.additionalCharges) {
    shapes.push([body.additionalCharges, salt, ...tail]);
    shapes.push([body.additionalCharges, salt, ...tail, key]);
  }

  const given = (body.hash || "").toLowerCase();
  return shapes
    .map((parts) => sha512(parts.join("|")))
    // Length-safe constant-time compare: timingSafeEqual throws on length mismatch.
    .some((c) => c.length === given.length && crypto.timingSafeEqual(Buffer.from(c), Buffer.from(given)));
}

export type PayuVerifyResult = {
  ok: boolean;              // did PayU answer at all
  status?: string;          // success | failure | pending | not found
  amount?: string;
  mihpayid?: string;
  mode?: string;
  error?: string;
  raw?: any;
};

/** Ask PayU what actually happened to a transaction. The authoritative answer. */
export async function verifyPayment(txnid: string): Promise<PayuVerifyResult> {
  const { key, salt, verifyUrl } = payuConfig();
  const command = "verify_payment";
  const hash = sha512(`${key}|${command}|${txnid}|${salt}`);

  try {
    const res = await fetch(verifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ key, command, var1: txnid, hash }).toString(),
      cache: "no-store",
    });

    const text = await res.text();
    let json: any;
    try { json = JSON.parse(text); } catch { return { ok: false, error: `PayU verify returned non-JSON: ${text.slice(0, 200)}` }; }

    const details = json?.transaction_details?.[txnid];
    if (!details) return { ok: true, status: "not found", raw: json };

    return {
      ok: true,
      status: String(details.status || "").toLowerCase(),
      amount: details.amt != null ? String(details.amt) : undefined,
      mihpayid: details.mihpayid ? String(details.mihpayid) : undefined,
      mode: details.mode ? String(details.mode) : undefined,
      raw: details,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || "PayU verify request failed" };
  }
}

// ── Field shaping ───────────────────────────────────────────────────────────
// PayU rejects or mangles unexpected characters, and the hash is computed over
// the exact strings posted — so every value is normalised once, here, and the
// normalised value is what gets both hashed and sent.

/** Transaction id: alphanumeric, unique, PayU caps it at 25 characters. */
export function newTxnId(prefix = "IE"): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(5).toString("hex").toUpperCase();
  return `${prefix}${stamp}${rand}`.slice(0, 25);
}

/** PayU compares the amount string literally — "200" and "200.00" differ. */
export const formatAmount = (rupees: number): string => (Math.round(rupees * 100) / 100).toFixed(2);

export const sanitizeText = (s: string, max = 100): string =>
  (s || "").replace(/[^a-zA-Z0-9 .\-_]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

export const sanitizeName = (s: string): string => {
  const first = sanitizeText(s, 60).split(" ")[0] || "";
  return first.replace(/[^a-zA-Z]/g, "") || "Player";
};

/**
 * PayU requires an email. Players sign in with phone/Steam/Discord and many
 * have none, so a stable synthetic address stands in — it is only ever used as
 * a PayU record field, never messaged.
 */
export const resolveEmail = (email: string | undefined, uid: string): string => {
  const e = (email || "").trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return e;
  return `${uid.replace(/[^a-zA-Z0-9._-]/g, "")}@players.iesports.in`;
};

/** PayU wants a bare 10-digit Indian mobile; stored numbers carry a +91. */
export const resolvePhone = (phone: string | undefined): string => {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
};
