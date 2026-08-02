// PayU return URL (both surl and furl).
//
// PayU sends the player's browser here with a form POST. Two consequences shape
// this handler:
//
//  * It is a cross-site POST, so nothing here may depend on cookies or an auth
//    session — the txnid identifies the payment on its own.
//  * The response has to be a redirect the browser can follow with GET, hence
//    303. Rendering a page from this POST would leave the player on a URL that
//    breaks on refresh.
//
// GET is handled too because PayU can be configured to return that way.

import { NextRequest, NextResponse } from "next/server";
import { settlePayuPayment } from "@/lib/settlePayuPayment";

export const dynamic = "force-dynamic";

async function handle(body: Record<string, string>, req: NextRequest) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const txnid = body.txnid || body.txnId || "";

  if (!txnid) {
    return NextResponse.redirect(`${origin}/payment/unknown?reason=missing-txnid`, 303);
  }

  try {
    await settlePayuPayment({ txnid, source: "callback", callback: body, origin });
  } catch {
    // The player still deserves a result page; the webhook and the status
    // poller will settle it if this failed.
  }

  return NextResponse.redirect(`${origin}/payment/${encodeURIComponent(txnid)}`, 303);
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const body: Record<string, string> = {};
  form.forEach((v, k) => { body[k] = typeof v === "string" ? v : ""; });
  return handle(body, req);
}

export async function GET(req: NextRequest) {
  const body: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => { body[k] = v; });
  return handle(body, req);
}
