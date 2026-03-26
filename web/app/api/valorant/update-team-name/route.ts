import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/valorant/update-team-name
 *
 * Allows any team member to set the team name ONCE.
 * After it's set, the `teamNameSet` flag prevents further changes.
 * Also updates standings and match docs to reflect the new name.
 *
 * Body: { tournamentId, teamId, uid, newTeamName }
 */
export async function POST(req: NextRequest) {
  try {
    const { tournamentId, teamId, uid, newTeamName } = await req.json();

    if (!tournamentId || !teamId || !uid || !newTeamName) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    if (newTeamName.trim().length < 2 || newTeamName.trim().length > 24) {
      return NextResponse.json({ error: "Team name must be 2-24 characters" }, { status: 400 });
    }

    const tournamentRef = adminDb.collection("valorantTournaments").doc(tournamentId);
    const teamRef = tournamentRef.collection("teams").doc(teamId);
    const teamDoc = await teamRef.get();

    if (!teamDoc.exists) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const teamData = teamDoc.data()!;

    // Check if team name was already set
    if (teamData.teamNameSet) {
      return NextResponse.json({ error: "Team name has already been set and cannot be changed" }, { status: 400 });
    }

    // Verify the user is a member of this team
    const isMember = (teamData.members || []).some((m: any) => m.uid === uid);
    if (!isMember) {
      return NextResponse.json({ error: "You are not a member of this team" }, { status: 403 });
    }

    const cleanName = newTeamName.trim();
    const oldName = teamData.teamName;

    // Update team doc
    await teamRef.update({
      teamName: cleanName,
      teamNameSet: true,
      teamNameSetBy: uid,
      teamNameSetAt: new Date().toISOString(),
    });

    // Update standings doc if it exists
    const standingsRef = tournamentRef.collection("standings").doc(teamId);
    const standingsDoc = await standingsRef.get();
    if (standingsDoc.exists) {
      await standingsRef.update({ teamName: cleanName });
    }

    // Update match docs where this team appears
    const matchesSnap = await tournamentRef.collection("matches").get();
    const batch = adminDb.batch();
    let matchesUpdated = 0;

    for (const matchDoc of matchesSnap.docs) {
      const mData = matchDoc.data();
      const updates: any = {};

      if (mData.team1Id === teamId) {
        updates.team1Name = cleanName;
      }
      if (mData.team2Id === teamId) {
        updates.team2Name = cleanName;
      }

      if (Object.keys(updates).length > 0) {
        batch.update(matchDoc.ref, updates);
        matchesUpdated++;
      }
    }

    if (matchesUpdated > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      oldName,
      newName: cleanName,
      matchesUpdated,
    });
  } catch (e: any) {
    console.error("Update team name error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}