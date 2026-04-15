import { isNotAdmin } from "@/lib/checkAdmin";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/valorant/publish-teams
 *
 * Commit a previewed team layout (from /api/valorant/shuffle-teams?dryRun=true)
 * to Firestore. Wipes existing teams/matches/standings/leaderboard and writes
 * the provided teams verbatim so the admin sees the same layout that goes live.
 */
export async function POST(req: NextRequest) {
  try {
    const { tournamentId, adminKey, teams } = await req.json();

    if (!tournamentId || !adminKey) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!Array.isArray(teams) || teams.length === 0) {
      return NextResponse.json({ error: "teams array is required" }, { status: 400 });
    }
    if (await isNotAdmin(adminKey)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tournamentRef = adminDb.collection("valorantTournaments").doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    if (!tournamentDoc.exists) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // ── Wipe existing teams + downstream state ────────────────────────────
    // Reusing the same delete fan-out the shuffle endpoint uses.
    const subcollections = ["teams", "matches", "standings", "leaderboard"];
    for (const sub of subcollections) {
      const snap = await tournamentRef.collection(sub).get();
      if (snap.empty) continue;
      const chunks: FirebaseFirestore.DocumentReference[][] = [];
      let current: FirebaseFirestore.DocumentReference[] = [];
      snap.docs.forEach((d) => {
        current.push(d.ref);
        if (current.length >= 450) {
          chunks.push(current);
          current = [];
        }
      });
      if (current.length > 0) chunks.push(current);
      for (const chunk of chunks) {
        const batch = adminDb.batch();
        chunk.forEach((ref) => batch.delete(ref));
        await batch.commit();
      }
    }

    // ── Write the provided teams ──────────────────────────────────────────
    const teamsCollection = tournamentRef.collection("teams");
    const createdAt = new Date().toISOString();
    const batch = adminDb.batch();
    for (const team of teams) {
      const teamIndex = Number(team.teamIndex);
      if (!teamIndex || !Array.isArray(team.members)) {
        return NextResponse.json({ error: "Invalid team in payload" }, { status: 400 });
      }
      const docId = team.id || `team-${teamIndex}`;
      batch.set(teamsCollection.doc(docId), {
        tournamentId,
        teamIndex,
        teamName: String(team.teamName || `Team ${teamIndex}`).toUpperCase(),
        members: team.members,
        avgSkillLevel: team.avgSkillLevel ?? 0,
        totalSkillLevel: team.totalSkillLevel ?? 0,
        createdAt,
      });
    }
    batch.update(tournamentRef, {
      teamsGenerated: true,
      teamCount: teams.length,
      fixturesGenerated: false,
      currentMatchDay: 0,
    });
    await batch.commit();

    return NextResponse.json({
      success: true,
      teamCount: teams.length,
    });
  } catch (e: any) {
    console.error("Publish teams error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
