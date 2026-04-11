import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

const GAME_COLLECTIONS: Record<string, string> = {
  valorant: "valorantTournaments",
  dota2: "tournaments",
  cs2: "cs2Tournaments",
};

export async function GET(req: NextRequest) {
  const tournamentId = req.nextUrl.searchParams.get("tournamentId");
  const game = req.nextUrl.searchParams.get("game");
  if (!tournamentId || !game || !GAME_COLLECTIONS[game]) {
    return NextResponse.json({ error: "Missing tournamentId or invalid game" }, { status: 400 });
  }
  try {
    const col = GAME_COLLECTIONS[game];
    const snap = await adminDb.collection(col).doc(tournamentId).collection("waitlist").orderBy("addedAt", "asc").get();
    const waitlist = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    return NextResponse.json({ waitlist, count: waitlist.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
