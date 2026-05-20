/**
 * One-off inspection script — does NOT touch the live match doc.
 *
 * For the Ascension match between Muthmantralaya and Temporary Peacekeepers:
 *   1. Pulls game1/game2 valorantMatchIds from Firestore (read-only).
 *   2. Refetches each game from Henrik directly.
 *   3. Walks round.player_stats to find Marfor's best round by score.
 *   4. Writes the analysis to `debugAnalysis/{id}` (side collection) — never
 *      mutates the match doc.
 */
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();
const TID = "league-of-rising-stars-ascension";
const TEAM_FRAGMENTS: [string, string] = ["mantralaya", "temporary"]; // case-insensitive substrings
const PLAYER_NAME = "marfor"; // case-insensitive

type RoundAnalysis = {
  round: number;
  kills: number;
  damage: number;
  score: number;
  headshots: number;
  firstKill: boolean;
  firstDeath: boolean;
  roundWon: boolean | null;
};

function extractRps(round: any, puuid: string): any {
  const arr = round.player_stats || round.playerStats || round.stats || [];
  if (!Array.isArray(arr)) return null;
  return arr.find(
    (x: any) =>
      (x.player?.puuid || x.puuid || x.player_puuid || "") === puuid,
  );
}

async function fetchHenrik(valorantMatchId: string, region: string, key: string) {
  const v4Url = `https://api.henrikdev.xyz/valorant/v4/match/${region}/${valorantMatchId}`;
  const v4Res = await fetch(v4Url, { headers: { Authorization: key } });
  if (v4Res.ok) {
    const j: any = await v4Res.json();
    return { data: j.data, apiVersion: "v4" as const };
  }
  const v2Url = `https://api.henrikdev.xyz/valorant/v2/match/${valorantMatchId}`;
  const v2Res = await fetch(v2Url, { headers: { Authorization: key } });
  if (!v2Res.ok) {
    throw new Error(`Henrik failed: v4=${v4Res.status}, v2=${v2Res.status}`);
  }
  const j: any = await v2Res.json();
  return { data: j.data, apiVersion: "v2" as const };
}

async function run() {
  const henrikKey = process.env.HENRIK_API_KEY;
  if (!henrikKey) throw new Error("HENRIK_API_KEY missing from .env.local");

  // ── 1. Find the match doc ──────────────────────────────────────────────
  const matchesSnap = await db
    .collection("valorantTournaments")
    .doc(TID)
    .collection("matches")
    .get();

  const candidates = matchesSnap.docs.filter((d) => {
    const m = d.data();
    const t1 = (m.team1Name || "").toLowerCase();
    const t2 = (m.team2Name || "").toLowerCase();
    const [a, b] = TEAM_FRAGMENTS;
    return (
      (t1.includes(a) && t2.includes(b)) ||
      (t1.includes(b) && t2.includes(a))
    );
  });

  if (candidates.length === 0) {
    console.log("No match found matching the team fragments. Available matches:");
    for (const d of matchesSnap.docs) {
      const m = d.data();
      console.log(`  ${d.id}: ${m.team1Name} vs ${m.team2Name} [${m.status}]`);
    }
    process.exit(1);
  }

  // Pick most recently completed
  candidates.sort((a, b) => {
    const ta = a.data().completedAt || a.data().startedAt || "";
    const tb = b.data().completedAt || b.data().startedAt || "";
    return String(tb).localeCompare(String(ta));
  });
  const matchDoc = candidates[0];
  const m = matchDoc.data();
  console.log(
    `Match found: ${m.team1Name} vs ${m.team2Name}  (doc=${matchDoc.id}, status=${m.status})`,
  );

  const region = m.region || "ap";

  const games: { label: string; vMatchId: string | null }[] = [
    {
      label: "Game 1",
      vMatchId:
        m.game1?.valorantMatchId ||
        m.games?.game1?.valorantMatchId ||
        m.game1MatchId ||
        null,
    },
    {
      label: "Game 2",
      vMatchId:
        m.game2?.valorantMatchId ||
        m.games?.game2?.valorantMatchId ||
        m.game2MatchId ||
        null,
    },
  ];

  const report: Record<string, any> = {
    tournamentId: TID,
    matchDocId: matchDoc.id,
    team1Name: m.team1Name,
    team2Name: m.team2Name,
    playerSearched: PLAYER_NAME,
    fetchedAt: new Date().toISOString(),
    games: {},
  };

  for (const g of games) {
    console.log(`\n=== ${g.label} ===`);
    if (!g.vMatchId) {
      console.log("  No valorantMatchId stored for this game — skipping.");
      report.games[g.label] = { error: "no valorantMatchId" };
      continue;
    }
    console.log(`  valorantMatchId: ${g.vMatchId}`);

    let fetched;
    try {
      fetched = await fetchHenrik(g.vMatchId, region, henrikKey);
    } catch (e: any) {
      console.log(`  Henrik fetch failed: ${e.message}`);
      report.games[g.label] = { error: e.message, valorantMatchId: g.vMatchId };
      continue;
    }
    const { data: md, apiVersion } = fetched;
    console.log(
      `  apiVersion=${apiVersion}  map=${md.metadata?.map?.name || md.metadata?.map}  rounds=${(md.rounds || []).length}`,
    );

    // Find Marfor — search by name (case-insensitive)
    const players =
      apiVersion === "v4" ? md.players || [] : md.players?.all_players || [];
    const marfor = players.find(
      (p: any) => (p.name || "").toLowerCase() === PLAYER_NAME,
    );
    if (!marfor) {
      const names = players.map((p: any) => `${p.name}#${p.tag}`).join(", ");
      console.log(`  Marfor not found. Players in match: ${names}`);
      report.games[g.label] = {
        error: "Marfor not found",
        valorantMatchId: g.vMatchId,
        playersInMatch: names,
      };
      continue;
    }
    console.log(`  Marfor puuid: ${marfor.puuid}  team=${marfor.team_id || marfor.team}`);
    const marforPuuid = marfor.puuid;
    const marforTeamSide = (marfor.team_id || marfor.team || "").toLowerCase();

    // Walk rounds
    const rounds = md.rounds || [];
    const roundScores: RoundAnalysis[] = [];
    for (let i = 0; i < rounds.length; i++) {
      const r = rounds[i];
      const ps = extractRps(r, marforPuuid);
      if (!ps) continue;

      const kills =
        typeof ps.stats?.kills === "number"
          ? ps.stats.kills
          : Array.isArray(ps.kills)
            ? ps.kills.length
            : typeof ps.kills === "number"
              ? ps.kills
              : 0;
      let damage: number =
        ps.damage?.dealt ??
        ps.damage?.made ??
        (typeof ps.damage === "number" ? ps.damage : 0);
      if (!damage && Array.isArray(ps.damage_events)) {
        damage = ps.damage_events.reduce(
          (s: number, d: any) => s + (d.damage || 0),
          0,
        );
      }

      const winTeamRaw = r.winning_team || r.winningTeam || r.result || "";
      const winTeam = typeof winTeamRaw === "string" ? winTeamRaw.toLowerCase() : "";
      const roundWon =
        winTeam && marforTeamSide
          ? winTeam.includes("red")
            ? marforTeamSide.includes("red")
            : winTeam.includes("blue")
              ? marforTeamSide.includes("blue")
              : null
          : null;

      roundScores.push({
        round: i + 1,
        kills,
        damage: damage || 0,
        score: ps.stats?.score ?? ps.score ?? 0,
        headshots: ps.stats?.headshots ?? ps.damage?.headshots ?? ps.headshots ?? 0,
        firstKill: !!(ps.was_first_kill || ps.first_kill),
        firstDeath: !!(ps.was_first_death || ps.first_death),
        roundWon,
      });
    }

    if (roundScores.length === 0) {
      console.log("  No per-round data found for Marfor.");
      report.games[g.label] = {
        error: "no per-round data",
        valorantMatchId: g.vMatchId,
      };
      continue;
    }

    const best = [...roundScores].sort(
      (a, b) =>
        b.score - a.score ||
        b.kills - a.kills ||
        b.damage - a.damage,
    )[0];

    console.log(`  ▶ Best round: R${best.round} (score=${best.score}, kills=${best.kills}, dmg=${best.damage}, fk=${best.firstKill}, fd=${best.firstDeath}, ${best.roundWon ? "won" : "lost"})`);
    console.log(`  All rounds:`);
    for (const r of roundScores) {
      console.log(
        `    R${String(r.round).padStart(2)}: K=${r.kills} DMG=${r.damage} SC=${r.score} ${r.firstKill ? "FK " : ""}${r.firstDeath ? "FD " : ""}${r.roundWon === true ? "W" : r.roundWon === false ? "L" : "-"}`,
      );
    }

    report.games[g.label] = {
      valorantMatchId: g.vMatchId,
      apiVersion,
      map: md.metadata?.map?.name || md.metadata?.map,
      marforPuuid,
      marforTeamSide,
      bestRound: best,
      allRounds: roundScores,
    };
  }

  // ── Write to side collection (NOT the match doc) ──────────────────────
  const sideDocId = `marfor-best-round_${TID}_${matchDoc.id}_${Date.now()}`;
  await db.collection("debugAnalysis").doc(sideDocId).set(report);
  console.log(`\nWrote analysis to debugAnalysis/${sideDocId}`);

  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
