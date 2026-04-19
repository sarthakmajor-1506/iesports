import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * POST /api/valorant/wall-of-shame/vote
 *
 * Body: { tournamentId, entryId, kind: "tomato" | "bail" }
 * Header: Authorization: Bearer <firebase-id-token>
 *
 * One vote per uid per entry. Once cast, the user's vote is locked in and a
 * repeat call (same entry, same or different kind) is rejected — the counter
 * only moves the first time.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.split("Bearer ")[1]);
    const uid = decoded.uid;

    const { tournamentId, entryId, kind } = await req.json();
    if (!tournamentId || !entryId || !kind) {
      return NextResponse.json({ error: "tournamentId, entryId, kind required" }, { status: 400 });
    }
    if (kind !== "tomato" && kind !== "bail") {
      return NextResponse.json({ error: "kind must be 'tomato' or 'bail'" }, { status: 400 });
    }

    const entryRef = adminDb
      .collection("valorantTournaments")
      .doc(tournamentId)
      .collection("wallOfShame")
      .doc(entryId);
    const voteRef = entryRef.collection("votes").doc(uid);

    await adminDb.runTransaction(async tx => {
      const entrySnap = await tx.get(entryRef);
      if (!entrySnap.exists) throw new Error("Entry not found");
      const existingVote = await tx.get(voteRef);
      if (existingVote.exists) {
        throw new Error("Already voted on this entry");
      }
      const field = kind === "tomato" ? "tomatoCount" : "bailCount";
      tx.update(entryRef, { [field]: FieldValue.increment(1) });
      tx.set(voteRef, { kind, votedAt: new Date().toISOString() });
    });

    // Re-read just this entry's counts for the client to reconcile.
    const fresh = await entryRef.get();
    const data = fresh.data() || {};
    return NextResponse.json({
      success: true,
      entryId,
      kind,
      tomatoCount: data.tomatoCount || 0,
      bailCount: data.bailCount || 0,
    });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    if (msg === "Already voted on this entry") {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    if (msg === "Entry not found") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
