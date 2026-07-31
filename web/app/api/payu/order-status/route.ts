import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";

async function requireUid(req: NextRequest): Promise<string> {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("UNAUTHORIZED");
  const decoded = await adminAuth.verifyIdToken(match[1]);
  return decoded.uid;
}

export async function GET(req: NextRequest) {
  let uid: string;
  try {
    uid = await requireUid(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const txnid = req.nextUrl.searchParams.get("txnid");
  if (!txnid) return NextResponse.json({ error: "Missing txnid" }, { status: 400 });

  const orderDoc = await adminDb.collection("payuOrders").doc(txnid).get();
  if (!orderDoc.exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const order = orderDoc.data()!;

  if (order.uid !== uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    status: order.status,
    registrationCompleted: order.registrationCompleted,
    tournamentId: order.tournamentId,
    game: order.game,
    amount: order.amount,
  });
}
