import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, adminKey, teamCount, teamNames } = await req.json();

    // ── Auth ────────────────────────────────────────────────────────────────
    if (!tournamentId || !adminKey) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (adminKey !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Fetch tournament ────────────────────────────────────────────────────
    const tournamentDoc = await adminDb.collection("valorantTournaments").doc(tournamentId).get();
    const tData = tournamentDoc.data();
    if (!tData) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // ── Fetch all registered solo players ───────────────────────────────────
    const playersSnap = await adminDb
      .collection("valorantTournaments")
      .doc(tournamentId)
      .collection("soloPlayers")
      .get();

    const players = playersSnap.docs.map((d) => {
      const data = d.data();
      return {
        uid: data.uid,
        riotGameName: data.riotGameName || "",
        riotTagLine: data.riotTagLine || "",
        riotAvatar: data.riotAvatar || "",
        riotRank: data.riotRank || "",
        riotTier: data.riotTier || 0,
        skillLevel: data.skillLevel || 1,
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

    // ── Snake draft shuffle ─────────────────────────────────────────────────
    // Sort by skill level descending (ties broken by riotTier descending)
    const sorted = [...players].sort((a, b) => {
      if (b.skillLevel !== a.skillLevel) return b.skillLevel - a.skillLevel;
      return b.riotTier - a.riotTier;
    });

    const teams: {
      teamIndex: number;
      teamName: string;
      members: typeof players;
      totalSkill: number;
    }[] = Array.from({ length: numTeams }, (_, i) => ({
      teamIndex: i + 1,
      teamName: teamNames?.[i] || `Team ${i + 1}`,
      members: [],
      totalSkill: 0,
    }));

    let forward = true;
    let idx = 0;

    for (const player of sorted) {
      teams[idx].members.push(player);
      teams[idx].totalSkill += player.skillLevel;

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
    const teamsCollection = adminDb
      .collection("valorantTournaments")
      .doc(tournamentId)
      .collection("teams");

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
    const tournamentRef = adminDb.collection("valorantTournaments").doc(tournamentId);
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
    });
  } catch (e: any) {
    console.error("Shuffle teams error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
