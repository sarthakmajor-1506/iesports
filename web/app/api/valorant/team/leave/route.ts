// A teammate leaves their team before registration closes. Captains cannot.
//
// Body: { tournamentId, uid }

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { recalcTiers } from "@/lib/recalcTiers";
import { syncPlayerSnapshot } from "@/lib/valorantPlayerSnapshot";
import { isTeamRegistration } from "@/lib/paidEntry";
import { verifyCaller } from "@/lib/apiAuth";
import { leaveTeam } from "@/lib/valorantTeams";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, uid } = await req.json();
    if (!tournamentId || !uid) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const caller = await verifyCaller(req, uid);
    if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const t = (await adminDb.collection("valorantTournaments").doc(tournamentId).get()).data() as any;
    if (!t) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    if (!isTeamRegistration(t)) return NextResponse.json({ error: "This tournament does not use teams" }, { status: 400 });

    const deadline = t.registrationDeadline ? Date.parse(t.registrationDeadline) : NaN;
    if ((deadline && Date.now() > deadline) || t.status === "active" || t.status === "ended") {
      return NextResponse.json({ error: "Teams are locked once registration closes. Message an admin." }, { status: 400 });
    }

    const result = await leaveTeam({ tournamentId, uid });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.reason === "captain" ? "Captains can't leave their own team. Message an admin if you need out." : "You're not on a team in this tournament" },
        { status: 400 }
      );
    }

    await recalcTiers(tournamentId);
    await syncPlayerSnapshot(tournamentId);

    return NextResponse.json({ success: true, teamName: result.teamName });
  } catch (e: any) {
    console.error("Valorant team leave error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
