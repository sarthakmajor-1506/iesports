import { NextRequest, NextResponse } from "next/server";

/**
 * PayU POSTs the browser back here (surl on success, furl on failure) with
 * the transaction fields as form data. A Next.js page.tsx can't receive a
 * POST, so this route just extracts the txnid and redirects (GET) to the
 * actual return page. This redirect is purely cosmetic/UX — it is NOT the
 * authoritative payment confirmation (the webhook is, see
 * app/api/payu/webhook/route.ts) and this route does not touch Firestore.
 */
export async function POST(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") === "success" ? "success" : "failure";
  let txnid = "";
  try {
    const form = await req.formData();
    txnid = form.get("txnid")?.toString() || "";
  } catch { /* fall through with empty txnid */ }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const dest = new URL("/payu/return", appUrl);
  dest.searchParams.set("type", type);
  if (txnid) dest.searchParams.set("txnid", txnid);
  return NextResponse.redirect(dest, { status: 303 });
}
