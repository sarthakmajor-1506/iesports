// "Where do I stand in this team tournament?" — for the tournament page and
// the registration modal. Per-player, so it is never cached.
//
// GET ?tournamentId=&uid=   (signed in as uid)

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { entryFeeOf, isTeamRegistration } from "@/lib/paidEntry";
import { verifyCaller } from "@/lib/apiAuth";
import { codeForTeam, findTeamFor, teamSizeOf, totalTeamsOf } from "@/lib/valorantTeams";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tournamentId = req.nextUrl.searchParams.get("tournamentId") || "";
  const uid = req.nextUrl.searchParams.get("uid") || "";
  if (!tournamentId || !uid) return NextResponse.json({ error: "Missing tournamentId or uid" }, { status: 400 });

  const caller = await verifyCaller(req, uid);
  if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

  const tRef = adminDb.collection("valorantTournaments").doc(tournamentId);
  const [tSnap, userSnap, team] = await Promise.all([
    tRef.get(),
    adminDb.collection("users").doc(uid).get(),
    findTeamFor(tournamentId, uid),
  ]);
  const t = tSnap.data() as any;
  if (!t) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  if (!isTeamRegistration(t)) return NextResponse.json({ teamRegistration: false });

  const u = (userSnap.data() || {}) as any;
  const missing: string[] = [];
  if (!u.fullName) missing.push("name");
  if (!u.phone && !u.phoneNumber) missing.push("phone");
  if (!u.discordId) missing.push("discord");
  if (!u.riotGameName) missing.push("riot");

  // A captain who has paid but whose team does not exist yet — settlement is
  // still running, or creation failed and needs retrying. Never "pay again".
  let pendingTeamPayment: { txnid: string; teamName: string } | null = null;
  if (!team) {
    const pays = await adminDb.collection("payments")
      .where("uid", "==", uid).where("tournamentId", "==", tournamentId).where("status", "==", "paid").get();
    const p = pays.docs.find((d) => (d.data() as any).mode === "team_create" && !(d.data() as any).team?.teamId);
    if (p) {
      const refund = await adminDb.collection("refunds").doc(p.id).get();
      if (!refund.exists) pendingTeamPayment = { txnid: p.id, teamName: (p.data() as any).teamName };
    }
  }

  const teamsSnap = await tRef.collection("teams").get();
  const fee = entryFeeOf(t);

  return NextResponse.json({
    teamRegistration: true,
    entryFee: fee,
    teamSize: teamSizeOf(t),
    totalTeams: totalTeamsOf(t),
    teamsRegistered: teamsSnap.size,
    missing,
    team: team
      ? {
          id: team.id,
          name: team.teamName,
          isCaptain: team.captainUid === uid,
          memberCount: (team.members || []).length,
          // Any member may see and pass on the code; nobody else ever gets it.
          code: await codeForTeam(tournamentId, team.id),
        }
      : null,
    pendingTeamPayment,
    upiId: u.upiId || null,
  });
}
