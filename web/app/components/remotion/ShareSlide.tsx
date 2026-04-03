"use client";
import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  AbsoluteFill,
  Img,
} from "remotion";

/* ═══════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════ */

export interface ShareSlideData {
  name: string;
  format?: string;
  entryFee?: number;
  prizePool?: string;
  startDate?: string;
  endDate?: string;
  registrationDeadline?: string;
  slotsBooked?: number;
  totalSlots?: number;
  totalTeams?: number;
  playersPerTeam?: number;
  matchesPerRound?: number;
  groupStageRounds?: number;
  bracketFormat?: string;
  bracketBestOf?: number;
  bracketTeamCount?: number | string;
  grandFinalBestOf?: number;
  schedule?: {
    registrationOpens?: string;
    registrationCloses?: string;
    squadCreation?: string;
    groupStageStart?: string;
    tourneyStageStart?: string;
  };
  shareImages?: {
    tagline?: string;
    highlightText?: string;
  };
}

export interface ShareSlideProps {
  tournament: ShareSlideData;
  type: string;
}

/* ═══════════════════════════════════════════════
   GRACEFUL COLOR PALETTE
   ═══════════════════════════════════════════════ */

const C = {
  rose: "#e05672",       // softer Valorant-inspired red
  gold: "#c8a44e",       // matches the shield logo
  lavender: "#8a7cbf",   // muted purple
  sky: "#6a9fd8",        // calm blue
  steel: "#5b8ec9",      // deeper blue for stages
  sage: "#5aad7e",       // refined green
  amber: "#d49845",      // warm amber
  cream: "rgba(255,255,255,0.55)",
  muted: "rgba(255,255,255,0.35)",
} as const;

/* ═══════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════ */

function fmtDate(iso?: string) {
  if (!iso) return "TBD";
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
    return `${date}, ${time}`;
  } catch {
    return "TBD";
  }
}

function fade(frame: number, start: number, dur = 15) {
  return interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

function slideY(frame: number, start: number, dist = 30, dur = 20) {
  return interpolate(frame, [start, start + dur], [dist, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

function scaleIn(frame: number, start: number, fps: number) {
  return spring({ frame: frame - start, fps, config: { damping: 12, stiffness: 100 } });
}

/* ═══════════════════════════════════════════════
   SHARED BUILDING BLOCKS (animated)
   ═══════════════════════════════════════════════ */

function AnimatedBackground({ frame }: { frame: number }) {
  const breathe = Math.sin(frame * 0.035) * 0.12 + 1;
  const breathe2 = Math.sin(frame * 0.028 + 1) * 0.10 + 1;
  const dotOpacity = fade(frame, 0, 30);
  const lineRotate1 = -30 + Math.sin(frame * 0.018) * 2.5;
  const lineRotate2 = -30 + Math.cos(frame * 0.022) * 2;

  return (
    <AbsoluteFill>
      {/* Base gradient — deep, warm-tinted dark */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(155deg, #080612 0%, #120e1e 25%, #0c0a18 50%, #0a0814 75%, #070510 100%)",
        }}
      />
      {/* Glow: top-left warm gold */}
      <div
        style={{
          position: "absolute",
          top: -250,
          left: -200,
          width: 700,
          height: 700,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(200,164,78,0.18) 0%, rgba(200,164,78,0.04) 50%, transparent 70%)",
          transform: `scale(${breathe})`,
        }}
      />
      {/* Glow: bottom-right lavender */}
      <div
        style={{
          position: "absolute",
          bottom: -200,
          right: -150,
          width: 600,
          height: 600,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(138,124,191,0.14) 0%, rgba(138,124,191,0.03) 50%, transparent 70%)",
          transform: `scale(${breathe2})`,
        }}
      />
      {/* Glow: center-right rose (subtle) */}
      <div
        style={{
          position: "absolute",
          top: 350,
          right: -100,
          width: 450,
          height: 450,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(224,86,114,0.08) 0%, transparent 70%)",
          transform: `scale(${breathe})`,
        }}
      />
      {/* Dot grid — gold tint */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(rgba(200,164,78,0.07) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
          opacity: dotOpacity,
        }}
      />
      {/* Accent line top-right */}
      <div
        style={{
          position: "absolute",
          top: 80,
          right: -100,
          width: 500,
          height: 2,
          background:
            "linear-gradient(90deg, transparent, rgba(200,164,78,0.30), transparent)",
          transform: `rotate(${lineRotate1}deg)`,
          opacity: fade(frame, 5, 20),
        }}
      />
      {/* Accent line bottom-left */}
      <div
        style={{
          position: "absolute",
          bottom: 120,
          left: -100,
          width: 400,
          height: 1.5,
          background:
            "linear-gradient(90deg, transparent, rgba(224,86,114,0.20), transparent)",
          transform: `rotate(${lineRotate2}deg)`,
          opacity: fade(frame, 8, 20),
        }}
      />
    </AbsoluteFill>
  );
}

function AnimatedTopBar({
  frame,
  fps,
  label,
}: {
  frame: number;
  fps: number;
  label: string;
}) {
  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 80 } });
  const y = interpolate(enter, [0, 1], [-60, 0]);
  const opacity = interpolate(enter, [0, 1], [0, 1]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "52px 60px 0",
        transform: `translateY(${y}px)`,
        opacity,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* iEsports shield logo */}
        <Img
          src="/ielogo.png"
          style={{
            width: 48,
            height: 48,
            borderRadius: 10,
            objectFit: "contain",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: 900,
              color: "#fff",
              letterSpacing: "0.08em",
              lineHeight: 1,
            }}
          >
            IESPORTS
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: C.muted,
              letterSpacing: "0.15em",
            }}
          >
            iesports.in
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* VALORANT badge with logo */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 900,
            letterSpacing: "0.15em",
            padding: "8px 18px",
            background: "rgba(224,86,114,0.08)",
            border: "1px solid rgba(224,86,114,0.22)",
            borderRadius: 100,
            color: C.rose,
          }}
        >
          <Img
            src="/valorantlogo.png"
            style={{ width: 16, height: 16, objectFit: "contain" }}
          />
          VALORANT
        </div>
        {/* Type label */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 900,
            letterSpacing: "0.12em",
            padding: "8px 18px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 100,
            color: C.muted,
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

function AnimatedBottomBar({
  frame,
  fps,
}: {
  frame: number;
  fps: number;
}) {
  const enter = spring({
    frame: Math.max(0, frame - 5),
    fps,
    config: { damping: 14, stiffness: 80 },
  });
  const y = interpolate(enter, [0, 1], [50, 0]);
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const dotPulse = Math.sin(frame * 0.08) * 0.3 + 0.7;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "0 60px 52px",
        marginTop: "auto",
        transform: `translateY(${y}px)`,
        opacity,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* Logo in bottom bar */}
        <Img
          src="/ielogo.png"
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            objectFit: "contain",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: C.gold,
              letterSpacing: "0.04em",
              lineHeight: 1.1,
            }}
          >
            iesports.in
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: C.muted,
              letterSpacing: "0.1em",
            }}
          >
            INDIAN ESPORTS PLATFORM
          </div>
        </div>
      </div>
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: C.gold,
          boxShadow: `0 0 ${12 * dotPulse}px rgba(200,164,78,${0.5 * dotPulse})`,
        }}
      />
    </div>
  );
}

/* ─── Reusable UI pieces ─── */

function Num({
  n,
  color,
  size = 56,
}: {
  n: string;
  color: string;
  size?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${color}22, ${color}0A)`,
        border: `2px solid ${color}40`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 900,
        color,
        flexShrink: 0,
        boxShadow: `0 0 16px ${color}15`,
      }}
    >
      {n}
    </div>
  );
}

function StatBox({
  val,
  label,
  color,
  frame,
  delay,
  fps,
}: {
  val: string;
  label: string;
  color: string;
  frame: number;
  delay: number;
  fps: number;
}) {
  const s = scaleIn(frame, delay, fps);
  const opacity = fade(frame, delay, 12);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 22,
        padding: "28px 16px",
        position: "relative",
        overflow: "hidden",
        transform: `scale(${s})`,
        opacity,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: 3,
          background: `linear-gradient(90deg, ${color}, ${color}30, transparent)`,
        }}
      />
      <div
        style={{
          fontSize: 36,
          fontWeight: 900,
          color: "#fff",
          lineHeight: 1.1,
          marginBottom: 8,
        }}
      >
        {val}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: "0.12em",
          color,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Badge({
  text,
  color,
  frame,
  delay,
  fps,
}: {
  text: string;
  color: string;
  frame: number;
  delay: number;
  fps: number;
}) {
  const s = scaleIn(frame, delay, fps);
  return (
    <div
      style={{
        display: "inline-flex",
        fontSize: 16,
        fontWeight: 900,
        padding: "10px 26px",
        borderRadius: 100,
        background: `linear-gradient(135deg, ${color}18, ${color}08)`,
        border: `1.5px solid ${color}35`,
        color,
        letterSpacing: "0.1em",
        boxShadow: `0 0 20px ${color}10`,
        transform: `scale(${s})`,
        opacity: fade(frame, delay, 10),
      }}
    >
      {text}
    </div>
  );
}

function StageCard({
  num,
  title,
  sub,
  detail,
  color,
  frame,
  delay,
  fps,
}: {
  num: string;
  title: string;
  sub: string;
  detail: string;
  color: string;
  frame: number;
  delay: number;
  fps: number;
}) {
  const s = scaleIn(frame, delay, fps);
  const opacity = fade(frame, delay, 12);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 22,
        background: `linear-gradient(135deg, ${color}0A, ${color}03)`,
        border: `1.5px solid ${color}25`,
        borderRadius: 22,
        padding: "28px 32px",
        position: "relative",
        overflow: "hidden",
        transform: `scale(${s})`,
        opacity,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: 3,
          background: `linear-gradient(90deg, ${color}, ${color}35, transparent)`,
        }}
      />
      <Num n={num} color={color} size={64} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <div
          style={{
            fontSize: 28,
            fontWeight: 900,
            color,
            letterSpacing: "0.04em",
            lineHeight: 1.2,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 20,
            color: C.cream,
            fontWeight: 600,
            marginTop: 4,
          }}
        >
          {sub}
        </div>
        {detail && (
          <div
            style={{
              fontSize: 16,
              color: C.muted,
              fontWeight: 500,
              marginTop: 4,
            }}
          >
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SLIDE TYPE COMPOSITIONS
   ═══════════════════════════════════════════════ */

function OverviewSlide({
  t,
  frame,
  fps,
}: {
  t: ShareSlideData;
  frame: number;
  fps: number;
}) {
  const name = t.name || "Tournament";
  const tagline = t.shareImages?.tagline || "Indian Esports Tournament Platform";
  const highlight = t.shareImages?.highlightText || "";
  const fmtLabel =
    t.format === "shuffle" ? "SHUFFLE" : t.format === "auction" ? "AUCTION" : "STANDARD";
  const hasPrize = t.prizePool && t.prizePool !== "0";
  const prizeDisplay = hasPrize
    ? String(t.prizePool).replace(/^Rs\.?\s?/, "Rs.")
    : "";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: "40px 60px",
        justifyContent: "center",
      }}
    >
      {/* Format badge */}
      <div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
        <Badge text={fmtLabel} color={C.rose} frame={frame} delay={10} fps={fps} />
      </div>

      {/* Title */}
      <div
        style={{
          fontSize: 72,
          fontWeight: 900,
          color: "#fff",
          lineHeight: 1.0,
          letterSpacing: "-0.03em",
          marginBottom: 16,
          opacity: fade(frame, 15, 15),
          transform: `translateY(${slideY(frame, 15, 25, 18)}px)`,
        }}
      >
        {name}
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: 24,
          color: C.cream,
          fontWeight: 500,
          marginBottom: 32,
          lineHeight: 1.4,
          opacity: fade(frame, 25, 15),
        }}
      >
        {highlight || tagline}
      </div>

      {/* Prize Pool & Entry Fee — hero boxes */}
      <div style={{ display: "flex", gap: 18, marginBottom: 28 }}>
        {/* Entry Fee */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: `linear-gradient(160deg, ${C.lavender}0A, transparent)`,
            border: `1.5px solid ${C.lavender}25`,
            borderRadius: 22,
            padding: "24px 20px",
            position: "relative",
            overflow: "hidden",
            opacity: fade(frame, 30, 12),
            transform: `scale(${scaleIn(frame, 30, fps)})`,
          }}
        >
          <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 3, background: `linear-gradient(90deg, ${C.lavender}, ${C.lavender}30, transparent)` }} />
          <div style={{ fontSize: 44, fontWeight: 900, color: C.lavender, lineHeight: 1 }}>
            {t.entryFee === 0 ? "FREE" : `Rs.${t.entryFee}`}
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", color: C.muted, marginTop: 8 }}>
            ENTRY FEE
          </div>
        </div>

        {/* Prize Pool */}
        {hasPrize && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: `linear-gradient(160deg, ${C.gold}0C, transparent)`,
              border: `1.5px solid ${C.gold}30`,
              borderRadius: 22,
              padding: "24px 20px",
              position: "relative",
              overflow: "hidden",
              opacity: fade(frame, 34, 12),
              transform: `scale(${scaleIn(frame, 34, fps)})`,
            }}
          >
            <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 3, background: `linear-gradient(90deg, ${C.gold}, ${C.gold}30, transparent)` }} />
            <div style={{ fontSize: 44, fontWeight: 900, color: C.gold, lineHeight: 1 }}>
              {prizeDisplay}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", color: C.muted, marginTop: 8 }}>
              PRIZE POOL
            </div>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 16 }}>
        <StatBox val={`${t.totalSlots || "?"}`} label="PLAYERS" color={C.rose} frame={frame} delay={42} fps={fps} />
        <StatBox val={fmtDate(t.startDate)} label="STARTS" color={C.sky} frame={frame} delay={46} fps={fps} />
        <StatBox val={fmtDate(t.endDate || t.registrationDeadline)} label="ENDS" color={C.lavender} frame={frame} delay={50} fps={fps} />
        <StatBox val={`${t.totalTeams || "?"}`} label="TEAMS" color={C.sage} frame={frame} delay={54} fps={fps} />
      </div>
    </div>
  );
}

function RegisterSlide({
  t,
  frame,
  fps,
}: {
  t: ShareSlideData;
  frame: number;
  fps: number;
}) {
  const name = t.name || "Tournament";
  const steps = [
    { n: "1", title: "Sign Up on iesports.in", desc: "Create your account using Discord or Steam", color: C.sky },
    { n: "2", title: "Connect Your Riot ID", desc: "Link your Valorant account so we can verify your rank", color: C.lavender },
    { n: "3", title: "Register for Tournament", desc: `Find "${name}" and hit Register — takes 10 seconds`, color: C.rose },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: "40px 60px",
        justifyContent: "center",
      }}
    >
      <Badge text="HOW TO REGISTER" color={C.rose} frame={frame} delay={10} fps={fps} />

      <div
        style={{
          fontSize: 56,
          fontWeight: 900,
          color: "#fff",
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
          marginTop: 28,
          marginBottom: 12,
          opacity: fade(frame, 16, 15),
          transform: `translateY(${slideY(frame, 16, 25, 18)}px)`,
        }}
      >
        Join {name}
      </div>

      <div
        style={{
          fontSize: 22,
          color: C.cream,
          marginBottom: 44,
          opacity: fade(frame, 22, 15),
        }}
      >
        3 simple steps. Under 2 minutes. Completely free.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 40 }}>
        {steps.map((s, i) => {
          const delay = 30 + i * 8;
          const o = fade(frame, delay, 12);
          const x = interpolate(frame, [delay, delay + 15], [-40, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={s.n}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 22,
                background: `linear-gradient(135deg, ${s.color}08, transparent)`,
                border: `1.5px solid ${s.color}20`,
                borderRadius: 22,
                padding: "24px 28px",
                position: "relative",
                overflow: "hidden",
                opacity: o,
                transform: `translateX(${x}px)`,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: 4,
                  height: "100%",
                  background: s.color,
                  opacity: 0.7,
                }}
              />
              <Num n={s.n} color={s.color} />
              <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", marginBottom: 4 }}>
                  {s.title}
                </div>
                <div style={{ fontSize: 18, color: C.cream, lineHeight: 1.4 }}>
                  {s.desc}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* CTA bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "22px 32px",
          background: `linear-gradient(135deg, ${C.rose}10, ${C.rose}04)`,
          border: `2px solid ${C.rose}25`,
          borderRadius: 22,
          boxShadow: `0 0 30px ${C.rose}08`,
          opacity: fade(frame, 60, 15),
          transform: `translateY(${slideY(frame, 60, 20, 15)}px)`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 15, color: C.cream, fontWeight: 600 }}>
            Registration closes
          </div>
          <div style={{ fontSize: 26, color: C.rose, fontWeight: 900 }}>
            {fmtDate(t.registrationDeadline)}
          </div>
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 900,
            color: "#fff",
            padding: "14px 36px",
            background: `linear-gradient(135deg, ${C.rose}, #b8404e)`,
            borderRadius: 100,
            boxShadow: `0 4px 20px ${C.rose}35`,
          }}
        >
          Register Now
        </div>
      </div>

      {/* Discord note */}
      <div
        style={{
          marginTop: 16,
          fontSize: 16,
          fontWeight: 700,
          color: C.muted,
          textAlign: "center",
          opacity: fade(frame, 68, 12),
          letterSpacing: "0.04em",
        }}
      >
        All tournament communication happens on Discord
      </div>
    </div>
  );
}

function TeamsSlide({
  t,
  frame,
  fps,
}: {
  t: ShareSlideData;
  frame: number;
  fps: number;
}) {
  const name = t.name || "Tournament";
  const fmtLabel =
    t.format === "shuffle" ? "SHUFFLE" : t.format === "auction" ? "AUCTION" : "STANDARD";
  const formatDesc =
    t.format === "shuffle"
      ? "Balanced snake draft by rank"
      : t.format === "auction"
        ? "Captain auction with rank-weighted budgets"
        : "Pre-formed teams";

  const bigStats = [
    { val: `${t.totalTeams || "?"}`, label: "TEAMS", color: C.rose },
    { val: `${t.playersPerTeam || 5}`, label: "PER TEAM", color: C.lavender },
    { val: `${(t.totalTeams || 0) * (t.playersPerTeam || 5) || "?"}`, label: "TOTAL PLAYERS", color: C.sky },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: "40px 60px",
        justifyContent: "center",
      }}
    >
      <Badge text="TEAM STRUCTURE" color={C.lavender} frame={frame} delay={10} fps={fps} />

      <div
        style={{
          fontSize: 56,
          fontWeight: 900,
          color: "#fff",
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
          marginTop: 28,
          marginBottom: 48,
          opacity: fade(frame, 16, 15),
          transform: `translateY(${slideY(frame, 16, 25, 18)}px)`,
        }}
      >
        {name}
      </div>

      {/* Big stat boxes */}
      <div style={{ display: "flex", gap: 18, marginBottom: 40 }}>
        {bigStats.map((s, i) => {
          const delay = 30 + i * 7;
          const sc = scaleIn(frame, delay, fps);
          const o = fade(frame, delay, 12);
          return (
            <div
              key={s.label}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                background: `linear-gradient(160deg, ${s.color}0A, transparent)`,
                border: `1.5px solid ${s.color}25`,
                borderRadius: 26,
                padding: "36px 20px",
                position: "relative",
                overflow: "hidden",
                transform: `scale(${sc})`,
                opacity: o,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: "25%",
                  width: "50%",
                  height: 3,
                  background: `linear-gradient(90deg, transparent, ${s.color}, transparent)`,
                }}
              />
              <div style={{ fontSize: 60, fontWeight: 900, color: s.color, lineHeight: 1 }}>
                {s.val}
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: C.muted,
                  letterSpacing: "0.12em",
                  marginTop: 10,
                }}
              >
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Format card */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 22,
          padding: "28px 36px",
          position: "relative",
          overflow: "hidden",
          opacity: fade(frame, 55, 15),
          transform: `translateY(${slideY(frame, 55, 20, 15)}px)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: 3,
            background: `linear-gradient(90deg, ${C.rose}, ${C.lavender}, ${C.sky})`,
          }}
        />
        <div
          style={{
            fontSize: 14,
            fontWeight: 900,
            color: C.muted,
            letterSpacing: "0.15em",
            marginBottom: 12,
          }}
        >
          TEAM FORMATION
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: C.gold }}>
            {fmtLabel}
          </div>
          <div
            style={{
              width: 2,
              height: 30,
              background: "rgba(255,255,255,0.08)",
            }}
          />
          <div style={{ fontSize: 22, fontWeight: 600, color: C.cream }}>
            {formatDesc}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScheduleSlide({
  t,
  frame,
  fps,
}: {
  t: ShareSlideData;
  frame: number;
  fps: number;
}) {
  const name = t.name || "Tournament";
  const schedule = t.schedule || {};
  const events = [
    { lbl: "Registration Opens", date: schedule.registrationOpens, color: C.sage, n: "1" },
    { lbl: "Registration Closes", date: schedule.registrationCloses || t.registrationDeadline, color: C.amber, n: "2" },
    { lbl: "Squad Creation", date: schedule.squadCreation, color: C.lavender, n: "3" },
    { lbl: "Tournament Starts", date: t.startDate, color: C.rose, n: "4" },
    { lbl: "Group Stage", date: schedule.groupStageStart, color: C.steel, n: "5" },
    { lbl: "Bracket Stage", date: schedule.tourneyStageStart, color: C.amber, n: "6" },
    { lbl: "Tournament Ends", date: t.endDate, color: C.rose, n: "7" },
  ].filter((e) => e.date);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: "36px 60px",
        justifyContent: "center",
      }}
    >
      <Badge text="SCHEDULE" color={C.sky} frame={frame} delay={10} fps={fps} />

      <div
        style={{
          fontSize: 52,
          fontWeight: 900,
          color: "#fff",
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
          marginTop: 24,
          marginBottom: 40,
          opacity: fade(frame, 16, 15),
          transform: `translateY(${slideY(frame, 16, 25, 18)}px)`,
        }}
      >
        {name}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {events.slice(0, 7).map((e, i) => {
          const delay = 28 + i * 6;
          const o = fade(frame, delay, 12);
          const x = interpolate(frame, [delay, delay + 15], [-30, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={e.n}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 20,
                padding: "18px 24px",
                background: `linear-gradient(135deg, ${e.color}08, transparent)`,
                border: `1px solid ${e.color}18`,
                borderRadius: 18,
                position: "relative",
                overflow: "hidden",
                opacity: o,
                transform: `translateX(${x}px)`,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: 4,
                  height: "100%",
                  background: e.color,
                  opacity: 0.6,
                }}
              />
              <Num n={e.n} color={e.color} size={44} />
              <div style={{ flex: 1, fontSize: 22, fontWeight: 800, color: "#fff" }}>
                {e.lbl}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: e.color }}>
                {fmtDate(e.date)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FormatFlowSlide({
  t,
  frame,
  fps,
}: {
  t: ShareSlideData;
  frame: number;
  fps: number;
}) {
  const name = t.name || "Tournament";
  const fmtLabel =
    t.format === "shuffle" ? "SHUFFLE" : t.format === "auction" ? "AUCTION" : "STANDARD";

  const steps = [
    { n: "1", lbl: "REGISTER", sub: "Sign up on iesports.in  /  Connect Riot ID", color: C.sage },
    { n: "2", lbl: "TEAMS FORMED", sub: `${fmtLabel} format  /  ${t.playersPerTeam || 5}v${t.playersPerTeam || 5}`, color: C.lavender },
    { n: "3", lbl: "GROUP STAGE", sub: `Swiss System  /  BO${t.matchesPerRound || 2}  /  ${t.groupStageRounds || 3} Rounds`, color: C.steel },
    { n: "4", lbl: "BRACKET STAGE", sub: `${t.bracketFormat === "single_elimination" ? "Single" : "Double"} Elimination  /  BO${t.bracketBestOf || 2}  /  Top ${t.bracketTeamCount || "50%"} advance`, color: C.amber },
    { n: "5", lbl: "GRAND FINAL", sub: `Best of ${t.grandFinalBestOf || 3}  /  Champion crowned`, color: C.rose },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: "36px 60px",
        justifyContent: "center",
      }}
    >
      <Badge text="TOURNAMENT FORMAT" color={C.amber} frame={frame} delay={10} fps={fps} />

      <div
        style={{
          fontSize: 52,
          fontWeight: 900,
          color: "#fff",
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
          marginTop: 24,
          marginBottom: 12,
          opacity: fade(frame, 16, 15),
          transform: `translateY(${slideY(frame, 16, 25, 18)}px)`,
        }}
      >
        {name}
      </div>

      <div
        style={{
          fontSize: 22,
          color: C.cream,
          marginBottom: 36,
          opacity: fade(frame, 22, 15),
        }}
      >
        From signup to champion
      </div>

      {/* Vertical timeline */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {steps.map((s, i) => {
          const delay = 28 + i * 9;
          const o = fade(frame, delay, 12);
          const yOff = slideY(frame, delay, 20, 14);

          return (
            <div
              key={s.n}
              style={{
                display: "flex",
                alignItems: "stretch",
                opacity: o,
                transform: `translateY(${yOff}px)`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  width: 52,
                  flexShrink: 0,
                }}
              >
                <Num n={s.n} color={s.color} size={48} />
                {i < steps.length - 1 && (
                  <div
                    style={{
                      width: 2,
                      flex: 1,
                      minHeight: 14,
                      background: `linear-gradient(180deg, ${s.color}35, ${steps[i + 1].color}35)`,
                    }}
                  />
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  paddingLeft: 20,
                  paddingBottom: i < steps.length - 1 ? 10 : 0,
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 900,
                    color: s.color,
                    letterSpacing: "0.06em",
                    lineHeight: 1.2,
                  }}
                >
                  {s.lbl}
                </div>
                <div style={{ fontSize: 17, color: C.cream, fontWeight: 500 }}>
                  {s.sub}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Discord + Prize callout */}
      <div
        style={{
          marginTop: 28,
          fontSize: 15,
          fontWeight: 700,
          color: C.muted,
          textAlign: "center",
          opacity: fade(frame, 75, 12),
          letterSpacing: "0.04em",
        }}
      >
        All communication via Discord
      </div>

      {t.prizePool && t.prizePool !== "0" && (
        <div
          style={{
            marginTop: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
            padding: "20px 32px",
            background: `linear-gradient(135deg, ${C.gold}0C, ${C.gold}04)`,
            border: `2px solid ${C.gold}25`,
            borderRadius: 22,
            boxShadow: `0 0 30px ${C.gold}08`,
            opacity: fade(frame, 78, 15),
            transform: `scale(${scaleIn(frame, 78, fps)})`,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 800, color: C.muted, letterSpacing: "0.12em" }}>
            PRIZE POOL
          </div>
          <div style={{ fontSize: 36, fontWeight: 900, color: C.gold }}>
            {String(t.prizePool).startsWith("Rs.") ? t.prizePool : "Rs." + t.prizePool}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPOSITION
   ═══════════════════════════════════════════════ */

export const ShareSlideComposition: React.FC<ShareSlideProps> = ({
  tournament,
  type,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  let content: React.ReactNode;
  switch (type) {
    case "overview":
      content = <OverviewSlide t={tournament} frame={frame} fps={fps} />;
      break;
    case "register":
      content = <RegisterSlide t={tournament} frame={frame} fps={fps} />;
      break;
    case "teams":
      content = <TeamsSlide t={tournament} frame={frame} fps={fps} />;
      break;
    case "schedule":
      content = <ScheduleSlide t={tournament} frame={frame} fps={fps} />;
      break;
    case "format":
      content = <FormatFlowSlide t={tournament} frame={frame} fps={fps} />;
      break;
    default:
      content = (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            padding: "40px 60px",
            alignItems: "center",
            justifyContent: "center",
            opacity: fade(frame, 10, 20),
          }}
        >
          <div style={{ fontSize: 72, fontWeight: 900, color: "#fff", textAlign: "center" }}>
            {tournament.name || "Tournament"}
          </div>
          <div style={{ fontSize: 26, color: C.cream, marginTop: 16 }}>
            {tournament.shareImages?.tagline || "Indian Esports Tournament Platform"}
          </div>
        </div>
      );
  }

  return (
    <AbsoluteFill
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        overflow: "hidden",
      }}
    >
      <AnimatedBackground frame={frame} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          position: "relative",
          width: "100%",
          height: "100%",
        }}
      >
        <AnimatedTopBar frame={frame} fps={fps} label={type.toUpperCase()} />
        {content}
        <AnimatedBottomBar frame={frame} fps={fps} />
      </div>
    </AbsoluteFill>
  );
};
