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
  uid?: string;            // for cross-scene MVP matching
  name: string;
  tag?: string;
  avatar?: string;
  rank?: string;
  tier?: number;
  isMvp?: boolean;         // top performer carried over from the previous tournament
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
  /** Top performers from the previous tournament who are also playing this league.
   * Shown in the shuffle scene's 3D orbit and crowned wherever they appear in
   * the team-formation scenes. */
  mvps?: ShufflePlayer[];
}

/* ═══════════════════════════════════════════════
   CONSTANTS — 1080×1920 (9:16) canvas, three-band layout
   ═══════════════════════════════════════════════ */

const FPS = 30;
const INTRO_FRAMES = 90;
// SHUFFLE: 3D orbit of all players that smoothly rotates between
// MVP positions and pauses on each one for readability.
const SHUFFLE_INTRO_FRAMES = 30;            // initial spin-in
const SHUFFLE_MVP_PAUSE_FRAMES = 36;        // hold on each MVP (~1.2s)
const SHUFFLE_MVP_ROTATE_FRAMES = 18;       // rotate from one MVP to the next (~0.6s)
const SHUFFLE_MVP_COUNT = 5;
const SHUFFLE_OUTRO_FRAMES = 24;            // pre-team-formation breath
const SHUFFLE_FRAMES =
  SHUFFLE_INTRO_FRAMES +
  SHUFFLE_MVP_COUNT * SHUFFLE_MVP_PAUSE_FRAMES +
  (SHUFFLE_MVP_COUNT - 1) * SHUFFLE_MVP_ROTATE_FRAMES +
  SHUFFLE_OUTRO_FRAMES;
const PLAYER_DRAFT_FRAMES = 42;
const TEAM_HOLD_FRAMES = 75;
const OUTRO_FRAMES = 270;

const W = 1080;
const H = 1920;

// Instagram Reel safe zone — username bar / handle on top, caption + action buttons on bottom.
// Slightly wider top + narrower bottom + a small left/right gutter so absolutely
// nothing of importance touches the canvas edge or gets cropped on phones.
const SAFE_TOP = 200;
const SAFE_BOTTOM = 350;
const SAFE_LEFT = 50;
const SAFE_RIGHT = 50;
const SAFE_H = H - SAFE_TOP - SAFE_BOTTOM;        // 1370
const SAFE_W = W - SAFE_LEFT - SAFE_RIGHT;        // 980
const SAFE_CENTER_Y = SAFE_TOP + SAFE_H / 2;      // 885

// Three bands stacked vertically inside the safe zone.
// HEADER strip at the top of the safe zone carries the persistent logos during draft.
// Bottom band is the BIGGEST band — that's the actively-drafting team and it
// needs to be readable on a phone screen.
const HEADER_H = 70;
const TOP_H = 380;   // revealed-teams band (kept same per request)
const BOT_H = 480;   // current-team band — much bigger so phone viewers can read it
const HEADER_Y = SAFE_TOP;
const TOP_Y = SAFE_TOP + HEADER_H;
const MID_Y = TOP_Y + TOP_H;
const MID_H = SAFE_H - HEADER_H - TOP_H - BOT_H;  // 440
const BOT_Y = MID_Y + MID_H;

function getTeamFrames(memberCount: number) {
  return Math.min(memberCount, 5) * PLAYER_DRAFT_FRAMES + TEAM_HOLD_FRAMES;
}

export function getShuffleDuration(teamCount: number, membersPerTeam = 5) {
  return INTRO_FRAMES + SHUFFLE_FRAMES + teamCount * getTeamFrames(membersPerTeam) + OUTRO_FRAMES;
}

// High-contrast palette — bright accents over dark bgs so text stays
// readable on a phone reel. Each theme also carries a `glow` color used
// for text-shadow halos on key headlines.
const THEMES = {
  valorant: {
    accent: "#3CCBFF",
    accentAlt: "#FF4655",
    accentBright: "#5FE0FF",
    gold: "#FFD700",
    bg: "#0A0F2A",
    bgCard: "#0d1530",
    bgCardLight: "#162048",
    rgb: "60,203,255",
    glow: "rgba(95,224,255,0.55)",
  },
  dota: {
    accent: "#FF6B4A",
    accentAlt: "#FFD166",
    accentBright: "#FF8B6A",
    gold: "#FFD700",
    bg: "#0a0e18",
    bgCard: "#0f1520",
    bgCardLight: "#1a2030",
    rgb: "255,107,74",
    glow: "rgba(255,139,106,0.55)",
  },
  cs2: {
    accent: "#FFD700",
    accentAlt: "#FFA500",
    accentBright: "#FFE34D",
    gold: "#FFE34D",
    bg: "#0d0d0d",
    bgCard: "#151510",
    bgCardLight: "#202018",
    rgb: "255,215,0",
    glow: "rgba(255,227,77,0.55)",
  },
};
type Theme = typeof THEMES.valorant;

// Reusable text-glow helpers — used on every primary headline so text
// reads against any background and feels "shiny".
const glowText = (theme: Theme, intensity = 1) =>
  `0 0 ${12 * intensity}px ${theme.glow}, 0 0 ${4 * intensity}px ${theme.glow}, 0 2px 6px rgba(0,0,0,0.7)`;
const softShadow = "0 2px 8px rgba(0,0,0,0.85), 0 1px 2px rgba(0,0,0,0.9)";

// Strip "[VAL] " / "[CS2] " / etc prefixes from tournament display names —
// the canonical names in Firestore carry a game-tag bracket the social
// post doesn't need.
function stripGamePrefix(name: string): string {
  return (name || "").replace(/^\[[A-Z0-9]+\]\s*/i, "");
}

// Canonical Valorant tier colors. Used for the rank pill on every player so
// the colors carry meaning at a glance — no more cyan→red gradient.
type RankPalette = { text: string; bg: string; border: string };
const RANK_PALETTE: Record<string, RankPalette> = {
  Radiant:   { text: "#FFE96E", bg: "rgba(255,233,110,0.20)", border: "rgba(255,233,110,0.75)" },
  Immortal:  { text: "#FF7A8C", bg: "rgba(255,122,140,0.20)", border: "rgba(255,122,140,0.75)" },
  Ascendant: { text: "#5DD896", bg: "rgba(93,216,150,0.20)",  border: "rgba(93,216,150,0.75)" },
  Diamond:   { text: "#D7AAEC", bg: "rgba(215,170,236,0.20)", border: "rgba(215,170,236,0.75)" },
  Platinum:  { text: "#7DDDDD", bg: "rgba(125,221,221,0.20)", border: "rgba(125,221,221,0.75)" },
  Gold:      { text: "#FFD250", bg: "rgba(255,210,80,0.20)",  border: "rgba(255,210,80,0.75)" },
  Silver:    { text: "#D5DCE3", bg: "rgba(213,220,227,0.20)", border: "rgba(213,220,227,0.70)" },
  Bronze:    { text: "#D49B7A", bg: "rgba(212,155,122,0.20)", border: "rgba(212,155,122,0.70)" },
  Iron:      { text: "#A0A0A0", bg: "rgba(160,160,160,0.20)", border: "rgba(160,160,160,0.65)" },
};
function getRankPalette(rank?: string): RankPalette {
  if (!rank) return { text: "#FFFFFF", bg: "rgba(255,255,255,0.14)", border: "rgba(255,255,255,0.45)" };
  const base = rank.split(" ")[0];
  return RANK_PALETTE[base] || { text: "#FFFFFF", bg: "rgba(255,255,255,0.14)", border: "rgba(255,255,255,0.45)" };
}

// Crown badge for MVP players — drawn as an inline SVG so html2canvas-pro
// can rasterize it cleanly (emoji fonts are unreliable across systems).
const Crown = React.memo(({ size = 36, color = "#FFD700", glow = "rgba(255,215,0,0.7)" }: { size?: number; color?: string; glow?: string }) => (
  <svg width={size} height={size * 0.85} viewBox="0 0 32 28" fill="none" style={{ filter: `drop-shadow(0 0 6px ${glow}) drop-shadow(0 2px 4px rgba(0,0,0,0.6))` }}>
    <path
      d="M3 22 L1 6 L9 12 L16 2 L23 12 L31 6 L29 22 Z"
      fill={color}
      stroke="#fff"
      strokeWidth={1.5}
      strokeLinejoin="round"
    />
    <rect x="3" y="22" width="26" height="4" rx="1" fill={color} stroke="#fff" strokeWidth={1.5} />
    <circle cx="16" cy="2" r="1.8" fill="#fff" />
    <circle cx="1" cy="6" r="1.6" fill="#fff" />
    <circle cx="31" cy="6" r="1.6" fill="#fff" />
  </svg>
));
Crown.displayName = "Crown";

/* ═══════════════════════════════════════════════
   SCENE BACKGROUND — used by every scene for visual consistency
   Stacked radial gradients + faint grid pattern + accent lines.
   No filter:blur (html2canvas-pro can't render that reliably).
   ═══════════════════════════════════════════════ */

const SceneBackground = React.memo(({ theme }: { theme: Theme }) => (
  <>
    {/* Base layered radial + linear gradients */}
    <div style={{
      position: "absolute", inset: 0,
      background: `
        radial-gradient(ellipse 720px 720px at 18% 12%, rgba(${theme.rgb}, 0.22) 0%, transparent 55%),
        radial-gradient(ellipse 800px 800px at 82% 92%, rgba(${theme.rgb}, 0.14) 0%, transparent 60%),
        radial-gradient(ellipse 1100px 1100px at 50% 50%, rgba(${theme.rgb}, 0.05) 0%, transparent 65%),
        linear-gradient(180deg, ${theme.bg} 0%, #02050f 100%)
      `,
    }} />
    {/* Subtle grid */}
    <div style={{
      position: "absolute", inset: 0,
      backgroundImage: `
        linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)
      `,
      backgroundSize: "90px 90px",
    }} />
    {/* Accent guide lines for depth */}
    <div style={{
      position: "absolute", left: 0, right: 0, top: "32%", height: 1,
      background: `linear-gradient(90deg, transparent, rgba(${theme.rgb}, 0.32), transparent)`,
    }} />
    <div style={{
      position: "absolute", left: 0, right: 0, top: "70%", height: 1,
      background: `linear-gradient(90deg, transparent, rgba(${theme.rgb}, 0.32), transparent)`,
    }} />
  </>
));
SceneBackground.displayName = "SceneBackground";

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
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: SAFE_TOP, paddingBottom: SAFE_BOTTOM, paddingLeft: 60, paddingRight: 60 }}>
      <SceneBackground theme={theme} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{
          opacity: titleOp, transform: `translateY(${titleY}px)`,
          fontSize: 30, fontWeight: 900, color: theme.accentBright,
          letterSpacing: 8, textTransform: "uppercase", marginBottom: 18,
          textShadow: glowText(theme, 0.8),
        }}>Indian Esports</div>
        <div style={{
          opacity: titleOp, transform: `translateY(${titleY}px)`,
          fontSize: 70, fontWeight: 900, color: "#fff",
          letterSpacing: -1, textAlign: "center", maxWidth: 940, lineHeight: 1.05, marginBottom: 70,
          textShadow: glowText(theme, 1.2),
        }}>{stripGamePrefix(tournamentName)}</div>
        <div style={{ opacity: btnOp, transform: `scale(${btnScale * clickScale})` }}>
          <div style={{
            padding: "26px 78px", borderRadius: 22, fontSize: 32, fontWeight: 900, color: "#fff",
            letterSpacing: 5, textTransform: "uppercase",
            background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentAlt})`,
            boxShadow: `0 0 60px ${theme.glow}, 0 8px 30px rgba(0,0,0,0.5)`,
            border: `3px solid rgba(255,255,255,0.4)`,
            textShadow: softShadow,
          }}>Shuffle Teams</div>
        </div>
      </div>
      {flash > 0 && <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash }} />}
    </AbsoluteFill>
  );
}

/* ═══════════════════════════════════════════════
   SCENE 2: SHUFFLE — sort + Top-5 MVP showcase
   Phase 1 (0..SHUFFLE_SORT_FRAMES): cycling list of all players,
       suggesting the system is sorting through everyone.
   Phase 2 (sortEnd..mvpEnd): each Top-5 MVP is revealed one by one,
       depicted as being pulled out of the list with their previous-
       tournament achievement (their iesports rank).
   Phase 3 (mvpEnd..end): all 5 MVPs visible as a row, brief hold
       before the team-formation scenes start.
   ═══════════════════════════════════════════════ */

function ShuffleScene({ frame, theme, allPlayers, providedMvps }: { frame: number; theme: Theme; allPlayers: ShufflePlayer[]; providedMvps?: ShufflePlayer[] }) {
  // ── MVP set ────────────────────────────────────────────────────────────
  // Prefer MVPs explicitly passed in (those are the actual top performers
  // from the previous tournament who are also playing this one). Otherwise
  // fall back to top N by tier from the current roster.
  const sorted = useMemo(() => {
    const arr = [...allPlayers];
    arr.sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0) || (a.name || "").localeCompare(b.name || ""));
    return arr;
  }, [allPlayers]);

  const mvps = useMemo<ShufflePlayer[]>(() => {
    if (providedMvps && providedMvps.length > 0) {
      // Match provided MVPs against the registered roster so we always render
      // the in-tournament version (with up-to-date avatar/rank from the
      // current tournament's snapshot). Filters out anyone NOT playing.
      const matched: ShufflePlayer[] = [];
      for (const mvp of providedMvps) {
        const inRoster = allPlayers.find(p =>
          (mvp.uid && p.uid && mvp.uid === p.uid) || p.name === mvp.name
        );
        if (inRoster) matched.push(inRoster);
      }
      if (matched.length > 0) return matched.slice(0, SHUFFLE_MVP_COUNT);
    }
    return sorted.slice(0, SHUFFLE_MVP_COUNT);
  }, [providedMvps, allPlayers, sorted]);

  // Stable index of each MVP within the FULL sorted list — used to compute
  // the orbit angle that puts that MVP at the front position.
  const mvpFullIdx = mvps.map((m) => {
    const i = sorted.findIndex((p) => (m.uid && p.uid && m.uid === p.uid) || p.name === m.name);
    return i >= 0 ? i : 0;
  });

  const N = sorted.length || 1;
  const TWO_PI = Math.PI * 2;
  const anglePerSlot = TWO_PI / N;

  // ── Build a deterministic rotation timeline ──────────────────────────
  // Each MVP has a target rotation that places it at the "front center"
  // of the orbit. We always rotate forward (increasing rotation) for a
  // smooth, predictable visual.
  const keyframes = useMemo(() => {
    type KF = { frame: number; rotation: number };
    const kf: KF[] = [];
    let curFrame = 0;
    let curRotation = 0;

    // Intro: spin from 0 to MVP[0]
    kf.push({ frame: curFrame, rotation: curRotation });
    curFrame += SHUFFLE_INTRO_FRAMES;
    let target = -mvpFullIdx[0] * anglePerSlot;
    while (target >= curRotation) target -= TWO_PI; // always rotate forward
    curRotation = target;
    kf.push({ frame: curFrame, rotation: curRotation });

    for (let i = 1; i < mvps.length; i++) {
      // Pause on previous MVP
      curFrame += SHUFFLE_MVP_PAUSE_FRAMES;
      kf.push({ frame: curFrame, rotation: curRotation });

      // Rotate forward to next MVP
      curFrame += SHUFFLE_MVP_ROTATE_FRAMES;
      let nextTarget = -mvpFullIdx[i] * anglePerSlot;
      while (nextTarget >= curRotation) nextTarget -= TWO_PI;
      curRotation = nextTarget;
      kf.push({ frame: curFrame, rotation: curRotation });
    }

    // Final pause
    curFrame += SHUFFLE_MVP_PAUSE_FRAMES;
    kf.push({ frame: curFrame, rotation: curRotation });

    // Outro
    curFrame += SHUFFLE_OUTRO_FRAMES;
    kf.push({ frame: curFrame, rotation: curRotation });

    return kf;
  }, [mvps, mvpFullIdx, anglePerSlot]);

  // Smooth rotation lookup with ease-in-out between adjacent keyframes.
  const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const rotation = (() => {
    for (let i = 0; i < keyframes.length - 1; i++) {
      const a = keyframes[i];
      const b = keyframes[i + 1];
      if (frame >= a.frame && frame <= b.frame) {
        const span = Math.max(1, b.frame - a.frame);
        const t = (frame - a.frame) / span;
        const eased = a.rotation === b.rotation ? t : easeInOut(t);
        return a.rotation + (b.rotation - a.rotation) * eased;
      }
    }
    return keyframes[keyframes.length - 1].rotation;
  })();

  // Determine which MVP is currently in the "highlighted" pause window.
  const currentMvpIdx = (() => {
    let cur = SHUFFLE_INTRO_FRAMES;
    for (let i = 0; i < mvps.length; i++) {
      const pauseEnd = cur + SHUFFLE_MVP_PAUSE_FRAMES;
      if (frame >= cur && frame < pauseEnd) return i;
      cur = pauseEnd;
      if (i < mvps.length - 1) cur += SHUFFLE_MVP_ROTATE_FRAMES;
    }
    return -1;
  })();

  // ── Orbit geometry ───────────────────────────────────────────────────
  // A horizontal tilted ellipse. Aggressive depth contrast — front avatar
  // is huge and unmissable, back ones are tiny and barely visible so the
  // focal point reads instantly on a phone.
  const orbitCx = W / 2;
  const orbitCy = SAFE_CENTER_Y + 30;
  const orbitRx = 360;       // horizontal radius
  const orbitRy = 60;        // gentle vertical bobbing for tilt
  const sizeMin = 28;        // back avatars (much smaller than before)
  const sizeMax = 280;       // front avatar (much bigger than before)

  // ── Heading ──────────────────────────────────────────────────────────
  const headingOp = interpolate(frame, [0, 12], [0, 1], clamp);
  const headingFadeOut = interpolate(frame, [SHUFFLE_FRAMES - 14, SHUFFLE_FRAMES], [1, 0.6], clamp);

  // Subline that flips between the watchlist tag and the active MVP's name
  const subline = currentMvpIdx >= 0
    ? `Player to Watch · ${mvps[currentMvpIdx]?.name ?? ""}`
    : "Players to watch for · From Prelims";

  const flash = interpolate(frame, [SHUFFLE_FRAMES - 10, SHUFFLE_FRAMES - 5, SHUFFLE_FRAMES], [0, 0.7, 0], clamp);

  return (
    <AbsoluteFill>
      <SceneBackground theme={theme} />

      {/* Heading block */}
      <div style={{
        position: "absolute", top: SAFE_TOP + 30, left: SAFE_LEFT, right: SAFE_RIGHT,
        textAlign: "center",
        opacity: headingOp * headingFadeOut,
      }}>
        <div style={{
          fontSize: 20, fontWeight: 900, color: theme.gold,
          letterSpacing: 6, textTransform: "uppercase", marginBottom: 10,
          textShadow: glowText(theme, 0.7),
        }}>
          Players to Watch
        </div>
        <div style={{
          fontSize: 52, fontWeight: 900, color: "#fff",
          letterSpacing: 0.5, lineHeight: 1.02, marginBottom: 8,
          textShadow: glowText(theme, 1.2),
        }}>
          From Prelims
        </div>
        <div style={{
          fontSize: 20, fontWeight: 800, color: theme.accentBright,
          letterSpacing: 3, textTransform: "uppercase",
          maxWidth: SAFE_W, margin: "0 auto",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          textShadow: glowText(theme, 0.6),
          minHeight: 28,
        }}>
          {subline}
        </div>
      </div>

      {/* Orbit of player avatars */}
      {sorted.map((p, i) => {
        const baseAngle = i * anglePerSlot;
        const eff = baseAngle + rotation;
        // Normalize to [-PI, PI] for cosine
        const sinA = Math.sin(eff);
        const cosA = Math.cos(eff);

        const x = sinA * orbitRx;
        const y = -cosA * orbitRy; // negative so "front" sits slightly lower than "back"

        const depth = (cosA + 1) / 2; // 0 (back) to 1 (front)
        const size = sizeMin + (sizeMax - sizeMin) * depth;
        const opacity = 0.18 + 0.82 * depth;
        const isFront = depth > 0.92;
        const isHighlightedMvp = isFront && currentMvpIdx >= 0 && i === mvpFullIdx[currentMvpIdx];

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
            {isHighlightedMvp && (
              <div style={{
                position: "absolute", inset: -22, borderRadius: "50%",
                background: `radial-gradient(circle, ${theme.glow} 0%, transparent 70%)`,
              }} />
            )}
            <div style={{
              position: "relative",
              width: size, height: size,
              borderRadius: "50%",
              border: `${isHighlightedMvp ? 5 : 3}px solid ${isHighlightedMvp ? theme.gold : theme.accentBright}`,
              boxShadow: isHighlightedMvp
                ? `0 0 30px ${theme.glow}, 0 8px 24px rgba(0,0,0,0.6)`
                : `0 4px 14px rgba(0,0,0,0.5)`,
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

      {/* MVP detail panel — pinned below the orbit */}
      {currentMvpIdx >= 0 && (() => {
        const cur = mvps[currentMvpIdx];
        if (!cur) return null;
        // Local time inside the current pause for fade-in
        const intoPause = (() => {
          let f = SHUFFLE_INTRO_FRAMES;
          for (let i = 0; i < currentMvpIdx; i++) {
            f += SHUFFLE_MVP_PAUSE_FRAMES + SHUFFLE_MVP_ROTATE_FRAMES;
          }
          return frame - f;
        })();
        const detailOp = interpolate(intoPause, [0, 10], [0, 1], clamp);
        const detailY = interpolate(intoPause, [0, 12], [16, 0], clamp);

        const rc = getRankPalette(cur.rank);
        return (
          <div style={{
            position: "absolute", left: SAFE_LEFT, right: SAFE_RIGHT,
            top: orbitCy + orbitRy + 175,
            display: "flex", flexDirection: "column", alignItems: "center",
            opacity: detailOp,
            transform: `translateY(${detailY}px)`,
          }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 12,
              fontSize: 20, fontWeight: 900, color: theme.gold,
              letterSpacing: 6, textTransform: "uppercase",
              padding: "9px 28px", borderRadius: 100,
              background: "rgba(255,215,0,0.15)",
              border: `2px solid ${theme.gold}`,
              marginBottom: 14,
              textShadow: glowText(theme, 0.8),
            }}>
              <Crown size={26} />
              Prelims MVP
            </div>
            <div style={{
              fontSize: 60, fontWeight: 900, color: "#fff",
              letterSpacing: 0.5, textAlign: "center",
              maxWidth: SAFE_W, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              textShadow: glowText(theme, 1.2),
              marginBottom: 14,
            }}>
              {cur.name}
            </div>
            {cur.rank && (
              <div style={{
                fontSize: 24, fontWeight: 900, color: rc.text,
                padding: "10px 32px", borderRadius: 100,
                background: rc.bg,
                border: `2px solid ${rc.border}`,
                textShadow: softShadow,
              }}>
                {cur.rank}
              </div>
            )}
          </div>
        );
      })()}

      {flash > 0 && <div style={{ position: "absolute", inset: 0, background: theme.accentBright, opacity: flash }} />}
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
        background: `linear-gradient(180deg, ${theme.bgCardLight}, ${theme.bgCard})`,
        border: `2px solid rgba(${theme.rgb}, 0.4)`,
        borderRadius: 22,
        padding: "20px 26px",
        transform: `translateX(${dx}px)`,
        opacity: op,
        boxShadow: `0 14px 44px rgba(0,0,0,0.5), 0 0 40px rgba(${theme.rgb}, 0.15) inset`,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}>
        {/* Team label (top) */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
          <div style={{
            fontSize: 22, fontWeight: 900, color: theme.accentBright,
            letterSpacing: 4, textTransform: "uppercase",
            textShadow: glowText(theme, 0.55),
          }}>
            Team {cardTeamIdx + 1} · Revealed
          </div>
          <div style={{
            fontSize: 18, fontWeight: 800, color: theme.gold,
            letterSpacing: 3, textTransform: "uppercase",
            textShadow: softShadow,
          }}>
            {members.length} Players
          </div>
        </div>
        <div style={{
          fontSize: 46, fontWeight: 900, color: "#fff",
          letterSpacing: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1,
          textShadow: glowText(theme, 0.85),
        }}>
          {team.teamName}
        </div>
        <div style={{
          height: 3, background: `linear-gradient(90deg, ${theme.accentBright}, ${theme.accent}, transparent)`,
          borderRadius: 2,
          boxShadow: `0 0 12px ${theme.glow}`,
        }} />
        {/* Horizontal player row (bottom of card) */}
        <div style={{ flex: 1, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", paddingTop: 18 }}>
          {members.map((p, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
              <div style={{ position: "relative" }}>
                <Avatar src={p.avatar} name={p.name} size={96} border={`3px solid ${p.isMvp ? theme.gold : theme.accentBright}`} rgb={theme.rgb} />
                {p.isMvp && (
                  <div style={{ position: "absolute", top: -26, left: "50%", transform: "translateX(-50%)" }}>
                    <Crown size={32} />
                  </div>
                )}
              </div>
              <div style={{
                fontSize: 20, fontWeight: 900, color: p.isMvp ? theme.gold : "#fff",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                maxWidth: "100%", textAlign: "center",
                textShadow: softShadow,
              }}>
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
        <div style={{
          fontSize: 26, fontWeight: 900, color: theme.accentBright,
          letterSpacing: 10, textTransform: "uppercase", marginBottom: 16,
          textShadow: glowText(theme, 0.85),
        }}>
          Team Locked
        </div>
        <div style={{
          fontSize: 84, fontWeight: 900, color: "#fff",
          letterSpacing: 1, textAlign: "center", lineHeight: 1.02, marginBottom: 22,
          maxWidth: 960, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          textShadow: glowText(theme, 1.4),
        }}>
          {team.teamName}
        </div>
        <div style={{
          padding: "14px 40px", borderRadius: 100,
          background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentAlt})`,
          border: `2px solid rgba(255,255,255,0.4)`,
          fontSize: 22, fontWeight: 900, color: "#fff",
          letterSpacing: 3, textTransform: "uppercase",
          textShadow: softShadow,
          boxShadow: `0 8px 28px ${theme.glow}`,
        }}>
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
  const exitY = exitE * 36;

  return (
    <div style={band}>
      <div style={{
        fontSize: 22, fontWeight: 900, color: theme.accentBright,
        letterSpacing: 6, textTransform: "uppercase", marginBottom: 14,
        opacity: enterOp * exitOp,
        textShadow: glowText(theme, 0.65),
      }}>
        Player {currentPlayerIdx + 1} of {members.length}
      </div>
      <div style={{
        opacity: enterOp * exitOp,
        transform: `translateY(${exitY}px) scale(${enterScale * exitScale})`,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
      }}>
        <div style={{ position: "relative" }}>
          <div style={{
            position: "absolute", inset: -14, borderRadius: "50%",
            background: `radial-gradient(circle, ${theme.glow} 0%, transparent 70%)`,
          }} />
          <Avatar src={player.avatar} name={player.name} size={210} border={`6px solid ${player.isMvp ? theme.gold : theme.accentBright}`} rgb={theme.rgb} />
          {player.isMvp && (
            <div style={{ position: "absolute", top: -42, left: "50%", transform: "translateX(-50%)" }}>
              <Crown size={68} />
            </div>
          )}
        </div>
        <div style={{
          fontSize: 58, fontWeight: 900, color: "#fff",
          letterSpacing: 0.5, textAlign: "center",
          maxWidth: 960, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          textShadow: glowText(theme, 1.2),
        }}>
          {player.name}
        </div>
        {player.tag && (
          <div style={{
            fontSize: 22, fontWeight: 800, color: theme.gold, marginTop: -4,
            textShadow: softShadow,
          }}>
            #{player.tag}
          </div>
        )}
        {player.rank && (() => {
          const rc = getRankPalette(player.rank);
          return (
            <div style={{
              fontSize: 24, fontWeight: 900, color: rc.text,
              padding: "10px 32px", borderRadius: 100,
              background: rc.bg,
              border: `2px solid ${rc.border}`,
              marginTop: 4,
              textShadow: softShadow,
            }}>
              {player.rank}
            </div>
          );
        })()}
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
  const PAD_X = 26;
  const PAD_Y = 16;

  return (
    <div style={{
      position: "absolute", left: PAD_X, right: PAD_X, top: BOT_Y + PAD_Y, height: BOT_H - PAD_Y * 2,
      background: `linear-gradient(180deg, ${theme.bgCardLight}, ${theme.bgCard})`,
      border: `2px solid rgba(${theme.rgb}, 0.45)`,
      borderRadius: 26,
      padding: "26px 32px 30px",
      opacity: cardOp,
      boxShadow: `0 -16px 50px rgba(0,0,0,0.55), 0 0 60px rgba(${theme.rgb}, 0.18) inset`,
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{
          fontSize: 28, fontWeight: 900, color: theme.accentBright,
          letterSpacing: 5, textTransform: "uppercase",
          textShadow: glowText(theme, 0.7),
        }}>
          {inHoldPhase ? "Locked In" : "Now Drafting"}
        </div>
        <div style={{
          fontSize: 24, fontWeight: 900, color: theme.gold,
          letterSpacing: 3, textTransform: "uppercase",
          textShadow: softShadow,
        }}>
          Team {teamIndex + 1}
        </div>
      </div>
      <div style={{
        fontSize: 64, fontWeight: 900, color: "#fff",
        letterSpacing: 0.5, marginBottom: 16,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1,
        textShadow: glowText(theme, 1.1),
      }}>
        {team.teamName}
      </div>
      <div style={{
        height: 4, background: `linear-gradient(90deg, ${theme.accentBright}, ${theme.accent}, transparent)`,
        marginBottom: 24, borderRadius: 2,
        boxShadow: `0 0 14px ${theme.glow}`,
      }} />
      <div style={{ flex: 1, display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center" }}>
        {members.map((player, i) => {
          // The player appears in their slot at the START of the middle-band
          // spotlight for that slot, not at the end — so the bottom card is
          // never "missing" the player who's currently being showcased above.
          const playerStartFrame = i * PLAYER_DRAFT_FRAMES;
          const isPlaced = frame >= playerStartFrame || inHoldPhase;
          const justPlaced = frame >= playerStartFrame && frame < playerStartFrame + 12;

          if (!isPlaced) {
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, opacity: 0.5 }}>
                <div style={{ width: 150, height: 150, borderRadius: "50%", border: "3px dashed rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)" }} />
                <div style={{
                  fontSize: 18, color: "rgba(255,255,255,0.5)", fontWeight: 800,
                  letterSpacing: 2, textTransform: "uppercase",
                  textShadow: softShadow,
                }}>Slot {i + 1}</div>
              </div>
            );
          }

          const placeOp = fade(frame, playerStartFrame, 8);
          const placeScale = interpolate(frame, [playerStartFrame, playerStartFrame + 10], [0.7, 1], clamp);
          const rc = player.rank ? getRankPalette(player.rank) : null;
          const borderColor = player.isMvp
            ? theme.gold
            : justPlaced ? theme.accentBright : theme.accent;
          return (
            <div key={i} style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
              opacity: placeOp, transform: `scale(${placeScale})`,
            }}>
              <div style={{ position: "relative" }}>
                {(justPlaced || player.isMvp) && (
                  <div style={{
                    position: "absolute", inset: -12, borderRadius: "50%",
                    background: `radial-gradient(circle, ${player.isMvp ? "rgba(255,215,0,0.5)" : theme.glow} 0%, transparent 70%)`,
                  }} />
                )}
                <Avatar
                  src={player.avatar}
                  name={player.name}
                  size={150}
                  border={`4px solid ${borderColor}`}
                  rgb={theme.rgb}
                />
                {player.isMvp && (
                  <div style={{ position: "absolute", top: -38, left: "50%", transform: "translateX(-50%)" }}>
                    <Crown size={54} />
                  </div>
                )}
              </div>
              <div style={{
                fontSize: 28, fontWeight: 900, color: "#fff",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                maxWidth: 220, textAlign: "center", lineHeight: 1.05,
                textShadow: softShadow,
              }}>
                {player.name}
              </div>
              {rc && (
                <div style={{
                  fontSize: 18, fontWeight: 900, color: rc.text,
                  padding: "6px 16px", borderRadius: 100,
                  background: rc.bg,
                  border: `2px solid ${rc.border}`,
                  textShadow: softShadow,
                  whiteSpace: "nowrap",
                }}>
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
    <AbsoluteFill>
      <SceneBackground theme={theme} />
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
      <div style={{ position: "absolute", left: 60, right: 60, top: MID_Y - 1, height: 1, background: `linear-gradient(90deg, transparent, rgba(${theme.rgb}, 0.35), transparent)` }} />
      <div style={{ position: "absolute", left: 60, right: 60, top: BOT_Y - 1, height: 1, background: `linear-gradient(90deg, transparent, rgba(${theme.rgb}, 0.35), transparent)` }} />
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
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: SAFE_TOP, paddingBottom: SAFE_BOTTOM, paddingLeft: 40, paddingRight: 40 }}>
      <SceneBackground theme={theme} />
      {!showInstructions && (
        <>
          <div style={{ marginBottom: 24, textAlign: "center", opacity: lockedOp, transform: `scale(${lockedScale})` }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: "#fff", letterSpacing: 6, textTransform: "uppercase" }}>Teams Locked</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: theme.accent, letterSpacing: 4, textTransform: "uppercase", marginTop: 10 }}>{stripGamePrefix(tournamentName)}</div>
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
          <div style={{ fontSize: 52, fontWeight: 900, color: "#fff", letterSpacing: 2, lineHeight: 1.1 }}>{stripGamePrefix(tournamentName)}</div>
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

export const ShuffleRevealComposition: React.FC<ShuffleRevealProps> = ({ tournamentName, game, teams, mvps }) => {
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
    <AbsoluteFill style={{ background: "#02050f", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <IntroScene frame={frame} theme={theme} tournamentName={tournamentName} />
      </Sequence>
      <Sequence from={INTRO_FRAMES} durationInFrames={SHUFFLE_FRAMES}>
        <ShuffleScene frame={frame - INTRO_FRAMES} theme={theme} allPlayers={allPlayers} providedMvps={mvps} />
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
            {stripGamePrefix(tournamentName)}
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
