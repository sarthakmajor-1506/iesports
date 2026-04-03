import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/admin/verify-riot
 *
 * Updates a user's riotVerified status.
 * Body: { adminKey, uid, action: "verify" | "reject" }
 */
export async function POST(req: NextRequest) {
  try {
    const { adminKey, uid, action } = await req.json();

    if (!adminKey) {
      return NextResponse.json({ error: "Missing admin key" }, { status: 400 });
    }
    if (adminKey !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!uid || !action) {
      return NextResponse.json({ error: "uid and action required" }, { status: 400 });
    }
    if (action !== "verify" && action !== "reject") {
      return NextResponse.json({ error: "action must be 'verify' or 'reject'" }, { status: 400 });
    }

    const userRef = adminDb.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (action === "verify") {
      await userRef.update({ riotVerified: "verified" });
    } else {
      // Reject — clear riot fields so user can re-submit
      await userRef.update({
        riotVerified: "rejected",
        riotScreenshotUrl: null,
      });
    }

    return NextResponse.json({ success: true, uid, action });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
