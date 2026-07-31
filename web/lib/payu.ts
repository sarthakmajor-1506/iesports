/**
 * PayU Hosted Checkout Pro helpers.
 *
 * Pure crypto/formatting — no Firestore access here (mirrors lib/elo.ts,
 * lib/discord.ts as one-helper-per-integration modules).
 *
 * Hash formulas (SHA-512, pipe-delimited) confirmed against docs.payu.in:
 *   request:  sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
 *   response: sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
 *
 * SALT is never sent to PayU in any request — it only ever exists server-side,
 * used locally to compute/verify hashes. Never log PAYU_MERCHANT_SALT or the
 * key.
 */

import crypto from "crypto";

export type PayuMode = "test" | "live";

export function getPayuConfig() {
  const key = process.env.PAYU_MERCHANT_KEY;
  const salt = process.env.PAYU_MERCHANT_SALT;
  const mode = (process.env.PAYU_MODE as PayuMode) || "test";
  if (!key || !salt) {
    throw new Error("PayU not configured — set PAYU_MERCHANT_KEY and PAYU_MERCHANT_SALT");
  }
  return { key, salt, mode };
}

export function getPayuBaseUrl(mode: PayuMode): string {
  return mode === "live" ? "https://secure.payu.in/_payment" : "https://test.payu.in/_payment";
}

/** Verify Payment API base — used by the reconciliation cron. */
export function getPayuVerifyUrl(mode: PayuMode): string {
  return mode === "live" ? "https://info.payu.in/merchant/postservice?form=2" : "https://test.payu.in/merchant/postservice?form=2";
}

/** txnid must be alphanumeric and PayU recommends keeping it well under 25 chars. */
export function buildTxnId(prefix: string): string {
  const rand = crypto.randomBytes(5).toString("hex"); // 10 chars
  const short = `${prefix}${rand}`.replace(/[^a-zA-Z0-9]/g, "");
  return short.slice(0, 25);
}

type HashFields = {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
};

export function generateRequestHash(fields: HashFields, salt: string): string {
  const { key, txnid, amount, productinfo, firstname, email, udf1 = "", udf2 = "", udf3 = "", udf4 = "", udf5 = "" } = fields;
  const raw = [key, txnid, amount, productinfo, firstname, email, udf1, udf2, udf3, udf4, udf5, "", "", "", "", "", salt].join("|");
  return crypto.createHash("sha512").update(raw).digest("hex");
}

type ReverseHashFields = HashFields & { status: string };

function computeReverseHash(fields: ReverseHashFields, salt: string): string {
  const { key, txnid, amount, productinfo, firstname, email, udf1 = "", udf2 = "", udf3 = "", udf4 = "", udf5 = "", status } = fields;
  const raw = [salt, status, "", "", "", "", "", udf5, udf4, udf3, udf2, udf1, email, firstname, productinfo, amount, txnid, key].join("|");
  return crypto.createHash("sha512").update(raw).digest("hex");
}

/**
 * Constant-time comparison of the hash PayU sent against the one we compute
 * locally — avoids leaking timing information about how many leading bytes
 * matched. Always returns false (never throws) on malformed input, so a
 * bad/missing hash simply fails verification rather than crashing the caller.
 */
export function verifyResponseHash(fields: ReverseHashFields, salt: string, receivedHash: string): boolean {
  try {
    const expected = computeReverseHash(fields, salt);
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from((receivedHash || "").trim(), "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type PayuFormFields = {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  phone: string;
  surl: string;
  furl: string;
  hash: string;
  udf1: string;
  udf2: string;
  udf3: string;
  udf4: string;
  udf5: string;
  service_provider: "payu_paisa";
};

export function buildPaymentFormFields(params: {
  txnid: string;
  amount: string; // fixed-precision string, e.g. "500.00" — never raw float math
  productinfo: string;
  firstname: string;
  email: string;
  phone: string;
  surl: string;
  furl: string;
  udf1?: string; // tournamentId
  udf2?: string; // game
  udf3?: string; // uid
}): PayuFormFields {
  const { key, salt } = getPayuConfig();
  const udf1 = params.udf1 || "";
  const udf2 = params.udf2 || "";
  const udf3 = params.udf3 || "";
  const udf4 = "";
  const udf5 = "";

  const hash = generateRequestHash(
    {
      key,
      txnid: params.txnid,
      amount: params.amount,
      productinfo: params.productinfo,
      firstname: params.firstname,
      email: params.email,
      udf1,
      udf2,
      udf3,
      udf4,
      udf5,
    },
    salt
  );

  return {
    key,
    txnid: params.txnid,
    amount: params.amount,
    productinfo: params.productinfo,
    firstname: params.firstname,
    email: params.email,
    phone: params.phone,
    surl: params.surl,
    furl: params.furl,
    hash,
    udf1,
    udf2,
    udf3,
    udf4,
    udf5,
    service_provider: "payu_paisa",
  };
}

/** Formats an entryFee (rupees, integer or decimal) as PayU's expected fixed-precision string. */
export function formatAmount(entryFee: number): string {
  return entryFee.toFixed(2);
}

/** Hash formula for PayU's command-based General APIs (e.g. verify_payment): sha512(key|command|var1|salt). */
export function generateCommandHash(key: string, command: string, var1: string, salt: string): string {
  return crypto.createHash("sha512").update(`${key}|${command}|${var1}|${salt}`).digest("hex");
}

/**
 * Calls PayU's Verify Payment API for a given txnid — the documented
 * fallback for webhooks that never arrive. Base URL for live mode should be
 * re-confirmed against PayU's current integration guide before relying on
 * this in production (their docs are explicit about the test URL but don't
 * clearly state the live one on the page consulted while building this).
 */
export async function verifyPaymentByTxnId(txnid: string): Promise<any | null> {
  const { key, salt, mode } = getPayuConfig();
  const hash = generateCommandHash(key, "verify_payment", txnid, salt);
  const url = getPayuVerifyUrl(mode);
  const body = new URLSearchParams({ key, command: "verify_payment", var1: txnid, hash });
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
  if (!res.ok) return null;
  const json = await res.json();
  return json?.transaction_details?.[txnid] || null;
}
