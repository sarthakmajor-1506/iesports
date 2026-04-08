import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/admin/set-cafe-admin
 *
 * Super admin only. Assigns or removes cafe_admin role on a user.
 *
 * Body: { adminKey, uid, action: "grant" | "revoke" }
 */
export async function POST(req: NextRequest) {
  try {
    const { adminKey, uid, action } = await req.json();

    if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized — super admin only" }, { status: 401 });
    }
    if (!uid || !action) {
      return NextResponse.json({ error: "Missing uid or action" }, { status: 400 });
    }

    const userRef = adminDb.collection("users").doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (action === "grant") {
      await userRef.update({ role: "cafe_admin" });
    } else if (action === "revoke") {
      await userRef.update({ role: null });
    } else {
      return NextResponse.json({ error: "action must be 'grant' or 'revoke'" }, { status: 400 });
    }

    const name = userDoc.data()?.riotGameName || userDoc.data()?.discordUsername || uid;
    return NextResponse.json({ success: true, uid, name, action });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
