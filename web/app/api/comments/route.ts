import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

const getCollection = (game?: string | null) =>
  game === "dota2" ? "tournaments" : "valorantTournaments";

export async function GET(req: NextRequest) {
  try {
    const tournamentId = req.nextUrl.searchParams.get("tournamentId");
    const section = req.nextUrl.searchParams.get("section");
    const game = req.nextUrl.searchParams.get("game");
    if (!tournamentId || !section) {
      return NextResponse.json({ error: "Missing params" }, { status: 400 });
    }

    const snap = await adminDb
      .collection(getCollection(game)).doc(tournamentId)
      .collection("comments")
      .where("section", "==", section)
      .get();

    const comments = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        uid: data.uid,
        displayName: data.displayName,
        avatar: data.avatar || null,
        text: data.text,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      };
    });

    comments.sort((a, b) => {
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return NextResponse.json({ comments });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const { tournamentId, section, game, text, displayName, avatar } = await req.json();
    if (!tournamentId || !section || !text?.trim()) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (text.trim().length > 300) {
      return NextResponse.json({ error: "Comment too long" }, { status: 400 });
    }

    const docRef = await adminDb.collection(getCollection(game)).doc(tournamentId).collection("comments").add({
      uid,
      displayName: displayName || "Player",
      avatar: avatar || null,
      text: text.trim(),
      section,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: docRef.id });
  } catch (e: any) {
    if (e.code === "auth/id-token-expired" || e.code === "auth/argument-error") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    const { tournamentId, commentId, game } = await req.json();
    if (!tournamentId || !commentId) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const commentRef = adminDb.collection(getCollection(game)).doc(tournamentId).collection("comments").doc(commentId);
    const snap = await commentRef.get();
    if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (snap.data()?.uid !== uid) return NextResponse.json({ error: "Not your comment" }, { status: 403 });

    await commentRef.delete();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.code === "auth/id-token-expired" || e.code === "auth/argument-error") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
