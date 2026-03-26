"use client";

import { useMemo } from "react";

/**
 * Double Elimination Bracket — Light Theme
 *
 * Dynamically adjusts bracket structure based on team count:
 *   2 teams → Grand Final only
 *   3 teams → UB Final + LB Final + Grand Final (LB gets bye)
 *   4 teams → Full 4-team double elim
 *   5-6 teams → 8-team with byes
 *   7-8 teams → Full 8-team double elim
 *
 * Naming: "Upper Bracket" / "Lower Bracket"
 * Seeding: Top 50% standings → Upper, Bottom 50% → Lower
 */

interface BracketMatch {
  id: string;
  bracketType: "winners" | "losers" | "grand_final";
  bracketRound: number;
  bracketLabel: string;
  matchIndex: number;
  team1?: TeamSlot;
  team2?: TeamSlot;
  team1Id: string;
  team2Id: string;
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
  status: string;
  winnerGoesTo?: string;
  loserGoesTo?: string;
}

interface TeamSlot {
  teamId: string;
  teamName: string;
  seed: number;
  members: any[];
}

interface StandingEntry {
  id: string;
  teamName: string;
  teamId?: string;
  points: number;
  [key: string]: any;
}

interface Props {
  matches: BracketMatch[];
  bracketSize: number;
  standings?: StandingEntry[];
}

// ── Layout constants ──────────────────────────────────────────────────────────
const MATCH_W = 300;
const MATCH_H = 78;
const COL_GAP = 70;
const ROW_GAP = 28;
const SECTION_GAP = 56;
const PAD = 30;

// ── Theme colors (light, matching app) ────────────────────────────────────────
const C = {
  bg: "#F8F7F4",
  cardBg: "#FFFFFF",
  cardBorder: "#E5E3DF",
  cardBorderHover: "#D5D3CF",
  divider: "#F2F1EE",
  text: "#111111",
  textSec: "#666666",
  textMuted: "#999999",
  textPlaceholder: "#CCCCCC",
  accent: "#ff4655",
  accentLight: "#fff0f1",
  accentBorder: "#fecdd3",
  win: "#16a34a",
  winBg: "#f0fdf4",
  winBorder: "#bbf7d0",
  loss: "#dc2626",
  lossBg: "#fef2f2",
  live: "#f59e0b",
  liveBg: "#fffbeb",
  blue: "#3b82f6",
  connector: "#D5D3CF",
  connectorDotUpper: "#3b82f6",
  connectorDotLower: "#ff4655",
  seedBg: "#eff6ff",
  seedText: "#3b82f6",
  seedBorder: "#bfdbfe",
  byeBg: "#F8F7F4",
  byeText: "#CCCCCC",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function getTeamInitials(name: string): string {
  if (!name || name === "TBD" || name === "BYE") return name === "BYE" ? "—" : "?";
  const clean = name.replace(/\[.*?\]\s*/, "");
  return clean.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 3);
}

const TBD_TEAM: TeamSlot = { teamId: "TBD", teamName: "TBD", seed: 0, members: [] };
const BYE_TEAM: TeamSlot = { teamId: "BYE", teamName: "BYE", seed: 0, members: [] };

function makePlaceholder(
  id: string,
  matchNum: number,
  t1: TeamSlot = TBD_TEAM,
  t2: TeamSlot = TBD_TEAM
): BracketMatch {
  return {
    id,
    bracketType: "winners",
    bracketRound: 1,
    bracketLabel: id,
    matchIndex: matchNum,
    team1: t1,
    team2: t2,
    team1Id: t1.teamId,
    team2Id: t2.teamId,
    team1Name: t1.teamName,
    team2Name: t2.teamName,
    team1Score: 0,
    team2Score: 0,
    status: "pending",
  };
}

// ── SVG Match Card (light theme) ──────────────────────────────────────────────
function MatchCard({ match, x, y }: { match: BracketMatch; x: number; y: number }) {
  const isComplete = match.status === "completed";
  const isLive = match.status === "live";
  const t1Won = isComplete && match.team1Score > match.team2Score;
  const t2Won = isComplete && match.team2Score > match.team1Score;

  const t1 = match.team1 || { teamId: match.team1Id, teamName: match.team1Name, seed: 0, members: [] };
  const t2 = match.team2 || { teamId: match.team2Id, teamName: match.team2Name, seed: 0, members: [] };

  const borderColor = isLive ? C.live : isComplete ? C.winBorder : C.cardBorder;

  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Shadow */}
      <rect width={MATCH_W} height={MATCH_H} rx={10} ry={10} fill="rgba(0,0,0,0.03)" x={1} y={2} />
      {/* Card */}
      <rect width={MATCH_W} height={MATCH_H} rx={10} ry={10} fill={C.cardBg} stroke={borderColor} strokeWidth={1.2} />

      {/* Match label */}
      <text x={8} y={-5} fill={C.textMuted} fontSize={9.5} fontWeight={700} fontFamily="system-ui">
        M{match.matchIndex}
      </text>
      {/* Format badge */}
      <rect x={28} y={-15} width={26} height={13} rx={3} fill={C.accentLight} stroke={C.accentBorder} strokeWidth={0.5} />
      <text x={41} y={-5} fill={C.accent} fontSize={7.5} fontWeight={800} textAnchor="middle" fontFamily="system-ui">BO1</text>

      {/* Status badge top-right */}
      {isComplete && (
        <>
          <rect x={MATCH_W - 48} y={-15} width={48} height={13} rx={3} fill={C.winBg} stroke={C.winBorder} strokeWidth={0.5} />
          <text x={MATCH_W - 24} y={-5} fill={C.win} fontSize={7.5} fontWeight={700} textAnchor="middle" fontFamily="system-ui">✓ Played</text>
        </>
      )}
      {isLive && (
        <>
          <rect x={MATCH_W - 36} y={-15} width={36} height={13} rx={3} fill={C.liveBg} stroke={C.live} strokeWidth={0.5} />
          <text x={MATCH_W - 18} y={-5} fill={C.live} fontSize={7.5} fontWeight={700} textAnchor="middle" fontFamily="system-ui">● LIVE</text>
        </>
      )}

      {/* Team 1 */}
      <TeamRow team={t1} score={match.team1Score} isWinner={t1Won} isLoser={t2Won} isComplete={isComplete} y={3} matchId={match.id} rowIdx={0} />

      {/* Divider */}
      <line x1={6} y1={MATCH_H / 2} x2={MATCH_W - 6} y2={MATCH_H / 2} stroke={C.divider} strokeWidth={1} />

      {/* Team 2 */}
      <TeamRow team={t2} score={match.team2Score} isWinner={t2Won} isLoser={t1Won} isComplete={isComplete} y={MATCH_H / 2 + 2} matchId={match.id} rowIdx={1} />
    </g>
  );
}

function TeamRow({ team, score, isWinner, isLoser, isComplete, y, matchId, rowIdx }: {
  team: TeamSlot; score: number; isWinner: boolean; isLoser: boolean;
  isComplete: boolean; y: number; matchId: string; rowIdx: number;
}) {
  const isTBD = team.teamId === "TBD";
  const isBye = team.teamId === "BYE";
  const isEmpty = isTBD || isBye;
  const rowH = MATCH_H / 2 - 4;
  const members = (team.members || []).slice(0, 5);
  const initials = getTeamInitials(team.teamName);

  let nameColor = isEmpty ? C.textPlaceholder : C.text;
  if (isWinner) nameColor = C.win;
  if (isLoser) nameColor = C.textMuted;

  let logoBg = isEmpty ? C.divider : C.accentLight;
  let logoColor = isEmpty ? C.textPlaceholder : C.accent;
  let logoBorder = isEmpty ? C.cardBorder : C.accentBorder;

  return (
    <g transform={`translate(0, ${y})`}>
      {/* Winner highlight bar */}
      {isWinner && <rect x={2} y={0} width={MATCH_W - 4} height={rowH} rx={6} fill={C.winBg} />}

      {/* Logo */}
      <rect x={8} y={3} width={26} height={26} rx={6} fill={logoBg} stroke={logoBorder} strokeWidth={0.5} />
      <text x={21} y={21} fill={logoColor} fontSize={9.5} fontWeight={800} textAnchor="middle" fontFamily="system-ui">
        {initials}
      </text>

      {/* Seed badge */}
      {team.seed > 0 && (
        <>
          <rect x={39} y={3} width={18} height={11} rx={3} fill={C.seedBg} stroke={C.seedBorder} strokeWidth={0.5} />
          <text x={48} y={11} fill={C.seedText} fontSize={7.5} fontWeight={700} textAnchor="middle" fontFamily="system-ui">#{team.seed}</text>
        </>
      )}

      {/* Team name */}
      <text x={team.seed > 0 ? 62 : 40} y={isBye ? 20 : 13} fill={nameColor} fontSize={11.5}
        fontWeight={isWinner ? 800 : isEmpty ? 500 : 600} fontFamily="system-ui"
        fontStyle={isBye ? "italic" : "normal"}>
        {isBye ? "BYE" : isTBD ? "TBD" : (team.teamName.length > 20 ? team.teamName.slice(0, 18) + "…" : team.teamName)}
      </text>

      {/* Player avatars */}
      {!isEmpty && members.length > 0 && (
        <g transform={`translate(40, 17)`}>
          {members.map((m: any, i: number) => (
            <g key={m.uid || i} transform={`translate(${i * 14}, 0)`}>
              {m.riotAvatar ? (
                <>
                  <clipPath id={`av-${matchId}-${rowIdx}-${i}`}>
                    <circle cx={6} cy={6} r={6} />
                  </clipPath>
                  <image href={m.riotAvatar} x={0} y={0} width={12} height={12}
                    clipPath={`url(#av-${matchId}-${rowIdx}-${i})`} preserveAspectRatio="xMidYMid slice" />
                  <circle cx={6} cy={6} r={6} fill="none" stroke={C.cardBg} strokeWidth={1} />
                </>
              ) : (
                <>
                  <circle cx={6} cy={6} r={6} fill={C.divider} />
                  <text x={6} y={9} fill={C.textMuted} fontSize={6.5} fontWeight={700} textAnchor="middle" fontFamily="system-ui">
                    {(m.riotGameName || "?")[0]}
                  </text>
                </>
              )}
            </g>
          ))}
        </g>
      )}

      {/* Score */}
      {!isBye && (
        <>
          <rect x={MATCH_W - 30} y={3} width={22} height={26} rx={5}
            fill={isWinner ? C.winBg : isComplete ? C.lossBg : C.bg}
            stroke={isWinner ? C.winBorder : isComplete ? "#fecaca" : C.cardBorder} strokeWidth={0.5} />
          <text x={MATCH_W - 19} y={21} fill={isWinner ? C.win : isComplete ? (isLoser ? C.loss : C.textMuted) : C.textPlaceholder}
            fontSize={12} fontWeight={800} textAnchor="middle" fontFamily="system-ui">
            {isComplete ? score : "–"}
          </text>
        </>
      )}
    </g>
  );
}

// ── Connector helpers ─────────────────────────────────────────────────────────
function Connector({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const midX = (x1 + x2) / 2;
  return <path d={`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`} fill="none" stroke={C.connector} strokeWidth={1.5} />;
}

function CDot({ x, y, lower = false }: { x: number; y: number; lower?: boolean }) {
  return <circle cx={x} cy={y} r={3} fill={lower ? C.connectorDotLower : C.connectorDotUpper} />;
}

function SectionLine({ x1, x2, y, label, color }: { x1: number; x2: number; y: number; label: string; color: string }) {
  return (
    <>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={color + "44"} strokeWidth={1} strokeDasharray="6 4" />
      <text x={x1} y={y - 8} fill={color} fontSize={11} fontWeight={800} letterSpacing="0.1em" fontFamily="system-ui">{label}</text>
    </>
  );
}

function ColHeader({ x, y, text: t, accent = false }: { x: number; y: number; text: string; accent?: boolean }) {
  return <text x={x} y={y} fill={accent ? C.live : C.textMuted} fontSize={10} fontWeight={800} textAnchor="middle" letterSpacing="0.1em" fontFamily="system-ui">{t}</text>;
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function DoubleBracket({ matches, bracketSize, standings = [] }: Props) {
  const matchMap = useMemo(() => {
    const m: Record<string, BracketMatch> = {};
    matches.forEach(match => { m[match.id] = match; });
    return m;
  }, [matches]);

  // Get sorted teams from standings for seeding
  const seededTeams = useMemo(() => {
    return standings.map((s, i) => ({
      teamId: s.id || s.teamId || s.teamName,
      teamName: s.teamName,
      seed: i + 1,
      members: [],
    } as TeamSlot));
  }, [standings]);

  const teamCount = seededTeams.length || bracketSize;

  // Determine effective bracket type
  if (teamCount <= 2) return <Bracket2 matchMap={matchMap} teams={seededTeams} hasMatches={matches.length > 0} />;
  if (teamCount === 3) return <Bracket3 matchMap={matchMap} teams={seededTeams} hasMatches={matches.length > 0} />;
  if (teamCount <= 4) return <Bracket4 matchMap={matchMap} teams={seededTeams} hasMatches={matches.length > 0} />;
  return <Bracket8 matchMap={matchMap} teams={seededTeams} hasMatches={matches.length > 0} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WRAPPER
// ═══════════════════════════════════════════════════════════════════════════════
function BracketWrapper({ children, width, height, teamCount }: { children: React.ReactNode; width: number; height: number; teamCount: number }) {
  return (
    <div style={{
      overflowX: "auto",
      background: C.bg,
      borderRadius: 16,
      border: `1px solid ${C.cardBorder}`,
      padding: "16px 0 20px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", gap: 16, padding: "0 24px 12px", fontFamily: "system-ui", alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.82rem", fontWeight: 800, color: C.win, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          ↗ Upper Bracket
        </span>
        <span style={{ fontSize: "0.68rem", color: C.textMuted }}>
          {teamCount} teams · Double Elimination
        </span>
      </div>
      <svg width={width} height={height} style={{ display: "block", fontFamily: "system-ui, sans-serif" }}>
        {children}
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2-TEAM: Just Grand Final
// ═══════════════════════════════════════════════════════════════════════════════
function Bracket2({ matchMap, teams, hasMatches }: { matchMap: Record<string, BracketMatch>; teams: TeamSlot[]; hasMatches: boolean }) {
  const gf = { x: PAD, y: PAD + 30 };
  const totalW = PAD + MATCH_W + PAD;
  const totalH = gf.y + MATCH_H + PAD + 20;

  const t1 = teams[0] || TBD_TEAM;
  const t2 = teams[1] || TBD_TEAM;
  const match = hasMatches ? (matchMap["grand-final"] || makePlaceholder("grand-final", 1, t1, t2)) : makePlaceholder("grand-final", 1, t1, t2);

  return (
    <BracketWrapper width={totalW} height={totalH} teamCount={teams.length}>
      <ColHeader x={gf.x + MATCH_W / 2} y={PAD} text="GRAND FINAL" accent />
      <MatchCard match={match} x={gf.x} y={gf.y} />
    </BracketWrapper>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3-TEAM: UB Final (#1 vs #2) → LB Final (UB loser vs #3) → Grand Final
// ═══════════════════════════════════════════════════════════════════════════════
function Bracket3({ matchMap, teams, hasMatches }: { matchMap: Record<string, BracketMatch>; teams: TeamSlot[]; hasMatches: boolean }) {
  const colX = (col: number) => PAD + col * (MATCH_W + COL_GAP);

  const ubFinal = { x: colX(0), y: PAD + 30 };
  const losersY = ubFinal.y + MATCH_H + SECTION_GAP + 30;
  const lbFinal = { x: colX(0), y: losersY };
  const gfY = ubFinal.y + (losersY - ubFinal.y) / 2;
  const gf = { x: colX(1), y: gfY };

  const totalW = colX(2);
  const totalH = losersY + MATCH_H + PAD + 20;

  const t1 = teams[0] || TBD_TEAM;
  const t2 = teams[1] || TBD_TEAM;
  const t3 = teams[2] || TBD_TEAM;

  const getM = (id: string, num: number, a: TeamSlot, b: TeamSlot) =>
    hasMatches ? (matchMap[id] || makePlaceholder(id, num, a, b)) : makePlaceholder(id, num, a, b);

  const mUBF = getM("wb-final", 1, t1, t2);
  const mLBF = getM("lb-final", 2, TBD_TEAM, { ...t3, teamName: t3.teamName }); // UB loser vs #3
  const mGF = getM("grand-final", 3, TBD_TEAM, TBD_TEAM);

  return (
    <BracketWrapper width={totalW} height={totalH} teamCount={3}>
      <ColHeader x={ubFinal.x + MATCH_W / 2} y={PAD} text="UPPER BRACKET FINAL" />
      <ColHeader x={gf.x + MATCH_W / 2} y={PAD} text="GRAND FINAL" accent />

      {/* UB Final → GF */}
      <Connector x1={ubFinal.x + MATCH_W} y1={ubFinal.y + MATCH_H / 2} x2={gf.x} y2={gf.y + MATCH_H / 4} />
      <CDot x={ubFinal.x + MATCH_W} y={ubFinal.y + MATCH_H / 2} />

      {/* LB section */}
      <SectionLine x1={PAD} x2={totalW - PAD} y={losersY - 30} label="↘ LOWER BRACKET" color={C.accent} />
      <ColHeader x={lbFinal.x + MATCH_W / 2} y={losersY - 14} text="LOWER BRACKET FINAL" />

      {/* LB Final → GF */}
      <Connector x1={lbFinal.x + MATCH_W} y1={lbFinal.y + MATCH_H / 2} x2={gf.x} y2={gf.y + 3 * MATCH_H / 4} />
      <CDot x={lbFinal.x + MATCH_W} y={lbFinal.y + MATCH_H / 2} lower />

      {/* UB Final → LB Final (loser drops) */}
      <Connector x1={ubFinal.x + MATCH_W / 2} y1={ubFinal.y + MATCH_H} x2={lbFinal.x + MATCH_W / 4} y2={lbFinal.y} />
      <CDot x={ubFinal.x + MATCH_W / 2} y={ubFinal.y + MATCH_H} lower />

      {/* Cards */}
      <MatchCard match={mUBF} x={ubFinal.x} y={ubFinal.y} />
      <MatchCard match={mLBF} x={lbFinal.x} y={lbFinal.y} />
      <MatchCard match={mGF} x={gf.x} y={gf.y} />

      {/* Seed #3 bye annotation */}
      <text x={lbFinal.x + MATCH_W + 10} y={lbFinal.y + MATCH_H / 2 + 4}
        fill={C.textMuted} fontSize={9} fontFamily="system-ui" fontStyle="italic">
        #3 seed gets lower bracket bye
      </text>
    </BracketWrapper>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4-TEAM BRACKET
// ═══════════════════════════════════════════════════════════════════════════════
function Bracket4({ matchMap, teams, hasMatches }: { matchMap: Record<string, BracketMatch>; teams: TeamSlot[]; hasMatches: boolean }) {
  const colX = (col: number) => PAD + col * (MATCH_W + COL_GAP);

  const ubS1 = { x: colX(0), y: PAD + 30 };
  const ubS2 = { x: colX(0), y: ubS1.y + MATCH_H + ROW_GAP };
  const ubF = { x: colX(1), y: ubS1.y + (MATCH_H + ROW_GAP) / 2 };

  const losersY = ubS2.y + MATCH_H + SECTION_GAP + 30;
  const lbR1 = { x: colX(0), y: losersY };
  const lbF = { x: colX(1), y: losersY };

  const gfY = ubF.y + (losersY - ubF.y) / 2;
  const gf = { x: colX(2), y: gfY };

  const totalW = colX(3);
  const totalH = losersY + MATCH_H + PAD + 20;

  const t = (i: number) => teams[i] || TBD_TEAM;
  const getM = (id: string, num: number, a: TeamSlot, b: TeamSlot) =>
    hasMatches ? (matchMap[id] || makePlaceholder(id, num, a, b)) : makePlaceholder(id, num, a, b);

  // Seeding: #1 vs #4, #2 vs #3
  const mS1 = getM("wb-semi-m1", 1, t(0), t(3));
  const mS2 = getM("wb-semi-m2", 2, t(1), t(2));
  const mUBF = getM("wb-final", 3, TBD_TEAM, TBD_TEAM);
  const mLBR1 = getM("lb-r1-m1", 4, TBD_TEAM, TBD_TEAM);
  const mLBF = getM("lb-final", 5, TBD_TEAM, TBD_TEAM);
  const mGF = getM("grand-final", 6, TBD_TEAM, TBD_TEAM);

  return (
    <BracketWrapper width={totalW} height={totalH} teamCount={teams.length || 4}>
      <ColHeader x={ubS1.x + MATCH_W / 2} y={PAD} text="UPPER SEMI" />
      <ColHeader x={ubF.x + MATCH_W / 2} y={PAD} text="UPPER FINAL" />
      <ColHeader x={gf.x + MATCH_W / 2} y={PAD} text="GRAND FINAL" accent />

      {/* UB Semi → UB Final */}
      <Connector x1={ubS1.x + MATCH_W} y1={ubS1.y + MATCH_H / 2} x2={ubF.x} y2={ubF.y + MATCH_H / 4} />
      <Connector x1={ubS2.x + MATCH_W} y1={ubS2.y + MATCH_H / 2} x2={ubF.x} y2={ubF.y + 3 * MATCH_H / 4} />
      <CDot x={ubS1.x + MATCH_W} y={ubS1.y + MATCH_H / 2} />
      <CDot x={ubS2.x + MATCH_W} y={ubS2.y + MATCH_H / 2} />

      {/* UB Final → GF */}
      <Connector x1={ubF.x + MATCH_W} y1={ubF.y + MATCH_H / 2} x2={gf.x} y2={gf.y + MATCH_H / 4} />
      <CDot x={ubF.x + MATCH_W} y={ubF.y + MATCH_H / 2} />

      {/* Lower bracket */}
      <SectionLine x1={PAD} x2={totalW - PAD} y={losersY - 30} label="↘ LOWER BRACKET" color={C.accent} />
      <ColHeader x={lbR1.x + MATCH_W / 2} y={losersY - 14} text="LOWER R1" />
      <ColHeader x={lbF.x + MATCH_W / 2} y={losersY - 14} text="LOWER FINAL" />

      {/* LB R1 → LB Final */}
      <Connector x1={lbR1.x + MATCH_W} y1={lbR1.y + MATCH_H / 2} x2={lbF.x} y2={lbF.y + 3 * MATCH_H / 4} />
      <CDot x={lbR1.x + MATCH_W} y={lbR1.y + MATCH_H / 2} lower />

      {/* LB Final → GF */}
      <Connector x1={lbF.x + MATCH_W} y1={lbF.y + MATCH_H / 2} x2={gf.x} y2={gf.y + 3 * MATCH_H / 4} />
      <CDot x={lbF.x + MATCH_W} y={lbF.y + MATCH_H / 2} lower />

      {/* Cards */}
      <MatchCard match={mS1} x={ubS1.x} y={ubS1.y} />
      <MatchCard match={mS2} x={ubS2.x} y={ubS2.y} />
      <MatchCard match={mUBF} x={ubF.x} y={ubF.y} />
      <MatchCard match={mLBR1} x={lbR1.x} y={lbR1.y} />
      <MatchCard match={mLBF} x={lbF.x} y={lbF.y} />
      <MatchCard match={mGF} x={gf.x} y={gf.y} />
    </BracketWrapper>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8-TEAM BRACKET (5-8 teams, with byes for < 8)
// ═══════════════════════════════════════════════════════════════════════════════
function Bracket8({ matchMap, teams, hasMatches }: { matchMap: Record<string, BracketMatch>; teams: TeamSlot[]; hasMatches: boolean }) {
  const colX = (col: number) => PAD + col * (MATCH_W + COL_GAP);

  const wr1Y = (i: number) => PAD + 30 + i * (MATCH_H + ROW_GAP);
  const wSemiY = (i: number) => wr1Y(i * 2) + (MATCH_H + ROW_GAP) / 2;
  const wFinalY = wSemiY(0) + (wSemiY(1) - wSemiY(0)) / 2;

  const wr1 = [0, 1, 2, 3].map(i => ({ x: colX(0), y: wr1Y(i) }));
  const wSemi = [0, 1].map(i => ({ x: colX(1), y: wSemiY(i) }));
  const wFinal = { x: colX(2), y: wFinalY };

  const losersBaseY = wr1[3].y + MATCH_H + SECTION_GAP + 30;
  const lr1 = [0, 1].map(i => ({ x: colX(0), y: losersBaseY + i * (MATCH_H + ROW_GAP) }));
  const lr2 = [0, 1].map(i => ({ x: colX(1), y: losersBaseY + i * (MATCH_H + ROW_GAP) }));
  const lSemi = { x: colX(2), y: losersBaseY + (MATCH_H + ROW_GAP) / 2 };
  const lFinal = { x: colX(3), y: lSemi.y };

  const gfY = wFinal.y + (lFinal.y - wFinal.y) / 2;
  const gf = { x: colX(3) + MATCH_W / 2, y: gfY };

  const totalW = gf.x + MATCH_W + PAD;
  const totalH = lr2[1].y + MATCH_H + PAD + 20;

  const t = (i: number) => (i < teams.length) ? teams[i] : BYE_TEAM;
  const getM = (id: string, num: number, a: TeamSlot, b: TeamSlot) =>
    hasMatches ? (matchMap[id] || makePlaceholder(id, num, a, b)) : makePlaceholder(id, num, a, b);

  // Standard seeding: 1v8, 4v5, 2v7, 3v6
  const mR1 = [
    getM("wb-r1-m1", 1, t(0), t(7)),
    getM("wb-r1-m2", 2, t(3), t(4)),
    getM("wb-r1-m3", 3, t(1), t(6)),
    getM("wb-r1-m4", 4, t(2), t(5)),
  ];

  let mNum = 5;
  const mWS1 = getM("wb-semi-m1", mNum++, TBD_TEAM, TBD_TEAM);
  const mWS2 = getM("wb-semi-m2", mNum++, TBD_TEAM, TBD_TEAM);
  const mWF = getM("wb-final", mNum++, TBD_TEAM, TBD_TEAM);
  const mLR1_1 = getM("lb-r1-m1", mNum++, TBD_TEAM, TBD_TEAM);
  const mLR1_2 = getM("lb-r1-m2", mNum++, TBD_TEAM, TBD_TEAM);
  const mLR2_1 = getM("lb-r2-m1", mNum++, TBD_TEAM, TBD_TEAM);
  const mLR2_2 = getM("lb-r2-m2", mNum++, TBD_TEAM, TBD_TEAM);
  const mLS = getM("lb-semi", mNum++, TBD_TEAM, TBD_TEAM);
  const mLF = getM("lb-final", mNum++, TBD_TEAM, TBD_TEAM);
  const mGF = getM("grand-final", mNum++, TBD_TEAM, TBD_TEAM);

  return (
    <BracketWrapper width={totalW} height={totalH} teamCount={teams.length || 8}>
      <ColHeader x={colX(0) + MATCH_W / 2} y={PAD} text="UPPER R1" />
      <ColHeader x={colX(1) + MATCH_W / 2} y={PAD} text="UPPER SEMI" />
      <ColHeader x={colX(2) + MATCH_W / 2} y={PAD} text="UPPER FINAL" />
      <ColHeader x={gf.x + MATCH_W / 2} y={PAD} text="GRAND FINAL" accent />

      {/* UB R1 → Semi connectors */}
      {[0, 1].map(i => (
        <g key={`wr1-ws-${i}`}>
          <Connector x1={wr1[i * 2].x + MATCH_W} y1={wr1[i * 2].y + MATCH_H / 2} x2={wSemi[i].x} y2={wSemi[i].y + MATCH_H / 4} />
          <Connector x1={wr1[i * 2 + 1].x + MATCH_W} y1={wr1[i * 2 + 1].y + MATCH_H / 2} x2={wSemi[i].x} y2={wSemi[i].y + 3 * MATCH_H / 4} />
          <CDot x={wr1[i * 2].x + MATCH_W} y={wr1[i * 2].y + MATCH_H / 2} />
          <CDot x={wr1[i * 2 + 1].x + MATCH_W} y={wr1[i * 2 + 1].y + MATCH_H / 2} />
        </g>
      ))}

      {/* Semi → Final */}
      <Connector x1={wSemi[0].x + MATCH_W} y1={wSemi[0].y + MATCH_H / 2} x2={wFinal.x} y2={wFinal.y + MATCH_H / 4} />
      <Connector x1={wSemi[1].x + MATCH_W} y1={wSemi[1].y + MATCH_H / 2} x2={wFinal.x} y2={wFinal.y + 3 * MATCH_H / 4} />
      <CDot x={wSemi[0].x + MATCH_W} y={wSemi[0].y + MATCH_H / 2} />
      <CDot x={wSemi[1].x + MATCH_W} y={wSemi[1].y + MATCH_H / 2} />

      {/* Final → GF */}
      <Connector x1={wFinal.x + MATCH_W} y1={wFinal.y + MATCH_H / 2} x2={gf.x} y2={gf.y + MATCH_H / 4} />
      <CDot x={wFinal.x + MATCH_W} y={wFinal.y + MATCH_H / 2} />

      {/* Lower bracket */}
      <SectionLine x1={PAD} x2={totalW - PAD} y={losersBaseY - 30} label="↘ LOWER BRACKET" color={C.accent} />

      <ColHeader x={colX(0) + MATCH_W / 2} y={losersBaseY - 14} text="LOWER R1" />
      <ColHeader x={colX(1) + MATCH_W / 2} y={losersBaseY - 14} text="LOWER R2" />
      <ColHeader x={colX(2) + MATCH_W / 2} y={losersBaseY - 14} text="LOWER SEMI" />
      <ColHeader x={colX(3) + MATCH_W / 2} y={losersBaseY - 14} text="LOWER FINAL" />

      {/* LR1 → LR2 */}
      {[0, 1].map(i => (
        <g key={`lr1-lr2-${i}`}>
          <Connector x1={lr1[i].x + MATCH_W} y1={lr1[i].y + MATCH_H / 2} x2={lr2[i].x} y2={lr2[i].y + MATCH_H / 4} />
          <CDot x={lr1[i].x + MATCH_W} y={lr1[i].y + MATCH_H / 2} lower />
        </g>
      ))}

      {/* LR2 → LSemi */}
      <Connector x1={lr2[0].x + MATCH_W} y1={lr2[0].y + MATCH_H / 2} x2={lSemi.x} y2={lSemi.y + MATCH_H / 4} />
      <Connector x1={lr2[1].x + MATCH_W} y1={lr2[1].y + MATCH_H / 2} x2={lSemi.x} y2={lSemi.y + 3 * MATCH_H / 4} />
      <CDot x={lr2[0].x + MATCH_W} y={lr2[0].y + MATCH_H / 2} lower />
      <CDot x={lr2[1].x + MATCH_W} y={lr2[1].y + MATCH_H / 2} lower />

      {/* LSemi → LFinal */}
      <Connector x1={lSemi.x + MATCH_W} y1={lSemi.y + MATCH_H / 2} x2={lFinal.x} y2={lFinal.y + 3 * MATCH_H / 4} />
      <CDot x={lSemi.x + MATCH_W} y={lSemi.y + MATCH_H / 2} lower />

      {/* LFinal → GF */}
      <Connector x1={lFinal.x + MATCH_W} y1={lFinal.y + MATCH_H / 2} x2={gf.x} y2={gf.y + 3 * MATCH_H / 4} />
      <CDot x={lFinal.x + MATCH_W} y={lFinal.y + MATCH_H / 2} lower />

      {/* Match cards */}
      {mR1.map((m, i) => <MatchCard key={m.id} match={m} x={wr1[i].x} y={wr1[i].y} />)}
      <MatchCard match={mWS1} x={wSemi[0].x} y={wSemi[0].y} />
      <MatchCard match={mWS2} x={wSemi[1].x} y={wSemi[1].y} />
      <MatchCard match={mWF} x={wFinal.x} y={wFinal.y} />
      <MatchCard match={mLR1_1} x={lr1[0].x} y={lr1[0].y} />
      <MatchCard match={mLR1_2} x={lr1[1].x} y={lr1[1].y} />
      <MatchCard match={mLR2_1} x={lr2[0].x} y={lr2[0].y} />
      <MatchCard match={mLR2_2} x={lr2[1].x} y={lr2[1].y} />
      <MatchCard match={mLS} x={lSemi.x} y={lSemi.y} />
      <MatchCard match={mLF} x={lFinal.x} y={lFinal.y} />
      <MatchCard match={mGF} x={gf.x} y={gf.y} />
    </BracketWrapper>
  );
}