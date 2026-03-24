import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, adminKey, matchId, action, lobbyName, lobbyPassword } = await req.json();

    if (!tournamentId || !adminKey || !matchId || !action) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (adminKey !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const matchRef = adminDb
      .collection("valorantTournaments")
      .doc(tournamentId)
      .collection("matches")
      .doc(matchId);

    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    if (action === "set-lobby") {
      // Admin sets lobby info — will be visible to players on the detail page
      await matchRef.update({
        lobbyName: lobbyName || "",
        lobbyPassword: lobbyPassword || "",
        lobbySetAt: new Date().toISOString(),
      });
      return NextResponse.json({ success: true, message: "Lobby info updated" });
    }

    if (action === "start") {
      await matchRef.update({
        status: "live",
        startedAt: new Date().toISOString(),
      });
      return NextResponse.json({ success: true, message: "Match started" });
    }

    if (action === "complete") {
      // This is handled by match-result API, but allow direct status change too
      await matchRef.update({
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      return NextResponse.json({ success: true, message: "Match marked complete" });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e: any) {
    console.error("Match update error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
