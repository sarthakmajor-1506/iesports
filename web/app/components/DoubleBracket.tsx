"use client";

import { useMemo } from "react";

/**
 * Double Elimination Bracket — OLED Dark Theme
 *
 * Dynamically adjusts bracket structure based on team count:
 *   2 teams → Grand Final only
 *   3 teams → UB Final + LB Final + Grand Final (LB gets bye)
 *   4 teams → Full 4-team double elim (top 2 UB, bottom 2 LB)
 *   5-6 teams → 8-team with byes (top 50% UB, bottom 50% LB)
 *   7-8 teams → Full 8-team double elim (top 4 UB, bottom 4 LB)
 *
 * Naming: "Upper Bracket" / "Lower Bracket"
 * Seeding: Top 50% standings → Upper Bracket, Bottom 50% → Lower Bracket
 *          This rewards group stage performance — top performers start
 *          with the advantage of needing to lose twice to be eliminated.
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

// ── Theme colors (OLED dark) ──────────────────────────────────────────────────
const C = {
  bg: "#0A0A0C",
  cardBg: "#121215",
  cardBorder: "#2A2A30",
  cardBorderHover: "#3a3a42",
  divider: "#1e1e22",
  text: "#F0EEEA",
  textSec: "#8A8880",
  textMuted: "#555550",
  textPlaceholder: "#3a3a42",
  accent: "#ff4655",
  accentLight: "rgba(255,70,85,0.1)",
  accentBorder: "rgba(255,70,85,0.25)",
  win: "#4ade80",
  winBg: "rgba(22,163,74,0.12)",
  winBorder: "rgba(34,197,94,0.3)",
  loss: "#f87171",
  lossBg: "rgba(239,68,68,0.1)",
  live: "#f59e0b",
  liveBg: "rgba(245,158,11,0.12)",
  blue: "#3b82f6",
  connector: "#3a3a42",
  connectorDotUpper: "#3b82f6",
  connectorDotLower: "#ff4655",
  seedBg: "rgba(59,130,246,0.12)",
  seedText: "#60A5FA",
  seedBorder: "rgba(59,130,246,0.3)",
  byeBg: "#18181C",
  byeText: "#3a3a42",
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

// ── SVG Match Card ────────────────────────────────────────────────────────────
function MatchCard({ match, x, y }: { match: BracketMatch; x: number; y: number }) {
  const isComplete = match.status === "completed";
  const isLive = match.status === "live";
  const t1Won = isComplete && match.team1Score > match.team2Score;
  const t2Won = isComplete && match.team2Score > match.team1Score;

  const t1 = {
    teamId: match.team1Id,
    teamName: match.team1Name !== "TBD" ? match.team1Name : (match.team1?.teamName || "TBD"),
    seed: match.team1?.seed || 0,
    members: match.team1?.members || [],
  };
  const t2 = {
    teamId: match.team2Id,
    teamName: match.team2Name !== "TBD" ? match.team2Name : (match.team2?.teamName || "TBD"),
    seed: match.team2?.seed || 0,
    members: match.team2?.members || [],
  };
  const borderColor = isLive ? C.live : isComplete ? C.winBorder : C.cardBorder;

  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Shadow */}
      <rect width={MATCH_W} height={MATCH_H} rx={10} ry={10} fill="rgba(0,0,0,0.2)" x={1} y={2} />
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
            stroke={isWinner ? C.winBorder : isComplete ? "rgba(239,68,68,0.25)" : C.cardBorder} strokeWidth={0.5} />
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
          {teamCount} teams · Double Elimination · Top 50% UB / Bottom 50% LB
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
  const mLBF = getM("lb-final", 2, TBD_TEAM, { ...t3, teamName: t3.teamName });
  const mGF = getM("grand-final", 3, TBD_TEAM, TBD_TEAM);

  return (
    <BracketWrapper width={totalW} height={totalH} teamCount={3}>
      <ColHeader x={ubFinal.x + MATCH_W / 2} y={PAD} text="UPPER BRACKET FINAL" />
      <ColHeader x={gf.x + MATCH_W / 2} y={PAD} text="GRAND FINAL" accent />

      <Connector x1={ubFinal.x + MATCH_W} y1={ubFinal.y + MATCH_H / 2} x2={gf.x} y2={gf.y + MATCH_H / 4} />
      <CDot x={ubFinal.x + MATCH_W} y={ubFinal.y + MATCH_H / 2} />

      <SectionLine x1={PAD} x2={totalW - PAD} y={losersY - 30} label="↘ LOWER BRACKET" color={C.accent} />
      <ColHeader x={lbFinal.x + MATCH_W / 2} y={losersY - 14} text="LOWER BRACKET FINAL" />

      <Connector x1={lbFinal.x + MATCH_W} y1={lbFinal.y + MATCH_H / 2} x2={gf.x} y2={gf.y + 3 * MATCH_H / 4} />
      <CDot x={lbFinal.x + MATCH_W} y={lbFinal.y + MATCH_H / 2} lower />

      <Connector x1={ubFinal.x + MATCH_W / 2} y1={ubFinal.y + MATCH_H} x2={lbFinal.x + MATCH_W / 4} y2={lbFinal.y} />
      <CDot x={ubFinal.x + MATCH_W / 2} y={ubFinal.y + MATCH_H} lower />

      <MatchCard match={mUBF} x={ubFinal.x} y={ubFinal.y} />
      <MatchCard match={mLBF} x={lbFinal.x} y={lbFinal.y} />
      <MatchCard match={mGF} x={gf.x} y={gf.y} />

      <text x={lbFinal.x + MATCH_W + 10} y={lbFinal.y + MATCH_H / 2 + 4}
        fill={C.textMuted} fontSize={9} fontFamily="system-ui" fontStyle="italic">
        #3 seed starts in lower bracket
      </text>
    </BracketWrapper>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4-TEAM BRACKET — 50/50 SPLIT
// ═══════════════════════════════════════════════════════════════════════════════
function Bracket4({ matchMap, teams, hasMatches }: { matchMap: Record<string, BracketMatch>; teams: TeamSlot[]; hasMatches: boolean }) {
  const colX = (col: number) => PAD + col * (MATCH_W + COL_GAP);

  const ubSemi = { x: colX(0), y: PAD + 30 };
  const losersY = ubSemi.y + MATCH_H + SECTION_GAP + 30;
  const lbR1 = { x: colX(0), y: losersY };
  const lbF = { x: colX(1), y: losersY };
  const gfY = ubSemi.y + (losersY - ubSemi.y) / 2;
  const gf = { x: colX(2), y: gfY };

  const totalW = colX(3);
  const totalH = losersY + MATCH_H + PAD + 20;

  const t = (i: number) => teams[i] || TBD_TEAM;
  const getM = (id: string, num: number, a: TeamSlot, b: TeamSlot) =>
    hasMatches ? (matchMap[id] || makePlaceholder(id, num, a, b)) : makePlaceholder(id, num, a, b);

  const mUBSemi = getM("wb-semi-m1", 1, t(0), t(1));
  const mLBR1 = getM("lb-r1-m1", 2, t(2), t(3));
  const mLBF = getM("lb-final", 3, TBD_TEAM, TBD_TEAM);
  const mGF = getM("grand-final", 4, TBD_TEAM, TBD_TEAM);

  return (
    <BracketWrapper width={totalW} height={totalH} teamCount={teams.length || 4}>
      <ColHeader x={ubSemi.x + MATCH_W / 2} y={PAD} text="UPPER BRACKET" />
      <ColHeader x={gf.x + MATCH_W / 2} y={PAD} text="GRAND FINAL" accent />

      <Connector x1={ubSemi.x + MATCH_W} y1={ubSemi.y + MATCH_H / 2} x2={gf.x} y2={gf.y + MATCH_H / 4} />
      <CDot x={ubSemi.x + MATCH_W} y={ubSemi.y + MATCH_H / 2} />

      <Connector x1={ubSemi.x + MATCH_W / 2} y1={ubSemi.y + MATCH_H} x2={lbF.x + MATCH_W / 4} y2={lbF.y} />
      <CDot x={ubSemi.x + MATCH_W / 2} y={ubSemi.y + MATCH_H} lower />

      <SectionLine x1={PAD} x2={totalW - PAD} y={losersY - 30} label="↘ LOWER BRACKET" color={C.accent} />
      <ColHeader x={lbR1.x + MATCH_W / 2} y={losersY - 14} text="LOWER R1" />
      <ColHeader x={lbF.x + MATCH_W / 2} y={losersY - 14} text="LOWER FINAL" />

      <Connector x1={lbR1.x + MATCH_W} y1={lbR1.y + MATCH_H / 2} x2={lbF.x} y2={lbF.y + 3 * MATCH_H / 4} />
      <CDot x={lbR1.x + MATCH_W} y={lbR1.y + MATCH_H / 2} lower />

      <Connector x1={lbF.x + MATCH_W} y1={lbF.y + MATCH_H / 2} x2={gf.x} y2={gf.y + 3 * MATCH_H / 4} />
      <CDot x={lbF.x + MATCH_W} y={lbF.y + MATCH_H / 2} lower />

      <MatchCard match={mUBSemi} x={ubSemi.x} y={ubSemi.y} />
      <MatchCard match={mLBR1} x={lbR1.x} y={lbR1.y} />
      <MatchCard match={mLBF} x={lbF.x} y={lbF.y} />
      <MatchCard match={mGF} x={gf.x} y={gf.y} />

      <text x={ubSemi.x + MATCH_W + 10} y={ubSemi.y + MATCH_H / 2 - 4}
        fill={C.win} fontSize={8.5} fontFamily="system-ui" fontWeight={700}>
        Winner → Grand Final
      </text>
      <text x={ubSemi.x + MATCH_W + 10} y={ubSemi.y + MATCH_H / 2 + 8}
        fill={C.accent} fontSize={8.5} fontFamily="system-ui" fontWeight={600} fontStyle="italic">
        Loser → Lower Final
      </text>
    </BracketWrapper>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8-TEAM BRACKET — 50/50 SPLIT
// ═══════════════════════════════════════════════════════════════════════════════
function Bracket8({ matchMap, teams, hasMatches }: { matchMap: Record<string, BracketMatch>; teams: TeamSlot[]; hasMatches: boolean }) {
  const colX = (col: number) => PAD + col * (MATCH_W + COL_GAP);

  const ubR1Y = (i: number) => PAD + 30 + i * (MATCH_H + ROW_GAP);
  const ubR1 = [0, 1].map(i => ({ x: colX(0), y: ubR1Y(i) }));
  const ubFinalY = ubR1Y(0) + (MATCH_H + ROW_GAP) / 2;
  const ubFinal = { x: colX(1), y: ubFinalY };

  const losersBaseY = ubR1[1].y + MATCH_H + SECTION_GAP + 30;
  const lbR1 = [0, 1].map(i => ({ x: colX(0), y: losersBaseY + i * (MATCH_H + ROW_GAP) }));
  const lbR2 = [0, 1].map(i => ({ x: colX(1), y: losersBaseY + i * (MATCH_H + ROW_GAP) }));
  const lbSemi = { x: colX(2), y: losersBaseY + (MATCH_H + ROW_GAP) / 2 };
  const lbFinal = { x: colX(3), y: lbSemi.y };

  const gfY = ubFinal.y + (lbFinal.y - ubFinal.y) / 2;
  const gf = { x: colX(3) + MATCH_W / 2, y: gfY };

  const totalW = gf.x + MATCH_W + PAD;
  const totalH = lbR1[1].y + MATCH_H + PAD + 20;

  const ubTeam = (i: number) => (i < Math.min(4, teams.length)) ? teams[i] : BYE_TEAM;
  const lbTeam = (i: number) => {
    const idx = 4 + i;
    return (idx < teams.length) ? teams[idx] : BYE_TEAM;
  };

  const getM = (id: string, num: number, a: TeamSlot, b: TeamSlot) =>
    hasMatches ? (matchMap[id] || makePlaceholder(id, num, a, b)) : makePlaceholder(id, num, a, b);

  const mUBR1 = [
    getM("wb-r1-m1", 1, ubTeam(0), ubTeam(3)),
    getM("wb-r1-m2", 2, ubTeam(1), ubTeam(2)),
  ];

  let mNum = 3;
  const mUBF = getM("wb-final", mNum++, TBD_TEAM, TBD_TEAM);

  const mLBR1_1 = getM("lb-r1-m1", mNum++, lbTeam(0), lbTeam(3));
  const mLBR1_2 = getM("lb-r1-m2", mNum++, lbTeam(1), lbTeam(2));

  const mLBR2_1 = getM("lb-r2-m1", mNum++, TBD_TEAM, TBD_TEAM);
  const mLBR2_2 = getM("lb-r2-m2", mNum++, TBD_TEAM, TBD_TEAM);

  const mLBS = getM("lb-semi", mNum++, TBD_TEAM, TBD_TEAM);
  const mLBF = getM("lb-final", mNum++, TBD_TEAM, TBD_TEAM);
  const mGF = getM("grand-final", mNum++, TBD_TEAM, TBD_TEAM);

  return (
    <BracketWrapper width={totalW} height={totalH} teamCount={teams.length || 8}>
      <ColHeader x={colX(0) + MATCH_W / 2} y={PAD} text="UPPER R1" />
      <ColHeader x={colX(1) + MATCH_W / 2} y={PAD} text="UPPER FINAL" />
      <ColHeader x={gf.x + MATCH_W / 2} y={PAD} text="GRAND FINAL" accent />

      <Connector x1={ubR1[0].x + MATCH_W} y1={ubR1[0].y + MATCH_H / 2} x2={ubFinal.x} y2={ubFinal.y + MATCH_H / 4} />
      <Connector x1={ubR1[1].x + MATCH_W} y1={ubR1[1].y + MATCH_H / 2} x2={ubFinal.x} y2={ubFinal.y + 3 * MATCH_H / 4} />
      <CDot x={ubR1[0].x + MATCH_W} y={ubR1[0].y + MATCH_H / 2} />
      <CDot x={ubR1[1].x + MATCH_W} y={ubR1[1].y + MATCH_H / 2} />

      <Connector x1={ubFinal.x + MATCH_W} y1={ubFinal.y + MATCH_H / 2} x2={gf.x} y2={gf.y + MATCH_H / 4} />
      <CDot x={ubFinal.x + MATCH_W} y={ubFinal.y + MATCH_H / 2} />

      <Connector x1={ubR1[0].x + MATCH_W / 2} y1={ubR1[0].y + MATCH_H} x2={lbR2[0].x + MATCH_W / 4} y2={lbR2[0].y} />
      <CDot x={ubR1[0].x + MATCH_W / 2} y={ubR1[0].y + MATCH_H} lower />
      <Connector x1={ubR1[1].x + MATCH_W / 2} y1={ubR1[1].y + MATCH_H} x2={lbR2[1].x + MATCH_W / 4} y2={lbR2[1].y} />
      <CDot x={ubR1[1].x + MATCH_W / 2} y={ubR1[1].y + MATCH_H} lower />

      <Connector x1={ubFinal.x + MATCH_W / 2} y1={ubFinal.y + MATCH_H} x2={lbFinal.x + MATCH_W / 4} y2={lbFinal.y} />
      <CDot x={ubFinal.x + MATCH_W / 2} y={ubFinal.y + MATCH_H} lower />

      <SectionLine x1={PAD} x2={totalW - PAD} y={losersBaseY - 30} label="↘ LOWER BRACKET" color={C.accent} />

      <ColHeader x={colX(0) + MATCH_W / 2} y={losersBaseY - 14} text="LOWER R1" />
      <ColHeader x={colX(1) + MATCH_W / 2} y={losersBaseY - 14} text="LOWER R2" />
      <ColHeader x={colX(2) + MATCH_W / 2} y={losersBaseY - 14} text="LOWER SEMI" />
      <ColHeader x={colX(3) + MATCH_W / 2} y={losersBaseY - 14} text="LOWER FINAL" />

      {[0, 1].map(i => (
        <g key={`lbr1-lbr2-${i}`}>
          <Connector x1={lbR1[i].x + MATCH_W} y1={lbR1[i].y + MATCH_H / 2} x2={lbR2[i].x} y2={lbR2[i].y + 3 * MATCH_H / 4} />
          <CDot x={lbR1[i].x + MATCH_W} y={lbR1[i].y + MATCH_H / 2} lower />
        </g>
      ))}

      <Connector x1={lbR2[0].x + MATCH_W} y1={lbR2[0].y + MATCH_H / 2} x2={lbSemi.x} y2={lbSemi.y + MATCH_H / 4} />
      <Connector x1={lbR2[1].x + MATCH_W} y1={lbR2[1].y + MATCH_H / 2} x2={lbSemi.x} y2={lbSemi.y + 3 * MATCH_H / 4} />
      <CDot x={lbR2[0].x + MATCH_W} y={lbR2[0].y + MATCH_H / 2} lower />
      <CDot x={lbR2[1].x + MATCH_W} y={lbR2[1].y + MATCH_H / 2} lower />

      <Connector x1={lbSemi.x + MATCH_W} y1={lbSemi.y + MATCH_H / 2} x2={lbFinal.x} y2={lbFinal.y + 3 * MATCH_H / 4} />
      <CDot x={lbSemi.x + MATCH_W} y={lbSemi.y + MATCH_H / 2} lower />

      <Connector x1={lbFinal.x + MATCH_W} y1={lbFinal.y + MATCH_H / 2} x2={gf.x} y2={gf.y + 3 * MATCH_H / 4} />
      <CDot x={lbFinal.x + MATCH_W} y={lbFinal.y + MATCH_H / 2} lower />

      {mUBR1.map((m, i) => <MatchCard key={m.id} match={m} x={ubR1[i].x} y={ubR1[i].y} />)}
      <MatchCard match={mUBF} x={ubFinal.x} y={ubFinal.y} />

      <MatchCard match={mLBR1_1} x={lbR1[0].x} y={lbR1[0].y} />
      <MatchCard match={mLBR1_2} x={lbR1[1].x} y={lbR1[1].y} />
      <MatchCard match={mLBR2_1} x={lbR2[0].x} y={lbR2[0].y} />
      <MatchCard match={mLBR2_2} x={lbR2[1].x} y={lbR2[1].y} />
      <MatchCard match={mLBS} x={lbSemi.x} y={lbSemi.y} />
      <MatchCard match={mLBF} x={lbFinal.x} y={lbFinal.y} />

      <MatchCard match={mGF} x={gf.x} y={gf.y} />

      <text x={ubR1[1].x + MATCH_W + 10} y={ubR1[1].y + MATCH_H / 2 + 4}
        fill={C.textMuted} fontSize={8.5} fontFamily="system-ui" fontStyle="italic">
        Top 4 from group stage
      </text>
      <text x={lbR1[1].x + MATCH_W + 10} y={lbR1[1].y + MATCH_H / 2 + 4}
        fill={C.textMuted} fontSize={8.5} fontFamily="system-ui" fontStyle="italic">
        Bottom 4 from group stage
      </text>
    </BracketWrapper>
  );
}