import React from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";
import { Mom } from "./characters/Mom";
import { Baby } from "./characters/Baby";

const FONT_STACK =
  '"Impact", "Haettenschweiler", "Arial Black", system-ui, sans-serif';

const MOM_W = 560;
const MOM_H = 980;
const BABY_W = 500;
const BABY_H = 571;

const Background: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        "linear-gradient(180deg, #FFE4B5 0%, #FFC8C0 55%, #FFB0A0 100%)",
    }}
  >
    <div
      style={{
        position: "absolute",
        top: 120,
        right: -80,
        width: 520,
        height: 520,
        borderRadius: "50%",
        background:
          "radial-gradient(circle, rgba(255,230,150,0.9) 0%, rgba(255,230,150,0) 70%)",
      }}
    />
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 420,
        background:
          "linear-gradient(180deg, rgba(190,110,90,0) 0%, rgba(190,110,90,0.38) 100%)",
      }}
    />
  </AbsoluteFill>
);

const Caption: React.FC<{
  text: string;
  subtext?: string;
  top?: number;
}> = ({ text, subtext, top = 200 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 180 },
  });
  const opacity = interpolate(frame, [0, 6], [0, 1], {
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 0,
        right: 0,
        padding: "0 70px",
        textAlign: "center",
        opacity,
        transform: `translateY(${(1 - s) * 50}px) scale(${0.88 + s * 0.12})`,
      }}
    >
      <div
        style={{
          fontFamily: FONT_STACK,
          fontSize: 100,
          fontWeight: 900,
          color: "#fff",
          textShadow:
            "7px 7px 0 #1a1a1a, -3px -3px 0 #1a1a1a, 3px -3px 0 #1a1a1a, -3px 3px 0 #1a1a1a",
          lineHeight: 1.05,
          letterSpacing: -2,
          textTransform: "uppercase",
        }}
      >
        {text}
      </div>
      {subtext && (
        <div
          style={{
            marginTop: 24,
            fontFamily: FONT_STACK,
            fontSize: 72,
            color: "#FFE48A",
            textShadow:
              "5px 5px 0 #1a1a1a, -2px -2px 0 #1a1a1a, 2px -2px 0 #1a1a1a, -2px 2px 0 #1a1a1a",
            textTransform: "uppercase",
            letterSpacing: -1,
          }}
        >
          {subtext}
        </div>
      )}
    </div>
  );
};

const Floor: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      height: 180,
      background:
        "linear-gradient(180deg, rgba(120,60,40,0) 0%, rgba(120,60,40,0.35) 100%)",
    }}
  />
);

const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const momIn = spring({ frame, fps, config: { damping: 12 } });
  const babyIn = spring({
    frame: frame - 8,
    fps,
    config: { damping: 12 },
  });
  const bob = Math.sin(frame / 10) * 6;
  return (
    <AbsoluteFill>
      <Background />
      <Floor />
      <Caption text="POV: You're a" subtext="working mom 💼" top={160} />
      <div
        style={{
          position: "absolute",
          right: 40,
          bottom: 100,
          width: MOM_W,
          height: MOM_H,
          transformOrigin: "bottom center",
          transform: `translateY(${(1 - momIn) * 80}px) scale(${momIn})`,
        }}
      >
        <Mom />
      </div>
      <div
        style={{
          position: "absolute",
          left: 60,
          bottom: 120,
          width: BABY_W,
          height: BABY_H,
          transformOrigin: "bottom center",
          transform: `translateY(${(1 - babyIn) * 100 + bob}px) scale(${babyIn})`,
        }}
      >
        <Baby />
      </div>
    </AbsoluteFill>
  );
};

const Scene2: React.FC = () => {
  const frame = useCurrentFrame();
  const momX = interpolate(frame, [0, 115], [0, 680], {
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.quad),
  });
  const wiggle = Math.sin(frame / 5) * 10;
  const babyBob = Math.sin(frame / 12) * 4;
  return (
    <AbsoluteFill>
      <Background />
      <Floor />
      <Caption text="Mama's gotta" subtext="head to work 😘" top={160} />
      <div
        style={{
          position: "absolute",
          right: 40,
          bottom: 100,
          width: MOM_W,
          height: MOM_H,
          transform: `translate(${momX}px, ${wiggle}px)`,
        }}
      >
        <Mom />
      </div>
      <div
        style={{
          position: "absolute",
          left: 60,
          bottom: 120,
          width: BABY_W,
          height: BABY_H,
          transform: `translateY(${babyBob}px)`,
        }}
      >
        <Baby />
      </div>
    </AbsoluteFill>
  );
};

const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zoom = interpolate(frame, [0, 40], [1, 1.8], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const shake = frame > 40 ? Math.sin(frame / 2.5) * 14 : 0;
  const capS = spring({
    frame: frame - 35,
    fps,
    config: { damping: 9, stiffness: 220 },
  });
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: "30% 70%",
        }}
      >
        <Background />
        <Floor />
        <div
          style={{
            position: "absolute",
            left: 60,
            bottom: 120,
            width: BABY_W,
            height: BABY_H,
            transform: `translate(${shake}px, 0)`,
          }}
        >
          <Baby />
        </div>
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: 240,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: capS,
          transform: `scale(${0.6 + capS * 0.4}) rotate(${(1 - capS) * -8}deg)`,
        }}
      >
        <div
          style={{
            fontFamily: FONT_STACK,
            fontSize: 200,
            fontWeight: 900,
            color: "#fff",
            textShadow:
              "10px 10px 0 #8B0000, -4px -4px 0 #8B0000, 4px -4px 0 #8B0000, -4px 4px 0 #8B0000",
            textTransform: "uppercase",
            letterSpacing: -6,
          }}
        >
          WAAAH!
        </div>
        <div style={{ fontSize: 140, marginTop: -20 }}>😭💧</div>
      </div>
    </AbsoluteFill>
  );
};

const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const momX = interpolate(frame, [0, 45], [700, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const rushWiggle =
    frame < 45 ? Math.sin(frame / 2.5) * 14 : Math.sin(frame / 9) * 4;
  const bounce = frame > 50 ? Math.abs(Math.sin(frame / 8)) * 8 : 0;
  return (
    <AbsoluteFill>
      <Background />
      <Floor />
      <Caption text="I can't leave" subtext="that face 💔" top={160} />
      <div
        style={{
          position: "absolute",
          right: 60,
          bottom: 240,
          fontSize: 120,
          transform: "rotate(18deg)",
          filter: "drop-shadow(4px 4px 0 rgba(0,0,0,0.2))",
        }}
      >
        💼
      </div>
      <div
        style={{
          position: "absolute",
          right: 40,
          bottom: 100,
          width: MOM_W,
          height: MOM_H,
          transform: `translate(${momX}px, ${rushWiggle}px)`,
        }}
      >
        <Mom holdingBriefcase={false} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 60,
          bottom: 120,
          width: BABY_W,
          height: BABY_H,
          transform: `translateY(${-bounce}px)`,
        }}
      >
        <Baby />
      </div>
      {[0, 1, 2, 3, 4].map((i) => {
        const f = frame - 55 - i * 7;
        const hy = interpolate(f, [0, 80], [0, -500], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const ho = interpolate(f, [0, 15, 65, 80], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const hs = spring({
          frame: f,
          fps,
          config: { damping: 12 },
        });
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 360 + i * 70,
              bottom: 780,
              fontSize: 80,
              transform: `translateY(${hy}px) scale(${hs})`,
              opacity: ho,
            }}
          >
            ❤️
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 12 } });
  const pulse = 1 + Math.sin(frame / 8) * 0.025;
  return (
    <AbsoluteFill>
      <Background />
      <Floor />
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 120,
          width: BABY_W,
          height: BABY_H,
          marginLeft: -BABY_W / 2,
          transformOrigin: "bottom center",
          transform: `scale(${s * pulse})`,
        }}
      >
        <Baby />
      </div>
      <div
        style={{
          position: "absolute",
          top: 180,
          left: 0,
          right: 0,
          padding: "0 60px",
          textAlign: "center",
          opacity: s,
          transform: `translateY(${(1 - s) * 60}px)`,
        }}
      >
        <div
          style={{
            fontFamily: FONT_STACK,
            fontSize: 110,
            fontWeight: 900,
            color: "#fff",
            textShadow:
              "7px 7px 0 #1a1a1a, -3px -3px 0 #1a1a1a, 3px -3px 0 #1a1a1a, -3px 3px 0 #1a1a1a",
            lineHeight: 1.05,
            letterSpacing: -2,
            textTransform: "uppercase",
          }}
        >
          Being a mom
          <br />
          is the hardest
          <br />
          job ❤️
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 60,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: FONT_STACK,
          fontSize: 52,
          color: "#fff",
          textShadow: "4px 4px 0 #1a1a1a",
          opacity: s,
          letterSpacing: 2,
        }}
      >
        #WORKINGMOM · #MOMLIFE
      </div>
    </AbsoluteFill>
  );
};

export const MomAndBaby: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#FFE4B5" }}>
      <Sequence from={0} durationInFrames={120}>
        <Scene1 />
      </Sequence>
      <Sequence from={120} durationInFrames={120}>
        <Scene2 />
      </Sequence>
      <Sequence from={240} durationInFrames={150}>
        <Scene3 />
      </Sequence>
      <Sequence from={390} durationInFrames={120}>
        <Scene4 />
      </Sequence>
      <Sequence from={510} durationInFrames={90}>
        <Scene5 />
      </Sequence>
    </AbsoluteFill>
  );
};
