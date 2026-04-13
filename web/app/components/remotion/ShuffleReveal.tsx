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
   CONSTANTS — 1080×1920 (9:16) canvas, three-band layout
   ═══════════════════════════════════════════════ */

const FPS = 30;
const INTRO_FRAMES = 90;
const SHUFFLE_FRAMES = 120;
const PLAYER_DRAFT_FRAMES = 42;
const TEAM_HOLD_FRAMES = 75;
const OUTRO_FRAMES = 270;

const W = 1080;
const H = 1920;

// Instagram Reel safe zone — status bar / handle on top, caption + action buttons on bottom.
// Bottom needs far more room than top because that's where the caption and action buttons live.
const SAFE_TOP = 120;
const SAFE_BOTTOM = 440;
const SAFE_H = H - SAFE_TOP - SAFE_BOTTOM;        // 1360
const SAFE_CENTER_Y = SAFE_TOP + SAFE_H / 2;      // 800

// Three bands stacked vertically inside the safe zone.
// HEADER strip at the top of the safe zone carries the persistent logos during draft.
const HEADER_H = 70;
const TOP_H = 380;   // revealed-teams band
const BOT_H = 270;   // current-team band
const HEADER_Y = SAFE_TOP;
const TOP_Y = SAFE_TOP + HEADER_H;
const MID_Y = TOP_Y + TOP_H;
const MID_H = SAFE_H - HEADER_H - TOP_H - BOT_H;  // 500
const BOT_Y = MID_Y + MID_H;

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
   HELPERS
   ═══════════════════════════════════════════════ */

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
function fade(f: number, s: number, d = 15) { return interpolate(f, [s, s + d], [0, 1], clamp); }
function easeOut(t: number) { return 1 - (1 - t) * (1 - t) * (1 - t); }

/* ═══════════════════════════════════════════════
   AVATAR
   ═══════════════════════════════════════════════ */

const Avatar = React.memo(({ src, name, size, border, rgb }: { src?: string; name: string; size: number; border: string; rgb: string }) => {
  // crossOrigin="anonymous" is required so html2canvas can read the pixels
  // during MP4 export — without it the canvas is tainted and capture fails.
  if (src) return <Img src={src} crossOrigin="anonymous" referrerPolicy="no-referrer" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", border }} />;
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
    <AbsoluteFill style={{ background: theme.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: SAFE_TOP, paddingBottom: SAFE_BOTTOM, paddingLeft: 60, paddingRight: 60 }}>
      <div style={{ opacity: titleOp, transform: `translateY(${titleY}px)`, fontSize: 26, fontWeight: 800, color: theme.accent, letterSpacing: 8, textTransform: "uppercase", marginBottom: 14 }}>Indian Esports</div>
      <div style={{ opacity: titleOp, transform: `translateY(${titleY}px)`, fontSize: 62, fontWeight: 900, color: "#fff", letterSpacing: -1, textAlign: "center", maxWidth: 920, lineHeight: 1.1, marginBottom: 60 }}>{tournamentName}</div>
      <div style={{ opacity: btnOp, transform: `scale(${btnScale * clickScale})` }}>
        <div style={{ padding: "22px 64px", borderRadius: 18, fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: 4, textTransform: "uppercase", background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentAlt})`, boxShadow: `0 0 50px rgba(${theme.rgb}, 0.4)`, border: `3px solid rgba(${theme.rgb}, 0.5)` }}>Shuffle Teams</div>
      </div>
      {flash > 0 && <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash }} />}
    </AbsoluteFill>
  );
}

/* ═══════════════════════════════════════════════
   SCENE 2: SHUFFLE
   ═══════════════════════════════════════════════ */

function ShuffleScene({ frame, theme, allPlayers }: { frame: number; theme: Theme; allPlayers: ShufflePlayer[] }) {
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
      <div style={{ position: "absolute", top: SAFE_TOP + 40, left: "50%", transform: "translateX(-50%)", fontSize: 22, fontWeight: 800, color: theme.accent, letterSpacing: 8, textTransform: "uppercase", opacity: interpolate(frame, [5, 15, 90, 100], [0, 0.6, 0.6, 0], clamp), textAlign: "center" }}>
        Shuffling {allPlayers.length} Players...
      </div>
      {cards.map((card, i) => {
        const angle = card.baseAngle + frame * card.speed * vortexSpeed;
        const r = card.radius * collapse * scatter;
        return (
          <div key={i} style={{
            position: "absolute", left: W / 2 + Math.cos(angle) * r * 0.8 - 70, top: SAFE_CENTER_Y + Math.sin(angle) * r - 16,
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
   TOP BAND — revealed teams with slide rotation
   ═══════════════════════════════════════════════ */

const TopRevealedBand = React.memo(({ theme, oldTeam, newTeam, transT, teamIndex }: {
  theme: Theme; oldTeam: ShuffleTeam | null; newTeam: ShuffleTeam | null; transT: number; teamIndex: number;
}) => {
  const BAND_PAD_X = 28;
  const BAND_PAD_Y = 14;
  const cardTop = TOP_Y + BAND_PAD_Y;
  const cardH = TOP_H - BAND_PAD_Y * 2;

  if (!oldTeam && !newTeam) {
    return (
      <div style={{
        position: "absolute", left: BAND_PAD_X, right: BAND_PAD_X, top: cardTop, height: cardH,
        border: `1px dashed rgba(${theme.rgb}, 0.15)`, borderRadius: 20,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, fontWeight: 700, color: `rgba(${theme.rgb}, 0.4)`, letterSpacing: 6, textTransform: "uppercase",
      }}>
        Revealed teams appear here
      </div>
    );
  }

  const renderCard = (team: ShuffleTeam, cardTeamIdx: number, progress: number, isIncoming: boolean) => {
    // incoming slides right → 0; outgoing slides 0 → left. Both cross-fade.
    const dx = isIncoming ? (1 - progress) * 260 : -progress * 260;
    const op = isIncoming ? progress : 1 - progress;
    const members = team.members.slice(0, 5);

    return (
      <div style={{
        position: "absolute", left: BAND_PAD_X, right: BAND_PAD_X, top: cardTop, height: cardH,
        background: theme.bgCard,
        border: `1px solid rgba(${theme.rgb}, 0.28)`,
        borderRadius: 20,
        padding: "18px 24px",
        transform: `translateX(${dx}px)`,
        opacity: op,
        boxShadow: `0 12px 40px rgba(0,0,0,0.4)`,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}>
        {/* Team label (top) */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: theme.accent, letterSpacing: 4, textTransform: "uppercase" }}>
            Team {cardTeamIdx + 1} · Revealed
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: `rgba(${theme.rgb}, 0.5)`, letterSpacing: 3, textTransform: "uppercase" }}>
            {members.length} Players
          </div>
        </div>
        <div style={{ fontSize: 34, fontWeight: 900, color: "#fff", letterSpacing: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1 }}>
          {team.teamName}
        </div>
        <div style={{ height: 2, background: `linear-gradient(90deg, ${theme.accent}, transparent)`, borderRadius: 1 }} />
        {/* Horizontal player row (bottom of card) */}
        <div style={{ flex: 1, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          {members.map((p, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
              <Avatar src={p.avatar} name={p.name} size={82} border={`2px solid rgba(${theme.rgb}, 0.35)`} rgb={theme.rgb} />
              <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", textAlign: "center" }}>
                {p.name}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      {oldTeam && transT < 1 && renderCard(oldTeam, teamIndex - 2, transT, false)}
      {newTeam && renderCard(newTeam, teamIndex - 1, transT, true)}
    </>
  );
});
TopRevealedBand.displayName = "TopRevealedBand";

/* ═══════════════════════════════════════════════
   MIDDLE BAND — player spotlight / team celebration
   ═══════════════════════════════════════════════ */

function MiddleBand({ theme, team, members, currentPlayerIdx, playerLocalFrame, inHoldPhase, frame, totalDraftFrames }: {
  theme: Theme;
  team: ShuffleTeam;
  members: ShufflePlayer[];
  currentPlayerIdx: number;
  playerLocalFrame: number;
  inHoldPhase: boolean;
  frame: number;
  totalDraftFrames: number;
}) {
  const band: React.CSSProperties = {
    position: "absolute", left: 0, right: 0, top: MID_Y, height: MID_H,
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    padding: "0 60px",
  };

  if (inHoldPhase) {
    const holdFrame = frame - totalDraftFrames;
    const op = fade(holdFrame, 0, 10);
    const scale = interpolate(holdFrame, [0, 15], [0.85, 1], clamp);
    const fadeOutT = interpolate(holdFrame, [TEAM_HOLD_FRAMES - 12, TEAM_HOLD_FRAMES], [1, 0], clamp);
    return (
      <div style={{ ...band, opacity: op * fadeOutT, transform: `scale(${scale})` }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: theme.accent, letterSpacing: 8, textTransform: "uppercase", marginBottom: 16 }}>
          Team Locked
        </div>
        <div style={{ fontSize: 68, fontWeight: 900, color: "#fff", letterSpacing: 1, textAlign: "center", lineHeight: 1.05, marginBottom: 20, maxWidth: 960, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {team.teamName}
        </div>
        <div style={{ padding: "10px 30px", borderRadius: 100, background: `rgba(${theme.rgb}, 0.12)`, border: `2px solid rgba(${theme.rgb}, 0.35)`, fontSize: 16, fontWeight: 800, color: theme.accent, letterSpacing: 3, textTransform: "uppercase" }}>
          {members.length} Players · Final Roster
        </div>
      </div>
    );
  }

  const player = members[currentPlayerIdx];
  const enterOp = fade(playerLocalFrame, 0, 8);
  const enterScale = interpolate(playerLocalFrame, [0, 12], [0.75, 1], clamp);
  const exitT = interpolate(playerLocalFrame, [PLAYER_DRAFT_FRAMES - 10, PLAYER_DRAFT_FRAMES], [0, 1], clamp);
  const exitE = easeOut(exitT);
  const exitOp = 1 - exitT;
  const exitScale = interpolate(exitE, [0, 1], [1, 0.85]);
  const exitY = exitE * 50;

  return (
    <div style={band}>
      <div style={{ fontSize: 16, fontWeight: 800, color: `rgba(${theme.rgb}, 0.6)`, letterSpacing: 6, textTransform: "uppercase", marginBottom: 14, opacity: enterOp * exitOp }}>
        Player {currentPlayerIdx + 1} of {members.length}
      </div>
      <div style={{
        opacity: enterOp * exitOp,
        transform: `translateY(${exitY}px) scale(${enterScale * exitScale})`,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
      }}>
        <Avatar src={player.avatar} name={player.name} size={230} border={`5px solid ${theme.accent}`} rgb={theme.rgb} />
        <div style={{ fontSize: 46, fontWeight: 900, color: "#fff", letterSpacing: 0.5, textAlign: "center", maxWidth: 960, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {player.name}
        </div>
        {player.tag && (
          <div style={{ fontSize: 18, fontWeight: 500, color: "rgba(255,255,255,0.4)", marginTop: -8 }}>#{player.tag}</div>
        )}
        {player.rank && (
          <div style={{ fontSize: 18, fontWeight: 800, color: theme.accent, padding: "7px 26px", borderRadius: 100, background: `rgba(${theme.rgb}, 0.12)`, border: `2px solid rgba(${theme.rgb}, 0.3)`, marginTop: 4 }}>
            {player.rank}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   BOTTOM BAND — current team being built
   ═══════════════════════════════════════════════ */

function CurrentTeamCard({ theme, team, teamIndex, frame, inHoldPhase }: {
  theme: Theme; team: ShuffleTeam; teamIndex: number; frame: number; inHoldPhase: boolean;
}) {
  const members = team.members.slice(0, 5);
  const cardOp = fade(frame, 0, 12);
  const PAD_X = 28;
  const PAD_Y = 12;

  return (
    <div style={{
      position: "absolute", left: PAD_X, right: PAD_X, top: BOT_Y + PAD_Y, height: BOT_H - PAD_Y * 2,
      background: theme.bgCard,
      border: `1px solid rgba(${theme.rgb}, 0.25)`,
      borderRadius: 20,
      padding: "14px 24px 18px",
      opacity: cardOp,
      boxShadow: `0 -12px 40px rgba(0,0,0,0.45)`,
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 2 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: theme.accent, letterSpacing: 4, textTransform: "uppercase" }}>
          {inHoldPhase ? "Locked In" : "Now Drafting"}
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, color: `rgba(${theme.rgb}, 0.6)`, letterSpacing: 3 }}>
          Team {teamIndex + 1}
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: 0.5, marginBottom: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1 }}>
        {team.teamName}
      </div>
      <div style={{ height: 2, background: `linear-gradient(90deg, ${theme.accent}, transparent)`, marginBottom: 12, borderRadius: 1 }} />
      <div style={{ flex: 1, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        {members.map((player, i) => {
          const playerDoneFrame = (i + 1) * PLAYER_DRAFT_FRAMES;
          const isPlaced = frame >= playerDoneFrame || inHoldPhase;
          const justPlaced = frame >= playerDoneFrame && frame < playerDoneFrame + 12;

          if (!isPlaced) {
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, opacity: 0.4 }}>
                <div style={{ width: 82, height: 82, borderRadius: "50%", border: "2px dashed rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.02)" }} />
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>Slot {i + 1}</div>
              </div>
            );
          }

          const placeOp = fade(frame, playerDoneFrame, 8);
          const placeScale = interpolate(frame, [playerDoneFrame, playerDoneFrame + 10], [0.7, 1], clamp);
          return (
            <div key={i} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              opacity: placeOp, transform: `scale(${placeScale})`,
            }}>
              <Avatar
                src={player.avatar}
                name={player.name}
                size={82}
                border={`3px solid ${justPlaced ? theme.accent : `rgba(${theme.rgb}, 0.4)`}`}
                rgb={theme.rgb}
              />
              <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180, textAlign: "center" }}>
                {player.name}
              </div>
              {player.rank && (
                <div style={{ fontSize: 10, fontWeight: 700, color: theme.accent, padding: "2px 9px", borderRadius: 100, background: `rgba(${theme.rgb}, 0.1)`, border: `1px solid rgba(${theme.rgb}, 0.2)` }}>
                  {player.rank}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SCENE 3: TEAM DRAFT
   ═══════════════════════════════════════════════ */

function TeamDraftScene({ frame, theme, team, teamIndex, teams }: {
  frame: number; theme: Theme; team: ShuffleTeam; teamIndex: number; teams: ShuffleTeam[];
}) {
  const members = team.members.slice(0, 5);
  const totalDraftFrames = members.length * PLAYER_DRAFT_FRAMES;
  const currentPlayerIdx = Math.min(Math.floor(frame / PLAYER_DRAFT_FRAMES), members.length - 1);
  const playerLocalFrame = frame - currentPlayerIdx * PLAYER_DRAFT_FRAMES;
  const inHoldPhase = frame >= totalDraftFrames;

  // Top-band transition: at the start of each team's draft, the previously-latest team
  // (teamIndex - 2) slides out to the left while the just-completed team (teamIndex - 1)
  // slides in from the right. After TRANS frames only the new card remains.
  const TRANS = 25;
  const transT = Math.min(frame / TRANS, 1);
  const newTop = teamIndex >= 1 ? teams[teamIndex - 1] : null;
  const oldTop = teamIndex >= 2 ? teams[teamIndex - 2] : null;

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <TopRevealedBand theme={theme} oldTeam={oldTop} newTeam={newTop} transT={transT} teamIndex={teamIndex} />
      <MiddleBand
        theme={theme}
        team={team}
        members={members}
        currentPlayerIdx={currentPlayerIdx}
        playerLocalFrame={playerLocalFrame}
        inHoldPhase={inHoldPhase}
        frame={frame}
        totalDraftFrames={totalDraftFrames}
      />
      <CurrentTeamCard theme={theme} team={team} teamIndex={teamIndex} frame={frame} inHoldPhase={inHoldPhase} />

      {/* Band separators */}
      <div style={{ position: "absolute", left: 60, right: 60, top: MID_Y - 1, height: 1, background: `linear-gradient(90deg, transparent, rgba(${theme.rgb}, 0.25), transparent)` }} />
      <div style={{ position: "absolute", left: 60, right: 60, top: BOT_Y - 1, height: 1, background: `linear-gradient(90deg, transparent, rgba(${theme.rgb}, 0.25), transparent)` }} />
    </AbsoluteFill>
  );
}

/* ═══════════════════════════════════════════════
   SCENE 4: OUTRO
   ═══════════════════════════════════════════════ */

function OutroScene({ frame, theme, teams, tournamentName }: { frame: number; theme: Theme; teams: ShuffleTeam[]; tournamentName: string }) {
  const cols = teams.length <= 4 ? 1 : 2;
  const showInstructions = frame >= 150;
  const instrOp = fade(frame, 150, 20);
  const gridOp = showInstructions ? 0 : 1;
  const lockedOp = fade(frame, 60, 10);
  const lockedScale = interpolate(frame, [60, 75], [0.8, 1], clamp);

  return (
    <AbsoluteFill style={{ background: theme.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: SAFE_TOP, paddingBottom: SAFE_BOTTOM, paddingLeft: 40, paddingRight: 40 }}>
      {!showInstructions && (
        <>
          <div style={{ marginBottom: 24, textAlign: "center", opacity: lockedOp, transform: `scale(${lockedScale})` }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: "#fff", letterSpacing: 6, textTransform: "uppercase" }}>Teams Locked</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: theme.accent, letterSpacing: 4, textTransform: "uppercase", marginTop: 10 }}>{tournamentName}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 20, width: "100%", maxWidth: 1000, opacity: gridOp }}>
            {teams.map((team, i) => {
              const co = fade(frame, i * 3, 8);
              const cs = interpolate(frame, [i * 3, i * 3 + 10], [0.9, 1], clamp);
              return (
                <div key={i} style={{ background: theme.bgCard, border: `1px solid rgba(${theme.rgb}, 0.15)`, borderRadius: 18, padding: "18px 22px", opacity: co, transform: `scale(${cs})` }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: theme.accent, letterSpacing: 3, textTransform: "uppercase", marginBottom: 4 }}>Team {i + 1}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", marginBottom: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{team.teamName}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {team.members.slice(0, 5).map((p, j) => (
                      <div key={j} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 17, color: "rgba(255,255,255,0.8)" }}>
                        <Avatar src={p.avatar} name={p.name} size={30} border="none" rgb={theme.rgb} />
                        <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{p.name}</span>
                        {p.rank && <span style={{ fontSize: 13, color: `rgba(${theme.rgb}, 0.7)`, fontWeight: 700, flexShrink: 0 }}>{p.rank}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {showInstructions && (
        <div style={{ opacity: instrOp, display: "flex", flexDirection: "column", alignItems: "center", gap: 36, maxWidth: 960, textAlign: "center" }}>
          <div style={{ fontSize: 52, fontWeight: 900, color: "#fff", letterSpacing: 2, lineHeight: 1.1 }}>{tournamentName}</div>
          <div style={{ background: `rgba(${theme.rgb}, 0.08)`, border: `1px solid rgba(${theme.rgb}, 0.2)`, borderRadius: 20, padding: "30px 40px", width: "100%" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: theme.accent, letterSpacing: 3, textTransform: "uppercase", marginBottom: 16 }}>How to customize your team</div>
            <div style={{ fontSize: 22, color: "rgba(255,255,255,0.8)", lineHeight: 1.55, fontWeight: 500 }}>
              Set a custom team name and logo from the tournament page. Open your tournament, go to Teams, and click "Edit" on your team card.
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 38, fontWeight: 900, color: theme.accent, letterSpacing: 4 }}>iesports.in</div>
            <div style={{ fontSize: 18, color: "rgba(255,255,255,0.4)", marginTop: 10, fontWeight: 500 }}>Tournaments · Schedules · Results</div>
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
  const teamStarts = useMemo(
    () => teams.map((_, i) => teamRevealStart + teamFramesList.slice(0, i).reduce((a, b) => a + b, 0)),
    [teams, teamFramesList]
  );
  const outroStart = teamRevealStart + teamFramesList.reduce((a, b) => a + b, 0);

  const inDraft = frame >= teamRevealStart && frame < outroStart;

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
          <TeamDraftScene frame={frame - teamStarts[i]} theme={theme} team={team} teamIndex={i} teams={teams} />
        </Sequence>
      ))}
      <Sequence from={outroStart} durationInFrames={OUTRO_FRAMES}>
        <OutroScene frame={frame - outroStart} theme={theme} teams={teams} tournamentName={tournamentName} />
      </Sequence>

      {/* Persistent logos — positioned inside the Instagram-safe zone */}
      {!inDraft && (
        <>
          <div style={{ position: "absolute", top: SAFE_TOP + 16, left: 28, zIndex: 50, display: "flex", alignItems: "center", gap: 10, opacity: interpolate(frame, [10, 25], [0, 0.7], clamp) }}>
            <Img src="/ielogo.png" style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover" }} />
            <div style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.5)", letterSpacing: 3, textTransform: "uppercase" }}>IEsports</div>
          </div>
          <div style={{ position: "absolute", top: SAFE_TOP + 16, right: 28, zIndex: 50, opacity: interpolate(frame, [10, 25], [0, 0.5], clamp) }}>
            <Img src={game === "valorant" ? "/valorantlogo.png" : game === "cs2" ? "/cs2logo.png" : "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png"} style={{ width: 48, height: 48, objectFit: "contain" }} />
          </div>
          <div style={{ position: "absolute", bottom: SAFE_BOTTOM + 16, left: "50%", transform: "translateX(-50%)", zIndex: 50, fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 3, opacity: interpolate(frame, [30, 50], [0, 1], clamp) }}>
            iesports.in
          </div>
        </>
      )}

      {/* During team draft, a compact header strip inside the safe zone carries the logos */}
      {inDraft && (
        <div style={{ position: "absolute", left: 0, right: 0, top: HEADER_Y, height: HEADER_H, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Img src="/ielogo.png" style={{ width: 40, height: 40, borderRadius: 9, objectFit: "cover" }} />
            <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.55)", letterSpacing: 3, textTransform: "uppercase" }}>IEsports</div>
          </div>
          <div style={{ flex: 1, margin: "0 16px", textAlign: "center", fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.55)", letterSpacing: 3, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {tournamentName}
          </div>
          <Img src={game === "valorant" ? "/valorantlogo.png" : game === "cs2" ? "/cs2logo.png" : "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png"} style={{ width: 44, height: 44, objectFit: "contain" }} />
        </div>
      )}
      {/* Visualize the safe-zone border subtly in draft mode — helps confirm nothing spills into the Instagram UI gutters */}
      {inDraft && (
        <>
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: SAFE_TOP, background: `linear-gradient(180deg, rgba(0,0,0,0.35), transparent)`, zIndex: 40, pointerEvents: "none" }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: SAFE_BOTTOM, background: `linear-gradient(0deg, rgba(0,0,0,0.35), transparent)`, zIndex: 40, pointerEvents: "none" }} />
        </>
      )}
    </AbsoluteFill>
  );
};
