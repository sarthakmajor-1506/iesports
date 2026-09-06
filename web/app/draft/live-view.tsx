"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildEngine, rankCandidates, type DraftModel, type Engine } from "@/lib/draftlab";
import { counterMap, playerWinProb, tempoMap, draftingStyle, type TempoRow } from "@/lib/draftbot";
import { draftSequence } from "@/lib/draftSequence";
import type { Knowledge } from "@/lib/quiz";
import { QuizRound, type QuizResult } from "./quiz";
import {
  Shell, Band, Btn, Panel, Label, Field, VersusBar, TurnBanner, DraftTimeline,
  RED, CREAM, PANEL, LINE, MUTED, DIM, GREEN, GOLD,
} from "./ui";
import { TeamRow, HeroGrid, DraftStyles } from "./hero-art";
import { Col } from "./result";
import {
  useLiveRoom, useCountdown, useRoomActions, useTurnTimeout, TurnClock, playerId,
  type Seat,
} from "./live";

/**
 * Live head-to-head: two people, alternating picks (and, if the room was
 * created with bans on, bans too), 30 seconds a turn.
 *
 * The room document is the single source of truth — this component renders it and
 * asks the API to change it, never the other way round. The turn sequence comes
 * from the same `draftSequence()` solo uses (role 0 = host, role 1 = guest), so
 * the two modes cannot silently drift apart the way two hand-written sequences
 * eventually would.
 */
export function LiveView({
  model, knowledge, code, onLeave, motion, submitScore,
}: {
  model: DraftModel; knowledge: Knowledge | null; code: string; onLeave: () => void; motion: boolean;
  submitScore?: (mine: number[], theirs: number[], quiz: QuizResult | null) => void;
}) {
  const { room, err } = useLiveRoom(code);
  const { call, error, setError } = useRoomActions();
  const [search, setSearch] = useState("");
  const [quiz, setQuiz] = useState<QuizResult | null>(null);
  const [recapDone, setRecapDone] = useState(false);

  const engine: Engine = useMemo(() => buildEngine(model), [model]);
  const tempos = useMemo(() => tempoMap(model as { tempo?: TempoRow[] }), [model]);

  const me = playerId();
  const seat: Seat | null = room ? (room.host?.id === me ? "host" : room.guest?.id === me ? "guest" : null) : null;
  const seconds = useCountdown(room?.status === "drafting" ? room.deadline : null);

  const picks = useMemo(() => room?.picks ?? [], [room]);
  const seq = useMemo(() => draftSequence(!!room?.bans), [room?.bans]);
  const turnIdx = picks.length;
  const step = turnIdx < seq.length ? seq[turnIdx] : null;
  const whose: Seat | null = step ? (step.role === 0 ? "host" : "guest") : null;
  const myTurn = seat != null && whose === seat;
  const banning = step?.kind === "ban";
  const mineRole: 0 | 1 = seat === "guest" ? 1 : 0;

  const mine = useMemo(() => picks.filter((p) => p.by === seat && p.kind === "pick").map((p) => p.heroId), [picks, seat]);
  const theirs = useMemo(() => picks.filter((p) => p.by !== seat && p.kind === "pick").map((p) => p.heroId), [picks, seat]);
  const bans = useMemo(() => picks.filter((p) => p.kind === "ban").map((p) => ({ by: (p.by === seat ? "you" : "bot") as "you" | "bot", heroId: p.heroId })), [picks, seat]);

  const available = useMemo(() => {
    const used = new Set(picks.map((p) => p.heroId));
    return model.heroes.filter((h) => !used.has(h.id)).map((h) => h.id);
  }, [model, picks]);

  /** Sent with every pick so the server can substitute if a hero was just taken. */
  const fallback = useMemo(() => {
    if (!room || seat == null) return [];
    return rankCandidates(engine, mine, theirs, available, 0).slice(0, 12).map((c) => c.heroId);
  }, [engine, mine, theirs, available, room, seat]);

  /**
   * Take the open seat automatically.
   *
   * Someone arriving on a shared /draft?live=CODE link has not joined anything
   * yet — without this they would sit and watch an empty room while the host
   * waits for a guest who never registers.
   */
  const joinedRef = useRef(false);
  useEffect(() => {
    if (!room || joinedRef.current) return;
    const seated = room.host?.id === me || room.guest?.id === me;
    if (seated || room.guest) return;
    joinedRef.current = true;
    let stored = "";
    try { stored = localStorage.getItem("draftlab_name") || ""; } catch {}
    void call({ action: "join", code, name: stored || "Guest" });
  }, [room, me, call, code]);

  const submit = useCallback((heroId: number) => {
    if (!myTurn) return;
    setSearch("");
    void call({ action: "pick", code, heroId, fallback });
  }, [call, code, fallback, myTurn]);

  // Either side may fire this; the server accepts only the first.
  const onExpire = useCallback(() => { void call({ action: "timeout", code, fallback }); }, [call, code, fallback]);
  useTurnTimeout(room, onExpire, seat != null);

  const done = room?.status === "done";
  const reported = useRef(false);
  useEffect(() => {
    if (!done || reported.current || !submitScore) return;
    if (mine.length !== 5 || theirs.length !== 5) return;
    if (knowledge && !quiz) return; // wait for the questions to be answered
    reported.current = true;
    submitScore(mine, theirs, quiz);
  }, [done, mine, theirs, quiz, knowledge, submitScore]);

  if (err) {
    return (
      <Shell tab={null} head={<Band title="Live room" compact onBack={onLeave} />}>
        <DraftStyles />
        <Panel style={{ marginTop: 12 }}><div style={{ color: RED, fontSize: 13 }}>{err}</div></Panel>
      </Shell>
    );
  }
  if (!room) {
    return (
      <Shell tab={null} head={<Band title={`Room ${code}`} compact onBack={onLeave} />}>
        <DraftStyles />
        <div className="dl-sheen" style={{ height: 120, borderRadius: 10, background: PANEL, marginTop: 12 }} />
      </Shell>
    );
  }

  const heroById = (id: number) => engine.heroById.get(id);
  const heroName = (id: number) => heroById(id)?.name ?? `#${id}`;
  const heroOf = (id: number) => { const h = heroById(id)!; return { id, img: h.img, name: h.name }; };
  const meName = (seat === "host" ? room.host?.name : room.guest?.name) ?? "You";
  const themName = (seat === "host" ? room.guest?.name : room.host?.name) ?? "Them";

  /* --------------------------------------------------------- waiting room */
  if (room.status === "waiting") {
    const link = typeof window !== "undefined" ? `${window.location.origin}/draft?live=${code}` : "";
    return (
      <Shell
        tab={null}
        head={<Band title="Live room" compact accent={GOLD} onBack={onLeave} sub="Share the code — the draft starts the moment they join" />}
        foot={
          <div style={{ flex: "0 0 auto", display: "flex", gap: 7, padding: "9px 12px calc(9px + env(safe-area-inset-bottom))", borderTop: `1px solid ${LINE}`, background: "#0b0910" }}>
            <div style={{ flex: 1 }}><Btn full tone="gold" onClick={() => navigator.clipboard?.writeText(code)}>COPY CODE</Btn></div>
            <div style={{ flex: 1 }}><Btn full tone="dark" onClick={() => navigator.clipboard?.writeText(link)}>COPY LINK</Btn></div>
          </div>
        }
      >
        <DraftStyles />
        <div className="dl-in" style={{ textAlign: "center", padding: "34px 0 0" }}>
          <div style={{ fontSize: 10, letterSpacing: 1.6, color: GOLD, fontWeight: 900 }}>ROOM CODE{room.bans ? " · BANS ON" : ""}</div>
          <div style={{ fontSize: "clamp(38px, 14vw, 62px)", fontWeight: 900, letterSpacing: 10, color: GOLD, margin: "8px 0 2px", lineHeight: 1, textShadow: `0 0 40px ${GOLD}44` }}>{code}</div>
          <div style={{ marginTop: 24, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, color: MUTED, fontSize: 12.5 }}>
            <span className="dl-turn" style={{ color: GREEN }}>●</span> {room.host?.name} is ready
          </div>
        </div>
      </Shell>
    );
  }

  /* --------------------------------------------------------------- recap */
  if (done && knowledge && !quiz && !recapDone) {
    return (
      <Shell tab={null} head={<Band title="Draft complete" compact accent={GOLD} sub="Both sides are locked in" />}>
        <DraftStyles />
        <div className="dl-in" style={{ display: "grid", gap: 12, paddingTop: 12, paddingBottom: 18 }}>
          <TeamRow side="them" label={(themName ?? "THEM").toUpperCase()} heroes={theirs.map(heroOf)} latest={null} motion={motion} height="clamp(86px, 25vw, 128px)" />
          <div style={{ textAlign: "center", fontSize: 10.5, fontWeight: 900, color: DIM, letterSpacing: 1.6 }}>VS</div>
          <TeamRow side="you" label="YOU" heroes={mine.map(heroOf)} latest={null} motion={motion} height="clamp(86px, 25vw, 128px)" />
          <Btn full tone="gold" size="l" onClick={() => setRecapDone(true)}>SEE THE QUESTIONS</Btn>
        </div>
      </Shell>
    );
  }

  /* ---------------------------------------------------------- the result */
  if (done) {
    const finalP = playerWinProb(engine, mine, theirs, true);
    const won = finalP > 0.5;
    const oppQuiz = seat ? (seat === "host" ? room.quizGuest : room.quizHost) ?? null : null;
    const { yoursWin, theirsWin } = counterMap(engine, mine, theirs);
    const style = draftingStyle(engine, mine, tempos);
    const autos = picks.filter((p) => p.auto && p.by === seat).length;

    if (knowledge && !quiz) {
      return (
        <Shell tab={null} head={<Band title="Draft closed" compact accent={GOLD} sub="Now the questions" />}>
          <DraftStyles />
          <div style={{ paddingTop: 10 }}>
            {/* Both players derive the same three questions from the room code, so
                nothing about the paper has to cross the network and neither can peek. */}
            <QuizRound knowledge={knowledge} seed={`room-${code}`}
              onDone={(r) => { setQuiz(r); void call({ action: "quiz", code, points: r.points, correct: r.correct }); }} />
          </div>
        </Shell>
      );
    }

    return (
      <Shell
        tab={null}
        head={<Band compact accent={won ? GREEN : RED} title={won ? `You beat ${themName}` : `${themName} beat you`} />}
        foot={
          <div style={{ flex: "0 0 auto", display: "flex", gap: 7, padding: "9px 12px calc(9px + env(safe-area-inset-bottom))", borderTop: `1px solid ${LINE}`, background: "#0b0910" }}>
            <div style={{ flex: 1 }}><Btn full tone="gold" onClick={onLeave}>BACK TO DUEL</Btn></div>
          </div>
        }
      >
        <DraftStyles />
        <div className="dl-in" style={{ display: "grid", gap: 10, paddingTop: 10, paddingBottom: 14 }}>
          <Panel style={{ background: `linear-gradient(160deg, ${won ? "#0e2a17" : "#2a0f0d"}, ${PANEL})`, border: `1px solid ${won ? GREEN : RED}44` }}>
            <VersusBar p={finalP} left={meName.toUpperCase()} right={themName.toUpperCase()} />
          </Panel>

          {quiz && (
            <Panel style={{ background: `linear-gradient(150deg, ${PANEL}, #241a06)`, border: `1px solid ${GOLD}44` }}>
              <Label color={GOLD}>QUIZ ROUND</Label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, color: GREEN, fontWeight: 800, marginBottom: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meName}</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: GOLD, lineHeight: 1 }}>{quiz.points}</div>
                </div>
                <div style={{ fontSize: 12, color: DIM, fontWeight: 800 }}>vs</div>
                <div style={{ flex: 1, textAlign: "right", minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, color: RED, fontWeight: 800, marginBottom: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{themName}</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: oppQuiz ? CREAM : DIM, lineHeight: 1 }}>{oppQuiz ? oppQuiz.points : "…"}</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 7 }}>
                {oppQuiz
                  ? quiz.points > oppQuiz.points ? "You were faster on the questions."
                    : quiz.points < oppQuiz.points ? "They were faster on the questions."
                    : "Dead level on the questions."
                  : "Waiting for them to finish the questions…"}
              </div>
            </Panel>
          )}

          {autos > 0 && (
            <div style={{ fontSize: 12, color: GOLD }}>
              {autos} of your picks {autos === 1 ? "was" : "were"} made by the clock.
            </div>
          )}

          <TeamRow side="you" label={meName.toUpperCase()} heroes={mine.map(heroOf)} latest={null} motion={motion} height="clamp(78px, 22vw, 108px)" />
          <TeamRow side="them" label={themName.toUpperCase()} heroes={theirs.map(heroOf)} latest={null} motion={motion} height="clamp(78px, 22vw, 108px)" />

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

          <div style={{ borderRadius: 10, padding: "12px 13px", background: `linear-gradient(150deg, #241a06, ${PANEL})`, border: `1px solid ${GOLD}33` }}>
            <Label color={GOLD}>YOUR DRAFTING STYLE</Label>
            <div style={{ fontSize: 16, color: GOLD, fontWeight: 900 }}>{style.tag}</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2, lineHeight: 1.4 }}>{style.line}</div>
          </div>
        </div>
      </Shell>
    );
  }

  /* ----------------------------------------------------------- the draft */
  const q = search.trim().toLowerCase();
  const filtered = available.filter((id) => heroName(id).toLowerCase().includes(q));
  const lastPick = picks[picks.length - 1];
  const turnLabel = myTurn
    ? (banning ? "YOUR BAN — CHOOSE ONE TO REMOVE" : "YOUR PICK — LOCK IT IN")
    : `${themName ?? "THEY"} ${banning ? "ARE BANNING…" : "ARE PICKING…"}`.toUpperCase();

  return (
    <Shell
      tab={null}
      head={
        <Band
          compact accent={banning ? RED : myTurn ? GOLD : MUTED} onBack={onLeave}
          title={`${meName} vs ${themName}`}
          sub={`Live · room ${code} · Round ${turnIdx + 1} / ${seq.length}`}
        >
          <div style={{ display: "flex", alignItems: "stretch", gap: 8, marginTop: 8 }}>
            <TurnClock seconds={seconds} yours={myTurn} size={50} />
            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
              <TurnBanner active={myTurn} label={turnLabel} accent={banning ? RED : GOLD} />
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            <DraftTimeline seq={seq} current={Math.min(turnIdx, seq.length - 1)} mineRole={mineRole} />
          </div>
          <div style={{ display: "grid", gap: 7, marginTop: 8 }}>
            <TeamRow side="them" label={(themName ?? "THEM").toUpperCase()} motion={motion} height="clamp(78px, 23vw, 116px)"
              heroes={theirs.map(heroOf)} latest={theirs[theirs.length - 1] ?? null}
              status={{ text: !myTurn ? (banning ? "banning…" : "picking…") : "idle", active: !myTurn }} />
            <TeamRow side="you" label="YOU" motion={motion} height="clamp(78px, 23vw, 116px)"
              heroes={mine.map(heroOf)} latest={mine[mine.length - 1] ?? null} />
          </div>
          <Field
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={myTurn ? (banning ? "Search — banning" : "Search heroes…") : "Waiting for them…"}
            disabled={!myTurn}
            style={{ marginTop: 8, padding: "7px 11px", minHeight: 34, opacity: myTurn ? 1 : .4, borderColor: banning && myTurn ? RED : LINE }}
          />
        </Band>
      }
    >
      <DraftStyles />
      {lastPick?.auto && (
        <div style={{ fontSize: 11.5, color: RED, padding: "8px 2px 0" }}>
          Time ran out — <strong style={{ color: CREAM }}>{heroName(lastPick.heroId)}</strong> was picked automatically.
        </div>
      )}
      {error && <div style={{ color: RED, fontSize: 12, padding: "8px 2px 0" }} onClick={() => setError(null)}>{error}</div>}
      <div style={{ padding: "9px 0 16px", opacity: myTurn ? 1 : .32, pointerEvents: myTurn ? "auto" : "none" }}>
        <HeroGrid ids={filtered} byId={heroById} onPick={submit} dim={banning} />
      </div>
    </Shell>
  );
}
