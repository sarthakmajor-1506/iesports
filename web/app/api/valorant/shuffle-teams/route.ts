import { isNotAdmin } from "@/lib/checkAdmin";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/valorant/shuffle-teams
 *
 * Now supports `deleteExisting: true` which deletes all existing teams
 * and related matches/standings before reshuffling.
 */
export async function POST(req: NextRequest) {
  try {
    const { tournamentId, adminKey, teamCount, teamNames, deleteExisting } = await req.json();

    // ── Auth ────────────────────────────────────────────────────────────────
    if (!tournamentId || !adminKey) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (await isNotAdmin(adminKey)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Fetch tournament ────────────────────────────────────────────────────
    const tournamentRef = adminDb.collection("valorantTournaments").doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    const tData = tournamentDoc.data();
    if (!tData) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // ── Delete existing teams, matches, standings if requested ───────────────
    if (deleteExisting) {
      const subcollections = ["teams", "matches", "standings", "leaderboard"];
      for (const sub of subcollections) {
        const snap = await tournamentRef.collection(sub).get();
        if (!snap.empty) {
          // Firestore batch limit is 500, chunk if needed
          const chunks: FirebaseFirestore.DocumentReference[][] = [];
          let current: FirebaseFirestore.DocumentReference[] = [];
          snap.docs.forEach(doc => {
            current.push(doc.ref);
            if (current.length >= 450) {
              chunks.push(current);
              current = [];
            }
          });
          if (current.length > 0) chunks.push(current);

          for (const chunk of chunks) {
            const batch = adminDb.batch();
            chunk.forEach(ref => batch.delete(ref));
            await batch.commit();
          }
        }
      }

      // Reset tournament flags
      await tournamentRef.update({
        teamsGenerated: false,
        teamCount: 0,
        fixturesGenerated: false,
        currentMatchDay: 0,
      });
    }

    // ── Fetch all registered solo players ───────────────────────────────────
    const playersSnap = await tournamentRef.collection("soloPlayers").get();
    // Fetch solo players + their riotPuuid from user docs
    const rawPlayers = playersSnap.docs.map((d) => {
      const data = d.data();
      return {
        uid: data.uid,
        riotGameName: data.riotGameName || "",
        riotTagLine: data.riotTagLine || "",
        riotAvatar: data.riotAvatar || "",
        riotRank: data.riotRank || "",
        riotTier: data.riotTier || 0,
        iesportsRating: data.iesportsRating || 0,
        skillLevel: data.skillLevel || 1,
        riotPuuid: "", // will be filled from user doc
      };
    });

    // Batch-fetch user docs to get riotPuuid + current rank data
    const userRefs = rawPlayers.map(p => adminDb.collection("users").doc(p.uid));
    const userDocs = await adminDb.getAll(...userRefs);
    const players = rawPlayers.map((p, i) => {
      const ud = userDocs[i].data();
      if (!ud) return { ...p };
      return {
        ...p,
        riotPuuid: ud.riotPuuid || "",
        iesportsRating: ud.iesportsRating || p.iesportsRating || 0,
        riotRank: ud.iesportsRank || ud.riotRank || p.riotRank || "",
        riotTier: ud.iesportsTier || ud.riotTier || p.riotTier || 0,
      };
    });


    if (players.length === 0) {
      return NextResponse.json({ error: "No players registered" }, { status: 400 });
    }

    const numTeams = teamCount || Math.max(2, Math.floor(players.length / 5));

    if (players.length < numTeams * 2) {
      return NextResponse.json({
        error: `Need at least ${numTeams * 2} players for ${numTeams} teams. Currently have ${players.length}.`,
      }, { status: 400 });
    }

    // ── Rating function — always use exact iesportsRating, riotTier*100 only as last resort ──
    const rating = (p: typeof players[0]) => {
      if (p.iesportsRating && p.iesportsRating > 0) return p.iesportsRating;
      return p.riotTier * 100 || 0;
    };

    // ── Step 1: Sort players by rating (highest first) ──
    const sorted = [...players].sort((a, b) => rating(b) - rating(a));

    const teams: {
      teamIndex: number;
      teamName: string;
      members: typeof players;
      totalSkill: number;
    }[] = Array.from({ length: numTeams }, (_, i) => ({
      teamIndex: i + 1,
      teamName: (teamNames?.[i] || `Team ${i + 1}`).toUpperCase(),
      members: [],
      totalSkill: 0,
    }));

    // ── Step 2: Greedy assignment — place each player on the weakest team ──
    // Collect ALL teams tied for the lowest (totalSkill, members) key, then pick one at random.
    // Previously the loop kept the first-found index, which let Team 1 grab the best player on every
    // tied round and pushed Team N to the bottom of the average-tier ranking.
    for (const player of sorted) {
      let bestTotal = teams[0].totalSkill;
      let bestMembers = teams[0].members.length;
      for (let t = 1; t < numTeams; t++) {
        if (teams[t].totalSkill < bestTotal ||
            (teams[t].totalSkill === bestTotal && teams[t].members.length < bestMembers)) {
          bestTotal = teams[t].totalSkill;
          bestMembers = teams[t].members.length;
        }
      }
      const candidates: number[] = [];
      for (let t = 0; t < numTeams; t++) {
        if (teams[t].totalSkill === bestTotal && teams[t].members.length === bestMembers) {
          candidates.push(t);
        }
      }
      const minIdx = candidates[Math.floor(Math.random() * candidates.length)];
      teams[minIdx].members.push(player);
      teams[minIdx].totalSkill += rating(player);
    }

    // ── Step 3: Swap optimization — reduce max-min spread ──
    const getSpread = () => {
      const avgs = teams.map(t => t.members.length > 0 ? t.totalSkill / t.members.length : 0);
      return Math.max(...avgs) - Math.min(...avgs);
    };

    for (let pass = 0; pass < 20; pass++) {
      let improved = false;
      for (let i = 0; i < numTeams; i++) {
        for (let j = i + 1; j < numTeams; j++) {
          for (let pi = 0; pi < teams[i].members.length; pi++) {
            for (let pj = 0; pj < teams[j].members.length; pj++) {
              const rI = rating(teams[i].members[pi]);
              const rJ = rating(teams[j].members[pj]);
              if (rI === rJ) continue;

              // Simulate swap
              const newTotalI = teams[i].totalSkill - rI + rJ;
              const newTotalJ = teams[j].totalSkill - rJ + rI;
              const newAvgI = newTotalI / teams[i].members.length;
              const newAvgJ = newTotalJ / teams[j].members.length;

              const oldAvgs = teams.map(t => t.members.length > 0 ? t.totalSkill / t.members.length : 0);
              const newAvgs = [...oldAvgs];
              newAvgs[i] = newAvgI;
              newAvgs[j] = newAvgJ;

              const oldSpread = Math.max(...oldAvgs) - Math.min(...oldAvgs);
              const newSpread = Math.max(...newAvgs) - Math.min(...newAvgs);

              if (newSpread < oldSpread - 0.1) {
                // Swap
                const tmp = teams[i].members[pi];
                teams[i].members[pi] = teams[j].members[pj];
                teams[j].members[pj] = tmp;
                teams[i].totalSkill = newTotalI;
                teams[j].totalSkill = newTotalJ;
                improved = true;
              }
            }
          }
        }
      }
      if (!improved) break;
    }

    // ── Write teams to Firestore ────────────────────────────────────────────
    const batch = adminDb.batch();
    const teamsCollection = tournamentRef.collection("teams");
    const teamSummaries: { id: string; teamName: string; memberCount: number; avgSkill: number }[] = [];

    for (const team of teams) {
      const avgSkill = team.members.length > 0
        ? Math.round((team.totalSkill / team.members.length) * 100) / 100
        : 0;

      const teamRef = teamsCollection.doc(`team-${team.teamIndex}`);
      batch.set(teamRef, {
        tournamentId,
        teamIndex: team.teamIndex,
        teamName: team.teamName,
        members: team.members,
        avgSkillLevel: avgSkill,
        totalSkillLevel: team.totalSkill,
        createdAt: new Date().toISOString(),
      });

      teamSummaries.push({
        id: `team-${team.teamIndex}`,
        teamName: team.teamName,
        memberCount: team.members.length,
        avgSkill,
      });
    }

    // Update tournament doc
    batch.update(tournamentRef, {
      teamsGenerated: true,
      teamCount: numTeams,
    });

    await batch.commit();

    // ── Balance stats ──
    const avgs = teamSummaries.map(t => t.avgSkill);
    const spread = Math.round((Math.max(...avgs) - Math.min(...avgs)) * 100) / 100;
    const mean = avgs.reduce((a, b) => a + b, 0) / avgs.length;
    const stdDev = Math.round(Math.sqrt(avgs.reduce((s, v) => s + (v - mean) ** 2, 0) / avgs.length) * 100) / 100;

    return NextResponse.json({
      success: true,
      totalPlayers: players.length,
      teamCount: numTeams,
      teams: teamSummaries,
      deletedExisting: !!deleteExisting,
      balance: { spread, stdDev, mean: Math.round(mean * 100) / 100 },
    });
  } catch (e: any) {
    console.error("Shuffle teams error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}