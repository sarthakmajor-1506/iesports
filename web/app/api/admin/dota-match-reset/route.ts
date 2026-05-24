import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAdmin } from "@/lib/verifyAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { recomputeDotaStandings } from "@/lib/recomputeDotaStandings";

/**
 * Reset a Dota tournament match — either soft (admin doc only) or hard
 * (destroys the bot's active lobby + deletes the queue + wipes everything).
 *
 * POST {
 *   tournamentId, matchId,
 *   mode: "soft" | "hard",
 *   adminKey / authToken
 * }
 *
 * SOFT: clears status, lobby creds, sub picks on the match doc. Leaves bot
 *       lobby, VCs, queue, and any captured dotaMatchId untouched. Use
 *       when the bot is mid-game and you only want the admin panel to
 *       show pending again.
 *
 * HARD: enqueues a botLobbyCommands "destroy", wipes EVERY lobby/result
 *       field on the match doc, deletes the matching botQueue. Use when
 *       you actually want to kill the game and start over.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  try { await verifyAdmin({ adminKey: body.adminKey, authToken: body.authToken }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  const tournamentId = String(body.tournamentId || "").trim();
  const matchId = String(body.matchId || "").trim();
  const mode = body.mode === "hard" ? "hard" : "soft";
  if (!tournamentId || !matchId) {
    return NextResponse.json({ error: "tournamentId and matchId required" }, { status: 400 });
  }

  const mref = adminDb.collection("tournaments").doc(tournamentId).collection("matches").doc(matchId);
  const snap = await mref.get();
  if (!snap.exists) return NextResponse.json({ error: "match not found" }, { status: 404 });

  // SOFT path — only the admin-visible match doc gets cleared.
  if (mode === "soft") {
    await mref.update({
      status: "pending",
      botQueueId: FieldValue.delete(),
      lobbyName: FieldValue.delete(),
      lobbyPassword: FieldValue.delete(),
      lobbyMode: FieldValue.delete(),
      lobbyStatus: FieldValue.delete(),
      lobbySetAt: FieldValue.delete(),
      team1Subs: FieldValue.delete(),
      team2Subs: FieldValue.delete(),
    });
    // Soft reset doesn't change completed-match counts but doesn't hurt to
    // refresh standings (cheap; idempotent).
    let standingsRefresh: any = null;
    try { standingsRefresh = await recomputeDotaStandings(adminDb, tournamentId); } catch (e: any) { standingsRefresh = { error: e?.message || String(e) }; }
    return NextResponse.json({ ok: true, mode, standingsRefresh, message: "Match soft-reset. Bot lobby + VCs + queue untouched." });
  }

  // HARD path — destroy bot lobby + full match doc wipe + delete queue.
  let destroyCmdId: string | null = null;
  try {
    const c = await adminDb.collection("botLobbyCommands").add({
      action: "destroy", params: {}, status: "pending",
      createdAt: new Date().toISOString(),
      createdBy: `dota-match-reset:hard:${tournamentId}/${matchId}`,
    });
    destroyCmdId = c.id;
  } catch {}

  await mref.update({
    status: "pending",
    team1Score: 0, team2Score: 0,
    botQueueId: FieldValue.delete(), lobbyName: FieldValue.delete(),
    lobbyPassword: FieldValue.delete(), lobbyMode: FieldValue.delete(),
    lobbyStatus: FieldValue.delete(), lobbySetAt: FieldValue.delete(),
    team1Subs: FieldValue.delete(), team2Subs: FieldValue.delete(),
    vetoState: FieldValue.delete(), game1: FieldValue.delete(),
    games: FieldValue.delete(), dotaMatchId: FieldValue.delete(),
    winner: FieldValue.delete(), winnerTeamId: FieldValue.delete(),
    completedAt: FieldValue.delete(), startedAt: FieldValue.delete(),
    durationSec: FieldValue.delete(), dataSource: FieldValue.delete(),
    result: FieldValue.delete(), playerStats: FieldValue.delete(),
    waitingRoomVcId: FieldValue.delete(),
    team1VcId: FieldValue.delete(), team2VcId: FieldValue.delete(),
    vcStatus: FieldValue.delete(), vcLiveStatus: FieldValue.delete(),
    discordOpsMessageIds: FieldValue.delete(),
    resultMessageId: FieldValue.delete(),
    resultMessageChannelId: FieldValue.delete(),
  });

  let queueDeleted = 0;
  const stale = await adminDb.collection("botQueues")
    .where("tournamentId", "==", tournamentId)
    .where("tournamentMatchId", "==", matchId).get();
  for (const d of stale.docs) { await d.ref.delete(); queueDeleted++; }

  // Hard reset removes a completed match's contribution, so recompute.
  let standingsRefresh: any = null;
  try { standingsRefresh = await recomputeDotaStandings(adminDb, tournamentId); }
  catch (e: any) { standingsRefresh = { error: e?.message || String(e) }; }

  return NextResponse.json({
    ok: true, mode, destroyCmdId, queueDeleted, standingsRefresh,
    message: "Hard reset: bot lobby destroy enqueued, match doc wiped, queue deleted.",
  });
}
