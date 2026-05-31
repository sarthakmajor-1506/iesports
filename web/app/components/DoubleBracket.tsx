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
  bracketBestOf?: number;
  lbFinalBestOf?: number;
  grandFinalBestOf?: number;
  tournamentId?: string;
  /** teamId → logo URL. Used to render team images instead of initials in each
   *  bracket card's logo slot. Missing entries fall back to initials. */
  teamLogos?: Record<string, string>;
}

// ── Layout constants ──────────────────────────────────────────────────────────
const MATCH_W = 300;
const MATCH_H = 64;
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
  accent: "#3CCBFF",
  accentLight: "rgba(60,203,255,0.1)",
  accentBorder: "rgba(60,203,255,0.25)",
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
  connectorDotLower: "#3CCBFF",
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
// Placeholder-name regex: matches "Rank 3", "RANK 3", "Seed #5", "rank 10" etc.
// These literal strings sometimes get saved to bracket matches when generated
// before group stage standings were finalised — at render time we resolve them
// back to the real team name via the seeded `teams[]` array.
// Capture group #1 is the seed number itself — used as a fallback when
// `match.team1?.seed` isn't set on the doc (older generator).
const RANK_PLACEHOLDER_RE = /^(?:rank|seed)\s*#?\s*(\d+)$/i;
function MatchCard({ match, x, y, bestOf = 1, tournamentId, teams = [], teamLogos = {} }: { match: BracketMatch; x: number; y: number; bestOf?: number; tournamentId?: string; teams?: TeamSlot[]; teamLogos?: Record<string, string> }) {
  const isComplete = match.status === "completed";
  const isLive = match.status === "live";
  const t1Won = isComplete && match.team1Score > match.team2Score;
  const t2Won = isComplete && match.team2Score > match.team1Score;
  // A losing team is eliminated if there's no loserGoesTo (they have nowhere to advance)
  const loserEliminated = isComplete && !match.loserGoesTo;

  // Resolve a slot's display name + seed. If the stored name is empty /
  // "TBD" / a "Rank N"-style placeholder, fall back to the seeded team
  // from standings — preferring the explicit `match.team1.seed` field,
  // but ALSO extracting the seed from "Rank N" itself when that field
  // is missing (older bracket generator wrote names but not seeds).
  const resolveSlot = (rawName: string | undefined, embeddedSeed: number, embedded?: TeamSlot): { name: string; seed: number } => {
    const placeholderMatch = rawName ? rawName.match(RANK_PLACEHOLDER_RE) : null;
    const isPlaceholder = !rawName || rawName === "TBD" || !!placeholderMatch;
    // Effective seed: embedded field first, else parsed from "Rank N"
    const effectiveSeed = embeddedSeed || (placeholderMatch ? Number(placeholderMatch[1]) : 0);
    if (!isPlaceholder) return { name: rawName!, seed: effectiveSeed };
    if (effectiveSeed > 0 && teams[effectiveSeed - 1]?.teamName && teams[effectiveSeed - 1].teamName !== "TBD") {
      return { name: teams[effectiveSeed - 1].teamName, seed: effectiveSeed };
    }
    return { name: embedded?.teamName || rawName || "TBD", seed: effectiveSeed };
  };
  const slot1 = resolveSlot(match.team1Name, match.team1?.seed || 0, match.team1);
  const slot2 = resolveSlot(match.team2Name, match.team2?.seed || 0, match.team2);
  const t1 = { teamId: match.team1Id, teamName: slot1.name, seed: slot1.seed };
  const t2 = { teamId: match.team2Id, teamName: slot2.name, seed: slot2.seed };
  const borderColor = isLive ? C.live : isComplete ? C.winBorder : C.cardBorder;
  const clickable = !!tournamentId && match.team1Id !== "TBD" && match.team2Id !== "TBD";

  return (
    <g transform={`translate(${x}, ${y})`} style={clickable ? { cursor: "pointer" } : undefined}>
      {clickable && (
        <a href={`/valorant/match/${tournamentId}/${match.id}`} style={{ textDecoration: "none" }}>
          <rect width={MATCH_W} height={MATCH_H} fill="transparent" style={{ cursor: "pointer" }} />
        </a>
      )}
      {/* Shadow */}
      <rect width={MATCH_W} height={MATCH_H} rx={8} ry={8} fill="rgba(0,0,0,0.2)" x={1} y={2} pointerEvents="none" />
      {/* Card */}
      <rect width={MATCH_W} height={MATCH_H} rx={8} ry={8} fill={C.cardBg} stroke={borderColor} strokeWidth={1.2} pointerEvents="none" />

      {/* Match label */}
      <text x={8} y={-5} fill={C.textMuted} fontSize={9} fontWeight={700} fontFamily="system-ui" pointerEvents="none">
        M{match.matchIndex}
      </text>
      {/* Format badge */}
      <rect x={26} y={-14} width={24} height={12} rx={3} fill={C.accentLight} stroke={C.accentBorder} strokeWidth={0.5} pointerEvents="none" />
      <text x={38} y={-5} fill={C.accent} fontSize={7} fontWeight={800} textAnchor="middle" fontFamily="system-ui" pointerEvents="none">BO{bestOf}</text>

      {/* Status badge top-right */}
      {isComplete && (
        <>
          <rect x={MATCH_W - 46} y={-14} width={46} height={12} rx={3} fill={C.winBg} stroke={C.winBorder} strokeWidth={0.5} pointerEvents="none" />
          <text x={MATCH_W - 23} y={-5} fill={C.win} fontSize={7} fontWeight={700} textAnchor="middle" fontFamily="system-ui" pointerEvents="none">✓ Played</text>
        </>
      )}
      {isLive && (
        <>
          <rect x={MATCH_W - 34} y={-14} width={34} height={12} rx={3} fill={C.liveBg} stroke={C.live} strokeWidth={0.5} pointerEvents="none" />
          <text x={MATCH_W - 17} y={-5} fill={C.live} fontSize={7} fontWeight={700} textAnchor="middle" fontFamily="system-ui" pointerEvents="none">● LIVE</text>
        </>
      )}

      {/* Team 1 */}
      <TeamRow team={t1} logoUrl={teamLogos[match.team1Id]} score={match.team1Score} isWinner={t1Won} isLoser={t2Won} isComplete={isComplete} isLive={isLive} isEliminated={t2Won && loserEliminated} y={2} />

      {/* Divider */}
      <line x1={6} y1={MATCH_H / 2} x2={MATCH_W - 6} y2={MATCH_H / 2} stroke={C.divider} strokeWidth={1} pointerEvents="none" />

      {/* Team 2 */}
      <TeamRow team={t2} logoUrl={teamLogos[match.team2Id]} score={match.team2Score} isWinner={t2Won} isLoser={t1Won} isComplete={isComplete} isLive={isLive} isEliminated={t1Won && loserEliminated} y={MATCH_H / 2 + 1} />

      {/* Invisible click overlay */}
      {clickable && (
        <a href={`/valorant/match/${tournamentId}/${match.id}`}>
          <rect width={MATCH_W} height={MATCH_H} fill="transparent" rx={8} ry={8} style={{ cursor: "pointer" }} />
        </a>
      )}
    </g>
  );
}

function TeamRow({ team, logoUrl, score, isWinner, isLoser, isComplete, isLive, isEliminated, y }: {
  team: { teamId: string; teamName: string; seed: number }; logoUrl?: string; score: number; isWinner: boolean; isLoser: boolean;
  isComplete: boolean; isLive?: boolean; isEliminated?: boolean; y: number;
}) {
  const isTBD = team.teamId === "TBD";
  const isBye = team.teamId === "BYE";
  const isEmpty = isTBD || isBye;
  const rowH = MATCH_H / 2 - 3;
  const initials = getTeamInitials(team.teamName);
  // Use the team's logo image when we have one + the slot is populated.
  // Falls back to coloured initials box when there's no logo URL.
  const hasLogo = !isEmpty && !!logoUrl;
  // Top 2 seeds get a gold accent — they earned a bye straight to UB Semis,
  // visually marks them as the protected top-of-standings teams. Applies
  // everywhere they appear in the bracket (semis, UB Final, GF) so the
  // visual identity follows them through.
  const isTopSeed = !isEmpty && (team.seed === 1 || team.seed === 2);

  let nameColor = isEmpty ? C.textPlaceholder : C.text;
  if (isWinner) nameColor = C.win;
  if (isEliminated) nameColor = "#f87171";
  else if (isLoser) nameColor = "#f87171";
  else if (isTopSeed) nameColor = "#fbbf24"; // amber/gold for #1 and #2 seeds

  let logoBg = isEmpty ? C.divider : (isTopSeed ? "rgba(251,191,36,0.15)" : C.accentLight);
  let logoColor = isEmpty ? C.textPlaceholder : (isTopSeed ? "#fbbf24" : C.accent);
  let logoBorder = isEmpty ? C.cardBorder : (isTopSeed ? "rgba(251,191,36,0.45)" : C.accentBorder);

  return (
    <g transform={`translate(0, ${y})`} pointerEvents="none">
      {/* Top-seed (#1 / #2) gold-tinted background — sits under everything,
          dimmer than winner highlight so it doesn't compete when a top seed
          also wins. */}
      {isTopSeed && !isWinner && !isEliminated && (
        <rect x={2} y={0} width={MATCH_W - 4} height={rowH} rx={5} fill="rgba(251,191,36,0.06)" />
      )}
      {/* Winner highlight bar */}
      {isWinner && <rect x={2} y={0} width={MATCH_W - 4} height={rowH} rx={5} fill={C.winBg} />}
      {/* Eliminated highlight bar */}
      {isEliminated && <rect x={2} y={0} width={MATCH_W - 4} height={rowH} rx={5} fill="rgba(239,68,68,0.08)" />}

      {/* Logo: image if available, else initials-on-coloured-square */}
      {hasLogo ? (
        <>
          {/* Subtle border + dim overlay for eliminated; clip the image to a rounded square */}
          <defs>
            <clipPath id={`bracket-logo-clip-${team.teamId}-${y}`}>
              <rect x={8} y={3} width={24} height={24} rx={5} />
            </clipPath>
          </defs>
          <image
            href={logoUrl}
            x={8} y={3} width={24} height={24}
            clipPath={`url(#bracket-logo-clip-${team.teamId}-${y})`}
            preserveAspectRatio="xMidYMid slice"
            opacity={isEliminated ? 0.35 : 1}
          />
          <rect x={8} y={3} width={24} height={24} rx={5} fill="none"
                stroke={isEliminated ? "rgba(239,68,68,0.3)" : logoBorder} strokeWidth={0.6} />
        </>
      ) : (
        <>
          <rect x={8} y={3} width={24} height={24} rx={5}
                fill={isEliminated ? "rgba(239,68,68,0.1)" : logoBg}
                stroke={isEliminated ? "rgba(239,68,68,0.3)" : logoBorder} strokeWidth={0.5} />
          <text x={20} y={19} fill={isEliminated ? "rgba(239,68,68,0.45)" : logoColor}
                fontSize={9} fontWeight={800} textAnchor="middle" fontFamily="system-ui">
            {initials}
          </text>
        </>
      )}

      {/* Seed badge */}
      {team.seed > 0 && (
        <>
          <rect x={36} y={3} width={16} height={10} rx={3} fill={C.seedBg} stroke={C.seedBorder} strokeWidth={0.5} />
          <text x={44} y={10.5} fill={C.seedText} fontSize={6.5} fontWeight={700} textAnchor="middle" fontFamily="system-ui">#{team.seed}</text>
        </>
      )}

      {/* Team name */}
      <text x={team.seed > 0 ? 56 : 38} y={isBye ? 19 : 19} fill={nameColor} fontSize={11}
        fontWeight={isWinner ? 800 : isEmpty ? 500 : 700} fontFamily="system-ui"
        fontStyle={isBye ? "italic" : "normal"}>
        {isBye ? "BYE" : isTBD ? "TBD" : (team.teamName.length > 22 ? team.teamName.slice(0, 20).toUpperCase() + "…" : team.teamName.toUpperCase())}
      </text>

      {/* Eliminated badge */}
      {isEliminated && !isEmpty && (
        <>
          <rect x={team.seed > 0 ? 56 : 38} y={21} width={46} height={9} rx={2} fill="rgba(239,68,68,0.15)" stroke="rgba(239,68,68,0.35)" strokeWidth={0.4} />
          <text x={(team.seed > 0 ? 56 : 38) + 23} y={28} fill="rgba(239,68,68,0.7)" fontSize={5.5} fontWeight={700} textAnchor="middle" fontFamily="system-ui" letterSpacing={0.5}>
            ELIMINATED
          </text>
        </>
      )}

      {/* Score */}
      {!isBye && (
        <>
          <rect x={MATCH_W - 28} y={3} width={20} height={24} rx={4}
            fill={isWinner ? C.winBg : isComplete ? C.lossBg : isLive ? C.liveBg : C.bg}
            stroke={isWinner ? C.winBorder : isComplete ? "rgba(239,68,68,0.25)" : isLive ? "rgba(245,158,11,0.3)" : C.cardBorder} strokeWidth={0.5} />
          <text x={MATCH_W - 18} y={19} fill={isWinner ? C.win : isComplete ? (isLoser ? C.loss : C.textMuted) : isLive ? C.live : C.textPlaceholder}
            fontSize={11} fontWeight={800} textAnchor="middle" fontFamily="system-ui">
            {(isComplete || isLive) ? score : "–"}
          </text>
        </>
      )}
    </g>
  );
}

// ── Connector helpers ─────────────────────────────────────────────────────────
// Connector colours:
//   - upper bracket flow:  blue (#3b82f6 at ~55% opacity → "5b9eff8c")
//   - lower bracket flow:  cyan (#3CCBFF at ~55% opacity → "3CCBFF8c")
//   - UB→LB drop (loser):  amber dashed (#fbbf24 at ~50% opacity) — visually
//     distinguishes "losing team falls to LB" from same-bracket progression
// The user feedback was that the original uniform dim-gray (#3a3a42) made it
// hard to trace which match feeds which — coloured lanes solve that.
const FLOW_UPPER = "rgba(59,130,246,0.65)";    // bright blue
const FLOW_LOWER = "rgba(60,203,255,0.65)";    // bright cyan
const FLOW_DROP  = "rgba(251,191,36,0.55)";    // amber for losers dropping to LB

// Three routing modes:
//  - default (H-V-H): horizontal out → vertical at midX → horizontal in. Used for
//    "winner advances right" connectors where source/target sit at the same Y band.
//  - V-H-V (when only `midY` is provided): vertical down → horizontal at midY →
//    vertical into target. Kept for legacy callers that don't need column-gap routing.
//  - V-H-V-H (when both `viaY` and `viaX` are provided): drop down to a lane just
//    below the source row → cross horizontally to a vertical lane sitting in the
//    COL_GAP between columns (so the long vertical never cuts through unrelated
//    match cells) → drop down to the target row → enter the target cell from the
//    left. This is the routing used by "UB loser drops down to LB" connectors,
//    since they have to traverse multiple rows AND multiple columns.
function Connector({ x1, y1, x2, y2, color = C.connector, dashed = false, strokeWidth = 1.8, midX, midY, viaX, viaY }: { x1: number; y1: number; x2: number; y2: number; color?: string; dashed?: boolean; strokeWidth?: number; midX?: number; midY?: number; viaX?: number; viaY?: number }) {
  let d: string;
  if (viaX !== undefined && viaY !== undefined) {
    d = `M ${x1} ${y1} V ${viaY} H ${viaX} V ${y2} H ${x2}`;
  } else if (midY !== undefined) {
    d = `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`;
  } else {
    const mx = midX ?? (x1 + x2) / 2;
    d = `M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`;
  }
  return <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashed ? "5 4" : undefined} />;
}

function CDot({ x, y, lower = false }: { x: number; y: number; lower?: boolean }) {
  return <circle cx={x} cy={y} r={3.5} fill={lower ? C.connectorDotLower : C.connectorDotUpper} stroke="rgba(10,11,14,0.8)" strokeWidth={1} />;
}

function SectionLine({ x1, x2, y, label, color }: { x1: number; x2: number; y: number; label: string; color: string }) {
  return (
    <>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={color + "44"} strokeWidth={1} strokeDasharray="6 4" />
      <text x={x1} y={y - 8} fill={color} fontSize={11} fontWeight={800} letterSpacing="0.1em" fontFamily="system-ui">{label}</text>
    </>
  );
}

// Origin chip — small amber pill that sits in the badge band above an LB
// cell to communicate "the loser of [UB cell] drops in here". Replaces the
// long dashed yellow drop lines that used to snake across the bracket.
// A line for a "teleport" between two distant cells always looks worse than
// a label on the destination — this matches how Liquipedia / VLR.gg / smash.gg
// render double-elim drops.
function OriginChip({ x, y, text }: { x: number; y: number; text: string }) {
  const padX = 7;
  const width = Math.max(78, text.length * 4.6 + padX * 2);
  return (
    <g pointerEvents="none">
      <rect x={x - width / 2} y={y - 11} width={width} height={12} rx={3}
            fill="rgba(251,191,36,0.10)" stroke="rgba(251,191,36,0.42)" strokeWidth={0.7} />
      <text x={x} y={y - 2.5} fill="#fbbf24" fontSize={8} fontWeight={800}
            textAnchor="middle" letterSpacing="0.06em" fontFamily="system-ui">
        {text}
      </text>
    </g>
  );
}

// Column header for each round (UPPER R1, UPPER SEMIS, LOWER R3, GRAND FINAL).
// Was 10px muted-grey text — easy to miss. Now a 13px bold uppercase chip
// with a subtle accent pill so each round's name reads clearly at the top
// of its column.
function ColHeader({ x, y, text: t, accent = false }: { x: number; y: number; text: string; accent?: boolean }) {
  const fill = accent ? C.live : "#E6E7EE";
  const pillFill = accent ? "rgba(245,158,11,0.10)" : "rgba(60,203,255,0.06)";
  const pillStroke = accent ? "rgba(245,158,11,0.30)" : "rgba(60,203,255,0.18)";
  const width = Math.max(94, t.length * 7 + 18);
  return (
    <g>
      <rect x={x - width / 2} y={y - 11} width={width} height={20} rx={10}
            fill={pillFill} stroke={pillStroke} strokeWidth={0.8} />
      <text x={x} y={y + 3} fill={fill} fontSize={11.5} fontWeight={900}
            textAnchor="middle" letterSpacing="0.15em" fontFamily="system-ui">{t}</text>
    </g>
  );
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function DoubleBracket({ matches, bracketSize, standings = [], bracketBestOf = 2, lbFinalBestOf, grandFinalBestOf = 3, tournamentId , teamLogos = {} }: Props) {
  const lbFinalBO = lbFinalBestOf ?? bracketBestOf;
  const matchMap = useMemo(() => {
    const m: Record<string, BracketMatch> = {};
    matches.forEach(match => { m[match.id] = match; });
    return m;
  }, [matches]);

  // Get sorted teams from standings for seeding.
  // Until bracket matches are generated, keep all slots TBD so the playoffs
  // view doesn't leak standings into the bracket visualisation.
  const seededTeams = useMemo(() => {
    if (matches.length === 0) {
      return Array.from({ length: bracketSize }, () => ({
        teamId: "TBD", teamName: "TBD", seed: 0, members: [],
      } as TeamSlot));
    }
    return standings.map((s, i) => ({
      teamId: s.id || s.teamId || s.teamName,
      teamName: s.teamName,
      seed: i + 1,
      members: [],
    } as TeamSlot));
  }, [standings, matches.length, bracketSize]);

  const teamCount = seededTeams.length || bracketSize;
  const tId = tournamentId;

  // Determine effective bracket type
  if (teamCount <= 2) return <Bracket2 matchMap={matchMap} teams={seededTeams} hasMatches={matches.length > 0} bracketBestOf={bracketBestOf} lbFinalBestOf={lbFinalBO} grandFinalBestOf={grandFinalBestOf} tournamentId={tId} teamLogos={teamLogos} />;
  if (teamCount === 3) return <Bracket3 matchMap={matchMap} teams={seededTeams} hasMatches={matches.length > 0} bracketBestOf={bracketBestOf} lbFinalBestOf={lbFinalBO} grandFinalBestOf={grandFinalBestOf} tournamentId={tId} teamLogos={teamLogos} />;
  if (teamCount <= 4) return <Bracket4 matchMap={matchMap} teams={seededTeams} hasMatches={matches.length > 0} bracketBestOf={bracketBestOf} lbFinalBestOf={lbFinalBO} grandFinalBestOf={grandFinalBestOf} tournamentId={tId} teamLogos={teamLogos} />;
  if (teamCount <= 8) return <Bracket8 matchMap={matchMap} teams={seededTeams} hasMatches={matches.length > 0} bracketBestOf={bracketBestOf} lbFinalBestOf={lbFinalBO} grandFinalBestOf={grandFinalBestOf} tournamentId={tId} teamLogos={teamLogos} />;
  if (teamCount <= 10) return <Bracket10 matchMap={matchMap} teams={seededTeams} hasMatches={matches.length > 0} bracketBestOf={bracketBestOf} lbFinalBestOf={lbFinalBO} grandFinalBestOf={grandFinalBestOf} tournamentId={tId} teamLogos={teamLogos} />;
  // >10 teams with no matches yet — render a clean "seeding TBD" placeholder.
  // ubCount comes from the tournament's ubTeamCount setting (passed by parent
  // via standings.ubCount-style hint isn't available here, so we follow the
  // generator's rule: 6 UB / 4 LB at exactly 10, otherwise standard 50/50).
  const defaultUbCount = teamCount >= 9 && teamCount <= 10 ? 6 : Math.floor(teamCount / 2);
  return <BracketTBDPlaceholder teamCount={teamCount} ubCount={defaultUbCount} />;
}

function BracketTBDPlaceholder({ teamCount, ubCount }: { teamCount: number; ubCount: number }) {
  const lbCount = teamCount - ubCount;
  return (
    <div style={{
      background: C.bg,
      borderRadius: 16,
      border: `1px solid ${C.cardBorder}`,
      padding: "48px 24px",
      textAlign: "center",
    }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 10,
        padding: "6px 14px", borderRadius: 100,
        background: "rgba(60,203,255,0.1)", border: "1px solid rgba(60,203,255,0.3)",
        fontSize: "0.7rem", fontWeight: 900, letterSpacing: "0.15em",
        color: C.win, textTransform: "uppercase",
      }}>
        ↗ Seeding TBD
      </div>
      <h3 style={{
        margin: "18px 0 8px", fontSize: "1.4rem", fontWeight: 900, color: "#E6E6E6",
      }}>
        Play-off bracket locks after the group stage
      </h3>
      <p style={{ margin: 0, color: C.textMuted, fontSize: "0.9rem", lineHeight: 1.6 }}>
        {teamCount} teams advance · Top {ubCount} seed into the Upper Bracket · Next {lbCount} start in the Lower Bracket
      </p>
      <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginTop: 22 }}>
        <div style={{
          padding: "10px 16px", borderRadius: 10,
          background: "rgba(60,203,255,0.08)", border: "1px solid rgba(60,203,255,0.3)",
          fontSize: "0.76rem", color: C.win, fontWeight: 700, letterSpacing: "0.05em",
        }}>
          {ubCount} · Upper Bracket
        </div>
        <div style={{
          padding: "10px 16px", borderRadius: 10,
          background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)",
          fontSize: "0.76rem", color: "#f59e0b", fontWeight: 700, letterSpacing: "0.05em",
        }}>
          {lbCount} · Lower Bracket
        </div>
      </div>
    </div>
  );
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
function Bracket2({ matchMap, teams, hasMatches, bracketBestOf, lbFinalBestOf, grandFinalBestOf, tournamentId , teamLogos }: { matchMap: Record<string, BracketMatch>; teams: TeamSlot[]; hasMatches: boolean; bracketBestOf: number; lbFinalBestOf: number; grandFinalBestOf: number; tournamentId?: string ; teamLogos?: Record<string, string> }) {
  const gf = { x: PAD, y: PAD + 30 };
  const totalW = PAD + MATCH_W + PAD;
  const totalH = gf.y + MATCH_H + PAD + 20;

  const t1 = teams[0] || TBD_TEAM;
  const t2 = teams[1] || TBD_TEAM;
  const match = hasMatches ? (matchMap["grand-final"] || makePlaceholder("grand-final", 1, t1, t2)) : makePlaceholder("grand-final", 1, t1, t2);

  return (
    <BracketWrapper width={totalW} height={totalH} teamCount={teams.length}>
      <ColHeader x={gf.x + MATCH_W / 2} y={PAD} text="GRAND FINAL" accent />
      <MatchCard match={match} x={gf.x} y={gf.y} bestOf={grandFinalBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />
    </BracketWrapper>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3-TEAM: UB Final (#1 vs #2) → LB Final (UB loser vs #3) → Grand Final
// ═══════════════════════════════════════════════════════════════════════════════
function Bracket3({ matchMap, teams, hasMatches, bracketBestOf, lbFinalBestOf, grandFinalBestOf, tournamentId , teamLogos }: { matchMap: Record<string, BracketMatch>; teams: TeamSlot[]; hasMatches: boolean; bracketBestOf: number; lbFinalBestOf: number; grandFinalBestOf: number; tournamentId?: string ; teamLogos?: Record<string, string> }) {
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

      <MatchCard match={mUBF} x={ubFinal.x} y={ubFinal.y} bestOf={bracketBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />
      <MatchCard match={mLBF} x={lbFinal.x} y={lbFinal.y} bestOf={lbFinalBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />
      <MatchCard match={mGF} x={gf.x} y={gf.y} bestOf={grandFinalBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />

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
function Bracket4({ matchMap, teams, hasMatches, bracketBestOf, lbFinalBestOf, grandFinalBestOf, tournamentId , teamLogos }: { matchMap: Record<string, BracketMatch>; teams: TeamSlot[]; hasMatches: boolean; bracketBestOf: number; lbFinalBestOf: number; grandFinalBestOf: number; tournamentId?: string ; teamLogos?: Record<string, string> }) {
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

      <MatchCard match={mUBSemi} x={ubSemi.x} y={ubSemi.y} bestOf={bracketBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />
      <MatchCard match={mLBR1} x={lbR1.x} y={lbR1.y} bestOf={bracketBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />
      <MatchCard match={mLBF} x={lbF.x} y={lbF.y} bestOf={lbFinalBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />
      <MatchCard match={mGF} x={gf.x} y={gf.y} bestOf={grandFinalBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />

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
function Bracket8({ matchMap, teams, hasMatches, bracketBestOf, lbFinalBestOf, grandFinalBestOf, tournamentId , teamLogos }: { matchMap: Record<string, BracketMatch>; teams: TeamSlot[]; hasMatches: boolean; bracketBestOf: number; lbFinalBestOf: number; grandFinalBestOf: number; tournamentId?: string ; teamLogos?: Record<string, string> }) {
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
  const gf = { x: colX(4), y: gfY };

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

      {mUBR1.map((m, i) => <MatchCard key={m.id} match={m} x={ubR1[i].x} y={ubR1[i].y} bestOf={bracketBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />)}
      <MatchCard match={mUBF} x={ubFinal.x} y={ubFinal.y} bestOf={bracketBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />

      <MatchCard match={mLBR1_1} x={lbR1[0].x} y={lbR1[0].y} bestOf={bracketBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />
      <MatchCard match={mLBR1_2} x={lbR1[1].x} y={lbR1[1].y} bestOf={bracketBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />
      <MatchCard match={mLBR2_1} x={lbR2[0].x} y={lbR2[0].y} bestOf={bracketBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />
      <MatchCard match={mLBR2_2} x={lbR2[1].x} y={lbR2[1].y} bestOf={bracketBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />
      <MatchCard match={mLBS} x={lbSemi.x} y={lbSemi.y} bestOf={bracketBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />
      <MatchCard match={mLBF} x={lbFinal.x} y={lbFinal.y} bestOf={lbFinalBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />

      <MatchCard match={mGF} x={gf.x} y={gf.y} bestOf={grandFinalBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />

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

// ═══════════════════════════════════════════════════════════════════════════════
// 10-TEAM: Top 6 → UB (with #1/#2 byes through to UB Semis), Bottom 4 → LB
// Match IDs match what the generate-brackets route writes:
//   wb-r1-m1, wb-r1-m2 — UB R1 (#3v#6, #4v#5)
//   wb-semi-m1, wb-semi-m2 — UB Semis (#1 vs winner R1M2 / #2 vs winner R1M1)
//   wb-final
//   lb-r1-m1, lb-r1-m2 — LB R1 (#7v#10, #8v#9)
//   lb-r2-m1, lb-r2-m2 — LB R2 (LB R1 winners crossed with UB R1 losers)
//   lb-r3-m1, lb-r3-m2 — LB R3 (LB R2 winners crossed with UB Semi losers)
//   lb-semi
//   lb-final
//   grand-final
// ═══════════════════════════════════════════════════════════════════════════════
function Bracket10({ matchMap, teams, hasMatches, bracketBestOf, lbFinalBestOf, grandFinalBestOf, tournamentId , teamLogos }: { matchMap: Record<string, BracketMatch>; teams: TeamSlot[]; hasMatches: boolean; bracketBestOf: number; lbFinalBestOf: number; grandFinalBestOf: number; tournamentId?: string ; teamLogos?: Record<string, string> }) {
  const colX = (col: number) => PAD + col * (MATCH_W + COL_GAP);

  // ── Upper bracket geometry ─────────────────────────────────────────────────
  // UB R1: 2 matches (rows 0,1).  UB Semis: 2 matches positioned to "look like"
  // they're fed by R1 winners + the bye seeds — slightly offset vertically so
  // the connecting lines from R1 winners flow naturally into them.
  const ubR1Y = (i: number) => PAD + 30 + i * (MATCH_H + ROW_GAP);
  const ubR1 = [0, 1].map(i => ({ x: colX(0), y: ubR1Y(i) }));
  // UB Semis sit between R1 rows + extend down so the bye-seed (#1, #2)
  // labels have room.
  const ubSemiY = (i: number) => ubR1Y(0) + (MATCH_H + ROW_GAP) / 2 + i * (MATCH_H + ROW_GAP);
  const ubSemi = [0, 1].map(i => ({ x: colX(1), y: ubSemiY(i) }));
  const ubFinalY = ubSemi[0].y + (MATCH_H + ROW_GAP) / 2;
  const ubFinal = { x: colX(2), y: ubFinalY };

  // ── Lower bracket geometry — 4 columns (R1, R2, R3, Semi) + LB Final ────
  // Extra +50 (was +30) of buffer above the LB row leaves room for both the
  // column-header pill AND the UB→LB origin chip above each top-row LB cell
  // without them overlapping.
  const losersBaseY = ubSemi[1].y + MATCH_H + SECTION_GAP + 50;
  const lbR1 = [0, 1].map(i => ({ x: colX(0), y: losersBaseY + i * (MATCH_H + ROW_GAP) }));
  const lbR2 = [0, 1].map(i => ({ x: colX(1), y: losersBaseY + i * (MATCH_H + ROW_GAP) }));
  const lbR3 = [0, 1].map(i => ({ x: colX(2), y: losersBaseY + i * (MATCH_H + ROW_GAP) }));
  const lbSemi = { x: colX(3), y: losersBaseY + (MATCH_H + ROW_GAP) / 2 };
  const lbFinal = { x: colX(4), y: lbSemi.y };

  // GF sits in its own column past UB Final + LB Final.
  const gfY = ubFinal.y + (lbFinal.y - ubFinal.y) / 2;
  const gf = { x: colX(5), y: gfY };

  const totalW = gf.x + MATCH_W + PAD;
  const totalH = lbR1[1].y + MATCH_H + PAD + 20;

  const ubTeam = (i: number) => (i < Math.min(6, teams.length)) ? teams[i] : BYE_TEAM;
  const lbTeam = (i: number) => {
    const idx = 6 + i;
    return (idx < teams.length) ? teams[idx] : BYE_TEAM;
  };

  const getM = (id: string, num: number, a: TeamSlot, b: TeamSlot) =>
    hasMatches ? (matchMap[id] || makePlaceholder(id, num, a, b)) : makePlaceholder(id, num, a, b);

  // UB R1 — rank 3-6 fight for the right to face the bye seeds
  const mUBR1 = [
    getM("wb-r1-m1", 1, ubTeam(2), ubTeam(5)),
    getM("wb-r1-m2", 2, ubTeam(3), ubTeam(4)),
  ];
  let mNum = 3;
  // UB Semis — bye seeds wait here
  const mUBSemi = [
    getM("wb-semi-m1", mNum++, ubTeam(0), TBD_TEAM),  // #1 vs winner(R1 M2)
    getM("wb-semi-m2", mNum++, ubTeam(1), TBD_TEAM),  // #2 vs winner(R1 M1)
  ];
  const mUBF = getM("wb-final", mNum++, TBD_TEAM, TBD_TEAM);

  // Lower bracket
  const mLBR1 = [
    getM("lb-r1-m1", mNum++, lbTeam(0), lbTeam(3)),  // #7 v #10
    getM("lb-r1-m2", mNum++, lbTeam(1), lbTeam(2)),  // #8 v #9
  ];
  const mLBR2 = [
    getM("lb-r2-m1", mNum++, TBD_TEAM, TBD_TEAM),
    getM("lb-r2-m2", mNum++, TBD_TEAM, TBD_TEAM),
  ];
  const mLBR3 = [
    getM("lb-r3-m1", mNum++, TBD_TEAM, TBD_TEAM),
    getM("lb-r3-m2", mNum++, TBD_TEAM, TBD_TEAM),
  ];
  const mLBS = getM("lb-semi", mNum++, TBD_TEAM, TBD_TEAM);
  const mLBF = getM("lb-final", mNum++, TBD_TEAM, TBD_TEAM);
  const mGF = getM("grand-final", mNum++, TBD_TEAM, TBD_TEAM);

  return (
    <BracketWrapper width={totalW} height={totalH} teamCount={teams.length || 10}>
      {/* Upper bracket column headers */}
      <ColHeader x={colX(0) + MATCH_W / 2} y={PAD} text="UPPER R1" />
      <ColHeader x={colX(1) + MATCH_W / 2} y={PAD} text="UPPER SEMIS" />
      <ColHeader x={colX(2) + MATCH_W / 2} y={PAD} text="UPPER FINAL" />
      <ColHeader x={gf.x + MATCH_W / 2} y={PAD} text="GRAND FINAL" accent />

      {/* UB R1 → UB Semis. Routing is read from each R1 match's `winnerGoesTo`
          field so an admin can override the default crossed feed by editing
          the match docs (see scripts/ad-hoc/_swapAscensionUpperSemis.ts).
          Each semi starts seeded with the bye team (#1 or #2) in team1, so
          the R1 winner advancing in always fills team2 — point the connector
          at the team2 row (3/4 of cell height) of the target semi. */}
      {(() => {
        const r1m1SemiIdx = matchMap["wb-r1-m1"]?.winnerGoesTo === "wb-semi-m1" ? 0 : 1;
        const r1m2SemiIdx = matchMap["wb-r1-m2"]?.winnerGoesTo === "wb-semi-m2" ? 1 : 0;
        return (
          <>
            <Connector color={FLOW_UPPER}
              x1={ubR1[0].x + MATCH_W} y1={ubR1[0].y + MATCH_H / 2}
              x2={ubSemi[r1m1SemiIdx].x} y2={ubSemi[r1m1SemiIdx].y + 3 * MATCH_H / 4} />
            <Connector color={FLOW_UPPER}
              x1={ubR1[1].x + MATCH_W} y1={ubR1[1].y + MATCH_H / 2}
              x2={ubSemi[r1m2SemiIdx].x} y2={ubSemi[r1m2SemiIdx].y + 3 * MATCH_H / 4} />
            <CDot x={ubR1[0].x + MATCH_W} y={ubR1[0].y + MATCH_H / 2} />
            <CDot x={ubR1[1].x + MATCH_W} y={ubR1[1].y + MATCH_H / 2} />
          </>
        );
      })()}

      {/* UB Semis → UB Final */}
      <Connector color={FLOW_UPPER} x1={ubSemi[0].x + MATCH_W} y1={ubSemi[0].y + MATCH_H / 2} x2={ubFinal.x} y2={ubFinal.y + MATCH_H / 4} />
      <Connector color={FLOW_UPPER} x1={ubSemi[1].x + MATCH_W} y1={ubSemi[1].y + MATCH_H / 2} x2={ubFinal.x} y2={ubFinal.y + 3 * MATCH_H / 4} />
      <CDot x={ubSemi[0].x + MATCH_W} y={ubSemi[0].y + MATCH_H / 2} />
      <CDot x={ubSemi[1].x + MATCH_W} y={ubSemi[1].y + MATCH_H / 2} />

      {/* UB Final → GF */}
      <Connector color={FLOW_UPPER} x1={ubFinal.x + MATCH_W} y1={ubFinal.y + MATCH_H / 2} x2={gf.x} y2={gf.y + MATCH_H / 4} />
      <CDot x={ubFinal.x + MATCH_W} y={ubFinal.y + MATCH_H / 2} />

      {/* UB → LB drops are shown as amber origin chips on the receiving LB
          cell rather than drawn as lines. Long dashed paths spanning rows
          AND columns always read as noise; a label on the destination is
          how every major bracket UI (Liquipedia, VLR.gg, smash.gg) handles
          this. Routing is still read from each source match's `loserGoesTo`
          so admin overrides flow through. */}

      <SectionLine x1={PAD} x2={totalW - PAD} y={losersBaseY - 50} label="↘ LOWER BRACKET" color={C.accent} />

      <ColHeader x={colX(0) + MATCH_W / 2} y={losersBaseY - 32} text="LOWER R1" />
      <ColHeader x={colX(1) + MATCH_W / 2} y={losersBaseY - 32} text="LOWER R2" />
      <ColHeader x={colX(2) + MATCH_W / 2} y={losersBaseY - 32} text="LOWER R3" />
      <ColHeader x={colX(3) + MATCH_W / 2} y={losersBaseY - 32} text="LOWER SEMI" />
      <ColHeader x={colX(4) + MATCH_W / 2} y={losersBaseY - 32} text="LOWER FINAL" />

      {/* LB R1 → LB R2 */}
      {[0, 1].map(i => (
        <g key={`lbr1-lbr2-${i}`}>
          <Connector color={FLOW_LOWER} x1={lbR1[i].x + MATCH_W} y1={lbR1[i].y + MATCH_H / 2} x2={lbR2[i].x} y2={lbR2[i].y + 3 * MATCH_H / 4} />
          <CDot x={lbR1[i].x + MATCH_W} y={lbR1[i].y + MATCH_H / 2} lower />
        </g>
      ))}

      {/* LB R2 → LB R3 */}
      {[0, 1].map(i => (
        <g key={`lbr2-lbr3-${i}`}>
          <Connector color={FLOW_LOWER} x1={lbR2[i].x + MATCH_W} y1={lbR2[i].y + MATCH_H / 2} x2={lbR3[i].x} y2={lbR3[i].y + MATCH_H / 4} />
          <CDot x={lbR2[i].x + MATCH_W} y={lbR2[i].y + MATCH_H / 2} lower />
        </g>
      ))}

      {/* LB R3 → LB Semi */}
      <Connector color={FLOW_LOWER} x1={lbR3[0].x + MATCH_W} y1={lbR3[0].y + MATCH_H / 2} x2={lbSemi.x} y2={lbSemi.y + MATCH_H / 4} />
      <Connector color={FLOW_LOWER} x1={lbR3[1].x + MATCH_W} y1={lbR3[1].y + MATCH_H / 2} x2={lbSemi.x} y2={lbSemi.y + 3 * MATCH_H / 4} />
      <CDot x={lbR3[0].x + MATCH_W} y={lbR3[0].y + MATCH_H / 2} lower />
      <CDot x={lbR3[1].x + MATCH_W} y={lbR3[1].y + MATCH_H / 2} lower />

      {/* LB Semi → LB Final */}
      <Connector color={FLOW_LOWER} x1={lbSemi.x + MATCH_W} y1={lbSemi.y + MATCH_H / 2} x2={lbFinal.x} y2={lbFinal.y + MATCH_H / 4} />
      <CDot x={lbSemi.x + MATCH_W} y={lbSemi.y + MATCH_H / 2} lower />

      {/* LB Final → GF */}
      <Connector color={FLOW_LOWER} x1={lbFinal.x + MATCH_W} y1={lbFinal.y + MATCH_H / 2} x2={gf.x} y2={gf.y + 3 * MATCH_H / 4} />
      <CDot x={lbFinal.x + MATCH_W} y={lbFinal.y + MATCH_H / 2} lower />

      {/* Match cards */}
      {mUBR1.map((m, i) => <MatchCard key={m.id} match={m} x={ubR1[i].x} y={ubR1[i].y} bestOf={bracketBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />)}
      {mUBSemi.map((m, i) => <MatchCard key={m.id} match={m} x={ubSemi[i].x} y={ubSemi[i].y} bestOf={bracketBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />)}
      <MatchCard match={mUBF} x={ubFinal.x} y={ubFinal.y} bestOf={bracketBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />

      {mLBR1.map((m, i) => <MatchCard key={m.id} match={m} x={lbR1[i].x} y={lbR1[i].y} bestOf={bracketBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />)}
      {mLBR2.map((m, i) => <MatchCard key={m.id} match={m} x={lbR2[i].x} y={lbR2[i].y} bestOf={bracketBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />)}
      {mLBR3.map((m, i) => <MatchCard key={m.id} match={m} x={lbR3[i].x} y={lbR3[i].y} bestOf={bracketBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />)}
      <MatchCard match={mLBS} x={lbSemi.x} y={lbSemi.y} bestOf={bracketBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />
      <MatchCard match={mLBF} x={lbFinal.x} y={lbFinal.y} bestOf={lbFinalBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />

      <MatchCard match={mGF} x={gf.x} y={gf.y} bestOf={grandFinalBestOf} tournamentId={tournamentId} teams={teams} teamLogos={teamLogos} />

      {/* UB→LB drop origin chips. Sit in the badge band directly above each
          LB cell that receives a UB loser. Index lookup honours each source
          match's `loserGoesTo` so admin overrides of the default routing are
          reflected accurately. */}
      {(() => {
        const r1m1LbIdx = matchMap["wb-r1-m1"]?.loserGoesTo === "lb-r2-m1" ? 0 : 1;
        const r1m2LbIdx = matchMap["wb-r1-m2"]?.loserGoesTo === "lb-r2-m2" ? 1 : 0;
        const sm1R3Idx  = matchMap["wb-semi-m1"]?.loserGoesTo === "lb-r3-m1" ? 0 : 1;
        const sm2R3Idx  = matchMap["wb-semi-m2"]?.loserGoesTo === "lb-r3-m2" ? 1 : 0;
        return (
          <>
            <OriginChip x={lbR2[r1m1LbIdx].x + MATCH_W / 2} y={lbR2[r1m1LbIdx].y - 3} text="↓ LOSER OF UPPER R1 M0" />
            <OriginChip x={lbR2[r1m2LbIdx].x + MATCH_W / 2} y={lbR2[r1m2LbIdx].y - 3} text="↓ LOSER OF UPPER R1 M1" />
            <OriginChip x={lbR3[sm1R3Idx].x  + MATCH_W / 2} y={lbR3[sm1R3Idx].y  - 3} text="↓ LOSER OF UPPER SEMI M0" />
            <OriginChip x={lbR3[sm2R3Idx].x  + MATCH_W / 2} y={lbR3[sm2R3Idx].y  - 3} text="↓ LOSER OF UPPER SEMI M1" />
            <OriginChip x={lbFinal.x + MATCH_W / 2} y={lbFinal.y - 3} text="↓ LOSER OF UPPER FINAL" />
          </>
        );
      })()}

    </BracketWrapper>
  );
}