"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildQuiz, scoreAnswer, QUIZ_SECONDS, MAX_POINTS,
  type Knowledge, type Question,
} from "@/lib/quiz";
import { Btn, Label, Pips, RED, CREAM, PANEL, PANEL_2, LINE, MUTED, DIM, GREEN, GOLD } from "./ui";

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
        <Label color={GOLD}>{title}</Label>
        <div style={{ fontSize: "clamp(21px, 6.5vw, 28px)", fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.12, marginBottom: 7 }}>
          Three questions.<br />Ten seconds each.
        </div>
        <p style={{ color: MUTED, fontSize: 12.5, lineHeight: 1.5, margin: "0 0 14px" }}>
          Abilities and items. Your points are the seconds you have left — an instant answer is worth {MAX_POINTS},
          wrong or too slow is nothing.
        </p>
        <Btn full tone="gold" size="l" onClick={() => { setCountdown(3); setPhase("count"); }}>I&apos;M READY</Btn>
      </div>
    );
  }

  if (phase === "count") {
    return (
      <div style={{ ...panel(), textAlign: "center", padding: "44px 16px" }}>
        <div key={countdown} style={{
          fontSize: 72, fontWeight: 900, color: GOLD, lineHeight: 1,
          animation: "dl-slam .5s cubic-bezier(.2,.9,.3,1.3)", textShadow: `0 0 40px ${GOLD}66`,
        }}>{countdown === 0 ? "GO" : countdown}</div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="dl-in" style={panel()}>
        <Label color={GOLD}>ROUND COMPLETE</Label>
        <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 3 }}>
          <span style={{ fontSize: 44, fontWeight: 900, color: GOLD, lineHeight: 1 }}>{result.points}</span>
          <span style={{ fontSize: 16, color: MUTED, fontWeight: 700 }}>/ {questions.length * MAX_POINTS}</span>
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 11 }}>{result.correct} of {questions.length} correct</div>
        {result.rounds.map((r, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "6px 9px", borderRadius: 9,
            background: r.correct ? `${GREEN}14` : `${RED}14`, marginBottom: 4,
          }}>
            <span style={{ fontSize: 13, color: r.correct ? GREEN : RED, fontWeight: 900 }}>{r.correct ? "✓" : "✕"}</span>
            <span style={{ fontSize: 11.5, color: CREAM, flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.prompt}</span>
            <span style={{ fontSize: 13, fontWeight: 900, color: r.points ? GOLD : DIM, fontVariantNumeric: "tabular-nums" }}>+{r.points}</span>
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
    <div style={panel()}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
        <Pips total={3} filled={idx + 1} color={GOLD} />
        <span style={{ flex: "1 1 auto" }} />
        <span style={{
          fontSize: 21, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: urgent ? RED : GOLD,
          animation: urgent && !showing ? "dl-pulse .6s ease-in-out infinite" : undefined,
        }}>{secs.toFixed(1)}</span>
      </div>
      <div style={{ height: 5, background: "#241f33", borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
        <div style={{
          width: `${frac * 100}%`, height: "100%",
          background: urgent ? RED : `linear-gradient(90deg, ${GOLD}, #d99a22)`,
          boxShadow: `0 0 12px ${urgent ? RED : GOLD}`,
        }} />
      </div>

      <div style={{ textAlign: "center", marginBottom: 11 }}>
        {q.img && (
          <div style={{
            width: q.imgShape === "square" ? 76 : 92, height: q.imgShape === "square" ? 76 : 68,
            margin: "0 auto 8px", borderRadius: 8, overflow: "hidden",
            border: `1px solid ${LINE}`, background: "#0c0a12", boxShadow: `0 6px 22px -10px ${GOLD}`,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={q.img} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
          </div>
        )}
        <div style={{ fontSize: q.prompt.length > 70 ? "13.5px" : "clamp(15px, 4.6vw, 19px)", fontWeight: 800, letterSpacing: -0.2, lineHeight: 1.3 }}>{q.prompt}</div>
        {q.hint && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 3 }}>{q.hint}</div>}
      </div>

      <div style={{ display: "grid", gap: 6, gridTemplateColumns: optionsHaveArt ? "1fr 1fr" : "1fr" }}>
        {q.options.map((o, i) => {
          const isChosen = chosen === i;
          const reveal = showing && (o.correct || isChosen);
          const tone = !reveal ? null : o.correct ? GREEN : RED;
          return (
            <button
              key={i} className="dl-btn" disabled={phase !== "asking"} onClick={() => answer(i)}
              style={{
                display: "flex", alignItems: "center", gap: 8, textAlign: "left",
                padding: optionsHaveArt ? "8px" : "11px 13px", borderRadius: 8,
                cursor: phase === "asking" ? "pointer" : "default",
                background: tone ? `${tone}22` : PANEL_2, border: `1.5px solid ${tone ?? LINE}`,
                color: CREAM, fontSize: 13.5, fontWeight: 700, minHeight: 44,
                boxShadow: tone ? `0 0 18px -6px ${tone}` : "none",
                flexDirection: optionsHaveArt ? "column" : "row",
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
                <span style={{ fontSize: 15, color: tone!, fontWeight: 900 }}>{o.correct ? "✓" : "✕"}</span>
              )}
            </button>
          );
        })}
      </div>

      {showing && (
        <div className="dl-in" style={{ marginTop: 10, textAlign: "center" }}>
          {/* A correct answer that ran the clock out still scores 0, but calling
              that a "miss" tells the player they were wrong when they were not. */}
          <div style={{ fontSize: 19, fontWeight: 900, color: gained ? GOLD : chosen != null && q.options[chosen].correct ? GREEN : MUTED }}>
            {gained ? `+${gained}`
              : chosen == null ? "OUT OF TIME"
              : q.options[chosen].correct ? "RIGHT — BUT TOO SLOW"
              : "MISS"}
          </div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{q.explain}</div>
        </div>
      )}
    </div>
  );
}

const panel = (): React.CSSProperties => ({
  background: PANEL, border: `1px solid ${LINE}`, borderRadius: 10, padding: "14px 13px",
});
