/**
 * Dota 2 toss + side / pick-order selection.
 *
 * Two teams. One winner of the coin toss picks side (Radiant or Dire). The
 * loser picks pick-order (first or last). The combination decides the lobby
 * cm_pick value, which the bot writes to the practice lobby on create.
 *
 * State machine on `vetoState` of the match doc:
 *
 *   start         → status:"toss_started", tossWinner, tossLoser
 *   side_choice   → status:"side_chosen", radiantTeam, direTeam, sideChosenAt
 *   pick_choice   → status:"completed", firstPickTeam, lastPickTeam,
 *                   cmPick, completedAt
 *
 * Once status === "completed", the set-lobby admin action reads vetoState
 * and passes cmPick into the bot lobby create params. Field 14 on the
 * CSODOTALobby proto gets set so Valve enforces first-pick assignment.
 *
 * Discord embeds mirror the Valorant veto style (red accent, button rows,
 * only-this-team-may-click footer). Three embeds total: start, side
 * recorded + pick prompt, final summary.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAdmin } from "@/lib/verifyAdmin";

export const runtime = "nodejs";

const DISCORD_API = "https://discord.com/api/v10";
const RADIANT_COLOR = 0x3ae37d;
const DIRE_COLOR = 0xd84a4a;
const TOSS_COLOR = 0xff4655;

type Team = "team1" | "team2";

async function postDiscordMessage(channelId: string, body: any): Promise<string | null> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) { console.error("[dota-toss] DISCORD_BOT_TOKEN not set"); return null; }
  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: "POST",
      headers: { "Authorization": `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[dota-toss] Discord POST failed:", res.status, text.slice(0, 300));
      return null;
    }
    const json = await res.json();
    return json.id || null;
  } catch (e: any) {
    console.error("[dota-toss] Discord exception:", e?.message || e);
    return null;
  }
}

async function editDiscordMessage(channelId: string, messageId: string, body: any): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return;
  try {
    await fetch(`${DISCORD_API}/channels/${channelId}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Authorization": `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e: any) {
    console.error("[dota-toss] Discord edit failed:", e?.message || e);
  }
}

function teamName(match: any, team: Team): string {
  return team === "team1" ? (match.team1Name || "Team 1") : (match.team2Name || "Team 2");
}

function rivalOf(team: Team): Team {
  return team === "team1" ? "team2" : "team1";
}

/**
 * Compute cm_pick based on the toss result.
 *   cm_pick = 1 (DOTA_CM_GOOD_GUYS) when Radiant has first pick
 *   cm_pick = 2 (DOTA_CM_BAD_GUYS)  when Dire has first pick
 */
function computeCmPick(state: { radiantTeam: Team; firstPickTeam: Team }): 1 | 2 {
  return state.firstPickTeam === state.radiantTeam ? 1 : 2;
}

function buildStartEmbed(args: { tournamentId: string; matchId: string; winnerName: string; loserName: string; gameLabel: string }) {
  const { tournamentId, matchId, winnerName, loserName, gameLabel } = args;
  return {
    embeds: [{
      title: `🎲 ${winnerName} won the toss`,
      description: [
        `**Match:** ${gameLabel}`,
        ``,
        `**${winnerName}** picks **side** (Radiant or Dire).`,
        `**${loserName}** then picks **pick order** (First Pick or Last Pick).`,
        ``,
        `Lobby first-pick will be set automatically based on these choices.`,
      ].join("\n"),
      color: TOSS_COLOR,
      footer: { text: `Any player on ${winnerName} can click below.` },
    }],
    components: [{
      type: 1,
      components: [
        { type: 2, style: 3, label: "Radiant ⚔️", custom_id: `dota_toss_side:${tournamentId}:${matchId}:radiant` },
        { type: 2, style: 4, label: "Dire 🔥",    custom_id: `dota_toss_side:${tournamentId}:${matchId}:dire` },
      ],
    }],
  };
}

function buildPickPromptEmbed(args: { tournamentId: string; matchId: string; winnerName: string; loserName: string; chosenSide: "radiant" | "dire" }) {
  const { tournamentId, matchId, winnerName, loserName, chosenSide } = args;
  return {
    embeds: [{
      title: `✅ ${winnerName} chose ${chosenSide === "radiant" ? "Radiant ⚔️" : "Dire 🔥"}`,
      description: [
        `**${loserName}**, now choose your pick order.`,
        ``,
        `**First Pick** lets you ban and pick heroes before the opponent.`,
        `**Last Pick** lets you counter-pick after the opponent reveals.`,
      ].join("\n"),
      color: chosenSide === "radiant" ? RADIANT_COLOR : DIRE_COLOR,
      footer: { text: `Any player on ${loserName} can click below.` },
    }],
    components: [{
      type: 1,
      components: [
        { type: 2, style: 1, label: "First Pick",  custom_id: `dota_toss_pick:${tournamentId}:${matchId}:first` },
        { type: 2, style: 2, label: "Last Pick",   custom_id: `dota_toss_pick:${tournamentId}:${matchId}:last` },
      ],
    }],
  };
}

function buildCompleteEmbed(args: { winnerName: string; loserName: string; radiantName: string; direName: string; firstPickName: string; lastPickName: string }) {
  const { winnerName, loserName, radiantName, direName, firstPickName, lastPickName } = args;
  return {
    embeds: [{
      title: `🏁 Toss complete`,
      description: [
        `**Radiant ⚔️** ${radiantName}`,
        `**Dire 🔥** ${direName}`,
        ``,
        `**First Pick:** ${firstPickName}`,
        `**Last Pick:** ${lastPickName}`,
        ``,
        `Lobby will be created with these settings.`,
      ].join("\n"),
      color: RADIANT_COLOR,
      footer: { text: `${winnerName} chose side · ${loserName} chose pick order` },
    }],
    components: [],
  };
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  try { await verifyAdmin({ adminKey: body.adminKey, authToken: body.authToken }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  const action = String(body.action || "");
  const tournamentId = String(body.tournamentId || "");
  const matchId = String(body.matchId || "");
  const tournamentCollection = String(body.tournamentCollection || "tournaments");

  if (!tournamentId || !matchId) return NextResponse.json({ error: "tournamentId and matchId required" }, { status: 400 });

  const matchRef = adminDb.collection(tournamentCollection).doc(tournamentId).collection("matches").doc(matchId);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) return NextResponse.json({ error: "match not found" }, { status: 404 });
  const match = matchSnap.data() as any;
  const tournSnap = await adminDb.collection(tournamentCollection).doc(tournamentId).get();
  const tournament = tournSnap.data() as any;
  const channelId: string | undefined = tournament?.discordChannelId || tournament?.testDiscordChannelId;

  // ── action: start ─────────────────────────────────────────────────────────
  if (action === "start") {
    if (match.vetoState && match.vetoState.status && match.vetoState.status !== "completed") {
      return NextResponse.json({ error: `toss already in progress: ${match.vetoState.status}` }, { status: 400 });
    }
    const tossWinner: Team = Math.random() < 0.5 ? "team1" : "team2";
    const tossLoser: Team = rivalOf(tossWinner);
    const winnerName = teamName(match, tossWinner);
    const loserName = teamName(match, tossLoser);
    const gameLabel = `${match.team1Name} vs ${match.team2Name}`;

    let messageId: string | null = null;
    if (channelId) {
      messageId = await postDiscordMessage(channelId, buildStartEmbed({ tournamentId, matchId, winnerName, loserName, gameLabel }));
    }
    const vetoState = {
      status: "toss_started",
      tossWinner,
      tossLoser,
      startedAt: new Date().toISOString(),
      messageId,
      team1Name: match.team1Name,
      team2Name: match.team2Name,
    };
    await matchRef.set({ vetoState }, { merge: true });
    return NextResponse.json({ ok: true, vetoState });
  }

  // ── action: side_choice (winner picks Radiant / Dire) ─────────────────────
  if (action === "side_choice") {
    const sidePick = String(body.side || "").toLowerCase();
    if (sidePick !== "radiant" && sidePick !== "dire") {
      return NextResponse.json({ error: "side must be radiant or dire" }, { status: 400 });
    }
    const cur = match.vetoState;
    if (!cur || cur.status !== "toss_started") {
      return NextResponse.json({ error: "toss not in toss_started state" }, { status: 400 });
    }
    const radiantTeam: Team = sidePick === "radiant" ? cur.tossWinner : cur.tossLoser;
    const direTeam: Team = rivalOf(radiantTeam);
    const winnerName = teamName(match, cur.tossWinner);
    const loserName = teamName(match, cur.tossLoser);

    if (channelId && cur.messageId) {
      await editDiscordMessage(channelId, cur.messageId, buildPickPromptEmbed({
        tournamentId, matchId, winnerName, loserName, chosenSide: sidePick as "radiant" | "dire",
      }));
    }
    const vetoState = {
      ...cur,
      status: "side_chosen",
      sideChosenSide: sidePick,
      radiantTeam,
      direTeam,
      sideChosenAt: new Date().toISOString(),
    };
    await matchRef.set({ vetoState }, { merge: true });
    return NextResponse.json({ ok: true, vetoState });
  }

  // ── action: pick_choice (loser picks First / Last) ────────────────────────
  if (action === "pick_choice") {
    const pickOrder = String(body.pick || "").toLowerCase();
    if (pickOrder !== "first" && pickOrder !== "last") {
      return NextResponse.json({ error: "pick must be first or last" }, { status: 400 });
    }
    const cur = match.vetoState;
    if (!cur || cur.status !== "side_chosen") {
      return NextResponse.json({ error: "toss not in side_chosen state" }, { status: 400 });
    }
    const firstPickTeam: Team = pickOrder === "first" ? cur.tossLoser : cur.tossWinner;
    const lastPickTeam: Team = rivalOf(firstPickTeam);
    const cmPick = computeCmPick({ radiantTeam: cur.radiantTeam, firstPickTeam });
    const winnerName = teamName(match, cur.tossWinner);
    const loserName = teamName(match, cur.tossLoser);
    const radiantName = teamName(match, cur.radiantTeam);
    const direName = teamName(match, cur.direTeam);
    const firstPickName = teamName(match, firstPickTeam);
    const lastPickName = teamName(match, lastPickTeam);

    if (channelId && cur.messageId) {
      await editDiscordMessage(channelId, cur.messageId, buildCompleteEmbed({
        winnerName, loserName, radiantName, direName, firstPickName, lastPickName,
      }));
    }
    const vetoState = {
      ...cur,
      status: "completed",
      pickOrderChoice: pickOrder,
      firstPickTeam,
      lastPickTeam,
      cmPick,
      completedAt: new Date().toISOString(),
    };
    await matchRef.set({ vetoState }, { merge: true });
    return NextResponse.json({ ok: true, vetoState });
  }

  // ── action: reset (clear vetoState so admin can restart) ──────────────────
  if (action === "reset") {
    await matchRef.set({ vetoState: null }, { merge: true });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: `unknown action "${action}"` }, { status: 400 });
}
