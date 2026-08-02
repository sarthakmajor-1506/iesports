// PayU server-to-server webhook.
//
// This is the path that survives the player closing the tab, losing signal on
// the bank's 3-D Secure page, or a UPI mandate confirming minutes later. The
// browser callback is the fast path; this is the reliable one.
//
// Register the URL under Dashboard → Developer → Webhooks. It must be publicly
// reachable, so it does nothing on localhost — during local testing the browser
// callback settles the payment instead.
//
// No shared secret is required: the handler independently verifies every
// transaction against PayU before acting, so an unauthenticated POST can at
// worst trigger a re-verification of a txnid that already exists.

import { NextRequest, NextResponse } from "next/server";
import { settlePayuPayment } from "@/lib/settlePayuPayment";
import { adminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Record<string, string> = {};

  const contentType = req.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      body = await req.json();
    } else {
      const form = await req.formData();
      form.forEach((v, k) => { body[k] = typeof v === "string" ? v : ""; });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "unreadable body" }, { status: 400 });
  }

  const txnid = body.txnid || body.txnId || "";

  // Keep the raw delivery regardless of what happens next — a webhook we failed
  // to act on is only debuggable if it was stored before it was interpreted.
  await adminDb.collection("payuWebhookEvents").add({
    txnid: txnid || null,
    receivedAt: new Date().toISOString(),
    contentType,
    body,
  }).catch(() => {});

  if (!txnid) return NextResponse.json({ ok: false, error: "missing txnid" }, { status: 400 });

  try {
    const result = await settlePayuPayment({
      txnid,
      source: "webhook",
      callback: body,
      origin: process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin,
    });
    // Always 200 on a known txnid — a non-2xx makes PayU retry, and retrying
    // will not change a settled verdict.
    return NextResponse.json({ ok: true, status: result.status, found: result.found });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "settle failed" }, { status: 500 });
  }
}
