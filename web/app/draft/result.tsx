"use client";

import { type Engine } from "@/lib/draftlab";
import { counterMap, teamTempo, draftingStyle, type TempoRow, type CounterEdge } from "@/lib/draftbot";
import {
  Band, Btn, Panel, Label, VersusBar,
  RED, CREAM, PANEL, LINE, MUTED, DIM, GREEN, GOLD,
} from "./ui";
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
  return <Band compact accent={won ? GREEN : RED} onBack={onMenu}
    title={won ? "You won the draft" : "You lost the draft"} />;
}

export function ResultActions({ onAgain, onMenu }: { onAgain: () => void; onMenu: () => void }) {
  return (
    <div style={{
      flex: "0 0 auto", display: "flex", gap: 7, padding: "9px 12px calc(9px + env(safe-area-inset-bottom))",
      borderTop: `1px solid ${LINE}`, background: "#0b0910",
    }}>
      <div style={{ flex: 2 }}><Btn full tone="gold" onClick={onAgain}>REMATCH</Btn></div>
      <div style={{ flex: 1 }}><Btn full tone="ghost" onClick={onMenu}>MENU</Btn></div>
    </div>
  );
}

export function Result({
  engine, events, yours, theirs, finalP, quiz, tempos, motion, scored,
}: {
  engine: Engine; events: ResultEv[]; yours: number[]; theirs: number[]; finalP: number | null;
  quiz: { points: number; correct: number; rounds: { correct: boolean; points: number }[] } | null;
  tempos: Map<number, TempoRow>; motion: boolean;
  scored: { points: number; draftPoints: number; quizPoints: number } | null;
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
      <div style={{
        borderRadius: 10, padding: "14px 14px",
        background: `linear-gradient(160deg, ${won ? "#0e2a17" : "#2a0f0d"}, ${PANEL})`,
        border: `1px solid ${won ? GREEN : RED}44`,
      }}>
        <div style={{ fontSize: 9.5, letterSpacing: 2, color: won ? GREEN : RED, fontWeight: 900, opacity: .8, marginBottom: 5 }}>
          DRAFT COMPLETE
        </div>
        <div style={{
          fontSize: "clamp(19px, 5.8vw, 25px)", fontWeight: 900, letterSpacing: -0.4,
          color: won ? GREEN : RED, marginBottom: 12, lineHeight: 1.12,
          textShadow: `0 0 24px ${won ? GREEN : RED}33`,
        }}>
          {won ? `You out-drafted ${them}.` : `${them} out-drafted you.`}
        </div>
        <VersusBar p={p} left="YOU" right={them.toUpperCase()} />
      </div>

      {(quiz || scored) && (
        <Panel style={{ background: `linear-gradient(150deg, ${PANEL}, #241a06)`, border: `1px solid ${GOLD}44`, padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div>
              <Label color={GOLD} style={{ marginBottom: 2 }}>{scored ? "SCORE THIS GAME" : "QUIZ ROUND"}</Label>
              <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                <span style={{ fontSize: 28, fontWeight: 900, color: GOLD, lineHeight: 1 }}>
                  {scored ? scored.points : quiz?.points ?? 0}
                </span>
                {scored
                  ? <span style={{ fontSize: 11, color: MUTED, fontWeight: 700 }}>{scored.draftPoints} draft + {scored.quizPoints} quiz</span>
                  : <span style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>/ {(quiz?.rounds.length ?? 3) * 10}</span>}
              </div>
            </div>
            <span style={{ flex: "1 1 auto" }} />
            {quiz && (
              <div style={{ display: "flex", gap: 4 }}>
                {quiz.rounds.map((r, i) => (
                  <span key={i} style={{
                    width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center",
                    background: r.correct ? `${GREEN}22` : `${RED}22`,
                    border: `1px solid ${r.correct ? GREEN : RED}55`,
                    color: r.correct ? GREEN : RED, fontSize: 11.5, fontWeight: 900,
                  }}>{r.correct ? `+${r.points}` : "0"}</span>
                ))}
              </div>
            )}
          </div>
        </Panel>
      )}

      <TeamRow side="you" label="YOUR FIVE" heroes={yours.map(heroOf)} latest={null} motion={motion} height="clamp(80px, 23vw, 116px)" />
      <TeamRow side="them" label={them.toUpperCase()} heroes={theirs.map(heroOf)} latest={null} motion={motion} height="clamp(80px, 23vw, 116px)" />

      {theirBest && theirBest.swing < -0.4 && (
        <Beat color={RED} label="THE PICK THAT HURT">
          Their <b>{heroName(theirBest.heroId)}</b> took {Math.abs(theirBest.swing).toFixed(1)} points off your draft.
        </Beat>
      )}
      {bestBan && bestBan.deniedRank != null && bestBan.deniedRank <= 10 && (
        <Beat color={GREEN} label="YOUR BEST BAN">
          You took <b>{heroName(bestBan.heroId)}</b> away — their
          {bestBan.deniedRank === 1 ? " top" : ` #${bestBan.deniedRank}`} option at the time.
        </Beat>
      )}
      {yourWorst && yourWorst.regret > 0.4 && (
        <Beat color={GOLD} label="YOUR LOOSEST PICK">
          {yourWorst.punishedBy != null
            ? <>You took <b>{heroName(yourWorst.heroId)}</b> into their <b>{heroName(yourWorst.punishedBy)}</b>.</>
            : <>Your <b>{heroName(yourWorst.heroId)}</b> was the loose one.</>}
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 3 }}>
            Ranked {yourWorst.rank} of {yourWorst.pool}. <b style={{ color: CREAM }}>{heroName(yourWorst.bestAlt)}</b> was worth {yourWorst.regret.toFixed(1)} more.
          </div>
        </Beat>
      )}
      {tempoLine && <Beat color={MUTED} label="SHAPE OF THE GAME">{tempoLine}</Beat>}

      <Panel style={{ padding: "10px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
          <Label style={{ marginBottom: 0 }}>THE COUNTER WAR</Label>
          <span style={{ fontSize: 12, fontWeight: 800, color: yoursWin.length >= theirsWin.length ? GREEN : RED }}>
            {yoursWin.length} — {theirsWin.length}
          </span>
        </div>
        <Col title="YOU COUNTERED" rows={yoursWin.slice(0, 3)} color={GREEN} engine={engine} />
        <div style={{ height: 8 }} />
        <Col title="THEY COUNTERED" rows={theirsWin.slice(0, 3)} color={RED} engine={engine} />
      </Panel>

      <div style={{
        borderRadius: 10, padding: "12px 13px",
        background: `linear-gradient(150deg, #241a06, ${PANEL})`, border: `1px solid ${GOLD}33`,
      }}>
        <Label color={GOLD}>YOUR DRAFTING STYLE</Label>
        <div style={{ fontSize: 16, color: GOLD, fontWeight: 900, letterSpacing: -0.2 }}>{style.tag}</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>{style.line}</div>
      </div>
    </div>
  );
}

function Beat({ color, label, children }: { color: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ borderLeft: `3px solid ${color}`, paddingLeft: 10 }}>
      <div style={{ fontSize: 9, letterSpacing: 1.4, color: DIM, fontWeight: 800, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: CREAM, lineHeight: 1.4 }}>{children}</div>
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
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 0" }}>
          <span style={{ width: 24, height: 15, flexShrink: 0, borderRadius: 3, overflow: "hidden" }}>
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
