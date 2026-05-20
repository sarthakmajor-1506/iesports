/**
 * Phase 2: pull per-round data from Henrik for GPS32's 6 games and score
 * every round he played. Outputs ranked candidates with full breakdown so
 * you can review and finalize the top 18.
 *
 * Cache shape:
 *   media/ascension-reels/cache/tournaments/{tid}/rounds.json
 *     { games: [{matchDocId, gameNum, valorantMatchId, rounds: [...]}], scoredFor: { gps32: [...]} }
 *
 * Run: npx tsx scripts/gps32MvpReelPhase2.ts
 */
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: ".env.local" });
const HENRIK = process.env.HENRIK_API_KEY!;
if (!HENRIK) throw new Error("HENRIK_API_KEY missing");

const TID = "league-of-rising-stars-ascension";
const CACHE_ROOT = path.resolve(__dirname, "../../media/ascension-reels/cache");
const TOURN_DIR = path.join(CACHE_ROOT, "tournaments", TID);

type RoundLine = {
  matchDocId: string;
  gameNum: number;
  valorantMatchId: string;
  map: string;
  opponent: string;
  roundNum: number;          // 1-indexed
  totalRounds: number;
  isDecider: boolean;
  isFirstHalfEnd: boolean;
  team1RoundsWonAtEnd: number;
  team2RoundsWonAtEnd: number;
  chootSide: "team1" | "team2";
  chootWonRound: boolean;
  // GPS32-specific
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  score: number;
  headshots: number;
  firstKill: boolean;
  firstDeath: boolean;
  was1vNclutch: boolean;
  killCount: 0 | 1 | 2 | 3 | 4 | 5;
  // round meta
  endType: string;          // "Bomb defused", "Eliminated", etc.
  // computed
  viralScore: number;
  scoreBreakdown: Record<string, number>;
};

async function fetchHenrikMatch(matchId: string): Promise<any> {
  const cacheDir = path.join(TOURN_DIR, "henrik");
  fs.mkdirSync(cacheDir, { recursive: true });
  const cacheFile = path.join(cacheDir, `${matchId}.json`);
  if (fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
  }
  const url = `https://api.henrikdev.xyz/valorant/v4/match/ap/${matchId}`;
  const res = await fetch(url, { headers: { Authorization: HENRIK } });
  if (!res.ok) throw new Error(`Henrik v4 ${res.status} for ${matchId}: ${await res.text()}`);
  const data = (await res.json()).data;
  fs.writeFileSync(cacheFile, JSON.stringify(data));
  return data;
}

function scoreRound(r: RoundLine): { score: number; breakdown: Record<string, number> } {
  const b: Record<string, number> = {};
  // Multikill bonuses (replace simple kills*3 with curve)
  if (r.killCount === 5) b["ace_5k"] = 18;
  else if (r.killCount === 4) b["quad_4k"] = 10;
  else if (r.killCount === 3) b["triple_3k"] = 6;
  else if (r.killCount === 2) b["double_2k"] = 3;
  else if (r.killCount === 1) b["single_1k"] = 1;
  // base kill weight on top
  b["kills_x3"] = r.kills * 3;
  if (r.was1vNclutch) b["clutch"] = 8;
  if (r.isDecider) b["decider"] = 4;
  if (r.firstKill) b["first_kill"] = 1;
  if (r.damage > 200) b["high_damage_>200"] = 1;
  if (r.chootWonRound) b["round_won"] = 2;
  // Penalize feeding without value
  if (r.kills === 0 && r.deaths > 0) b["zero_k_penalty"] = -2;
  const score = Object.values(b).reduce((a, x) => a + x, 0);
  return { score, breakdown: b };
}

async function main() {
  const playerCache = JSON.parse(fs.readFileSync(path.join(TOURN_DIR, "players", "gps32.json"), "utf-8"));
  const puuid = playerCache.puuid;
  const allRounds: RoundLine[] = [];
  console.log(`Pulling per-round data from Henrik for ${playerCache.games.length} games...\n`);

  for (const g of playerCache.games) {
    const md = await fetchHenrikMatch(g.valorantMatchId);
    // v4 shape: md.metadata, md.players (array), md.teams (array), md.rounds (array)
    const rounds = md.rounds || [];
    const players = md.players || [];
    const teams = md.teams || [];
    const totalRounds = rounds.length;

    // Determine which Valorant side (Red/Blue) is choot
    const myPlayer = players.find((p: any) => p.puuid === puuid);
    if (!myPlayer) { console.error(`  ⚠ ${g.valorantMatchId}: GPS32 (puuid ${puuid}) not in players`); continue; }
    const chootValSide = (myPlayer.team_id || myPlayer.team || "").toLowerCase().includes("red") ? "Red" : "Blue";

    console.log(`  ${g.matchDocId} g${g.gameNum} ${g.map} (${md.metadata?.match_id || g.valorantMatchId}) — ${rounds.length} rounds, choot=${chootValSide}, agent=${myPlayer.agent?.name || "?"}`);

    for (let i = 0; i < rounds.length; i++) {
      const r = rounds[i];
      const roundNum = i + 1;

      // Determine winning side of round
      const winningTeam = (r.winning_team || r.winningTeam || "").toLowerCase().includes("red") ? "Red" : "Blue";
      const chootWonRound = winningTeam === chootValSide;

      // Per-round player stats — Henrik v4 path
      const ps = (r.stats || r.player_stats || []).find((s: any) => (s.player?.puuid || s.puuid) === puuid);
      const kills = ps?.stats?.kills ?? (Array.isArray(ps?.kill_events) ? ps.kill_events.length : 0);
      const damage =
        ps?.damage_events?.reduce((s: number, d: any) => s + (d.damage || 0), 0) ??
        ps?.damage?.dealt ?? 0;
      const score = ps?.stats?.score ?? 0;
      const headshots = ps?.stats?.headshots ?? 0;
      const assists = ps?.stats?.assists ?? 0;
      const deaths = ps?.stats?.deaths ?? 0;

      // First kill / first death
      const firstKill = !!(ps?.was_first_kill || ps?.first_kill);
      const firstDeath = !!(ps?.was_first_death || ps?.first_death);

      // 1vN clutch detection — heuristic: if kills >= 2 in last alive moments + round won
      // We'll do a more accurate pass later via kill timestamps if needed.
      // For now, mark as clutch if: chootWonRound AND (kills >= 3 OR (kills >= 2 AND firstKill === false))
      const was1vNclutch = chootWonRound && kills >= 3;

      // Decider: last round of game
      const isDecider = roundNum === totalRounds;
      const isFirstHalfEnd = roundNum === 12; // standard half marker

      // Running team scores at end of this round — sum prior rounds
      const team1RoundsWonAtEnd = rounds.slice(0, i + 1)
        .filter((rr: any) => ((rr.winning_team || rr.winningTeam || "").toLowerCase().includes(g.chootSide === "team1" ? chootValSide.toLowerCase() : (chootValSide === "Red" ? "blue" : "red")))).length;
      const team2RoundsWonAtEnd = (i + 1) - team1RoundsWonAtEnd;

      const line: RoundLine = {
        matchDocId: g.matchDocId,
        gameNum: g.gameNum,
        valorantMatchId: g.valorantMatchId,
        map: g.map,
        opponent: g.opponent,
        roundNum,
        totalRounds,
        isDecider,
        isFirstHalfEnd,
        team1RoundsWonAtEnd,
        team2RoundsWonAtEnd,
        chootSide: g.chootSide,
        chootWonRound,
        kills,
        deaths,
        assists,
        damage,
        score,
        headshots,
        firstKill,
        firstDeath,
        was1vNclutch,
        killCount: Math.min(kills, 5) as any,
        endType: r.end_type || r.endType || "",
        viralScore: 0,
        scoreBreakdown: {},
      };
      const sc = scoreRound(line);
      line.viralScore = sc.score;
      line.scoreBreakdown = sc.breakdown;
      allRounds.push(line);
    }
  }

  // Sort + write candidates
  allRounds.sort((a, b) => b.viralScore - a.viralScore);

  const outPath = path.join(TOURN_DIR, "gps32-rounds-scored.json");
  fs.writeFileSync(outPath, JSON.stringify({
    puuid, totalRounds: allRounds.length, scoredAt: new Date().toISOString(), rounds: allRounds,
  }, null, 2));

  console.log(`\n=== Top 25 rounds by viral score ===\n`);
  console.log("rank | match            | g | round | map     | vs               | K-D-A | dmg  | won | flags                      | score | breakdown");
  console.log("-----+------------------+---+-------+---------+------------------+-------+------+-----+----------------------------+-------+--------------------");
  for (let i = 0; i < Math.min(25, allRounds.length); i++) {
    const r = allRounds[i];
    const flags: string[] = [];
    if (r.killCount === 5) flags.push("ACE");
    else if (r.killCount === 4) flags.push("4K");
    else if (r.killCount === 3) flags.push("3K");
    if (r.was1vNclutch) flags.push("CLUTCH");
    if (r.isDecider) flags.push("DECIDER");
    if (r.firstKill) flags.push("1stK");
    const won = r.chootWonRound ? "W" : "L";
    console.log(
      `${String(i + 1).padStart(4)} | ${r.matchDocId.padEnd(16)} | ${r.gameNum} | ${String(r.roundNum).padStart(5)} | ${r.map.padEnd(7)} | ${r.opponent.slice(0, 16).padEnd(16)} | ${r.kills}-${r.deaths}-${r.assists} | ${String(r.damage).padStart(4)} | ${won}   | ${flags.join(",").padEnd(26)} | ${String(r.viralScore).padStart(5)} | ${Object.entries(r.scoreBreakdown).map(([k, v]) => `${k}=${v}`).join(" ")}`
    );
  }

  console.log(`\nFull data: ${outPath}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
