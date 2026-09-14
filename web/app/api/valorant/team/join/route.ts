// Join a registered team with its code. Free — the captain paid for the team.
//
// Body: { uid, code, preview?: true }
//
// `preview` answers "which team is this?" without joining, so the player sees
// the team name and who is on it before committing. It needs a signed-in
// caller like the join itself, which keeps codes from being enumerated
// anonymously.

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { recalcTiers } from "@/lib/recalcTiers";
import { syncPlayerSnapshot } from "@/lib/valorantPlayerSnapshot";
import { sendDM } from "@/lib/discord";
import { isTeamRegistration } from "@/lib/paidEntry";
import { verifyCaller } from "@/lib/apiAuth";
import { prepareValorantPlayer, valorantProfileError } from "@/lib/valorantRegistration";
import { joinTeam, resolveTeamCode, teamSizeOf } from "@/lib/valorantTeams";

const discordOf = (uid: string, u: any) => u?.discordId || (uid.startsWith("discord_") ? uid.replace("discord_", "") : "");

export async function POST(req: NextRequest) {
  try {
    const { uid, code, preview } = await req.json();
    if (!uid || !code) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const caller = await verifyCaller(req, uid);
    if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const info = await resolveTeamCode(code);
    if (!info) return NextResponse.json({ error: "That team code doesn't exist. Check it with your captain." }, { status: 404 });

    const tRef = adminDb.collection("valorantTournaments").doc(info.tournamentId);
    const [tSnap, teamSnap] = await Promise.all([tRef.get(), tRef.collection("teams").doc(info.teamId).get()]);
    const t = tSnap.data() as any;
    const team = teamSnap.data() as any;
    if (!t || !team || !isTeamRegistration(t)) {
      return NextResponse.json({ error: "That team is no longer registered" }, { status: 404 });
    }

    const size = teamSizeOf(t);
    const memberCount = (team.members || []).length;
    const deadline = t.registrationDeadline ? Date.parse(t.registrationDeadline) : NaN;
    const closed = !!deadline && Date.now() > deadline;

    if (preview) {
      return NextResponse.json({
        tournamentId: info.tournamentId,
        tournamentName: t.name || info.tournamentId,
        teamId: info.teamId,
        teamName: team.teamName,
        memberCount,
        teamSize: size,
        members: (team.members || []).map((m: any) => ({ riotGameName: m.riotGameName || "Player", isCaptain: m.uid === team.captainUid })),
        alreadyMember: (team.memberUids || []).includes(uid),
        full: memberCount >= size,
        closed,
      });
    }

    if (closed) return NextResponse.json({ error: "Registration has closed for this tournament" }, { status: 400 });
    if (memberCount >= size) return NextResponse.json({ error: `${team.teamName} already has ${size} players` }, { status: 400 });

    const userData = (await adminDb.collection("users").doc(uid).get()).data();
    if (!userData) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const profileError = valorantProfileError(userData);
    if (profileError) return NextResponse.json({ error: profileError }, { status: 400 });

    const prepared = await prepareValorantPlayer(uid, userData);
    const result = await joinTeam({ tournamentId: info.tournamentId, teamId: info.teamId, uid, player: prepared.player });

    if (!result.ok) {
      const map: Record<string, [number, string]> = {
        no_team: [404, "That team is no longer registered"],
        already_in_this_team: [400, `You're already on ${team.teamName}`],
        already_on_team: [400, "You're already on another team in this tournament. Leave it first."],
        team_full: [400, `${team.teamName} already has ${size} players`],
      };
      const [status, error] = map[result.reason] || [400, "Could not join the team"];
      return NextResponse.json({ error, reason: result.reason }, { status });
    }

    await adminDb.collection("users").doc(uid).update(prepared.userUpdate);
    if (prepared.rankHistoryEntry) {
      await adminDb.collection("users").doc(uid).collection("rankHistory").add(prepared.rankHistoryEntry);
    }
    await recalcTiers(info.tournamentId);
    await syncPlayerSnapshot(info.tournamentId);

    const joinerDiscord = discordOf(uid, userData);
    if (joinerDiscord) {
      sendDM(joinerDiscord, `You're on **${result.teamName}** for **${t.name || "the tournament"}** (${result.memberCount}/${result.teamSize}). Match calls land here on Discord.`).catch(() => {});
    }
    const captain = (await adminDb.collection("users").doc(result.captainUid).get()).data();
    const captainDiscord = discordOf(result.captainUid, captain);
    if (captainDiscord && result.captainUid !== uid) {
      const who = userData.riotGameName ? `${userData.riotGameName}#${userData.riotTagLine || ""}` : userData.fullName || "A player";
      sendDM(
        captainDiscord,
        result.memberCount >= result.teamSize
          ? `**${who}** joined **${result.teamName}**. Your team is complete — ${result.teamSize}/${result.teamSize}.`
          : `**${who}** joined **${result.teamName}** — ${result.memberCount}/${result.teamSize}.`
      ).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      teamId: result.teamId,
      teamName: result.teamName,
      memberCount: result.memberCount,
      teamSize: result.teamSize,
    });
  } catch (e: any) {
    console.error("Valorant team join error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
