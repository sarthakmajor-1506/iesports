import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  const game = req.nextUrl.searchParams.get("game");

  if (!game || !["dota2", "valorant"].includes(game)) {
    return NextResponse.json({ error: "Invalid game parameter" }, { status: 400 });
  }

  try {
    const collectionName = game === "valorant" ? "valorantTournaments" : "tournaments";
    const snap = await adminDb.collection(collectionName).where("game", "==", game).get();
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (game === "valorant") {
      const now = new Date();
      const visible = all.filter((t: any) => !t.isTestTournament);
      const isEnded = (t: any) => t.status === "ended" || (t.endDate && now > new Date(t.endDate));
      const ended = visible
        .filter((t: any) => isEnded(t))
        .sort((a: any, b: any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
        .slice(0, 1);
      const upcoming = visible
        .filter((t: any) => !isEnded(t))
        .sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
        .slice(0, 3);
      return NextResponse.json({ tournaments: [...ended, ...upcoming] });
    }

    // dota2
    const ended = all
      .filter((t: any) => t.status === "ended")
      .sort((a: any, b: any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
      .slice(0, 1);
    const upcoming = all
      .filter((t: any) => t.status === "upcoming" || t.status === "ongoing")
      .sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(0, 3);
    return NextResponse.json({ tournaments: [...ended, ...upcoming] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
