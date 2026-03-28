// app/api/valorant/update-team-logo/route.ts

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, teamId, uid, logoUrl } = await req.json();

    if (!tournamentId || !teamId || !uid || !logoUrl) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Verify the team exists
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

    // 2. Check if logo is already set (one-time only)
    if (teamData.teamLogoSet) {
      return NextResponse.json({ error: "Team logo has already been set and cannot be changed" }, { status: 403 });
    }

    // 3. Verify the user is a member of this team
    const members = teamData.members || [];
    const isMember = members.some((m: any) => 
      m.uid === uid || m.id === uid || m.userId === uid || m.playerId === uid
    );
    
    console.log("[update-team-logo] uid:", uid);
    console.log("[update-team-logo] members:", JSON.stringify(members.map((m: any) => ({ uid: m.uid, id: m.id, userId: m.userId, name: m.riotGameName })), null, 2));
    console.log("[update-team-logo] isMember:", isMember);
    
    if (!isMember) {
      return NextResponse.json({ error: "You are not a member of this team" }, { status: 403 });
    }

    // 4. Update the team logo
    await teamRef.update({
      teamLogo: logoUrl,
      teamLogoSet: true,
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[update-team-logo] Error:", e);
    return NextResponse.json({ error: e.message || "Internal server error" }, { status: 500 });
  }
}