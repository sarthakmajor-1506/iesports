import { isNotAdmin } from "@/lib/checkAdmin";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/valorant/modify-roster
 *
 * Admin can:
 * - "add" a player to a team by UID
 * - "remove" a player from a team by UID
 * - "move" a player from one team to another
 *
 * Body: { tournamentId, adminKey, teamId, playerUid, action, targetTeamId? }
 */
export async function POST(req: NextRequest) {
  try {
    const { tournamentId, adminKey, teamId, playerUid, action, targetTeamId } = await req.json();

    if (!tournamentId || !adminKey || !teamId || !playerUid || !action) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (await isNotAdmin(adminKey)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!["add", "remove", "move"].includes(action)) {
      return NextResponse.json({ error: "Invalid action. Use: add, remove, move" }, { status: 400 });
    }

    const tournamentRef = adminDb.collection("valorantTournaments").doc(tournamentId);
    const teamRef = tournamentRef.collection("teams").doc(teamId);
    const teamDoc = await teamRef.get();

    if (!teamDoc.exists) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const teamData = teamDoc.data()!;
    let members = (teamData.members || []) as any[];

    // ── Skill level helper ───────────────────────────────────────────────────
    const getSkillLevel = (riotRank: string): number => {
      const baseTier = (riotRank || "").split(" ")[0];
      const levels: Record<string, number> = {
        "Iron": 1, "Bronze": 1, "Silver": 1, "Gold": 1,
        "Platinum": 2, "Diamond": 3, "Ascendant": 4, "Immortal": 5, "Radiant": 5,
      };
      return levels[baseTier] ?? 1;
    };

    if (action === "add") {
      // ── Add player to team ─────────────────────────────────────────────────
      const existingIdx = members.findIndex((m: any) => m.uid === playerUid);
      if (existingIdx !== -1) {
        return NextResponse.json({ error: "Player is already on this team" }, { status: 400 });
      }

      // Fetch player data
      const userDoc = await adminDb.collection("users").doc(playerUid).get();
      const userData = userDoc.data();
      if (!userData) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const newMember = {
        uid: playerUid,
        riotGameName: userData.riotGameName || "",
        riotTagLine: userData.riotTagLine || "",
        riotAvatar: userData.riotAvatar || "",
        riotRank: userData.riotRank || "",
        riotTier: userData.riotTier || 0,
        riotPuuid: userData.riotPuuid || "",
        skillLevel: getSkillLevel(userData.riotRank || ""),
      };

      members.push(newMember);

      const totalSkill = members.reduce((sum: number, m: any) => sum + (m.skillLevel || 1), 0);
      const avgSkill = Math.round((totalSkill / members.length) * 100) / 100;

      await teamRef.update({
        members,
        avgSkillLevel: avgSkill,
        totalSkillLevel: totalSkill,
      });

      return NextResponse.json({
        success: true,
        action: "added",
        player: newMember.riotGameName || playerUid,
        team: teamData.teamName,
        memberCount: members.length,
      });

    } else if (action === "remove") {
      // ── Remove player from team ────────────────────────────────────────────
      const removeIdx = members.findIndex((m: any) => m.uid === playerUid);
      if (removeIdx === -1) {
        return NextResponse.json({ error: "Player not found on this team" }, { status: 404 });
      }

      const removedPlayer = members[removeIdx];
      members.splice(removeIdx, 1);

      const totalSkill = members.reduce((sum: number, m: any) => sum + (m.skillLevel || 1), 0);
      const avgSkill = members.length > 0 ? Math.round((totalSkill / members.length) * 100) / 100 : 0;

      await teamRef.update({
        members,
        avgSkillLevel: avgSkill,
        totalSkillLevel: totalSkill,
      });

      return NextResponse.json({
        success: true,
        action: "removed",
        player: removedPlayer.riotGameName || playerUid,
        team: teamData.teamName,
        memberCount: members.length,
      });

    } else if (action === "move") {
      // ── Move player from one team to another ───────────────────────────────
      if (!targetTeamId) {
        return NextResponse.json({ error: "targetTeamId required for move action" }, { status: 400 });
      }

      const targetRef = tournamentRef.collection("teams").doc(targetTeamId);
      const targetDoc = await targetRef.get();
      if (!targetDoc.exists) {
        return NextResponse.json({ error: "Target team not found" }, { status: 404 });
      }

      const removeIdx = members.findIndex((m: any) => m.uid === playerUid);
      if (removeIdx === -1) {
        return NextResponse.json({ error: "Player not found on source team" }, { status: 404 });
      }

      const movedPlayer = members[removeIdx];
      members.splice(removeIdx, 1);

      // Update source team
      const srcTotal = members.reduce((sum: number, m: any) => sum + (m.skillLevel || 1), 0);
      const srcAvg = members.length > 0 ? Math.round((srcTotal / members.length) * 100) / 100 : 0;

      await teamRef.update({
        members,
        avgSkillLevel: srcAvg,
        totalSkillLevel: srcTotal,
      });

      // Update target team
      const targetData = targetDoc.data()!;
      const targetMembers = (targetData.members || []) as any[];

      // Check not already there
      if (targetMembers.some((m: any) => m.uid === playerUid)) {
        return NextResponse.json({ error: "Player is already on the target team" }, { status: 400 });
      }

      targetMembers.push(movedPlayer);
      const tgtTotal = targetMembers.reduce((sum: number, m: any) => sum + (m.skillLevel || 1), 0);
      const tgtAvg = Math.round((tgtTotal / targetMembers.length) * 100) / 100;

      await targetRef.update({
        members: targetMembers,
        avgSkillLevel: tgtAvg,
        totalSkillLevel: tgtTotal,
      });

      return NextResponse.json({
        success: true,
        action: "moved",
        player: movedPlayer.riotGameName || playerUid,
        from: teamData.teamName,
        to: targetData.teamName,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    console.error("Modify roster error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}