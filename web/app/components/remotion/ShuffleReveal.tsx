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
   CONSTANTS & THEME
   ═══════════════════════════════════════════════ */

const FPS = 30;
const INTRO_FRAMES = 90;
const SHUFFLE_FRAMES = 120;
const PLAYER_DRAFT_FRAMES = 42;   // 1.4s per player: spotlight + fly into card
const TEAM_HOLD_FRAMES = 75;      // 2.5s freeze after all players placed
const OUTRO_FRAMES = 270;

function getTeamFrames(memberCount: number) {
  return Math.min(memberCount, 5) * PLAYER_DRAFT_FRAMES + TEAM_HOLD_FRAMES;
}

export function getShuffleDuration(teamCount: number, membersPerTeam = 5) {
  return INTRO_FRAMES + SHUFFLE_FRAMES + teamCount * getTeamFrames(membersPerTeam) + OUTRO_FRAMES;
}

const GAME_THEMES = {
  valorant: { accent: "#3CCBFF", accentAlt: "#FF4655", bg: "#0A0F2A", bgCard: "#0d1530", rgb: "60,203,255" },
  dota:     { accent: "#A12B1F", accentAlt: "#FF6B4A", bg: "#0a0e18", bgCard: "#0f1520", rgb: "161,43,31" },
  cs2:      { accent: "#f0a500", accentAlt: "#FFD700", bg: "#0d0d0d", bgCard: "#151510", rgb: "240,165,0" },
};

type Theme = typeof GAME_THEMES.valorant;

/* ═══════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════ */

function fade(f: number, s: number, d = 15) { return interpolate(f, [s, s + d], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }); }
function fadeOut(f: number, s: number, d = 10) { return interpolate(f, [s, s + d], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }); }
function slideX(f: number, s: number, dist = 60, d = 20) { return interpolate(f, [s, s + d], [dist, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }); }
function slideY(f: number, s: number, dist = 30, d = 20) { return interpolate(f, [s, s + d], [dist, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }); }
function GridBg({ rgb }: { rgb: string }) { return <div style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(rgba(${rgb},0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(${rgb},0.03) 1px, transparent 1px)`, backgroundSize: "80px 80px" }} />; }

/* ═══════════════════════════════════════════════
   SCENE 1: INTRO
   ═══════════════════════════════════════════════ */

function IntroScene({ frame, theme, tournamentName }: { frame: number; theme: Theme; tournamentName: string }) {
  const logoOpacity = fade(frame, 0, 20);
  const logoY = slideY(frame, 0, 40, 25);
  const titleOpacity = fade(frame, 10, 15);
  const titleY = slideY(frame, 10, 30, 20);
  const btnOpacity = fade(frame, 30, 12);
  const btnScale = frame >= 30 ? spring({ frame: frame - 30, fps: FPS, config: { damping: 10, stiffness: 80 } }) : 0;
  const isClicked = frame >= 60;
  const clickScale = isClicked ? interpolate(frame, [60, 65, 70], [1, 0.92, 1.05], { extrapolateRight: "clamp" }) : 1;
  const clickGlow = isClicked ? interpolate(frame, [60, 70, 85], [0, 1, 0], { extrapolateRight: "clamp" }) : 0;
  const ringScale = isClicked ? interpolate(frame, [65, 90], [0, 8], { extrapolateRight: "clamp" }) : 0;
  const ringOpacity = isClicked ? interpolate(frame, [65, 85], [0.8, 0], { extrapolateRight: "clamp" }) : 0;
  const flash = interpolate(frame, [80, 85, 90], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const breathe = 0.6 + 0.4 * Math.sin(frame * 0.06);

  return (
    <AbsoluteFill style={{ background: theme.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <GridBg rgb={theme.rgb} />
      <div style={{ position: "absolute", width: 600, height: 600, borderRadius: "50%", background: `radial-gradient(circle, rgba(${theme.rgb},${0.12 * breathe}), transparent 70%)`, top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
      <div style={{ opacity: logoOpacity, transform: `translateY(${logoY}px)`, fontSize: 22, fontWeight: 800, color: theme.accent, letterSpacing: 6, textTransform: "uppercase", marginBottom: 8 }}>Indian Esports</div>
      <div style={{ opacity: titleOpacity, transform: `translateY(${titleY}px)`, fontSize: 52, fontWeight: 900, color: "#fff", letterSpacing: -1, textAlign: "center", maxWidth: 900, lineHeight: 1.15, marginBottom: 60 }}>{tournamentName}</div>
      <div style={{ opacity: btnOpacity, transform: `scale(${btnScale * clickScale})`, position: "relative" }}>
        <div style={{ padding: "22px 64px", borderRadius: 16, fontSize: 24, fontWeight: 900, color: "#fff", letterSpacing: 3, textTransform: "uppercase", background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentAlt})`, boxShadow: `0 0 ${40 + clickGlow * 80}px rgba(${theme.rgb}, ${0.4 + clickGlow * 0.6})`, border: `2px solid rgba(${theme.rgb}, ${0.5 + clickGlow * 0.5})` }}>Shuffle Teams</div>
        {isClicked && <div style={{ position: "absolute", top: "50%", left: "50%", width: 80, height: 80, borderRadius: "50%", border: `3px solid ${theme.accent}`, transform: `translate(-50%, -50%) scale(${ringScale})`, opacity: ringOpacity }} />}
      </div>
      {flash > 0 && <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash }} />}
    </AbsoluteFill>
  );
}

/* ═══════════════════════════════════════════════
   SCENE 2: SHUFFLE CHAOS
   ═══════════════════════════════════════════════ */

function ShuffleScene({ frame, theme, allPlayers }: { frame: number; theme: Theme; allPlayers: ShufflePlayer[] }) {
  const cards = useMemo(() => allPlayers.map((p, i) => {
    const seed = (i * 137 + 42) % 100;
    return { ...p, baseAngle: (i / allPlayers.length) * Math.PI * 2, radius: 180 + (seed % 40) * 5, speed: 0.08 + (seed % 30) * 0.003, offsetY: (seed % 20) - 10 };
  }), [allPlayers]);
  const scatter = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const vortexSpeed = interpolate(frame, [15, 80], [1, 5], { extrapolateRight: "clamp" });
  const collapse = interpolate(frame, [90, 115], [1, 0], { extrapolateRight: "clamp" });
  const finalFlash = interpolate(frame, [110, 115, 120], [0, 0.8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <GridBg rgb={theme.rgb} />
      <div style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", background: `radial-gradient(circle, rgba(${theme.rgb},0.15), transparent 70%)`, top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />
      <div style={{ position: "absolute", top: 80, left: "50%", transform: "translateX(-50%)", fontSize: 18, fontWeight: 800, color: theme.accent, letterSpacing: 8, textTransform: "uppercase", opacity: interpolate(frame, [5, 15, 90, 100], [0, 0.6, 0.6, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>Shuffling {allPlayers.length} Players...</div>
      {cards.map((card, i) => {
        const angle = card.baseAngle + frame * card.speed * vortexSpeed;
        const r = card.radius * collapse * scatter;
        const x = 960 + Math.cos(angle) * r;
        const y = 540 + Math.sin(angle) * r * 0.6 + card.offsetY;
        const rotation = frame * card.speed * 40 * vortexSpeed;
        return (
          <div key={i} style={{ position: "absolute", left: x - 80, top: y - 18, width: 160, height: 36, borderRadius: 8, background: `rgba(${theme.rgb}, 0.12)`, border: `1px solid rgba(${theme.rgb}, 0.25)`, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", opacity: scatter * collapse, transform: `rotate(${rotation % 360}deg) scale(${0.7 + scatter * 0.3})`, fontSize: 13, fontWeight: 700, color: "#fff", boxShadow: `0 0 12px rgba(${theme.rgb}, 0.15)` }}>
            {card.avatar ? <Img src={card.avatar} style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover" }} /> : <div style={{ width: 22, height: 22, borderRadius: "50%", background: `rgba(${theme.rgb}, 0.3)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800 }}>{(card.name || "?")[0].toUpperCase()}</div>}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.name}</span>
          </div>
        );
      })}
      {finalFlash > 0 && <div style={{ position: "absolute", inset: 0, background: theme.accent, opacity: finalFlash }} />}
    </AbsoluteFill>
  );
}

/* ═══════════════════════════════════════════════
   SCENE 3: UNIFIED TEAM DRAFT
   Shows team card on right building up.
   Each player spotlights center → flies into card.
   ═══════════════════════════════════════════════ */

function TeamDraftScene({ frame, theme, team, teamIndex, fps, revealedTeams }: {
  frame: number; theme: Theme; team: ShuffleTeam; teamIndex: number; fps: number; revealedTeams: ShuffleTeam[];
}) {
  const members = team.members.slice(0, 5);
  const totalDraftFrames = members.length * PLAYER_DRAFT_FRAMES;

  // Which player is currently being drafted?
  const currentPlayerIdx = Math.min(Math.floor(frame / PLAYER_DRAFT_FRAMES), members.length - 1);
  const playerLocalFrame = frame - currentPlayerIdx * PLAYER_DRAFT_FRAMES;
  const inHoldPhase = frame >= totalDraftFrames;

  // Spotlight phase: 0-27, Fly phase: 27-42
  const spotlightEnd = 27;
  const inSpotlight = playerLocalFrame < spotlightEnd && !inHoldPhase;
  const inFly = playerLocalFrame >= spotlightEnd && !inHoldPhase;

  // Team card (right side) — always visible, fades in at start
  const cardOpacity = fade(frame, 0, 12);
  const cardScale = frame >= 0 ? spring({ frame, fps, config: { damping: 14, stiffness: 60 } }) : 0;

  // Layout positions (1920x1080)
  const cardX = 1160;
  const cardY = 120;
  const cardW = 540;
  const cardHeaderH = 70;   // team header + divider
  const slotH = 52;         // height per player slot
  const slotPadTop = cardY + cardHeaderH + 28; // top of first slot

  // Spotlight: true center of screen
  const spotCenterX = 960;
  const spotCenterY = 460;

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <GridBg rgb={theme.rgb} />

      {/* Ambient glow behind spotlight */}
      {!inHoldPhase && (
        <div style={{ position: "absolute", width: 700, height: 700, borderRadius: "50%", background: `radial-gradient(circle, rgba(${theme.rgb},0.12), transparent 70%)`, top: spotCenterY, left: spotCenterX, transform: "translate(-50%, -50%)" }} />
      )}

      {/* ── LEFT: Previous teams sidebar ── */}
      <PreviousTeamsSidebar theme={theme} revealedTeams={revealedTeams} currentTeamIndex={teamIndex} />

      {/* ── CENTER: Player spotlight → flies into team card slot ── */}
      {!inHoldPhase && (() => {
        const player = members[currentPlayerIdx];
        const enterScale = spring({ frame: Math.max(0, playerLocalFrame), fps, config: { damping: 12, stiffness: 100 } });

        // Target: exact position of this player's slot in the team card
        const targetX = cardX + 48;  // left edge of avatar in slot
        const targetY = slotPadTop + currentPlayerIdx * (slotH + 8) + slotH / 2;

        // Fly: use spring for organic feel
        const flyRaw = inFly ? interpolate(playerLocalFrame, [spotlightEnd, PLAYER_DRAFT_FRAMES], [0, 1], { extrapolateRight: "clamp" }) : 0;
        // Ease-out curve for smooth deceleration
        const flyProgress = 1 - Math.pow(1 - flyRaw, 3);

        const flyX = flyProgress * (targetX - spotCenterX);
        const flyY = flyProgress * (targetY - spotCenterY);
        const flyScale = interpolate(flyProgress, [0, 1], [1, 0.22]);
        const spotOpacity = interpolate(flyProgress, [0, 0.8, 1], [1, 0.6, 0]);

        // Glow trail during fly
        const trailOpacity = inFly ? interpolate(flyProgress, [0, 0.3, 1], [0, 0.5, 0]) : 0;

        return (
          <>
            {/* Glow trail */}
            {trailOpacity > 0 && (
              <div style={{
                position: "absolute",
                left: spotCenterX + flyX * 0.5, top: spotCenterY + flyY * 0.5,
                width: 80, height: 80, borderRadius: "50%",
                background: `radial-gradient(circle, rgba(${theme.rgb}, ${trailOpacity * 0.3}), transparent)`,
                transform: "translate(-50%, -50%)",
                filter: "blur(20px)",
              }} />
            )}

            <div style={{
              position: "absolute", left: spotCenterX + flyX, top: spotCenterY + flyY,
              transform: `translate(-50%, -50%) scale(${enterScale * flyScale})`,
              opacity: spotOpacity,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
            }}>
              {/* Player number */}
              <div style={{ fontSize: 13, fontWeight: 700, color: `rgba(${theme.rgb}, 0.5)`, letterSpacing: 4, textTransform: "uppercase", opacity: 1 - flyProgress }}>
                Player {currentPlayerIdx + 1} of {members.length}
              </div>

              {/* Hero avatar — 4x size with dramatic shadow */}
              {player.avatar ? (
                <Img src={player.avatar} style={{ width: 260, height: 260, borderRadius: "50%", objectFit: "cover", border: `5px solid ${theme.accent}`, boxShadow: `0 0 ${80 - flyProgress * 70}px rgba(${theme.rgb}, ${0.6 - flyProgress * 0.5}), 0 20px 60px rgba(0,0,0,0.6)` }} />
              ) : (
                <div style={{ width: 260, height: 260, borderRadius: "50%", border: `5px solid ${theme.accent}`, background: `linear-gradient(135deg, rgba(${theme.rgb}, 0.2), rgba(${theme.rgb}, 0.05))`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 100, fontWeight: 900, color: theme.accent, boxShadow: `0 0 ${80 - flyProgress * 70}px rgba(${theme.rgb}, ${0.6 - flyProgress * 0.5}), 0 20px 60px rgba(0,0,0,0.6)` }}>
                  {(player.name || "?")[0].toUpperCase()}
                </div>
              )}

              {/* Name + tag (fades out during fly) */}
              <div style={{ textAlign: "center", opacity: 1 - flyProgress * 1.5 }}>
                <div style={{ fontSize: 44, fontWeight: 900, color: "#fff", letterSpacing: 1, textShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>{player.name}</div>
                {player.tag && <div style={{ fontSize: 18, fontWeight: 500, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>#{player.tag}</div>}
              </div>

              {/* Rank (fades out during fly) */}
              {player.rank && (
                <div style={{ fontSize: 20, fontWeight: 800, color: theme.accent, padding: "8px 28px", borderRadius: 100, background: `rgba(${theme.rgb}, 0.12)`, border: `2px solid rgba(${theme.rgb}, 0.3)`, boxShadow: `0 0 20px rgba(${theme.rgb}, 0.2)`, opacity: 1 - flyProgress * 1.5 }}>
                  {player.rank}
                </div>
              )}
            </div>
          </>
        );
      })()}

      {/* ── RIGHT: Team card (builds progressively) ── */}
      <div style={{
        position: "absolute", left: cardX, top: cardY, width: cardW,
        opacity: cardOpacity, transform: `scale(${Math.min(cardScale, 1)})`,
        background: theme.bgCard, border: `1px solid rgba(${theme.rgb}, 0.15)`,
        borderRadius: 20, padding: "28px 32px",
        boxShadow: `0 16px 60px rgba(0,0,0,0.5), 0 0 30px rgba(${theme.rgb}, 0.06)`,
      }}>
        {/* Team number watermark */}
        <div style={{ position: "absolute", top: -14, right: 20, fontSize: 120, fontWeight: 900, color: `rgba(${theme.rgb}, 0.05)`, lineHeight: 1 }}>
          {String(teamIndex + 1).padStart(2, "0")}
        </div>

        {/* Team header */}
        <div style={{ position: "relative", zIndex: 1, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.accent, letterSpacing: 4, textTransform: "uppercase", marginBottom: 4 }}>Team {teamIndex + 1}</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: 1 }}>{team.teamName}</div>
        </div>

        <div style={{ height: 2, background: `linear-gradient(90deg, ${theme.accent}, transparent)`, marginBottom: 14, borderRadius: 1 }} />

        {/* Player slots */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, position: "relative", zIndex: 1 }}>
          {members.map((player, i) => {
            // Player appears in card after their fly animation completes
            const playerDoneFrame = (i + 1) * PLAYER_DRAFT_FRAMES;
            const isPlaced = frame >= playerDoneFrame || inHoldPhase;
            const justPlaced = frame >= playerDoneFrame && frame < playerDoneFrame + 10;
            const placeScale = isPlaced ? spring({ frame: Math.max(0, frame - playerDoneFrame), fps, config: { damping: 14, stiffness: 120 } }) : 0;
            const placeOpacity = isPlaced ? fade(frame, playerDoneFrame, 6) : 0;

            // Show empty slot if not placed yet
            if (!isPlaced) {
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "7px 12px",
                  background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.06)",
                  borderRadius: 10, height: 44,
                }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.08)" }} />
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.1)", fontWeight: 600 }}>Drafting...</div>
                </div>
              );
            }

            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "7px 12px",
                background: justPlaced ? `rgba(${theme.rgb}, 0.1)` : `rgba(${theme.rgb}, ${0.03 + (i % 2) * 0.02})`,
                border: `1px solid ${justPlaced ? `rgba(${theme.rgb}, 0.3)` : `rgba(${theme.rgb}, 0.06)`}`,
                borderRadius: 10, opacity: placeOpacity,
                transform: `scale(${Math.min(placeScale, 1)})`,
              }}>
                {player.avatar ? (
                  <Img src={player.avatar} style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", border: `2px solid rgba(${theme.rgb}, 0.25)` }} />
                ) : (
                  <div style={{ width: 30, height: 30, borderRadius: "50%", border: `2px solid rgba(${theme.rgb}, 0.25)`, background: `rgba(${theme.rgb}, 0.12)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: theme.accent }}>{(player.name || "?")[0].toUpperCase()}</div>
                )}
                <div style={{ flex: 1, fontSize: 14, fontWeight: 800, color: "#fff" }}>
                  {player.name}
                  {player.tag && <span style={{ color: "rgba(255,255,255,0.25)", fontWeight: 500, marginLeft: 3 }}>#{player.tag}</span>}
                </div>
                {player.rank && <div style={{ fontSize: 11, fontWeight: 700, color: theme.accent, padding: "3px 10px", borderRadius: 100, background: `rgba(${theme.rgb}, 0.08)`, border: `1px solid rgba(${theme.rgb}, 0.15)` }}>{player.rank}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* "Drafting for" label at bottom */}
      {!inHoldPhase && (
        <div style={{ position: "absolute", bottom: 50, left: 480, transform: "translateX(-50%)", fontSize: 13, fontWeight: 700, color: `rgba(${theme.rgb}, 0.35)`, letterSpacing: 4, textTransform: "uppercase" }}>
          Drafting for {team.teamName}
        </div>
      )}
    </AbsoluteFill>
  );
}

/* ═══════════════════════════════════════════════
   SIDEBAR: PREVIOUSLY REVEALED TEAMS
   ═══════════════════════════════════════════════ */

function PreviousTeamsSidebar({ theme, revealedTeams, currentTeamIndex }: { theme: Theme; revealedTeams: ShuffleTeam[]; currentTeamIndex: number }) {
  if (revealedTeams.length === 0) return null;
  const maxVisible = 5;
  const startIdx = Math.max(0, revealedTeams.length - maxVisible);
  const visible = revealedTeams.slice(startIdx);

  return (
    <div style={{ position: "absolute", left: 20, top: 80, bottom: 40, width: 340, display: "flex", flexDirection: "column", gap: 10, justifyContent: "flex-start", zIndex: 10, overflow: "hidden" }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: `rgba(${theme.rgb}, 0.5)`, letterSpacing: 3, textTransform: "uppercase", marginBottom: 4 }}>
        Teams Revealed ({revealedTeams.length})
      </div>
      {visible.map((team, vi) => {
        const actualIdx = startIdx + vi;
        const isLatest = actualIdx === revealedTeams.length - 1;
        return (
          <div key={actualIdx} style={{
            background: isLatest ? `rgba(${theme.rgb}, 0.08)` : "rgba(255,255,255,0.03)",
            border: `1px solid ${isLatest ? `rgba(${theme.rgb}, 0.25)` : "rgba(255,255,255,0.08)"}`,
            borderRadius: 12, padding: "10px 14px",
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: theme.accent, letterSpacing: 2, textTransform: "uppercase" }}>Team {actualIdx + 1}</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#fff", marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{team.teamName}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {team.members.slice(0, 5).map((p, j) => (
                <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                  {p.avatar ? <Img src={p.avatar} style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover" }} /> : <div style={{ width: 20, height: 20, borderRadius: "50%", background: `rgba(${theme.rgb}, 0.2)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: theme.accent }}>{(p.name || "?")[0].toUpperCase()}</div>}
                  <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{p.name}</span>
                  {p.rank && <span style={{ fontSize: 10, color: `rgba(${theme.rgb}, 0.6)`, fontWeight: 700 }}>{p.rank}</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SCENE 4: OUTRO — GRID + INSTRUCTIONS
   ═══════════════════════════════════════════════ */

function OutroScene({ frame, theme, teams, tournamentName, fps }: { frame: number; theme: Theme; teams: ShuffleTeam[]; tournamentName: string; fps: number }) {
  const cols = teams.length <= 6 ? 3 : teams.length <= 8 ? 4 : 5;
  const lockedScale = frame >= 60 ? spring({ frame: frame - 60, fps, config: { damping: 8, stiffness: 100, mass: 1.2 } }) : 0;
  const lockedOpacity = fade(frame, 60, 10);
  const instructionsOpacity = fade(frame, 150, 20);
  const gridFade = frame >= 140 ? fadeOut(frame, 140, 20) : 1;
  const showInstructions = frame >= 150;

  return (
    <AbsoluteFill style={{ background: theme.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <GridBg rgb={theme.rgb} />
      {!showInstructions && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14, width: cols * 210, maxWidth: 1100, opacity: gridFade }}>
            {teams.map((team, i) => {
              const delay = i * 4;
              const cs = frame >= delay ? spring({ frame: frame - delay, fps, config: { damping: 12, stiffness: 90 } }) : 0;
              const co = fade(frame, delay, 10);
              return (
                <div key={i} style={{ background: theme.bgCard, border: `1px solid rgba(${theme.rgb}, 0.12)`, borderRadius: 14, padding: "12px 14px", opacity: co, transform: `scale(${Math.min(cs, 1)})`, boxShadow: `0 4px 20px rgba(0,0,0,0.3)` }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: theme.accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 2 }}>Team {i + 1}</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: "#fff", marginBottom: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{team.teamName}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {team.members.slice(0, 5).map((p, j) => (
                      <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
                        {p.avatar ? <Img src={p.avatar} style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover" }} /> : <div style={{ width: 18, height: 18, borderRadius: "50%", background: `rgba(${theme.rgb}, 0.2)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, color: theme.accent }}>{(p.name || "?")[0].toUpperCase()}</div>}
                        <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{p.name}</span>
                        {p.rank && <span style={{ fontSize: 9, color: `rgba(${theme.rgb}, 0.7)`, fontWeight: 700, flexShrink: 0 }}>{p.rank}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 28, textAlign: "center", opacity: lockedOpacity, transform: `scale(${lockedScale})` }}>
            <div style={{ fontSize: 42, fontWeight: 900, color: "#fff", letterSpacing: 6, textTransform: "uppercase", textShadow: `0 0 40px rgba(${theme.rgb}, 0.5)` }}>Teams Locked</div>
          </div>
        </>
      )}
      {showInstructions && (
        <div style={{ opacity: instructionsOpacity, display: "flex", flexDirection: "column", alignItems: "center", gap: 24, maxWidth: 800, textAlign: "center" }}>
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
  const theme = GAME_THEMES[game] || GAME_THEMES.valorant;
  const allPlayers = useMemo(() => teams.flatMap(t => t.members), [teams]);

  const teamRevealStart = INTRO_FRAMES + SHUFFLE_FRAMES;
  const teamFramesList = teams.map(t => getTeamFrames(Math.min(t.members.length, 5)));
  const teamStarts = teams.map((_, i) => teamRevealStart + teamFramesList.slice(0, i).reduce((a, b) => a + b, 0));
  const outroStart = teamRevealStart + teamFramesList.reduce((a, b) => a + b, 0);

  const revealedTeams = useMemo(() => {
    const revealed: ShuffleTeam[] = [];
    for (let i = 0; i < teams.length; i++) {
      if (frame >= teamStarts[i] + teamFramesList[i]) revealed.push(teams[i]);
    }
    return revealed;
  }, [frame, teams, teamStarts, teamFramesList]);

  return (
    <AbsoluteFill style={{ background: theme.bg, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <IntroScene frame={frame} theme={theme} tournamentName={tournamentName} />
      </Sequence>

      <Sequence from={INTRO_FRAMES} durationInFrames={SHUFFLE_FRAMES}>
        <ShuffleScene frame={frame - INTRO_FRAMES} theme={theme} allPlayers={allPlayers} />
      </Sequence>

      {/* Scene 3: Unified team draft — spotlight + fly into card */}
      {teams.map((team, i) => (
        <Sequence key={i} from={teamStarts[i]} durationInFrames={teamFramesList[i]}>
          <TeamDraftScene
            frame={frame - teamStarts[i]}
            theme={theme} team={team} teamIndex={i} fps={fps}
            revealedTeams={revealedTeams}
          />
        </Sequence>
      ))}

      <Sequence from={outroStart} durationInFrames={OUTRO_FRAMES}>
        <OutroScene frame={frame - outroStart} theme={theme} teams={teams} tournamentName={tournamentName} fps={fps} />
      </Sequence>

      {/* ═══ PERSISTENT LOGOS ═══ */}
      <div style={{ position: "absolute", top: 24, left: 28, zIndex: 50, display: "flex", alignItems: "center", gap: 10, opacity: interpolate(frame, [10, 25], [0, 0.7], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        <Img src="/ielogo.png" style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover" }} />
        <div style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.5)", letterSpacing: 3, textTransform: "uppercase" }}>IEsports</div>
      </div>
      <div style={{ position: "absolute", top: 24, right: 28, zIndex: 50, opacity: interpolate(frame, [10, 25], [0, 0.5], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        <Img src={game === "valorant" ? "/valorantlogo.png" : game === "cs2" ? "/cs2logo.png" : "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png"} style={{ width: 48, height: 48, objectFit: "contain" }} />
      </div>
      <div style={{ position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)", zIndex: 50, fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.2)", letterSpacing: 2, opacity: interpolate(frame, [30, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        iesports.in
      </div>
    </AbsoluteFill>
  );
};
