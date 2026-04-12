"use client";
import React, { useMemo } from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  AbsoluteFill,
  Img,
  Sequence,
} from "remotion";

/* ═══════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════ */

export interface ShufflePlayer {
  name: string;
  tag?: string;
  avatar?: string;
  rank?: string;
  tier?: number;
}

export interface ShuffleTeam {
  teamName: string;
  members: ShufflePlayer[];
  avgSkill?: number;
}

export interface ShuffleRevealProps {
  tournamentName: string;
  game: "valorant" | "dota" | "cs2";
  teams: ShuffleTeam[];
}

/* ═══════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════ */

const FPS = 30;
const INTRO_FRAMES = 90;
const SHUFFLE_FRAMES = 120;
const PLAYER_DRAFT_FRAMES = 42;
const TEAM_HOLD_FRAMES = 75;
const OUTRO_FRAMES = 270;

function getTeamFrames(memberCount: number) {
  return Math.min(memberCount, 5) * PLAYER_DRAFT_FRAMES + TEAM_HOLD_FRAMES;
}

export function getShuffleDuration(teamCount: number, membersPerTeam = 5) {
  return INTRO_FRAMES + SHUFFLE_FRAMES + teamCount * getTeamFrames(membersPerTeam) + OUTRO_FRAMES;
}

const THEMES = {
  valorant: { accent: "#3CCBFF", accentAlt: "#FF4655", bg: "#0A0F2A", bgCard: "#0d1530", rgb: "60,203,255" },
  dota:     { accent: "#A12B1F", accentAlt: "#FF6B4A", bg: "#0a0e18", bgCard: "#0f1520", rgb: "161,43,31" },
  cs2:      { accent: "#f0a500", accentAlt: "#FFD700", bg: "#0d0d0d", bgCard: "#151510", rgb: "240,165,0" },
};
type Theme = typeof THEMES.valorant;

/* ═══════════════════════════════════════════════
   HELPERS — lightweight, no spring unless needed
   ═══════════════════════════════════════════════ */

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

function fade(f: number, s: number, d = 15) { return interpolate(f, [s, s + d], [0, 1], clamp); }
function fadeOut(f: number, s: number, d = 10) { return interpolate(f, [s, s + d], [1, 0], clamp); }
function easeOut(t: number) { return 1 - (1 - t) * (1 - t) * (1 - t); }

/* ═══════════════════════════════════════════════
   AVATAR — memoized to prevent re-renders
   ═══════════════════════════════════════════════ */

const Avatar = React.memo(({ src, name, size, border, rgb }: { src?: string; name: string; size: number; border: string; rgb: string }) => {
  if (src) return <Img src={src} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border }} />;
  return <div style={{ width: size, height: size, borderRadius: "50%", border, background: `rgba(${rgb}, 0.15)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.4, fontWeight: 900, color: `rgba(${rgb}, 0.8)` }}>{(name || "?")[0].toUpperCase()}</div>;
});
Avatar.displayName = "Avatar";

/* ═══════════════════════════════════════════════
   SCENE 1: INTRO
   ═══════════════════════════════════════════════ */

function IntroScene({ frame, theme, tournamentName }: { frame: number; theme: Theme; tournamentName: string }) {
  const titleOp = fade(frame, 5, 20);
  const titleY = interpolate(frame, [5, 25], [30, 0], clamp);
  const btnOp = fade(frame, 30, 12);
  const btnScale = interpolate(frame, [30, 45], [0.8, 1], clamp);
  const isClicked = frame >= 60;
  const clickScale = isClicked ? interpolate(frame, [60, 65, 70], [1, 0.92, 1.05], clamp) : 1;
  const flash = interpolate(frame, [80, 85, 90], [0, 1, 0], clamp);

  return (
    <AbsoluteFill style={{ background: theme.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ opacity: titleOp, transform: `translateY(${titleY}px)`, fontSize: 22, fontWeight: 800, color: theme.accent, letterSpacing: 6, textTransform: "uppercase", marginBottom: 8 }}>Indian Esports</div>
      <div style={{ opacity: titleOp, transform: `translateY(${titleY}px)`, fontSize: 52, fontWeight: 900, color: "#fff", letterSpacing: -1, textAlign: "center", maxWidth: 900, lineHeight: 1.15, marginBottom: 60 }}>{tournamentName}</div>
      <div style={{ opacity: btnOp, transform: `scale(${btnScale * clickScale})` }}>
        <div style={{ padding: "22px 64px", borderRadius: 16, fontSize: 24, fontWeight: 900, color: "#fff", letterSpacing: 3, textTransform: "uppercase", background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentAlt})`, boxShadow: `0 0 40px rgba(${theme.rgb}, 0.4)`, border: `2px solid rgba(${theme.rgb}, 0.5)` }}>Shuffle Teams</div>
      </div>
      {flash > 0 && <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash }} />}
    </AbsoluteFill>
  );
}

/* ═══════════════════════════════════════════════
   SCENE 2: SHUFFLE — simplified vortex, max 20 cards
   ═══════════════════════════════════════════════ */

function ShuffleScene({ frame, theme, allPlayers }: { frame: number; theme: Theme; allPlayers: ShufflePlayer[] }) {
  // Limit to 20 cards for performance
  const cards = useMemo(() => allPlayers.slice(0, 20).map((p, i) => {
    const seed = (i * 137 + 42) % 100;
    return { name: p.name, baseAngle: (i / Math.min(allPlayers.length, 20)) * Math.PI * 2, radius: 180 + (seed % 40) * 5, speed: 0.08 + (seed % 30) * 0.003 };
  }), [allPlayers]);

  const scatter = interpolate(frame, [0, 15], [0, 1], clamp);
  const vortexSpeed = interpolate(frame, [15, 80], [1, 5], clamp);
  const collapse = interpolate(frame, [90, 115], [1, 0], clamp);
  const flash = interpolate(frame, [110, 115, 120], [0, 0.8, 0], clamp);

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <div style={{ position: "absolute", top: 80, left: "50%", transform: "translateX(-50%)", fontSize: 18, fontWeight: 800, color: theme.accent, letterSpacing: 8, textTransform: "uppercase", opacity: interpolate(frame, [5, 15, 90, 100], [0, 0.6, 0.6, 0], clamp) }}>
        Shuffling {allPlayers.length} Players...
      </div>
      {cards.map((card, i) => {
        const angle = card.baseAngle + frame * card.speed * vortexSpeed;
        const r = card.radius * collapse * scatter;
        return (
          <div key={i} style={{
            position: "absolute", left: 960 + Math.cos(angle) * r - 70, top: 540 + Math.sin(angle) * r * 0.6 - 16,
            width: 140, height: 32, borderRadius: 6,
            background: `rgba(${theme.rgb}, 0.12)`, border: `1px solid rgba(${theme.rgb}, 0.2)`,
            display: "flex", alignItems: "center", padding: "0 10px",
            opacity: scatter * collapse, fontSize: 12, fontWeight: 700, color: "#fff",
          }}>
            {card.name}
          </div>
        );
      })}
      {flash > 0 && <div style={{ position: "absolute", inset: 0, background: theme.accent, opacity: flash }} />}
    </AbsoluteFill>
  );
}

/* ═══════════════════════════════════════════════
   SCENE 3: TEAM DRAFT — spotlight center, card right, fly into slot
   ═══════════════════════════════════════════════ */

function TeamDraftScene({ frame, theme, team, teamIndex, fps, revealedTeams }: {
  frame: number; theme: Theme; team: ShuffleTeam; teamIndex: number; fps: number; revealedTeams: ShuffleTeam[];
}) {
  const members = team.members.slice(0, 5);
  const totalDraftFrames = members.length * PLAYER_DRAFT_FRAMES;
  const currentPlayerIdx = Math.min(Math.floor(frame / PLAYER_DRAFT_FRAMES), members.length - 1);
  const playerLocalFrame = frame - currentPlayerIdx * PLAYER_DRAFT_FRAMES;
  const inHoldPhase = frame >= totalDraftFrames;

  const spotlightEnd = 27;
  const inFly = playerLocalFrame >= spotlightEnd && !inHoldPhase;

  // Card layout
  const rightX = 1160;
  const rightY = 120;
  const cardW = 540;
  const slotPadTop = rightY + 98;
  const slotH = 52;

  // Hold phase: right → center → shrink left
  const holdFrame = frame - totalDraftFrames;
  const expandT = inHoldPhase ? interpolate(holdFrame, [0, 15], [0, 1], clamp) : 0;
  const shrinkT = inHoldPhase ? interpolate(holdFrame, [55, TEAM_HOLD_FRAMES], [0, 1], clamp) : 0;
  const shrinkE = easeOut(shrinkT);
  const expandE = easeOut(expandT);

  let cardX = rightX, cardY = rightY, cardScale = interpolate(frame, [0, 12], [0.9, 1], clamp);
  if (inHoldPhase) {
    if (shrinkT > 0) {
      cardX = interpolate(shrinkE, [0, 1], [660, -600]);
      cardY = interpolate(shrinkE, [0, 1], [140, 200]);
      cardScale = interpolate(shrinkE, [0, 1], [1.15, 0.3]);
    } else {
      cardX = interpolate(expandE, [0, 1], [rightX, 660]);
      cardY = interpolate(expandE, [0, 1], [rightY, 140]);
      cardScale = interpolate(expandE, [0, 1], [1, 1.15]);
    }
  }

  // Spotlight position & fly
  const spotX = 960, spotY = 460;

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      {/* Sidebar */}
      <PreviousTeamsSidebar theme={theme} revealedTeams={revealedTeams} currentTeamIndex={teamIndex} />

      {/* Player spotlight → fly into card */}
      {!inHoldPhase && (() => {
        const player = members[currentPlayerIdx];
        const enterOp = fade(frame, currentPlayerIdx * PLAYER_DRAFT_FRAMES, 8);
        const enterScale = interpolate(playerLocalFrame, [0, 10], [0.7, 1], clamp);

        const flyRaw = inFly ? interpolate(playerLocalFrame, [spotlightEnd, PLAYER_DRAFT_FRAMES], [0, 1], clamp) : 0;
        const flyP = easeOut(flyRaw);
        const targetX = rightX + 48;
        const targetY = slotPadTop + currentPlayerIdx * (slotH + 8) + slotH / 2;
        const flyX = flyP * (targetX - spotX);
        const flyY = flyP * (targetY - spotY);
        const flyScale = interpolate(flyP, [0, 1], [1, 0.2]);
        const spotOp = interpolate(flyP, [0, 0.8, 1], [1, 0.6, 0]);

        return (
          <div style={{
            position: "absolute", left: spotX + flyX, top: spotY + flyY,
            transform: `translate(-50%, -50%) scale(${enterScale * flyScale})`,
            opacity: enterOp * spotOp,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: `rgba(${theme.rgb}, 0.5)`, letterSpacing: 4, textTransform: "uppercase", opacity: 1 - flyP }}>
              Player {currentPlayerIdx + 1} of {members.length}
            </div>
            <Avatar src={player.avatar} name={player.name} size={260} border={`5px solid ${theme.accent}`} rgb={theme.rgb} />
            <div style={{ textAlign: "center", opacity: 1 - flyP * 1.5 }}>
              <div style={{ fontSize: 44, fontWeight: 900, color: "#fff", letterSpacing: 1 }}>{player.name}</div>
              {player.tag && <div style={{ fontSize: 18, fontWeight: 500, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>#{player.tag}</div>}
            </div>
            {player.rank && (
              <div style={{ fontSize: 20, fontWeight: 800, color: theme.accent, padding: "8px 28px", borderRadius: 100, background: `rgba(${theme.rgb}, 0.12)`, border: `2px solid rgba(${theme.rgb}, 0.3)`, opacity: 1 - flyP * 1.5 }}>
                {player.rank}
              </div>
            )}
          </div>
        );
      })()}

      {/* Team card */}
      <div style={{
        position: "absolute", left: cardX, top: cardY, width: cardW,
        opacity: shrinkT > 0.9 ? fadeOut(frame, totalDraftFrames + TEAM_HOLD_FRAMES - 4, 4) : 1,
        transform: `scale(${cardScale})`, transformOrigin: "top left",
        background: theme.bgCard, border: `1px solid rgba(${theme.rgb}, ${inHoldPhase && shrinkT === 0 ? 0.3 : 0.15})`,
        borderRadius: 20, padding: "28px 32px",
        boxShadow: `0 16px 60px rgba(0,0,0,0.5)`,
      }}>
        <div style={{ position: "absolute", top: -14, right: 20, fontSize: 120, fontWeight: 900, color: `rgba(${theme.rgb}, 0.05)`, lineHeight: 1 }}>
          {String(teamIndex + 1).padStart(2, "0")}
        </div>
        <div style={{ position: "relative", zIndex: 1, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.accent, letterSpacing: 4, textTransform: "uppercase", marginBottom: 4 }}>Team {teamIndex + 1}</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: 1 }}>{team.teamName}</div>
        </div>
        <div style={{ height: 2, background: `linear-gradient(90deg, ${theme.accent}, transparent)`, marginBottom: 14, borderRadius: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, position: "relative", zIndex: 1 }}>
          {members.map((player, i) => {
            const playerDoneFrame = (i + 1) * PLAYER_DRAFT_FRAMES;
            const isPlaced = frame >= playerDoneFrame || inHoldPhase;
            const justPlaced = frame >= playerDoneFrame && frame < playerDoneFrame + 10;

            if (!isPlaced) {
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.06)", borderRadius: 10, height: 44 }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.08)" }} />
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.1)", fontWeight: 600 }}>Drafting...</div>
                </div>
              );
            }

            const placeOp = fade(frame, playerDoneFrame, 6);
            const placeScale = interpolate(frame, [playerDoneFrame, playerDoneFrame + 8], [0.9, 1], clamp);
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "7px 12px",
                background: justPlaced ? `rgba(${theme.rgb}, 0.1)` : `rgba(${theme.rgb}, ${0.03 + (i % 2) * 0.02})`,
                border: `1px solid ${justPlaced ? `rgba(${theme.rgb}, 0.3)` : `rgba(${theme.rgb}, 0.06)`}`,
                borderRadius: 10, opacity: placeOp, transform: `scale(${placeScale})`,
              }}>
                <Avatar src={player.avatar} name={player.name} size={30} border={`2px solid rgba(${theme.rgb}, 0.25)`} rgb={theme.rgb} />
                <div style={{ flex: 1, fontSize: 14, fontWeight: 800, color: "#fff" }}>
                  {player.name}{player.tag && <span style={{ color: "rgba(255,255,255,0.25)", fontWeight: 500, marginLeft: 3 }}>#{player.tag}</span>}
                </div>
                {player.rank && <div style={{ fontSize: 11, fontWeight: 700, color: theme.accent, padding: "3px 10px", borderRadius: 100, background: `rgba(${theme.rgb}, 0.08)`, border: `1px solid rgba(${theme.rgb}, 0.15)` }}>{player.rank}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {!inHoldPhase && (
        <div style={{ position: "absolute", bottom: 50, left: spotX, transform: "translateX(-50%)", fontSize: 13, fontWeight: 700, color: `rgba(${theme.rgb}, 0.35)`, letterSpacing: 4, textTransform: "uppercase" }}>
          Drafting for {team.teamName}
        </div>
      )}
    </AbsoluteFill>
  );
}

/* ═══════════════════════════════════════════════
   SIDEBAR
   ═══════════════════════════════════════════════ */

const PreviousTeamsSidebar = React.memo(({ theme, revealedTeams, currentTeamIndex }: { theme: Theme; revealedTeams: ShuffleTeam[]; currentTeamIndex: number }) => {
  if (revealedTeams.length === 0) return null;
  const maxVisible = 3;
  const startIdx = Math.max(0, revealedTeams.length - maxVisible);
  const visible = revealedTeams.slice(startIdx);

  return (
    <div style={{ position: "absolute", left: 24, top: 80, bottom: 30, width: 520, display: "flex", flexDirection: "column", gap: 12, justifyContent: "flex-end", zIndex: 10, overflow: "hidden" }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: `rgba(${theme.rgb}, 0.5)`, letterSpacing: 4, textTransform: "uppercase", marginBottom: 6 }}>
        Teams Revealed ({revealedTeams.length})
      </div>
      {visible.map((team, vi) => {
        const actualIdx = startIdx + vi;
        const isLatest = actualIdx === revealedTeams.length - 1;
        const ageOp = isLatest ? 1 : vi === visible.length - 2 ? 0.7 : 0.45;
        return (
          <div key={actualIdx} style={{ background: isLatest ? `rgba(${theme.rgb}, 0.08)` : "rgba(255,255,255,0.03)", border: `1px solid ${isLatest ? `rgba(${theme.rgb}, 0.25)` : "rgba(255,255,255,0.06)"}`, borderRadius: 14, padding: "14px 20px", opacity: ageOp }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: theme.accent, letterSpacing: 3, textTransform: "uppercase" }}>Team {actualIdx + 1}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", marginBottom: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{team.teamName}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {team.members.slice(0, 5).map((p, j) => (
                <div key={j} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18, color: "rgba(255,255,255,0.75)" }}>
                  <Avatar src={p.avatar} name={p.name} size={32} border="none" rgb={theme.rgb} />
                  <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{p.name}</span>
                  {p.rank && <span style={{ fontSize: 13, color: `rgba(${theme.rgb}, 0.6)`, fontWeight: 700 }}>{p.rank}</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
});
PreviousTeamsSidebar.displayName = "PreviousTeamsSidebar";

/* ═══════════════════════════════════════════════
   SCENE 4: OUTRO
   ═══════════════════════════════════════════════ */

function OutroScene({ frame, theme, teams, tournamentName, fps }: { frame: number; theme: Theme; teams: ShuffleTeam[]; tournamentName: string; fps: number }) {
  const cols = teams.length <= 6 ? 3 : teams.length <= 8 ? 4 : 5;
  const showInstructions = frame >= 150;
  const instrOp = fade(frame, 150, 20);
  const gridOp = showInstructions ? 0 : 1;
  const lockedOp = fade(frame, 60, 10);
  const lockedScale = interpolate(frame, [60, 75], [0.8, 1], clamp);

  return (
    <AbsoluteFill style={{ background: theme.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      {!showInstructions && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 20, width: "96%", maxWidth: 1860, opacity: gridOp, padding: "0 20px" }}>
            {teams.map((team, i) => {
              const co = fade(frame, i * 4, 10);
              const cs = interpolate(frame, [i * 4, i * 4 + 10], [0.9, 1], clamp);
              return (
                <div key={i} style={{ background: theme.bgCard, border: `1px solid rgba(${theme.rgb}, 0.12)`, borderRadius: 16, padding: "16px 18px", opacity: co, transform: `scale(${cs})` }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: theme.accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 3 }}>Team {i + 1}</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", marginBottom: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{team.teamName}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {team.members.slice(0, 5).map((p, j) => (
                      <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, color: "rgba(255,255,255,0.75)" }}>
                        <Avatar src={p.avatar} name={p.name} size={24} border="none" rgb={theme.rgb} />
                        <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{p.name}</span>
                        {p.rank && <span style={{ fontSize: 12, color: `rgba(${theme.rgb}, 0.7)`, fontWeight: 700, flexShrink: 0 }}>{p.rank}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 28, textAlign: "center", opacity: lockedOp, transform: `scale(${lockedScale})` }}>
            <div style={{ fontSize: 42, fontWeight: 900, color: "#fff", letterSpacing: 6, textTransform: "uppercase" }}>Teams Locked</div>
          </div>
        </>
      )}
      {showInstructions && (
        <div style={{ opacity: instrOp, display: "flex", flexDirection: "column", alignItems: "center", gap: 24, maxWidth: 800, textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: "#fff", letterSpacing: 2 }}>{tournamentName}</div>
          <div style={{ background: `rgba(${theme.rgb}, 0.06)`, border: `1px solid rgba(${theme.rgb}, 0.15)`, borderRadius: 16, padding: "20px 28px", width: "100%" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: theme.accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>How to customize your team</div>
            <div style={{ fontSize: 15, color: "rgba(255,255,255,0.7)", lineHeight: 1.8, fontWeight: 500 }}>
              All participants can set a custom team name and logo from the tournament page. Open your tournament, go to the Teams tab, and click "Edit" on your team card.
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: theme.accent, letterSpacing: 3 }}>iesports.in</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 6, fontWeight: 500 }}>Visit for tournament details, schedules & results</div>
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPOSITION
   ═══════════════════════════════════════════════ */

export const ShuffleRevealComposition: React.FC<ShuffleRevealProps> = ({ tournamentName, game, teams }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = THEMES[game] || THEMES.valorant;
  const allPlayers = useMemo(() => teams.flatMap(t => t.members), [teams]);

  const teamRevealStart = INTRO_FRAMES + SHUFFLE_FRAMES;
  const teamFramesList = useMemo(() => teams.map(t => getTeamFrames(Math.min(t.members.length, 5))), [teams]);
  const teamStarts = useMemo(() => teams.map((_, i) => teamRevealStart + teamFramesList.slice(0, i).reduce((a, b) => a + b, 0)), [teams, teamFramesList]);
  const outroStart = teamRevealStart + teamFramesList.reduce((a, b) => a + b, 0);

  const revealedTeams = useMemo(() => {
    const r: ShuffleTeam[] = [];
    for (let i = 0; i < teams.length; i++) {
      if (frame >= teamStarts[i] + teamFramesList[i]) r.push(teams[i]);
    }
    return r;
  }, [frame, teams, teamStarts, teamFramesList]);

  return (
    <AbsoluteFill style={{ background: theme.bg, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <IntroScene frame={frame} theme={theme} tournamentName={tournamentName} />
      </Sequence>
      <Sequence from={INTRO_FRAMES} durationInFrames={SHUFFLE_FRAMES}>
        <ShuffleScene frame={frame - INTRO_FRAMES} theme={theme} allPlayers={allPlayers} />
      </Sequence>
      {teams.map((team, i) => (
        <Sequence key={i} from={teamStarts[i]} durationInFrames={teamFramesList[i]}>
          <TeamDraftScene frame={frame - teamStarts[i]} theme={theme} team={team} teamIndex={i} fps={fps} revealedTeams={revealedTeams} />
        </Sequence>
      ))}
      <Sequence from={outroStart} durationInFrames={OUTRO_FRAMES}>
        <OutroScene frame={frame - outroStart} theme={theme} teams={teams} tournamentName={tournamentName} fps={fps} />
      </Sequence>

      {/* Persistent logos */}
      <div style={{ position: "absolute", top: 24, left: 28, zIndex: 50, display: "flex", alignItems: "center", gap: 10, opacity: interpolate(frame, [10, 25], [0, 0.7], clamp) }}>
        <Img src="/ielogo.png" style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover" }} />
        <div style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.5)", letterSpacing: 3, textTransform: "uppercase" }}>IEsports</div>
      </div>
      <div style={{ position: "absolute", top: 24, right: 28, zIndex: 50, opacity: interpolate(frame, [10, 25], [0, 0.5], clamp) }}>
        <Img src={game === "valorant" ? "/valorantlogo.png" : game === "cs2" ? "/cs2logo.png" : "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png"} style={{ width: 48, height: 48, objectFit: "contain" }} />
      </div>
      <div style={{ position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)", zIndex: 50, fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.2)", letterSpacing: 2, opacity: interpolate(frame, [30, 50], [0, 1], clamp) }}>
        iesports.in
      </div>
    </AbsoluteFill>
  );
};
