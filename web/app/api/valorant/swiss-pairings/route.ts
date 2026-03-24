import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, adminKey, matchDay } = await req.json();

    if (!tournamentId || !adminKey || !matchDay) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (adminKey !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tournamentRef = adminDb.collection("valorantTournaments").doc(tournamentId);
    const tDoc = await tournamentRef.get();
    if (!tDoc.exists) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // ── Fetch teams ─────────────────────────────────────────────────────────
    const teamsSnap = await tournamentRef.collection("teams").orderBy("teamIndex").get();
    if (teamsSnap.empty) {
      return NextResponse.json({ error: "No teams found. Run shuffle first." }, { status: 400 });
    }

    const teams = teamsSnap.docs.map((d) => ({
      id: d.id,
      teamName: d.data().teamName,
      teamIndex: d.data().teamIndex,
    }));

    // ── Check existing matches for this day ──────────────────────────────────
    const existingMatches = await tournamentRef
      .collection("matches")
      .where("matchDay", "==", matchDay)
      .get();

    if (!existingMatches.empty) {
      return NextResponse.json({
        error: `Pairings for day ${matchDay} already exist. Delete them first or use a different day.`,
      }, { status: 400 });
    }

    let pairings: { team1: typeof teams[0]; team2: typeof teams[0] }[] = [];

    if (matchDay === 1) {
      // ── Day 1: Random/seeded pairings ─────────────────────────────────────
      // Shuffle teams randomly, then pair adjacent
      const shuffled = [...teams].sort(() => Math.random() - 0.5);

      for (let i = 0; i < shuffled.length - 1; i += 2) {
        pairings.push({ team1: shuffled[i], team2: shuffled[i + 1] });
      }
      // If odd number of teams, last team gets a bye (auto-win 2-0)
    } else {
      // ── Day 2+: Swiss pairing by points ───────────────────────────────────
      // Fetch standings
      const standingsSnap = await tournamentRef.collection("standings").get();
      const standings: Record<string, number> = {};

      for (const doc of standingsSnap.docs) {
        standings[doc.id] = doc.data().points || 0;
      }

      // Sort teams by points (descending), then by teamIndex as tiebreaker
      const sorted = [...teams].sort((a, b) => {
        const ptsA = standings[a.id] || 0;
        const ptsB = standings[b.id] || 0;
        if (ptsB !== ptsA) return ptsB - ptsA;
        return a.teamIndex - b.teamIndex;
      });

      // Pair adjacent teams (1v2, 3v4, etc.)
      // Track which matchups already happened to avoid repeats
      const pastMatches = await tournamentRef.collection("matches").get();
      const pastPairings = new Set<string>();
      for (const doc of pastMatches.docs) {
        const d = doc.data();
        pastPairings.add(`${d.team1Id}-${d.team2Id}`);
        pastPairings.add(`${d.team2Id}-${d.team1Id}`);
      }

      const used = new Set<string>();
      for (let i = 0; i < sorted.length; i++) {
        if (used.has(sorted[i].id)) continue;

        for (let j = i + 1; j < sorted.length; j++) {
          if (used.has(sorted[j].id)) continue;

          const key = `${sorted[i].id}-${sorted[j].id}`;
          // Prefer opponents they haven't faced
          if (!pastPairings.has(key)) {
            pairings.push({ team1: sorted[i], team2: sorted[j] });
            used.add(sorted[i].id);
            used.add(sorted[j].id);
            break;
          }
        }

        // If no unused opponent found, pair with closest available
        if (!used.has(sorted[i].id)) {
          for (let j = i + 1; j < sorted.length; j++) {
            if (!used.has(sorted[j].id)) {
              pairings.push({ team1: sorted[i], team2: sorted[j] });
              used.add(sorted[i].id);
              used.add(sorted[j].id);
              break;
            }
          }
        }
      }
    }

    // ── Write matches to Firestore ──────────────────────────────────────────
    const batch = adminDb.batch();
    const matchesRef = tournamentRef.collection("matches");
    const createdMatches: any[] = [];

    for (let i = 0; i < pairings.length; i++) {
      const p = pairings[i];
      const matchId = `day${matchDay}-match${i + 1}`;
      const matchRef = matchesRef.doc(matchId);

      const matchData = {
        tournamentId,
        matchDay,
        matchIndex: i + 1,
        team1Id: p.team1.id,
        team2Id: p.team2.id,
        team1Name: p.team1.teamName,
        team2Name: p.team2.teamName,
        team1Score: 0,
        team2Score: 0,
        status: "pending" as const,
        createdAt: new Date().toISOString(),
      };

      batch.set(matchRef, matchData);
      createdMatches.push({ id: matchId, ...matchData });
    }

    // Update current match day on tournament
    batch.update(tournamentRef, { currentMatchDay: matchDay });

    await batch.commit();

    return NextResponse.json({
      success: true,
      matchDay,
      pairings: createdMatches,
    });
  } catch (e: any) {
    console.error("Swiss pairings error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
