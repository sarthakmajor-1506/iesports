import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";
import { fetchAndSyncPlayer } from "@/lib/fetchAndSyncPlayer";

/**
 * POST /api/dota/sync
 *
 * Client-triggered Dota rank + match sync. Fired from the steam-success page
 * (and anywhere else the client wants to force a refresh) so we don't block
 * the Steam OpenID callback on OpenDota's slow free-tier API.
 *
 * Auth: Bearer <Firebase ID token>
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.split("Bearer ")[1];
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const userDoc = await adminDb.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData?.steamId) {
      return NextResponse.json({ error: "Steam account not linked" }, { status: 400 });
    }

    const result = await fetchAndSyncPlayer({
      uid,
      steamId: userData.steamId,
      db: adminDb,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("/api/dota/sync failed:", e?.message);
    return NextResponse.json({ error: e?.message || "Sync failed" }, { status: 500 });
  }
}
