"use client";

/**
 * Tournament explainer — a product demo, not a slide deck.
 *
 * What makes a flagship product film work, and what this does:
 *
 *   ONE PERSISTENT SURFACE.  Screens change inside a single app frame that
 *   never disappears. Cutting to black between beats is what makes a video feel
 *   like slides; morphing inside a frame makes it feel like software.
 *
 *   A CURSOR THAT DRIVES IT.  Every interaction is performed — the pointer
 *   travels on eased arcs, the button lifts under it, the click lands, the UI
 *   responds. Nobody believes a claim about a flow they watch a caption assert.
 *
 *   A CAMERA.  Scale and offset follow attention.
 *
 *   NEVER STATIC.  Slow drift under everything, springs with overshoot,
 *   numbers that count. A frozen frame reads as a bug.
 *
 * The tournament half is told from the PLAYER's side, not the organiser's.
 * "Round robin, every team plays every team" is a format description; "you
 * play three matches, guaranteed" is what someone deciding whether to spend
 * money actually wants to know.
 *
 * TWO REGISTRATION MODES, and the film must match the one the tournament is
 * actually running — a video demonstrating a flow that no longer exists is
 * worse than no video:
 *
 *   solo  (CS2, and Valorant before 14 Sep 2026)
 *       pay per player, then teams are drawn at random on the day. The entry is
 *       refundable, so the film shows the Withdraw affordance.
 *
 *   team  (`registrationMode: "team"` — League of Rising Stars: Horizon)
 *       setup FIRST, then the captain names a team and pays once for all five;
 *       a 6-character code is issued and teammates join free with it. There is
 *       NO random draw — rosters are pre-formed — and no refund path (see
 *       api/valorant/team/leave: a teammate may leave, a captain may not), so
 *       neither is shown. Setup before money mirrors RegisterModal, where the
 *       order is deliberate: taking ₹2000 first would strand a paid team with
 *       no code for the other four to use.
 *
 * 900 frames @ 30fps.
 */

import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { GAME_THEME, type GameKey } from "@/app/lib/gameTheme";

export type RegistrationMode = "solo" | "team";

/** The theme object every piece in here paints from. */
type Theme = (typeof GAME_THEME)[GameKey];

/** One row of the hour-by-hour timeline. */
type DayRow = { t: string; l: string; s: string; hi?: boolean; gold?: boolean };

export type ExplainerProps = {
  game?: GameKey;
  tournamentName?: string;
  dateLabel?: string;
  prizePool?: string;
  entryFee?: number;
  totalSlots?: number;
  deadlineLabel?: string;
  finalTime?: string;
  /** Mirrors `registrationMode` on the tournament document. */
  registrationMode?: RegistrationMode;
  teamSize?: number;
  totalTeams?: number;
  /** Maps per round-robin match — `matchesPerRound` on the tournament. */
  groupBestOf?: number;
  /** Maps in the Grand Final — `grandFinalBestOf` on the tournament. */
  finalBestOf?: number;
};

const DUR = 900;
const YOU = "B";
const TEAM_NAMES = ["A", "B", "C", "D"] as const;

/**
 * In team mode the rosters arrive pre-formed and named by their captains, so
 * "Team B" would be a fiction — the standings, the fixtures and the bracket all
 * carry real names. The demo team is the one the film registers on camera.
 */
const TEAM_DISPLAY: Record<string, string> = { A: "NOVA", B: "PHANTOM FIVE", C: "ZENITH", D: "RIPTIDE" };
const MY_TEAM = TEAM_DISPLAY[YOU];
const DEMO_CODE = "K7M2QP";   // alphabet of lib/valorantTeams.ts — no 0/O/1/I/L
/** Riot game names on the demo roster; the first is the captain who paid. */
const ROSTER = ["ScytheX", "riz", "sneh", "kabir", "aarav"];

/** The viewer's three fixtures, in the order they play them. */
const MY_MATCHES = [
  { time: "11:00", vs: "A" },
  { time: "13:00", vs: "D" },
  { time: "15:00", vs: "C" },
];

/**
 * Final group table, one per best-of, because the points only add up for the
 * format they were written for — a point per map, six fixtures. In both, the
 * round differences sum to zero (every round one team wins, another loses) and
 * B vs D is the final the film shows.
 *
 *   Bo2  6 × 2 = 12 points. A and D tie on 3; RW−RL puts D through.
 *   Bo1  6 × 1 =  6 points. B wins all three; D, A and C finish level on 1
 *        and RW−RL alone picks the second finalist — the tie-break doing
 *        real work rather than being asserted.
 */
const STANDINGS_BY_BO: Record<1 | 2, { t: string; p: number; rd: number }[]> = {
  2: [
    { t: "B", p: 5, rd: +34 },
    { t: "D", p: 3, rd: +6 },
    { t: "A", p: 3, rd: -2 },
    { t: "C", p: 1, rd: -38 },
  ],
  1: [
    { t: "B", p: 3, rd: +29 },
    { t: "D", p: 1, rd: +3 },
    { t: "A", p: 1, rd: -5 },
    { t: "C", p: 1, rd: -27 },
  ],
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const EASE = Easing.bezier(0.33, 1, 0.68, 1);
const EASE_IO = Easing.bezier(0.65, 0, 0.35, 1);

const track = (frame: number, keys: [number, number][], easing = EASE) => {
  if (frame <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [f0, v0] = keys[i], [f1, v1] = keys[i + 1];
    if (frame <= f1) return interpolate(frame, [f0, f1], [v0, v1], { ...clamp, easing });
  }
  return keys[keys.length - 1][1];
};

/** ₹2,000, not ₹2000 — the prize pool is already grouped, and a film that
 *  writes the same amount two ways in twelve seconds looks unfinished. */
const inr = (n: number) => Number(n).toLocaleString("en-IN");

const win = (frame: number, a: number, b: number, r = 10) =>
  Math.min(interpolate(frame, [a, a + r], [0, 1], clamp), interpolate(frame, [b - r, b], [1, 0], clamp));

/** Characters revealed left to right, the way someone types into a field. */
const typed = (frame: number, text: string, from: number, to: number) =>
  text.slice(0, Math.floor(interpolate(frame, [from, to], [0, text.length], clamp)));

/**
 * Beat transition. Fading two full-bleed beats through each other printed one
 * on top of the other and was unreadable; carrying them on a continuous upward
 * travel keeps them spatially separated through the cross, and reads as an
 * advance rather than a dissolve.
 */
const beat = (frame: number, a: number, b: number, r = 12) => {
  const enter = interpolate(frame, [a, a + r], [0, 1], { ...clamp, easing: EASE });
  const exit = interpolate(frame, [b - r, b], [0, 1], { ...clamp, easing: EASE });
  return { opacity: enter * (1 - exit), transform: `translateY(${(1 - enter) * 30 - exit * 30}px)` };
};

// ── beat boundaries ────────────────────────────────────────────────────────
// Two timelines, both landing on 910. Team mode spends the frames the random
// draw used to occupy on the code being issued and a teammate redeeming it —
// which is the part of the new format people actually get wrong.
const B_SOLO = {
  hero: [-10, 76], discord: [70, 132], pay: [126, 198], payu: [192, 238],
  setup: [232, 292], done: [286, 332], reg: [326, 388],
  draw: [382, 492], day: [486, 624], mine: [618, 730], stand: [724, 826], cta: [820, 910],
} as const;

const B_TEAM = {
  hero: [-10, 72], discord: [66, 122], setup: [116, 186],
  choice: [180, 248], create: [242, 312], payu: [306, 352],
  code: [346, 428], join: [422, 502],
  day: [496, 618], mine: [612, 722], stand: [716, 818], cta: [812, 910],
} as const;

export const TournamentExplainer: React.FC<ExplainerProps> = ({
  game = "valorant",
  tournamentName = "LEAGUE OF RISING STARS - HORIZON",
  dateLabel = "Sunday 27 September",
  prizePool = "8,000",
  entryFee = 2000,
  totalSlots = 20,
  deadlineLabel = "24 Sept",
  finalTime = "17:00",
  registrationMode = "team",
  teamSize = 5,
  totalTeams = 4,
  groupBestOf = 1,
  finalBestOf = 3,
}) => {
  const frame = useCurrentFrame();
  const T = GAME_THEME[game];
  const teamMode = registrationMode === "team";
  const size = Math.max(2, teamSize);
  const teams = teamMode
    ? Math.max(2, Math.min(4, totalTeams || Math.floor(totalSlots / size)))
    : Math.max(2, Math.min(4, Math.round(totalSlots / 5)));

  const camScale = track(frame, [[0, 1.04], [56, 1.0], [150, 1.05], [230, 1.1], [300, 1.0], [430, 1.0], [500, 0.97], [900, 0.97]]);
  const camY = track(frame, [[0, 18], [56, 0], [230, -22], [300, 0], [900, 0]]);
  const drift = Math.sin(frame / 90) * 5;

  // Cursor lives INSIDE the camera, so it scales with the UI it operates —
  // rendered outside, it slid off every button as the camera pushed in. The y
  // values are each screen's button centre, which depends on how tall that
  // screen's content is: change a screen's copy and its landing point moves.
  // Team mode parks the pointer off-frame across the details beat (frames
  // 134–186): there is nothing to click there, and a cursor sitting still in
  // the middle of a screen for two seconds reads as a frozen render.
  const CLICKS = teamMode ? [48, 100, 218, 292] : [52, 106, 178];
  const CURSOR_OUT = teamMode ? 352 : 240;
  const cx = teamMode
    ? track(frame, [[0, 880], [20, 470], [42, 360], [48, 360], [58, 430], [90, 360], [100, 360], [112, 520], [134, 880], [186, 880], [198, 420], [212, 360], [218, 360], [228, 430], [272, 390], [286, 360], [292, 360], [302, 470], [348, 880]], EASE_IO)
    : track(frame, [[0, 880], [22, 470], [44, 360], [52, 360], [64, 430], [96, 360], [106, 360], [118, 440], [162, 360], [178, 360], [196, 480], [236, 880]], EASE_IO);
  const cy = teamMode
    ? track(frame, [[0, 1050], [20, 660], [42, 550], [48, 550], [58, 600], [90, 494], [100, 494], [112, 560], [134, 1050], [186, 1050], [198, 560], [212, 472], [218, 472], [228, 530], [272, 620], [286, 570], [292, 570], [302, 650], [348, 1050]], EASE_IO)
    : track(frame, [[0, 1050], [22, 660], [44, 550], [52, 550], [64, 600], [96, 477], [106, 477], [118, 520], [162, 549], [178, 549], [196, 640], [236, 1050]], EASE_IO);
  const pressed = CLICKS.some(c => frame >= c && frame < c + 7);

  const productEnd = teamMode ? B_TEAM.join[1] : B_SOLO.reg[1];
  const productPhase = frame < productEnd + 6;

  return (
    <AbsoluteFill style={{ background: "#050506", fontFamily: "system-ui,-apple-system,'Segoe UI',sans-serif", overflow: "hidden" }}>
      <AbsoluteFill style={{ background: `radial-gradient(90% 50% at 50% ${8 + drift}%, ${T.soft}, transparent 65%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(70% 40% at ${20 - drift}% 95%, rgba(255,255,255,0.035), transparent 70%)` }} />

      <div style={{ position: "absolute", top: 42, left: 58, right: 58, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 5 }}>
        <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: ".2em", color: "#5a5a5a" }}>IESPORTS</span>
        <span style={{ fontSize: 17, color: T.acc, letterSpacing: ".14em", fontWeight: 700 }}>{T.label}</span>
      </div>
      <div style={{ position: "absolute", bottom: 46, left: 58, right: 58, zIndex: 5 }}>
        <div style={{ height: 3, background: "#161616", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(frame / DUR) * 100}%`, background: T.acc, boxShadow: `0 0 14px ${T.glow}` }} />
        </div>
      </div>

      <AbsoluteFill style={{ transform: `scale(${camScale}) translateY(${camY + drift * 0.4}px)`, transformOrigin: "50% 45%" }}>

        {productPhase && (
          <div style={{
            position: "absolute", left: 60, right: 60, top: 150, bottom: 190,
            background: "linear-gradient(180deg,#0d0e10,#08090a)",
            border: "1px solid #1b1d20", borderRadius: 26,
            boxShadow: "0 40px 90px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.02) inset",
            overflow: "hidden", opacity: win(frame, -10, productEnd + 4, 14),
          }}>
            {teamMode ? (
              <TeamSignup
                frame={frame} T={T} tournamentName={tournamentName} dateLabel={dateLabel}
                prizePool={prizePool} entryFee={entryFee} teamSize={size} totalTeams={teams}
              />
            ) : (
              <SoloSignup
                frame={frame} T={T} tournamentName={tournamentName} dateLabel={dateLabel}
                prizePool={prizePool} entryFee={entryFee} totalSlots={totalSlots} deadlineLabel={deadlineLabel}
              />
            )}
          </div>
        )}

        {!productPhase && (
          <MatchDay frame={frame} T={T} teamCount={teams} totalSlots={totalSlots} teamMode={teamMode}
            groupBo={groupBestOf} finalBo={finalBestOf}
            finalTime={finalTime} prizePool={prizePool} entryFee={entryFee} dateLabel={dateLabel} />
        )}

        {frame <= CURSOR_OUT && (
          <div style={{
            position: "absolute", left: 0, top: 0, zIndex: 20,
            transform: `translate(${cx}px, ${cy}px) scale(${pressed ? 0.84 : 1})`,
            filter: "drop-shadow(0 4px 10px rgba(0,0,0,.7))",
            opacity: interpolate(frame, [0, 14, CURSOR_OUT - 16, CURSOR_OUT - 2], [0, 1, 1, 0], clamp),
          }}>
            {CLICKS.map(c => {
              const t = frame - c;
              if (t < 0 || t > 22) return null;
              return <div key={c} style={{
                position: "absolute", left: -22, top: -22, width: 44, height: 44, borderRadius: "50%",
                border: `2px solid ${T.acc}`, transform: `scale(${interpolate(t, [0, 22], [0.3, 2.6], clamp)})`,
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

// ── sign-up, per player (solo mode) ────────────────────────────────────────

/** What both cuts need to draw the hero card. */
type SignupProps = {
  frame: number;
  T: Theme;
  tournamentName: string;
  dateLabel: string;
  prizePool: string;
  entryFee: number;
};

const SoloSignup: React.FC<SignupProps & { totalSlots: number; deadlineLabel: string }> = ({
  frame, T, tournamentName, dateLabel, prizePool, entryFee, totalSlots, deadlineLabel,
}) => {
  const B = B_SOLO;
  return (
    <>
      <Screen o={win(frame, B.hero[0], B.hero[1], 12)}>
        <div style={{ padding: "0 32px" }}>
          <Hero T={T} dateLabel={dateLabel} tournamentName={tournamentName}
            stats={[["PRIZE", `₹${prizePool}`], ["SLOTS", String(totalSlots)], ["ENTRY", `₹${entryFee}`]]} />
          <Button T={T} frame={frame} hoverAt={36} clickAt={52} label="Register →" />
        </div>
      </Screen>

      <Screen o={win(frame, B.discord[0], B.discord[1], 12)}>
        <div style={{ padding: "0 32px" }}>
          <Eyebrow>STEP 1 OF 3</Eyebrow>
          <H>Connect Discord</H>
          <P>Brackets, match calls and your team all live there.</P>
          <Button T={T} frame={frame} hoverAt={90} clickAt={106} label="Continue with Discord" brand="#5865F2" fg="#fff" />
        </div>
      </Screen>

      <Screen o={win(frame, B.pay[0], B.pay[1], 12)}>
        <div style={{ padding: "0 32px" }}>
          <Eyebrow>STEP 2 OF 3 · SLOT HELD</Eyebrow>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", marginTop: 10 }}>Claim your slot</div>
          <Counter frame={frame} from={148} to={172} value={entryFee} />
          <P>UPI or Net Banking through PayU.</P>
          <div style={{ fontSize: 15, color: "#4ade80", marginTop: 4 }}>Fully refundable before registration closes.</div>
          <Button T={T} frame={frame} hoverAt={162} clickAt={178} label={`Pay ₹${entryFee}`} />
        </div>
      </Screen>

      <PayuSheet frame={frame} T={T} o={win(frame, B.payu[0], B.payu[1], 10)} slideFrom={192} spinUntil={224} amount={entryFee} />

      <Screen o={win(frame, B.setup[0], B.setup[1], 12)}>
        <div style={{ padding: "0 32px" }}>
          <div style={{ fontSize: 14, letterSpacing: ".14em", color: "#4ade80", fontWeight: 800 }}>✓ SLOT PAID · ₹{entryFee}</div>
          <H>Finish setup</H>
          <Progress frame={frame} from={240} to={286} T={T} />
          <div style={{ marginTop: 4 }}>
            <Row done={frame > 248} label="Your name" value="saved" T={T} delay={248} frame={frame} />
            <Row done={frame > 262} label="Phone" value="verified" T={T} delay={262} frame={frame} />
            <Row done={frame > 276} label="Riot ID" value="linked" T={T} delay={276} frame={frame} />
          </div>
        </div>
      </Screen>

      <Screen o={win(frame, B.done[0], B.done[1], 12)}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <Pop frame={frame} at={296}><div style={{ fontSize: 54 }}>🏆</div></Pop>
          <div style={{ fontSize: 36, fontWeight: 800, color: "#fff" }}>You&apos;re in</div>
          <div style={{ fontSize: 17, color: "#8d8d8d" }}>Everything from here happens on Discord.</div>
        </div>
      </Screen>

      {/* Your slot, as the tournament page shows it. Seeing Withdraw sitting
          next to Registered is what tells a first-timer the money is not a
          trapdoor. Solo only — team entries have no refund path. */}
      <Screen o={win(frame, B.reg[0], B.reg[1], 12)}>
        <div style={{ padding: "0 32px" }}>
          <Eyebrow>YOUR SLOT</Eyebrow>
          <div style={{
            marginTop: 16, padding: 18, borderRadius: 16, background: "#0f1113", border: "1px solid #1c1e21",
            transform: `translateY(${interpolate(frame, [332, 346], [14, 0], { ...clamp, easing: EASE })}px)`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Chip bg="rgba(74,222,128,.12)" bd="rgba(74,222,128,.4)" fg="#6fcf8a">✓ Registered</Chip>
              <Chip bg="transparent" bd="#2a2a2a" fg="#8a8a8a">Withdraw</Chip>
            </div>
            <div style={{ height: 1, background: "#1a1c1f", margin: "16px 0" }} />
            <KV k="Paid" v={`₹${entryFee}`} />
            <KV k="Slot held until" v={deadlineLabel} mt={9} />
          </div>
          <div style={{
            fontSize: 16, color: "#4ade80", marginTop: 16, lineHeight: 1.5,
            opacity: interpolate(frame, [356, 370], [0, 1], clamp),
          }}>
            Changed your mind? Withdraw before registration closes — full ₹{entryFee} back.
          </div>
        </div>
      </Screen>
    </>
  );
};

// ── sign-up, per team (team mode) ──────────────────────────────────────────

/**
 * The flow RegisterModal actually runs for `registrationMode: "team"`:
 * Discord → details → create a team (pay once) | join with a code (free).
 *
 * The code beat and the join beat are the two this film exists for. The last
 * one switches to the teammate's phone — same surface, relabelled — because
 * the question the new format raises is "so what do the other four do?".
 */
const TeamSignup: React.FC<SignupProps & { teamSize: number; totalTeams: number }> = ({
  frame, T, tournamentName, dateLabel, prizePool, entryFee, teamSize, totalTeams,
}) => {
  const B = B_TEAM;
  const name = typed(frame, MY_TEAM, 250, 276);
  const nameCaret = frame < 280 && Math.floor(frame / 8) % 2 === 0;

  // The roster assembling once the code is redeemed: captain, then each joiner.
  // It has to reach 5/5 with frames to spare — the payoff of the whole film
  // landing inside the beat's own fade-out is the payoff not landing.
  const JOIN_AT = 464;
  const joined = Math.min(ROSTER.length, 1 + Math.max(0, Math.floor(interpolate(frame, [JOIN_AT, JOIN_AT + 22], [0, ROSTER.length - 1], clamp))));

  return (
    <>
      <Screen o={win(frame, B.hero[0], B.hero[1], 12)}>
        <div style={{ padding: "0 32px" }}>
          <Hero T={T} dateLabel={dateLabel} tournamentName={tournamentName}
            stats={[["PRIZE", `₹${prizePool}`], ["TEAMS", String(totalTeams)], ["PER TEAM", `₹${inr(entryFee)}`]]} />
          <Button T={T} frame={frame} hoverAt={32} clickAt={48} label="Register →" />
        </div>
      </Screen>

      <Screen o={win(frame, B.discord[0], B.discord[1], 12)}>
        <div style={{ padding: "0 32px" }}>
          <Eyebrow>STEP 1 OF 2</Eyebrow>
          <H>Connect Discord</H>
          <P>Brackets, match calls and your team all live there.</P>
          <Button T={T} frame={frame} hoverAt={84} clickAt={100} label="Continue with Discord" brand="#5865F2" fg="#fff" />
        </div>
      </Screen>

      {/* Details BEFORE the money — the team and its code are created the
          instant the captain's payment settles, and seating them as player one
          needs a Riot ID. */}
      <Screen o={win(frame, B.setup[0], B.setup[1], 12)}>
        <div style={{ padding: "0 32px" }}>
          <Eyebrow>STEP 2 OF 2</Eyebrow>
          <H>Your details</H>
          <Progress frame={frame} from={126} to={176} T={T} />
          <div style={{ marginTop: 4 }}>
            <Row done={frame > 136} label="Your name" value="saved" T={T} delay={136} frame={frame} />
            <Row done={frame > 150} label="Phone" value="verified" T={T} delay={150} frame={frame} />
            <Row done={frame > 164} label="Riot ID" value="linked" T={T} delay={164} frame={frame} />
          </div>
        </div>
      </Screen>

      {/* The fork. This is the change: nobody is shuffled into a team any more. */}
      <Screen o={win(frame, B.choice[0], B.choice[1], 12)}>
        <div style={{ padding: "0 32px" }}>
          <Eyebrow>TEAM ENTRY · {totalTeams} TEAM SLOTS</Eyebrow>
          <H>Enter as a team</H>
          <P>₹{inr(entryFee)} per team of {teamSize}. The captain names the team and pays once, then shares a code. Teammates join free with it.</P>
          <Button T={T} frame={frame} hoverAt={204} clickAt={218} label="Create a team" />
          <Button T={T} frame={frame} hoverAt={-1} clickAt={-1} label="I have a team code" ghost mt={14} />
        </div>
      </Screen>

      <Screen o={win(frame, B.create[0], B.create[1], 12)}>
        <div style={{ padding: "0 32px" }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: "#fff", letterSpacing: "-.02em" }}>Create your team</div>
          <Field value={name} caret={nameCaret} placeholder="Team name" T={T} />
          <div style={{ fontSize: 13, color: "#6a6a6a", marginTop: 8 }}>On the bracket and the stream. You&apos;re the captain.</div>
          <div style={{ fontSize: 58, fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1, color: "#fff", marginTop: 14 }}>
            ₹{inr(entryFee)}
          </div>
          <P>Covers all {teamSize} players — teammates join free. UPI or Net Banking through PayU.</P>
          <Button T={T} frame={frame} hoverAt={278} clickAt={292} label={`Pay ₹${inr(entryFee)}`} />
        </div>
      </Screen>

      <PayuSheet frame={frame} T={T} o={win(frame, B.payu[0], B.payu[1], 10)} slideFrom={306} spinUntil={336} amount={entryFee} />

      {/* The code, the moment it exists. */}
      <Screen o={win(frame, B.code[0], B.code[1], 12)}>
        <div style={{ padding: "0 32px" }}>
          <div style={{ fontSize: 14, letterSpacing: ".14em", color: "#4ade80", fontWeight: 800 }}>✓ TEAM REGISTERED · CAPTAIN</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#fff", marginTop: 10, letterSpacing: ".01em" }}>{MY_TEAM}</div>
          <div style={{ fontSize: 16, color: "#8d8d8d", lineHeight: 1.5, marginTop: 8 }}>
            1 of {teamSize} players. Send the code to the {teamSize - 1} still missing.
          </div>

          <div style={{
            marginTop: 16, padding: "18px 16px", borderRadius: 16, background: "#0f1113", border: `1px solid ${T.line}`,
            textAlign: "center",
            opacity: interpolate(frame, [356, 372], [0, 1], clamp),
            transform: `scale(${interpolate(frame, [356, 372], [0.94, 1], { ...clamp, easing: EASE })})`,
          }}>
            <div style={{ fontSize: 12, letterSpacing: ".16em", color: "#6a6a6a", fontWeight: 700 }}>TEAM CODE</div>
            {/* textIndent cancels the trailing letter-space, which otherwise
                parks a widely-tracked string half a space left of centre. */}
            <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: ".22em", textIndent: ".22em", color: T.acc, marginTop: 6, textShadow: `0 0 26px ${T.glow}` }}>
              {typed(frame, DEMO_CODE, 364, 382)}
            </div>
            <div style={{ fontSize: 13, color: frame > 396 ? "#4ade80" : "#6a6a6a", marginTop: 6 }}>
              {frame > 396 ? "Copied" : "Tap to copy"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 14, opacity: interpolate(frame, [386, 400], [0, 1], clamp) }}>
            <Chip bg={`linear-gradient(180deg, ${T.acc}, ${T.acc2})`} bd="transparent" fg={T.ctaFg} grow>Copy invite link</Chip>
            <Chip bg="#1c1c1c" bd="#2a2a2a" fg="#fff" grow>WhatsApp</Chip>
          </div>
          <div style={{ fontSize: 14, color: "#6a6a6a", marginTop: 12, textAlign: "center", opacity: interpolate(frame, [402, 414], [0, 1], clamp) }}>
            It is in your Discord DMs too. Only the team can see it.
          </div>
        </div>
      </Screen>

      {/* The other four, on the other side of the code. */}
      <Screen o={win(frame, B.join[0], B.join[1], 12)}>
        <div style={{ padding: "0 32px" }}>
          <Eyebrow>ON YOUR TEAMMATE&apos;S PHONE</Eyebrow>
          <H>Join a team</H>
          <div style={{ fontSize: 16, color: "#8d8d8d", lineHeight: 1.5, marginTop: 8 }}>
            Enter the {DEMO_CODE.length}-character code the captain sent. Joining is free.
          </div>
          <Field value={typed(frame, DEMO_CODE, 430, 450)} caret={frame < 452 && Math.floor(frame / 8) % 2 === 0}
            placeholder="ABC123" T={T} code />

          <div style={{
            marginTop: 14, padding: 16, borderRadius: 15, background: "#0f1113", border: "1px solid #1c1e21",
            opacity: interpolate(frame, [452, JOIN_AT], [0, 1], clamp),
            transform: `translateY(${interpolate(frame, [452, JOIN_AT], [12, 0], { ...clamp, easing: EASE })}px)`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: ".02em" }}>{MY_TEAM}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: joined >= teamSize ? "#4ade80" : "#8d8d8d" }}>{joined}/{teamSize}</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 11 }}>
              {ROSTER.slice(0, joined).map((m, i) => (
                <span key={m} style={{
                  fontSize: 13.5, color: i === 0 ? T.acc : "#9a9a9a", background: "#141414",
                  border: `1px solid ${i === 0 ? T.line : "#232323"}`, borderRadius: 100, padding: "5px 12px",
                  transform: `scale(${i === 0 ? 1 : interpolate(frame, [JOIN_AT + (i - 1) * 6, JOIN_AT + 6 + (i - 1) * 6], [0.6, 1], clamp)})`,
                }}>{m}{i === 0 ? " · C" : ""}</span>
              ))}
            </div>
          </div>

          <Button T={T} frame={frame} hoverAt={-1} clickAt={-1} mt={16}
            label={joined >= teamSize ? `✓ All ${teamSize} players in` : `Join ${MY_TEAM}`}
            brand={joined >= teamSize ? "rgba(74,222,128,.14)" : undefined}
            glow={joined >= teamSize ? "rgba(74,222,128,.18)" : undefined}
            fg={joined >= teamSize ? "#6fcf8a" : undefined} />
        </div>
      </Screen>
    </>
  );
};

// ── pieces ─────────────────────────────────────────────────────────────────
const Screen: React.FC<{ o: number; children: React.ReactNode }> = ({ o, children }) => (
  <div style={{
    position: "absolute", inset: 0, opacity: o, display: "flex", flexDirection: "column", justifyContent: "center",
    transform: `scale(${0.985 + o * 0.015})`, pointerEvents: "none",
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

const Hero: React.FC<{ T: Theme; dateLabel: string; tournamentName: string; stats: [string, string][] }> = ({ T, dateLabel, tournamentName, stats }) => (
  <>
    <div style={{ fontSize: 15, letterSpacing: ".16em", color: T.acc, fontWeight: 800 }}>{String(dateLabel).toUpperCase()}</div>
    <div style={{ fontSize: 40, fontWeight: 800, color: "#fff", lineHeight: 1.08, marginTop: 12, letterSpacing: "-.02em" }}>
      {String(tournamentName).replace(/ - /g, " · ")}
    </div>
    <div style={{ display: "flex", gap: 12, marginTop: 26 }}>
      {stats.map(([k, v]) => <Stat key={k} k={k} v={v} />)}
    </div>
  </>
);

const Stat: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div style={{ flex: 1, background: "#0f1113", border: "1px solid #1c1e21", borderRadius: 13, padding: "13px 15px" }}>
    <div style={{ fontSize: 12, letterSpacing: ".1em", color: "#6a6a6a", fontWeight: 700 }}>{k}</div>
    <div style={{ fontSize: 25, fontWeight: 800, color: "#fff", marginTop: 4 }}>{v}</div>
  </div>
);

const KV: React.FC<{ k: string; v: string; mt?: number }> = ({ k, v, mt = 0 }) => (
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, marginTop: mt }}>
    <span style={{ color: "#7a7a7a" }}>{k}</span><span style={{ color: "#fff", fontWeight: 700 }}>{v}</span>
  </div>
);

const Chip: React.FC<any> = ({ bg, bd, fg, grow, children }) => (
  <div style={{
    padding: "11px 20px", borderRadius: 100, background: bg, border: `1px solid ${bd}`, color: fg,
    fontWeight: 800, fontSize: 17, ...(grow ? { flex: 1, textAlign: "center" as const } : null),
  }}>{children}</div>
);

/** A text field mid-entry. `code` is the 6-character join code. */
const Field: React.FC<{ value: string; caret: boolean; placeholder: string; T: Theme; code?: boolean }> = ({ value, caret, placeholder, T, code }) => (
  <div style={{
    marginTop: 16, padding: "15px 18px", borderRadius: 13, background: "#0f1113",
    border: `1px solid ${value ? T.line : "#1c1e21"}`,
    fontSize: code ? 26 : 22, fontWeight: 800, color: value ? "#fff" : "#4a4a4a",
    letterSpacing: code ? ".3em" : ".04em", textAlign: code ? "center" : "left",
    ...(code ? { textIndent: ".3em" } : null),
  }}>
    {value || placeholder}
    <span style={{ opacity: caret ? 1 : 0, color: T.acc }}>|</span>
  </div>
);

const Button: React.FC<any> = ({ T, frame, hoverAt, clickAt, label, brand, fg, glow, ghost, mt = 24 }) => {
  const hover = hoverAt >= 0 ? interpolate(frame, [hoverAt, hoverAt + 8], [0, 1], clamp) : 0;
  const press = clickAt >= 0 && frame >= clickAt && frame < clickAt + 7 ? 1 : 0;
  return (
    <div style={{
      marginTop: mt, width: "100%", textAlign: "center", padding: "17px 22px", borderRadius: 13,
      fontSize: 19, fontWeight: 800, color: ghost ? "#fff" : fg || T.ctaFg,
      background: ghost ? "#141416" : brand || `linear-gradient(180deg, ${T.acc}, ${T.acc2})`,
      border: `1px solid ${ghost ? "#26282b" : "transparent"}`,
      transform: `translateY(${press ? 1.5 : -hover * 2.5}px) scale(${press ? 0.985 : 1 + hover * 0.012})`,
      boxShadow: ghost ? "none" : `0 ${8 + hover * 10}px ${22 + hover * 20}px ${glow || (brand ? "rgba(88,101,242,.35)" : T.glow)}`,
    }}>{label}</div>
  );
};

/** The hosted checkout, sliding in over whichever screen called it. */
const PayuSheet: React.FC<{ frame: number; T: Theme; o: number; slideFrom: number; spinUntil: number; amount: number }> = ({ frame, T, o, slideFrom, spinUntil, amount }) => (
  <Screen o={o}>
    <div style={{
      position: "absolute", inset: 0, background: "#0a0b0d",
      transform: `translateX(${interpolate(frame, [slideFrom, slideFrom + 16], [420, 0], { ...clamp, easing: EASE })}px)`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18,
    }}>
      <div style={{ fontSize: 15, letterSpacing: ".18em", color: "#5a5a5a", fontWeight: 800 }}>PAYU · SECURE</div>
      <Spinner frame={frame} start={slideFrom + 14} until={spinUntil} T={T} />
      <div style={{ fontSize: 30, fontWeight: 800, color: frame > spinUntil ? "#4ade80" : "#fff" }}>
        {frame > spinUntil ? "✓ Paid" : `₹${inr(amount)}`}
      </div>
    </div>
  </Screen>
);

const Counter: React.FC<any> = ({ frame, from, to, value }) => (
  <div style={{ fontSize: 68, fontWeight: 800, letterSpacing: "-.035em", color: "#fff", lineHeight: 1.05, marginTop: 8 }}>
    ₹{Math.round(interpolate(frame, [from, to], [0, value], { ...clamp, easing: EASE })).toLocaleString("en-IN")}
  </div>
);

const Row: React.FC<any> = ({ done, label, value, T, delay, frame }) => {
  const a = interpolate(frame, [delay - 10, delay], [0, 1], clamp);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 13, padding: "13px 15px", borderRadius: 12,
      background: "#0f1113", border: `1px solid ${done ? "rgba(74,222,128,.3)" : "#1c1e21"}`,
      opacity: a, transform: `translateX(${(1 - a) * -10}px)`, marginTop: 10,
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

const Spinner: React.FC<any> = ({ frame, start, until, T }) => (
  frame > until ? <div style={{ fontSize: 34 }}>✅</div> : <div style={{
    width: 34, height: 34, borderRadius: "50%", border: "3px solid #1c1e21", borderTopColor: T.acc,
    transform: `rotate(${(frame - start) * 12}deg)`,
  }} />
);

const Pop: React.FC<any> = ({ frame, at, children }) => {
  const { fps } = useVideoConfig();
  return <div style={{ transform: `scale(${spring({ frame: frame - at, fps, config: { damping: 11, mass: 0.5 } })})` }}>{children}</div>;
};

// ── match day ──────────────────────────────────────────────────────────────

/**
 * The draw, rebuilt — SOLO MODE ONLY. Team registrations arrive pre-formed and
 * there is nothing to draw; playing this over a team tournament is exactly the
 * wrong claim, so the team timeline carries no `draw` beat at all.
 *
 * The previous version crossfaded a floating pool out while team cards faded
 * in — two unrelated sets of elements, so the dots never *became* players and
 * the whole thing read as a dissolve rather than a draw. Now there is ONE set
 * of dots: each is given a pool position and a seat, and flies from one to the
 * other on a staggered arc. Identity is continuous, which is the entire point.
 *
 * Dots are dealt k % teamCount — one to each team in turn, the way a real draw
 * looks — rather than filling one team at a time.
 */
const POOL_X = (k: number) => 176 + (k % 5) * 84;
const POOL_Y = (k: number) => 392 + Math.floor(k / 5) * 62;

const MatchDay: React.FC<{
  frame: number; T: Theme; teamCount: number; totalSlots: number; teamMode: boolean;
  groupBo: number; finalBo: number;
  finalTime: string; prizePool: string; entryFee: number; dateLabel: string;
}> = ({ frame, T, teamCount, totalSlots, teamMode, groupBo, finalBo, finalTime, prizePool, entryFee, dateLabel }) => {
  const B = teamMode ? B_TEAM : B_SOLO;
  const STANDINGS = STANDINGS_BY_BO[groupBo === 1 ? 1 : 2];
  const GROUP = `Bo${groupBo}`;
  const FINAL = `Bo${finalBo}`;
  const bDay = beat(frame, B.day[0], B.day[1], 13);
  const bMine = beat(frame, B.mine[0], B.mine[1], 13);
  const bStand = beat(frame, B.stand[0], B.stand[1], 12);
  const bCta = beat(frame, B.cta[0], B.cta[1], 11);

  /** "Team B" in solo mode, the captain's own name in team mode. */
  const label = (letter: string) => (teamMode ? TEAM_DISPLAY[letter] : `Team ${letter}`);

  const DAY_ROWS: DayRow[] = [
    { t: "10:30", l: "Check in on Discord", s: "Lobby codes go out there" },
    ...(teamMode ? [] : [{ t: "10:45", l: "Teams drawn at random", s: `${teamCount} teams of 5` }]),
    { t: "11:00", l: "Match 1", s: `${GROUP} · round robin`, hi: true },
    { t: "13:00", l: "Match 2", s: `${GROUP} · round robin`, hi: true },
    { t: "15:00", l: "Match 3", s: `${GROUP} · round robin`, hi: true },
    { t: finalTime, l: "Grand Final", s: `${FINAL} · top 2 only`, gold: true },
  ];

  /** "Bo1" alone means nothing to a first-timer; the spelled-out half says it. */
  const spelled = (n: number) => `best of ${n}`;

  return (
    <>
      {/* ── the draw (solo only) ── */}
      {/* B_SOLO directly, not B: the draw beat exists on that timeline only,
          and this branch is the solo one by construction. */}
      {!teamMode && (() => {
        const bDraw = beat(frame, B_SOLO.draw[0], B_SOLO.draw[1], 13);
        const DRAW_AT = B_SOLO.draw[0] + 22;
        const colW = 600 / teamCount;
        const seatX = (k: number) => 60 + (k % teamCount) * colW + colW / 2;
        const seatY = (k: number) => 408 + Math.floor(k / teamCount) * 42;
        const youIdx = 1 + teamCount * 2;          // team B, third seat dealt
        const cardsIn = interpolate(frame, [DRAW_AT - 14, DRAW_AT + 2], [0, 1], { ...clamp, easing: EASE });
        const seated = interpolate(frame, [DRAW_AT + totalSlots * 2 + 16, DRAW_AT + totalSlots * 2 + 32], [0, 1], clamp);
        return (
          <AbsoluteFill style={bDraw}>
            <div style={{ position: "absolute", left: 58, right: 58, top: 176 }}>
              <div style={{ fontSize: 15, letterSpacing: ".18em", color: T.acc, fontWeight: 800 }}>TOURNAMENT DAY · 10:45</div>
              <div style={{ fontSize: 42, fontWeight: 800, color: "#fff", letterSpacing: "-.02em", lineHeight: 1.1, marginTop: 10 }}>
                Teams are drawn<br />at random
              </div>
            </div>

            {/* team cards — the targets the dots fly into */}
            {Array.from({ length: teamCount }).map((_, ti) => (
              <div key={ti} style={{
                position: "absolute", left: 60 + ti * colW + 5, width: colW - 10, top: 366, height: 236,
                borderRadius: 15, background: TEAM_NAMES[ti] === YOU ? T.soft : "rgba(15,17,19,.9)",
                border: `1px solid ${TEAM_NAMES[ti] === YOU ? T.line : "#1c1e21"}`,
                opacity: cardsIn, transform: `scale(${0.96 + cardsIn * 0.04})`,
              }}>
                <div style={{
                  fontSize: 13, letterSpacing: ".1em", fontWeight: 800, textAlign: "center", marginTop: 11,
                  color: TEAM_NAMES[ti] === YOU ? T.acc : "#6a6a6a",
                }}>TEAM {TEAM_NAMES[ti]}</div>
              </div>
            ))}

            {/* ONE set of dots — pool → seat, staggered, lifting through the arc */}
            {Array.from({ length: totalSlots }).map((_, k) => {
              const start = DRAW_AT + k * 2;
              const t = interpolate(frame, [start, start + 20], [0, 1], { ...clamp, easing: EASE });
              const jitter = t < 0.02 ? Math.sin((frame + k * 9) / 6) * 7 : 0;
              const x = POOL_X(k) + (seatX(k) - POOL_X(k)) * t + jitter;
              const y = POOL_Y(k) + (seatY(k) - POOL_Y(k)) * t - Math.sin(t * Math.PI) * 26;
              const you = k === youIdx;
              const dot = you ? 30 : 25;
              return (
                <div key={k} style={{
                  position: "absolute", left: x - dot / 2, top: y - dot / 2, width: dot, height: dot,
                  borderRadius: "50%", background: you ? T.acc : "#20242a",
                  border: you ? `2px solid ${T.acc}` : "1px solid #2a2e34",
                  boxShadow: you ? `0 0 18px ${T.glow}` : t > 0.9 ? "0 2px 8px rgba(0,0,0,.5)" : "none",
                  transform: `scale(${t > 0.01 && t < 0.99 ? 1.14 : 1})`,
                }} />
              );
            })}

            <div style={{ position: "absolute", left: 58, right: 58, top: 628, fontSize: 20, color: "#8d8d8d", opacity: seated }}>
              {teamCount} teams of 5 — <span style={{ color: T.acc, fontWeight: 700 }}>you&apos;re in Team {YOU}</span>.
            </div>
          </AbsoluteFill>
        );
      })()}

      {/* ── the day, hour by hour ── */}
      <AbsoluteFill style={{ padding: "146px 54px 182px", justifyContent: "center", gap: 12, ...bDay }}>
        <div style={{ fontSize: 15, letterSpacing: ".18em", color: T.acc, fontWeight: 800 }}>SUNDAY · THE WHOLE DAY</div>
        <div style={{ fontSize: 38, fontWeight: 800, color: "#fff", letterSpacing: "-.02em", lineHeight: 1.1 }}>
          One day, start<br />to finish
        </div>

        {/* The whole format in one line, before any detail. Two stages and
            nothing else — no semis, no lower bracket. */}
        <div style={{
          display: "flex", alignItems: "stretch", gap: 10, marginTop: 4,
          opacity: interpolate(frame, [B.day[0] + 8, B.day[0] + 20], [0, 1], clamp),
          transform: `translateY(${interpolate(frame, [B.day[0] + 8, B.day[0] + 20], [10, 0], { ...clamp, easing: EASE })}px)`,
        }}>
          <div style={{ flex: 1, padding: "11px 14px", borderRadius: 12, background: T.soft, border: `1px solid ${T.line}` }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>Round robin · <span style={{ color: T.acc }}>{GROUP}</span></div>
            <div style={{ fontSize: 13, color: "#8d8d8d", marginTop: 2 }}>{spelled(groupBo)} · everyone plays everyone</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", color: "#5a5a5a", fontSize: 22, fontWeight: 800 }}>→</div>
          <div style={{ flex: 1, padding: "11px 14px", borderRadius: 12, background: "rgba(251,191,36,.07)", border: "1px solid rgba(251,191,36,.35)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>Grand Final · <span style={{ color: "#fbbf24" }}>{FINAL}</span></div>
            <div style={{ fontSize: 13, color: "#9a8a5a", marginTop: 2 }}>{spelled(finalBo)} · top 2 only</div>
          </div>
        </div>

        <div style={{ position: "relative", marginTop: 8 }}>
          {/* the spine the day runs down */}
          <div style={{
            position: "absolute", left: 7, top: 8, bottom: 8, width: 2, background: "#1e2126",
          }} />
          <div style={{
            position: "absolute", left: 7, top: 8, width: 2, background: T.acc,
            height: `${interpolate(frame, [B.day[0] + 20, B.day[0] + 108], [0, 100], clamp)}%`,
            boxShadow: `0 0 10px ${T.glow}`,
          }} />

          {DAY_ROWS.map((r, i) => {
            // Team mode has one fewer row but a shorter beat, so the stagger
            // tightens to leave the finished timeline on screen, not mid-build.
            const at = B.day[0] + (teamMode ? 20 : 24) + i * (teamMode ? 13 : 15);
            const a = interpolate(frame, [at, at + 12], [0, 1], { ...clamp, easing: EASE });
            return (
              <div key={r.t} style={{
                position: "relative", display: "flex", alignItems: "center", gap: 15, padding: "9px 0 9px 26px",
                opacity: a, transform: `translateX(${(1 - a) * -12}px)`,
              }}>
                {/* node on the spine — positioned against its own row, or all
                    of them would collapse onto the wrapper's origin */}
                <div style={{
                  position: "absolute", left: 0, top: "50%", marginTop: -8, width: 16, height: 16, borderRadius: "50%",
                  background: r.gold ? "#fbbf24" : r.hi ? T.acc : "#2a2e34",
                  border: `2px solid ${r.gold ? "#fbbf24" : r.hi ? T.acc : "#33383f"}`,
                  boxShadow: r.gold ? "0 0 12px rgba(251,191,36,.5)" : r.hi ? `0 0 12px ${T.glow}` : "none",
                }} />
                <span style={{ fontSize: 19, fontWeight: 800, width: 78, color: r.gold ? "#fbbf24" : r.hi ? T.acc : "#7a7a7a" }}>{r.t}</span>
                <span style={{ fontSize: 19, fontWeight: 700, color: "#fff", flex: 1 }}>{r.l}</span>
                <span style={{ fontSize: 14, color: r.gold ? "#fbbf24" : "#7d7d7d" }}>{r.s}</span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>

      {/* ── your day, from your side ── */}
      <AbsoluteFill style={{ padding: "150px 56px 186px", justifyContent: "center", gap: 13, ...bMine }}>
        <div style={{ fontSize: 15, letterSpacing: ".18em", color: T.acc, fontWeight: 800 }}>YOUR DAY</div>
        <div style={{ fontSize: 44, fontWeight: 800, color: "#fff", letterSpacing: "-.025em", lineHeight: 1.08 }}>
          You play 3 matches.<br /><span style={{ color: T.acc }}>Guaranteed.</span>
        </div>
        <div style={{ fontSize: 18, color: "#8d8d8d", lineHeight: 1.5 }}>
          {teamMode
            ? `${MY_TEAM} plays every other team once. A loss doesn't send you home.`
            : "One against every other team. A loss doesn't send you home."}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 4 }}>
          {MY_MATCHES.map((m, i) => {
            const at = B.mine[0] + 32 + i * 18;
            const a = interpolate(frame, [at, at + 12], [0, 1], { ...clamp, easing: EASE });
            return (
              <div key={m.time} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "15px 18px", borderRadius: 14,
                background: T.soft, border: `1px solid ${T.line}`,
                opacity: a, transform: `translateX(${(1 - a) * -14}px)`,
              }}>
                <span style={{ fontSize: 19, fontWeight: 800, color: T.acc, width: 74 }}>{m.time}</span>
                <span style={{ fontSize: 19, color: "#fff", fontWeight: 700, flex: 1 }}>vs {label(m.vs)}</span>
                <span style={{ fontSize: 15, color: "#8d8d8d" }}>{GROUP}</span>
              </div>
            );
          })}

          {/* the fourth, conditional on finishing top two */}
          <div style={{
            display: "flex", alignItems: "center", gap: 14, padding: "15px 18px", borderRadius: 14,
            background: "rgba(251,191,36,.07)", border: "1px dashed rgba(251,191,36,.4)",
            opacity: interpolate(frame, [B.mine[0] + 92, B.mine[0] + 106], [0, 1], { ...clamp, easing: EASE }),
            transform: `translateY(${interpolate(frame, [B.mine[0] + 92, B.mine[0] + 106], [12, 0], { ...clamp, easing: EASE })}px)`,
          }}>
            <span style={{ fontSize: 19, fontWeight: 800, color: "#fbbf24", width: 74 }}>{finalTime}</span>
            <span style={{ fontSize: 19, color: "#fff", fontWeight: 700, flex: 1 }}>Grand Final</span>
            <span style={{ fontSize: 15, color: "#fbbf24" }}>{FINAL} · if top 2</span>
          </div>
        </div>

        <div style={{ fontSize: 19, color: "#fff", marginTop: 2, opacity: interpolate(frame, [B.mine[0] + 112, B.mine[0] + 126], [0, 1], clamp) }}>
          {/* Three group fixtures of groupBo maps each, plus up to finalBo. */}
          <b>{3 * groupBo} maps minimum.</b> <span style={{ color: "#8d8d8d" }}>Up to {3 * groupBo + finalBo} if you reach the final.</span>
        </div>
      </AbsoluteFill>

      {/* ── standings ── */}
      <AbsoluteFill style={{ padding: "150px 56px 186px", justifyContent: "center", gap: 15, ...bStand }}>
        <div style={{ fontSize: 15, letterSpacing: ".18em", color: T.acc, fontWeight: 800 }}>HOW YOU QUALIFY</div>
        <div style={{ fontSize: 34, fontWeight: 800, color: "#fff", letterSpacing: "-.02em" }}>Top two make the final</div>
        <div style={{ background: "#0f1113", border: "1px solid #1c1e21", borderRadius: 18, padding: 18 }}>
          <div style={{ display: "flex", fontSize: 14, color: "#6a6a6a", fontWeight: 700, letterSpacing: ".08em", paddingBottom: 8 }}>
            <span style={{ flex: 1 }}>TEAM</span><span style={{ width: 64, textAlign: "right" }}>PTS</span><span style={{ width: 92, textAlign: "right" }}>RW−RL</span>
          </div>
          {STANDINGS.map((s, i) => {
            const at = B.stand[0] + 14 + i * 8;
            const a = interpolate(frame, [at, at + 9], [0, 1], clamp);
            return (
              <div key={s.t} style={{
                display: "flex", alignItems: "center", padding: "11px 0", borderTop: "1px solid #191b1e",
                opacity: a, transform: `translateX(${(1 - a) * -12}px)`,
              }}>
                <span style={{ flex: 1, fontSize: teamMode ? 20 : 22, fontWeight: 800, color: s.t === YOU ? T.acc : i < 2 ? "#fff" : "#7f7f7f" }}>
                  {i + 1}. {label(s.t)}{s.t === YOU ? "  ← you" : ""}
                </span>
                <span style={{ width: 64, textAlign: "right", fontSize: 21, fontWeight: 800, color: "#fff" }}>{s.p}</span>
                <span style={{ width: 92, textAlign: "right", fontSize: 19, color: s.rd >= 0 ? "#6fcf8a" : "#c86a6a" }}>{s.rd > 0 ? `+${s.rd}` : s.rd}</span>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 16, color: "#8d8d8d" }}>
          {groupBo === 1 ? "Each match won is a point." : "Each map won is a point."} Level? <b style={{ color: "#fff" }}>RW−RL</b>, then <b style={{ color: "#fff" }}>K−D</b>.
        </div>

        {/* No bracket, no semis — the top two go straight to one final. Saying
            so explicitly stops people assuming a longer play-off run. */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 13, marginTop: 4,
          padding: "16px 18px", borderRadius: 15,
          background: "rgba(251,191,36,.07)", border: "1px solid rgba(251,191,36,.35)",
          opacity: interpolate(frame, [B.stand[0] + 56, B.stand[0] + 70], [0, 1], { ...clamp, easing: EASE }),
          transform: `scale(${interpolate(frame, [B.stand[0] + 56, B.stand[0] + 70], [0.96, 1], { ...clamp, easing: EASE })})`,
        }}>
          <span style={{ fontSize: teamMode ? 19 : 30, fontWeight: 800, color: T.acc }}>{label(STANDINGS[0].t)}</span>
          <span style={{ fontSize: 16, color: "#8d8d8d" }}>vs</span>
          <span style={{ fontSize: teamMode ? 19 : 30, fontWeight: 800, color: "#fff" }}>{label(STANDINGS[1].t)}</span>
          <div style={{ width: 1, height: 30, background: "rgba(251,191,36,.3)" }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fbbf24" }}>{finalTime} GRAND FINAL</div>
            <div style={{ fontSize: 13, color: "#9a8a5a" }}>{FINAL} ({spelled(finalBo)}) — that&apos;s the whole play-off</div>
          </div>
        </div>
      </AbsoluteFill>

      {/* ── close ── */}
      <AbsoluteFill style={{ padding: "150px 56px 186px", justifyContent: "center", alignItems: "center", gap: 16, textAlign: "center", ...bCta }}>
        <div style={{ fontSize: teamMode ? 46 : 52, fontWeight: 800, color: "#fff", letterSpacing: "-.025em", lineHeight: 1.06 }}>
          {teamMode
            ? <>{teamCount} team slots.<br />₹{Number(entryFee).toLocaleString("en-IN")} per team.</>
            : <>{totalSlots} slots.<br />₹{entryFee}.</>}
        </div>
        <div style={{ fontSize: 21, color: "#8d8d8d" }}>{dateLabel} · ₹{prizePool} prize pool</div>
        <div style={{ fontSize: 18, color: "#fff", fontWeight: 700 }}>
          Round robin <span style={{ color: T.acc }}>{GROUP}</span> → Grand Final <span style={{ color: "#fbbf24" }}>{FINAL}</span>
        </div>
        {teamMode && <div style={{ fontSize: 17, color: "#7a7a7a" }}>Create a team, or join one with a code.</div>}
        <div style={{
          marginTop: 6, padding: "18px 44px", borderRadius: 100, fontSize: 26, fontWeight: 800,
          color: T.ctaFg, background: `linear-gradient(180deg, ${T.acc}, ${T.acc2})`, boxShadow: `0 12px 44px ${T.glow}`,
        }}>Register →</div>
      </AbsoluteFill>
    </>
  );
};

export default TournamentExplainer;
