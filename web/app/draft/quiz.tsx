"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildQuiz, scoreAnswer, QUIZ_SECONDS, MAX_POINTS,
  type Knowledge, type Question,
} from "@/lib/quiz";
import {
  Btn, Pips, CountUp, Mark,
  CREAM, PANEL, PANEL_2, LINE, MUTED, DIM, GOLD,
  LEMON, MINT, PINK, ON_FILL, R_CARD, R_CHIP, BW, lift,
} from "./ui";
import { Burst } from "./theme";
import { play } from "./sound";

export type QuizResult = {
  points: number;
  answered: number;
  correct: number;
  /** Chosen option index per question, or null for a timeout — the server re-marks from these. */
  picks: (number | null)[];
  seed: string;
  rounds: { prompt: string; correct: boolean; points: number; msLeft: number }[];
};

/**
 * Three questions, ten seconds each, points equal to the seconds left.
 *
 * The clock is the whole game here, so it counts only time the page was actually
 * visible — see the note on the clock refs below.
 */
export function QuizRound({
  knowledge, seed, onDone, title = "ABILITY & ITEM ROUND",
}: {
  knowledge: Knowledge; seed: string; onDone: (r: QuizResult) => void; title?: string;
}) {
  const questions = useMemo(() => buildQuiz(knowledge, seed, 3), [knowledge, seed]);

  const [phase, setPhase] = useState<"ready" | "count" | "asking" | "feedback" | "done">("ready");
  const [idx, setIdx] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [msLeft, setMsLeft] = useState(QUIZ_SECONDS * 1000);
  const [chosen, setChosen] = useState<number | null>(null);
  const [gained, setGained] = useState(0);
  const [result, setResult] = useState<QuizResult>({ points: 0, answered: 0, correct: 0, picks: [], seed, rounds: [] });

  /**
   * The question clock, counted only while the page is actually visible.
   *
   * A plain `performance.now()` delta looks right until the tab is backgrounded:
   * requestAnimationFrame stops firing, so the displayed countdown freezes at
   * 10.0 while real time keeps draining, and a correct answer then scores 0 —
   * measured, not hypothetical. Accumulating visible time only keeps the number
   * on screen and the number used for scoring the same, and means backgrounding
   * neither helps nor punishes.
   */
  const accRef = useRef(0);
  const resumeRef = useRef<number | null>(null);
  const elapsed = () => accRef.current + (resumeRef.current != null ? performance.now() - resumeRef.current : 0);
  const restartClock = () => { accRef.current = 0; resumeRef.current = performance.now(); };

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        if (resumeRef.current != null) { accRef.current += performance.now() - resumeRef.current; resumeRef.current = null; }
      } else if (resumeRef.current == null) {
        resumeRef.current = performance.now();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const q: Question | undefined = questions[idx];

  /* Preload art while the player is still on the ready screen. */
  useEffect(() => {
    for (const question of questions) {
      if (question.img) { const i = new Image(); i.src = question.img; }
      for (const o of question.options) if (o.img) { const i = new Image(); i.src = o.img; }
    }
  }, [questions]);

  useEffect(() => {
    if (phase !== "count") return;
    if (countdown <= 0) {
      restartClock();
      setMsLeft(QUIZ_SECONDS * 1000);
      setPhase("asking");
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 700);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  const finish = useCallback((r: QuizResult) => { setResult(r); setPhase("done"); onDone(r); }, [onDone]);

  const answer = useCallback((optionIndex: number | null) => {
    if (phase !== "asking" || !q) return;
    const left = Math.max(0, QUIZ_SECONDS * 1000 - elapsed());
    const isCorrect = optionIndex != null && q.options[optionIndex].correct;
    const pts = scoreAnswer(isCorrect, left);
    setChosen(optionIndex);
    setGained(pts);
    play(isCorrect ? "correct" : "wrong");

    const next: QuizResult = {
      points: result.points + pts,
      answered: result.answered + (optionIndex == null ? 0 : 1),
      correct: result.correct + (isCorrect ? 1 : 0),
      picks: [...result.picks, optionIndex],
      seed,
      rounds: [...result.rounds, { prompt: q.prompt, correct: isCorrect, points: pts, msLeft: left }],
    };
    setResult(next);
    setPhase("feedback");

    setTimeout(() => {
      if (idx + 1 >= questions.length) { finish(next); return; }
      setIdx(idx + 1);
      setChosen(null);
      restartClock();
      setMsLeft(QUIZ_SECONDS * 1000);
      setPhase("asking");
    }, 1500);
  }, [phase, q, result, idx, questions.length, finish, seed]);

  /*
   * A tick for each of the last three seconds. Driven off a whole-second
   * boundary rather than the rAF loop, so it fires three times, not sixty.
   */
  const tickedAt = useRef(-1);
  useEffect(() => {
    if (phase !== "asking") { tickedAt.current = -1; return; }
    const sec = Math.ceil(msLeft / 1000);
    if (sec <= 3 && sec > 0 && tickedAt.current !== sec) { tickedAt.current = sec; play("tick"); }
  }, [phase, msLeft]);

  /* The clock. */
  useEffect(() => {
    if (phase !== "asking") return;
    let raf = 0;
    const poll = setInterval(() => { if (!document.hidden) setMsLeft(Math.max(0, QUIZ_SECONDS * 1000 - elapsed())); }, 250);
    const tick = () => {
      const left = Math.max(0, QUIZ_SECONDS * 1000 - elapsed());
      setMsLeft(left);
      if (left <= 0) { answer(null); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); clearInterval(poll); };
  }, [phase, answer]);

  /* ------------------------------------------------------------- screens */

  if (phase === "ready") {
    return (
      <div className="dl-in" style={panel()}>
        <span className="dl-stk" style={{ background: LEMON, marginBottom: 12 }}>{title}</span>
        <div style={{ fontSize: "clamp(21px, 6.5vw, 28px)", fontWeight: 900, letterSpacing: "-.035em", lineHeight: 1.12, marginBottom: 9 }}>
          <Mark c={LEMON}>Three questions.</Mark><br />Ten seconds each.
        </div>
        <p style={{ color: MUTED, fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, margin: "0 0 16px" }}>
          Abilities and items. Your points are the seconds you have left — an instant answer is worth {MAX_POINTS},
          wrong or too slow is nothing.
        </p>
        <Btn full tone="gold" size="l" onClick={() => { setCountdown(3); setPhase("count"); }}>I&apos;M READY</Btn>
      </div>
    );
  }

  if (phase === "count") {
    return (
      <div style={{ ...panel(), textAlign: "center", padding: "40px 16px" }}>
        {/* The number lands as a stamp: it arrives oversized and rotated and
            settles square. `dl-slam` was referenced here long before it was
            written, so until now the count simply appeared. */}
        <div key={countdown} style={{
          width: 108, height: 108, margin: "0 auto", borderRadius: "50%",
          display: "grid", placeItems: "center", boxSizing: "border-box",
          background: countdown === 0 ? MINT : LEMON, color: ON_FILL,
          border: `4px solid ${LINE}`, boxShadow: `6px 6px 0 ${LINE}`,
          fontSize: countdown === 0 ? 40 : 58, fontWeight: 900, lineHeight: 1, letterSpacing: "-.03em",
          animation: "dl-slam .5s cubic-bezier(.2,.9,.3,1.3) both",
        }}>{countdown === 0 ? "GO" : countdown}</div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="dl-in" style={panel()}>
        <span className="dl-stk" style={{ background: MINT, marginBottom: 11 }}>ROUND COMPLETE</span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 3 }}>
          <span style={{ fontSize: 46, fontWeight: 900, color: CREAM, lineHeight: 1, letterSpacing: "-.04em" }}>{result.points}</span>
          <span style={{ fontSize: 16, color: DIM, fontWeight: 800 }}>/ {questions.length * MAX_POINTS}</span>
        </div>
        <div style={{ fontSize: 12, color: MUTED, fontWeight: 700, marginBottom: 12 }}>{result.correct} of {questions.length} correct</div>
        {result.rounds.map((r, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 9, padding: "6px 10px", borderRadius: R_CHIP,
            background: r.correct ? MINT : PINK, color: ON_FILL,
            border: `2px solid ${LINE}`, boxShadow: `2px 2px 0 ${LINE}`, marginBottom: 6,
          }}>
            <span style={{ fontSize: 13, fontWeight: 900 }}>{r.correct ? "✓" : "✕"}</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.prompt}</span>
            <span style={{ fontSize: 13, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>+{r.points}</span>
          </div>
        ))}
      </div>
    );
  }

  if (!q) return null;

  const secs = msLeft / 1000;
  const frac = Math.max(0, Math.min(1, secs / QUIZ_SECONDS));
  const urgent = secs <= 3.5;
  const showing = phase === "feedback";
  const optionsHaveArt = q.options.some((o) => o.img);

  return (
    <div style={{ ...panel(), position: "relative", overflow: "hidden" }}>
      {showing && chosen != null && q.options[chosen].correct && <Burst color={MINT} />}
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
        <Pips total={3} filled={idx + 1} color={LEMON} />
        <span style={{ fontSize: 12, fontWeight: 900, color: GOLD, fontVariantNumeric: "tabular-nums" }}>
          <CountUp to={result.points} dur={520} /> pts
        </span>
        <span style={{ flex: "1 1 auto" }} />
        <span style={{
          fontSize: 21, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: CREAM, letterSpacing: "-.03em",
          animation: urgent && !showing ? "dl-pulse .6s ease-in-out infinite" : undefined,
        }}>{secs.toFixed(1)}</span>
      </div>
      {/* The clock is a meter in an ink capsule — the same object the landing
          page fills for tournament slots. It turns pink at 3.5 seconds, which is
          the warning; the number beside it is only the confirmation. */}
      <div style={{
        height: 13, background: PANEL_2, borderRadius: 999, overflow: "hidden", marginBottom: 13,
        border: `${BW}px solid ${LINE}`, boxSizing: "border-box",
      }}>
        <div style={{
          width: `${frac * 100}%`, height: "100%", background: urgent ? PINK : LEMON,
          borderRight: frac > 0.02 && frac < 0.98 ? `${BW}px solid ${LINE}` : "none", boxSizing: "border-box",
        }} />
      </div>

      <div style={{ textAlign: "center", marginBottom: 11 }}>
        {q.img && (
          <div style={{
            width: q.imgShape === "square" ? 76 : 92, height: q.imgShape === "square" ? 76 : 68,
            margin: "0 auto 11px", borderRadius: R_CHIP, overflow: "hidden", boxSizing: "border-box",
            border: `${BW}px solid ${LINE}`, background: "var(--tile)", boxShadow: `3px 3px 0 ${LINE}`,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={q.img} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
          </div>
        )}
        <div style={{ fontSize: q.prompt.length > 70 ? "13.5px" : "clamp(15px, 4.6vw, 19px)", fontWeight: 900, letterSpacing: "-.02em", lineHeight: 1.3 }}>{q.prompt}</div>
        {q.hint && <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 700, marginTop: 4 }}>{q.hint}</div>}
      </div>

      {/* An answer reveals as a fill, not a glow: mint for right, pink for wrong,
          and near-black on both. The gap is 8 so the hard shadows clear. */}
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: optionsHaveArt ? "1fr 1fr" : "1fr" }}>
        {q.options.map((o, i) => {
          const isChosen = chosen === i;
          const reveal = showing && (o.correct || isChosen);
          const fill = !reveal ? null : o.correct ? MINT : PINK;
          return (
            <button
              key={i} className="dl-btn" disabled={phase !== "asking"} onClick={() => answer(i)}
              style={{
                display: "flex", alignItems: "center", gap: 8, textAlign: "left",
                padding: optionsHaveArt ? "9px" : "12px 15px", borderRadius: R_CHIP, boxSizing: "border-box",
                cursor: phase === "asking" ? "pointer" : "default", fontFamily: "inherit",
                background: fill ?? PANEL_2, border: `${BW}px solid ${LINE}`,
                color: fill ? ON_FILL : CREAM, fontSize: 13.5, fontWeight: 800, minHeight: 50,
                flexDirection: optionsHaveArt ? "column" : "row", ...lift(3),
              }}
            >
              {o.img && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.img} alt="" style={{ width: "100%", height: 40, objectFit: "contain", borderRadius: 7 }} />
              )}
              <span style={{
                flex: "1 1 auto", minWidth: 0, fontSize: optionsHaveArt ? 11.5 : 13.5,
                textAlign: optionsHaveArt ? "center" : "left", width: "100%",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{o.label}</span>
              {reveal && !optionsHaveArt && (
                <span style={{ fontSize: 15, fontWeight: 900 }}>{o.correct ? "✓" : "✕"}</span>
              )}
            </button>
          );
        })}
      </div>

      {showing && (
        <div className="dl-in" style={{ marginTop: 10, textAlign: "center" }}>
          {/* A correct answer that ran the clock out still scores 0, but calling
              that a "miss" tells the player they were wrong when they were not. */}
          <span className="dl-stk flat" style={{
            background: gained ? LEMON : chosen != null && q.options[chosen].correct ? MINT : PINK,
            fontSize: 15, padding: "6px 14px", borderWidth: 3, boxShadow: `4px 4px 0 ${LINE}`,
          }}>
            {gained ? `+${gained}`
              : chosen == null ? "OUT OF TIME"
              : q.options[chosen].correct ? "RIGHT — BUT TOO SLOW"
              : "MISS"}
          </span>
          <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 700, marginTop: 7, lineHeight: 1.45 }}>{q.explain}</div>
        </div>
      )}
    </div>
  );
}

/**
 * The question sheet.
 *
 * One card, and everything for a round happens inside it — the ink outline and
 * the hard shadow are what separate the ten seconds you are inside from the page
 * around them. Kept as a function rather than the shared `<Panel>` because the
 * asking screen needs `position: relative` for the confetti and its own padding.
 */
const panel = (): React.CSSProperties => ({
  background: PANEL, border: `${BW}px solid ${LINE}`, borderRadius: R_CARD,
  boxShadow: `5px 5px 0 ${LINE}`, padding: "16px 15px",
});
