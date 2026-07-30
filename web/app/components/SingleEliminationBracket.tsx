"use client";

/**
 * Clean single-elimination bracket view — semifinals feeding a final, no
 * lower bracket. DoubleBracket.tsx's 3/4/8-team layouts always draw an
 * "Upper Bracket" + "Lower Bracket" shape (see its Bracket3/Bracket4/Bracket8
 * functions), which is correct for double elimination but wrong for a true
 * single-elim playoff — reusing it here would show a permanent, unusable
 * "Lower Bracket" section. This component is purpose-built for the small
 * single-elim shapes CS2 uses today: 2 teams (final only) or 4 teams
 * (2 semifinals -> final).
 *
 * Expects fixed match ids so it can find semis/final regardless of order:
 * "cs2-sf1", "cs2-sf2" (4-team only), "cs2-final".
 */

interface BracketMatchDoc {
  id: string;
  team1Id?: string;
  team2Id?: string;
  team1Name?: string;
  team2Name?: string;
  team1Score?: number;
  team2Score?: number;
  status?: string;
  matchIndex?: number;
}

interface Props {
  matches: BracketMatchDoc[];
  bracketSize: number;
  bracketBestOf?: number;
  grandFinalBestOf?: number;
  tournamentId?: string;
  teamLogos?: Record<string, string>;
}

const C = {
  bg: "#0A0A0C",
  cardBg: "#121215",
  cardBorder: "#2A2A30",
  text: "#F0EEEA",
  textMuted: "#555550",
  textPlaceholder: "#3a3a42",
  accent: "#3CCBFF",
  accentLight: "rgba(60,203,255,0.1)",
  accentBorder: "rgba(60,203,255,0.25)",
  win: "#4ade80",
  winBg: "rgba(22,163,74,0.12)",
  winBorder: "rgba(34,197,94,0.3)",
  loss: "#f87171",
  live: "#f59e0b",
  liveBg: "rgba(245,158,11,0.12)",
  connector: "#3a3a42",
};

function getInitials(name: string | undefined): string {
  if (!name || name === "TBD") return "?";
  const clean = name.replace(/\[.*?\]\s*/, "");
  return clean.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 3);
}

function TeamSlot({ id, name, score, isWinner, isLoser, isComplete, isLive, logoUrl }: {
  id?: string; name?: string; score?: number; isWinner: boolean; isLoser: boolean;
  isComplete: boolean; isLive: boolean; logoUrl?: string;
}) {
  const isTBD = !id || id === "TBD";
  let nameColor = isTBD ? C.textPlaceholder : C.text;
  if (isWinner) nameColor = C.win;
  else if (isLoser) nameColor = C.loss;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
      background: isWinner ? C.winBg : "transparent", borderRadius: 6,
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: 5, flexShrink: 0,
        background: isTBD ? C.connector : C.accentLight,
        border: `1px solid ${isTBD ? C.cardBorder : C.accentBorder}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}>
        {logoUrl && !isTBD ? (
          <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: 9, fontWeight: 800, color: isTBD ? C.textPlaceholder : C.accent }}>{getInitials(name)}</span>
        )}
      </div>
      <span style={{ flex: 1, fontSize: "0.82rem", fontWeight: isWinner ? 800 : 600, color: nameColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {name || "TBD"}
      </span>
      <span style={{
        minWidth: 22, textAlign: "center", fontSize: "0.82rem", fontWeight: 800,
        color: isWinner ? C.win : isComplete ? C.textMuted : isLive ? C.live : C.textPlaceholder,
      }}>
        {(isComplete || isLive) ? (score ?? 0) : "–"}
      </span>
    </div>
  );
}

function MatchBox({ match, label, bestOf, tournamentId }: { match: BracketMatchDoc; label: string; bestOf: number; tournamentId?: string }) {
  const isComplete = match.status === "completed";
  const isLive = match.status === "live";
  const t1Win = isComplete && (match.team1Score ?? 0) > (match.team2Score ?? 0);
  const t2Win = isComplete && (match.team2Score ?? 0) > (match.team1Score ?? 0);
  const clickable = !!tournamentId && match.team1Id && match.team1Id !== "TBD" && match.team2Id && match.team2Id !== "TBD";

  const inner = (
    <div style={{
      width: 260, borderRadius: 8, background: C.cardBg,
      border: `1px solid ${isLive ? C.live : isComplete ? C.winBorder : C.cardBorder}`,
      overflow: "hidden",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderBottom: `1px solid ${C.connector}` }}>
        <span style={{ fontSize: "0.6rem", fontWeight: 800, color: C.textMuted, letterSpacing: "0.06em" }}>{label}</span>
        <span style={{ fontSize: "0.6rem", fontWeight: 800, color: C.accent }}>BO{bestOf}</span>
      </div>
      <TeamSlot id={match.team1Id} name={match.team1Name} score={match.team1Score} isWinner={t1Win} isLoser={t2Win} isComplete={isComplete} isLive={isLive} />
      <div style={{ height: 1, background: C.connector, margin: "0 10px" }} />
      <TeamSlot id={match.team2Id} name={match.team2Name} score={match.team2Score} isWinner={t2Win} isLoser={t1Win} isComplete={isComplete} isLive={isLive} />
    </div>
  );

  if (!clickable) return inner;
  return (
    <a href={`/cs2/match/${tournamentId}/${match.id}`} style={{ textDecoration: "none", cursor: "pointer" }}>
      {inner}
    </a>
  );
}

const TBD_MATCH = (id: string): BracketMatchDoc => ({ id, team1Id: "TBD", team2Id: "TBD", team1Name: "TBD", team2Name: "TBD", team1Score: 0, team2Score: 0, status: "pending" });

export default function SingleEliminationBracket({ matches, bracketSize, bracketBestOf = 3, grandFinalBestOf = 3, tournamentId }: Props) {
  const byId: Record<string, BracketMatchDoc> = {};
  matches.forEach(m => { byId[m.id] = m; });

  const final = byId["cs2-final"] || TBD_MATCH("cs2-final");

  if (bracketSize <= 2) {
    return (
      <div style={{ background: C.bg, borderRadius: 16, border: `1px solid ${C.cardBorder}`, padding: "32px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: "0.7rem", fontWeight: 900, letterSpacing: "0.15em", color: C.live, textTransform: "uppercase" }}>Grand Final</span>
        <MatchBox match={final} label="FINAL" bestOf={grandFinalBestOf} tournamentId={tournamentId} />
      </div>
    );
  }

  const sf1 = byId["cs2-sf1"] || TBD_MATCH("cs2-sf1");
  const sf2 = byId["cs2-sf2"] || TBD_MATCH("cs2-sf2");

  return (
    <div style={{ background: C.bg, borderRadius: 16, border: `1px solid ${C.cardBorder}`, padding: "24px", overflowX: "auto" }}>
      <div style={{ display: "flex", gap: 56, alignItems: "center", justifyContent: "center", minWidth: 620 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
          <span style={{ fontSize: "0.66rem", fontWeight: 900, letterSpacing: "0.14em", color: "#E6E6E6", textAlign: "center" }}>SEMIFINALS</span>
          <MatchBox match={sf1} label="SF1" bestOf={bracketBestOf} tournamentId={tournamentId} />
          <MatchBox match={sf2} label="SF2" bestOf={bracketBestOf} tournamentId={tournamentId} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "0.66rem", fontWeight: 900, letterSpacing: "0.14em", color: C.live, textAlign: "center" }}>GRAND FINAL</span>
          <MatchBox match={final} label="FINAL" bestOf={grandFinalBestOf} tournamentId={tournamentId} />
        </div>
      </div>
      <p style={{ margin: "20px 0 0", textAlign: "center", color: C.textMuted, fontSize: "0.76rem" }}>
        Top 2 from each group qualify · winners of SF1 &amp; SF2 meet in the final
      </p>
    </div>
  );
}
