"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildEngine, rankCandidates, type DraftModel, type Engine } from "@/lib/draftlab";
import { counterMap, playerWinProb, tempoMap, draftingStyle, type TempoRow } from "@/lib/draftbot";
import { draftSequence } from "@/lib/draftSequence";
import type { Knowledge } from "@/lib/quiz";
import { QuizRound, type QuizResult } from "./quiz";
import {
  Shell, Band, Btn, Panel, Label, Field, VersusBar,
  CREAM, PANEL, LINE, MUTED, DIM, GREEN, ENEMY,
  LEMON, MINT, PINK, LILAC, ON_FILL, PAPER, BW_2,
} from "./ui";
import { Skeleton } from "./theme";
import { TeamRow, BanStrip, AttributePool } from "./hero-art";
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
          <Panel style={{ marginTop: 12 }}><div style={{ color: ENEMY, fontSize: 13 }}>{err}</div></Panel>
      </Shell>
    );
  }
  if (!room) {
    return (
      <Shell tab={null} head={<Band title={`Room ${code}`} compact onBack={onLeave} />}>
          <Skeleton h={120} style={{ marginTop: 12 }} />
      </Shell>
    );
  }

  const heroById = (id: number) => engine.heroById.get(id);
  const heroName = (id: number) => heroById(id)?.name ?? `#${id}`;
  const heroOf = (id: number) => { const h = heroById(id)!; return { id, img: h.img, name: h.name }; };
  const poolHero = (id: number) => { const h = heroById(id); return h ? { img: h.img, name: h.name, attr: h.attr } : undefined; };
  const meName = (seat === "host" ? room.host?.name : room.guest?.name) ?? "You";
  const themName = (seat === "host" ? room.guest?.name : room.host?.name) ?? "Them";

  /* --------------------------------------------------------- waiting room */
  if (room.status === "waiting") {
    const link = typeof window !== "undefined" ? `${window.location.origin}/draft?live=${code}` : "";
    return (
      <Shell
        tab={null}
        head={<Band title="Live room" compact accent={LEMON} onBack={onLeave} sub="Share the code — the draft starts the moment they join" />}
        foot={
          <div style={{ flex: "0 0 auto", display: "flex", gap: 7, padding: "9px 12px calc(9px + env(safe-area-inset-bottom))", borderTop: `${BW_2}px solid ${LINE}`, background: PAPER }}>
            <div style={{ flex: 1 }}><Btn full tone="gold" onClick={() => navigator.clipboard?.writeText(code)}>COPY CODE</Btn></div>
            <div style={{ flex: 1 }}><Btn full tone="dark" onClick={() => navigator.clipboard?.writeText(link)}>COPY LINK</Btn></div>
          </div>
        }
      >
          <div className="dl-in" style={{ textAlign: "center", padding: "30px 0 0" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 7, flexWrap: "wrap" }}>
            <span className="dl-stk" style={{ background: LEMON, fontSize: 10 }}>ROOM CODE{room.bans ? " · BANS ON" : ""}</span>
            {/* Ranked is decided when the guest sits down, so the honest thing to
                say while waiting is what it depends on. */}
            <span className="dl-stk r" style={{ background: room.hostSignedIn ? MINT : PANEL, color: room.hostSignedIn ? ON_FILL : CREAM, fontSize: 9 }}>
              {room.hostSignedIn ? "RANKED IF THEY SIGN IN" : "UNRANKED"}
            </span>
          </div>
          {/* The code is the whole screen, so it gets the one piece of paper on
              it: a tilted card the other person is being asked to type from. */}
          <div className="dl-card" style={{
            margin: "16px 6px 0", padding: "18px 10px", transform: "rotate(-1.2deg)",
            boxShadow: `9px 9px 0 ${LINE}`,
          }}>
            <div style={{
              fontSize: "clamp(36px, 13vw, 58px)", fontWeight: 900, letterSpacing: ".18em",
              color: CREAM, lineHeight: 1, paddingLeft: ".18em",
            }}>{code}</div>
          </div>
          <div style={{ marginTop: 22 }}>
            <span className="dl-stk r" style={{ background: MINT, fontSize: 9.5 }}>
              <span className="dl-turn" style={{ width: 7, height: 7, borderRadius: 4, background: ON_FILL, flex: "none" }} />
              {room.host?.name} is ready
            </span>
          </div>
        </div>
      </Shell>
    );
  }

  /* --------------------------------------------------------------- recap */
  if (done && knowledge && !quiz && !recapDone) {
    return (
      <Shell tab={null} head={<Band title="Draft complete" compact accent={MINT} sub="Both sides are locked in" />}>
          <div className="dl-in" style={{ display: "grid", gap: 12, paddingTop: 12, paddingBottom: 18 }}>
          <TeamRow side="them" label={(themName ?? "THEM").toUpperCase()} heroes={theirs.map(heroOf)} latest={null} motion={motion} height="clamp(86px, 25vw, 128px)" />
          <div style={{ textAlign: "center" }}>
            <span className="dl-stk" style={{ background: LILAC, fontSize: 10 }}>VS</span>
          </div>
          <TeamRow side="you" label="YOU" heroes={mine.map(heroOf)} latest={null} motion={motion} height="clamp(86px, 25vw, 128px)" />
          {/* Live rooms can be created with bans on, but the recap never showed
              what came off the board — the same strip solo has. */}
          {bans.length > 0 && <BanStrip bans={bans} byId={heroById} />}
          <Btn full tone="gold" size="l" onClick={() => setRecapDone(true)}>SEE THE QUESTIONS</Btn>
        </div>
      </Shell>
    );
  }

  /* ---------------------------------------------------------- the result */
  if (done) {
    /*
     * The server's verdict wins when it has one.
     *
     * The model also runs here, and it agrees — but the browser's copy is a
     * number the winner's own machine produced, and the rating was moved from
     * `result`. Showing a locally computed outcome beside a server-paid rating
     * is how the two quietly disagree in front of the player. The local value
     * is the fallback for a room that has not settled yet.
     */
    const settled = room.result ?? null;
    const finalP = playerWinProb(engine, mine, theirs, true);
    const won = settled
      ? (settled.outcome === (seat === "host" ? "host" : "guest"))
      : finalP > 0.5;
    const drew = settled?.outcome === "draw";
    const eloDelta = settled ? (seat === "host" ? settled.deltaHost : settled.deltaGuest) : 0;
    const oppQuiz = seat ? (seat === "host" ? room.quizGuest : room.quizHost) ?? null : null;
    const { yoursWin, theirsWin } = counterMap(engine, mine, theirs);
    const style = draftingStyle(engine, mine, tempos);
    const autos = picks.filter((p) => p.auto && p.by === seat).length;

    if (knowledge && !quiz) {
      return (
        <Shell tab={null} head={<Band title="Draft closed" compact accent={LEMON} sub="Now the questions" />}>
              <div style={{ paddingTop: 10 }}>
            {/* Both players derive the same questions from the room code, so
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
        head={
          <Band compact
            accent={drew ? LILAC : won ? MINT : PINK}
            title={drew ? "Dead level" : won ? `You beat ${themName}` : `${themName} beat you`}
            sub={room.ranked
              ? (drew
                ? "Too close for the model to call — no rating moved"
                : `Ladder · ${eloDelta > 0 ? "+" : ""}${eloDelta} rating`)
              : "Unranked — both players need to be signed in"}
          />
        }
        foot={
          <div style={{ flex: "0 0 auto", display: "flex", gap: 7, padding: "9px 12px calc(9px + env(safe-area-inset-bottom))", borderTop: `${BW_2}px solid ${LINE}`, background: PAPER }}>
            <div style={{ flex: 1 }}><Btn full tone="gold" onClick={onLeave}>BACK TO DUEL</Btn></div>
          </div>
        }
      >
          <div className="dl-in" style={{ display: "grid", gap: 10, paddingTop: 10, paddingBottom: 14 }}>
          <Panel>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <span className="dl-stk" style={{ background: drew ? LILAC : won ? MINT : PINK }}>
                {drew ? "TOO CLOSE TO CALL" : won ? "YOU TOOK THE DRAFT" : "THEY TOOK THE DRAFT"}
              </span>
              {room.ranked && !drew && (
                <span className="dl-stk r" style={{ background: eloDelta >= 0 ? MINT : PINK, fontSize: 10 }}>
                  {eloDelta > 0 ? "+" : ""}{eloDelta} RATING
                </span>
              )}
            </div>
            <VersusBar p={settled ? (seat === "host" ? settled.hostWinProb : 1 - settled.hostWinProb) : finalP}
              left={meName.toUpperCase()} right={themName.toUpperCase()} />
          </Panel>

          {quiz && (
            <Panel>
              <span className="dl-stk" style={{ background: LEMON, marginBottom: 11 }}>QUIZ ROUND</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, color: GREEN, fontWeight: 900, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meName}</div>
                  <div style={{ fontSize: 27, fontWeight: 900, color: CREAM, lineHeight: 1, letterSpacing: "-.03em" }}>{quiz.points}</div>
                </div>
                <div style={{ fontSize: 12, color: DIM, fontWeight: 900 }}>vs</div>
                <div style={{ flex: 1, textAlign: "right", minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, color: ENEMY, fontWeight: 900, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{themName}</div>
                  <div style={{ fontSize: 27, fontWeight: 900, color: oppQuiz ? CREAM : DIM, lineHeight: 1, letterSpacing: "-.03em" }}>{oppQuiz ? oppQuiz.points : "…"}</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, marginTop: 8 }}>
                {oppQuiz
                  ? quiz.points > oppQuiz.points ? "You were faster on the questions."
                    : quiz.points < oppQuiz.points ? "They were faster on the questions."
                    : "Dead level on the questions."
                  : "Waiting for them to finish the questions…"}
              </div>
            </Panel>
          )}

          {autos > 0 && (
            <div>
              <span className="dl-stk" style={{ background: LEMON, fontSize: 9 }}>
                {autos} {autos === 1 ? "pick was" : "picks were"} made by the clock
              </span>
            </div>
          )}

          <TeamRow side="you" label={meName.toUpperCase()} heroes={mine.map(heroOf)} latest={null} motion={motion} height="clamp(78px, 22vw, 108px)" />
          <TeamRow side="them" label={themName.toUpperCase()} heroes={theirs.map(heroOf)} latest={null} motion={motion} height="clamp(78px, 22vw, 108px)" />

          <Panel style={{ padding: "11px 13px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <Label style={{ marginBottom: 0 }}>THE COUNTER WAR</Label>
              <span style={{ fontSize: 12, fontWeight: 900, color: yoursWin.length >= theirsWin.length ? GREEN : ENEMY }}>
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
      </Shell>
    );
  }

  /* ----------------------------------------------------------- the draft */
  const q = search.trim().toLowerCase();
  const filtered = available.filter((id) => heroName(id).toLowerCase().includes(q));
  const lastPick = picks[picks.length - 1];
  // Short enough to survive the band's centre column beside the clock — see the
  // note on the same label in the solo board.
  const turnLabel = myTurn
    ? (banning ? "YOUR BAN" : "YOUR PICK")
    : `${themName ?? "THEY"} ${banning ? "IS BANNING…" : "IS PICKING…"}`.toUpperCase();
  const turnHint = myTurn ? (banning ? " · take one away" : " · lock one in") : "";

  return (
    <Shell
      tab={null} atmos={0.4}
      head={
        /*
         * One line, with the clock in the header slot rather than a band of its
         * own. Live is the mode with the least room to spare — the seconds and
         * the heroes are what matter, and chrome between them is a cost.
         */
        <Band
          compact accent={banning ? PINK : myTurn ? LEMON : "transparent"} onBack={onLeave}
          title={turnLabel}
          sub={`Round ${turnIdx + 1} of ${seq.length}${turnHint} · room ${code}`}
          right={<TurnClock seconds={seconds} yours={myTurn} size={40} />}
        />
      }
    >
      <div style={{ display: "grid", gap: 8, paddingTop: 9 }}>
        <TeamRow side="them" label={(themName ?? "DIRE").toUpperCase()} motion={motion} height="clamp(96px, 29vw, 148px)"
          heroes={theirs.map(heroOf)} latest={theirs[theirs.length - 1] ?? null}
          status={{ text: !myTurn ? (banning ? "banning…" : "picking…") : "idle", active: !myTurn }} />
        <TeamRow side="you" label={(meName ?? "YOU").toUpperCase()} motion={motion} height="clamp(96px, 29vw, 148px)"
          heroes={mine.map(heroOf)} latest={mine[mine.length - 1] ?? null} />
      </div>

      <Field
        value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder={myTurn ? (banning ? "Search — banning" : "Search heroes…") : "Waiting for them…"}
        disabled={!myTurn}
        style={{ marginTop: 10, padding: "8px 14px", minHeight: 38, opacity: myTurn ? 1 : .45, background: banning && myTurn ? PINK : "var(--field)" }}
      />

      {lastPick?.auto && (
        <div style={{ fontSize: 11, color: ENEMY, padding: "8px 2px 0", lineHeight: 1.35 }}>
          Time ran out — <strong style={{ color: CREAM }}>{heroName(lastPick.heroId)}</strong> was picked automatically.
        </div>
      )}
      {error && <div style={{ color: ENEMY, fontSize: 11, padding: "8px 2px 0" }} onClick={() => setError(null)}>{error}</div>}

      <div style={{ padding: "9px 0 16px", opacity: myTurn ? 1 : .34, pointerEvents: myTurn ? "auto" : "none" }}>
        <AttributePool ids={filtered} byId={poolHero} onPick={submit} dim={banning} min="clamp(52px, 16vw, 70px)" />
      </div>
    </Shell>
  );
}
