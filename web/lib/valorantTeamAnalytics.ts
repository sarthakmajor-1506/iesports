/**
 * Valorant team analytics: pure functions that turn raw match docs into
 * team-level, map-level, side-level, and player-level insights, plus
 * matchup advice for an upcoming opponent.
 *
 * Inputs come from Firestore (caller's responsibility to fetch). Outputs
 * are plain JSON-serialisable objects suitable for the API to return and
 * the page to render.
 */

export type SideLabel = "Red" | "Blue" | "Attack" | "Defense";
export type ResultLabel = "W" | "L" | "D";

export interface TeamMemberLite {
  uid: string;
  riotGameName: string;
  riotTagLine: string;
  riotAvatar?: string;
  riotRank?: string;
  riotTier?: number;
  iesportsRating?: number;
  skillLevel?: number;
  riotPuuid?: string;
}

export interface TeamDocLite {
  id: string;
  teamName: string;
  teamLogo?: string;
  members?: TeamMemberLite[];
  avgSkillLevel?: number;
}

export interface StandingEntry {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  mapsWon: number;
  mapsLost: number;
  roundsWon: number;
  roundsLost: number;
  buchholz?: number;
}

export interface PlayerStatLine {
  puuid: string;
  name: string;
  tag: string;
  agent: string;
  team: string;
  teamId: string;
  tournamentTeam: "team1" | "team2";
  kills: number;
  deaths: number;
  assists: number;
  score: number;
  headshots: number;
  bodyshots: number;
  legshots: number;
  damageDealt: number;
  damageReceived: number;
  firstKills: number;
  firstDeaths: number;
}

export interface GameDoc {
  mapName: string;
  team1RoundsWon: number;
  team2RoundsWon: number;
  team1ValorantSide?: SideLabel;
  roundResults?: Array<{ round?: number; winTeam?: string; winner?: "team1" | "team2" | string; endType?: string }>;
  playerStats?: PlayerStatLine[];
  winner?: string;
  status?: string;
}

export interface MatchDoc {
  id: string;
  tournamentId?: string;
  team1Id: string;
  team2Id: string;
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
  status: "pending" | "live" | "completed" | string;
  matchDay?: number;
  matchIndex?: number;
  isBracket?: boolean;
  scheduledTime?: string;
  completedAt?: string;
  game1?: GameDoc;
  game2?: GameDoc;
  game3?: GameDoc;
}

export interface MapStat {
  map: string;
  played: number;
  wins: number;
  losses: number;
  roundsWon: number;
  roundsLost: number;
  roundDiff: number;
  attackRoundsWon: number;
  attackRoundsLost: number;
  defenseRoundsWon: number;
  defenseRoundsLost: number;
}

export interface SideStat {
  roundsPlayed: number;
  roundsWon: number;
  winRate: number;
}

export interface HalfStat {
  half: 1 | 2;
  roundsWon: number;
  roundsLost: number;
  diff: number;
}

export interface PistolStat {
  played: number;
  won: number;
  winRate: number;
}

export interface OpeningDuelStat {
  firstKills: number;
  firstDeaths: number;
  duelsPlayed: number;
  firstKillRate: number;
  firstDeathRate: number;
  openingWinRate: number;
}

export interface PlayerAggregate {
  uid?: string;
  puuid: string;
  name: string;
  tag: string;
  riotAvatar?: string;
  riotRank?: string;
  iesportsRating?: number;
  gamesPlayed: number;
  roundsPlayed: number;
  kills: number;
  deaths: number;
  assists: number;
  kd: number;
  kdaSum: string;
  acs: number;
  headshotPct: number;
  damagePerRound: number;
  firstKills: number;
  firstDeaths: number;
  firstKillRate: number;
  firstDeathRate: number;
  agentsPlayed: Array<{ agent: string; games: number }>;
  topAgent: string;
  consistency: number;
  acsByGame: number[];
  isCoreSquad: boolean;
}

export interface Insight {
  id: string;
  kind: "strength" | "weakness" | "trend" | "neutral";
  headline: string;
  detail: string;
  metric?: string;
}

export interface MatchHistoryEntry {
  matchId: string;
  matchDay?: number;
  scheduledTime?: string;
  completedAt?: string;
  opponentId: string;
  opponentName: string;
  result: ResultLabel;
  team1Score: number;
  team2Score: number;
  myScore: number;
  oppScore: number;
  games: Array<{ map: string; roundsWon: number; roundsLost: number; result: ResultLabel }>;
}

export interface MatchupAdvice {
  opponent: { teamId: string; teamName: string; logo?: string };
  scheduledTime?: string;
  matchDay?: number;
  myForm: ResultLabel[];
  oppForm: ResultLabel[];
  mapPicks: Array<{ map: string; recommendation: "ban" | "pick" | "neutral"; reason: string }>;
  keyMatchups: Array<{ description: string; data: string }>;
  tactical: Array<{ headline: string; detail: string }>;
  oppStrengths: string[];
  oppWeaknesses: string[];
}

export interface TeamAnalytics {
  team: { id: string; name: string; logo?: string; members: TeamMemberLite[]; avgSkillLevel?: number };
  standing: StandingEntry | null;
  form: { recent: ResultLabel[]; streak: { type: ResultLabel; count: number } | null };
  mapStats: MapStat[];
  sideStats: { attack: SideStat; defense: SideStat };
  rounds: { pistol: PistolStat; halves: { firstHalf: HalfStat; secondHalf: HalfStat } };
  openingDuels: OpeningDuelStat;
  players: PlayerAggregate[];
  insights: Insight[];
  matchHistory: MatchHistoryEntry[];
  upcomingMatch: MatchupAdvice | null;
  tournamentBaseline: { avgACS: number; avgKD: number; avgRoundDiff: number };
}

const SIDE_FLIP: Record<string, SideLabel> = { Attack: "Defense", Defense: "Attack", Red: "Blue", Blue: "Red" };

function gamesOf(m: MatchDoc): GameDoc[] {
  const out: GameDoc[] = [];
  if (m.game1) out.push(m.game1);
  if (m.game2) out.push(m.game2);
  if (m.game3) out.push(m.game3);
  return out;
}

function isCompleted(m: MatchDoc): boolean {
  return m.status === "completed";
}

function involvesTeam(m: MatchDoc, teamId: string): boolean {
  return m.team1Id === teamId || m.team2Id === teamId;
}

function perspective(m: MatchDoc, teamId: string): { mine: 1 | 2; myScore: number; oppScore: number; opponentId: string; opponentName: string } {
  const mine = m.team1Id === teamId ? 1 : 2;
  return {
    mine,
    myScore: mine === 1 ? m.team1Score : m.team2Score,
    oppScore: mine === 1 ? m.team2Score : m.team1Score,
    opponentId: mine === 1 ? m.team2Id : m.team1Id,
    opponentName: mine === 1 ? m.team2Name : m.team1Name,
  };
}

function resultOf(myScore: number, oppScore: number): ResultLabel {
  if (myScore > oppScore) return "W";
  if (myScore < oppScore) return "L";
  return "D";
}

function gameSideForTeam(g: GameDoc, mine: 1 | 2): SideLabel | null {
  if (!g.team1ValorantSide) return null;
  if (mine === 1) return g.team1ValorantSide;
  const s = g.team1ValorantSide;
  return SIDE_FLIP[s] || (s === "Red" ? "Blue" : s === "Blue" ? "Red" : null);
}

function gameScoreForTeam(g: GameDoc, mine: 1 | 2): { won: number; lost: number } {
  return mine === 1
    ? { won: g.team1RoundsWon ?? 0, lost: g.team2RoundsWon ?? 0 }
    : { won: g.team2RoundsWon ?? 0, lost: g.team1RoundsWon ?? 0 };
}

function safeDiv(n: number, d: number, fb: number = 0): number {
  return d > 0 ? n / d : fb;
}

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

export function computeMapStats(matches: MatchDoc[], teamId: string): MapStat[] {
  const acc: Record<string, MapStat> = {};
  for (const m of matches) {
    if (!isCompleted(m) || !involvesTeam(m, teamId)) continue;
    const { mine } = perspective(m, teamId);
    for (const g of gamesOf(m)) {
      if (!g.mapName) continue;
      const map = g.mapName;
      if (!acc[map]) {
        acc[map] = { map, played: 0, wins: 0, losses: 0, roundsWon: 0, roundsLost: 0, roundDiff: 0, attackRoundsWon: 0, attackRoundsLost: 0, defenseRoundsWon: 0, defenseRoundsLost: 0 };
      }
      const s = gameScoreForTeam(g, mine);
      acc[map].played++;
      acc[map].roundsWon += s.won;
      acc[map].roundsLost += s.lost;
      if (s.won > s.lost) acc[map].wins++;
      else if (s.won < s.lost) acc[map].losses++;
      const side = gameSideForTeam(g, mine);
      if (side === "Attack") {
        const half = halfRoundCounts(g, mine, "first");
        acc[map].attackRoundsWon += half.won;
        acc[map].attackRoundsLost += half.lost;
        const second = halfRoundCounts(g, mine, "second");
        acc[map].defenseRoundsWon += second.won;
        acc[map].defenseRoundsLost += second.lost;
      } else if (side === "Defense") {
        const half = halfRoundCounts(g, mine, "first");
        acc[map].defenseRoundsWon += half.won;
        acc[map].defenseRoundsLost += half.lost;
        const second = halfRoundCounts(g, mine, "second");
        acc[map].attackRoundsWon += second.won;
        acc[map].attackRoundsLost += second.lost;
      }
    }
  }
  for (const k of Object.keys(acc)) acc[k].roundDiff = acc[k].roundsWon - acc[k].roundsLost;
  return Object.values(acc).sort((a, b) => b.played - a.played || b.roundDiff - a.roundDiff);
}

function roundWinnerForTeam(r: any, mine: 1 | 2): "won" | "lost" | null {
  if (!r) return null;
  const myKey = mine === 1 ? "team1" : "team2";
  const oppKey = mine === 1 ? "team2" : "team1";
  if (r.winner === myKey) return "won";
  if (r.winner === oppKey) return "lost";
  return null;
}

function halfRoundCounts(g: GameDoc, mine: 1 | 2, which: "first" | "second"): { won: number; lost: number } {
  const rr = g.roundResults || [];
  if (!rr.length) {
    const s = gameScoreForTeam(g, mine);
    if (which === "first") return { won: Math.min(s.won, 12), lost: Math.min(s.lost, 12) };
    return { won: Math.max(0, s.won - 12), lost: Math.max(0, s.lost - 12) };
  }
  let won = 0, lost = 0;
  const startIdx = which === "first" ? 0 : 12;
  const endIdx = which === "first" ? Math.min(12, rr.length) : rr.length;
  for (let i = startIdx; i < endIdx; i++) {
    const res = roundWinnerForTeam(rr[i], mine);
    if (res === "won") won++;
    else if (res === "lost") lost++;
  }
  return { won, lost };
}

export function computeSideStats(matches: MatchDoc[], teamId: string): { attack: SideStat; defense: SideStat } {
  // We label "attack" and "defense" purely as first-half-as-starting-side vs
  // second-half-as-flipped-side. Without a per-map attacker-color mapping we
  // can't compute true attack/defense splits across maps, so this stays as a
  // proxy for "side A consistency vs side B consistency" per starting half.
  let fP = 0, fW = 0, sP = 0, sW = 0;
  for (const m of matches) {
    if (!isCompleted(m) || !involvesTeam(m, teamId)) continue;
    const { mine } = perspective(m, teamId);
    for (const g of gamesOf(m)) {
      const first = halfRoundCounts(g, mine, "first");
      const second = halfRoundCounts(g, mine, "second");
      fP += first.won + first.lost; fW += first.won;
      sP += second.won + second.lost; sW += second.won;
    }
  }
  return {
    attack: { roundsPlayed: fP, roundsWon: fW, winRate: pct(fW, fP) },
    defense: { roundsPlayed: sP, roundsWon: sW, winRate: pct(sW, sP) },
  };
}

export function computePistolAndHalves(matches: MatchDoc[], teamId: string): { pistol: PistolStat; halves: { firstHalf: HalfStat; secondHalf: HalfStat } } {
  let pP = 0, pW = 0;
  let fW = 0, fL = 0, sW = 0, sL = 0;
  for (const m of matches) {
    if (!isCompleted(m) || !involvesTeam(m, teamId)) continue;
    const { mine } = perspective(m, teamId);
    for (const g of gamesOf(m)) {
      const rr = g.roundResults || [];
      const r0 = roundWinnerForTeam(rr[0], mine);
      if (r0) { pP++; if (r0 === "won") pW++; }
      const r12 = rr.length >= 13 ? roundWinnerForTeam(rr[12], mine) : null;
      if (r12) { pP++; if (r12 === "won") pW++; }
      const first = halfRoundCounts(g, mine, "first");
      const second = halfRoundCounts(g, mine, "second");
      fW += first.won; fL += first.lost; sW += second.won; sL += second.lost;
    }
  }
  return {
    pistol: { played: pP, won: pW, winRate: pct(pW, pP) },
    halves: {
      firstHalf: { half: 1, roundsWon: fW, roundsLost: fL, diff: fW - fL },
      secondHalf: { half: 2, roundsWon: sW, roundsLost: sL, diff: sW - sL },
    },
  };
}

export function computeOpeningDuels(matches: MatchDoc[], teamId: string): OpeningDuelStat {
  let fk = 0, fd = 0, rounds = 0;
  for (const m of matches) {
    if (!isCompleted(m) || !involvesTeam(m, teamId)) continue;
    for (const g of gamesOf(m)) {
      rounds += (g.team1RoundsWon || 0) + (g.team2RoundsWon || 0);
      for (const p of g.playerStats || []) {
        if (p.teamId === teamId) {
          fk += p.firstKills || 0;
          fd += p.firstDeaths || 0;
        }
      }
    }
  }
  return {
    firstKills: fk,
    firstDeaths: fd,
    duelsPlayed: rounds,
    firstKillRate: pct(fk, rounds),
    firstDeathRate: pct(fd, rounds),
    openingWinRate: fk + fd > 0 ? pct(fk, fk + fd) : 0,
  };
}

export function computeForm(matches: MatchDoc[], teamId: string, limit: number = 5): { recent: ResultLabel[]; streak: { type: ResultLabel; count: number } | null } {
  const finished = matches
    .filter(m => isCompleted(m) && involvesTeam(m, teamId))
    .sort((a, b) => String(b.completedAt || b.scheduledTime || "").localeCompare(String(a.completedAt || a.scheduledTime || "")));
  const recent: ResultLabel[] = [];
  for (const m of finished.slice(0, limit)) {
    const p = perspective(m, teamId);
    recent.push(resultOf(p.myScore, p.oppScore));
  }
  let streak: { type: ResultLabel; count: number } | null = null;
  if (recent.length) {
    const top = recent[0];
    let count = 0;
    for (const r of recent) { if (r === top) count++; else break; }
    streak = { type: top, count };
  }
  return { recent, streak };
}

export function computePlayers(matches: MatchDoc[], team: TeamDocLite): PlayerAggregate[] {
  const memberByPuuid: Record<string, TeamMemberLite> = {};
  const coreSquadPuuids = new Set<string>();
  (team.members || []).forEach(mb => {
    if (mb.riotPuuid) {
      memberByPuuid[mb.riotPuuid] = mb;
      coreSquadPuuids.add(mb.riotPuuid);
    }
  });
  type Acc = { games: number; rounds: number; kills: number; deaths: number; assists: number; score: number; headshots: number; shotsTotal: number; damageDealt: number; damageReceived: number; firstKills: number; firstDeaths: number; agents: Record<string, number>; acsByGame: number[]; name: string; tag: string; puuid: string };
  const accs: Record<string, Acc> = {};
  for (const m of matches) {
    if (!isCompleted(m) || !involvesTeam(m, team.id)) continue;
    for (const g of gamesOf(m)) {
      const rounds = (g.team1RoundsWon || 0) + (g.team2RoundsWon || 0);
      for (const p of g.playerStats || []) {
        if (p.teamId !== team.id) continue;
        const key = p.puuid;
        if (!accs[key]) accs[key] = { games: 0, rounds: 0, kills: 0, deaths: 0, assists: 0, score: 0, headshots: 0, shotsTotal: 0, damageDealt: 0, damageReceived: 0, firstKills: 0, firstDeaths: 0, agents: {}, acsByGame: [], name: p.name, tag: p.tag, puuid: p.puuid };
        const a = accs[key];
        a.games++;
        a.rounds += rounds;
        a.kills += p.kills || 0;
        a.deaths += p.deaths || 0;
        a.assists += p.assists || 0;
        a.score += p.score || 0;
        a.headshots += p.headshots || 0;
        a.shotsTotal += (p.headshots || 0) + (p.bodyshots || 0) + (p.legshots || 0);
        a.damageDealt += p.damageDealt || 0;
        a.damageReceived += p.damageReceived || 0;
        a.firstKills += p.firstKills || 0;
        a.firstDeaths += p.firstDeaths || 0;
        if (p.agent) a.agents[p.agent] = (a.agents[p.agent] || 0) + 1;
        if (rounds > 0) a.acsByGame.push((p.score || 0) / rounds);
      }
    }
  }
  const players: PlayerAggregate[] = Object.values(accs).map(a => {
    const member = memberByPuuid[a.puuid];
    const agents = Object.entries(a.agents).map(([agent, games]) => ({ agent, games })).sort((x, y) => y.games - x.games);
    return {
      uid: member?.uid,
      puuid: a.puuid,
      name: a.name,
      tag: a.tag,
      riotAvatar: member?.riotAvatar,
      riotRank: member?.riotRank,
      iesportsRating: member?.iesportsRating,
      gamesPlayed: a.games,
      roundsPlayed: a.rounds,
      kills: a.kills,
      deaths: a.deaths,
      assists: a.assists,
      kd: Math.round(safeDiv(a.kills, a.deaths, a.kills) * 100) / 100,
      kdaSum: `${a.kills}/${a.deaths}/${a.assists}`,
      acs: Math.round(safeDiv(a.score, a.rounds) * 10) / 10,
      headshotPct: pct(a.headshots, a.shotsTotal),
      damagePerRound: Math.round(safeDiv(a.damageDealt, a.rounds)),
      firstKills: a.firstKills,
      firstDeaths: a.firstDeaths,
      firstKillRate: pct(a.firstKills, a.rounds),
      firstDeathRate: pct(a.firstDeaths, a.rounds),
      agentsPlayed: agents,
      topAgent: agents[0]?.agent || "",
      consistency: Math.round(stdev(a.acsByGame) * 10) / 10,
      acsByGame: a.acsByGame.map(x => Math.round(x * 10) / 10),
      isCoreSquad: coreSquadPuuids.has(a.puuid),
    };
  }).filter(p => p.isCoreSquad).sort((x, y) => y.acs - x.acs);
  return players;
}

export function computeMatchHistory(matches: MatchDoc[], teamId: string): MatchHistoryEntry[] {
  const out: MatchHistoryEntry[] = [];
  for (const m of matches) {
    if (!isCompleted(m) || !involvesTeam(m, teamId)) continue;
    const p = perspective(m, teamId);
    const games = gamesOf(m).map(g => {
      const s = gameScoreForTeam(g, p.mine);
      return { map: g.mapName, roundsWon: s.won, roundsLost: s.lost, result: resultOf(s.won, s.lost) };
    });
    out.push({
      matchId: m.id,
      matchDay: m.matchDay,
      scheduledTime: m.scheduledTime,
      completedAt: m.completedAt,
      opponentId: p.opponentId,
      opponentName: p.opponentName,
      result: resultOf(p.myScore, p.oppScore),
      team1Score: m.team1Score,
      team2Score: m.team2Score,
      myScore: p.myScore,
      oppScore: p.oppScore,
      games,
    });
  }
  return out.sort((a, b) => String(b.completedAt || b.scheduledTime || "").localeCompare(String(a.completedAt || a.scheduledTime || "")));
}

export function findUpcomingMatch(matches: MatchDoc[], teamId: string): MatchDoc | null {
  const pending = matches
    .filter(m => involvesTeam(m, teamId) && m.status !== "completed")
    .sort((a, b) => String(a.scheduledTime || "").localeCompare(String(b.scheduledTime || "")));
  return pending[0] || null;
}

export function computeTournamentBaseline(matches: MatchDoc[], standings: StandingEntry[]): { avgACS: number; avgKD: number; avgRoundDiff: number } {
  let totalScore = 0, totalRounds = 0, totalKills = 0, totalDeaths = 0;
  for (const m of matches) {
    if (!isCompleted(m)) continue;
    for (const g of gamesOf(m)) {
      const rounds = (g.team1RoundsWon || 0) + (g.team2RoundsWon || 0);
      for (const p of g.playerStats || []) {
        totalScore += p.score || 0;
        totalRounds += rounds;
        totalKills += p.kills || 0;
        totalDeaths += p.deaths || 0;
      }
    }
  }
  const totalDiff = standings.reduce((a, s) => a + ((s.roundsWon || 0) - (s.roundsLost || 0)), 0);
  return {
    avgACS: Math.round(safeDiv(totalScore, totalRounds) * 10) / 10,
    avgKD: Math.round(safeDiv(totalKills, totalDeaths) * 100) / 100,
    avgRoundDiff: standings.length ? Math.round((totalDiff / standings.length) * 10) / 10 : 0,
  };
}

export function generateTeamInsights(a: TeamAnalytics): Insight[] {
  const ins: Insight[] = [];
  const s = a.standing;
  if (a.form.streak && a.form.streak.count >= 2) {
    const isDrawStreak = a.form.streak.type === "D";
    const longDraw = isDrawStreak && a.form.streak.count >= 4;
    ins.push({
      id: "streak",
      kind: a.form.streak.type === "W" ? "strength" : a.form.streak.type === "L" ? "weakness" : longDraw ? "trend" : "neutral",
      headline: longDraw
        ? `Draw artist: ${a.form.streak.count} draws in a row`
        : `${a.form.streak.count}-match ${a.form.streak.type === "W" ? "winning" : a.form.streak.type === "L" ? "losing" : "draw"} streak`,
      detail: longDraw
        ? "Every match has gone the distance. Practice closing maps from a 12-12 position. Tiebreaker scenarios will decide your tournament."
        : `Recent form: ${a.form.recent.join(" ")}`,
    });
  }
  const sortedMaps = [...a.mapStats].sort((x, y) => (y.wins - y.losses) - (x.wins - x.losses) || y.roundDiff - x.roundDiff);
  const best = sortedMaps[0];
  const worst = sortedMaps[sortedMaps.length - 1];
  if (best && best.played > 0 && (best.wins > 0 || best.roundDiff > 0)) {
    ins.push({
      id: "best-map",
      kind: "strength",
      headline: `Strongest map: ${best.map}`,
      detail: `${best.wins}-${best.losses} record with +${Math.max(0, best.roundDiff)} round diff. Push to keep ${best.map} in your map pool.`,
    });
  }
  if (worst && worst !== best && worst.played > 0 && (worst.losses > worst.wins || worst.roundDiff < 0)) {
    ins.push({
      id: "worst-map",
      kind: "weakness",
      headline: `Weakest map: ${worst.map}`,
      detail: `${worst.wins}-${worst.losses} with ${worst.roundDiff > 0 ? "+" : ""}${worst.roundDiff} round diff. Consider banning ${worst.map} or scheduling practice scrims here.`,
    });
  }
  const side = a.sideStats;
  if (side.attack.roundsPlayed >= 6 && side.defense.roundsPlayed >= 6) {
    const diff = side.attack.winRate - side.defense.winRate;
    if (Math.abs(diff) >= 10) {
      ins.push({
        id: "side-bias",
        kind: "trend",
        headline: diff > 0 ? `Strong first half (${side.attack.winRate}% vs ${side.defense.winRate}% 2H)` : `Strong second half (${side.defense.winRate}% vs ${side.attack.winRate}% 1H)`,
        detail: diff > 0
          ? "You bank rounds early then leak after the swap. Tighten 2nd half exec calls and post-plant util. Close out maps you have already led."
          : "Slow start, strong finish. Win pistol rounds and the early bonus reads to avoid digging holes that depend on second-half heroics.",
      });
    }
  }
  const pistol = a.rounds.pistol;
  if (pistol.played >= 4) {
    if (pistol.winRate >= 65) {
      ins.push({ id: "pistol-king", kind: "strength", headline: `Pistol kings (${pistol.winRate}%)`, detail: `${pistol.won}/${pistol.played} pistol rounds won. Convert these into bonus + anti-eco wins to chain 3-round leads.` });
    } else if (pistol.winRate <= 35) {
      ins.push({ id: "pistol-weak", kind: "weakness", headline: `Pistol round struggles (${pistol.winRate}%)`, detail: `${pistol.won}/${pistol.played} pistols. Practice fixed pistol executes; you are giving away too many free anti-eco rounds.` });
    }
  }
  const halves = a.rounds.halves;
  if (halves.firstHalf.diff >= 4 && halves.secondHalf.diff <= 0 && (halves.firstHalf.roundsWon + halves.firstHalf.roundsLost) >= 12) {
    ins.push({ id: "second-half-collapse", kind: "weakness", headline: "Second-half collapse pattern", detail: `Avg first half +${halves.firstHalf.diff}, second half ${halves.secondHalf.diff}. Adjustments at the break are losing you maps you have already won.` });
  }
  if (halves.firstHalf.diff <= -2 && halves.secondHalf.diff >= 4) {
    ins.push({ id: "comeback", kind: "strength", headline: "Comeback specialists", detail: `Down ${halves.firstHalf.diff} at half but +${halves.secondHalf.diff} in the second. Strong tactical adjustments. Do not panic when behind.` });
  }
  const od = a.openingDuels;
  if (od.duelsPlayed >= 30) {
    if (od.openingWinRate >= 58) {
      ins.push({ id: "od-strong", kind: "strength", headline: `Wins opening duels ${od.openingWinRate}% of rounds`, detail: `${od.firstKills} first kills vs ${od.firstDeaths} first deaths. Aggressive entries pay off. Keep playing for first contact.` });
    } else if (od.openingWinRate <= 42) {
      ins.push({ id: "od-weak", kind: "weakness", headline: `Losing opening duels (${od.openingWinRate}%)`, detail: `Only ${od.firstKills} first kills vs ${od.firstDeaths} first deaths. Slow it down. Default for info before committing.` });
    }
  }
  const corePlayers = a.players.filter(p => p.isCoreSquad);
  const players = corePlayers.length ? corePlayers : a.players;
  if (players.length) {
    const topFragger = players[0];
    ins.push({ id: "top-fragger", kind: "strength", headline: `Top fragger: ${topFragger.name} (${topFragger.acs} ACS)`, detail: `${topFragger.kdaSum} K/D/A, ${topFragger.headshotPct}% HS. ${topFragger.topAgent ? `Plays ${topFragger.topAgent} most.` : ""} Build sets around them.` });
    const entry = [...players].sort((x, y) => y.firstKillRate - x.firstKillRate)[0];
    if (entry && entry.firstKillRate >= 8 && entry !== topFragger) {
      ins.push({ id: "entry", kind: "strength", headline: `Best entry: ${entry.name}`, detail: `Wins first contact ${entry.firstKillRate}% of rounds. Use them as the lurker-killer on site executes.` });
    }
    const consistent = [...players].filter(p => p.gamesPlayed >= 3).sort((x, y) => x.consistency - y.consistency)[0];
    if (consistent && consistent.consistency > 0) {
      ins.push({ id: "consistent", kind: "neutral", headline: `Most consistent: ${consistent.name}`, detail: `ACS standard deviation of only ${consistent.consistency}. Reliable contributor every map.` });
    }
    const inconsistent = [...players].filter(p => p.gamesPlayed >= 3).sort((x, y) => y.consistency - x.consistency)[0];
    if (inconsistent && inconsistent !== consistent && inconsistent.consistency > 60) {
      ins.push({ id: "inconsistent", kind: "weakness", headline: `Variance flag: ${inconsistent.name}`, detail: `ACS swings by ${inconsistent.consistency} across games. Coach for consistency: same util, same rotations.` });
    }
  }
  if (a.upcomingMatch) {
    const oppMapWinRates: Record<string, { wr: number; played: number }> = {};
    for (const mp of a.upcomingMatch.mapPicks || []) {}
    const oppName = a.upcomingMatch.opponent.teamName;
    const myWorst = [...a.mapStats].filter(mm => mm.played >= 2).sort((x, y) => (x.wins - x.losses) - (y.wins - y.losses) || x.roundDiff - y.roundDiff)[0];
    if (myWorst && (myWorst.wins - myWorst.losses) < 0) {
      const pickForMyWorst = (a.upcomingMatch.mapPicks || []).find(mp => mp.map === myWorst.map);
      if (pickForMyWorst && pickForMyWorst.recommendation === "ban") {
        ins.push({
          id: "crossmap-worst-opp-strong",
          kind: "weakness",
          headline: `Their best map is your worst: ${myWorst.map}`,
          detail: `You are ${myWorst.wins}-${myWorst.losses} on ${myWorst.map} with ${myWorst.roundDiff > 0 ? "+" : ""}${myWorst.roundDiff} round diff. ${oppName} thrives here. Ban first or expect to lose this map.`,
        });
      }
    }
    const myBest = [...a.mapStats].filter(mm => mm.played >= 2).sort((x, y) => (y.wins - y.losses) - (x.wins - x.losses) || y.roundDiff - x.roundDiff)[0];
    if (myBest && (myBest.wins - myBest.losses) > 0) {
      const pickForMyBest = (a.upcomingMatch.mapPicks || []).find(mp => mp.map === myBest.map);
      if (pickForMyBest && pickForMyBest.recommendation === "pick") {
        ins.push({
          id: "crossmap-best-opp-weak",
          kind: "strength",
          headline: `Your best map ${myBest.map} is also their worst`,
          detail: `You are ${myBest.wins}-${myBest.losses} here. ${oppName} struggles. Force ${myBest.map} into the veto pool no matter what.`,
        });
      }
    }
  }
  if (s && a.tournamentBaseline.avgRoundDiff !== 0) {
    const myDiff = s.roundsWon - s.roundsLost;
    const delta = myDiff - a.tournamentBaseline.avgRoundDiff;
    if (Math.abs(delta) >= 10) {
      ins.push({
        id: "vs-field",
        kind: delta > 0 ? "strength" : "weakness",
        headline: delta > 0 ? `Above tournament average by ${Math.round(delta)} rounds` : `${Math.round(delta)} rounds below tournament average`,
        detail: `Your round diff is ${myDiff > 0 ? "+" : ""}${myDiff}, field averages ${a.tournamentBaseline.avgRoundDiff > 0 ? "+" : ""}${a.tournamentBaseline.avgRoundDiff}.`,
      });
    }
  }
  return ins;
}

export function generateMatchupAdvice(mine: TeamAnalytics, opp: TeamAnalytics, upcoming: MatchDoc, oppMeta: { logo?: string }): MatchupAdvice {
  const mapPicks: MatchupAdvice["mapPicks"] = [];
  const allMaps = new Set([...mine.mapStats.map(m => m.map), ...opp.mapStats.map(m => m.map)]);
  for (const map of allMaps) {
    const my = mine.mapStats.find(x => x.map === map);
    const their = opp.mapStats.find(x => x.map === map);
    const myWinRate = my && my.played > 0 ? pct(my.wins, my.played) : null;
    const theirWinRate = their && their.played > 0 ? pct(their.wins, their.played) : null;
    if (myWinRate != null && theirWinRate != null) {
      const delta = myWinRate - theirWinRate;
      if (delta >= 30) mapPicks.push({ map, recommendation: "pick", reason: `You: ${myWinRate}% win rate. Them: ${theirWinRate}%. Force this map in veto.` });
      else if (delta <= -30) mapPicks.push({ map, recommendation: "ban", reason: `They are ${theirWinRate}% here, you only ${myWinRate}%. Ban first.` });
    } else if (theirWinRate != null && theirWinRate >= 75 && (their?.played || 0) >= 2) {
      mapPicks.push({ map, recommendation: "ban", reason: `Opponent is ${theirWinRate}% on ${map} (${their?.wins}-${their?.losses}). Ban first.` });
    } else if (myWinRate != null && myWinRate >= 75 && (my?.played || 0) >= 2) {
      mapPicks.push({ map, recommendation: "pick", reason: `You are ${myWinRate}% on ${map} (${my?.wins}-${my?.losses}). Pick in veto.` });
    }
  }

  const keyMatchups: MatchupAdvice["keyMatchups"] = [];
  if (mine.players[0] && opp.players[0]) {
    const myTop = mine.players[0];
    const oppTop = opp.players[0];
    keyMatchups.push({
      description: `${myTop.name} (your top fragger) vs ${oppTop.name}`,
      data: `${myTop.acs} ACS / ${myTop.kd} K/D vs ${oppTop.acs} ACS / ${oppTop.kd} K/D. Match-up to watch.`,
    });
  }
  const theirWeakest = opp.players.filter(p => p.gamesPlayed >= 2).sort((a, b) => a.acs - b.acs)[0];
  if (theirWeakest && opp.players.length > 1) {
    keyMatchups.push({
      description: `Target their weak link: ${theirWeakest.name}`,
      data: `${theirWeakest.acs} ACS, ${theirWeakest.kd} K/D, ${theirWeakest.firstDeathRate}% first-death rate. Pressure them on entry.`,
    });
  }
  const theirBestEntry = [...opp.players].sort((a, b) => b.firstKillRate - a.firstKillRate)[0];
  if (theirBestEntry && theirBestEntry.firstKillRate >= 8) {
    keyMatchups.push({
      description: `Watch their entry: ${theirBestEntry.name}`,
      data: `Wins first contact ${theirBestEntry.firstKillRate}% of rounds. Trade aggressively, do not let them snowball off opening picks.`,
    });
  }

  const tactical: MatchupAdvice["tactical"] = [];
  if (opp.rounds.pistol.played >= 4 && opp.rounds.pistol.winRate >= 65) {
    tactical.push({ headline: "Pistol round prep is critical", detail: `Opponent wins ${opp.rounds.pistol.winRate}% of pistols. A loss snowballs into 3 free rounds for them. Drill your pistol exec this week.` });
  }
  if (opp.sideStats.attack.winRate - opp.sideStats.defense.winRate >= 15) {
    tactical.push({ headline: "Steal their attack-side rhythm", detail: `They win ${opp.sideStats.attack.winRate}% of attack rounds vs only ${opp.sideStats.defense.winRate}% on defense. Pick the side that forces them into defense first if you can.` });
  }
  if (opp.rounds.halves.firstHalf.diff <= -2 && opp.rounds.halves.secondHalf.diff >= 4) {
    tactical.push({ headline: "Close it out", detail: "Opponent is a comeback team (avg -2 first half, +4 second half). Do not relax at the break, they tactically adjust hard." });
  }
  if (opp.openingDuels.openingWinRate >= 58) {
    tactical.push({ headline: "Trade-focused defense", detail: `They win ${opp.openingDuels.openingWinRate}% of opening duels. Set every site with a trade-ready angle so first contact doesn't become a 4v5.` });
  }
  if (mine.form.streak && mine.form.streak.type === "L" && mine.form.streak.count >= 2) {
    tactical.push({ headline: "Reset mentality", detail: `${mine.form.streak.count}-game losing streak. Strip the playbook back to 2-3 reliable executes this match. Confidence first, creativity later.` });
  }

  const oppStrengths: string[] = [];
  const oppWeaknesses: string[] = [];
  for (const i of generateTeamInsights(opp)) {
    if (i.kind === "strength") oppStrengths.push(i.headline);
    if (i.kind === "weakness") oppWeaknesses.push(i.headline);
  }

  const oppForm = opp.form.recent;
  const myForm = mine.form.recent;

  return {
    opponent: { teamId: opp.team.id, teamName: opp.team.name, logo: oppMeta.logo },
    scheduledTime: upcoming.scheduledTime,
    matchDay: upcoming.matchDay,
    myForm,
    oppForm,
    mapPicks: mapPicks.slice(0, 5),
    keyMatchups,
    tactical,
    oppStrengths: oppStrengths.slice(0, 4),
    oppWeaknesses: oppWeaknesses.slice(0, 4),
  };
}

export function computeTeamAnalytics(
  team: TeamDocLite,
  standing: StandingEntry | null,
  matches: MatchDoc[],
  allStandings: StandingEntry[]
): TeamAnalytics {
  const form = computeForm(matches, team.id);
  const mapStats = computeMapStats(matches, team.id);
  const sideStats = computeSideStats(matches, team.id);
  const rounds = computePistolAndHalves(matches, team.id);
  const openingDuels = computeOpeningDuels(matches, team.id);
  const players = computePlayers(matches, team);
  const matchHistory = computeMatchHistory(matches, team.id);
  const tournamentBaseline = computeTournamentBaseline(matches, allStandings);
  const base: TeamAnalytics = {
    team: { id: team.id, name: team.teamName, logo: team.teamLogo, members: team.members || [], avgSkillLevel: team.avgSkillLevel },
    standing,
    form,
    mapStats,
    sideStats,
    rounds,
    openingDuels,
    players,
    insights: [],
    matchHistory,
    upcomingMatch: null,
    tournamentBaseline,
  };
  base.insights = generateTeamInsights(base);
  return base;
}
