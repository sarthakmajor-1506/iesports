// Create a registered team on a team-registration Valorant tournament.
//
// On a paid tournament this is NOT called by the player's click. It is called
// by settlement (lib/settlePayuPayment.ts) the moment the captain's payment
// clears, exactly like solo registration is: the route is the one place a team
// is made, and the payment document says which team name was bought. A player
// token is also accepted, so the page can retry a creation that failed after
// payment without anyone paying again.
//
// Body: { tournamentId, uid, txnid }            paid tournament
//       { tournamentId, uid, teamName }         free tournament

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { recalcTiers } from "@/lib/recalcTiers";
import { syncPlayerSnapshot } from "@/lib/valorantPlayerSnapshot";
import { sendDM } from "@/lib/discord";
import { entryFeeOf, isTeamRegistration } from "@/lib/paidEntry";
import { verifyCaller } from "@/lib/apiAuth";
import { prepareValorantPlayer, valorantProfileError } from "@/lib/valorantRegistration";
import { cleanTeamName, createRegisteredTeam, teamSizeOf } from "@/lib/valorantTeams";

const REASON: Record<string, { status: number; error: string }> = {
  no_tournament: { status: 404, error: "Tournament not found" },
  already_on_team: { status: 400, error: "You are already on a team in this tournament" },
  full: { status: 400, error: "All team slots are taken" },
  name_taken: { status: 400, error: "That team name is taken — pick another" },
  code_exhausted: { status: 500, error: "Could not generate a team code. Try again." },
};

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, uid, txnid, teamName: rawName } = await req.json();
    if (!tournamentId || !uid) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const caller = await verifyCaller(req, uid);
    if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const tSnap = await adminDb.collection("valorantTournaments").doc(tournamentId).get();
    const t = tSnap.data();
    if (!t) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    if (!isTeamRegistration(t)) {
      return NextResponse.json({ error: "This tournament does not take team registrations" }, { status: 400 });
    }

    const fee = entryFeeOf(t);
    let teamName: string;

    if (fee > 0) {
      // The team name and the right to create it both come from a paid payment
      // for this player and this tournament — never from the request body.
      if (!txnid) {
        return NextResponse.json({ error: `Creating a team costs ₹${fee}. Complete payment first.`, requiresPayment: true, entryFee: fee }, { status: 402 });
      }
      const pay = (await adminDb.collection("payments").doc(String(txnid)).get()).data() as any;
      if (!pay || pay.status !== "paid" || pay.mode !== "team_create" || pay.uid !== uid || pay.tournamentId !== tournamentId || pay.game !== "valorant") {
        return NextResponse.json({ error: "No completed team payment found for this account" }, { status: 402 });
      }
      teamName = pay.teamName;
    } else {
      const deadline = t.registrationDeadline ? Date.parse(t.registrationDeadline) : NaN;
      if (deadline && Date.now() > deadline) {
        return NextResponse.json({ error: "Registration has closed for this tournament" }, { status: 400 });
      }
      const cleaned = cleanTeamName(rawName);
      if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
      teamName = cleaned.name;
    }

    const userData = (await adminDb.collection("users").doc(uid).get()).data();
    if (!userData) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const profileError = valorantProfileError(userData);
    if (profileError) return NextResponse.json({ error: profileError }, { status: 400 });

    const prepared = await prepareValorantPlayer(uid, userData);
    const result = await createRegisteredTeam({
      tournamentId, uid, teamName, player: prepared.player, txnid: fee > 0 ? String(txnid) : null,
    });

    if (!result.ok) {
      const r = REASON[result.reason] || { status: 400, error: "Could not create the team" };
      return NextResponse.json({ error: r.error, reason: result.reason }, { status: r.status });
    }

    // A replay of a creation that already happened: nothing below runs twice.
    if (!result.created) {
      return NextResponse.json({ success: true, alreadyCreated: true, teamId: result.teamId, teamName: result.teamName, code: result.code });
    }

    await adminDb.collection("users").doc(uid).update(prepared.userUpdate);
    if (prepared.rankHistoryEntry) {
      await adminDb.collection("users").doc(uid).collection("rankHistory").add(prepared.rankHistoryEntry);
    }
    await recalcTiers(tournamentId);
    await syncPlayerSnapshot(tournamentId);

    // The code goes to Discord too, so a captain who closed the tab still has it.
    const discordId = userData.discordId || (uid.startsWith("discord_") ? uid.replace("discord_", "") : "");
    if (discordId) {
      const site = process.env.NEXT_PUBLIC_APP_URL || "https://www.iesports.in";
      const link = `${site}/valorant/tournament/${tournamentId}?join=${result.code}`;
      sendDM(
        discordId,
        [
          `**${result.teamName}** is registered for **${t.name || "the tournament"}**. You're the captain.`,
          ``,
          `Team code: **${result.code}**`,
          `Send your ${teamSizeOf(t) - 1} teammates this link — they join free:`,
          link,
        ].join("\n")
      ).catch(() => {});
    }

    return NextResponse.json({ success: true, teamId: result.teamId, teamName: result.teamName, code: result.code });
  } catch (e: any) {
    console.error("Valorant team create error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
