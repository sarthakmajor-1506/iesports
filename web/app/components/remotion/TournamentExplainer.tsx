"use client";

/**
 * 30-second tournament explainer, drawn entirely in code.
 *
 * Nothing here is a photograph or a generated still: every element is a div a
 * spring is moving. That is deliberate — a team draw, a scoreboard resolving
 * and a standings table re-sorting have to actually move to teach anything, and
 * the registration beat has to look like the real site or it reads as a mock-up.
 * It also means the prize pool, fee, date and slot count are props, so this
 * re-renders correctly when any of them change.
 *
 * Budget (30s @ 30fps = 900 frames). Registration is compressed on purpose;
 * match day is the part players actually don't understand:
 *
 *     0–90    what it is
 *    90–180   register (3s — deliberately fast)
 *   180–240   how registration closes
 *   240–300   substitutes get in free
 *   300–390   the random draw
 *   390–720   ROUND ROBIN — 11 seconds, the centre of the video
 *   720–840   standings → grand final
 *   840–900   call to action
 */

import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
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

const W = 720;
const H = 900;

/** Teams in the worked example. "B" is the viewer's team throughout. */
const TEAMS = ["A", "B", "C", "D"] as const;
const YOU = "B";

/**
 * A complete, arithmetically consistent tournament.
 *
 * Map wins are points, so every match awards exactly 2 and the six matches
 * award 12 in total — the standings below sum to 12, which is the check that
 * the example is not nonsense. A and D deliberately finish level on 3 so the
 * tie-break rule the video teaches is actually demonstrated rather than stated.
 */
const ROUNDS = [
  { time: "11:00", matches: [{ a: "A", b: "B", sa: 0, sb: 2 }, { a: "C", b: "D", sa: 1, sb: 1 }] },
  { time: "13:00", matches: [{ a: "A", b: "C", sa: 2, sb: 0 }, { a: "B", b: "D", sa: 1, sb: 1 }] },
  { time: "15:00", matches: [{ a: "A", b: "D", sa: 1, sb: 1 }, { a: "B", b: "C", sa: 2, sb: 0 }] },
];

const STANDINGS = [
  { team: "B", pts: 5, rd: +34, kd: +41 },
  { team: "D", pts: 3, rd: +6, kd: +12 },
  { team: "A", pts: 3, rd: -2, kd: -4 },
  { team: "C", pts: 1, rd: -38, kd: -49 },
];

// ── helpers ────────────────────────────────────────────────────────────────
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Fade + lift, the only entrance used, so the whole film feels of a piece. */
function useRise(delay = 0, distance = 18) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.6 } });
  return { opacity: s, transform: `translateY(${(1 - s) * distance}px)` };
}

/** Wordmark, tournament name and a progress line — on screen for all 30s. */
const Chrome: React.FC<{ T: any; name: string }> = ({ T, name }) => {
  const frame = useCurrentFrame();
  const pct = Math.min(1, frame / 900);
  return (
    <>
      <div style={{ position: "absolute", top: 40, left: 56, right: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: ".18em", color: "#5c5c5c" }}>IESPORTS</span>
        <span style={{ fontSize: 18, color: "#4a4a4a", letterSpacing: ".04em" }}>{name}</span>
      </div>
      <div style={{ position: "absolute", bottom: 46, left: 56, right: 56 }}>
        <div style={{ height: 4, background: "#171717", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct * 100}%`, background: T.acc, borderRadius: 3, boxShadow: `0 0 12px ${T.glow}` }} />
        </div>
      </div>
    </>
  );
};

const Rise: React.FC<{ delay?: number; distance?: number; style?: React.CSSProperties; children: React.ReactNode }> =
  ({ delay = 0, distance, style, children }) => {
    const r = useRise(delay, distance);
    return <div style={{ ...r, ...style }}>{children}</div>;
  };

export const TournamentExplainer: React.FC<ExplainerProps> = ({
  game = "cs2",
  tournamentName = "CS2 Prelims",
  dateLabel = "Sunday 13 September",
  prizePool = "8,000",
  entryFee = 500,
  totalSlots = 20,
  deadlineLabel = "11 Sept",
  finalTime = "17:00",
}) => {
  const T = GAME_THEME[game];
  const teamsOf = totalSlots / 5;

  const label: React.CSSProperties = { fontSize: 20, letterSpacing: ".18em", color: "#6a6a6a", fontWeight: 700 };
  const head: React.CSSProperties = { fontSize: 60, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.05, color: "#fff" };
  const sub: React.CSSProperties = { fontSize: 28, color: "#9a9a9a", lineHeight: 1.5 };
  const card: React.CSSProperties = { background: "#0e0e0e", border: "1px solid #1c1c1c", borderRadius: 18 };

  return (
    <AbsoluteFill style={{ background: "#070707", fontFamily: "system-ui,-apple-system,'Segoe UI',sans-serif", overflow: "hidden" }}>
      {/* a slow accent wash so the frame is never flat black */}
      <AbsoluteFill style={{ background: `radial-gradient(120% 60% at 50% -10%, ${T.soft}, transparent 70%)` }} />

      {/* Persistent chrome. Beats vary a lot in how much they contain, and
          without this the short ones left the top and bottom thirds empty. It
          also gives the viewer a sense of how much film is left. */}
      <Chrome T={T} name={tournamentName} />

      {/* ═══ 1 · WHAT IT IS ═══ */}
      <Sequence from={0} durationInFrames={92}>
        <AbsoluteFill style={{ padding: "108px 56px 96px", justifyContent: "center", gap: 22 }}>
          <Rise delay={0}><div style={{ ...label, color: T.acc }}>{T.label}</div></Rise>
          <Rise delay={5}><div style={head}>{tournamentName}</div></Rise>
          <Rise delay={11}><div style={{ ...sub, fontSize: 30 }}>{dateLabel}</div></Rise>
          <Rise delay={18} style={{ display: "flex", gap: 14, marginTop: 8 }}>
            {[
              { k: "PRIZE POOL", v: `₹${prizePool}` },
              { k: "SLOTS", v: String(totalSlots) },
              { k: "ENTRY", v: `₹${entryFee}` },
            ].map(s => (
              <div key={s.k} style={{ ...card, padding: "18px 20px", flex: 1 }}>
                <div style={{ fontSize: 16, letterSpacing: ".1em", color: "#666" }}>{s.k}</div>
                <div style={{ fontSize: 34, fontWeight: 800, color: "#fff", marginTop: 6 }}>{s.v}</div>
              </div>
            ))}
          </Rise>
        </AbsoluteFill>
      </Sequence>

      {/* ═══ 2 · REGISTER (fast) ═══ */}
      <Sequence from={92} durationInFrames={90}>
        <RegisterBeat T={T} entryFee={entryFee} card={card} label={label} head={head} sub={sub} />
      </Sequence>

      {/* ═══ 3 · HOW REGISTRATION CLOSES ═══ */}
      <Sequence from={182} durationInFrames={60}>
        <ClosesBeat T={T} totalSlots={totalSlots} deadlineLabel={deadlineLabel} label={label} head={head} sub={sub} />
      </Sequence>

      {/* ═══ 4 · SUBSTITUTES ═══ */}
      <Sequence from={242} durationInFrames={58}>
        <AbsoluteFill style={{ padding: "108px 56px 96px", justifyContent: "center", gap: 20 }}>
          <Rise><div style={{ ...label, color: T.acc }}>LOBBY FULL?</div></Rise>
          <Rise delay={6}><div style={head}>Join as a<br />substitute — free.</div></Rise>
          <Rise delay={14}><div style={sub}>Someone drops out, you take their place. Their entry fee is already paid.</div></Rise>
        </AbsoluteFill>
      </Sequence>

      {/* ═══ 5 · THE DRAW ═══ */}
      <Sequence from={300} durationInFrames={92}>
        <DrawBeat T={T} totalSlots={totalSlots} teamsOf={teamsOf} label={label} head={head} sub={sub} />
      </Sequence>

      {/* ═══ 6 · ROUND ROBIN — the centre of the film ═══ */}
      <Sequence from={392} durationInFrames={328}>
        <RoundRobinBeat T={T} card={card} label={label} />
      </Sequence>

      {/* ═══ 7 · STANDINGS → GRAND FINAL ═══ */}
      <Sequence from={720} durationInFrames={122}>
        <StandingsBeat T={T} card={card} label={label} head={head} finalTime={finalTime} prizePool={prizePool} />
      </Sequence>

      {/* ═══ 8 · CTA ═══ */}
      <Sequence from={842} durationInFrames={58}>
        <AbsoluteFill style={{ padding: "108px 56px 96px", justifyContent: "center", alignItems: "center", gap: 20, textAlign: "center" }}>
          <Rise><div style={{ ...head, fontSize: 60 }}>{totalSlots} slots.<br />₹{entryFee}.</div></Rise>
          <Rise delay={8}><div style={{ ...sub, fontSize: 28 }}>{dateLabel}</div></Rise>
          <Rise delay={14}>
            <div style={{
              marginTop: 10, padding: "20px 46px", borderRadius: 100, fontSize: 30, fontWeight: 800,
              color: T.ctaFg, background: `linear-gradient(180deg, ${T.acc}, ${T.acc2})`, boxShadow: `0 10px 40px ${T.glow}`,
            }}>Register →</div>
          </Rise>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};

// ── Beat 2 · registration, deliberately brisk ──────────────────────────────
const RegisterBeat: React.FC<any> = ({ T, entryFee, card, label, head, sub }) => {
  const frame = useCurrentFrame();
  // Three states in 3 seconds: tap → pay → in.
  const steps = [
    { at: 0, title: "Tap Register", note: "Connect Discord" },
    { at: 26, title: `Pay ₹${entryFee}`, note: "UPI or Net Banking" },
    { at: 50, title: "Add your details", note: "Name · phone · Steam" },
  ];
  const done = frame >= 70;

  return (
    <AbsoluteFill style={{ padding: "108px 56px 96px", justifyContent: "center", gap: 20 }}>
      <Rise><div style={{ ...label, color: T.acc }}>GETTING IN</div></Rise>
      <Rise delay={4}><div style={{ ...head, fontSize: 46 }}>Takes a minute</div></Rise>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 6 }}>
        {steps.map((s, i) => {
          const on = frame >= s.at;
          const tick = frame >= s.at + 20;
          return (
            <div key={i} style={{
              ...card, padding: "18px 20px", display: "flex", alignItems: "center", gap: 16,
              opacity: interpolate(frame, [s.at, s.at + 8], [0, 1], clamp),
              transform: `translateY(${interpolate(frame, [s.at, s.at + 8], [14, 0], clamp)}px)`,
              borderColor: tick ? "rgba(74,222,128,.3)" : "#1c1c1c",
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
                background: tick ? "rgba(74,222,128,.12)" : T.soft, color: tick ? "#4ade80" : T.acc, fontSize: 20, fontWeight: 800,
              }}>{tick ? "✓" : i + 1}</div>
              <div>
                <div style={{ fontSize: 27, fontWeight: 700, color: "#fff" }}>{s.title}</div>
                <div style={{ fontSize: 18, color: "#777", marginTop: 3 }}>{s.note}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* the real button states, because that is what reassures people */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10, opacity: done ? 1 : 0.15, transition: "opacity .2s" }}>
        <div style={{ padding: "14px 26px", borderRadius: 100, background: "rgba(74,222,128,.12)", border: "1px solid rgba(74,222,128,.35)", color: "#6fcf8a", fontWeight: 800, fontSize: 24 }}>✓ Registered</div>
        <div style={{ padding: "14px 22px", borderRadius: 100, border: "1px solid #262626", color: "#8a8a8a", fontWeight: 700, fontSize: 22 }}>Withdraw</div>
      </div>
      <Rise delay={74}><div style={{ ...sub, fontSize: 21, color: "#4ade80" }}>Withdraw before registration closes — 100% refund.</div></Rise>
    </AbsoluteFill>
  );
};

// ── Beat 3 · the OR condition, shown as it actually behaves ────────────────
const ClosesBeat: React.FC<any> = ({ T, totalSlots, deadlineLabel, label, head, sub }) => {
  const frame = useCurrentFrame();
  const filled = Math.round(interpolate(frame, [6, 42], [0, totalSlots], clamp));
  const full = filled >= totalSlots;

  return (
    <AbsoluteFill style={{ padding: "108px 56px 96px", justifyContent: "center", gap: 22 }}>
      <Rise><div style={{ ...label, color: T.acc }}>REGISTRATION CLOSES</div></Rise>
      <Rise delay={4}><div style={{ ...head, fontSize: 46 }}>{deadlineLabel} — or when<br />it fills.</div></Rise>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 9, marginTop: 4 }}>
        {Array.from({ length: totalSlots }).map((_, i) => (
          <div key={i} style={{
            width: 52, height: 52, borderRadius: 13,
            background: i < filled ? T.acc : "#141414",
            border: `1px solid ${i < filled ? T.acc : "#1f1f1f"}`,
            boxShadow: i < filled ? `0 0 18px ${T.glow}` : "none",
          }} />
        ))}
      </div>
      <Rise delay={44}>
        <div style={{ ...sub, fontSize: 30, color: full ? "#fff" : "#9a9a9a", fontWeight: full ? 800 : 400 }}>
          {full ? `${totalSlots} / ${totalSlots} — closed.` : `${filled} / ${totalSlots}`}
        </div>
      </Rise>
    </AbsoluteFill>
  );
};

// ── Beat 5 · random draw; the viewer is one of the dots ────────────────────
const DrawBeat: React.FC<any> = ({ T, totalSlots, teamsOf, label, head, sub }) => {
  const frame = useCurrentFrame();
  const settle = interpolate(frame, [30, 62], [0, 1], clamp);
  const youIndex = 6; // lands in team B

  return (
    <AbsoluteFill style={{ padding: "108px 56px 96px", justifyContent: "center", gap: 22 }}>
      <Rise><div style={{ ...label, color: T.acc }}>TOURNAMENT DAY</div></Rise>
      <Rise delay={4}><div style={{ ...head, fontSize: 46 }}>Teams are drawn<br />at random</div></Rise>

      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        {TEAMS.slice(0, teamsOf).map((t, ti) => (
          <div key={t} style={{
            flex: 1, borderRadius: 16, padding: "16px 10px",
            background: t === YOU ? T.soft : "#0e0e0e",
            border: `1px solid ${t === YOU ? T.line : "#1c1c1c"}`,
            opacity: settle, transform: `translateY(${(1 - settle) * 20}px)`,
          }}>
            <div style={{ fontSize: 18, letterSpacing: ".1em", color: t === YOU ? T.acc : "#666", fontWeight: 800, textAlign: "center" }}>
              TEAM {t}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 12 }}>
              {Array.from({ length: 5 }).map((_, pi) => {
                const isYou = t === YOU && pi === 2;
                return (
                  <div key={pi} style={{
                    width: 34, height: 34, borderRadius: "50%",
                    background: isYou ? T.acc : "#1e1e1e",
                    border: isYou ? `2px solid ${T.acc}` : "1px solid #262626",
                    boxShadow: isYou ? `0 0 16px ${T.glow}` : "none",
                  }} />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* the shuffle before the settle */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, opacity: 1 - settle }}>
        {Array.from({ length: totalSlots }).map((_, i) => (
          <div key={i} style={{
            width: 40, height: 40, borderRadius: "50%",
            background: i === youIndex ? T.acc : "#1a1a1a",
            transform: `translate(${Math.sin((frame + i * 7) / 5) * 10}px, ${Math.cos((frame + i * 5) / 6) * 8}px)`,
          }} />
        ))}
      </div>

      <Rise delay={64}><div style={{ ...sub, fontSize: 24 }}>{teamsOf} teams of 5. You&apos;re in Team {YOU}.</div></Rise>
    </AbsoluteFill>
  );
};

// ── Beat 6 · the round robin. Eleven seconds, and the reason this exists ───
const RoundRobinBeat: React.FC<any> = ({ T, card, label }) => {
  const frame = useCurrentFrame();
  const ROUND_AT = [8, 52, 96]; // all three slots up by ~3.5s; the rest of the beat is for reading

  return (
    <AbsoluteFill style={{ padding: "104px 48px 92px", justifyContent: "center", gap: 16 }}>
      <Rise><div style={{ ...label, color: T.acc }}>ROUND ROBIN · BEST OF 2</div></Rise>
      <Rise delay={5}>
        <div style={{ fontSize: 40, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>
          Every team plays<br />every other team
        </div>
      </Rise>

      <div style={{ display: "flex", flexDirection: "column", gap: 13, marginTop: 6 }}>
        {ROUNDS.map((r, ri) => {
          const at = ROUND_AT[ri];
          const appear = interpolate(frame, [at, at + 10], [0, 1], clamp);
          return (
            <div key={r.time} style={{ opacity: appear, transform: `translateY(${(1 - appear) * 16}px)` }}>
              <div style={{ fontSize: 21, color: "#7a7a7a", fontWeight: 700, marginBottom: 7, letterSpacing: ".06em" }}>
                {r.time} <span style={{ color: "#4a4a4a", fontWeight: 500 }}>· both matches run at once</span>
              </div>
              <div style={{ display: "flex", gap: 11 }}>
                {r.matches.map((m, mi) => {
                  const yours = m.a === YOU || m.b === YOU;
                  const scoreAt = at + 30 + mi * 6;
                  const scored = interpolate(frame, [scoreAt, scoreAt + 10], [0, 1], clamp);
                  return (
                    <div key={mi} style={{
                      ...card, flex: 1, padding: "15px 16px",
                      borderColor: yours ? T.line : "#1c1c1c",
                      background: yours ? T.soft : "#0e0e0e",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 26, fontWeight: 800, color: m.a === YOU ? T.acc : "#d5d5d5" }}>{m.a}</span>
                        <span style={{ fontSize: 26, fontWeight: 800, color: "#fff", opacity: scored }}>
                          {m.sa}–{m.sb}
                        </span>
                        <span style={{ fontSize: 26, fontWeight: 800, color: m.b === YOU ? T.acc : "#d5d5d5" }}>{m.b}</span>
                      </div>
                      {/* the two maps of the BO2 */}
                      <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
                        {[0, 1].map(k => (
                          <div key={k} style={{
                            flex: 1, height: 7, borderRadius: 4,
                            background: interpolate(frame, [scoreAt + k * 5, scoreAt + 8 + k * 5], [0, 1], clamp) > 0.5 ? T.acc : "#1e1e1e",
                            opacity: 0.4 + 0.6 * scored,
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
      </div>

      <Rise delay={300}>
        <div style={{ fontSize: 23, color: "#9a9a9a", marginTop: 2 }}>
          Three matches each. Every map counts.
        </div>
      </Rise>
    </AbsoluteFill>
  );
};

// ── Beat 7 · standings, the tie-break, and the final ───────────────────────
const StandingsBeat: React.FC<any> = ({ T, card, label, head, finalTime, prizePool }) => {
  const frame = useCurrentFrame();
  const showFinal = frame > 76;

  return (
    <AbsoluteFill style={{ padding: "104px 52px 92px", justifyContent: "center", gap: 18 }}>
      <Rise><div style={{ ...label, color: T.acc }}>FINAL STANDINGS</div></Rise>

      <div style={{ ...card, padding: 18, opacity: showFinal ? 0.25 : 1 }}>
        <div style={{ display: "flex", fontSize: 17, color: "#666", letterSpacing: ".08em", paddingBottom: 10, fontWeight: 700 }}>
          <span style={{ flex: 1 }}>TEAM</span>
          <span style={{ width: 74, textAlign: "right" }}>PTS</span>
          <span style={{ width: 92, textAlign: "right" }}>RW−RL</span>
          <span style={{ width: 84, textAlign: "right" }}>K−D</span>
        </div>
        {STANDINGS.map((s, i) => {
          const at = 12 + i * 9;
          const on = interpolate(frame, [at, at + 9], [0, 1], clamp);
          const top2 = i < 2;
          return (
            <div key={s.team} style={{
              display: "flex", alignItems: "center", padding: "12px 0",
              borderTop: "1px solid #171717", opacity: on,
              transform: `translateX(${(1 - on) * -14}px)`,
            }}>
              <span style={{ flex: 1, fontSize: 27, fontWeight: 800, color: s.team === YOU ? T.acc : top2 ? "#fff" : "#8a8a8a" }}>
                {i + 1}. Team {s.team}{s.team === YOU ? "  ← you" : ""}
              </span>
              <span style={{ width: 74, textAlign: "right", fontSize: 26, fontWeight: 800, color: "#fff" }}>{s.pts}</span>
              <span style={{ width: 92, textAlign: "right", fontSize: 24, color: s.rd >= 0 ? "#6fcf8a" : "#c86a6a" }}>{s.rd > 0 ? `+${s.rd}` : s.rd}</span>
              <span style={{ width: 84, textAlign: "right", fontSize: 24, color: "#8a8a8a" }}>{s.kd > 0 ? `+${s.kd}` : s.kd}</span>
            </div>
          );
        })}
      </div>

      {/* the tie-break, demonstrated rather than asserted */}
      <Rise delay={50} style={{ opacity: showFinal ? 0 : 1 }}>
        <div style={{ fontSize: 21, color: "#9a9a9a", lineHeight: 1.5 }}>
          Level on points? <span style={{ color: "#fff", fontWeight: 700 }}>RW−RL</span> decides — then <span style={{ color: "#fff", fontWeight: 700 }}>K−D</span>.
        </div>
      </Rise>

      {showFinal && (
        <AbsoluteFill style={{ padding: "104px 52px 92px", justifyContent: "center", alignItems: "center", gap: 16, textAlign: "center" }}>
          <Rise delay={78}><div style={{ ...label, color: T.acc }}>{finalTime} · GRAND FINAL</div></Rise>
          <Rise delay={83}><div style={{ ...head, fontSize: 54 }}>Top two.<br />Best of 3.</div></Rise>
          <Rise delay={90}>
            <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 6 }}>
              <span style={{ fontSize: 46, fontWeight: 800, color: T.acc }}>B</span>
              <span style={{ fontSize: 26, color: "#666" }}>vs</span>
              <span style={{ fontSize: 46, fontWeight: 800, color: "#fff" }}>D</span>
            </div>
          </Rise>
          <Rise delay={96}><div style={{ fontSize: 30, color: "#fbbf24", fontWeight: 800 }}>🏆 ₹{prizePool}</div></Rise>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

export default TournamentExplainer;
