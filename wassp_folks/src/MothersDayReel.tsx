import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";
import {
  TransitionSeries,
  linearTiming,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadQuicksand } from "@remotion/google-fonts/Quicksand";

const { fontFamily: PLAYFAIR } = loadPlayfair("normal", {
  weights: ["700"],
});
const { fontFamily: QUICKSAND } = loadQuicksand("normal", {
  weights: ["300"],
});

const SCENE_FRAMES = 90;
const FINALE_FRAMES = 120;
const TRANSITION_FRAMES = 15;
// 6 scenes * 90 + 1 * 120 - 6 transitions * 15 = 570 frames
export const MOTHERS_DAY_TOTAL_FRAMES = 570;

// ────────── shared pieces ──────────

const CenterStage: React.FC<{
  children: React.ReactNode;
  top?: string;
}> = ({ children, top = "32%" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 180 },
  });
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 0,
        right: 0,
        textAlign: "center",
        opacity: s,
        transform: `translateY(${(1 - s) * 60}px)`,
      }}
    >
      {children}
    </div>
  );
};

// ────────── scenes ──────────

const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const float = Math.sin(frame / 14) * 14;
  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(180deg, #FF9E6B 0%, #FFB88C 35%, #FFCFA8 65%, #FFE8CC 100%)",
      }}
    >
      <CenterStage top="30%">
        <div
          style={{
            fontSize: 240,
            transform: `translateY(${float}px)`,
          }}
        >
          🌅
        </div>
        <div
          style={{
            fontFamily: PLAYFAIR,
            fontWeight: 700,
            fontSize: 92,
            color: "#5B2E00",
            padding: "0 80px",
            lineHeight: 1.15,
            letterSpacing: -1,
            marginTop: 20,
          }}
        >
          From the moment
          <br />
          you arrived…
        </div>
      </CenterStage>
    </AbsoluteFill>
  );
};

const Scene2: React.FC = () => {
  const frame = useCurrentFrame();
  const sway = Math.sin(frame / 18) * 3;
  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(180deg, #B8A0E0 0%, #CDB8EC 40%, #DECCF2 75%, #EFE5FA 100%)",
      }}
    >
      <CenterStage top="34%">
        <div
          style={{
            transform: `rotate(${sway}deg)`,
            transformOrigin: "center top",
          }}
        >
          <div
            style={{
              fontFamily: PLAYFAIR,
              fontWeight: 700,
              fontSize: 88,
              color: "#3D2963",
              padding: "0 80px",
              lineHeight: 1.2,
              letterSpacing: -1,
            }}
          >
            My world became
            <br />
            your lullaby
          </div>
          <div
            style={{
              fontFamily: QUICKSAND,
              fontWeight: 300,
              fontSize: 110,
              color: "#5D4A8C",
              marginTop: 40,
              letterSpacing: 8,
            }}
          >
            ♪ ♫ ♪
          </div>
        </div>
      </CenterStage>
    </AbsoluteFill>
  );
};

const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const leafBob = Math.sin(frame / 12) * 8;
  const leafRot = Math.sin(frame / 18) * 6;
  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(180deg, #8DD9B4 0%, #AEE5C8 40%, #CFEFDB 75%, #E8F7EE 100%)",
      }}
    >
      <CenterStage top="30%">
        <div
          style={{
            fontSize: 180,
            transform: `translateY(${leafBob}px) rotate(${leafRot}deg)`,
          }}
        >
          🌿
        </div>
        <div
          style={{
            fontFamily: PLAYFAIR,
            fontWeight: 700,
            fontSize: 80,
            color: "#1F5D3D",
            padding: "0 70px",
            lineHeight: 1.25,
            letterSpacing: -1,
            marginTop: 20,
          }}
        >
          Every tiny finger…
          <br />
          every little toe…
        </div>
      </CenterStage>
    </AbsoluteFill>
  );
};

const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const BURST_FRAME = 22;
  const hearts = 12;
  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(180deg, #FFA0C4 0%, #FFB8D5 40%, #FFD0E2 75%, #FFE8F1 100%)",
      }}
    >
      <CenterStage top="38%">
        <div
          style={{
            fontFamily: PLAYFAIR,
            fontWeight: 700,
            fontSize: 96,
            color: "#8B1F52",
            padding: "0 80px",
            lineHeight: 1.15,
            letterSpacing: -1,
          }}
        >
          Made my heart
          <br />
          overflow
        </div>
      </CenterStage>
      {Array.from({ length: hearts }).map((_, i) => {
        const angle = (i / hearts) * Math.PI * 2;
        const f = frame - BURST_FRAME;
        const progress = interpolate(f, [0, 36], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const eased = 1 - Math.pow(1 - progress, 3);
        const dist = eased * 440;
        const opacity = interpolate(
          f,
          [0, 6, 32, 42],
          [0, 1, 1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        const scale = interpolate(
          f,
          [0, 8, 32, 42],
          [0, 1.35, 1, 0.5],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              fontSize: 80,
              transform: `translate(${
                Math.cos(angle) * dist - 40
              }px, ${Math.sin(angle) * dist - 40}px) scale(${scale})`,
              opacity,
              filter: "drop-shadow(0 0 12px rgba(255,120,170,0.6))",
            }}
          >
            💗
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  const moonFloat = Math.sin(frame / 16) * 12;
  const moonRot = Math.sin(frame / 24) * 5;
  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(180deg, #7AB3E5 0%, #9FC8ED 35%, #C2DCF3 70%, #E4EEFA 100%)",
      }}
    >
      <CenterStage top="30%">
        <div
          style={{
            fontSize: 200,
            transform: `translateY(${moonFloat}px) rotate(${moonRot}deg)`,
            filter: "drop-shadow(0 0 30px rgba(255,255,255,0.5))",
          }}
        >
          🌙
        </div>
        <div
          style={{
            fontFamily: PLAYFAIR,
            fontWeight: 700,
            fontSize: 80,
            color: "#1A3D6B",
            padding: "0 70px",
            lineHeight: 1.2,
            letterSpacing: -1,
            marginTop: 20,
          }}
        >
          3 AM feedings?
          <br />
          I'd do it all again.
        </div>
      </CenterStage>
    </AbsoluteFill>
  );
};

const Scene6: React.FC = () => {
  const frame = useCurrentFrame();
  const sparkleFloat = Math.sin(frame / 12) * 10;
  const sparkleRot = Math.sin(frame / 18) * 12;
  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(180deg, #F0B848 0%, #F5CC72 40%, #F9DD95 75%, #FCEDC0 100%)",
      }}
    >
      <CenterStage top="30%">
        <div
          style={{
            fontSize: 160,
            transform: `translateY(${sparkleFloat}px) rotate(${sparkleRot}deg)`,
            filter: "drop-shadow(0 0 24px rgba(255,220,120,0.8))",
          }}
        >
          ✨
        </div>
        <div
          style={{
            fontFamily: PLAYFAIR,
            fontWeight: 700,
            fontSize: 90,
            color: "#6B4418",
            padding: "0 80px",
            lineHeight: 1.15,
            letterSpacing: -1,
            marginTop: 20,
          }}
        >
          Because YOU are
          <br />
          my forever
        </div>
        <div
          style={{
            fontFamily: QUICKSAND,
            fontWeight: 300,
            fontSize: 60,
            color: "#8B5A2B",
            marginTop: 40,
            fontStyle: "italic",
            letterSpacing: 3,
          }}
        >
          — Mom
        </div>
      </CenterStage>
    </AbsoluteFill>
  );
};

const Scene7: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 170 } });
  const glow = 0.55 + Math.sin(frame / 10) * 0.35;
  const pulse = 1 + Math.sin(frame / 7) * 0.07;
  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(180deg, #E89320 0%, #F0A838 35%, #F6BC60 70%, #FCD78E 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 50% 42%, rgba(255,245,180,0.85) 0%, rgba(255,245,180,0) 55%)",
          opacity: glow,
        }}
      />
      {/* Radial rays */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "conic-gradient(from 0deg, rgba(255,255,220,0.25) 0deg, rgba(255,255,220,0) 20deg, rgba(255,255,220,0.25) 40deg, rgba(255,255,220,0) 60deg, rgba(255,255,220,0.25) 80deg, rgba(255,255,220,0) 100deg)",
          mixBlendMode: "overlay",
          opacity: glow * 0.6,
          transform: `rotate(${frame / 2}deg)`,
          transformOrigin: "center 42%",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "22%",
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: s,
          transform: `translateY(${(1 - s) * 70}px)`,
        }}
      >
        <div
          style={{
            fontSize: 190,
            transform: `scale(${pulse})`,
            filter: `drop-shadow(0 0 ${22 + glow * 28}px rgba(255,220,120,0.95))`,
          }}
        >
          👩‍👧
        </div>
        <div
          style={{
            fontFamily: PLAYFAIR,
            fontWeight: 700,
            fontSize: 104,
            color: "#4D2D00",
            padding: "0 50px",
            lineHeight: 1.05,
            letterSpacing: -1.5,
            marginTop: 30,
            textShadow: `0 0 ${28 * glow}px rgba(255,200,100,0.7)`,
          }}
        >
          Happy
          <br />
          Mother's Day
        </div>
        <div
          style={{
            fontFamily: QUICKSAND,
            fontWeight: 300,
            fontSize: 46,
            color: "#5B3C10",
            padding: "0 100px",
            marginTop: 36,
            lineHeight: 1.4,
            letterSpacing: 1,
          }}
        >
          to every mom who loves
          <br />
          beyond measure 💛
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ────────── global overlays ──────────

const PARTICLE_COLORS = [
  "#FFD1DC",
  "#FFF0B5",
  "#D0E8FF",
  "#E2D5FF",
  "#D4F1D4",
  "#FFE4B5",
  "#FFFFFF",
];

const FloatingParticles: React.FC<{ count?: number }> = ({ count = 42 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: count }).map((_, i) => {
        const seed = i * 97 + 13;
        const cycle = 150 + (seed % 120);
        const offset = (seed * 17) % cycle;
        const life = (frame + offset) % cycle;
        const t = life / cycle;
        const baseX = (seed * 53) % width;
        const drift = Math.sin((frame + seed * 7) / 22) * 40;
        const x = baseX + drift;
        const y = height + 40 - t * (height + 140);
        const fadeIn = Math.min(1, t * 6);
        const fadeOut = Math.min(1, (1 - t) * 4);
        const opacity = Math.min(fadeIn, fadeOut) * 0.85;
        const size = 8 + (seed % 14);
        const color = PARTICLE_COLORS[seed % PARTICLE_COLORS.length];
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: size,
              borderRadius: "50%",
              background: color,
              opacity,
              filter: "blur(1px)",
              boxShadow: `0 0 ${size * 1.5}px ${color}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// Each scene's actual START frame in the transitioned timeline:
// n-th sequence starts at sum(prev sequence durations) - n * transitionDur
const SCENE_START_FRAMES = [
  0,
  SCENE_FRAMES - TRANSITION_FRAMES,
  2 * (SCENE_FRAMES - TRANSITION_FRAMES),
  3 * (SCENE_FRAMES - TRANSITION_FRAMES),
  4 * (SCENE_FRAMES - TRANSITION_FRAMES),
  5 * (SCENE_FRAMES - TRANSITION_FRAMES),
  6 * (SCENE_FRAMES - TRANSITION_FRAMES),
];

const ProgressDots: React.FC = () => {
  const frame = useCurrentFrame();
  let active = 0;
  for (let i = 0; i < SCENE_START_FRAMES.length; i++) {
    if (frame >= SCENE_START_FRAMES[i]) active = i;
  }
  return (
    <div
      style={{
        position: "absolute",
        bottom: 80,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        gap: 20,
        pointerEvents: "none",
      }}
    >
      {Array.from({ length: 7 }).map((_, i) => {
        const isActive = i === active;
        return (
          <div
            key={i}
            style={{
              width: isActive ? 40 : 14,
              height: 14,
              borderRadius: 7,
              background: isActive
                ? "rgba(255,255,255,0.97)"
                : "rgba(255,255,255,0.42)",
              boxShadow: isActive
                ? "0 0 14px rgba(255,255,255,0.85)"
                : "none",
            }}
          />
        );
      })}
    </div>
  );
};

// ────────── root composition ──────────

export const MothersDayReel: React.FC = () => {
  const timing = linearTiming({
    durationInFrames: TRANSITION_FRAMES,
    easing: Easing.inOut(Easing.cubic),
  });
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES}>
          <Scene1 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />

        <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES}>
          <Scene2 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={timing}
        />

        <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES}>
          <Scene3 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />

        <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES}>
          <Scene4 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-left" })}
          timing={timing}
        />

        <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES}>
          <Scene5 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />

        <TransitionSeries.Sequence durationInFrames={SCENE_FRAMES}>
          <Scene6 />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={timing}
        />

        <TransitionSeries.Sequence durationInFrames={FINALE_FRAMES}>
          <Scene7 />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      <FloatingParticles />
      <ProgressDots />
    </AbsoluteFill>
  );
};
