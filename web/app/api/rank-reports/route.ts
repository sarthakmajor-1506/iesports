import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

const GAME_COLLECTIONS: Record<string, string> = {
  valorant: "valorantTournaments",
  dota2: "tournaments",
  cs2: "cs2Tournaments",
};

// GET: fetch all rank reports for a tournament
export async function GET(req: NextRequest) {
  const tournamentId = req.nextUrl.searchParams.get("tournamentId");
  const game = req.nextUrl.searchParams.get("game");
  if (!tournamentId || !game || !GAME_COLLECTIONS[game]) {
    return NextResponse.json({ error: "Missing tournamentId or invalid game" }, { status: 400 });
  }
  try {
    const col = GAME_COLLECTIONS[game];
    const snap = await adminDb.collection(col).doc(tournamentId).collection("rankReports").orderBy("createdAt", "desc").get();
    const reports = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ reports });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST: submit a rank report
export async function POST(req: NextRequest) {
  try {
    const { tournamentId, game, targetUid, targetName, reporterUid, reporterName, type, comment } = await req.json();
    if (!tournamentId || !game || !targetUid || !reporterUid || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!["rank_too_high", "rank_too_low"].includes(type)) {
      return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
    }
    const col = GAME_COLLECTIONS[game];
    if (!col) return NextResponse.json({ error: "Invalid game" }, { status: 400 });

    // Prevent self-reporting
    if (targetUid === reporterUid) {
      return NextResponse.json({ error: "Cannot report your own rank" }, { status: 400 });
    }

    // Check if already reported this player
    const existing = await adminDb.collection(col).doc(tournamentId).collection("rankReports")
      .where("targetUid", "==", targetUid)
      .where("reporterUid", "==", reporterUid)
      .get();
    if (!existing.empty) {
      return NextResponse.json({ error: "You have already reported this player's rank" }, { status: 400 });
    }

    await adminDb.collection(col).doc(tournamentId).collection("rankReports").add({
      targetUid,
      targetName: targetName || "",
      reporterUid,
      reporterName: reporterName || "",
      type,
      comment: (comment || "").slice(0, 200),
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE: remove own report
export async function DELETE(req: NextRequest) {
  try {
    const { tournamentId, game, reportId, uid } = await req.json();
    if (!tournamentId || !game || !reportId || !uid) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const col = GAME_COLLECTIONS[game];
    if (!col) return NextResponse.json({ error: "Invalid game" }, { status: 400 });

    const reportRef = adminDb.collection(col).doc(tournamentId).collection("rankReports").doc(reportId);
    const reportDoc = await reportRef.get();
    if (!reportDoc.exists) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    if (reportDoc.data()?.reporterUid !== uid) {
      return NextResponse.json({ error: "You can only delete your own reports" }, { status: 403 });
    }

    await reportRef.delete();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
