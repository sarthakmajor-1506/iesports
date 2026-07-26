import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { loadFont as loadNunito } from "@remotion/google-fonts/Nunito";
import { loadFont as loadQuicksand } from "@remotion/google-fonts/Quicksand";
import { Mom } from "./characters/Mom";
import { Baby } from "./characters/Baby";

const { fontFamily: NUNITO } = loadNunito("normal", { weights: ["900"] });
const { fontFamily: QUICKSAND } = loadQuicksand("normal", {
  weights: ["300", "500"],
});

const INTRO_FRAMES = 70;
const REASON_FRAMES = 140;
const OUTRO_FRAMES = 130;
const TRANSITION_FRAMES = 10;

export const MOMS_TIRED_TOTAL =
  INTRO_FRAMES +
  5 * REASON_FRAMES +
  OUTRO_FRAMES -
  6 * TRANSITION_FRAMES;

// ─── shared helpers ───

const Grain: React.FC = () => (
  <svg
    style={{
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      opacity: 0.09,
      mixBlendMode: "multiply",
    }}
  >
    <filter id="grain">
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.75"
        numOctaves="3"
        stitchTiles="stitch"
      />
    </filter>
    <rect width="100%" height="100%" filter="url(#grain)" />
  </svg>
);

const Waveform: React.FC = () => {
  const frame = useCurrentFrame();
  const pts: string[] = [];
  for (let i = 0; i <= 80; i++) {
    const x = (i / 80) * 1080;
    const phase = frame / 7;
    const y =
      30 +
      Math.sin(i * 0.3 + phase) * 7 +
      Math.sin(i * 0.15 + phase * 1.4) * 5;
    pts.push(`${x},${y}`);
  }
  return (
    <svg
      viewBox="0 0 1080 60"
      style={{
        position: "absolute",
        bottom: 28,
        left: 0,
        width: "100%",
        height: 60,
        opacity: 0.22,
        pointerEvents: "none",
      }}
    >
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="rgba(60,40,30,0.7)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const ProgressBar: React.FC = () => {
  const frame = useCurrentFrame();
  const pct = Math.min(1, frame / MOMS_TIRED_TOTAL) * 100;
  return (
    <div
      style={{
        position: "absolute",
        top: 28,
        left: 44,
        right: 44,
        height: 7,
        borderRadius: 4,
        background: "rgba(60,40,30,0.13)",
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          borderRadius: 4,
          background: "rgba(60,40,30,0.65)",
          boxShadow: "0 0 10px rgba(60,40,30,0.3)",
        }}
      />
    </div>
  );
};

const heading: React.CSSProperties = {
  fontFamily: NUNITO,
  fontWeight: 900,
  letterSpacing: -2,
  lineHeight: 1.05,
};

const body: React.CSSProperties = {
  fontFamily: QUICKSAND,
  fontWeight: 500,
  lineHeight: 1.35,
};

const MOM_W = 300;
const MOM_H = 525;
const BABY_W = 250;
const BABY_H = 286;

// ─── scene 1 — intro ───

const SceneIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bounce = spring({
    frame,
    fps,
    config: { damping: 7, stiffness: 140 },
  });
  const sub = interpolate(frame, [22, 42], [0, 1], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const blink = Math.abs(Math.sin(frame / 20));
  const charIn = spring({
    frame: frame - 5,
    fps,
    config: { damping: 10 },
  });
  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(180deg, #FAF0DC 0%, #F4E4C2 60%, #EFDBAF 100%)",
      }}
    >
      {Array.from({ length: 18 }).map((_, i) => {
        const s = i * 71 + 13;
        const x = ((s * 53) % 1000) + 40;
        const y = ((s * 37) % 1600) + 100;
        const twinkle =
          0.25 + 0.35 * Math.sin(frame / (6 + (s % 5)) + s);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              fontSize: 18 + (s % 14),
              opacity: twinkle,
              pointerEvents: "none",
            }}
          >
            ✦
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          top: "18%",
          left: 0,
          right: 0,
          textAlign: "center",
          transform: `scale(${bounce})`,
        }}
      >
        <div
          style={{
            ...heading,
            fontSize: 100,
            color: "#3D2E1F",
            padding: "0 60px",
          }}
        >
          Why moms are
          <br />
          <span style={{ color: "#C94F3C" }}>ALWAYS</span> tired
        </div>
        <div
          style={{
            fontSize: 130,
            marginTop: 10,
            opacity: 0.4 + blink * 0.6,
          }}
        >
          😴
        </div>
        <div
          style={{
            ...body,
            fontWeight: 300,
            fontSize: 44,
            color: "#7A6248",
            marginTop: 20,
            fontStyle: "italic",
            opacity: sub,
          }}
        >
          — a short documentary —
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 100,
          right: 50,
          width: MOM_W,
          height: MOM_H,
          transformOrigin: "bottom center",
          transform: `scale(${charIn}) translateY(${Math.sin(frame / 12) * 5}px)`,
          opacity: 0.88,
        }}
      >
        <Mom />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 120,
          left: 80,
          width: BABY_W,
          height: BABY_H,
          transformOrigin: "bottom center",
          transform: `scale(${charIn}) translateY(${Math.sin(frame / 10) * 8}px)`,
          opacity: 0.88,
        }}
      >
        <Baby />
      </div>
    </AbsoluteFill>
  );
};

// ─── scene 2 — #1 the sleep trap ───

const SceneSleep: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const numX = interpolate(frame, [0, 18], [-600, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.back(1.4)),
  });
  const textIn = spring({
    frame: frame - 12,
    fps,
    config: { damping: 14 },
  });
  const moonRot = Math.sin(frame / 7) * 14;
  const blinkCycle = frame % 55;
  const eyeScale = blinkCycle < 4 ? 0.15 : 1;
  const babyBounce = Math.abs(Math.sin(frame / 5)) * 20;
  const babyRot = Math.sin(frame / 6) * 6;
  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(180deg, #6B8CC7 0%, #92B0D8 40%, #BDD3EC 75%, #E0ECF6 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "12%",
          left: 60,
          ...heading,
          fontSize: 200,
          color: "rgba(255,255,255,0.22)",
          transform: `translateX(${numX}px)`,
        }}
      >
        #1
      </div>
      <div
        style={{
          position: "absolute",
          top: "24%",
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: textIn,
          transform: `translateY(${(1 - textIn) * 40}px)`,
          padding: "0 65px",
        }}
      >
        <div style={{ ...heading, fontSize: 56, color: "#1A2D4D" }}>
          The Sleep Trap
        </div>
        <div
          style={{
            ...body,
            fontSize: 50,
            color: "#2B3E5E",
            marginTop: 30,
          }}
        >
          Baby finally sleeps at 2 AM…
          <br />
          <br />
          wakes up at 2:47 AM.
          <br />
          <br />
          Refreshed. Ready to party. 🎉
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          top: "14%",
          right: 70,
          fontSize: 110,
          transform: `rotate(${moonRot}deg)`,
          transformOrigin: "top center",
        }}
      >
        🌙
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 110,
          right: 100,
          width: BABY_W + 20,
          height: BABY_H + 23,
          transformOrigin: "bottom center",
          transform: `translateY(${-babyBounce}px) rotate(${babyRot}deg)`,
          opacity: 0.9,
        }}
      >
        <Baby />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 140,
          left: 60,
          fontSize: 48,
          transform: `scaleY(${eyeScale})`,
          transformOrigin: "center",
        }}
      >
        👁️
      </div>
    </AbsoluteFill>
  );
};

// ─── scene 3 — #2 the feeding marathon ───

const SceneFeeding: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const numScale = spring({
    frame,
    fps,
    config: { damping: 6, stiffness: 200 },
  });
  const textIn = spring({
    frame: frame - 14,
    fps,
    config: { damping: 14 },
  });
  const bottleTilt = interpolate(frame, [60, 80], [0, 50], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const splatScale = spring({
    frame: frame - 78,
    fps,
    config: { damping: 10, stiffness: 220 },
  });
  const momBob = Math.sin(frame / 14) * 4;
  const babyBob = Math.sin(frame / 10) * 6;
  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(180deg, #FFB898 0%, #FFC8AA 40%, #FFD8C0 75%, #FFE8D5 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "12%",
          left: 0,
          right: 0,
          textAlign: "center",
          ...heading,
          fontSize: 200,
          color: "rgba(255,255,255,0.22)",
          transform: `scale(${numScale})`,
        }}
      >
        #2
      </div>
      <div
        style={{
          position: "absolute",
          top: "24%",
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: textIn,
          transform: `translateY(${(1 - textIn) * 40}px)`,
          padding: "0 65px",
        }}
      >
        <div style={{ ...heading, fontSize: 56, color: "#6B2D10" }}>
          The Feeding Marathon
        </div>
        <div
          style={{
            ...body,
            fontSize: 50,
            color: "#7A3A18",
            marginTop: 30,
          }}
        >
          Feeds for 40 minutes.
          <br />
          <br />
          Spits it all out in 4 seconds.
          <br />
          <br />
          Wants more.
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 100,
          left: 40,
          width: MOM_W - 20,
          height: MOM_H - 35,
          transformOrigin: "bottom center",
          transform: `translateY(${momBob}px)`,
          opacity: 0.88,
        }}
      >
        <Mom holdingBriefcase={false} />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 120,
          right: 100,
          width: BABY_W,
          height: BABY_H,
          transformOrigin: "bottom center",
          transform: `translateY(${babyBob}px)`,
          opacity: 0.88,
        }}
      >
        <Baby />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 340,
          right: 140,
          fontSize: 100,
          transform: `rotate(${bottleTilt}deg)`,
          transformOrigin: "bottom center",
        }}
      >
        🍼
      </div>
      {splatScale > 0.01 && (
        <div
          style={{
            position: "absolute",
            bottom: 280,
            right: 110,
            width: 80,
            height: 44,
            borderRadius: "50%",
            background: "rgba(255,220,180,0.8)",
            transform: `scale(${splatScale})`,
            boxShadow: "0 0 20px rgba(255,180,120,0.5)",
          }}
        />
      )}
    </AbsoluteFill>
  );
};

// ─── scene 4 — #3 the diaper bomb ───

const SceneDiaper: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const numY = spring({
    frame,
    fps,
    config: { damping: 5, stiffness: 130 },
  });
  const textIn = spring({
    frame: frame - 14,
    fps,
    config: { damping: 14 },
  });
  const countdown =
    frame < 50
      ? ""
      : frame < 68
        ? "3"
        : frame < 82
          ? "2"
          : frame < 95
            ? "1"
            : "💥";
  const diaperScale = interpolate(
    frame,
    [50, 90, 98, 102],
    [1, 1.5, 1.8, 0.2],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const diaperOpacity = interpolate(frame, [98, 106], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const babyShake = frame > 95 ? Math.sin(frame / 2) * 12 : 0;
  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(180deg, #90D8B2 0%, #ADE5C6 40%, #C8EED8 75%, #E2F5EA 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "12%",
          left: 60,
          ...heading,
          fontSize: 200,
          color: "rgba(255,255,255,0.22)",
          transform: `translateY(${(1 - numY) * -500}px)`,
        }}
      >
        #3
      </div>
      <div
        style={{
          position: "absolute",
          top: "24%",
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: textIn,
          transform: `translateY(${(1 - textIn) * 40}px)`,
          padding: "0 65px",
        }}
      >
        <div style={{ ...heading, fontSize: 56, color: "#1A5D3D" }}>
          The Diaper Bomb
        </div>
        <div
          style={{
            ...body,
            fontSize: 50,
            color: "#2A6B4A",
            marginTop: 30,
          }}
        >
          Fresh diaper on.
          <br />
          <br />
          3… 2… 1…
          <br />
          <br />
          and it's gone.
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 110,
          left: "50%",
          marginLeft: -(BABY_W / 2),
          width: BABY_W,
          height: BABY_H,
          transformOrigin: "bottom center",
          transform: `translateX(${babyShake}px)`,
          opacity: 0.88,
        }}
      >
        <Baby />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 370,
          left: "50%",
          marginLeft: -50,
          fontSize: 100,
          transform: `scale(${diaperScale})`,
          opacity: diaperOpacity,
        }}
      >
        💣
      </div>
      {countdown && (
        <div
          style={{
            position: "absolute",
            bottom: 420,
            right: 100,
            ...heading,
            fontSize: 72,
            color: "#C94F3C",
          }}
        >
          {countdown}
        </div>
      )}
    </AbsoluteFill>
  );
};

// ─── scene 5 — #4 the cry translator ───

const SceneCry: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const numRot = interpolate(frame, [0, 25], [-360, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const numScale = spring({
    frame,
    fps,
    config: { damping: 10 },
  });
  const textIn = spring({
    frame: frame - 14,
    fps,
    config: { damping: 14 },
  });
  const cries = [
    { delay: 24, label: "Hungry cry." },
    { delay: 42, label: "Sleepy cry." },
    { delay: 60, label: "Bored cry." },
    { delay: 78, label: "I-just-want-you-to-stand-up cry." },
  ];
  const dots = ".".repeat(1 + (Math.floor(frame / 12) % 3));
  const subBarIn = interpolate(frame, [90, 105], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const babyShake = Math.sin(frame / 3) * 8;
  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(180deg, #C5A8E8 0%, #D5BEF0 40%, #E2D0F5 75%, #F0E5FA 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "12%",
          right: 60,
          ...heading,
          fontSize: 200,
          color: "rgba(255,255,255,0.22)",
          transform: `rotate(${numRot}deg) scale(${numScale})`,
        }}
      >
        #4
      </div>
      <div
        style={{
          position: "absolute",
          top: "22%",
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: textIn,
          transform: `translateY(${(1 - textIn) * 40}px)`,
          padding: "0 60px",
        }}
      >
        <div style={{ ...heading, fontSize: 56, color: "#3D2463" }}>
          The Cry Translator
        </div>
        <div style={{ marginTop: 30 }}>
          {cries.map((c, i) => {
            const s = spring({
              frame: frame - c.delay,
              fps,
              config: { damping: 12 },
            });
            return (
              <div
                key={i}
                style={{
                  ...body,
                  fontSize: 46,
                  color: "#4A3268",
                  marginTop: i > 0 ? 14 : 0,
                  opacity: s,
                  transform: `translateX(${(1 - s) * 80}px)`,
                }}
              >
                {c.label}{" "}
                <span style={{ fontSize: 40 }}>😭</span>
              </div>
            );
          })}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 200,
          left: "50%",
          marginLeft: -(BABY_W / 2),
          width: BABY_W,
          height: BABY_H,
          transformOrigin: "bottom center",
          transform: `translateX(${babyShake}px)`,
          opacity: 0.88,
        }}
      >
        <Baby />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 120,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: subBarIn,
        }}
      >
        <div
          style={{
            display: "inline-block",
            background: "rgba(0,0,0,0.55)",
            borderRadius: 8,
            padding: "10px 36px",
          }}
        >
          <span
            style={{
              fontFamily: QUICKSAND,
              fontWeight: 300,
              fontSize: 38,
              color: "#fff",
              letterSpacing: 2,
            }}
          >
            [ translating{dots} ]
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── scene 6 — #5 the contact napper ───

const SceneContact: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const numOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });
  const textIn = spring({
    frame: frame - 14,
    fps,
    config: { damping: 14 },
  });
  const sirenStart = 70;
  const sirenOn = frame > sirenStart;
  const sirenFlash = sirenOn
    ? Math.sin(frame / 2.5) > 0
      ? 1
      : 0.2
    : 0;
  const sleepFloat = Math.sin(frame / 14) * 6;
  const momBob = Math.sin(frame / 16) * 3;
  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(180deg, #FF8E7A 0%, #FFA898 40%, #FFC0B0 75%, #FFD8CC 100%)",
      }}
    >
      {sirenOn && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `rgba(255,0,0,${sirenFlash * 0.06})`,
            pointerEvents: "none",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          top: "12%",
          left: 0,
          right: 0,
          textAlign: "center",
          ...heading,
          fontSize: 200,
          color: "rgba(255,255,255,0.22)",
          opacity: numOpacity,
        }}
      >
        #5
      </div>
      <div
        style={{
          position: "absolute",
          top: "24%",
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: textIn,
          transform: `translateY(${(1 - textIn) * 40}px)`,
          padding: "0 60px",
        }}
      >
        <div style={{ ...heading, fontSize: 56, color: "#6B1A0A" }}>
          The Contact Napper
        </div>
        <div
          style={{
            ...body,
            fontSize: 50,
            color: "#7A2A18",
            marginTop: 30,
          }}
        >
          Will only sleep ON you.
          <br />
          <br />
          Try to put them down?
          <br />
          <br />
          Instant alarm system.
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 100,
          left: "50%",
          marginLeft: -(MOM_W / 2),
          width: MOM_W,
          height: MOM_H,
          transformOrigin: "bottom center",
          transform: `translateY(${momBob}px)`,
          opacity: 0.88,
        }}
      >
        <Mom holdingBriefcase={false} />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 280,
          left: "50%",
          marginLeft: -(BABY_W * 0.35),
          width: BABY_W * 0.7,
          height: BABY_H * 0.7,
          transformOrigin: "bottom center",
          transform: `translateY(${sleepFloat}px)`,
          opacity: sirenOn ? 0.5 : 0.9,
        }}
      >
        <Baby />
      </div>
      {sirenOn && (
        <div
          style={{
            position: "absolute",
            bottom: 640,
            left: "50%",
            marginLeft: -50,
            fontSize: 100,
            opacity: sirenFlash,
            transform: `scale(${0.9 + sirenFlash * 0.2})`,
          }}
        >
          🚨
        </div>
      )}
    </AbsoluteFill>
  );
};

// ─── scene 7 — outro ───

const SceneOutro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const smileIn = spring({
    frame,
    fps,
    config: { damping: 12 },
  });
  const forgetIn = interpolate(frame, [48, 68], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const tagIn = interpolate(frame, [85, 100], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const glow = 0.5 + Math.sin(frame / 10) * 0.3;
  const charIn = spring({
    frame: frame - 10,
    fps,
    config: { damping: 10 },
  });
  const momBob = Math.sin(frame / 14) * 4;
  const babyBob = Math.sin(frame / 10) * 6;
  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(180deg, #F5C038 0%, #F8D060 40%, #FADD80 75%, #FDE8A5 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 50% 40%, rgba(255,245,180,0.7) 0%, rgba(255,245,180,0) 55%)",
          opacity: glow,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "14%",
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: smileIn,
          transform: `scale(${0.8 + smileIn * 0.2}) translateY(${(1 - smileIn) * 50}px)`,
        }}
      >
        <div
          style={{
            ...heading,
            fontSize: 76,
            color: "#4D2D00",
            padding: "0 70px",
          }}
        >
          But then they
          <br />
          smile at you… 🥹
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          top: "36%",
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: forgetIn,
          transform: `translateY(${(1 - forgetIn) * 30}px)`,
        }}
      >
        <div
          style={{
            ...heading,
            fontSize: 68,
            color: "#4D2D00",
            padding: "0 60px",
          }}
        >
          and you forget
          <br />
          EVERYTHING.
        </div>
      </div>
      {Array.from({ length: 14 }).map((_, i) => {
        const seed = i * 41 + 7;
        const delay = seed % 50;
        const f = frame - delay;
        const y = interpolate(f, [0, 100], [0, -1400], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const o = interpolate(f, [0, 14, 80, 100], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const x = 60 + ((seed * 53) % 960);
        const sway = Math.sin((frame + seed) / 11) * 18;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              bottom: -40,
              fontSize: 50 + (seed % 30),
              transform: `translateY(${y}px) rotate(${sway}deg)`,
              opacity: o,
              pointerEvents: "none",
            }}
          >
            ❤️
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          bottom: 100,
          right: 100,
          width: MOM_W - 20,
          height: MOM_H - 35,
          transformOrigin: "bottom center",
          transform: `scale(${charIn}) translateY(${momBob}px)`,
          opacity: 0.9,
        }}
      >
        <Mom holdingBriefcase={false} />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 120,
          left: 120,
          width: BABY_W,
          height: BABY_H,
          transformOrigin: "bottom center",
          transform: `scale(${charIn}) translateY(${babyBob}px)`,
          opacity: 0.9,
        }}
      >
        <Baby />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 440,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: tagIn,
          transform: `translateY(${(1 - tagIn) * 20}px)`,
        }}
      >
        <div
          style={{
            ...body,
            fontWeight: 500,
            fontSize: 46,
            color: "#6B4418",
          }}
        >
          Tag a tired mom 💛
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 390,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: tagIn * 0.6,
        }}
      >
        <span
          style={{
            ...body,
            fontWeight: 300,
            fontSize: 34,
            color: "#8B6530",
            letterSpacing: 1,
          }}
        >
          @wassp_folks
        </span>
      </div>
    </AbsoluteFill>
  );
};

// ─── root composition ───

export const MomsTired: React.FC = () => {
  const timing = linearTiming({
    durationInFrames: TRANSITION_FRAMES,
  });
  const swipe = slide({ direction: "from-right" });
  return (
    <AbsoluteFill style={{ background: "#F8EFDC" }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={INTRO_FRAMES}>
          <SceneIntro />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={swipe}
          timing={timing}
        />

        <TransitionSeries.Sequence durationInFrames={REASON_FRAMES}>
          <SceneSleep />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={swipe}
          timing={timing}
        />

        <TransitionSeries.Sequence durationInFrames={REASON_FRAMES}>
          <SceneFeeding />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={swipe}
          timing={timing}
        />

        <TransitionSeries.Sequence durationInFrames={REASON_FRAMES}>
          <SceneDiaper />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={swipe}
          timing={timing}
        />

        <TransitionSeries.Sequence durationInFrames={REASON_FRAMES}>
          <SceneCry />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={swipe}
          timing={timing}
        />

        <TransitionSeries.Sequence durationInFrames={REASON_FRAMES}>
          <SceneContact />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={swipe}
          timing={timing}
        />

        <TransitionSeries.Sequence durationInFrames={OUTRO_FRAMES}>
          <SceneOutro />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      <Grain />
      <Waveform />
      <ProgressBar />
    </AbsoluteFill>
  );
};
