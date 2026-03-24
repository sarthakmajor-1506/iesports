import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, adminKey, teamId, oldPlayerUid, newPlayerUid } = await req.json();

    if (!tournamentId || !adminKey || !teamId || !oldPlayerUid || !newPlayerUid) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (adminKey !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tournamentRef = adminDb.collection("valorantTournaments").doc(tournamentId);
    const teamRef = tournamentRef.collection("teams").doc(teamId);
    const teamDoc = await teamRef.get();

    if (!teamDoc.exists) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const teamData = teamDoc.data()!;
    const members = teamData.members as any[];
    const oldIdx = members.findIndex((m: any) => m.uid === oldPlayerUid);

    if (oldIdx === -1) {
      return NextResponse.json({ error: "Player not found on this team" }, { status: 404 });
    }

    // Fetch new player data from users collection
    const newUserDoc = await adminDb.collection("users").doc(newPlayerUid).get();
    const newUserData = newUserDoc.data();

    if (!newUserData?.riotGameName) {
      return NextResponse.json({ error: "New player has no Riot ID linked" }, { status: 400 });
    }

    const riotRank = newUserData.riotRank || "";
    const baseTier = riotRank.split(" ")[0];
    const skillLevels: Record<string, number> = {
      "Iron": 1, "Bronze": 1, "Silver": 1, "Gold": 1,
      "Platinum": 2, "Diamond": 3, "Ascendant": 4, "Immortal": 5, "Radiant": 5,
    };

    const oldPlayer = members[oldIdx];
    const newPlayer = {
      uid: newPlayerUid,
      riotGameName: newUserData.riotGameName,
      riotTagLine: newUserData.riotTagLine || "",
      riotAvatar: newUserData.riotAvatar || "",
      riotRank: newUserData.riotRank || "",
      riotTier: newUserData.riotTier || 0,
      skillLevel: skillLevels[baseTier] ?? 1,
    };

    // Replace in members array
    members[oldIdx] = newPlayer;

    // Recompute avg skill
    const totalSkill = members.reduce((sum: number, m: any) => sum + (m.skillLevel || 1), 0);
    const avgSkill = Math.round((totalSkill / members.length) * 100) / 100;

    await teamRef.update({
      members,
      avgSkillLevel: avgSkill,
      totalSkillLevel: totalSkill,
    });

    // Log substitution
    await tournamentRef.collection("substitutions").add({
      teamId,
      teamName: teamData.teamName,
      oldPlayer: { uid: oldPlayer.uid, riotGameName: oldPlayer.riotGameName },
      newPlayer: { uid: newPlayer.uid, riotGameName: newPlayer.riotGameName },
      substitutedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      teamName: teamData.teamName,
      removed: oldPlayer.riotGameName,
      added: newPlayer.riotGameName,
      newAvgSkill: avgSkill,
    });
  } catch (e: any) {
    console.error("Substitute error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
