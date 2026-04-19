import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";

/**
 * GET /api/valorant/wall-of-shame?tournamentId=X
 *
 * Returns every Wall of Shame entry for a tournament, plus the current user's
 * vote on each entry if a Bearer token is supplied. Unauthenticated reads are
 * allowed (entries are public); only the per-user vote map is gated.
 */
export async function GET(req: NextRequest) {
  try {
    const tournamentId = req.nextUrl.searchParams.get("tournamentId");
    if (!tournamentId) {
      return NextResponse.json({ error: "tournamentId required" }, { status: 400 });
    }

    const shameCol = adminDb
      .collection("valorantTournaments")
      .doc(tournamentId)
      .collection("wallOfShame");
    const snap = await shameCol.get();
    const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Resolve caller uid (optional).
    let callerUid: string | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const decoded = await adminAuth.verifyIdToken(authHeader.split("Bearer ")[1]);
        callerUid = decoded.uid;
      } catch {
        callerUid = null;
      }
    }

    // Pull this user's vote on each entry in parallel.
    const myVotes: Record<string, "tomato" | "bail"> = {};
    if (callerUid) {
      await Promise.all(
        entries.map(async (e: any) => {
          const v = await shameCol.doc(e.id).collection("votes").doc(callerUid!).get();
          if (v.exists) {
            const kind = v.data()?.kind;
            if (kind === "tomato" || kind === "bail") myVotes[e.id] = kind;
          }
        })
      );
    }

    return NextResponse.json({ entries, myVotes });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
