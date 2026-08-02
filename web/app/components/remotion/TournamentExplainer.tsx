"use client";

/**
 * Tournament explainer — a product demo, not a slide deck.
 *
 * The first version of this was captions fading in over static cards. It read
 * as a presentation, which is exactly what a flagship product film is not. The
 * things that actually make those films work, and which this one now does:
 *
 *   ONE PERSISTENT SURFACE.  Screens change inside a single app frame that
 *   never disappears. Cutting to black between beats is what makes a video feel
 *   like slides; morphing inside a frame makes it feel like software.
 *
 *   A CURSOR THAT DRIVES IT.  Every interaction is performed — the pointer
 *   travels on eased arcs, the button lifts under it, the click lands, the UI
 *   responds. Nobody believes a claim about a flow they watch a caption assert.
 *
 *   A CAMERA.  Scale and offset follow the action: pushed in on a ₹500 button,
 *   pulled back for the draw. Attention is directed rather than left to chance.
 *
 *   NEVER STATIC.  A slow drift runs under everything, elements enter with
 *   overshoot, numbers count rather than appear. A frozen frame reads as a bug.
 *
 * 900 frames @ 30fps. Product 0–420, match day 420–840, close 840–900.
 */

import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { GAME_THEME, type GameKey } from "@/app/lib/gameTheme";

export type ExplainerProps = {
  game?: GameKey;
  tournamentName?: string;
  dateLabel?: string;
  prizePool?: string;
  entryFee?: number;
  totalSlots?: number;
  deadlineLabel?: string;
  finalTime?: string;
};

const DUR = 900;
const TEAMS = ["A", "B", "C", "D"] as const;
const YOU = "B";

const ROUNDS = [
  { time: "18:00", m: [{ a: "A", b: "B", sa: 0, sb: 2 }, { a: "C", b: "D", sa: 1, sb: 1 }] },
  { time: "19:30", m: [{ a: "A", b: "C", sa: 2, sb: 0 }, { a: "B", b: "D", sa: 1, sb: 1 }] },
  { time: "21:00", m: [{ a: "A", b: "D", sa: 1, sb: 1 }, { a: "B", b: "C", sa: 2, sb: 0 }] },
];

/** Six matches × 2 points = 12, and these sum to 12. A and D tie on 3 so the
 *  RW−RL tie-break is demonstrated rather than asserted. */
const STANDINGS = [
  { t: "B", p: 5, rd: +34 },
  { t: "D", p: 3, rd: +6 },
  { t: "A", p: 3, rd: -2 },
  { t: "C", p: 1, rd: -38 },
];

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const EASE = Easing.bezier(0.33, 1, 0.68, 1);          // decisive, slight settle
const EASE_IO = Easing.bezier(0.65, 0, 0.35, 1);       // for travel

/** Value that eases between keyframes. */
const track = (frame: number, keys: [number, number][], easing = EASE) => {
  if (frame <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [f0, v0] = keys[i], [f1, v1] = keys[i + 1];
    if (frame <= f1) return interpolate(frame, [f0, f1], [v0, v1], { ...clamp, easing });
  }
  return keys[keys.length - 1][1];
};

/** Cross-fade helper: 1 inside [a,b], ramping over `r` frames at each edge. */
const win = (frame: number, a: number, b: number, r = 10) =>
  Math.min(
    interpolate(frame, [a, a + r], [0, 1], clamp),
    interpolate(frame, [b - r, b], [1, 0], clamp)
  );

export const TournamentExplainer: React.FC<ExplainerProps> = ({
  game = "valorant",
  tournamentName = "LEAGUE OF RISING STARS - HORIZON",
  dateLabel = "Sunday 27 September",
  prizePool = "8,000",
  entryFee = 500,
  totalSlots = 20,
  deadlineLabel = "24 Sept",
  finalTime = "22:30",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = GAME_THEME[game];
  const teamCount = Math.max(2, Math.round(totalSlots / 5));

  // ── Camera ───────────────────────────────────────────────────────────
  // Pushes in through the product half, pulls back for the tournament half.
  const camScale = track(frame, [[0, 1.04], [60, 1.0], [150, 1.06], [250, 1.12], [330, 1.0], [420, 1.0], [500, 0.96], [900, 0.96]]);
  const camY = track(frame, [[0, 20], [60, 0], [250, -26], [330, 0], [500, 0], [900, 0]]);
  const drift = Math.sin(frame / 90) * 5;

  // ── Cursor path ──────────────────────────────────────────────────────
  // Coordinates are in composition space. Clicks are listed separately so the
  // press, the ripple and the UI response can all key off one number.
  // Coordinates are UNTRANSFORMED composition space, because the cursor is
  // rendered inside the camera — it has to scale and move with the UI it is
  // operating, exactly as it would in a screen recording. Rendered outside, it
  // slid off every button the moment the camera pushed in.
  const CLICKS = [64, 128, 232];
  const cx = track(frame, [[0, 880], [30, 470], [56, 360], [64, 360], [78, 430], [118, 360], [128, 360], [142, 440], [212, 360], [232, 360], [252, 480], [300, 880]], EASE_IO);
  const cy = track(frame, [[0, 1050], [30, 660], [56, 550], [64, 550], [78, 600], [118, 477], [128, 477], [142, 520], [212, 549], [232, 549], [252, 640], [300, 1050]], EASE_IO);

  const pressed = CLICKS.some(c => frame >= c && frame < c + 7);
  const cursorGone = frame > 420;

  // ── Screen windows inside the persistent surface ─────────────────────
  const sHero = win(frame, -10, 96, 12);
  const sDiscord = win(frame, 88, 176, 12);
  const sPay = win(frame, 168, 268, 12);
  const sPayU = win(frame, 258, 322, 10);
  const sSetup = win(frame, 314, 396, 12);
  const sDone = win(frame, 388, 452, 12);

  const productPhase = frame < 460;

  const px = (n: number) => `${n}px`;

  return (
    <AbsoluteFill style={{ background: "#050506", fontFamily: "system-ui,-apple-system,'Segoe UI',sans-serif", overflow: "hidden" }}>
      {/* ambient — two slow accent pools keep the frame alive under everything */}
      <AbsoluteFill style={{ background: `radial-gradient(90% 50% at 50% ${8 + drift}%, ${T.soft}, transparent 65%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(70% 40% at ${20 - drift}% 95%, rgba(255,255,255,0.035), transparent 70%)` }} />

      {/* persistent chrome */}
      <div style={{ position: "absolute", top: 42, left: 58, right: 58, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 5 }}>
        <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: ".2em", color: "#5a5a5a" }}>IESPORTS</span>
        <span style={{ fontSize: 17, color: T.acc, letterSpacing: ".14em", fontWeight: 700 }}>{T.label}</span>
      </div>
      <div style={{ position: "absolute", bottom: 46, left: 58, right: 58, zIndex: 5 }}>
        <div style={{ height: 3, background: "#161616", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(frame / DUR) * 100}%`, background: T.acc, boxShadow: `0 0 14px ${T.glow}` }} />
        </div>
      </div>

      {/* ═══════════════ CAMERA ═══════════════ */}
      <AbsoluteFill style={{ transform: `scale(${camScale}) translateY(${camY + drift * 0.4}px)`, transformOrigin: "50% 45%" }}>

        {/* ── The one surface. Screens change inside it; it never leaves. ── */}
        {productPhase && (
          <div style={{
            position: "absolute", left: 60, right: 60, top: 150, bottom: 190,
            background: "linear-gradient(180deg,#0d0e10,#08090a)",
            border: `1px solid #1b1d20`, borderRadius: 26,
            boxShadow: `0 40px 90px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.02) inset`,
            overflow: "hidden",
            opacity: win(frame, -10, 456, 14),
          }}>
            {/* screen: hero + register */}
            <Screen o={sHero}>
              <div style={{ padding: "34px 32px" }}>
                <div style={{ fontSize: 15, letterSpacing: ".16em", color: T.acc, fontWeight: 800 }}>{dateLabel.toUpperCase()}</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: "#fff", lineHeight: 1.08, marginTop: 12, letterSpacing: "-.02em" }}>
                  {tournamentName.replace(/ - /g, " · ")}
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 26 }}>
                  {[["PRIZE", `₹${prizePool}`], ["SLOTS", String(totalSlots)], ["ENTRY", `₹${entryFee}`]].map(([k, v]) => (
                    <Stat key={k} k={k} v={v} />
                  ))}
                </div>
                <Button T={T} frame={frame} hoverAt={48} clickAt={64} label="Register →" wide />
              </div>
            </Screen>

            {/* screen: discord */}
            <Screen o={sDiscord}>
              <div style={{ padding: "34px 32px" }}>
                <Eyebrow>STEP 1 OF 3</Eyebrow>
                <H>Connect Discord</H>
                <P>Brackets, match calls and your team all live there. It&apos;s the only thing we need before payment.</P>
                <Button T={T} frame={frame} hoverAt={112} clickAt={128} label="Continue with Discord" wide brand="#5865F2" fg="#fff" />
                <Row done={frame > 138} label="Discord" value="connected" T={T} delay={138} frame={frame} />
              </div>
            </Screen>

            {/* screen: pay */}
            <Screen o={sPay}>
              <div style={{ padding: "34px 32px" }}>
                <Eyebrow>STEP 2 OF 3 · SLOT HELD</Eyebrow>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", marginTop: 10 }}>Claim your slot</div>
                <Counter frame={frame} from={190} to={214} value={entryFee} T={T} />
                <P>UPI or Net Banking through PayU, in a new tab.</P>
                <div style={{ fontSize: 15, color: "#4ade80", marginTop: 6 }}>Withdraw before registration closes — 100% refund.</div>
                <Button T={T} frame={frame} hoverAt={214} clickAt={232} label={`Pay ₹${entryFee}`} wide />
              </div>
            </Screen>

            {/* screen: PayU handoff, sliding in from the right like a new tab */}
            <Screen o={sPayU}>
              <div style={{
                position: "absolute", inset: 0, background: "#0a0b0d",
                transform: `translateX(${interpolate(frame, [258, 274], [420, 0], { ...clamp, easing: EASE })}px)`,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20,
              }}>
                <div style={{ fontSize: 15, letterSpacing: ".18em", color: "#5a5a5a", fontWeight: 800 }}>PAYU · SECURE</div>
                <Spinner frame={frame} start={276} until={300} T={T} />
                <div style={{ fontSize: 30, fontWeight: 800, color: frame > 300 ? "#4ade80" : "#fff" }}>
                  {frame > 300 ? "✓ Paid" : `₹${entryFee}`}
                </div>
                <div style={{ fontSize: 16, color: "#777" }}>{frame > 300 ? "Returning you to iesports…" : "UPI"}</div>
              </div>
            </Screen>

            {/* screen: setup */}
            <Screen o={sSetup}>
              <div style={{ padding: "34px 32px" }}>
                <div style={{ fontSize: 14, letterSpacing: ".14em", color: "#4ade80", fontWeight: 800 }}>✓ SLOT PAID · ₹{entryFee}</div>
                <H>Finish setup</H>
                <Progress frame={frame} from={330} to={378} T={T} />
                <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 16 }}>
                  <Row done={frame > 338} label="Your name" value="for the payout" T={T} delay={338} frame={frame} />
                  <Row done={frame > 356} label="Phone" value="verified" T={T} delay={356} frame={frame} />
                  <Row done={frame > 374} label="Riot ID" value="linked" T={T} delay={374} frame={frame} />
                </div>
              </div>
            </Screen>

            {/* screen: registered */}
            <Screen o={sDone}>
              <div style={{ padding: "34px 32px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 18 }}>
                <Pop frame={frame} at={396}>
                  <div style={{ fontSize: 56 }}>🏆</div>
                </Pop>
                <div style={{ fontSize: 34, fontWeight: 800, color: "#fff" }}>You&apos;re in</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <Chip bg="rgba(74,222,128,.12)" bd="rgba(74,222,128,.4)" fg="#6fcf8a">✓ Registered</Chip>
                  <Chip bg="transparent" bd="#2a2a2a" fg="#8a8a8a">Withdraw</Chip>
                </div>
                <div style={{ fontSize: 16, color: "#777", textAlign: "center", maxWidth: 380, lineHeight: 1.55 }}>
                  Everything from here happens on Discord.
                </div>
              </div>
            </Screen>
          </div>
        )}

        {/* ═══ MATCH DAY — full bleed, the surface has done its job ═══ */}
        {!productPhase && (
          <MatchDay
            frame={frame} T={T} teamCount={teamCount} totalSlots={totalSlots}
            finalTime={finalTime} prizePool={prizePool} entryFee={entryFee} dateLabel={dateLabel}
          />
        )}
        {/* ═══ CURSOR — above everything, like a real recording ═══ */}
        {!cursorGone && (
          <div style={{
            position: "absolute", left: 0, top: 0, zIndex: 20,
            transform: `translate(${cx}px, ${cy}px) scale(${pressed ? 0.84 : 1})`,
            transition: "none", filter: "drop-shadow(0 4px 10px rgba(0,0,0,.7))",
            opacity: interpolate(frame, [0, 14, 410, 428], [0, 1, 1, 0], clamp),
          }}>
            {CLICKS.map(c => {
              const t = frame - c;
              if (t < 0 || t > 22) return null;
              const s = interpolate(t, [0, 22], [0.3, 2.6], clamp);
              return <div key={c} style={{
                position: "absolute", left: -22, top: -22, width: 44, height: 44, borderRadius: "50%",
                border: `2px solid ${T.acc}`, transform: `scale(${s})`,
                opacity: interpolate(t, [0, 22], [0.75, 0], clamp),
              }} />;
            })}
            <svg width="30" height="34" viewBox="0 0 30 34" fill="none">
              <path d="M2 2L2 26L8.5 20.5L13 30L17.5 28L13 18.5L21 18L2 2Z" fill="#fff" stroke="#0a0a0a" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </AbsoluteFill>

    </AbsoluteFill>
  );
};

// ── small pieces ───────────────────────────────────────────────────────────
const Screen: React.FC<{ o: number; children: React.ReactNode }> = ({ o, children }) => (
  <div style={{
    position: "absolute", inset: 0, opacity: o, display: "flex", flexDirection: "column", justifyContent: "center",
    transform: `scale(${0.985 + o * 0.015})`,
    pointerEvents: "none",
  }}>{children}</div>
);

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 14, letterSpacing: ".16em", color: "#666", fontWeight: 800 }}>{children}</div>
);
const H: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 34, fontWeight: 800, color: "#fff", marginTop: 10, letterSpacing: "-.02em" }}>{children}</div>
);
const P: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 17, color: "#8d8d8d", lineHeight: 1.55, marginTop: 10 }}>{children}</div>
);

const Stat: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div style={{ flex: 1, background: "#0f1113", border: "1px solid #1c1e21", borderRadius: 13, padding: "13px 15px" }}>
    <div style={{ fontSize: 12, letterSpacing: ".1em", color: "#6a6a6a", fontWeight: 700 }}>{k}</div>
    <div style={{ fontSize: 25, fontWeight: 800, color: "#fff", marginTop: 4 }}>{v}</div>
  </div>
);

const Chip: React.FC<{ bg: string; bd: string; fg: string; children: React.ReactNode }> = ({ bg, bd, fg, children }) => (
  <div style={{ padding: "11px 20px", borderRadius: 100, background: bg, border: `1px solid ${bd}`, color: fg, fontWeight: 800, fontSize: 17 }}>{children}</div>
);

/** Button that lifts under the cursor and depresses on the click frame. */
const Button: React.FC<any> = ({ T, frame, hoverAt, clickAt, label, wide, brand, fg }) => {
  const hover = interpolate(frame, [hoverAt, hoverAt + 8], [0, 1], clamp);
  const press = frame >= clickAt && frame < clickAt + 7 ? 1 : 0;
  return (
    <div style={{
      marginTop: 24, width: wide ? "100%" : undefined, textAlign: "center",
      padding: "17px 22px", borderRadius: 13, fontSize: 19, fontWeight: 800,
      color: fg || T.ctaFg,
      background: brand || `linear-gradient(180deg, ${T.acc}, ${T.acc2})`,
      transform: `translateY(${press ? 1.5 : -hover * 2.5}px) scale(${press ? 0.985 : 1 + hover * 0.012})`,
      boxShadow: `0 ${8 + hover * 10}px ${22 + hover * 20}px ${brand ? "rgba(88,101,242,.35)" : T.glow}`,
    }}>{label}</div>
  );
};

/** Counts up rather than appearing — money should feel weighed. */
const Counter: React.FC<any> = ({ frame, from, to, value, T }) => {
  const v = Math.round(interpolate(frame, [from, to], [0, value], { ...clamp, easing: EASE }));
  return (
    <div style={{ fontSize: 68, fontWeight: 800, letterSpacing: "-.035em", color: "#fff", lineHeight: 1.05, marginTop: 8 }}>
      ₹{v.toLocaleString("en-IN")}
    </div>
  );
};

const Row: React.FC<any> = ({ done, label, value, T, delay, frame }) => {
  const a = interpolate(frame, [delay - 10, delay], [0, 1], clamp);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 13, padding: "13px 15px", borderRadius: 12,
      background: "#0f1113", border: `1px solid ${done ? "rgba(74,222,128,.3)" : "#1c1e21"}`,
      opacity: a, transform: `translateX(${(1 - a) * -10}px)`, marginTop: 12,
    }}>
      <div style={{
        width: 27, height: 27, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
        background: done ? "rgba(74,222,128,.14)" : T.soft, color: done ? "#4ade80" : T.acc, fontSize: 14, fontWeight: 800,
      }}>{done ? "✓" : "•"}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", flex: 1 }}>{label}</div>
      <div style={{ fontSize: 14, color: "#6fcf8a" }}>{done ? value : ""}</div>
    </div>
  );
};

const Progress: React.FC<any> = ({ frame, from, to, T }) => (
  <div style={{ height: 5, borderRadius: 3, background: "#191b1e", overflow: "hidden", marginTop: 16 }}>
    <div style={{ height: "100%", width: `${interpolate(frame, [from, to], [0, 100], { ...clamp, easing: EASE })}%`, background: T.acc, boxShadow: `0 0 12px ${T.glow}` }} />
  </div>
);

const Spinner: React.FC<any> = ({ frame, start, until, T }) => {
  if (frame > until) return <div style={{ fontSize: 34 }}>✅</div>;
  return <div style={{
    width: 34, height: 34, borderRadius: "50%", border: "3px solid #1c1e21", borderTopColor: T.acc,
    transform: `rotate(${(frame - start) * 12}deg)`,
  }} />;
};

const Pop: React.FC<any> = ({ frame, at, children }) => {
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 11, mass: 0.5 } });
  return <div style={{ transform: `scale(${s})` }}>{children}</div>;
};

// ── match day ──────────────────────────────────────────────────────────────
const MatchDay: React.FC<any> = ({ frame, T, teamCount, totalSlots, finalTime, prizePool, entryFee, dateLabel }) => {
  const f = frame - 460;

  const wDraw = win(frame, 456, 596, 14);
  const wRR = win(frame, 588, 776, 14);
  const wStand = win(frame, 768, 862, 12);
  const wCta = win(frame, 854, 910, 10);

  const settle = interpolate(f, [16, 62], [0, 1], { ...clamp, easing: EASE });

  return (
    <>
      {/* draw */}
      <AbsoluteFill style={{ padding: "150px 58px 190px", justifyContent: "center", gap: 22, opacity: wDraw }}>
        <div style={{ fontSize: 15, letterSpacing: ".18em", color: T.acc, fontWeight: 800 }}>TOURNAMENT DAY</div>
        <div style={{ fontSize: 44, fontWeight: 800, color: "#fff", letterSpacing: "-.02em", lineHeight: 1.1 }}>
          Teams drawn<br />at random
        </div>
        <div style={{ display: "flex", gap: 11, marginTop: 6 }}>
          {TEAMS.slice(0, teamCount).map(t => (
            <div key={t} style={{
              flex: 1, borderRadius: 15, padding: "15px 8px",
              background: t === YOU ? T.soft : "#0f1113",
              border: `1px solid ${t === YOU ? T.line : "#1c1e21"}`,
              transform: `translateY(${(1 - settle) * 26}px) scale(${0.94 + settle * 0.06})`, opacity: settle,
            }}>
              <div style={{ fontSize: 14, letterSpacing: ".1em", fontWeight: 800, textAlign: "center", color: t === YOU ? T.acc : "#6a6a6a" }}>TEAM {t}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center", marginTop: 10 }}>
                {Array.from({ length: 5 }).map((_, i) => {
                  const you = t === YOU && i === 2;
                  return <div key={i} style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: you ? T.acc : "#1d2024", border: you ? `2px solid ${T.acc}` : "1px solid #24272b",
                    boxShadow: you ? `0 0 14px ${T.glow}` : "none",
                  }} />;
                })}
              </div>
            </div>
          ))}
        </div>
        {/* the pool that resolves into those teams */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, opacity: 1 - settle, marginTop: 4 }}>
          {Array.from({ length: totalSlots }).map((_, i) => (
            <div key={i} style={{
              width: 34, height: 34, borderRadius: "50%", background: i === 7 ? T.acc : "#1a1d20",
              transform: `translate(${Math.sin((f + i * 9) / 6) * 9}px, ${Math.cos((f + i * 6) / 7) * 7}px)`,
            }} />
          ))}
        </div>
        <div style={{ fontSize: 19, color: "#8d8d8d", opacity: settle }}>{teamCount} teams of 5. You&apos;re in Team {YOU}.</div>
      </AbsoluteFill>

      {/* round robin */}
      <AbsoluteFill style={{ padding: "146px 52px 186px", justifyContent: "center", gap: 13, opacity: wRR }}>
        <div style={{ fontSize: 15, letterSpacing: ".18em", color: T.acc, fontWeight: 800 }}>ROUND ROBIN · BEST OF 2</div>
        <div style={{ fontSize: 38, fontWeight: 800, color: "#fff", lineHeight: 1.1, letterSpacing: "-.02em" }}>
          Every team plays<br />every other team
        </div>
        {ROUNDS.map((r, ri) => {
          const at = 140 + ri * 34;
          const a = interpolate(frame, [at, at + 12], [0, 1], { ...clamp, easing: EASE });
          return (
            <div key={r.time} style={{ opacity: a, transform: `translateY(${(1 - a) * 14}px)`, marginTop: ri === 0 ? 8 : 0 }}>
              <div style={{ fontSize: 17, color: "#7a7a7a", fontWeight: 700, marginBottom: 6 }}>
                {r.time} <span style={{ color: "#4a4a4a", fontWeight: 500 }}>· both matches at once</span>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {r.m.map((m, mi) => {
                  const yours = m.a === YOU || m.b === YOU;
                  const sAt = at + 22 + mi * 5;
                  const sc = interpolate(frame, [sAt, sAt + 10], [0, 1], clamp);
                  return (
                    <div key={mi} style={{
                      flex: 1, padding: "13px 15px", borderRadius: 14,
                      background: yours ? T.soft : "#0f1113",
                      border: `1px solid ${yours ? T.line : "#1c1e21"}`,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 22, fontWeight: 800, color: m.a === YOU ? T.acc : "#d8d8d8" }}>{m.a}</span>
                        <span style={{ fontSize: 22, fontWeight: 800, color: "#fff", opacity: sc, transform: `scale(${0.8 + sc * 0.2})` }}>{m.sa}–{m.sb}</span>
                        <span style={{ fontSize: 22, fontWeight: 800, color: m.b === YOU ? T.acc : "#d8d8d8" }}>{m.b}</span>
                      </div>
                      <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
                        {[0, 1].map(k => (
                          <div key={k} style={{
                            flex: 1, height: 6, borderRadius: 3,
                            background: T.acc,
                            transform: `scaleX(${interpolate(frame, [sAt + k * 4, sAt + 9 + k * 4], [0, 1], clamp)})`,
                            transformOrigin: "left",
                          }} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </AbsoluteFill>

      {/* standings + final */}
      <AbsoluteFill style={{ padding: "150px 56px 190px", justifyContent: "center", gap: 16, opacity: wStand }}>
        <div style={{ fontSize: 15, letterSpacing: ".18em", color: T.acc, fontWeight: 800 }}>FINAL STANDINGS</div>
        <div style={{ background: "#0f1113", border: "1px solid #1c1e21", borderRadius: 18, padding: 18 }}>
          <div style={{ display: "flex", fontSize: 14, color: "#6a6a6a", fontWeight: 700, letterSpacing: ".08em", paddingBottom: 8 }}>
            <span style={{ flex: 1 }}>TEAM</span><span style={{ width: 64, textAlign: "right" }}>PTS</span><span style={{ width: 92, textAlign: "right" }}>RW−RL</span>
          </div>
          {STANDINGS.map((s, i) => {
            const at = 782 + i * 8;
            const a = interpolate(frame, [at, at + 9], [0, 1], clamp);
            return (
              <div key={s.t} style={{ display: "flex", alignItems: "center", padding: "11px 0", borderTop: "1px solid #191b1e", opacity: a, transform: `translateX(${(1 - a) * -12}px)` }}>
                <span style={{ flex: 1, fontSize: 23, fontWeight: 800, color: s.t === YOU ? T.acc : i < 2 ? "#fff" : "#7f7f7f" }}>
                  {i + 1}. Team {s.t}{s.t === YOU ? "  ← you" : ""}
                </span>
                <span style={{ width: 64, textAlign: "right", fontSize: 22, fontWeight: 800, color: "#fff" }}>{s.p}</span>
                <span style={{ width: 92, textAlign: "right", fontSize: 20, color: s.rd >= 0 ? "#6fcf8a" : "#c86a6a" }}>{s.rd > 0 ? `+${s.rd}` : s.rd}</span>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 17, color: "#8d8d8d" }}>
          Level on points? <b style={{ color: "#fff" }}>RW−RL</b> decides — then <b style={{ color: "#fff" }}>K−D</b>.
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, color: "#fff", marginTop: 4 }}>
          <span style={{ color: T.acc }}>{finalTime}</span> · Top two, best of 3
        </div>
      </AbsoluteFill>

      {/* close */}
      <AbsoluteFill style={{ padding: "150px 56px 190px", justifyContent: "center", alignItems: "center", gap: 18, textAlign: "center", opacity: wCta }}>
        <div style={{ fontSize: 54, fontWeight: 800, color: "#fff", letterSpacing: "-.025em", lineHeight: 1.06 }}>
          {totalSlots} slots.<br />₹{entryFee}.
        </div>
        <div style={{ fontSize: 22, color: "#8d8d8d" }}>{dateLabel} · ₹{prizePool} prize pool</div>
        <div style={{
          marginTop: 8, padding: "18px 44px", borderRadius: 100, fontSize: 26, fontWeight: 800,
          color: T.ctaFg, background: `linear-gradient(180deg, ${T.acc}, ${T.acc2})`, boxShadow: `0 12px 44px ${T.glow}`,
        }}>Register →</div>
      </AbsoluteFill>
    </>
  );
};

export default TournamentExplainer;
