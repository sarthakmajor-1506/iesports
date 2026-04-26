import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  const game = req.nextUrl.searchParams.get("game");

  if (!game || !["dota2", "valorant", "cs2"].includes(game)) {
    return NextResponse.json({ error: "Invalid game parameter" }, { status: 400 });
  }

  try {
    const collectionName = game === "valorant" ? "valorantTournaments" : game === "cs2" ? "cs2Tournaments" : "tournaments";
    const snap = await adminDb.collection(collectionName).where("game", "==", game).get();
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (game === "valorant") {
      const now = new Date();
      const visible = all.filter((t: any) => !t.isTestTournament);
      const isEnded = (t: any) => t.status === "ended" || (t.endDate && now > new Date(t.endDate));
      const ended = visible
        .filter((t: any) => isEnded(t))
        .sort((a: any, b: any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
        .slice(0, 20);
      const upcoming = visible
        .filter((t: any) => !isEnded(t))
        .sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
        .slice(0, 3);

      // Detect champion from grand final + enrich with team members
      const enriched = await Promise.all(ended.map(async (t: any) => {
        // Detect champion from grand final if not set
        if (!t.championTeamId || !t.championTeamName) {
          try {
            const gfSnap = await adminDb.collection("valorantTournaments").doc(t.id).collection("matches")
              .where("isBracket", "==", true).where("bracketType", "==", "grand_final").where("status", "==", "completed").get();
            if (!gfSnap.empty) {
              const gf = gfSnap.docs[0].data();
              t = { ...t, championTeamId: gf.team1Score > gf.team2Score ? gf.team1Id : gf.team2Id, championTeamName: gf.team1Score > gf.team2Score ? gf.team1Name : gf.team2Name };
            }
          } catch { /* skip */ }
        }
        if (!t.championTeamId) return t;
        try {
          const teamDoc = await adminDb.collection("valorantTournaments").doc(t.id).collection("teams").doc(t.championTeamId).get();
          if (!teamDoc.exists) return t;
          const members = teamDoc.data()?.members || [];
          const championMembers: { name: string; tag?: string; avatar?: string; uid?: string }[] = [];
          for (const m of members.slice(0, 5)) {
            if (typeof m === "object" && m !== null) {
              championMembers.push({ name: m.riotGameName || m.steamName || m.displayName || "Unknown", tag: m.riotTagLine || undefined, avatar: m.riotAvatar || undefined, uid: m.uid || undefined });
            } else if (typeof m === "string") {
              const uDoc = await adminDb.collection("users").doc(m).get();
              if (uDoc.exists) { const u = uDoc.data(); championMembers.push({ name: u?.riotGameName || u?.displayName || "Unknown", tag: u?.riotTagLine || undefined, avatar: u?.riotAvatar || undefined, uid: m }); }
            }
          }
          return { ...t, championMembers };
        } catch { return t; }
      }));

      return NextResponse.json({ tournaments: [...enriched, ...upcoming] });
    }

    if (game === "cs2") {
      const now = new Date();
      const visible = all.filter((t: any) => !t.isTestTournament);
      const isEnded = (t: any) => t.status === "ended" || (t.endDate && now > new Date(t.endDate));
      const ended = visible.filter((t: any) => isEnded(t)).sort((a: any, b: any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()).slice(0, 20);
      const upcoming = visible.filter((t: any) => !isEnded(t)).sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()).slice(0, 3);
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
