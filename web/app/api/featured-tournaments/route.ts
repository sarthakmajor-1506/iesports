import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET() {
  try {
    // ── Dota 2: fetch from "tournaments" collection ──
    const dotaSnap = await adminDb.collection("tournaments").get();
    const dotaAll = dotaSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const dotaFeatured = dotaAll
      .filter((t: any) => t.status === "upcoming" || t.status === "active" || t.status === "ongoing")
      .sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    // ── Valorant: fetch from "valorantTournaments" collection ──
    const now = new Date();
    const valSnap = await adminDb.collection("valorantTournaments").get();
    const valAll = valSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const valIsEnded = (t: any) => t.status === "ended" || (t.endDate && now > new Date(t.endDate));
    const valFeatured = valAll
      .filter((t: any) => !t.isTestTournament && !valIsEnded(t))
      .sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    // If no active/upcoming Valorant tournament, show the most recent ended one
    let valResult = valFeatured.length > 0 ? valFeatured[0] : null;
    if (!valResult) {
      const valEnded = valAll
        .filter((t: any) => !t.isTestTournament && valIsEnded(t))
        .sort((a: any, b: any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
      if (valEnded.length > 0) valResult = valEnded[0];
    }

    // ── Completed tournaments for "Recent Results" section ──
    const dotaIsEnded = (t: any) => t.status === "ended" || t.status === "completed" || (t.endDate && now > new Date(t.endDate));
    const dotaCompleted = dotaAll
      .filter((t: any) => dotaIsEnded(t))
      .sort((a: any, b: any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    const valCompleted = valAll
      .filter((t: any) => !t.isTestTournament && valIsEnded(t))
      .sort((a: any, b: any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

    // ── Detect champion from grand final if not set on tournament doc ──
    const detectChampion = async (tournament: any, game: "valorant" | "dota") => {
      if (tournament.championTeamId && tournament.championTeamName) return tournament;
      try {
        const col = game === "valorant" ? "valorantTournaments" : "tournaments";
        const matchesSnap = await adminDb.collection(col).doc(tournament.id).collection("matches")
          .where("isBracket", "==", true).where("bracketType", "==", "grand_final").where("status", "==", "completed").get();
        if (!matchesSnap.empty) {
          const gf = matchesSnap.docs[0].data();
          const winnerId = gf.team1Score > gf.team2Score ? gf.team1Id : gf.team2Id;
          const winnerName = gf.team1Score > gf.team2Score ? gf.team1Name : gf.team2Name;
          return { ...tournament, championTeamId: winnerId, championTeamName: winnerName };
        }
      } catch { /* skip */ }
      return tournament;
    };

    // ── Fetch champion team members for completed tournaments ──
    const enrichWithChampionMembers = async (tournament: any, game: "valorant" | "dota") => {
      // First detect champion if not already set
      tournament = await detectChampion(tournament, game);
      if (!tournament?.championTeamId) return tournament;
      try {
        const col = game === "valorant" ? "valorantTournaments" : "tournaments";
        // Teams are stored as subcollection under the tournament doc
        const teamDoc = await adminDb.collection(col).doc(tournament.id).collection("teams").doc(tournament.championTeamId).get();
        if (teamDoc.exists) {
          const teamData = teamDoc.data();
          const members = teamData?.members || [];
          const memberNames: { name: string; tag?: string; avatar?: string; uid?: string }[] = [];
          for (const m of members.slice(0, 5)) {
            if (typeof m === "object" && m !== null) {
              memberNames.push({
                name: m.riotGameName || m.steamName || m.displayName || "Unknown",
                tag: m.riotTagLine || undefined,
                avatar: m.riotAvatar || m.steamAvatar || undefined,
                uid: m.uid || undefined,
              });
            } else if (typeof m === "string") {
              const userDoc = await adminDb.collection("users").doc(m).get();
              if (userDoc.exists) {
                const u = userDoc.data();
                memberNames.push({
                  name: u?.riotGameName || u?.steamName || u?.displayName || "Unknown",
                  tag: u?.riotTagLine || undefined,
                  avatar: u?.riotAvatar || u?.steamAvatar || undefined,
                  uid: m,
                });
              }
            }
          }
          return { ...tournament, championMembers: memberNames };
        }
      } catch { /* skip enrichment on error */ }
      return tournament;
    };

    const completedVal = valCompleted.length > 0 ? await enrichWithChampionMembers(valCompleted[0], "valorant") : null;
    const completedDota2 = dotaCompleted.length > 0 ? await enrichWithChampionMembers(dotaCompleted[0], "dota") : null;

    return NextResponse.json({
      dota: dotaFeatured.length > 0 ? dotaFeatured[0] : null,
      valorant: valResult,
      completedValorant: completedVal,
      completedDota: completedDota2,
    });
  } catch (e: any) {
    console.error("[API] Featured tournaments error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}