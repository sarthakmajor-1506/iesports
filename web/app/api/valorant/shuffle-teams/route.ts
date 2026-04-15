import { isNotAdmin } from "@/lib/checkAdmin";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/valorant/shuffle-teams
 *
 * Supports:
 * - `deleteExisting: true` → deletes all existing teams/matches/standings
 *    before reshuffling.
 * - `dryRun: true` → runs the balance algorithm and returns the full team
 *    layout WITHOUT touching Firestore. Used by the admin preview flow:
 *    the admin reviews the draft in the panel, generates the video from it,
 *    and only commits once happy via /api/valorant/publish-teams.
 */
export async function POST(req: NextRequest) {
  try {
    const { tournamentId, adminKey, teamCount, teamNames, deleteExisting, dryRun } = await req.json();

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
    // Dry-run never mutates Firestore, even when deleteExisting is set.
    if (deleteExisting && !dryRun) {
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

    // ── High-tier cap — Immortal+ must spread across teams ──
    // Without this, the balance optimizer can happily cluster two Immortals
    // on the same team if it shaves a point off the overall spread. Hard
    // constraint: every team holds at most ⌈highCount/numTeams⌉ Immortals.
    const HIGH_TIER_MIN = 24; // Valorant Immortal 1 competitiveTier
    const isHighTier = (p: typeof players[0]) =>
      (p.riotTier || 0) >= HIGH_TIER_MIN;
    const highCount = players.filter(isHighTier).length;
    const highCap = highCount > 0 ? Math.ceil(highCount / numTeams) : 0;

    const teams: {
      teamIndex: number;
      teamName: string;
      members: typeof players;
      totalSkill: number;
      highCount: number;
    }[] = Array.from({ length: numTeams }, (_, i) => ({
      teamIndex: i + 1,
      teamName: (teamNames?.[i] || `Team ${i + 1}`).toUpperCase(),
      members: [],
      totalSkill: 0,
      highCount: 0,
    }));

    // ── Step 2: Greedy assignment — place each player on the weakest team.
    // Respects the high-tier cap: an Immortal+ player can only land on a
    // team that still has room for Immortals.
    for (const player of sorted) {
      const playerHigh = isHighTier(player);
      let bestTotal = Infinity;
      let bestMembers = Infinity;
      for (let t = 0; t < numTeams; t++) {
        if (playerHigh && highCap > 0 && teams[t].highCount >= highCap) continue;
        if (teams[t].totalSkill < bestTotal ||
            (teams[t].totalSkill === bestTotal && teams[t].members.length < bestMembers)) {
          bestTotal = teams[t].totalSkill;
          bestMembers = teams[t].members.length;
        }
      }
      const candidates: number[] = [];
      for (let t = 0; t < numTeams; t++) {
        if (playerHigh && highCap > 0 && teams[t].highCount >= highCap) continue;
        if (teams[t].totalSkill === bestTotal && teams[t].members.length === bestMembers) {
          candidates.push(t);
        }
      }
      // Fallback if the cap blocked every team (shouldn't happen with the
      // ceil() cap, but stay safe): pick the globally weakest team.
      if (candidates.length === 0) {
        let idx = 0;
        for (let t = 1; t < numTeams; t++) {
          if (teams[t].totalSkill < teams[idx].totalSkill) idx = t;
        }
        candidates.push(idx);
      }
      const minIdx = candidates[Math.floor(Math.random() * candidates.length)];
      teams[minIdx].members.push(player);
      teams[minIdx].totalSkill += rating(player);
      if (playerHigh) teams[minIdx].highCount++;
    }

    // ── Step 3: Balance refinement — run 1-for-1 and 2-for-2 swap passes
    // until no improvement, minimizing the max-min spread of team averages.
    // Previous version stopped at 0.1 rating-point improvements and only did
    // single-player swaps, which left noticeable gaps between the top and
    // bottom teams. 2-for-2 unlocks redistributions a 1-for-1 can't reach.
    const getAvg = (t: typeof teams[0]) =>
      t.members.length > 0 ? t.totalSkill / t.members.length : 0;
    const getSpread = () => {
      let min = Infinity;
      let max = -Infinity;
      for (const t of teams) {
        const a = getAvg(t);
        if (a < min) min = a;
        if (a > max) max = a;
      }
      return max - min;
    };
    // Variance as a secondary signal — even when max-min is stuck on an
    // unbreakable outlier, shrinking variance keeps all other teams tight.
    const getVariance = () => {
      const avgs = teams.map(getAvg);
      const mean = avgs.reduce((a, b) => a + b, 0) / avgs.length;
      return avgs.reduce((s, a) => s + (a - mean) ** 2, 0);
    };
    // Doubled from 1e-4 — reject micro-improvements so the optimizer doesn't
    // thrash on floating-point noise and makes only confidently better moves.
    const IMPROVE_EPS = 2e-4;

    const MAX_PASSES = 100;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      let improved = false;

      // 1-for-1 swap: move one player from team i to team j and vice-versa.
      for (let i = 0; i < numTeams; i++) {
        for (let j = i + 1; j < numTeams; j++) {
          for (let pi = 0; pi < teams[i].members.length; pi++) {
            for (let pj = 0; pj < teams[j].members.length; pj++) {
              const pA = teams[i].members[pi];
              const pB = teams[j].members[pj];
              const rI = rating(pA);
              const rJ = rating(pB);
              if (rI === rJ) continue;

              // Enforce the high-tier cap — never let a swap push a team over.
              const aHigh = isHighTier(pA) ? 1 : 0;
              const bHigh = isHighTier(pB) ? 1 : 0;
              if (highCap > 0) {
                const iNew = teams[i].highCount - aHigh + bHigh;
                const jNew = teams[j].highCount - bHigh + aHigh;
                if (iNew > highCap || jNew > highCap) continue;
              }

              const oldSpread = getSpread();
              const oldVar = getVariance();
              teams[i].totalSkill += (rJ - rI);
              teams[j].totalSkill += (rI - rJ);
              const newSpread = getSpread();
              const newVar = getVariance();

              const accept =
                newSpread < oldSpread - IMPROVE_EPS ||
                (newSpread <= oldSpread + IMPROVE_EPS && newVar < oldVar - IMPROVE_EPS);
              if (accept) {
                teams[i].members[pi] = pB;
                teams[j].members[pj] = pA;
                teams[i].highCount += (bHigh - aHigh);
                teams[j].highCount += (aHigh - bHigh);
                improved = true;
              } else {
                teams[i].totalSkill -= (rJ - rI);
                teams[j].totalSkill -= (rI - rJ);
              }
            }
          }
        }
      }

      // 2-for-2 swap: trade a pair of players for a pair from another team.
      // This can break deadlocks 1-for-1 can't — e.g. when no single player
      // swap improves spread but shifting two-at-a-time does.
      for (let i = 0; i < numTeams; i++) {
        for (let j = i + 1; j < numTeams; j++) {
          const mi = teams[i].members;
          const mj = teams[j].members;
          if (mi.length < 2 || mj.length < 2) continue;
          for (let a1 = 0; a1 < mi.length; a1++) {
            for (let a2 = a1 + 1; a2 < mi.length; a2++) {
              const rIpair = rating(mi[a1]) + rating(mi[a2]);
              const iOut = (isHighTier(mi[a1]) ? 1 : 0) + (isHighTier(mi[a2]) ? 1 : 0);
              for (let b1 = 0; b1 < mj.length; b1++) {
                for (let b2 = b1 + 1; b2 < mj.length; b2++) {
                  const rJpair = rating(mj[b1]) + rating(mj[b2]);
                  if (rIpair === rJpair) continue;

                  // Cap enforcement for the two-player trade.
                  const jOut = (isHighTier(mj[b1]) ? 1 : 0) + (isHighTier(mj[b2]) ? 1 : 0);
                  if (highCap > 0) {
                    const iNew = teams[i].highCount - iOut + jOut;
                    const jNew = teams[j].highCount - jOut + iOut;
                    if (iNew > highCap || jNew > highCap) continue;
                  }

                  const oldSpread = getSpread();
                  const oldVar = getVariance();
                  teams[i].totalSkill += (rJpair - rIpair);
                  teams[j].totalSkill += (rIpair - rJpair);
                  const newSpread = getSpread();
                  const newVar = getVariance();

                  const accept =
                    newSpread < oldSpread - IMPROVE_EPS ||
                    (newSpread <= oldSpread + IMPROVE_EPS && newVar < oldVar - IMPROVE_EPS);
                  if (accept) {
                    const tA1 = mi[a1];
                    const tA2 = mi[a2];
                    mi[a1] = mj[b1];
                    mi[a2] = mj[b2];
                    mj[b1] = tA1;
                    mj[b2] = tA2;
                    teams[i].highCount += (jOut - iOut);
                    teams[j].highCount += (iOut - jOut);
                    improved = true;
                  } else {
                    teams[i].totalSkill -= (rJpair - rIpair);
                    teams[j].totalSkill -= (rIpair - rJpair);
                  }
                }
              }
            }
          }
        }
      }

      if (!improved) break;
    }

    // Sort each team's members by rank descending (highest rank first). Use
    // the same continuous `rating()` function the balance algorithm uses —
    // the integer Valorant tier alone can't separate two players at the same
    // tier with different iesportsRatings.
    for (const team of teams) {
      team.members.sort(
        (a: any, b: any) =>
          rating(b) - rating(a) ||
          String(a.riotGameName || "").localeCompare(String(b.riotGameName || ""))
      );
    }

    // ── Build full team objects (shared between dry-run and write paths) ────
    const fullTeams = teams.map((team) => {
      const avgSkill = team.members.length > 0
        ? Math.round((team.totalSkill / team.members.length) * 100) / 100
        : 0;
      return {
        id: `team-${team.teamIndex}`,
        tournamentId,
        teamIndex: team.teamIndex,
        teamName: team.teamName,
        members: team.members,
        avgSkillLevel: avgSkill,
        totalSkillLevel: team.totalSkill,
      };
    });

    // ── Balance stats (computed from the full layout) ──
    const avgs = fullTeams.map(t => t.avgSkillLevel);
    const spread = Math.round((Math.max(...avgs) - Math.min(...avgs)) * 100) / 100;
    const mean = avgs.reduce((a, b) => a + b, 0) / avgs.length;
    const stdDev = Math.round(Math.sqrt(avgs.reduce((s, v) => s + (v - mean) ** 2, 0) / avgs.length) * 100) / 100;
    const balance = { spread, stdDev, mean: Math.round(mean * 100) / 100 };

    // ── Dry-run: return full teams without writing ─────────────────────────
    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        totalPlayers: players.length,
        teamCount: numTeams,
        teams: fullTeams,
        balance,
      });
    }

    // ── Write teams to Firestore ────────────────────────────────────────────
    const batch = adminDb.batch();
    const teamsCollection = tournamentRef.collection("teams");
    const createdAt = new Date().toISOString();
    for (const team of fullTeams) {
      batch.set(teamsCollection.doc(team.id), {
        tournamentId: team.tournamentId,
        teamIndex: team.teamIndex,
        teamName: team.teamName,
        members: team.members,
        avgSkillLevel: team.avgSkillLevel,
        totalSkillLevel: team.totalSkillLevel,
        createdAt,
      });
    }
    batch.update(tournamentRef, {
      teamsGenerated: true,
      teamCount: numTeams,
    });
    await batch.commit();

    const teamSummaries = fullTeams.map(t => ({
      id: t.id,
      teamName: t.teamName,
      memberCount: t.members.length,
      avgSkill: t.avgSkillLevel,
    }));

    return NextResponse.json({
      success: true,
      totalPlayers: players.length,
      teamCount: numTeams,
      teams: teamSummaries,
      deletedExisting: !!deleteExisting,
      balance,
    });
  } catch (e: any) {
    console.error("Shuffle teams error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}