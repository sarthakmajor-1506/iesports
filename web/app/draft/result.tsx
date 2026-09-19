"use client";

import { type Engine } from "@/lib/draftlab";
import { counterMap, teamTempo, draftingStyle, type TempoRow, type CounterEdge } from "@/lib/draftbot";
import { useEffect, useState } from "react";
import {
  Band, Btn, Panel, Label, VersusBar, CountUp, Mark,
  CREAM, PANEL, LINE, MUTED, DIM, GREEN, ENEMY,
  LEMON, MINT, PINK, LILAC, ON_FILL, PAPER, R_CARD, R_CHIP, BW_2,
} from "./ui";
import { Burst } from "./theme";
import { play } from "./sound";
import { TeamRow, HeroImg, heroBase } from "./hero-art";

export type ResultEv = {
  by: "bot" | "you"; kind: "ban" | "pick"; heroId: number;
  swing: number; regret: number; bestAlt: number; rank: number; pool: number;
  punishedBy: number | null; deniedRank: number | null;
};

/**
 * What happened, and what to do next.
 *
 * The verdict, the score and REMATCH are all reachable without scrolling: the
 * action bar is pinned to the bottom of the frame rather than sitting at the end
 * of the analysis, which is where it used to be — four screens down, past every
 * breakdown, so playing again meant reading the post-mortem first.
 */
export function ResultBand({ won, onMenu }: { won: boolean; onMenu: () => void }) {
  return <Band compact accent={won ? MINT : PINK} onBack={onMenu}
    title={won ? "You won the draft" : "You lost the draft"} />;
}

export function ResultActions({ onAgain, onMenu }: { onAgain: () => void; onMenu: () => void }) {
  return (
    <div style={{
      flex: "0 0 auto", display: "flex", gap: 9, padding: "10px 12px calc(10px + env(safe-area-inset-bottom))",
      borderTop: `${BW_2}px solid ${LINE}`, background: PAPER,
    }}>
      <div style={{ flex: 2 }}><Btn full size="l" tone="red" onClick={onAgain}>PLAY AGAIN</Btn></div>
      <div style={{ flex: 1 }}><Btn full size="l" tone="ghost" onClick={onMenu}>MENU</Btn></div>
    </div>
  );
}

export function Result({
  engine, events, yours, theirs, finalP, quiz, tempos, motion, scored,
  coinsAwarded, weeklyTotal, coinsPersonalBest,
}: {
  engine: Engine; events: ResultEv[]; yours: number[]; theirs: number[]; finalP: number | null;
  quiz: { points: number; correct: number; rounds: { correct: boolean; points: number }[] } | null;
  tempos: Map<number, TempoRow>; motion: boolean;
  scored: { points: number; draftPoints: number; quizPoints: number } | null;
  /** What this game paid into the weekly board — 0 on a loss. See CoinPanel. */
  coinsAwarded?: number;
  weeklyTotal?: number | null;
  /** Server-decided, against the row as it stood before this game. */
  coinsPersonalBest?: boolean;
}) {
  const heroName = (id: number) => engine.heroById.get(id)?.name ?? `#${id}`;
  const heroOf = (id: number) => { const h = engine.heroById.get(id)!; return { id, img: h.img, name: h.name }; };

  const p = finalP ?? 0.5;
  const won = p > 0.5;
  const { yoursWin, theirsWin } = counterMap(engine, yours, theirs);
  const theirBest = events.filter((e) => e.by === "bot" && e.kind === "pick").sort((a, b) => a.swing - b.swing)[0];
  const yourWorst = events.filter((e) => e.by === "you" && e.kind === "pick").sort((a, b) => b.regret - a.regret)[0];
  const bestBan = events.filter((e) => e.by === "you" && e.kind === "ban" && e.deniedRank != null)
    .sort((a, b) => (a.deniedRank ?? 99) - (b.deniedRank ?? 99))[0];
  const style = draftingStyle(engine, yours, tempos);
  const dTempo = teamTempo(yours, tempos) - teamTempo(theirs, tempos);
  const tempoLine = Math.abs(dTempo) < 0.12 ? null
    : dTempo > 0
      ? "Your draft wants a short game and theirs wants a long one. Past 45 minutes this flips."
      : "Theirs peaks early and yours scales. Survive 30 minutes and the game turns.";

  const them = "The Counterpicker";

  return (
    <div className="dl-in" style={{ display: "grid", gap: 10, paddingTop: 10, paddingBottom: 14 }}>
      {/* The verdict. A sentence in ink with the outcome highlightered under it,
          which is how the films deliver a headline — the old version coloured
          the whole sentence, and a green sentence on paper is harder to read the
          more it is supposed to be celebrating. */}
      <div className="dl-card" style={{ padding: "15px 15px 16px" }}>
        <span className="dl-stk" style={{ background: won ? MINT : PINK, marginBottom: 11 }}>DRAFT COMPLETE</span>
        <div style={{
          fontSize: "clamp(19px, 5.8vw, 25px)", fontWeight: 900, letterSpacing: "-.035em",
          color: CREAM, margin: "3px 0 14px", lineHeight: 1.16,
        }}>
          {/* The highlighter goes on the verb alone, and the verb does not
              break. Marking the whole phrase let the line wrap inside
              "out-drafted", which printed a stroke ending on a hyphen and
              another starting mid-word on the line below. */}
          {won
            ? <>You <Mark c={MINT}><span style={{ whiteSpace: "nowrap" }}>out-drafted</span></Mark> {them}.</>
            : <>{them} <Mark c={PINK}><span style={{ whiteSpace: "nowrap" }}>out-drafted</span></Mark> you.</>}
        </div>
        <VersusBar p={p} left="YOU" right={them.toUpperCase()} />
      </div>

      {(quiz || scored) && <ScoreReveal scored={scored} quiz={quiz} />}
      {!!coinsAwarded && (
        <CoinPanel coins={coinsAwarded} weeklyTotal={weeklyTotal ?? null} personalBest={coinsPersonalBest} />
      )}

      <TeamRow side="you" label="YOUR FIVE" heroes={yours.map(heroOf)} latest={null} motion={motion} height="clamp(80px, 23vw, 116px)" />
      <TeamRow side="them" label={them.toUpperCase()} heroes={theirs.map(heroOf)} latest={null} motion={motion} height="clamp(80px, 23vw, 116px)" />

      {theirBest && theirBest.swing < -0.4 && (
        <Beat fill={PINK} label="THE PICK THAT HURT">
          Their <b>{heroName(theirBest.heroId)}</b> took {Math.abs(theirBest.swing).toFixed(1)} points off your draft.
        </Beat>
      )}
      {bestBan && bestBan.deniedRank != null && bestBan.deniedRank <= 10 && (
        <Beat fill={MINT} label="YOUR BEST BAN">
          You took <b>{heroName(bestBan.heroId)}</b> away — their
          {bestBan.deniedRank === 1 ? " top" : ` #${bestBan.deniedRank}`} option at the time.
        </Beat>
      )}
      {yourWorst && yourWorst.regret > 0.4 && (
        <Beat fill={LEMON} label="YOUR LOOSEST PICK">
          {yourWorst.punishedBy != null
            ? <>You took <b>{heroName(yourWorst.heroId)}</b> into their <b>{heroName(yourWorst.punishedBy)}</b>.</>
            : <>Your <b>{heroName(yourWorst.heroId)}</b> was the loose one.</>}
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 3 }}>
            Ranked {yourWorst.rank} of {yourWorst.pool}. <b style={{ color: CREAM }}>{heroName(yourWorst.bestAlt)}</b> was worth {yourWorst.regret.toFixed(1)} more.
          </div>
        </Beat>
      )}
      {tempoLine && <Beat fill={LILAC} label="SHAPE OF THE GAME">{tempoLine}</Beat>}

      <Panel style={{ padding: "10px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
          <Label style={{ marginBottom: 0 }}>THE COUNTER WAR</Label>
          <span style={{ fontSize: 12, fontWeight: 800, color: yoursWin.length >= theirsWin.length ? GREEN : ENEMY }}>
            {yoursWin.length} — {theirsWin.length}
          </span>
        </div>
        <Col title="YOU COUNTERED" rows={yoursWin.slice(0, 3)} color={GREEN} engine={engine} />
        <div style={{ height: 8 }} />
        <Col title="THEY COUNTERED" rows={theirsWin.slice(0, 3)} color={ENEMY} engine={engine} />
      </Panel>

      <div className="dl-card" style={{ padding: "13px 14px", background: LEMON, color: ON_FILL }}>
        <div style={{ fontSize: 9.5, letterSpacing: 1.5, fontWeight: 900, opacity: .7, marginBottom: 5 }}>YOUR DRAFTING STYLE</div>
        <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-.025em" }}>{style.tag}</div>
        <div style={{ fontSize: 12, fontWeight: 700, marginTop: 3, lineHeight: 1.45, opacity: .82 }}>{style.line}</div>
      </div>
    </div>
  );
}

/**
 * One line of post-mortem, tagged.
 *
 * The rule down the left is now a solid pastel bar with an ink outline rather
 * than a 3px coloured hairline, because on cream a hairline in mint is invisible
 * and the four beats stopped being distinguishable from each other.
 */
function Beat({ fill, label, children }: { fill: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <span style={{ flex: "0 0 auto", width: 7, borderRadius: 4, background: fill, border: `1.5px solid ${LINE}`, boxSizing: "border-box" }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 9, letterSpacing: 1.4, color: DIM, fontWeight: 900, marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 13, color: CREAM, fontWeight: 600, lineHeight: 1.45 }}>{children}</div>
      </div>
    </div>
  );
}

export function Col({ title, rows, color, engine }: { title: string; rows: CounterEdge[]; color: string; engine: Engine }) {
  const heroName = (id: number) => engine.heroById.get(id)?.name ?? `#${id}`;
  return (
    <div>
      <div style={{ fontSize: 9, letterSpacing: 1.2, color, marginBottom: 5, fontWeight: 900 }}>{title}</div>
      {rows.length === 0 && <div style={{ fontSize: 11.5, color: MUTED }}>Nothing decisive.</div>}
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
          <span style={{ width: 26, height: 17, flexShrink: 0, borderRadius: 4, overflow: "hidden", border: `1.5px solid ${LINE}`, boxSizing: "border-box", background: "var(--tile)" }}>
            <HeroImg base={heroBase(engine.heroById.get(r.attacker)!.img)} shape="crop" position="50% 20%" />
          </span>
          <span style={{ fontSize: 11.5, color: CREAM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{heroName(r.attacker)}</span>
          <span style={{ fontSize: 9.5, color: DIM, flexShrink: 0 }}>vs</span>
          <span style={{ fontSize: 11.5, color: CREAM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{heroName(r.defender)}</span>
          {r.winRate != null && (
            <span style={{ fontSize: 10.5, color: DIM, marginLeft: "auto", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
              {(r.winRate * 100).toFixed(0)}%{r.expected != null && ` vs ${(r.expected * 100).toFixed(0)}%`}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * The score for this game, on its own — no personal-best flourish here.
 *
 * That concept moved to CoinPanel below, where it is decided against a coin
 * haul rather than a raw point total. Keeping both would have meant two
 * "personal best" claims on one screen, sometimes disagreeing, because they
 * would have been reading two different counters.
 */
function ScoreReveal({
  scored, quiz,
}: {
  scored: { points: number; draftPoints: number; quizPoints: number } | null;
  quiz: { points: number; correct: number; rounds: { correct: boolean; points: number }[] } | null;
}) {
  const total = scored ? scored.points : quiz?.points ?? 0;

  return (
    <div style={{
      position: "relative", borderRadius: R_CARD, padding: "18px 15px 16px", boxSizing: "border-box",
      background: GOLD_SHEET, color: ON_FILL, textAlign: "center",
      border: `${BW_2}px solid ${LINE}`, boxShadow: `5px 5px 0 ${LINE}`,
    }}>
      <span className="dl-stk r" style={{ background: PANEL, color: CREAM, marginBottom: 9 }}>
        {scored ? "SCORE THIS GAME" : "QUIZ ROUND"}
      </span>

      <div style={{
        fontSize: "clamp(46px, 15vw, 68px)", fontWeight: 900, lineHeight: 1, letterSpacing: "-.05em",
      }}>
        <CountUp to={total} dur={1200} />
      </div>

      {scored && (
        <div className="dl-in" style={{ display: "flex", gap: 9, marginTop: 15 }}>
          <Breakdown label="DRAFT" value={scored.draftPoints} />
          <Breakdown label="QUESTIONS" value={scored.quizPoints} />
        </div>
      )}

      {quiz && (
        <div style={{ display: "flex", gap: 7, justifyContent: "center", marginTop: 13 }}>
          {quiz.rounds.map((r, i) => (
            <span key={i} style={{
              width: 36, height: 36, borderRadius: R_CHIP, display: "grid", placeItems: "center", boxSizing: "border-box",
              background: r.correct ? MINT : PINK, border: `2px solid ${LINE}`, boxShadow: `2px 2px 0 ${LINE}`,
              color: ON_FILL, fontSize: 12, fontWeight: 900,
            }}>{r.correct ? `+${r.points}` : "0"}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * What this win paid, and the running total for the week.
 *
 * Shown only when coins were actually earned — a loss has nothing to animate
 * here, and a zero that counts up to zero is not a reward, it is a reminder.
 * The count-up is the same primitive ScoreReveal uses above it; a coin haul
 * that simply appeared would read as a label, not a payout.
 *
 * The confetti is gated on a genuine personal best — the biggest single-game
 * coin haul this account has ever earned, decided server-side against the row
 * as it stood before this game (see draftLadderServer.ts / the leaderboard
 * route). Celebrating every win the same way would make the celebration mean
 * nothing.
 */
export function CoinPanel({
  coins, weeklyTotal, personalBest,
}: { coins: number; weeklyTotal: number | null; personalBest?: boolean }) {
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    if (landed && personalBest) play("win");
  }, [landed, personalBest]);

  if (coins <= 0) return null;

  return (
    <div style={{
      position: "relative", borderRadius: R_CARD, padding: "16px 15px 15px", boxSizing: "border-box",
      background: GOLD_SHEET, color: ON_FILL, textAlign: "center", overflow: "hidden",
      border: `${BW_2}px solid ${LINE}`,
      boxShadow: personalBest && landed ? `9px 9px 0 ${LINE}` : `5px 5px 0 ${LINE}`,
      transform: personalBest && landed ? "translate(-2px, -2px)" : "none",
      transition: "box-shadow .2s var(--ease), transform .2s var(--ease)",
    }}>
      {landed && personalBest && <Burst color={PINK} n={26} spread={120} />}

      <span className="dl-stk r" style={{ background: PANEL, color: CREAM, marginBottom: 9 }}>COINS EARNED</span>

      <div style={{ fontSize: "clamp(40px, 13vw, 58px)", fontWeight: 900, lineHeight: 1, letterSpacing: "-.04em" }}>
        🪙 <CountUp to={coins} dur={1100} onDone={() => setLanded(true)} />
      </div>

      {landed && personalBest && (
        <div className="dl-in" style={{ marginTop: 9 }}>
          <span className="dl-stk" style={{ background: PANEL, color: CREAM, fontSize: 10 }}>★ BEST WIN YET</span>
        </div>
      )}

      {weeklyTotal != null && (
        <div className="dl-in" style={{ marginTop: 11 }}>
          <span className="dl-stk" style={{ background: PANEL, color: CREAM, fontSize: 9.5 }}>
            WEEKLY TOTAL · 🪙 {weeklyTotal}
          </span>
        </div>
      )}
    </div>
  );
}

/** The score sheet's own colour — Dota's gold, as a fill rather than a glow. */
const GOLD_SHEET = "var(--gold-fill)";

function Breakdown({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      flex: "1 1 0", background: PANEL, border: `2px solid ${LINE}`, borderRadius: R_CHIP,
      boxShadow: `2px 2px 0 ${LINE}`, padding: "10px 8px", textAlign: "center", boxSizing: "border-box",
    }}>
      <div style={{ fontSize: 23, fontWeight: 900, color: CREAM, fontVariantNumeric: "tabular-nums", lineHeight: 1, letterSpacing: "-.03em" }}>
        <CountUp to={value} dur={900} />
      </div>
      <div style={{ fontSize: 8.5, letterSpacing: 1.1, color: DIM, fontWeight: 900, marginTop: 5 }}>{label}</div>
    </div>
  );
}
