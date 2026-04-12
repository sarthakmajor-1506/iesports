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
const INTRO_FRAMES = 90;        // 3s
const SHUFFLE_FRAMES = 90;      // 3s
const TEAM_FRAMES = 75;         // 2.5s per team
const OUTRO_FRAMES = 120;       // 4s

export function getShuffleDuration(teamCount: number) {
  return INTRO_FRAMES + SHUFFLE_FRAMES + TEAM_FRAMES * teamCount + OUTRO_FRAMES;
}

const GAME_THEMES = {
  valorant: { accent: "#3CCBFF", accentAlt: "#FF4655", bg: "#0A0F2A", bgCard: "#0d1530", rgb: "60,203,255" },
  dota:     { accent: "#A12B1F", accentAlt: "#FF6B4A", bg: "#0a0e18", bgCard: "#0f1520", rgb: "161,43,31" },
  cs2:      { accent: "#f0a500", accentAlt: "#FFD700", bg: "#0d0d0d", bgCard: "#151510", rgb: "240,165,0" },
};

/* ═══════════════════════════════════════════════
   ANIMATION HELPERS
   ═══════════════════════════════════════════════ */

function fade(frame: number, start: number, dur = 15) {
  return interpolate(frame, [start, start + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

function slideX(frame: number, start: number, dist = 60, dur = 20) {
  return interpolate(frame, [start, start + dur], [dist, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

function slideY(frame: number, start: number, dist = 30, dur = 20) {
  return interpolate(frame, [start, start + dur], [dist, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

function scaleSpring(frame: number, start: number, fps: number) {
  return spring({ frame: frame - start, fps, config: { damping: 12, stiffness: 100, mass: 0.8 } });
}

/* ═══════════════════════════════════════════════
   SCENE 1: INTRO — TOURNAMENT + BUTTON CLICK
   ═══════════════════════════════════════════════ */

function IntroScene({ frame, theme, tournamentName }: { frame: number; theme: typeof GAME_THEMES.valorant; tournamentName: string }) {
  const logoOpacity = fade(frame, 0, 20);
  const logoY = slideY(frame, 0, 40, 25);
  const titleOpacity = fade(frame, 10, 15);
  const titleY = slideY(frame, 10, 30, 20);

  // Button appears
  const btnOpacity = fade(frame, 30, 12);
  const btnScale = frame >= 30 ? spring({ frame: frame - 30, fps: FPS, config: { damping: 10, stiffness: 80 } }) : 0;

  // Button click at frame 60
  const isClicked = frame >= 60;
  const clickScale = isClicked ? interpolate(frame, [60, 65, 70], [1, 0.92, 1.05], { extrapolateRight: "clamp" }) : 1;
  const clickGlow = isClicked ? interpolate(frame, [60, 70, 85], [0, 1, 0], { extrapolateRight: "clamp" }) : 0;

  // Shockwave ring
  const ringScale = isClicked ? interpolate(frame, [65, 90], [0, 8], { extrapolateRight: "clamp" }) : 0;
  const ringOpacity = isClicked ? interpolate(frame, [65, 85], [0.8, 0], { extrapolateRight: "clamp" }) : 0;

  // Flash at end
  const flash = interpolate(frame, [80, 85, 90], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Breathing glow
  const breathe = 0.6 + 0.4 * Math.sin(frame * 0.06);

  return (
    <AbsoluteFill style={{ background: theme.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      {/* Grid background */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(rgba(${theme.rgb},0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(${theme.rgb},0.03) 1px, transparent 1px)`, backgroundSize: "80px 80px" }} />

      {/* Ambient glow */}
      <div style={{ position: "absolute", width: 600, height: 600, borderRadius: "50%", background: `radial-gradient(circle, rgba(${theme.rgb},${0.12 * breathe}), transparent 70%)`, top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />

      {/* Tournament name */}
      <div style={{ opacity: logoOpacity, transform: `translateY(${logoY}px)`, fontSize: 22, fontWeight: 800, color: theme.accent, letterSpacing: 6, textTransform: "uppercase", marginBottom: 8 }}>
        Indian Esports
      </div>
      <div style={{ opacity: titleOpacity, transform: `translateY(${titleY}px)`, fontSize: 52, fontWeight: 900, color: "#fff", letterSpacing: -1, textAlign: "center", maxWidth: 900, lineHeight: 1.15, marginBottom: 60 }}>
        {tournamentName}
      </div>

      {/* Shuffle button */}
      <div style={{ opacity: btnOpacity, transform: `scale(${btnScale * clickScale})`, position: "relative" }}>
        <div style={{
          padding: "22px 64px", borderRadius: 16, fontSize: 24, fontWeight: 900, color: "#fff", letterSpacing: 3, textTransform: "uppercase",
          background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentAlt})`,
          boxShadow: `0 0 ${40 + clickGlow * 80}px rgba(${theme.rgb}, ${0.4 + clickGlow * 0.6})`,
          border: `2px solid rgba(${theme.rgb}, ${0.5 + clickGlow * 0.5})`,
        }}>
          Shuffle Teams
        </div>
        {/* Shockwave ring */}
        {isClicked && (
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            width: 80, height: 80, borderRadius: "50%",
            border: `3px solid ${theme.accent}`,
            transform: `translate(-50%, -50%) scale(${ringScale})`,
            opacity: ringOpacity,
          }} />
        )}
      </div>

      {/* Flash overlay */}
      {flash > 0 && <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash }} />}
    </AbsoluteFill>
  );
}

/* ═══════════════════════════════════════════════
   SCENE 2: SHUFFLE CHAOS — NAMES SWIRLING
   ═══════════════════════════════════════════════ */

function ShuffleScene({ frame, theme, allPlayers }: { frame: number; theme: typeof GAME_THEMES.valorant; allPlayers: ShufflePlayer[] }) {
  // Generate deterministic positions for each player card
  const cards = useMemo(() => allPlayers.map((p, i) => {
    const seed = (i * 137 + 42) % 100;
    return {
      ...p,
      baseAngle: (i / allPlayers.length) * Math.PI * 2,
      radius: 180 + (seed % 40) * 5,
      speed: 0.08 + (seed % 30) * 0.003,
      offsetY: (seed % 20) - 10,
    };
  }), [allPlayers]);

  // Phase: scatter → vortex → collapse
  const scatter = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const vortexSpeed = interpolate(frame, [15, 60], [1, 4], { extrapolateRight: "clamp" });
  const collapse = interpolate(frame, [65, 85], [1, 0], { extrapolateRight: "clamp" });
  const finalFlash = interpolate(frame, [82, 87, 90], [0, 0.8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      {/* Grid */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(rgba(${theme.rgb},0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(${theme.rgb},0.02) 1px, transparent 1px)`, backgroundSize: "80px 80px" }} />

      {/* Center glow */}
      <div style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", background: `radial-gradient(circle, rgba(${theme.rgb},0.15), transparent 70%)`, top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />

      {/* "SHUFFLING..." text */}
      <div style={{
        position: "absolute", top: 80, left: "50%", transform: "translateX(-50%)",
        fontSize: 18, fontWeight: 800, color: theme.accent, letterSpacing: 8, textTransform: "uppercase",
        opacity: interpolate(frame, [5, 15, 70, 80], [0, 0.6, 0.6, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      }}>
        Shuffling {allPlayers.length} Players...
      </div>

      {/* Swirling player cards */}
      {cards.map((card, i) => {
        const angle = card.baseAngle + frame * card.speed * vortexSpeed;
        const r = card.radius * collapse * scatter;
        const x = 960 + Math.cos(angle) * r;
        const y = 540 + Math.sin(angle) * r * 0.6 + card.offsetY;
        const rotation = frame * card.speed * 40 * vortexSpeed;
        const cardOpacity = scatter * collapse;

        return (
          <div key={i} style={{
            position: "absolute", left: x - 80, top: y - 18,
            width: 160, height: 36, borderRadius: 8,
            background: `rgba(${theme.rgb}, 0.12)`, border: `1px solid rgba(${theme.rgb}, 0.25)`,
            display: "flex", alignItems: "center", gap: 8, padding: "0 10px",
            opacity: cardOpacity, transform: `rotate(${rotation % 360}deg) scale(${0.7 + scatter * 0.3})`,
            transition: "none", fontSize: 13, fontWeight: 700, color: "#fff",
            boxShadow: `0 0 12px rgba(${theme.rgb}, 0.15)`,
          }}>
            {card.avatar ? (
              <Img src={card.avatar} style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: `rgba(${theme.rgb}, 0.3)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800 }}>
                {(card.name || "?")[0].toUpperCase()}
              </div>
            )}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {card.name}
            </span>
          </div>
        );
      })}

      {/* Flash */}
      {finalFlash > 0 && <div style={{ position: "absolute", inset: 0, background: theme.accent, opacity: finalFlash }} />}
    </AbsoluteFill>
  );
}

/* ═══════════════════════════════════════════════
   SCENE 3: SINGLE TEAM REVEAL
   ═══════════════════════════════════════════════ */

function TeamRevealScene({ frame, theme, team, teamIndex, fps }: { frame: number; theme: typeof GAME_THEMES.valorant; team: ShuffleTeam; teamIndex: number; fps: number }) {
  // Team number
  const numScale = scaleSpring(frame, 0, fps);
  const numOpacity = fade(frame, 0, 8);

  // Team name
  const nameOpacity = fade(frame, 10, 10);
  const nameX = slideX(frame, 10, 100, 18);

  // Divider line
  const lineWidth = interpolate(frame, [18, 30], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Players (staggered, 8 frames apart starting at frame 22)
  const playerStarts = team.members.map((_, i) => 22 + i * 8);

  // Card background
  const cardOpacity = fade(frame, 5, 12);

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      {/* Grid */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(rgba(${theme.rgb},0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(${theme.rgb},0.02) 1px, transparent 1px)`, backgroundSize: "80px 80px" }} />

      {/* Ambient glow */}
      <div style={{ position: "absolute", width: 500, height: 500, borderRadius: "50%", background: `radial-gradient(circle, rgba(${theme.rgb},0.08), transparent 70%)`, top: "50%", left: "50%", transform: "translate(-50%, -50%)" }} />

      {/* Main card */}
      <div style={{
        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: 680, opacity: cardOpacity,
        background: theme.bgCard, border: `1px solid rgba(${theme.rgb}, 0.15)`,
        borderRadius: 24, padding: "40px 48px", boxShadow: `0 20px 80px rgba(0,0,0,0.5), 0 0 40px rgba(${theme.rgb}, 0.08)`,
      }}>
        {/* Team number (large, faded) */}
        <div style={{
          position: "absolute", top: -20, right: 30,
          fontSize: 160, fontWeight: 900, color: `rgba(${theme.rgb}, 0.06)`,
          lineHeight: 1, transform: `scale(${numScale})`, opacity: numOpacity,
        }}>
          {String(teamIndex + 1).padStart(2, "0")}
        </div>

        {/* Team name */}
        <div style={{ opacity: nameOpacity, transform: `translateX(${nameX}px)`, position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.accent, letterSpacing: 4, textTransform: "uppercase", marginBottom: 6 }}>
            Team {teamIndex + 1}
          </div>
          <div style={{ fontSize: 36, fontWeight: 900, color: "#fff", letterSpacing: 1 }}>
            {team.teamName}
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: `${lineWidth}%`, height: 2, background: `linear-gradient(90deg, ${theme.accent}, transparent)`, margin: "18px 0", borderRadius: 1 }} />

        {/* Players */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, position: "relative", zIndex: 1 }}>
          {team.members.slice(0, 5).map((player, i) => {
            const pStart = playerStarts[i] || 60;
            const pOpacity = fade(frame, pStart, 8);
            const pX = slideX(frame, pStart, 40, 12);
            const pScale = frame >= pStart ? spring({ frame: frame - pStart, fps, config: { damping: 14, stiffness: 120 } }) : 0;

            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "8px 14px",
                background: `rgba(${theme.rgb}, ${0.04 + (i % 2) * 0.02})`,
                border: `1px solid rgba(${theme.rgb}, 0.08)`,
                borderRadius: 12, opacity: pOpacity,
                transform: `translateX(${pX}px) scale(${Math.min(pScale, 1)})`,
              }}>
                {/* Avatar */}
                {player.avatar ? (
                  <Img src={player.avatar} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", border: `2px solid rgba(${theme.rgb}, 0.3)` }} />
                ) : (
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%", border: `2px solid rgba(${theme.rgb}, 0.3)`,
                    background: `rgba(${theme.rgb}, 0.15)`, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, fontWeight: 800, color: theme.accent,
                  }}>
                    {(player.name || "?")[0].toUpperCase()}
                  </div>
                )}

                {/* Name + Tag */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>
                    {player.name}
                    {player.tag && <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 500, marginLeft: 4 }}>#{player.tag}</span>}
                  </div>
                </div>

                {/* Rank */}
                {player.rank && (
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: theme.accent,
                    padding: "4px 12px", borderRadius: 100,
                    background: `rgba(${theme.rgb}, 0.1)`, border: `1px solid rgba(${theme.rgb}, 0.2)`,
                  }}>
                    {player.rank}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

/* ═══════════════════════════════════════════════
   SCENE 4: FINAL GRID — ALL TEAMS
   ═══════════════════════════════════════════════ */

function OutroScene({ frame, theme, teams, tournamentName, fps }: { frame: number; theme: typeof GAME_THEMES.valorant; teams: ShuffleTeam[]; tournamentName: string; fps: number }) {
  const cols = teams.length <= 6 ? 3 : teams.length <= 8 ? 4 : 5;
  const rows = Math.ceil(teams.length / cols);

  // "TEAMS LOCKED" text
  const lockedScale = frame >= 70 ? spring({ frame: frame - 70, fps, config: { damping: 8, stiffness: 100, mass: 1.2 } }) : 0;
  const lockedOpacity = fade(frame, 70, 10);

  // Tournament name
  const tournNameOpacity = fade(frame, 85, 12);

  // Branding fade
  const brandOpacity = fade(frame, 95, 12);

  return (
    <AbsoluteFill style={{ background: theme.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      {/* Grid bg */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(rgba(${theme.rgb},0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(${theme.rgb},0.02) 1px, transparent 1px)`, backgroundSize: "80px 80px" }} />

      {/* Team grid */}
      <div style={{
        display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14,
        width: cols * 210, maxWidth: 1100,
      }}>
        {teams.map((team, i) => {
          const delay = i * 4;
          const cardScale = frame >= delay ? spring({ frame: frame - delay, fps, config: { damping: 12, stiffness: 90 } }) : 0;
          const cardOpacity = fade(frame, delay, 10);

          return (
            <div key={i} style={{
              background: theme.bgCard, border: `1px solid rgba(${theme.rgb}, 0.12)`, borderRadius: 14,
              padding: "12px 14px", opacity: cardOpacity, transform: `scale(${Math.min(cardScale, 1)})`,
              boxShadow: `0 4px 20px rgba(0,0,0,0.3)`,
            }}>
              {/* Team header */}
              <div style={{ fontSize: 11, fontWeight: 800, color: theme.accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 2 }}>
                Team {i + 1}
              </div>
              <div style={{ fontSize: 15, fontWeight: 900, color: "#fff", marginBottom: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {team.teamName}
              </div>

              {/* Mini player list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {team.members.slice(0, 5).map((p, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
                    {p.avatar ? (
                      <Img src={p.avatar} style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 18, height: 18, borderRadius: "50%", background: `rgba(${theme.rgb}, 0.2)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, color: theme.accent }}>
                        {(p.name || "?")[0].toUpperCase()}
                      </div>
                    )}
                    <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{p.name}</span>
                    {p.rank && <span style={{ fontSize: 9, color: `rgba(${theme.rgb}, 0.7)`, fontWeight: 700, flexShrink: 0 }}>{p.rank}</span>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* TEAMS LOCKED */}
      <div style={{
        marginTop: 36, textAlign: "center",
        opacity: lockedOpacity, transform: `scale(${lockedScale})`,
      }}>
        <div style={{
          fontSize: 42, fontWeight: 900, color: "#fff", letterSpacing: 6, textTransform: "uppercase",
          textShadow: `0 0 40px rgba(${theme.rgb}, 0.5)`,
        }}>
          Teams Locked
        </div>
      </div>

      {/* Tournament name */}
      <div style={{ opacity: tournNameOpacity, marginTop: 10, fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.4)", letterSpacing: 2 }}>
        {tournamentName}
      </div>

      {/* Branding */}
      <div style={{ opacity: brandOpacity, marginTop: 20, fontSize: 13, fontWeight: 800, color: theme.accent, letterSpacing: 4, textTransform: "uppercase" }}>
        Indian Esports
      </div>
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
  const outroStart = teamRevealStart + TEAM_FRAMES * teams.length;

  return (
    <AbsoluteFill style={{ background: theme.bg, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Scene 1: Intro */}
      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <IntroScene frame={frame} theme={theme} tournamentName={tournamentName} />
      </Sequence>

      {/* Scene 2: Shuffle */}
      <Sequence from={INTRO_FRAMES} durationInFrames={SHUFFLE_FRAMES}>
        <ShuffleScene frame={frame - INTRO_FRAMES} theme={theme} allPlayers={allPlayers} />
      </Sequence>

      {/* Scene 3: Team reveals */}
      {teams.map((team, i) => (
        <Sequence key={i} from={teamRevealStart + i * TEAM_FRAMES} durationInFrames={TEAM_FRAMES}>
          <TeamRevealScene frame={frame - (teamRevealStart + i * TEAM_FRAMES)} theme={theme} team={team} teamIndex={i} fps={fps} />
        </Sequence>
      ))}

      {/* Scene 4: Final grid */}
      <Sequence from={outroStart} durationInFrames={OUTRO_FRAMES}>
        <OutroScene frame={frame - outroStart} theme={theme} teams={teams} tournamentName={tournamentName} fps={fps} />
      </Sequence>
    </AbsoluteFill>
  );
};
