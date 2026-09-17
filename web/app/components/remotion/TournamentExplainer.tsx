"use client";

/**
 * Tournament explainer — a product demo, not a slide deck.
 *
 * LOOK. Light and loud: a cream page, ink outlines, hard offset shadows,
 * sticker labels and highlighter marks. It sits inside a dark tournament page,
 * so it reads as the one playful object on it, and it stays legible at phone
 * width where thin grey-on-black type did not.
 *
 * LAYOUT. Three fixed zones, the same in every beat:
 *
 *   header  (top 96)   sticker eyebrow + headline. ONE slot, handed from beat
 *                      to beat in place, so the question being answered is
 *                      always at the top and never drifts with the content.
 *   body    (top 290)  the app card during sign-up, then the match-day panels.
 *   footer             progress bar.
 *
 * CURSOR. Buttons the cursor presses are anchored to the bottom of the app card
 * rather than flowing after the content, so every click lands on a known y
 * (BTN_Y / BTN2_Y) whatever the copy above it does. The old centred layout
 * needed a hand-tuned y per screen, and silently missed when copy changed.
 *
 * TWO REGISTRATION MODES, and the film must match the one the tournament is
 * actually running:
 *
 *   solo  (CS2, and Valorant before 14 Sep 2026)
 *       pay per player, then teams are drawn at random on the day. The entry is
 *       refundable, so the film shows the Withdraw affordance.
 *
 *   team  (`registrationMode: "team"` — League of Rising Stars: Horizon)
 *       details FIRST, then the captain names a team and pays once for all
 *       five; a 6-character code is issued and teammates join free with it.
 *       No random draw, no refund path (api/valorant/team/leave: a teammate may
 *       leave, a captain may not), so neither is shown.
 *
 * The group-stage and final best-of come from the tournament (matchesPerRound,
 * grandFinalBestOf) so the film cannot promise a format the fixtures don't use.
 *
 * 900 frames @ 30fps.
 */

import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { GAME_THEME, type GameKey } from "@/app/lib/gameTheme";
import {
  type Theme, type HeaderSpec,
  INK, PAPER, CARD, BODY, MUTED, LILAC, LEMON, PINK, MINT, GOLD, OK_TEXT, BAD_TEXT, FONT,
  PAD_X, BODY_TOP, clamp, EASE, BOUNCE, beat,
  Backdrop, TopBar, ProgressBar, HeaderSlot, Sticker, Mark,
} from "./kit";

export type RegistrationMode = "solo" | "team";

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

// Palette, header slot and the shared pieces live in ./kit — the perks film
// beside this one uses the same set.

// ── layout ─────────────────────────────────────────────────────────────────
const DUR = 900;
const CARD_H = 490;
const BAR_H = 34;
/** Arrow over the label of a button anchored 24px off the card's bottom. */
const BTN_Y = 716;
/** Arrow over the upper of two stacked anchored buttons. */
const BTN2_Y = 638;
const BTN_H = 64;

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

// ── beat boundaries ────────────────────────────────────────────────────────
// Two timelines, both landing on 910. Team mode spends the frames the random
// draw used to occupy on the code being issued and a teammate redeeming it.
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
  tournamentName = "HORIZON - ROUND 1",
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

  // The body floats; the header does not — it is the fixed point of the film.
  const float = Math.sin(frame / 45) * 3;

  // Team mode parks the pointer off-frame across the details beat (frames
  // 134–186): nothing to click there, and a still cursor reads as a frozen render.
  const CLICKS = teamMode ? [48, 100, 218, 292] : [52, 106, 178];
  const CURSOR_OUT = teamMode ? 352 : 240;
  const cx = teamMode
    ? track(frame, [[0, 880], [20, 470], [42, 360], [48, 360], [58, 430], [90, 360], [100, 360], [112, 520], [134, 880], [186, 880], [198, 420], [212, 360], [218, 360], [228, 430], [272, 390], [286, 360], [292, 360], [302, 470], [348, 880]], EASE_IO)
    : track(frame, [[0, 880], [22, 470], [44, 360], [52, 360], [64, 430], [96, 360], [106, 360], [118, 440], [162, 360], [178, 360], [196, 480], [236, 880]], EASE_IO);
  const cy = teamMode
    ? track(frame, [[0, 1050], [20, 800], [42, BTN_Y], [48, BTN_Y], [58, 770], [90, BTN_Y], [100, BTN_Y], [112, 800], [134, 1050], [186, 1050], [198, 690], [212, BTN2_Y], [218, BTN2_Y], [228, 690], [272, 770], [286, BTN_Y], [292, BTN_Y], [302, 800], [348, 1050]], EASE_IO)
    : track(frame, [[0, 1050], [22, 800], [44, BTN_Y], [52, BTN_Y], [64, 770], [96, BTN_Y], [106, BTN_Y], [118, 780], [162, BTN_Y], [178, BTN_Y], [196, 800], [236, 1050]], EASE_IO);
  const pressed = CLICKS.some(c => frame >= c && frame < c + 7);

  const productEnd = teamMode ? B_TEAM.join[1] : B_SOLO.reg[1];
  const productPhase = frame < productEnd + 6;
  const payuWin = teamMode ? B_TEAM.payu : B_SOLO.payu;
  const onPayu = frame >= payuWin[0] + 4 && frame < payuWin[1] - 4;

  const headers = (teamMode ? teamHeaders : soloHeaders)({
    T, tournamentName, dateLabel, prizePool, entryFee, totalSlots, teams,
  });

  return (
    <AbsoluteFill style={{ background: PAPER, fontFamily: FONT, color: INK, overflow: "hidden" }}>
      <Backdrop frame={frame} T={T} />
      <TopBar frame={frame} T={T} label={T.label} />
      {/* the header slot — every beat's title, always here */}
      <HeaderSlot frame={frame} specs={headers} />

      {/* body */}
      <AbsoluteFill style={{ transform: `translateY(${float}px)` }}>
        {productPhase && (
          <div style={{
            position: "absolute", left: PAD_X, right: PAD_X, top: BODY_TOP, height: CARD_H, boxSizing: "border-box",
            background: CARD, border: `3px solid ${INK}`, borderRadius: 26, boxShadow: `8px 8px 0 ${INK}`,
            overflow: "hidden", opacity: win(frame, -10, productEnd + 4, 14),
          }}>
            <BrowserBar url={onPayu ? "secure.payu.in" : "iesports.in"} />
            {teamMode ? (
              <TeamSignup frame={frame} T={T} prizePool={prizePool} entryFee={entryFee} teamSize={size} totalTeams={teams} />
            ) : (
              <SoloSignup frame={frame} T={T} prizePool={prizePool} entryFee={entryFee} totalSlots={totalSlots} deadlineLabel={deadlineLabel} />
            )}
          </div>
        )}

        {!productPhase && (
          <MatchDay frame={frame} T={T} teamCount={teams} totalSlots={totalSlots} teamMode={teamMode}
            groupBo={groupBestOf} finalBo={finalBestOf}
            finalTime={finalTime} entryFee={entryFee} dateLabel={dateLabel} />
        )}

        {frame <= CURSOR_OUT && (
          <div style={{
            position: "absolute", left: 0, top: 0, zIndex: 20,
            transform: `translate(${cx}px, ${cy}px) scale(${pressed ? 0.84 : 1})`,
            opacity: interpolate(frame, [0, 14, CURSOR_OUT - 16, CURSOR_OUT - 2], [0, 1, 1, 0], clamp),
          }}>
            {CLICKS.map(c => {
              const t = frame - c;
              if (t < 0 || t > 22) return null;
              return <div key={c} style={{
                position: "absolute", left: -24, top: -24, width: 48, height: 48, borderRadius: "50%",
                border: `3px solid ${INK}`, transform: `scale(${interpolate(t, [0, 22], [0.3, 2.4], clamp)})`,
                opacity: interpolate(t, [0, 22], [0.9, 0], clamp),
              }} />;
            })}
            <svg width="32" height="36" viewBox="0 0 30 34" fill="none" style={{ filter: `drop-shadow(3px 3px 0 ${INK})` }}>
              <path d="M2 2L2 26L8.5 20.5L13 30L17.5 28L13 18.5L21 18L2 2Z" fill="#fff" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </AbsoluteFill>

      <ProgressBar frame={frame} dur={DUR} T={T} />
    </AbsoluteFill>
  );
};

// ── headers ────────────────────────────────────────────────────────────────
// Titles render at kit's HEADER_SIZE (60) and must stay within two lines of the
// slot, so anything near 18 characters carries an explicit <br />.

type HeaderArgs = {
  T: Theme; tournamentName: string; dateLabel: string; prizePool: string;
  entryFee: number; totalSlots: number; teams: number;
};

/** Series name, then the event's own name on its own marked line — letting it
 *  wrap freely stranded the "·" separator at the end of line one. */
const nameTitle = (name: string, c: string) => {
  const parts = name.split(/ - /);
  return parts.length > 1
    ? <>{parts.slice(0, -1).join(" · ")}<br /><Mark c={c}>{parts[parts.length - 1]}</Mark></>
    : <>{name}</>;
};

/** Beats after sign-up read the same in both cuts. */
const matchDayHeaders = (B: typeof B_SOLO | typeof B_TEAM, { T, dateLabel }: HeaderArgs): HeaderSpec[] => {
  const weekday = (dateLabel.split(" ")[0] || "MATCH DAY").toUpperCase();
  return [
    { a: B.day[0], b: B.day[1], eyebrow: `${weekday} · THE WHOLE DAY`, bg: LEMON, title: <>One day,<br /><Mark c={T.acc}>start to finish</Mark></> },
    { a: B.mine[0], b: B.mine[1], eyebrow: "YOUR DAY · 3 MATCHES", bg: LILAC, title: <>3 matches.<br /><Mark c={T.acc}>Guaranteed.</Mark></> },
    { a: B.stand[0], b: B.stand[1], eyebrow: "HOW YOU QUALIFY", bg: MINT, title: <><Mark c={T.acc}>Top two</Mark><br />make the final</> },
  ];
};

function soloHeaders(args: HeaderArgs): HeaderSpec[] {
  const { T, tournamentName, dateLabel, entryFee, totalSlots, prizePool } = args;
  const B = B_SOLO;
  const M = (s: React.ReactNode) => <Mark c={T.acc}>{s}</Mark>;
  return [
    { a: B.hero[0], b: B.hero[1], eyebrow: dateLabel || "TOURNAMENT", bg: LEMON, title: nameTitle(tournamentName, T.acc), size: tournamentName.length > 20 ? 48 : 60 },
    { a: B.discord[0], b: B.discord[1], eyebrow: "STEP 1 OF 3", bg: LILAC, title: <>Connect {M("Discord")}</> },
    { a: B.pay[0], b: B.pay[1], eyebrow: "STEP 2 OF 3 · SLOT HELD", bg: LEMON, title: <>Claim your {M("slot")}</> },
    { a: B.payu[0], b: B.payu[1], eyebrow: "PAYU · SECURE", bg: LILAC, title: <>Paying {M(`₹${inr(entryFee)}`)}</> },
    { a: B.setup[0], b: B.setup[1], eyebrow: `✓ SLOT PAID · ₹${inr(entryFee)}`, bg: MINT, title: <>Finish {M("setup")}</> },
    { a: B.done[0], b: B.done[1], eyebrow: "ALL SET", bg: MINT, title: <>You&apos;re {M("in")}</> },
    { a: B.reg[0], b: B.reg[1], eyebrow: "YOUR SLOT", bg: LILAC, title: <>Your slot,<br />{M("refundable")}</> },
    { a: B.draw[0], b: B.draw[1], eyebrow: "TOURNAMENT DAY · 10:45", bg: PINK, title: <>Teams are drawn<br />{M("at random")}</> },
    ...matchDayHeaders(B, args),
    { a: B.cta[0], b: B.cta[1], eyebrow: `₹${prizePool} PRIZE POOL`, bg: PINK, title: <>{totalSlots} slots.<br />{M(`₹${inr(entryFee)} each.`)}</> },
  ];
}

function teamHeaders(args: HeaderArgs): HeaderSpec[] {
  const { T, tournamentName, dateLabel, entryFee, teams, prizePool } = args;
  const B = B_TEAM;
  const M = (s: React.ReactNode) => <Mark c={T.acc}>{s}</Mark>;
  return [
    { a: B.hero[0], b: B.hero[1], eyebrow: dateLabel || "TOURNAMENT", bg: LEMON, title: nameTitle(tournamentName, T.acc), size: tournamentName.length > 20 ? 48 : 60 },
    { a: B.discord[0], b: B.discord[1], eyebrow: "STEP 1 OF 2", bg: LILAC, title: <>Connect {M("Discord")}</> },
    { a: B.setup[0], b: B.setup[1], eyebrow: "STEP 2 OF 2", bg: MINT, title: <>Your {M("details")}</> },
    { a: B.choice[0], b: B.choice[1], eyebrow: `TEAM ENTRY · ${teams} TEAM SLOTS`, bg: PINK, title: <>Enter as a {M("team")}</> },
    { a: B.create[0], b: B.create[1], eyebrow: "YOU'RE THE CAPTAIN", bg: LEMON, title: <>Create your {M("team")}</> },
    { a: B.payu[0], b: B.payu[1], eyebrow: "PAYU · SECURE", bg: LILAC, title: <>Paying {M(`₹${inr(entryFee)}`)}</> },
    { a: B.code[0], b: B.code[1], eyebrow: "✓ TEAM REGISTERED", bg: MINT, title: <>Share your<br />{M("team code")}</> },
    { a: B.join[0], b: B.join[1], eyebrow: "ON YOUR TEAMMATE'S PHONE", bg: PINK, title: <>Join with<br />the {M("code")}</> },
    ...matchDayHeaders(B, args),
    { a: B.cta[0], b: B.cta[1], eyebrow: `₹${prizePool} PRIZE POOL`, bg: PINK, title: <>{teams} team slots.<br />{M(`₹${inr(entryFee)} per team.`)}</> },
  ];
}

// ── sign-up, per player (solo mode) ────────────────────────────────────────

const SoloSignup: React.FC<{ frame: number; T: Theme; prizePool: string; entryFee: number; totalSlots: number; deadlineLabel: string }> = ({
  frame, T, prizePool, entryFee, totalSlots, deadlineLabel,
}) => {
  const B = B_SOLO;
  return (
    <>
      <Screen o={win(frame, B.hero[0], B.hero[1], 12)}>
        <StatRow frame={frame} at={0} stats={[["PRIZE", `₹${prizePool}`, LEMON], ["SLOTS", String(totalSlots), LILAC], ["ENTRY", `₹${inr(entryFee)}`, MINT]]} />
        <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          <Pill>5v5</Pill><Pill bg={T.soft}>Solo entry</Pill><Pill>{totalSlots} slots</Pill>
        </div>
        <Text mt={16}>Sign up alone — you&apos;re drawn into a team on the day.</Text>
        <Button T={T} frame={frame} hoverAt={36} clickAt={52} label="Register →" />
      </Screen>

      <Screen o={win(frame, B.discord[0], B.discord[1], 12)}>
        <DiscordBody frame={frame} at={B.discord[0]} />
        <Button T={T} frame={frame} hoverAt={90} clickAt={106} label="Continue with Discord" bg="#5865F2" fg="#fff" />
      </Screen>

      <Screen o={win(frame, B.pay[0], B.pay[1], 12)}>
        <Counter frame={frame} from={148} to={172} value={entryFee} />
        <Text mt={8}>UPI or Net Banking through PayU.</Text>
        <div style={{ marginTop: 16 }}><Sticker bg={MINT} rot={-2} size={14}>Fully refundable before registration closes</Sticker></div>
        <Button T={T} frame={frame} hoverAt={162} clickAt={178} label={`Pay ₹${inr(entryFee)}`} />
      </Screen>

      <PayuSheet frame={frame} o={win(frame, B.payu[0], B.payu[1], 10)} slideFrom={192} spinUntil={224} amount={entryFee} />

      <Screen o={win(frame, B.setup[0], B.setup[1], 12)}>
        <Progress frame={frame} from={240} to={286} T={T} />
        <Row done={frame > 248} label="Your name" value="saved" delay={248} frame={frame} />
        <Row done={frame > 262} label="Phone" value="verified" delay={262} frame={frame} />
        <Row done={frame > 276} label="Riot ID" value="linked" delay={276} frame={frame} />
      </Screen>

      <Screen o={win(frame, B.done[0], B.done[1], 12)}>
        <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
          <Pop frame={frame} at={296}>
            <div style={{ width: 120, height: 120, borderRadius: "50%", background: GOLD, border: `3px solid ${INK}`, boxShadow: `5px 5px 0 ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 60 }}>🏆</div>
          </Pop>
          <Text center>Everything from here happens on Discord.</Text>
        </div>
      </Screen>

      {/* Seeing Withdraw next to Registered is what tells a first-timer the
          money is not a trapdoor. Solo only — team entries have no refund path. */}
      <Screen o={win(frame, B.reg[0], B.reg[1], 12)}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, transform: `translateY(${interpolate(frame, [332, 346], [14, 0], { ...clamp, easing: EASE })}px)` }}>
          <ChipBtn bg={MINT} grow={false}>✓ Registered</ChipBtn>
          <ChipBtn bg={CARD} grow={false}>Withdraw</ChipBtn>
        </div>
        <div style={{ borderTop: `2.5px dashed ${INK}`, margin: "20px 0 14px" }} />
        <KV k="Paid" v={`₹${inr(entryFee)}`} />
        <KV k="Slot held until" v={deadlineLabel} mt={10} />
        <div style={{ fontSize: 17, fontWeight: 700, color: OK_TEXT, marginTop: 18, lineHeight: 1.45, opacity: interpolate(frame, [356, 370], [0, 1], clamp) }}>
          Changed your mind? Withdraw before registration closes — full ₹{inr(entryFee)} back.
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
 * one switches to the teammate's phone — same card, relabelled — because the
 * question the format raises is "so what do the other four do?".
 */
const TeamSignup: React.FC<{ frame: number; T: Theme; prizePool: string; entryFee: number; teamSize: number; totalTeams: number }> = ({
  frame, T, prizePool, entryFee, teamSize, totalTeams,
}) => {
  const B = B_TEAM;
  const name = typed(frame, MY_TEAM, 250, 276);
  const nameCaret = frame < 280 && Math.floor(frame / 8) % 2 === 0;

  // The roster assembling once the code is redeemed: captain, then each joiner.
  // It reaches 5/5 with frames to spare — a payoff landing inside the beat's
  // own fade-out is a payoff not landing.
  const JOIN_AT = 464;
  const joined = Math.min(ROSTER.length, 1 + Math.max(0, Math.floor(interpolate(frame, [JOIN_AT, JOIN_AT + 22], [0, ROSTER.length - 1], clamp))));
  const full = joined >= teamSize;
  const copied = frame > 396;

  return (
    <>
      <Screen o={win(frame, B.hero[0], B.hero[1], 12)}>
        <StatRow frame={frame} at={0} stats={[["PRIZE", `₹${prizePool}`, LEMON], ["TEAMS", String(totalTeams), LILAC], ["PER TEAM", `₹${inr(entryFee)}`, MINT]]} />
        <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          <Pill>{teamSize}v{teamSize}</Pill><Pill bg={T.soft}>Team entry</Pill><Pill>{totalTeams} teams</Pill>
        </div>
        <Text mt={16}>Bring your own five — the captain pays once, teammates join free.</Text>
        <Button T={T} frame={frame} hoverAt={32} clickAt={48} label="Register →" />
      </Screen>

      <Screen o={win(frame, B.discord[0], B.discord[1], 12)}>
        <DiscordBody frame={frame} at={B.discord[0]} />
        <Button T={T} frame={frame} hoverAt={84} clickAt={100} label="Continue with Discord" bg="#5865F2" fg="#fff" />
      </Screen>

      {/* Details BEFORE the money — the team and its code are created the
          instant the captain's payment settles, and seating them as player one
          needs a Riot ID. */}
      <Screen o={win(frame, B.setup[0], B.setup[1], 12)}>
        <Progress frame={frame} from={126} to={176} T={T} />
        <Row done={frame > 136} label="Your name" value="saved" delay={136} frame={frame} />
        <Row done={frame > 150} label="Phone" value="verified" delay={150} frame={frame} />
        <Row done={frame > 164} label="Riot ID" value="linked" delay={164} frame={frame} />
      </Screen>

      {/* The fork. Nobody is shuffled into a team: you make one or join one. */}
      <Screen o={win(frame, B.choice[0], B.choice[1], 12)}>
        <Text>
          <b style={{ color: INK }}>₹{inr(entryFee)} per team of {teamSize}.</b> The captain names the team and pays once, then shares a code. Teammates join <b style={{ color: INK }}>free</b>.
        </Text>
        <SquadDots frame={frame} at={B.choice[0] + 8} T={T} size={teamSize} />
        <Button T={T} frame={frame} hoverAt={204} clickAt={218} label="Create a team" bottom={24 + BTN_H + 14} />
        <Button T={T} frame={frame} label="I have a team code" bg={CARD} />
      </Screen>

      <Screen o={win(frame, B.create[0], B.create[1], 12)}>
        <Label>TEAM NAME</Label>
        <Field value={name} caret={nameCaret} placeholder="Team name" />
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 20 }}>
          <div style={{ fontSize: 60, fontWeight: 900, lineHeight: 0.95, letterSpacing: "-.04em" }}>₹{inr(entryFee)}</div>
          <Sticker bg={MINT} rot={-5} size={13}>covers all {teamSize}</Sticker>
        </div>
        <Text mt={12} size={16}>Teammates join free. UPI or Net Banking through PayU.</Text>
        <Button T={T} frame={frame} hoverAt={278} clickAt={292} label={`Pay ₹${inr(entryFee)}`} />
      </Screen>

      <PayuSheet frame={frame} o={win(frame, B.payu[0], B.payu[1], 10)} slideFrom={306} spinUntil={336} amount={entryFee} />

      {/* The code, the moment it exists. */}
      <Screen o={win(frame, B.code[0], B.code[1], 12)}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: ".01em" }}>{MY_TEAM}</div>
          <Sticker bg={MINT} rot={3} size={13}>1/{teamSize} players</Sticker>
        </div>
        <Text mt={4} size={16}>Send the code to the {teamSize - 1} still missing.</Text>
        <div style={{
          marginTop: 14, padding: "14px 12px", borderRadius: 18, background: LEMON, border: `3px dashed ${INK}`, textAlign: "center",
          opacity: interpolate(frame, [356, 370], [0, 1], clamp),
          transform: `rotate(-1.2deg) scale(${interpolate(frame, [356, 372], [0.85, 1], { ...clamp, easing: BOUNCE })})`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".18em" }}>TEAM CODE</div>
          {/* textIndent cancels the trailing letter-space, which otherwise parks
              a widely-tracked string half a space left of centre. */}
          <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: ".2em", textIndent: ".2em", lineHeight: 1.1, minHeight: 57, marginTop: 2 }}>
            {typed(frame, DEMO_CODE, 364, 382)}
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: copied ? OK_TEXT : BODY }}>{copied ? "✓ Copied" : "Tap to copy"}</div>
        </div>
        <div style={{ fontSize: 14, color: MUTED, fontWeight: 600, marginTop: 12, textAlign: "center", opacity: interpolate(frame, [402, 414], [0, 1], clamp) }}>
          It&apos;s in your Discord DMs too. Only the team can see it.
        </div>
        <div style={{ position: "absolute", left: 24, right: 24, bottom: 24, display: "flex", gap: 12, opacity: interpolate(frame, [386, 400], [0, 1], clamp) }}>
          <ChipBtn bg={T.acc}>Copy invite link</ChipBtn>
          <ChipBtn bg="#25D366">WhatsApp</ChipBtn>
        </div>
      </Screen>

      {/* The other four, on the other side of the code. */}
      <Screen o={win(frame, B.join[0], B.join[1], 12)}>
        <Text size={16}>
          Your captain sent a <b style={{ color: INK }}>{DEMO_CODE.length}-character code</b>. Joining is <b style={{ color: INK }}>free</b>.
        </Text>
        <Field code mt={12} value={typed(frame, DEMO_CODE, 430, 450)} caret={frame < 452 && Math.floor(frame / 8) % 2 === 0} placeholder="ABC123" />
        <div style={{
          marginTop: 14, padding: "12px 14px", borderRadius: 16, border: `2.5px solid ${INK}`, background: PAPER,
          opacity: interpolate(frame, [452, JOIN_AT], [0, 1], clamp),
          transform: `translateY(${interpolate(frame, [452, JOIN_AT], [12, 0], { ...clamp, easing: EASE })}px)`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: ".02em" }}>{MY_TEAM}</div>
            <Sticker bg={full ? MINT : CARD} rot={full ? -4 : 0} size={13}>{joined}/{teamSize}</Sticker>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
            {ROSTER.slice(0, joined).map((m, i) => (
              <span key={m} style={{
                fontSize: 14, fontWeight: 800, padding: "4px 11px", borderRadius: 100, border: `2px solid ${INK}`,
                background: i === 0 ? T.acc : CARD,
                transform: `scale(${i === 0 ? 1 : interpolate(frame, [JOIN_AT + (i - 1) * 6, JOIN_AT + 6 + (i - 1) * 6], [0.4, 1], { ...clamp, easing: BOUNCE })})`,
              }}>{m}{i === 0 ? " · C" : ""}</span>
            ))}
          </div>
        </div>
        <Button T={T} frame={frame} label={full ? `✓ All ${teamSize} players in` : `Join ${MY_TEAM}`} bg={full ? MINT : T.acc} />
      </Screen>
    </>
  );
};

// ── pieces ─────────────────────────────────────────────────────────────────

const BrowserBar: React.FC<{ url: string }> = ({ url }) => (
  <div style={{
    height: BAR_H, boxSizing: "border-box", borderBottom: `3px solid ${INK}`, background: PAPER,
    display: "flex", alignItems: "center", gap: 7, padding: "0 14px",
  }}>
    {[PINK, LEMON, MINT].map(c => <div key={c} style={{ width: 12, height: 12, borderRadius: "50%", background: c, border: `2px solid ${INK}` }} />)}
    <div style={{
      marginLeft: 10, flex: 1, height: 20, boxSizing: "border-box", border: `2px solid ${INK}`, borderRadius: 100, background: CARD,
      display: "flex", alignItems: "center", padding: "0 10px", fontSize: 12, fontWeight: 800, color: BODY,
    }}>🔒 {url}</div>
  </div>
);

/** One screen of the app card: below the browser bar, top-aligned. */
const Screen: React.FC<{ o: number; children: React.ReactNode }> = ({ o, children }) => (
  <div style={{
    position: "absolute", top: BAR_H, left: 0, right: 0, bottom: 0, padding: "22px 24px",
    opacity: o, transform: `translateY(${(1 - o) * 10}px)`, pointerEvents: "none",
  }}>{children}</div>
);

const Text: React.FC<{ children: React.ReactNode; mt?: number; size?: number; center?: boolean }> = ({ children, mt = 0, size = 18, center }) => (
  <div style={{ fontSize: size, color: BODY, fontWeight: 600, lineHeight: 1.5, marginTop: mt, textAlign: center ? "center" : "left" }}>{children}</div>
);

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".16em", color: MUTED, marginBottom: 8 }}>{children}</div>
);

const Pill: React.FC<{ children: React.ReactNode; bg?: string }> = ({ children, bg = CARD }) => (
  <div style={{ padding: "6px 14px", borderRadius: 100, border: `2px solid ${INK}`, background: bg, fontSize: 15, fontWeight: 800 }}>{children}</div>
);

const StatRow: React.FC<{ frame: number; at: number; stats: [string, string, string][] }> = ({ frame, at, stats }) => (
  <div style={{ display: "flex", gap: 12 }}>
    {stats.map(([k, v, bg], i) => (
      <div key={k} style={{
        flex: 1, background: bg, border: `2.5px solid ${INK}`, borderRadius: 16, padding: "12px 14px", boxShadow: `3px 3px 0 ${INK}`,
        transform: `rotate(${(i - 1) * 1.5}deg) scale(${at + i * 4 <= 0 ? 1 : interpolate(frame, [at + i * 4, at + i * 4 + 12], [0.8, 1], { ...clamp, easing: BOUNCE })})`,
      }}>
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".1em", opacity: 0.7 }}>{k}</div>
        <div style={{ fontSize: 27, fontWeight: 900, marginTop: 2 }}>{v}</div>
      </div>
    ))}
  </div>
);

const KV: React.FC<{ k: string; v: string; mt?: number }> = ({ k, v, mt = 0 }) => (
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, marginTop: mt }}>
    <span style={{ color: BODY, fontWeight: 600 }}>{k}</span><span style={{ fontWeight: 900 }}>{v}</span>
  </div>
);

const ChipBtn: React.FC<{ bg: string; children: React.ReactNode; grow?: boolean }> = ({ bg, children, grow = true }) => (
  <div style={{
    ...(grow ? { flex: 1 } : { padding: "0 22px" }), height: 54, boxSizing: "border-box",
    display: "flex", alignItems: "center", justifyContent: "center",
    border: `3px solid ${INK}`, borderRadius: 14, background: bg, boxShadow: `4px 4px 0 ${INK}`, fontSize: 17, fontWeight: 900,
  }}>{children}</div>
);

/** A text field mid-entry. `code` is the 6-character join code. */
const Field: React.FC<{ value: string; caret: boolean; placeholder: string; code?: boolean; mt?: number }> = ({ value, caret, placeholder, code, mt = 0 }) => (
  <div style={{
    marginTop: mt, padding: "12px 16px", borderRadius: 14, border: `3px solid ${INK}`, background: CARD, boxShadow: `4px 4px 0 ${INK}`,
    fontSize: code ? 30 : 24, fontWeight: 900, color: value ? INK : "#B7B1BF",
    letterSpacing: code ? ".3em" : ".03em", textAlign: code ? "center" : "left",
    ...(code ? { textIndent: ".3em" } : null),
  }}>
    {value || placeholder}
    <span style={{ opacity: caret ? 1 : 0 }}>|</span>
  </div>
);

/**
 * A pressable button, anchored to the bottom of the screen by default so the
 * cursor's target y is fixed (see BTN_Y). Press = the hard shadow collapses
 * and the button drops into where it was.
 */
const Button: React.FC<{
  T: Theme; frame: number; label: React.ReactNode; hoverAt?: number; clickAt?: number;
  bg?: string; fg?: string; bottom?: number;
}> = ({ T, frame, label, hoverAt = -1, clickAt = -1, bg, fg = INK, bottom = 24 }) => {
  const hover = hoverAt >= 0 ? interpolate(frame, [hoverAt, hoverAt + 8], [0, 1], clamp) : 0;
  const press = clickAt >= 0 && frame >= clickAt && frame < clickAt + 7;
  const sh = press ? 1 : 5 + hover * 2;
  const shift = press ? 4 : -hover * 2;
  return (
    <div style={{
      position: "absolute", left: 24, right: 24, bottom, height: BTN_H, boxSizing: "border-box",
      display: "flex", alignItems: "center", justifyContent: "center",
      borderRadius: 16, border: `3px solid ${INK}`, background: bg || T.acc, color: fg,
      fontSize: 21, fontWeight: 900, boxShadow: `${sh}px ${sh}px 0 ${INK}`, transform: `translate(${shift}px, ${shift}px)`,
    }}>{label}</div>
  );
};

const DiscordBody: React.FC<{ frame: number; at: number }> = ({ frame, at }) => (
  <>
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <div style={{
        width: 76, height: 76, flex: "none", borderRadius: "50%", background: LILAC, border: `3px solid ${INK}`, boxShadow: `4px 4px 0 ${INK}`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36,
        transform: `rotate(${Math.sin(frame / 6) * 6}deg) scale(${interpolate(frame, [at + 4, at + 16], [0.6, 1], { ...clamp, easing: BOUNCE })})`,
      }}>💬</div>
      <Text>Brackets, match calls and your team all live there.</Text>
    </div>
    <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
      <Pill bg={LEMON}>📣 Match calls</Pill><Pill bg={MINT}>🏆 Brackets</Pill><Pill bg={PINK}>🎮 Lobby codes</Pill>
    </div>
  </>
);

/** Captain plus the empty seats the code fills. */
const SquadDots: React.FC<{ frame: number; at: number; T: Theme; size: number }> = ({ frame, at, T, size }) => (
  <div style={{ display: "flex", gap: 10, marginTop: 18, alignItems: "center" }}>
    {Array.from({ length: size }).map((_, i) => (
      <div key={i} style={{
        width: 46, height: 46, borderRadius: "50%", boxSizing: "border-box",
        border: `3px ${i === 0 ? "solid" : "dashed"} ${INK}`, background: i === 0 ? T.acc : CARD,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: i === 0 ? INK : MUTED,
        transform: `scale(${interpolate(frame, [at + i * 3, at + i * 3 + 10], [0, 1], { ...clamp, easing: BOUNCE })})`,
      }}>{i === 0 ? "C" : "+"}</div>
    ))}
    <span style={{ fontSize: 15, fontWeight: 800, color: BODY, marginLeft: 4 }}>captain + {size - 1} by code</span>
  </div>
);

/** The hosted checkout, sliding in over whichever screen called it. */
const PayuSheet: React.FC<{ frame: number; o: number; slideFrom: number; spinUntil: number; amount: number }> = ({ frame, o, slideFrom, spinUntil, amount }) => (
  <Screen o={o}>
    <div style={{
      position: "absolute", inset: 0, background: PAPER,
      transform: `translateX(${interpolate(frame, [slideFrom, slideFrom + 16], [620, 0], { ...clamp, easing: EASE })}px)`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20,
    }}>
      <Sticker bg={LILAC} rot={-3}>UPI · Net Banking</Sticker>
      {frame > spinUntil ? (
        <Pop frame={frame} at={spinUntil}>
          <div style={{ width: 92, height: 92, borderRadius: "50%", background: MINT, border: `3px solid ${INK}`, boxShadow: `5px 5px 0 ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, fontWeight: 900 }}>✓</div>
        </Pop>
      ) : (
        <div style={{ width: 56, height: 56, borderRadius: "50%", boxSizing: "border-box", border: `6px solid ${INK}22`, borderTopColor: INK, transform: `rotate(${(frame - slideFrom) * 14}deg)` }} />
      )}
      <div style={{ fontSize: 36, fontWeight: 900 }}>{frame > spinUntil ? "Paid" : `₹${inr(amount)}`}</div>
    </div>
  </Screen>
);

const Counter: React.FC<{ frame: number; from: number; to: number; value: number }> = ({ frame, from, to, value }) => (
  <div style={{ fontSize: 76, fontWeight: 900, letterSpacing: "-.04em", lineHeight: 1 }}>
    ₹{inr(Math.round(interpolate(frame, [from, to], [0, value], { ...clamp, easing: EASE })))}
  </div>
);

const Row: React.FC<{ done: boolean; label: string; value: string; delay: number; frame: number }> = ({ done, label, value, delay, frame }) => {
  const a = interpolate(frame, [delay - 10, delay], [0, 1], clamp);
  const tick = done ? interpolate(frame, [delay, delay + 10], [1.5, 1], { ...clamp, easing: BOUNCE }) : 1;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 14, marginTop: 12,
      border: `2.5px solid ${INK}`, background: done ? "#EFFFF5" : CARD,
      opacity: a, transform: `translateX(${(1 - a) * -14}px)`,
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 9, boxSizing: "border-box", border: `2.5px solid ${INK}`, background: done ? MINT : CARD,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, transform: `scale(${tick})`,
      }}>{done ? "✓" : ""}</div>
      <div style={{ fontSize: 18, fontWeight: 800, flex: 1 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: OK_TEXT }}>{done ? value : ""}</div>
    </div>
  );
};

const Progress: React.FC<{ frame: number; from: number; to: number; T: Theme }> = ({ frame, from, to, T }) => (
  <div style={{ height: 16, boxSizing: "border-box", borderRadius: 100, border: `2.5px solid ${INK}`, background: CARD, overflow: "hidden", marginBottom: 2 }}>
    <div style={{ height: "100%", width: `${interpolate(frame, [from, to], [0, 100], { ...clamp, easing: EASE })}%`, background: T.acc }} />
  </div>
);

const Pop: React.FC<{ frame: number; at: number; children: React.ReactNode }> = ({ frame, at, children }) => {
  const { fps } = useVideoConfig();
  return <div style={{ transform: `scale(${spring({ frame: frame - at, fps, config: { damping: 9, mass: 0.5 } })})` }}>{children}</div>;
};

// ── match day ──────────────────────────────────────────────────────────────

/**
 * The draw — SOLO MODE ONLY. Team registrations arrive pre-formed and there is
 * nothing to draw, so the team timeline carries no `draw` beat at all.
 *
 * ONE set of dots: each is given a pool position and a seat, and flies from
 * one to the other on a staggered arc, dealt k % teamCount — one to each team
 * in turn, the way a real draw looks. Identity is continuous, which is the
 * entire point; crossfading a pool into filled cards read as a dissolve.
 */
const POOL_X = (k: number) => 196 + (k % 5) * 82;
const POOL_Y = (k: number) => 376 + Math.floor(k / 5) * 54;

const MatchDay: React.FC<{
  frame: number; T: Theme; teamCount: number; totalSlots: number; teamMode: boolean;
  groupBo: number; finalBo: number; finalTime: string; entryFee: number; dateLabel: string;
}> = ({ frame, T, teamCount, totalSlots, teamMode, groupBo, finalBo, finalTime, entryFee, dateLabel }) => {
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

  const panel: React.CSSProperties = { position: "absolute", left: PAD_X, right: PAD_X, top: BODY_TOP };

  return (
    <>
      {/* ── the draw (solo only) — B_SOLO directly: this branch is solo by construction ── */}
      {!teamMode && (() => {
        const bDraw = beat(frame, B_SOLO.draw[0], B_SOLO.draw[1], 13);
        const DRAW_AT = B_SOLO.draw[0] + 22;
        const colW = (720 - PAD_X * 2) / teamCount;
        const seatX = (k: number) => PAD_X + (k % teamCount) * colW + colW / 2;
        const seatY = (k: number) => 392 + Math.floor(k / teamCount) * 40;
        const youIdx = 1 + teamCount * 2;          // team B, third seat dealt
        const cardsIn = interpolate(frame, [DRAW_AT - 14, DRAW_AT + 2], [0, 1], { ...clamp, easing: EASE });
        const seated = interpolate(frame, [DRAW_AT + totalSlots * 2 + 16, DRAW_AT + totalSlots * 2 + 32], [0, 1], clamp);
        return (
          <AbsoluteFill style={bDraw}>
            {Array.from({ length: teamCount }).map((_, ti) => {
              const mine = TEAM_NAMES[ti] === YOU;
              return (
                <div key={ti} style={{
                  position: "absolute", left: PAD_X + ti * colW + 6, width: colW - 12, top: BODY_TOP + 30, height: 268, boxSizing: "border-box",
                  borderRadius: 18, border: `3px solid ${INK}`, background: mine ? LEMON : CARD, boxShadow: `5px 5px 0 ${INK}`,
                  opacity: cardsIn, transform: `rotate(${(ti % 2 ? 1 : -1) * 1.2}deg) scale(${0.94 + cardsIn * 0.06})`,
                  display: "flex", justifyContent: "center", paddingTop: 12,
                }}>
                  <div><Sticker bg={mine ? T.acc : PAPER} rot={0} size={12}>Team {TEAM_NAMES[ti]}</Sticker></div>
                </div>
              );
            })}

            {Array.from({ length: totalSlots }).map((_, k) => {
              const start = DRAW_AT + k * 2;
              const t = interpolate(frame, [start, start + 20], [0, 1], { ...clamp, easing: EASE });
              const jitter = t < 0.02 ? Math.sin((frame + k * 9) / 6) * 7 : 0;
              const x = POOL_X(k) + (seatX(k) - POOL_X(k)) * t + jitter;
              const y = POOL_Y(k) + (seatY(k) - POOL_Y(k)) * t - Math.sin(t * Math.PI) * 30;
              const you = k === youIdx;
              const dot = you ? 32 : 26;
              return (
                <div key={k} style={{
                  position: "absolute", left: x - dot / 2, top: y - dot / 2, width: dot, height: dot, boxSizing: "border-box",
                  borderRadius: "50%", border: `3px solid ${INK}`, background: you ? T.acc : CARD,
                  transform: `scale(${t > 0.01 && t < 0.99 ? 1.18 : 1})`,
                }} />
              );
            })}

            <div style={{ position: "absolute", left: PAD_X, right: PAD_X, top: BODY_TOP + 330, fontSize: 22, fontWeight: 800, opacity: seated }}>
              {teamCount} teams of 5 — <Mark c={T.acc}>you&apos;re in Team {YOU}</Mark>.
            </div>
          </AbsoluteFill>
        );
      })()}

      {/* ── the day, hour by hour ── */}
      <AbsoluteFill style={bDay}>
        <div style={panel}>
          {/* The whole format in one line, before any detail. Two stages and
              nothing else — no semis, no lower bracket. */}
          <div style={{
            display: "flex", alignItems: "stretch", gap: 12,
            opacity: interpolate(frame, [B.day[0] + 8, B.day[0] + 20], [0, 1], clamp),
            transform: `scale(${interpolate(frame, [B.day[0] + 8, B.day[0] + 22], [0.85, 1], { ...clamp, easing: BOUNCE })})`,
          }}>
            <StageBox title="Round robin" badge={GROUP} badgeBg={T.acc} sub={`best of ${groupBo} · everyone plays everyone`} rot={-1.5} />
            <div style={{ alignSelf: "center", fontSize: 30, fontWeight: 900 }}>→</div>
            <StageBox title="Grand Final" badge={FINAL} badgeBg={GOLD} sub={`best of ${finalBo} · top 2 only`} rot={1.5} />
          </div>

          <div style={{ position: "relative", marginTop: 26 }}>
            {/* the spine the day runs down */}
            <div style={{ position: "absolute", left: 9, top: 14, bottom: 14, width: 4, borderRadius: 4, background: `${INK}22` }} />
            <div style={{
              position: "absolute", left: 9, top: 14, width: 4, borderRadius: 4, background: INK,
              height: `${interpolate(frame, [B.day[0] + 20, B.day[0] + 100], [0, 92], clamp)}%`,
            }} />
            {DAY_ROWS.map((r, i) => {
              const at = B.day[0] + (teamMode ? 20 : 24) + i * (teamMode ? 13 : 15);
              const a = interpolate(frame, [at, at + 12], [0, 1], { ...clamp, easing: EASE });
              return (
                <div key={r.t} style={{
                  position: "relative", display: "flex", alignItems: "center", gap: 14, height: 48, paddingLeft: 38,
                  opacity: a, transform: `translateX(${(1 - a) * -14}px)`,
                }}>
                  {/* node positioned against its own row, or all of them would
                      collapse onto the wrapper's origin */}
                  <div style={{
                    position: "absolute", left: 0, top: "50%", marginTop: -11, width: 22, height: 22, boxSizing: "border-box", borderRadius: "50%",
                    border: `3px solid ${INK}`, background: r.gold ? GOLD : r.hi ? T.acc : CARD,
                    transform: `scale(${interpolate(frame, [at, at + 10], [0.3, 1], { ...clamp, easing: BOUNCE })})`,
                  }} />
                  <span style={{ fontSize: 20, fontWeight: 900, width: 72 }}>{r.t}</span>
                  <span style={{ fontSize: 19, fontWeight: 800, flex: 1 }}>{r.l}</span>
                  {r.hi || r.gold ? (
                    <span style={{ fontSize: 13, fontWeight: 900, padding: "3px 10px", borderRadius: 100, border: `2px solid ${INK}`, background: r.gold ? GOLD : CARD }}>{r.s}</span>
                  ) : (
                    <span style={{ fontSize: 14, fontWeight: 600, color: MUTED }}>{r.s}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>

      {/* ── your day, from your side ── */}
      <AbsoluteFill style={bMine}>
        <div style={panel}>
          <Text size={18}>
            {teamMode ? "Every team plays every team once." : "One match against every other team."} A loss won&apos;t send you home.
          </Text>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
            {MY_MATCHES.map((m, i) => {
              const at = B.mine[0] + 24 + i * 14;
              const a = interpolate(frame, [at, at + 12], [0, 1], { ...clamp, easing: EASE });
              return (
                <Ticket key={m.time} time={m.time} timeBg={T.acc} name={`vs ${label(m.vs)}`} tag={GROUP}
                  style={{ opacity: a, transform: `translateX(${(1 - a) * -20}px) rotate(${(i % 2 ? 0.6 : -0.6)}deg)` }} />
              );
            })}
            {/* the fourth, conditional on finishing top two */}
            <Ticket time={finalTime} timeBg={GOLD} name="Grand Final" tag={`${FINAL} · if top 2`} tagBg={GOLD} dashed
              style={{
                opacity: interpolate(frame, [B.mine[0] + 72, B.mine[0] + 86], [0, 1], { ...clamp, easing: EASE }),
                transform: `scale(${interpolate(frame, [B.mine[0] + 72, B.mine[0] + 88], [0.85, 1], { ...clamp, easing: BOUNCE })})`,
              }} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, marginTop: 20, opacity: interpolate(frame, [B.mine[0] + 92, B.mine[0] + 104], [0, 1], clamp) }}>
            {/* Three group fixtures of groupBo maps each, plus up to finalBo. */}
            <Mark c={T.acc}>{3 * groupBo} maps minimum.</Mark>{" "}
            <span style={{ color: BODY, fontWeight: 700 }}>Up to {3 * groupBo + finalBo} if you reach the final.</span>
          </div>
        </div>
      </AbsoluteFill>

      {/* ── standings ── */}
      <AbsoluteFill style={bStand}>
        <div style={panel}>
          <div style={{ background: CARD, border: `3px solid ${INK}`, borderRadius: 20, boxShadow: `6px 6px 0 ${INK}`, overflow: "hidden" }}>
            <div style={{ display: "flex", padding: "10px 18px", background: PAPER, borderBottom: `3px solid ${INK}`, fontSize: 13, fontWeight: 900, letterSpacing: ".1em" }}>
              <span style={{ flex: 1 }}>TEAM</span><span style={{ width: 60, textAlign: "right" }}>PTS</span><span style={{ width: 88, textAlign: "right" }}>RW−RL</span>
            </div>
            {STANDINGS.map((s, i) => {
              const at = B.stand[0] + 14 + i * 8;
              const a = interpolate(frame, [at, at + 9], [0, 1], clamp);
              const you = s.t === YOU;
              return (
                <div key={s.t} style={{
                  display: "flex", alignItems: "center", height: 52, padding: "0 18px",
                  // The dashed rule under second place is the qualification cut.
                  borderTop: i === 0 ? "none" : i === 2 ? `3px dashed ${INK}` : `2px solid ${INK}1f`,
                  background: you ? T.soft : "transparent",
                  opacity: a, transform: `translateX(${(1 - a) * -14}px)`,
                }}>
                  <div style={{
                    width: 28, height: 28, boxSizing: "border-box", borderRadius: "50%", border: `2.5px solid ${INK}`, background: i < 2 ? GOLD : CARD,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, marginRight: 12,
                  }}>{i + 1}</div>
                  <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, fontSize: 19, fontWeight: 900, color: i < 2 ? INK : MUTED }}>
                    {label(s.t)}
                    {you && <Sticker bg={T.acc} rot={-5} size={11}>you</Sticker>}
                  </span>
                  <span style={{ width: 60, textAlign: "right", fontSize: 22, fontWeight: 900 }}>{s.p}</span>
                  <span style={{ width: 88, textAlign: "right", fontSize: 18, fontWeight: 800, color: s.rd >= 0 ? OK_TEXT : BAD_TEXT }}>{s.rd > 0 ? `+${s.rd}` : s.rd}</span>
                </div>
              );
            })}
          </div>
          <Text size={16} mt={14}>
            {groupBo === 1 ? "Each match won is a point." : "Each map won is a point."} Level? <b style={{ color: INK }}>RW−RL</b>, then <b style={{ color: INK }}>K−D</b>.
          </Text>

          {/* No bracket, no semis — the top two go straight to one final. Saying
              so explicitly stops people assuming a longer play-off run. */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 13, marginTop: 18,
            padding: "14px 18px", borderRadius: 18, background: GOLD, border: `3px solid ${INK}`, boxShadow: `5px 5px 0 ${INK}`,
            opacity: interpolate(frame, [B.stand[0] + 52, B.stand[0] + 64], [0, 1], clamp),
            transform: `rotate(-1.2deg) scale(${interpolate(frame, [B.stand[0] + 52, B.stand[0] + 68], [0.8, 1], { ...clamp, easing: BOUNCE })})`,
          }}>
            <span style={{ fontSize: 20, fontWeight: 900 }}>{label(STANDINGS[0].t)}</span>
            <span style={{ fontSize: 15, fontWeight: 800 }}>vs</span>
            <span style={{ fontSize: 20, fontWeight: 900 }}>{label(STANDINGS[1].t)}</span>
            <div style={{ width: 3, height: 34, background: INK, borderRadius: 2 }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 900 }}>{finalTime} GRAND FINAL</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{FINAL} — the whole play-off</div>
            </div>
          </div>
        </div>
      </AbsoluteFill>

      {/* ── close ── */}
      <AbsoluteFill style={bCta}>
        <div style={{ ...panel, top: BODY_TOP + 10, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Sticker bg={T.acc} rot={-3} size={17}>Round robin · {GROUP}</Sticker>
            <span style={{ fontSize: 28, fontWeight: 900 }}>→</span>
            <Sticker bg={GOLD} rot={3} size={17}>Grand Final · {FINAL}</Sticker>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: BODY, marginTop: 6 }}>{dateLabel}</div>
          {teamMode
            ? <div style={{ fontSize: 19, fontWeight: 800 }}>Create a team, or join one with a code.</div>
            : <div style={{ fontSize: 19, fontWeight: 800 }}>Register solo — ₹{inr(entryFee)} a seat.</div>}
          <div style={{ position: "relative", marginTop: 18 }}>
            <div style={{
              padding: "20px 58px", borderRadius: 100, border: `3px solid ${INK}`, background: T.acc, boxShadow: `7px 7px 0 ${INK}`,
              fontSize: 32, fontWeight: 900,
              transform: `scale(${1 + Math.max(0, Math.sin((frame - B.cta[0]) / 5)) * 0.035})`,
            }}>Register →</div>
            <div style={{ position: "absolute", right: -30, top: -26 }}>
              <Sticker bg={PINK} rot={14} size={15} pop={interpolate(frame, [B.cta[0] + 16, B.cta[0] + 28], [0, 1], { ...clamp, easing: BOUNCE })}>GO!</Sticker>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </>
  );
};

const StageBox: React.FC<{ title: string; badge: string; badgeBg: string; sub: string; rot: number }> = ({ title, badge, badgeBg, sub, rot }) => (
  <div style={{
    flex: 1, background: CARD, border: `3px solid ${INK}`, borderRadius: 16, boxShadow: `4px 4px 0 ${INK}`, padding: "12px 14px",
    transform: `rotate(${rot}deg)`,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 19, fontWeight: 900 }}>{title}</span>
      <Sticker bg={badgeBg} rot={0} size={13}>{badge}</Sticker>
    </div>
    <div style={{ fontSize: 13.5, fontWeight: 600, color: BODY, marginTop: 6 }}>{sub}</div>
  </div>
);

/** A fixture as a ticket stub: time on a coloured tab, opponent, best-of tag. */
const Ticket: React.FC<{ time: string; timeBg: string; name: string; tag: string; tagBg?: string; dashed?: boolean; style: React.CSSProperties }> = ({
  time, timeBg, name, tag, tagBg = CARD, dashed, style,
}) => (
  <div style={{
    display: "flex", alignItems: "stretch", height: 62, boxSizing: "border-box",
    border: `3px ${dashed ? "dashed" : "solid"} ${INK}`, borderRadius: 16, background: dashed ? PAPER : CARD,
    boxShadow: dashed ? "none" : `4px 4px 0 ${INK}`, overflow: "hidden", ...style,
  }}>
    <div style={{ width: 96, background: timeBg, borderRight: `3px ${dashed ? "dashed" : "solid"} ${INK}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 900 }}>{time}</div>
    <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 16px", fontSize: 19, fontWeight: 800 }}>{name}</div>
    <div style={{ display: "flex", alignItems: "center", paddingRight: 14 }}>
      <span style={{ fontSize: 13, fontWeight: 900, padding: "3px 10px", borderRadius: 100, border: `2px solid ${INK}`, background: tagBg }}>{tag}</span>
    </div>
  </div>
);

export default TournamentExplainer;
