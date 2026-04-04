import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.split("Bearer ")[1];
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const { tournamentId, game } = await req.json();
    if (!tournamentId || !game) {
      return NextResponse.json({ error: "Missing tournamentId or game" }, { status: 400 });
    }

    const collectionName = game === "valorant" ? "valorantTournaments" : "tournaments";
    const ref = adminDb.collection(collectionName).doc(tournamentId).collection("waitlist").doc(uid);
    const snap = await ref.get();

    if (snap.exists) {
      await ref.delete();
      return NextResponse.json({ onWaitlist: false });
    } else {
      const userDoc = await adminDb.collection("users").doc(uid).get();
      const userData = userDoc.data() || {};
      await ref.set({
        uid,
        displayName: decoded.name || userData.steamName || userData.riotGameName || "",
        phone: userData.phone || "",
        addedAt: new Date().toISOString(),
      });
      return NextResponse.json({ onWaitlist: true });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.split("Bearer ")[1];
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const tournamentId = req.nextUrl.searchParams.get("tournamentId");
    const game = req.nextUrl.searchParams.get("game");
    if (!tournamentId || !game) {
      return NextResponse.json({ error: "Missing tournamentId or game" }, { status: 400 });
    }

    const collectionName = game === "valorant" ? "valorantTournaments" : "tournaments";
    const snap = await adminDb.collection(collectionName).doc(tournamentId).collection("waitlist").doc(uid).get();
    return NextResponse.json({ onWaitlist: snap.exists });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
