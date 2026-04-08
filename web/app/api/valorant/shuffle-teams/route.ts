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

    // Batch-fetch user docs to get riotPuuid
    const userDocs = await Promise.all(
      rawPlayers.map(p => adminDb.collection("users").doc(p.uid).get())
    );
    const players = rawPlayers.map((p, i) => ({
      ...p,
      riotPuuid: userDocs[i].data()?.riotPuuid || "",
    }));


    if (players.length === 0) {
      return NextResponse.json({ error: "No players registered" }, { status: 400 });
    }

    const numTeams = teamCount || Math.max(2, Math.floor(players.length / 5));

    if (players.length < numTeams * 2) {
      return NextResponse.json({
        error: `Need at least ${numTeams * 2} players for ${numTeams} teams. Currently have ${players.length}.`,
      }, { status: 400 });
    }

    // ── Snake draft shuffle (by iesportsRating — highest first, fallback to riotTier) ──
    const sorted = [...players].sort((a, b) => {
      const aRating = (a as any).iesportsRating || a.riotTier * 100;
      const bRating = (b as any).iesportsRating || b.riotTier * 100;
      return bRating - aRating;
    });

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

    let forward = true;
    let idx = 0;

    for (const player of sorted) {
      teams[idx].members.push(player);
      teams[idx].totalSkill += (player.iesportsRating || player.riotTier * 100);

      if (forward) {
        idx++;
        if (idx >= numTeams) { idx = numTeams - 1; forward = false; }
      } else {
        idx--;
        if (idx < 0) { idx = 0; forward = true; }
      }
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

    return NextResponse.json({
      success: true,
      totalPlayers: players.length,
      teamCount: numTeams,
      teams: teamSummaries,
      deletedExisting: !!deleteExisting,
    });
  } catch (e: any) {
    console.error("Shuffle teams error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}