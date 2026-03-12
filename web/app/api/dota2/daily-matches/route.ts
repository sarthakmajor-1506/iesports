// /app/api/dota2/daily-matches/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date"); // optional: "2026-03-10"

    let query = adminDb
      .collection("botLobbies")
      .where("status", "==", "completed")
      .orderBy("completedAt", "desc")
      .limit(50);

    const snap = await query.get();

    const matches = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((m: any) => {
        if (!date) return true;
        return m.completedAt?.startsWith(date);
      });

    return NextResponse.json({ matches });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}