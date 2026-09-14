// Who is actually calling?
//
// Registration, unregistration and payment routes all take a `uid` in their
// body and, until now, believed it. With PayU live that stopped being a data
// question and became a money one: an unauthenticated POST could unregister a
// player who had paid ₹500, and /api/payments/entitlement disclosed whether any
// account had paid and exactly which profile fields it was missing.
//
// Two callers are legitimate:
//
//   1. the player's own browser, holding a Firebase ID token
//   2. our own server finishing a registration the player already paid for
//      (settlePayuPayment, payuTools reconcile). There is no user token in that
//      path, so it presents a shared secret instead.
//
// The secret falls back to ADMIN_SECRET, which is already set everywhere this
// runs. That matters: if the internal path could be misconfigured into failing,
// a deploy without a new env var would take money and never register anyone.

import type { NextRequest } from "next/server";
import crypto from "crypto";
import { adminAuth } from "@/lib/firebaseAdmin";

export const INTERNAL_HEADER = "x-iesports-internal";

/** Secret shared between our own server-side callers and these routes. */
export function internalSecret(): string {
  return process.env.INTERNAL_API_SECRET || process.env.ADMIN_SECRET || "";
}

/** Headers for a server-to-server call into one of these routes. */
export function internalHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "Content-Type": "application/json", [INTERNAL_HEADER]: internalSecret(), ...extra };
}

function secretMatches(given: string): boolean {
  const want = internalSecret();
  if (!want || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export type Caller =
  | { ok: true; uid: string; via: "token" | "internal"; admin: boolean }
  | { ok: false; status: number; error: string };

/**
 * Authorise a call that claims to act for `claimedUid`.
 *
 * A player's token must match the uid it is acting on. An internal caller is
 * trusted for any uid, because it only ever acts on a payment record that
 * already names one.
 */
export async function verifyCaller(req: NextRequest, claimedUid: string): Promise<Caller> {
  const internal = req.headers.get(INTERNAL_HEADER) || "";
  if (internal) {
    if (!secretMatches(internal)) return { ok: false, status: 401, error: "Unauthorized" };
    return { ok: true, uid: claimedUid, via: "internal", admin: true };
  }

  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, error: "Sign in and try again." };

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return { ok: false, status: 401, error: "Your session expired. Sign in again." };
  }

  if (decoded.uid !== claimedUid) {
    // An admin acting on someone else goes through the admin routes, not here.
    return { ok: false, status: 403, error: "You can only do this for your own account." };
  }

  return { ok: true, uid: decoded.uid, via: "token", admin: false };
}
