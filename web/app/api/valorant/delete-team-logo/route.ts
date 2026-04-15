import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * POST /api/valorant/delete-team-logo
 *
 * Clears the team's logo fields so the card falls back to the initials
 * placeholder. Any team member can do this. The Storage file itself is
 * left in place — the next logo upload reuses the same path
 * (`team-logos/{tournamentId}/{teamId}.{ext}`) and overwrites it.
 *
 * Body: { tournamentId, teamId, uid }
 */
export async function POST(req: NextRequest) {
  try {
    const { tournamentId, teamId, uid } = await req.json();

    if (!tournamentId || !teamId || !uid) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const teamRef = adminDb
      .collection("valorantTournaments")
      .doc(tournamentId)
      .collection("teams")
      .doc(teamId);

    const teamDoc = await teamRef.get();
    if (!teamDoc.exists) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const teamData = teamDoc.data()!;
    const members = teamData.members || [];
    const isMember = members.some((m: any) =>
      m.uid === uid || m.id === uid || m.userId === uid || m.playerId === uid
    );
    if (!isMember) {
      return NextResponse.json({ error: "You are not a member of this team" }, { status: 403 });
    }

    await teamRef.update({
      teamLogo: FieldValue.delete(),
      teamLogoSet: false,
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[delete-team-logo] Error:", e);
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}
