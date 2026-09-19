"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildEngine, rankCandidates, type DraftModel, type Engine } from "@/lib/draftlab";
import {
  PERSONALITIES, botPick, botBan, banValue, playerWinProb, tempoMap,
  strongestCounter, type TempoRow,
} from "@/lib/draftbot";
import { draftSequence, type SeqRole } from "@/lib/draftSequence";
import type { Knowledge } from "@/lib/quiz";
import { useAuth } from "@/app/context/AuthContext";
import { getFirebaseAuth } from "@/lib/firebase";
import {
  Shell, Band, Btn, Toggle, Panel, Label, Field, Pips, SoundToggle, ThemeToggle,
  CREAM, PANEL, LINE, MUTED, DIM, ENEMY,
  LEMON, MINT, PINK, LILAC, ON_FILL, R_CARD, BW_2, lift,
} from "./ui";
import { Skeleton } from "./theme";
import { play } from "./sound";
import { TeamRow, BanStrip, HeroGrid, setRenderConcurrency } from "./hero-art";
import { QuizRound, type QuizResult } from "./quiz";
import { Result, ResultBand, ResultActions } from "./result";
import { LiveView } from "./live-view";
import { Leaderboard } from "./leaderboard";
import { useRoomActions } from "./live";

/** Role 0 is the bot, role 1 is you — bot always opens, matching live's host. */
const BOT: SeqRole = 0, YOU: SeqRole = 1;

export type Ev = {
  by: "bot" | "you"; kind: "ban" | "pick"; heroId: number;
  swing: number; regret: number; bestAlt: number; rank: number; pool: number;
  punishedBy: number | null; answering: number | null; answerRate: number | null;
  deniedRank: number | null;
};

type Stage = "menu" | "drafting" | "recap" | "quiz" | "done";
const COUNTER = PERSONALITIES.find((p) => p.id === "counter")!;

export default function DraftDuelPage() {
  return (
    <Suspense fallback={<Shell tab="duel" head={<Band title="Draft Duel" />}><Skeleton h={150} style={{ marginTop: 13 }} /></Shell>}>
      <Duel />
    </Suspense>
  );
}

function Duel() {
  const { user, userProfile } = useAuth();
  const [model, setModel] = useState<DraftModel | null>(null);
  const [knowledge, setKnowledge] = useState<Knowledge | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [stage, setStage] = useState<Stage>("menu");
  /** One bans switch for both modes — solo reads it, a new room is created with it. */
  const [bansOn, setBansOn] = useState(false);
  const [liveCode, setLiveCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [motion, setMotion] = useState(true);
  const { call: roomCall } = useRoomActions();

  const [events, setEvents] = useState<Ev[]>([]);
  const [search, setSearch] = useState("");
  const [startedAt, setStartedAt] = useState(Date.now());
  const [botThinking, setBotThinking] = useState(false);
  const [quiz, setQuiz] = useState<QuizResult | null>(null);
  const [scored, setScored] = useState<{ points: number; draftPoints: number; quizPoints: number } | null>(null);
  const [personalBest, setPersonalBest] = useState(false);
  const [boardVersion, setBoardVersion] = useState(0);

  /**
   * Signed in? Then that is your name.
   *
   * Steam is already linked for anyone who plays tournaments here, so asking a
   * signed-in player to type a name again is a form to fill in for no reason.
   * Signing in is never required — an anonymous player gets the whole game, just
   * no place on the board.
   */
  const steamName = userProfile?.steamName || "";
  useEffect(() => {
    if (steamName) { setName(steamName); return; }
    try { setName(localStorage.getItem("draftlab_name") || ""); } catch {}
  }, [steamName]);

  useEffect(() => {
    fetch("/draftlab/model.json").then((r) => r.json()).then(setModel)
      .catch(() => setError("Could not load the model. Try a refresh."));
    fetch("/draftlab/knowledge.json").then((r) => r.json()).then(setKnowledge).catch(() => {});
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    if (nav.connection?.saveData || window.matchMedia("(prefers-reduced-motion: reduce)").matches) setMotion(false);
    setRenderConcurrency(window.innerWidth >= 760 ? 2 : 1);
  }, []);

  useEffect(() => {
    const live = new URLSearchParams(window.location.search).get("live");
    if (live) setLiveCode(live.toUpperCase());
  }, []);

  const engine: Engine | null = useMemo(() => (model ? buildEngine(model) : null), [model]);
  const tempos = useMemo(() => (model ? tempoMap(model as { tempo?: TempoRow[] }) : new Map()), [model]);

  const SEQ = useMemo(() => draftSequence(bansOn), [bansOn]);
  const yours = useMemo(() => events.filter((e) => e.kind === "pick" && e.by === "you").map((e) => e.heroId), [events]);
  const theirs = useMemo(() => events.filter((e) => e.kind === "pick" && e.by === "bot").map((e) => e.heroId), [events]);
  const bans = useMemo(() => events.filter((e) => e.kind === "ban").map((e) => ({ by: e.by, heroId: e.heroId })), [events]);

  const turnIndex = events.length;
  const step = stage !== "drafting" || turnIndex >= SEQ.length ? null : SEQ[turnIndex];
  const slot = step ? { by: (step.role === BOT ? "bot" : "you") as "bot" | "you", kind: step.kind } : null;

  const available = useMemo(() => {
    if (!model) return [];
    const used = new Set(events.map((e) => e.heroId));
    return model.heroes.filter((h) => !used.has(h.id)).map((h) => h.id);
  }, [model, events]);

  /**
   * Stateful PRNG, seeded from something that varies.
   *
   * A pure function of (seed, turnIndex) returns the same value on every call
   * within a turn and starts from the same constant each session, which is why
   * the opponent used to open with Magnus every single game.
   */
  const rngState = useRef<number>(Math.floor(Math.random() * 0xffffffff));
  const rng = useCallback(() => {
    rngState.current = (rngState.current + 0x6d2b79f5) >>> 0;
    let t = rngState.current;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }, []);

  const commit = useCallback((by: "bot" | "you", kind: "ban" | "pick", heroId: number, deniedRank: number | null) => {
    if (!engine) return;
    const before = playerWinProb(engine, yours, theirs, true);
    const nextYours = kind === "pick" && by === "you" ? [...yours, heroId] : yours;
    const nextTheirs = kind === "pick" && by === "bot" ? [...theirs, heroId] : theirs;
    const after = playerWinProb(engine, nextYours, nextTheirs, true);

    let regret = 0, bestAlt = heroId, rank = 0, pool = 0;
    let punishedBy: number | null = null, answering: number | null = null, answerRate: number | null = null;

    if (kind === "pick" && by === "bot") {
      const hit = strongestCounter(engine, [heroId], yours, false);
      if (hit && hit.edge > 0.06) { answering = hit.defender; answerRate = hit.winRate; }
    }
    if (kind === "pick" && by === "you") {
      const ranked = rankCandidates(engine, yours, theirs, available, 0);
      const best = ranked[0];
      const mine = ranked.find((c) => c.heroId === heroId);
      if (best && mine) { regret = (best.pForTeam - mine.pForTeam) * 100; bestAlt = best.heroId; }
      rank = ranked.findIndex((c) => c.heroId === heroId) + 1;
      pool = ranked.length;
      let worst = 0;
      for (const foe of theirs) {
        const row = engine.cnt.get(heroId * engine.model.maxh + foe);
        const v = row ? row[2] : 0;
        if (v < worst) { worst = v; punishedBy = foe; }
      }
    }
    setEvents((e) => [...e, { by, kind, heroId, swing: (after - before) * 100, regret, bestAlt, rank, pool, punishedBy, answering, answerRate, deniedRank }]);
  }, [engine, yours, theirs, available]);

  useEffect(() => {
    if (stage !== "drafting" || !engine || !slot || slot.by !== "bot") return;
    setBotThinking(true);
    const t = setTimeout(() => {
      play(slot.kind === "ban" ? "ban" : "pick");
      if (slot.kind === "ban") {
        const b = botBan(engine, COUNTER, theirs, yours, available, rng);
        commit("bot", "ban", b.heroId, b.playerRank);
      } else {
        const p = botPick(engine, COUNTER, theirs, yours, available, false, tempos, rng);
        commit("bot", "pick", p.heroId, null);
      }
      setBotThinking(false);
    }, 600);
    return () => clearTimeout(t);
  }, [stage, engine, slot, theirs, yours, available, tempos, rng, commit]);

  // Draft over -> a beat to see both full lineups before the questions.
  useEffect(() => {
    if (stage === "drafting" && turnIndex >= SEQ.length) setStage("recap");
  }, [stage, turnIndex, SEQ.length]);

  const finalP = useMemo(
    () => (engine && (stage === "quiz" || stage === "done") ? playerWinProb(engine, yours, theirs, true) : null),
    [engine, stage, yours, theirs]
  );

  const act = (heroId: number) => {
    if (!engine || !slot || slot.by !== "you") return;
    play(slot.kind === "ban" ? "ban" : "pick");
    if (slot.kind === "ban") {
      const v = banValue(engine, heroId, theirs, yours, available);
      commit("you", "ban", heroId, v.rankForThem);
    } else {
      commit("you", "pick", heroId, null);
    }
    setSearch("");
  };

  /**
   * Send the finished game up for scoring.
   *
   * The picks and the answer sheet go, not the score: the server re-evaluates the
   * model on those ten heroes and re-marks the quiz from its seed, so a leaderboard
   * place cannot be typed into a console. An anonymous player skips this entirely.
   */
  const submitScore = useCallback(async (mineIds: number[], theirIds: number[], q: QuizResult | null) => {
    if (!user) return;
    try {
      const { auth } = await getFirebaseAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const r = await fetch("/api/draftlab/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          uid: user.uid,
          name: steamName || name || "Anonymous",
          avatar: userProfile?.steamAvatar || null,
          mine: mineIds, theirs: theirIds,
          quizSeed: q?.seed ?? null, quizPicks: q?.picks ?? null, quizPoints: q?.points ?? 0,
        }),
      });
      const d = await r.json();
      if (d?.scored) setScored(d.scored);
      if (d?.personalBest) setPersonalBest(true);
      setBoardVersion((v) => v + 1);
    } catch { /* the leaderboard is never allowed to break the game loop */ }
  }, [user, steamName, name, userProfile]);

  const [logged, setLogged] = useState(false);
  useEffect(() => {
    if (stage !== "done" || logged || finalP == null) return;
    setLogged(true);
    void submitScore(yours, theirs, quiz);
    fetch("/api/draftlab/response", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "duel", format: bansOn ? "captains" : "quick", scenarioId: `duel-counter-${bansOn ? "captains" : "quick"}`,
        anonId: (() => { try { return localStorage.getItem("draftlab_anon") || "anon"; } catch { return "anon"; } })(),
        chosenHero: yours[0], chosenP: finalP,
        regretPP: events.filter((e) => e.kind === "pick" && e.by === "you").reduce((a, b) => a + b.regret, 0) / 5,
        draftPicks: yours,
        perPickRegret: events.filter((e) => e.kind === "pick" && e.by === "you").map((e) => +e.regret.toFixed(3)),
        botPersonality: "counter", botPicks: theirs, bans: bans.map((b) => b.heroId),
        quizPoints: quiz?.points ?? null, quizCorrect: quiz?.correct ?? null,
        elapsedMs: Date.now() - startedAt,
      }),
    }).catch(() => {});
  }, [stage, logged, finalP, yours, theirs, events, bans, bansOn, startedAt, quiz, submitScore]);

  const restart = () => {
    setEvents([]); setSearch(""); setLogged(false); setQuiz(null); setScored(null);
    setPersonalBest(false);
    setStartedAt(Date.now()); rngState.current = Math.floor(Math.random() * 0xffffffff);
    setStage("drafting");
  };
  const toMenu = () => { setEvents([]); setQuiz(null); setScored(null); setPersonalBest(false); setLogged(false); setStage("menu"); };
  const saveName = (n: string) => { setName(n); try { localStorage.setItem("draftlab_name", n); } catch {} };

  if (error) {
    return <Shell tab="duel" head={<Band title="Draft Duel" />}><Panel style={{ marginTop: 13 }}><span style={{ color: ENEMY, fontSize: 13 }}>{error}</span></Panel></Shell>;
  }
  if (!model || !engine) {
    return (
      <Shell tab="duel" head={<Band title="Draft Duel" />}>
        <Skeleton h={150} style={{ marginTop: 13 }} />
      </Shell>
    );
  }

  const heroById = (id: number) => engine.heroById.get(id);
  const heroName = (id: number) => heroById(id)?.name ?? `#${id}`;
  const heroOf = (id: number) => { const h = heroById(id)!; return { id, img: h.img, name: h.name }; };
  const poolHero = (id: number) => { const h = heroById(id); return h ? { img: h.img, name: h.name, attr: h.attr } : undefined; };

  if (liveCode) {
    return <LiveView model={model} knowledge={knowledge} code={liveCode} motion={motion} submitScore={submitScore}
      onLeave={() => { setLiveCode(null); window.history.replaceState({}, "", "/draft"); }} />;
  }

  /* -------------------------------------------------------------- menu */
  if (stage === "menu") {
    return (
      <Shell
        tab="duel"
        head={
          <Band title="Draft Duel" compact sub="Draft, then three questions" accent={LEMON}
            right={
              <>
                <ThemeToggle />
                <SoundToggle />
                {/* Only when signed in. The chip's job is to say WHICH account
                    you are on, and a "GUEST" pill said nothing the PLAYING AS
                    field below does not — while being the third thing in a slot
                    that only fits two on a 390px phone, where it crowded the
                    subtitle out of the band. */}
                {user && (
                  <span className="dl-stk" style={{
                    maxWidth: 88, fontSize: 8.5, padding: "3px 9px", borderWidth: 2,
                    boxShadow: `2px 2px 0 ${LINE}`, background: MINT, color: ON_FILL,
                  }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {steamName || name || "Signed in"}
                    </span>
                  </span>
                )}
              </>
            } />
        }
      >
        <div className="dl-in" style={{ display: "grid", gap: 10, paddingTop: 13, position: "relative", zIndex: 1 }}>
          {/* Two ways in, one switch. The previous menu was two paragraph-heavy
              cards each carrying its own bans control, which made bans look like
              a property of a mode rather than a property of the draft. */}
          <div style={{ display: "flex", gap: 11 }}>
            <ModeTile fill={PINK} rot={-1.4} kicker="SOLO" title="Counterpicker" sub="It answers what you take"
              cta="PLAY" onClick={restart} />
            <ModeTile fill={LEMON} rot={1.2} kicker="LIVE · 30s" title="Play a friend" sub="Head to head, on a clock"
              cta="CREATE ROOM"
              onClick={async () => {
                const d = await roomCall({ action: "create", name: steamName || name || "Host", bans: bansOn });
                if (d?.code) setLiveCode(d.code);
              }} />
          </div>

          <Pulse />

          <div className="dl-card" style={{
            display: "flex", justifyContent: "center", alignItems: "center", gap: 10,
            padding: "7px 12px", borderRadius: R_CARD,
          }}>
            <Toggle checked={bansOn} onChange={setBansOn} label="BANS" color={PINK} />
            <span style={{ fontSize: 10, color: DIM, fontWeight: 700, letterSpacing: .3 }}>
              {bansOn ? "3 bans each, both modes" : "straight picks, both modes"}
            </span>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <Field value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              placeholder="ROOM CODE" autoCapitalize="characters"
              style={{ flex: "1 1 auto", minWidth: 0, letterSpacing: 3, fontWeight: 900, textAlign: "center", minHeight: 44 }} />
            <Btn tone="lilac" disabled={busy || codeInput.length < 4} onClick={async () => {
              setBusy(true); setJoinError(null);
              const j = await roomCall({ action: "join", code: codeInput, name: steamName || name || "Guest" });
              setBusy(false);
              if (j?.ok) setLiveCode(codeInput); else setJoinError("No room with that code.");
            }}>{busy ? "…" : "JOIN"}</Btn>
          </div>
          {joinError && <div style={{ color: ENEMY, fontSize: 11.5, textAlign: "center" }}>{joinError}</div>}

          {!user && (
            <Panel style={{ padding: "9px 11px", display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                <Label style={{ marginBottom: 3 }}>PLAYING AS</Label>
                <Field value={name} onChange={(e) => saveName(e.target.value.slice(0, 24))} placeholder="Anonymous"
                  style={{ padding: "6px 10px", minHeight: 32 }} />
              </div>
              <Btn tone="ghost" size="s" href="/login">SIGN IN</Btn>
            </Panel>
          )}

          <div style={{ height: 4 }} />
          <Leaderboard uid={user?.uid ?? null} refreshKey={boardVersion} />
        </div>
      </Shell>
    );
  }

  /* -------------------------------------------------------------- recap */
  if (stage === "recap") {
    return (
      <Shell tab={null} head={<Band title="Draft complete" compact accent={MINT} sub="Both sides are locked in" />}>
        <div className="dl-in" style={{ display: "grid", gap: 12, paddingTop: 12, paddingBottom: 18 }}>
          <TeamRow side="them" label="THE COUNTERPICKER" heroes={theirs.map(heroOf)} latest={null} motion={motion} height="clamp(86px, 25vw, 128px)" />
          <div style={{ textAlign: "center" }}>
            <span className="dl-stk" style={{ background: LILAC, fontSize: 10 }}>VS</span>
          </div>
          <TeamRow side="you" label="YOU" heroes={yours.map(heroOf)} latest={null} motion={motion} height="clamp(86px, 25vw, 128px)" />
          {bans.length > 0 && <BanStrip bans={bans} byId={heroById} />}
          <Btn full tone="gold" size="l" onClick={() => setStage("quiz")}>SEE THE QUESTIONS</Btn>
        </div>
      </Shell>
    );
  }

  /* -------------------------------------------------------------- quiz */
  if (stage === "quiz") {
    return (
      <Shell tab={null} head={<Band title="Draft locked" compact accent={LEMON} sub="Now the questions" />}>
        <div style={{ display: "grid", gap: 10, paddingTop: 10, paddingBottom: 16 }}>
          <TeamRow side="you" label="YOUR FIVE" heroes={yours.map(heroOf)} latest={null} motion={motion} height="clamp(64px, 19vw, 92px)" />
          {knowledge ? (
            <QuizRound knowledge={knowledge} seed={`solo-${yours.join("-")}-${startedAt}`}
              onDone={(r) => { setQuiz(r); setTimeout(() => setStage("done"), 1600); }} />
          ) : (
            <Panel><div style={{ color: MUTED, fontSize: 12.5 }}>Loading the question bank…</div></Panel>
          )}
        </div>
      </Shell>
    );
  }

  /* ------------------------------------------------------------- board */
  if (stage === "drafting") {
    const q = search.trim().toLowerCase();
    const filtered = available.filter((id) => heroName(id).toLowerCase().includes(q));
    const banning = slot?.kind === "ban";
    const yourTurn = slot?.by === "you";
    const lastPick = [...events].reverse().find((e) => e.kind === "pick");
    const lastBotPick = [...events].reverse().find((e) => e.by === "bot" && e.kind === "pick");
    const lastBotBan = [...events].reverse().find((e) => e.by === "bot" && e.kind === "ban");
    const botTurn = slot?.by === "bot";

    /*
     * Two words, not a sentence.
     *
     * The band centres the title between the back arrow and the right slot, so
     * on a 390px phone it has about 220px — "YOUR PICK — LOCK ONE IN" was
     * ellipsised to "YOUR PICK — LOCK ONE …", which is the instruction cut off
     * at exactly the word that carried it. The state goes in the title and the
     * instruction goes in the subtitle, which has the width for it.
     */
    const turnLabel = yourTurn
      ? (banning ? "YOUR BAN" : "YOUR PICK")
      : (botThinking ? "DIRE IS DECIDING…" : "DIRE'S TURN");
    const turnHint = yourTurn ? (banning ? " · take one away" : " · lock one in") : "";

    return (
      <Shell
        tab={null} atmos={0.4}
        head={
          /*
           * One line of chrome, not four. The banner, the timeline and the ban
           * strip used to stack above the board and cost roughly a third of the
           * screen before a single hero was visible. The turn now lives in the
           * title, where it is read anyway, and the accent carries the state.
           */
          /*
           * The highlighter under the title carries the state, the way it does
           * in the films: pink while banning, lemon on your turn, nothing at all
           * while the other side is thinking. It replaced a coloured title,
           * which on paper made the words themselves harder to read the more
           * urgent they were.
           */
          <Band compact onBack={toMenu}
            accent={banning ? PINK : yourTurn ? LEMON : "transparent"}
            title={turnLabel}
            sub={`Round ${turnIndex + 1} of ${SEQ.length}${turnHint}${bans.length ? ` · ${bans.length} banned` : ""}`}
            right={<Pips total={SEQ.filter((s) => s.kind === "pick" && s.role === YOU).length} filled={yours.length} color={yourTurn ? LEMON : MINT} />}
          />
        }
      >
        <div style={{ display: "grid", gap: 8, paddingTop: 9 }}>
          <TeamRow side="them" label="DIRE" motion={motion} height="clamp(96px, 29vw, 148px)"
            heroes={theirs.map(heroOf)} latest={lastBotPick?.heroId ?? null}
            status={{ text: botTurn ? (banning ? "banning…" : "picking…") : "idle", active: botTurn }}
            note={lastBotPick?.answering != null ? (
              <span style={{ fontSize: 9, color: ENEMY, textAlign: "right", lineHeight: 1.2 }}>
                answers your {heroName(lastBotPick.answering)}
              </span>
            ) : undefined} />
          <TeamRow side="you" label="RADIANT" motion={motion} height="clamp(96px, 29vw, 148px)"
            heroes={yours.map(heroOf)} latest={lastPick?.by === "you" ? lastPick.heroId : null} />
        </div>

        <Field value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={yourTurn ? (banning ? "Search — banning" : "Search heroes") : "Waiting for Dire…"}
          disabled={!yourTurn}
          style={{
            marginTop: 10, padding: "8px 14px", minHeight: 38,
            opacity: yourTurn ? 1 : .45, background: banning && yourTurn ? PINK : "var(--field)",
          }} />

        {lastBotBan && lastBotBan.deniedRank != null && lastBotBan.deniedRank <= 5 && (
          <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 700, padding: "9px 2px 0", lineHeight: 1.4 }}>
            Dire banned <strong style={{ color: CREAM }}>{heroName(lastBotBan.heroId)}</strong> — your
            {lastBotBan.deniedRank === 1 ? " best" : ` #${lastBotBan.deniedRank}`} option.
          </div>
        )}

        <div style={{ padding: "9px 0 16px", opacity: yourTurn ? 1 : .34, pointerEvents: yourTurn ? "auto" : "none" }}>
          <HeroGrid ids={filtered} byId={heroById} onPick={act} dim={banning} min="clamp(56px, 17vw, 74px)" labelSize={8} />
        </div>
      </Shell>
    );
  }

  /* ------------------------------------------------------------ result */
  const won = (finalP ?? 0.5) > 0.5;
  return (
    <Shell
      tab={null}
      head={<ResultBand won={won} onMenu={toMenu} />}
      foot={<ResultActions onAgain={restart} onMenu={toMenu} />}
    >
      <Result engine={engine} events={events} yours={yours} theirs={theirs} finalP={finalP}
        quiz={quiz} tempos={tempos} motion={motion} scored={scored} personalBest={personalBest} />
    </Shell>
  );
}

/**
 * One of the two ways into a game.
 *
 * Terse on purpose: a kicker sticker, a name, one line, and the verb. The two
 * cards sit at opposite tilts with different pastels — pink for solo, lemon for
 * live — so which is which is settled before a word is read, the way the
 * landing page separates its three games.
 *
 * The rotation has to survive `.dl-btn`, whose hover and press are a
 * `transform: translate(...)` that would overwrite it. So the tilt lives on the
 * outer wrapper and the button inside it stays square.
 */
function ModeTile({
  fill, rot, kicker, title, sub, cta, onClick,
}: { fill: string; rot: number; kicker: string; title: string; sub: string; cta: string; onClick: () => void }) {
  return (
    <div style={{ flex: "1 1 0", minWidth: 0, transform: `rotate(${rot}deg)` }}>
      <button className="dl-btn" onClick={() => { play("pick"); onClick(); }} style={{
        width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
        position: "relative", borderRadius: R_CARD, padding: "14px 13px 13px", boxSizing: "border-box",
        background: PANEL, border: `${BW_2}px solid ${LINE}`, color: CREAM, ...lift(5),
      }}>
        <span className="dl-stk" style={{ background: fill, fontSize: 8, padding: "3px 9px", borderWidth: 2, boxShadow: `2px 2px 0 ${LINE}`, marginBottom: 9 }}>
          {kicker}
        </span>
        <div style={{ fontSize: "clamp(15px, 4.4vw, 18px)", fontWeight: 900, letterSpacing: "-.03em", lineHeight: 1.1, margin: "2px 0 5px" }}>{title}</div>
        <div style={{ fontSize: 10.5, color: MUTED, fontWeight: 700, lineHeight: 1.35, marginBottom: 12, minHeight: 28 }}>{sub}</div>
        <span style={{
          display: "block", textAlign: "center", padding: "8px 6px", borderRadius: 999,
          background: fill, color: ON_FILL, border: `2px solid ${LINE}`,
          fontSize: 11, fontWeight: 900, letterSpacing: .6,
        }}>{cta}</span>
      </button>
    </div>
  );
}

/**
 * "What's happening right now", from real aggregate counts.
 *
 * Renders nothing at all when both numbers are zero rather than inventing
 * activity — an empty game that claims to be busy is the fastest way to teach
 * someone the numbers on the rest of the screen are decorative too.
 */
function Pulse() {
  const [p, setP] = useState<{ live: number | null; today: number | null } | null>(null);
  useEffect(() => {
    let stop = false;
    const load = () => fetch("/api/draftlab/pulse", { cache: "no-store" })
      .then((r) => r.json()).then((d) => { if (!stop) setP(d); }).catch(() => {});
    load();
    const t = setInterval(load, 20000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  const live = p?.live ?? 0, today = p?.today ?? 0;
  if (!live && !today) return null;

  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      {/* Idle, the sticker is an empty outline on the page surface, so its text
          has to follow `--text` rather than the near-black that sits on a fill. */}
      <span className="dl-stk r" style={{
        background: live ? MINT : PANEL, color: live ? ON_FILL : CREAM, fontSize: 9, gap: 7,
      }}>
        <span className="dl-turn" style={{ width: 7, height: 7, borderRadius: 4, background: live ? ON_FILL : DIM, flex: "none" }} />
        {live > 0 && <span>{live} {live === 1 ? "draft" : "drafts"} live now</span>}
        {live > 0 && today > 0 && <span>·</span>}
        {today > 0 && <span>{today} played today</span>}
      </span>
    </div>
  );
}
