"use client";
import React, { useMemo } from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  AbsoluteFill,
  Img,
  Sequence,
} from "remotion";
import {
  THEMES,
  type Theme,
  glowText,
  softShadow,
  stripGamePrefix,
  getRankPalette,
  SceneBackground,
  Avatar,
  Crown,
  Trophy,
  clamp,
  fade,
  easeOut,
  type ShufflePlayer,
  type ShuffleTeam,
  type ShuffleRevealProps,
  TeamLogoBadge,
} from "./ShuffleReveal";

// Crown (leaderboard MVP) takes priority over trophy (champion).
function playerHonorIcon(p: ShufflePlayer, size: number) {
  if (p.isBracketMvp) return <Crown size={size} />;
  if (p.isWinner) return <Trophy size={size} />;
  return null;
}
function playerHonorIsCrown(p: ShufflePlayer) {
  return !!p.isBracketMvp;
}

/* ═══════════════════════════════════════════════
   HORIZONTAL — 1920×1080 (16:9) reveal video.
   Designed for Discord live stream / YouTube. Same three acts as the
   vertical comp:
     1. Intro          — tournament title
     2. Shuffle        — orbit of every player rotating into place
     3. Team draft     — LEFT: big current team card, RIGHT: grid of
                         already-revealed teams building up over time
     4. Outro          — final grid of every team
   ═══════════════════════════════════════════════ */

const FPS = 30;
const INTRO_FRAMES = 90;
const SHUFFLE_FRAMES = 300;
const PLAYER_DRAFT_FRAMES = 42;
const TEAM_HOLD_FRAMES = 75;
const OUTRO_FRAMES = 270;

const W = 1920;
const H = 1080;

const SAFE_PAD = 60;

function getTeamFrames(memberCount: number) {
  return Math.min(memberCount, 5) * PLAYER_DRAFT_FRAMES + TEAM_HOLD_FRAMES;
}

export function getShuffleHorizontalDuration(teamCount: number, membersPerTeam = 5) {
  return INTRO_FRAMES + SHUFFLE_FRAMES + teamCount * getTeamFrames(membersPerTeam) + OUTRO_FRAMES;
}

/* ═══════════════════════════════════════════════
   SCENE 1: INTRO
   ═══════════════════════════════════════════════ */

function IntroScene({ frame, theme, tournamentName }: { frame: number; theme: Theme; tournamentName: string }) {
  const titleOp = fade(frame, 8, 20);
  const titleY = interpolate(frame, [8, 28], [36, 0], clamp);
  const subOp = fade(frame, 28, 16);
  const tagOp = fade(frame, 44, 14);
  const outOp = interpolate(frame, [INTRO_FRAMES - 14, INTRO_FRAMES], [1, 0], clamp);

  return (
    <AbsoluteFill>
      <SceneBackground theme={theme} />
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        opacity: outOp,
      }}>
        <div style={{
          fontSize: 32, fontWeight: 900, color: theme.gold,
          letterSpacing: 10, textTransform: "uppercase",
          marginBottom: 18,
          textShadow: glowText(theme, 0.8),
          opacity: tagOp,
        }}>
          Team Reveal
        </div>
        <div style={{
          fontSize: 130, fontWeight: 900, color: "#fff",
          letterSpacing: 1, textTransform: "uppercase",
          textAlign: "center", maxWidth: W - SAFE_PAD * 2,
          lineHeight: 1.02,
          textShadow: glowText(theme, 1.3),
          opacity: titleOp,
          transform: `translateY(${titleY}px)`,
        }}>
          {stripGamePrefix(tournamentName)}
        </div>
        <div style={{
          marginTop: 26,
          fontSize: 28, fontWeight: 800, color: theme.accentBright,
          letterSpacing: 8, textTransform: "uppercase",
          textShadow: glowText(theme, 0.6),
          opacity: subOp,
        }}>
          Teams forming now
        </div>
      </div>
    </AbsoluteFill>
  );
}

/* ═══════════════════════════════════════════════
   SCENE 2: SHUFFLE — horizontal orbit
   ═══════════════════════════════════════════════ */

function ShuffleScene({ frame, theme, allPlayers }: { frame: number; theme: Theme; allPlayers: ShufflePlayer[] }) {
  const sorted = useMemo(() => {
    const score = (p: ShufflePlayer) =>
      p.rating && p.rating > 0 ? p.rating : (p.tier ?? 0) * 100;
    const arr = [...allPlayers];
    arr.sort((a, b) => score(b) - score(a) || (a.name || "").localeCompare(b.name || ""));
    return arr;
  }, [allPlayers]);

  const N = sorted.length || 1;
  const TWO_PI = Math.PI * 2;
  const anglePerSlot = TWO_PI / N;

  const TOTAL_ROTATION = -TWO_PI * 2;
  const easeInOutCubic = (x: number) =>
    x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const progress = Math.max(0, Math.min(1, frame / SHUFFLE_FRAMES));
  const rotation = TOTAL_ROTATION * easeInOutCubic(progress);

  // Landscape ellipse — wider than vertical because we have horizontal room.
  const orbitCx = W / 2;
  const orbitCy = H / 2 + 40;
  const orbitRx = 600;
  const orbitRy = 90;
  const sizeMin = 36;
  const sizeMax = 340;

  const headingOp = interpolate(frame, [0, 14], [0, 1], clamp);
  const headingFadeOut = interpolate(frame, [SHUFFLE_FRAMES - 16, SHUFFLE_FRAMES], [1, 0.6], clamp);
  const flash = interpolate(frame, [SHUFFLE_FRAMES - 10, SHUFFLE_FRAMES - 5, SHUFFLE_FRAMES], [0, 0.65, 0], clamp);

  return (
    <AbsoluteFill>
      <SceneBackground theme={theme} />

      <div style={{
        position: "absolute", top: 70, left: 0, right: 0,
        textAlign: "center",
        opacity: headingOp * headingFadeOut,
      }}>
        <div style={{
          fontSize: 26, fontWeight: 900, color: theme.gold,
          letterSpacing: 8, textTransform: "uppercase", marginBottom: 10,
          textShadow: glowText(theme, 0.7),
        }}>
          Shuffling Players
        </div>
        <div style={{
          fontSize: 64, fontWeight: 900, color: "#fff",
          letterSpacing: 0.5, lineHeight: 1.02,
          textShadow: glowText(theme, 1.2),
        }}>
          {N} in the Pool
        </div>
      </div>

      {sorted.map((p, i) => {
        const baseAngle = i * anglePerSlot;
        const eff = baseAngle + rotation;
        const sinA = Math.sin(eff);
        const cosA = Math.cos(eff);

        const x = sinA * orbitRx;
        const y = -cosA * orbitRy;

        const depth = (cosA + 1) / 2;
        const size = sizeMin + (sizeMax - sizeMin) * depth;
        const opacity = 0.18 + 0.82 * depth;

        return (
          <div key={i} style={{
            position: "absolute",
            left: orbitCx + x - size / 2,
            top: orbitCy + y - size / 2,
            width: size, height: size,
            opacity,
            zIndex: Math.floor(depth * 1000),
            pointerEvents: "none",
          }}>
            <div style={{
              position: "relative",
              width: size, height: size,
              borderRadius: "50%",
              border: `3px solid ${theme.accentBright}`,
              boxShadow: `0 4px 16px rgba(0,0,0,0.55)`,
              overflow: "hidden",
              background: theme.bgCardLight,
            }}>
              {p.avatar ? (
                <Img src={p.avatar} crossOrigin="anonymous" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{
                  width: "100%", height: "100%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: size * 0.4, fontWeight: 900, color: theme.accentBright,
                  background: `rgba(${theme.rgb}, 0.18)`,
                }}>
                  {(p.name || "?")[0].toUpperCase()}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {flash > 0 && <div style={{ position: "absolute", inset: 0, background: theme.accentBright, opacity: flash }} />}
    </AbsoluteFill>
  );
}

/* ═══════════════════════════════════════════════
   SCENE 3: TEAM DRAFT — left: big active team, right: grid of revealed
   ═══════════════════════════════════════════════ */

// Left panel dimensions — takes ~62% of width for the spotlight team
const LEFT_W = 1180;
const LEFT_X = SAFE_PAD;

// Right panel — grid of revealed teams
const RIGHT_X = LEFT_X + LEFT_W + 40;
const RIGHT_W = W - RIGHT_X - SAFE_PAD;


const BigTeamCard = React.memo(({ theme, team, teamIndex, members, currentPlayerIdx, playerLocalFrame, inHoldPhase, frame, totalDraftFrames }: {
  theme: Theme;
  team: ShuffleTeam;
  teamIndex: number;
  members: ShufflePlayer[];
  currentPlayerIdx: number;
  playerLocalFrame: number;
  inHoldPhase: boolean;
  frame: number;
  totalDraftFrames: number;
}) => {
  const PAD = 36;
  const cardH = H - SAFE_PAD * 2 - 60; // leave headroom
  const cardTop = SAFE_PAD + 60;

  const cardOp = fade(frame, 0, 12);

  const label = inHoldPhase ? "Team Locked" : "Now Drafting";

  // Big focus avatar for the currently-highlighted player
  const player = members[currentPlayerIdx];
  const focusOp = inHoldPhase ? 0 : fade(playerLocalFrame, 0, 8);
  const focusScale = inHoldPhase ? 1 : interpolate(playerLocalFrame, [0, 14], [0.75, 1], clamp);
  const focusExitT = inHoldPhase ? 0 : interpolate(playerLocalFrame, [PLAYER_DRAFT_FRAMES - 10, PLAYER_DRAFT_FRAMES], [0, 1], clamp);
  const focusExitOp = 1 - focusExitT;
  const focusExitY = easeOut(focusExitT) * 40;

  const avgTier = members.length > 0
    ? Math.round((members.reduce((s, m) => s + (m.tier ?? 0), 0) / members.length) * 10) / 10
    : 0;

  return (
    <div style={{
      position: "absolute",
      left: LEFT_X, top: cardTop, width: LEFT_W, height: cardH,
      background: `linear-gradient(180deg, ${theme.bgCardLight}, ${theme.bgCard})`,
      border: `3px solid rgba(${theme.rgb}, 0.55)`,
      borderRadius: 30,
      padding: PAD,
      opacity: cardOp,
      display: "flex", flexDirection: "column",
      boxShadow: `0 18px 60px rgba(0,0,0,0.55), 0 0 80px rgba(${theme.rgb}, 0.20) inset`,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{
          fontSize: 30, fontWeight: 900, color: theme.accentBright,
          letterSpacing: 8, textTransform: "uppercase",
          textShadow: glowText(theme, 0.8),
        }}>
          {label}
        </div>
        <div style={{
          fontSize: 26, fontWeight: 900, color: theme.gold,
          letterSpacing: 4, textTransform: "uppercase",
          textShadow: softShadow,
        }}>
          Team {teamIndex + 1}
        </div>
      </div>
      <div style={{
        display: "flex", alignItems: "center", gap: 18, marginBottom: 14,
      }}>
        <TeamLogoBadge
          team={team}
          theme={theme}
          size={inHoldPhase ? 140 : 100}
          borderColor={inHoldPhase ? theme.gold : theme.accentBright}
          glow={inHoldPhase ? `0 0 30px ${theme.glow}, 0 0 70px rgba(${theme.rgb}, 0.35)` : `0 0 22px ${theme.glow}`}
        />
        <div style={{
          fontSize: 68, fontWeight: 900, color: "#fff",
          letterSpacing: 0.5, lineHeight: 1.04,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textShadow: glowText(theme, 1.4),
          flex: 1, minWidth: 0,
          wordBreak: "break-word",
        }}>
          {team.teamName}
        </div>
      </div>
      <div style={{
        height: 5, background: `linear-gradient(90deg, ${theme.accentBright}, ${theme.accent}, transparent)`,
        borderRadius: 3, marginBottom: 22,
        boxShadow: `0 0 18px ${theme.glow}`,
      }} />

      {/* Stats row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 22 }}>
        <div style={{
          fontSize: 20, fontWeight: 900, color: "#fff",
          padding: "10px 22px", borderRadius: 100,
          background: `rgba(${theme.rgb}, 0.18)`,
          border: `2px solid rgba(${theme.rgb}, 0.5)`,
          letterSpacing: 3, textTransform: "uppercase",
        }}>
          {members.length} Players
        </div>
        <div style={{
          fontSize: 20, fontWeight: 900, color: theme.gold,
          padding: "10px 22px", borderRadius: 100,
          background: "rgba(255,215,0,0.14)",
          border: `2px solid rgba(255,215,0,0.5)`,
          letterSpacing: 3, textTransform: "uppercase",
        }}>
          Avg Tier {avgTier}
        </div>
      </div>

      {/* Body: spotlight player (during draft) OR team roster (during hold) */}
      {!inHoldPhase && player && (
        <div style={{
          flex: 1,
          display: "flex", alignItems: "center", gap: 44,
          opacity: focusOp * focusExitOp,
          transform: `translateY(${focusExitY}px) scale(${focusScale})`,
        }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{
              position: "absolute", inset: -22, borderRadius: "50%",
              background: `radial-gradient(circle, ${theme.glow} 0%, transparent 70%)`,
            }} />
            <Avatar
              src={player.avatar}
              name={player.name}
              size={340}
              border={`8px solid ${player.isWinner || player.isBracketMvp ? theme.gold : theme.accentBright}`}
              rgb={theme.rgb}
            />
            {(player.isWinner || player.isBracketMvp) && (
              <div style={{
                position: "absolute", top: -72, right: -30,
                transform: playerHonorIsCrown(player) ? "rotate(32deg)" : "none",
              }}>
                {playerHonorIcon(player, 144)}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 22, fontWeight: 900, color: theme.accentBright,
              letterSpacing: 6, textTransform: "uppercase", marginBottom: 12,
              textShadow: glowText(theme, 0.7),
            }}>
              Player {currentPlayerIdx + 1} of {members.length}
            </div>
            <div style={{
              fontSize: 78, fontWeight: 900, color: "#fff",
              letterSpacing: 0.5, lineHeight: 1, marginBottom: 18,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              textShadow: glowText(theme, 1.3),
            }}>
              {player.name}
            </div>

            {/* History badge: champion → trophy pill, MVP → crown pill,
                placed → bracket rank, never played → "new to iesports".
                Replaces the Riot hashtag entirely. */}
            {player.isBracketMvp && player.prevBracket ? (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 12,
                fontSize: 22, fontWeight: 900, color: theme.gold,
                padding: "12px 26px", borderRadius: 100,
                background: "rgba(255,215,0,0.14)",
                border: `3px solid ${theme.gold}`,
                marginBottom: 18,
                textShadow: glowText(theme, 0.9),
                letterSpacing: 4, textTransform: "uppercase",
              }}>
                <Crown size={34} />
                {player.prevBracket} Bracket MVP
              </div>
            ) : player.isWinner ? (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 12,
                fontSize: 22, fontWeight: 900, color: theme.gold,
                padding: "12px 26px", borderRadius: 100,
                background: "rgba(255,215,0,0.16)",
                border: `3px solid ${theme.gold}`,
                marginBottom: 18,
                textShadow: glowText(theme, 0.9),
                letterSpacing: 4, textTransform: "uppercase",
              }}>
                <Trophy size={34} />
                Last Tournament Champion
              </div>
            ) : player.prevBracket && player.prevBracketRank && player.prevBracketTotal ? (
              <div style={{
                display: "inline-block",
                fontSize: 22, fontWeight: 900, color: theme.accentBright,
                padding: "12px 26px", borderRadius: 100,
                background: `rgba(${theme.rgb}, 0.14)`,
                border: `3px solid rgba(${theme.rgb}, 0.55)`,
                marginBottom: 18,
                letterSpacing: 3, textTransform: "uppercase",
                textShadow: glowText(theme, 0.6),
              }}>
                {player.prevBracket} Bracket · Rank {player.prevBracketRank}/{player.prevBracketTotal}
              </div>
            ) : player.isNew ? (
              <div style={{
                display: "inline-block",
                fontSize: 20, fontWeight: 900, color: theme.accentBright,
                padding: "12px 26px", borderRadius: 100,
                background: `rgba(${theme.rgb}, 0.1)`,
                border: `3px dashed rgba(${theme.rgb}, 0.45)`,
                marginBottom: 18,
                letterSpacing: 4, textTransform: "uppercase",
              }}>
                New to IEsports
              </div>
            ) : null}

            {player.rank && (() => {
              const rc = getRankPalette(player.rank);
              return (
                <div style={{
                  display: "inline-block",
                  fontSize: 26, fontWeight: 900, color: rc.text,
                  padding: "12px 34px", borderRadius: 100,
                  background: rc.bg,
                  border: `3px solid ${rc.border}`,
                  textShadow: softShadow,
                }}>
                  {player.rank}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {inHoldPhase && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
          {members.map((m, i) => {
            const rc = m.rank ? getRankPalette(m.rank) : null;
            const honored = !!(m.isWinner || m.isBracketMvp);
            return (
              <div key={m.uid || i} style={{
                display: "flex", alignItems: "center", gap: 22,
                padding: "12px 18px", borderRadius: 16,
                background: honored ? "rgba(255,215,0,0.06)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${honored ? "rgba(255,215,0,0.4)" : "rgba(255,255,255,0.06)"}`,
              }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <Avatar
                    src={m.avatar}
                    name={m.name}
                    size={78}
                    border={`3px solid ${honored ? theme.gold : theme.accentBright}`}
                    rgb={theme.rgb}
                  />
                  {honored && (
                    <div style={{
                      position: "absolute", top: -30, right: -12,
                      transform: playerHonorIsCrown(m) ? "rotate(32deg)" : "none",
                    }}>
                      {playerHonorIcon(m, 56)}
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 30, fontWeight: 900, color: honored ? theme.gold : "#fff",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    textShadow: softShadow,
                  }}>
                    {m.name}
                  </div>
                  {m.isWinner ? (
                    <div style={{
                      fontSize: 14, fontWeight: 800, color: theme.gold,
                      letterSpacing: 2, textTransform: "uppercase", marginTop: 2,
                    }}>
                      Last Tournament Champion
                    </div>
                  ) : m.prevBracket && m.prevBracketRank && m.prevBracketTotal ? (
                    <div style={{
                      fontSize: 14, fontWeight: 800,
                      color: m.isBracketMvp ? theme.gold : `rgba(${theme.rgb}, 0.9)`,
                      letterSpacing: 2, textTransform: "uppercase", marginTop: 2,
                    }}>
                      {m.prevBracket} Bracket · #{m.prevBracketRank}/{m.prevBracketTotal}
                    </div>
                  ) : m.isNew ? (
                    <div style={{
                      fontSize: 14, fontWeight: 800,
                      color: `rgba(${theme.rgb}, 0.8)`,
                      letterSpacing: 2, textTransform: "uppercase", marginTop: 2,
                    }}>
                      New to IEsports
                    </div>
                  ) : null}
                </div>
                {rc && (
                  <div style={{
                    fontSize: 18, fontWeight: 900, color: rc.text,
                    padding: "8px 20px", borderRadius: 100,
                    background: rc.bg,
                    border: `2px solid ${rc.border}`,
                    textShadow: softShadow,
                  }}>
                    {m.rank}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
BigTeamCard.displayName = "BigTeamCard";

const RECENT_TEAMS_CAP = 3;

const RevealedTeamsPanel = React.memo(({ theme, allTeams, revealedCount, currentPlayerIdx, inHoldPhase }: {
  theme: Theme;
  /** Every team in the tournament — used only to know the total count
   * for the header. The actual panel body renders just the last N
   * revealed teams. */
  allTeams: ShuffleTeam[];
  /** How many entries from the head of allTeams are "revealed" (past draft). */
  revealedCount: number;
  /** Live draft state from the active TeamDraftScene so the right panel
   * can mirror reveals that are happening in the centre. */
  currentPlayerIdx: number;
  inHoldPhase: boolean;
}) => {
  const cardTop = SAFE_PAD + 60;
  const cardH = H - SAFE_PAD * 2 - 60;
  const total = allTeams.length;

  // Rolling window of the most recent N teams — locked teams plus the one
  // currently being drafted (so the right side mirrors the centre reveal).
  type PanelCard = { team: ShuffleTeam; originalIndex: number; isDrafting: boolean; visible: number };
  const cards: PanelCard[] = [];
  for (let i = 0; i < revealedCount; i++) cards.push({ team: allTeams[i], originalIndex: i, isDrafting: false, visible: 5 });
  const drafting = allTeams[revealedCount];
  if (drafting) {
    cards.push({
      team: drafting,
      originalIndex: revealedCount,
      isDrafting: !inHoldPhase,
      visible: inHoldPhase ? Math.min(5, drafting.members.length) : Math.min(5, currentPlayerIdx + 1),
    });
  }
  const startIdx = Math.max(0, cards.length - RECENT_TEAMS_CAP);
  const recent = cards.slice(startIdx);

  // When fewer than 3 teams are in the window, scale the content up so each
  // card fills the available space comfortably. Team 1 alone → big card,
  // two teams → medium, full window → compact.
  const density = recent.length <= 1 ? "large" : recent.length === 2 ? "medium" : "small";
  const sizes = density === "large"
    ? { avatar: 60, name: 26, rankPillFontSize: 16, teamName: 44, teamLabelFontSize: 16, honorIcon: 30, rowGap: 12, padding: "22px 26px" }
    : density === "medium"
      ? { avatar: 46, name: 20, rankPillFontSize: 13, teamName: 34, teamLabelFontSize: 14, honorIcon: 24, rowGap: 9, padding: "18px 22px" }
      : { avatar: 34, name: 16, rankPillFontSize: 11, teamName: 26, teamLabelFontSize: 12, honorIcon: 16, rowGap: 6, padding: "16px 18px" };

  return (
    <div style={{
      position: "absolute",
      left: RIGHT_X, top: cardTop, width: RIGHT_W, height: cardH,
      display: "flex", flexDirection: "column",
    }}>
      <div style={{
        fontSize: 22, fontWeight: 900, color: theme.gold,
        letterSpacing: 6, textTransform: "uppercase",
        textShadow: glowText(theme, 0.7),
        marginBottom: 14, textAlign: "center",
      }}>
        Teams Locked · {revealedCount}/{total}
      </div>
      {recent.length === 0 ? (
        /* First scene — nothing locked yet. Keep a calm placeholder so the
           right panel doesn't look empty either. */
        <div style={{
          flex: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          border: `2px dashed rgba(${theme.rgb}, 0.18)`,
          borderRadius: 18,
          fontSize: 16, fontWeight: 800,
          color: `rgba(${theme.rgb}, 0.45)`,
          letterSpacing: 4, textTransform: "uppercase",
          textAlign: "center",
          padding: 24,
        }}>
          Teams form on the left<br />— first reveal coming up —
        </div>
      ) : (
        <div style={{
          flex: 1,
          display: "flex", flexDirection: "column",
          gap: 14, minHeight: 0,
        }}>
          {recent.map(({ team: t, originalIndex: i, isDrafting, visible }) => {
            const honored = t.members.find(m => m.isWinner || m.isBracketMvp);
            const logoSize = density === "large" ? 64 : density === "medium" ? 52 : 40;
            return (
              <div key={i} style={{
                flex: 1,
                background: isDrafting
                  ? `linear-gradient(180deg, rgba(${theme.rgb}, 0.22), ${theme.bgCard})`
                  : `linear-gradient(180deg, ${theme.bgCardLight}, ${theme.bgCard})`,
                border: isDrafting
                  ? `3px solid ${theme.accentBright}`
                  : `2px solid rgba(${theme.rgb}, 0.4)`,
                borderRadius: 18,
                padding: sizes.padding,
                display: "flex", flexDirection: "column",
                boxShadow: isDrafting
                  ? `0 8px 28px rgba(0,0,0,0.5), 0 0 30px ${theme.glow}`
                  : "0 8px 24px rgba(0,0,0,0.45)",
                minHeight: 0,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{
                    fontSize: sizes.teamLabelFontSize, fontWeight: 800,
                    color: isDrafting ? theme.accentBright : `rgba(${theme.rgb}, 0.9)`,
                    letterSpacing: 2.5, textTransform: "uppercase",
                  }}>
                    {isDrafting ? "Now Drafting" : `Team ${i + 1}`}
                  </div>
                  {honored && !isDrafting && playerHonorIcon(honored, sizes.honorIcon)}
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 12, marginBottom: 14,
                }}>
                  <TeamLogoBadge
                    team={t}
                    theme={theme}
                    size={logoSize}
                    borderColor={isDrafting ? theme.accentBright : `rgba(${theme.rgb}, 0.6)`}
                  />
                  <div style={{
                    fontSize: sizes.teamName, fontWeight: 900, color: "#fff",
                    letterSpacing: 0.3, lineHeight: 1.05,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    wordBreak: "break-word",
                    textShadow: glowText(theme, 1),
                    flex: 1, minWidth: 0,
                  }}>
                    {t.teamName}
                  </div>
                </div>
                <div style={{
                  display: "flex", flexDirection: "column", gap: sizes.rowGap,
                  marginTop: 2,
                }}>
                  {t.members.slice(0, 5).map((m, mi) => {
                    const isPlaceholder = mi >= visible;
                    if (isPlaceholder) {
                      return (
                        <div key={m.uid || mi} style={{
                          display: "flex", alignItems: "center", gap: 12,
                          minWidth: 0, opacity: 0.4,
                        }}>
                          <div style={{
                            width: sizes.avatar, height: sizes.avatar, borderRadius: "50%",
                            border: `2px dashed rgba(${theme.rgb}, 0.4)`,
                            background: "rgba(255,255,255,0.03)",
                            flexShrink: 0,
                          }} />
                          <div style={{
                            flex: 1, minWidth: 0,
                            fontSize: sizes.name, fontWeight: 800,
                            color: `rgba(${theme.rgb}, 0.5)`,
                            letterSpacing: 2, textTransform: "uppercase",
                          }}>
                            Slot {mi + 1}
                          </div>
                        </div>
                      );
                    }
                    const isHonored = !!(m.isWinner || m.isBracketMvp);
                    const rc = m.rank ? getRankPalette(m.rank) : null;
                    return (
                      <div key={m.uid || mi} style={{
                        display: "flex", alignItems: "center", gap: 12,
                        minWidth: 0,
                      }}>
                        <div style={{ position: "relative", flexShrink: 0 }}>
                          <Avatar
                            src={m.avatar}
                            name={m.name}
                            size={sizes.avatar}
                            border={`2px solid ${isHonored ? theme.gold : theme.accentBright}`}
                            rgb={theme.rgb}
                          />
                          {isHonored && (
                            <div style={{
                              position: "absolute", top: -Math.round(sizes.honorIcon * 0.75), left: "50%",
                              transform: "translateX(-50%)",
                              zIndex: 2,
                            }}>
                              {playerHonorIcon(m, sizes.honorIcon)}
                            </div>
                          )}
                        </div>
                        <div style={{
                          flex: 1, minWidth: 0,
                          fontSize: sizes.name, fontWeight: 800,
                          color: isHonored ? theme.gold : "#e4e5ec",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          textShadow: softShadow,
                        }}>
                          {m.name}
                        </div>
                        {rc && (
                          <div style={{
                            fontSize: sizes.rankPillFontSize, fontWeight: 800, color: rc.text,
                            padding: density === "large" ? "4px 14px" : density === "medium" ? "3px 11px" : "2px 9px",
                            borderRadius: 100,
                            background: rc.bg,
                            border: `1.5px solid ${rc.border}`,
                            whiteSpace: "nowrap", flexShrink: 0,
                            letterSpacing: 0.4,
                          }}>
                            {m.rank}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
RevealedTeamsPanel.displayName = "RevealedTeamsPanel";

function TeamDraftScene({ frame, theme, team, teamIndex, allTeams }: {
  frame: number;
  theme: Theme;
  team: ShuffleTeam;
  teamIndex: number;
  /** Full team list — the right panel needs every team for its fixed grid. */
  allTeams: ShuffleTeam[];
}) {
  const members = team.members.slice(0, 5);
  const totalDraftFrames = members.length * PLAYER_DRAFT_FRAMES;
  const inHoldPhase = frame >= totalDraftFrames;
  const currentPlayerIdx = inHoldPhase ? members.length - 1 : Math.min(Math.floor(frame / PLAYER_DRAFT_FRAMES), members.length - 1);
  const playerLocalFrame = inHoldPhase ? 0 : frame - currentPlayerIdx * PLAYER_DRAFT_FRAMES;

  return (
    <AbsoluteFill>
      <SceneBackground theme={theme} />
      <BigTeamCard
        theme={theme}
        team={team}
        teamIndex={teamIndex}
        members={members}
        currentPlayerIdx={currentPlayerIdx}
        playerLocalFrame={playerLocalFrame}
        inHoldPhase={inHoldPhase}
        frame={frame}
        totalDraftFrames={totalDraftFrames}
      />
      <RevealedTeamsPanel
        theme={theme}
        allTeams={allTeams}
        revealedCount={teamIndex}
        currentPlayerIdx={currentPlayerIdx}
        inHoldPhase={inHoldPhase}
      />
    </AbsoluteFill>
  );
}

/* ═══════════════════════════════════════════════
   SCENE 4: OUTRO — final grid of every team
   ═══════════════════════════════════════════════ */

function OutroScene({ frame, theme, teams, tournamentName }: { frame: number; theme: Theme; teams: ShuffleTeam[]; tournamentName: string }) {
  const headerOp = fade(frame, 6, 18);
  const gridOp = fade(frame, 22, 24);

  // Fit grid to team count
  const n = teams.length;
  const cols = n <= 4 ? Math.max(1, n) : n <= 6 ? 3 : n <= 8 ? 4 : 5;
  const rows = Math.ceil(n / cols);

  return (
    <AbsoluteFill>
      <SceneBackground theme={theme} />

      <div style={{
        position: "absolute", left: 0, right: 0, top: 50,
        textAlign: "center",
        opacity: headerOp,
      }}>
        <div style={{
          fontSize: 30, fontWeight: 900, color: theme.gold,
          letterSpacing: 10, textTransform: "uppercase", marginBottom: 6,
          textShadow: glowText(theme, 0.7),
        }}>
          Teams Locked
        </div>
        <div style={{
          fontSize: 72, fontWeight: 900, color: "#fff",
          letterSpacing: 1, textTransform: "uppercase",
          textShadow: glowText(theme, 1.2),
        }}>
          {stripGamePrefix(tournamentName)}
        </div>
      </div>

      <div style={{
        position: "absolute",
        left: SAFE_PAD,
        right: SAFE_PAD,
        top: 230,
        bottom: 80,
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: 18,
        opacity: gridOp,
      }}>
        {teams.map((t, i) => {
          const enterDelay = 4 + i * 4;
          const op = fade(frame, 30 + enterDelay, 14);
          const scale = interpolate(frame, [30 + enterDelay, 30 + enterDelay + 16], [0.88, 1], clamp);
          return (
            <div key={i} style={{
              background: `linear-gradient(180deg, ${theme.bgCardLight}, ${theme.bgCard})`,
              border: `2px solid rgba(${theme.rgb}, 0.5)`,
              borderRadius: 20,
              padding: "16px 18px",
              display: "flex", flexDirection: "column",
              opacity: op,
              transform: `scale(${scale})`,
              boxShadow: `0 10px 30px rgba(0,0,0,0.5)`,
              minHeight: 0,
            }}>
              <div style={{
                fontSize: 14, fontWeight: 800, color: theme.gold,
                letterSpacing: 3, textTransform: "uppercase", marginBottom: 4,
              }}>
                Team {i + 1}
              </div>
              <div style={{
                fontSize: 26, fontWeight: 900, color: "#fff",
                letterSpacing: 0.3, lineHeight: 1.05, marginBottom: 10,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                textShadow: glowText(theme, 1),
              }}>
                {t.teamName}
              </div>
              {/* Per-player rows: avatar + name + rank pill. Names + ranks
                  are the two pieces of info the user asked for; everything
                  else (tier, kda, etc.) stays off the final slide. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
                {t.members.slice(0, 5).map((m, mi) => {
                  const rc = m.rank ? getRankPalette(m.rank) : null;
                  return (
                    <div key={m.uid || mi} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      minWidth: 0,
                    }}>
                      <Avatar
                        src={m.avatar}
                        name={m.name}
                        size={30}
                        border={`2px solid ${theme.accentBright}`}
                        rgb={theme.rgb}
                      />
                      <div style={{
                        flex: 1, minWidth: 0,
                        fontSize: 15, fontWeight: 800, color: "#f2f3f8",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        textShadow: softShadow,
                      }}>
                        {m.name}
                      </div>
                      {rc && (
                        <div style={{
                          fontSize: 11, fontWeight: 800, color: rc.text,
                          padding: "2px 9px", borderRadius: 100,
                          background: rc.bg,
                          border: `1.5px solid ${rc.border}`,
                          letterSpacing: 0.5, whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}>
                          {m.rank}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPOSITION
   ═══════════════════════════════════════════════ */

export const ShuffleRevealHorizontalComposition: React.FC<ShuffleRevealProps> = ({ tournamentName, game, teams }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const theme = THEMES[game] || THEMES.valorant;
  const allPlayers = useMemo(() => teams.flatMap(t => t.members), [teams]);

  const teamRevealStart = INTRO_FRAMES + SHUFFLE_FRAMES;
  const teamFramesList = useMemo(
    () => teams.map(t => getTeamFrames(Math.min(t.members.length, 5))),
    [teams]
  );
  const teamStarts = useMemo(
    () => teams.map((_, i) => teamRevealStart + teamFramesList.slice(0, i).reduce((a, b) => a + b, 0)),
    [teams, teamFramesList, teamRevealStart]
  );
  const outroStart = teamRevealStart + teamFramesList.reduce((a, b) => a + b, 0);

  const inDraft = frame >= teamRevealStart && frame < outroStart;

  return (
    <AbsoluteFill style={{ background: "#02050f", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <IntroScene frame={frame} theme={theme} tournamentName={tournamentName} />
      </Sequence>
      <Sequence from={INTRO_FRAMES} durationInFrames={SHUFFLE_FRAMES}>
        <ShuffleScene frame={frame - INTRO_FRAMES} theme={theme} allPlayers={allPlayers} />
      </Sequence>
      {teams.map((team, i) => (
        <Sequence key={i} from={teamStarts[i]} durationInFrames={teamFramesList[i]}>
          <TeamDraftScene
            frame={frame - teamStarts[i]}
            theme={theme}
            team={team}
            teamIndex={i}
            allTeams={teams}
          />
        </Sequence>
      ))}
      <Sequence from={outroStart} durationInFrames={OUTRO_FRAMES}>
        <OutroScene frame={frame - outroStart} theme={theme} teams={teams} tournamentName={tournamentName} />
      </Sequence>

      {/* Persistent brand strip — top-left logo, top-right game logo, bottom-right url */}
      {!inDraft && (
        <>
          <div style={{
            position: "absolute", top: 36, left: 36, zIndex: 50,
            display: "flex", alignItems: "center", gap: 12,
            opacity: interpolate(frame, [14, 30], [0, 0.75], clamp),
          }}>
            <Img src="/ielogo.png" style={{ width: 56, height: 56, borderRadius: 12, objectFit: "cover" }} />
            <div style={{ fontSize: 18, fontWeight: 800, color: "rgba(255,255,255,0.55)", letterSpacing: 4, textTransform: "uppercase" }}>IEsports</div>
          </div>
          <div style={{
            position: "absolute", top: 36, right: 36, zIndex: 50,
            opacity: interpolate(frame, [14, 30], [0, 0.55], clamp),
          }}>
            <Img src={game === "valorant" ? "/valorantlogo.png" : game === "cs2" ? "/cs2logo.png" : "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png"} style={{ width: 64, height: 64, objectFit: "contain" }} />
          </div>
          <div style={{
            position: "absolute", bottom: 30, right: 40, zIndex: 50,
            fontSize: 18, fontWeight: 800, color: "rgba(255,255,255,0.35)",
            letterSpacing: 3, textTransform: "uppercase",
            opacity: interpolate(frame, [30, 50], [0, 1], clamp),
          }}>
            iesports.in
          </div>
        </>
      )}

      {/* Compact header during team draft — the big card already owns most of the screen */}
      {inDraft && (
        <div style={{
          position: "absolute", left: 0, right: 0, top: 0, height: 58, zIndex: 50,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 44px",
          background: "linear-gradient(180deg, rgba(0,0,0,0.45), transparent)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Img src="/ielogo.png" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover" }} />
            <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.55)", letterSpacing: 3, textTransform: "uppercase" }}>IEsports</div>
          </div>
          <div style={{ flex: 1, margin: "0 20px", textAlign: "center", fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.6)", letterSpacing: 4, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {stripGamePrefix(tournamentName)}
          </div>
          <Img src={game === "valorant" ? "/valorantlogo.png" : game === "cs2" ? "/cs2logo.png" : "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png"} style={{ width: 40, height: 40, objectFit: "contain" }} />
        </div>
      )}
    </AbsoluteFill>
  );
};
