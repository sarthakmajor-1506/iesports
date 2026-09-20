"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildEngine, rankCandidates, type DraftModel, type Engine } from "@/lib/draftlab";
import {
  PERSONALITIES, botPick, botBan, banValue, playerWinProb, tempoMap,
  strongestCounter, type TempoRow,
} from "@/lib/draftbot";
import { draftSequence, type SeqRole } from "@/lib/draftSequence";
import { QUIZ_COUNT, type Knowledge } from "@/lib/quiz";
import { useAuth } from "@/app/context/AuthContext";
import { getFirebaseAuth } from "@/lib/firebase";
import {
  Shell, Band, Btn, Toggle, Panel, Label, Field, Pips, SoundToggle, ThemeToggle,
  DiscordIcon, signInWithDiscord, DotaMark, AvatarChip, CoinChip,
  CREAM, PANEL, LINE, MUTED, DIM, ENEMY,
  LEMON, MINT, PINK, LILAC, CORAL, GOLD_FILL, ON_FILL, R_CARD, BW_2, BW_3, lift,
} from "./ui";
import { Skeleton } from "./theme";
import { play, startMusic, stopMusic } from "./sound";
import { TeamRow, BanStrip, AttributePool, setRenderConcurrency } from "./hero-art";
import { QuizRound, type QuizResult } from "./quiz";
import { Result, ResultBand, ResultActions } from "./result";
import { LiveView } from "./live-view";
import { Leaderboard, useMyCoins } from "./leaderboard";
import { useRoomActions, useQueue } from "./live";

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
  const { user, userProfile, logout } = useAuth();
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
  /*
   * Matching drops you straight into the room. The queue hands back a code the
   * moment there is one — either because somebody was already waiting, or
   * because the server opened a room and announced it in Discord — and from
   * there it is an ordinary live room.
   */
  const queue = useQueue(useCallback((code: string) => { startMusic("draft"); setLiveCode(code); }, []));

  const [events, setEvents] = useState<Ev[]>([]);
  const [search, setSearch] = useState("");
  const [startedAt, setStartedAt] = useState(Date.now());
  const [botThinking, setBotThinking] = useState(false);
  const [quiz, setQuiz] = useState<QuizResult | null>(null);
  const [scored, setScored] = useState<{ points: number; draftPoints: number; quizPoints: number } | null>(null);
  const [coinsAwarded, setCoinsAwarded] = useState(0);
  const [weeklyTotal, setWeeklyTotal] = useState<number | null>(null);
  const [coinsPersonalBest, setCoinsPersonalBest] = useState(false);
  const [boardVersion, setBoardVersion] = useState(0);
  /** Your own coin total for the week — the header chip, and what the result climbs into. */
  const myCoins = useMyCoins(user?.uid ?? null, boardVersion);

  /**
   * Signed in? Then that is your name.
   *
   * STEAM IS NOT THE ONLY ACCOUNT ANY MORE. This read `steamName` alone, which
   * was fine when the only way in was a Steam-linked tournament account. Sign-in
   * from the game is Discord now, and a Discord-only player has no `steamName`
   * at all — so every one of them fell through to the localStorage name, which
   * is empty on a fresh browser, and landed on the leaderboard as "Anonymous"
   * while being perfectly signed in.
   *
   * Steam first when it is there, because that is the name the rest of the site
   * knows them by; Discord next; the typed name last. Signing in is still never
   * required — an anonymous player gets the whole game, just no place on a board.
   */
  const accountName = userProfile?.steamName || userProfile?.discordUsername || "";
  const avatarUrl = userProfile?.steamAvatar || userProfile?.discordAvatar || null;
  /** What goes on a board, into a room, and into the queue. One answer, everywhere. */
  const displayName = accountName || name || "Anonymous";
  useEffect(() => {
    if (accountName) { setName(accountName); return; }
    try { setName(localStorage.getItem("draftlab_name") || ""); } catch {}
  }, [accountName]);

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

  // Draft over -> a beat to see both full lineups before the questions. The bed
  // drops back to the menu track here: the clock is done, and a pulse under a
  // post-mortem is just noise.
  useEffect(() => {
    if (stage === "drafting" && turnIndex >= SEQ.length) { startMusic("menu"); setStage("recap"); }
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
   * Send the finished solo game up for scoring.
   *
   * The picks and the answer sheet go, not the score: the server re-evaluates
   * the model on those ten heroes and re-marks the quiz from its seed, so a
   * leaderboard place cannot be typed into a console. An anonymous player
   * skips this entirely.
   *
   * Solo only. A live ranked match is settled automatically, server-side, the
   * instant the draft finishes — see the note at the top of live-view.tsx —
   * so this route only ever hears from the mode that has nobody else to
   * settle it for.
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
          name: displayName,
          avatar: avatarUrl,
          mine: mineIds, theirs: theirIds,
          quizSeed: q?.seed ?? null, quizPicks: q?.picks ?? null, quizPoints: q?.points ?? 0,
        }),
      });
      const d = await r.json();
      if (d?.scored) setScored(d.scored);
      setCoinsAwarded(d?.coinsAwarded ?? 0);
      setWeeklyTotal(typeof d?.weeklyTotal === "number" ? d.weeklyTotal : null);
      setCoinsPersonalBest(!!d?.coinsPersonalBest);
      setBoardVersion((v) => v + 1);
    } catch { /* the leaderboard is never allowed to break the game loop */ }
  }, [user, displayName, avatarUrl]);

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

  /*
   * Music starts on a tap, never on load.
   *
   * A browser will not let an AudioContext or an <audio> element start before a
   * gesture, and a page that begins making noise the moment it opens is the
   * thing everyone mutes once and never unmutes. Both of these are buttons, so
   * the gesture has already happened by the time they run.
   */
  const restart = () => {
    setEvents([]); setSearch(""); setLogged(false); setQuiz(null); setScored(null);
    setCoinsAwarded(0); setWeeklyTotal(null); setCoinsPersonalBest(false);
    setStartedAt(Date.now()); rngState.current = Math.floor(Math.random() * 0xffffffff);
    startMusic("draft");
    setStage("drafting");
  };
  const toMenu = () => {
    setEvents([]); setQuiz(null); setScored(null);
    setCoinsAwarded(0); setWeeklyTotal(null); setCoinsPersonalBest(false); setLogged(false);
    startMusic("menu");
    setStage("menu");
  };
  useEffect(() => () => stopMusic(), []);

  /*
   * The menu had no sound at all, ever.
   *
   * Music only started from `restart()` and `toMenu()` — both of which are
   * reached by finishing or leaving a game — so the screen everybody actually
   * lands on was silent until they had played once. It cannot simply be
   * started on mount either: a browser refuses to let an AudioContext or an
   * <audio> element run before a user gesture, and a page that makes noise the
   * instant it opens is the one everybody mutes and never unmutes.
   *
   * So it waits for the first tap anywhere and starts then. A tap that happens
   * to be PLAY starts the draft bed a moment later and this one is torn down
   * before it is audible — the fallback bed ramps its gain in over two seconds,
   * so the overlap cannot be heard.
   */
  useEffect(() => {
    if (stage !== "menu" || liveCode) return;
    const kick = () => startMusic("menu");
    window.addEventListener("pointerdown", kick, { once: true });
    return () => window.removeEventListener("pointerdown", kick);
  }, [stage, liveCode]);
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
    /* Keyed on the code: a rematch is a different room, and every bit of
       per-room state in there (the quiz, whether the recap was dismissed, a
       pick in flight) has to start clean rather than carry over. */
    return <LiveView key={liveCode} model={model} knowledge={knowledge} code={liveCode} motion={motion}
      displayName={displayName} avatarUrl={avatarUrl} uid={user?.uid ?? null}
      onLeave={() => { setLiveCode(null); window.history.replaceState({}, "", "/draft"); }}
      /* A rematch is a different room, so the link has to follow it — otherwise
         a refresh drops the player back into the game they just finished. */
      onRematch={(next) => { setLiveCode(next); window.history.replaceState({}, "", `/draft?live=${next}`); }} />;
  }

  /* -------------------------------------------------------------- menu */
  if (stage === "menu") {
    return (
      <Shell
        tab="duel"
        head={
          <Band title="Draft Duel" compact sub={`Draft, then ${QUIZ_COUNT} questions`} accent={LEMON}
            icon={<DotaMark size={30} />}
            right={
              <>
                {/* Where you are on the week's board, without scrolling to find
                    your own row. Signed out there is no total, so nothing renders. */}
                <CoinChip coins={myCoins} />
                <ThemeToggle />
                <SoundToggle />
                {/* One icon, not a name pill. Who you are signed in as is a
                    picture; what you are called is on the board below. Tapping
                    it is also the only way to sign out of Draft Lab — there was
                    none before, anywhere in the game. */}
                {user && <ProfileMenu src={avatarUrl} name={displayName} onLogout={() => logout("/draft")} />}
              </>
            } />
        }
      >
        <div className="dl-in" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10, paddingTop: 13, position: "relative", zIndex: 1 }}>
          {/* Two ways in, one switch. The previous menu was two paragraph-heavy
              cards each carrying its own bans control, which made bans look like
              a property of a mode rather than a property of the draft. */}
          {/*
           * The ladder is the front door now, on its own and above the rest.
           *
           * It is the only mode here whose result is settled by beating a
           * person rather than by a 58%-accurate model's opinion, which is the
           * one thing on this page nobody can argue with — so it gets the width
           * and the other two share a row under it.
           */}
          <LadderTile
            signedIn={!!user}
            state={queue.state}
            waitedMs={queue.waitedMs}
            error={queue.error}
            onQueue={() => queue.join(displayName, avatarUrl, bansOn)}
            onCancel={queue.leave}
          />

          <div style={{ display: "flex", gap: 11 }}>
            <ModeTile fill={CORAL} rot={-1.4} kicker="SOLO" title="Counterpicker" sub="It answers what you take"
              cta="PLAY" onClick={restart} marks />
            <ModeTile fill={LEMON} rot={1.2} kicker="LIVE · 30s" title="Play a friend" sub="Head to head, on a clock"
              cta="CREATE ROOM"
              onClick={async () => {
                const d = await roomCall({ action: "create", name: displayName, avatar: avatarUrl, bans: bansOn });
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
              const j = await roomCall({ action: "join", code: codeInput, name: displayName, avatar: avatarUrl });
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
              <Btn tone="lilac" size="s" onClick={signInWithDiscord}><DiscordIcon size={14} /> SIGN IN</Btn>
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
      <Shell tab={null} head={<Band title="Draft complete" compact accent={MINT} onBack={toMenu} sub="Both sides are locked in" right={<SoundToggle />} />}>
        <div className="dl-in" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12, paddingTop: 12, paddingBottom: 18 }}>
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
      <Shell tab={null} head={<Band title="Draft locked" compact accent={LEMON} onBack={toMenu} sub="Now the questions" right={<SoundToggle />} />}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10, paddingTop: 10, paddingBottom: 16 }}>
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
           *
           * NO onBack HERE. Every other screen in the game keeps its back
           * button; a draft actually in progress does not. Restarting takes a
           * full ten rounds either way, so there is nothing to lose by simply
           * not offering an exit mid-turn — and it removes the one misclick
           * that used to be able to throw a run away.
           */
          <Band compact
            accent={banning ? PINK : yourTurn ? LEMON : "transparent"}
            title={turnLabel}
            sub={`Round ${turnIndex + 1} of ${SEQ.length}${turnHint}${bans.length ? ` · ${bans.length} banned` : ""}`}
            right={<>
              {/* Reachable mid-draft, not only from the menu — the whole point
                  of a mute is that you hit it when the noise starts. */}
              <SoundToggle />
              <Pips total={SEQ.filter((s) => s.kind === "pick" && s.role === YOU).length} filled={yours.length} color={yourTurn ? LEMON : MINT} />
            </>}
          />
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 8, paddingTop: 9 }}>
          <TeamRow side="them" label="DIRE" motion={motion} height="clamp(96px, 29vw, 148px)"
            heroes={theirs.map(heroOf)} latest={lastBotPick?.heroId ?? null}
            status={{ text: botTurn ? (banning ? "banning…" : "picking…") : "idle", active: botTurn }}
            turnActive={botTurn && !banning}
            note={lastBotPick?.answering != null ? (
              <span style={{ fontSize: 9, color: ENEMY, textAlign: "right", lineHeight: 1.2 }}>
                answers your {heroName(lastBotPick.answering)}
              </span>
            ) : undefined} />
          <TeamRow side="you" label="RADIANT" motion={motion} height="clamp(96px, 29vw, 148px)"
            heroes={yours.map(heroOf)} latest={lastPick?.by === "you" ? lastPick.heroId : null}
            turnActive={yourTurn && !banning} />
          {/* What is off the board, WHILE it matters. This strip only ever
              appeared on the recap, so through an entire bans draft the heroes
              being removed simply vanished from the pool with no record of what
              went or who took it. It costs one 20px line and renders nothing at
              all in a straight-picks draft. */}
          {bans.length > 0 && <BanStrip bans={bans} byId={heroById} />}
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

        {/* The pool is grouped by primary attribute, the way the client's own
            grid is. Players navigate a hero pool that way — "I need a strength
            offlaner" is a section, not a search — and it is the single change
            that makes this read as a Dota draft rather than a picture grid.
            Search collapses the groups automatically, since a filtered pool has
            nothing left to group. */}
        <div style={{ padding: "11px 0 18px", opacity: yourTurn ? 1 : .34, pointerEvents: yourTurn ? "auto" : "none" }}>
          <AttributePool ids={filtered} byId={poolHero} onPick={act} dim={banning} min="clamp(52px, 16vw, 70px)" />
        </div>
      </Shell>
    );
  }

  /* ------------------------------------------------------------ result */
  const won = (finalP ?? 0.5) > 0.5;
  return (
    <Shell
      tab={null}
      head={<ResultBand won={won} onMenu={toMenu} coins={weeklyTotal ?? myCoins} coinsAdded={coinsAwarded} />}
      foot={<ResultActions onAgain={restart} onMenu={toMenu} />}
    >
      <Result engine={engine} events={events} yours={yours} theirs={theirs} finalP={finalP}
        quiz={quiz} tempos={tempos} motion={motion} scored={scored}
        coinsAwarded={coinsAwarded} weeklyTotal={weeklyTotal} coinsPersonalBest={coinsPersonalBest} />
    </Shell>
  );
}

/**
 * The signed-in avatar, with a logout tucked behind it.
 *
 * There used to be no way to sign out of Draft Lab short of clearing cookies
 * or finding the main site's own navbar — this game has no navbar of its own,
 * and the avatar in its header was purely decorative. It is the one thing in
 * the header that names an account, so it is where a menu belongs.
 */
function ProfileMenu({ src, name, onLogout }: { src: string | null; name: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <AvatarChip src={src} name={name} onClick={() => setOpen((o) => !o)} />
      {open && (
        <div className="dl-in dl-card" style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 60,
          minWidth: 168, padding: 10, boxSizing: "border-box",
        }}>
          <div style={{
            fontSize: 11.5, fontWeight: 900, color: CREAM, marginBottom: 9, paddingLeft: 2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{name}</div>
          <Btn full size="s" tone="red" onClick={() => { setOpen(false); onLogout(); }}>LOG OUT</Btn>
        </div>
      )}
    </div>
  );
}

/**
 * The ladder, and the queue that feeds it.
 *
 * FOUR STATES, ONE CARD. Signed out it explains why an account is needed at all
 * — a result has to be paid to somebody — and offers Discord. Idle it is a
 * button. Waiting it is a button that can be cancelled, with the wait shown,
 * because a queue that gives no feedback reads as broken within about eight
 * seconds. Hosting is the interesting one: nobody was in the queue, so the
 * server opened a room and shouted it into Discord, and this says so plainly
 * rather than pretending somebody is on their way.
 */
function LadderTile({
  signedIn, state, waitedMs, error, onQueue, onCancel,
}: {
  signedIn: boolean;
  state: "idle" | "waiting" | "hosting" | "matched";
  waitedMs: number;
  error: string | null;
  onQueue: () => void;
  onCancel: () => void;
}) {
  const waiting = state === "waiting" || state === "hosting";
  return (
    <div className="dl-card" style={{ padding: "14px 15px 15px", background: GOLD_FILL, color: ON_FILL, border: `${BW_3}px solid ${LINE}`, boxShadow: `7px 7px 0 ${LINE}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <span className="dl-stk" style={{ background: PANEL, color: CREAM, fontSize: 8.5, padding: "3px 9px", borderWidth: 2, boxShadow: `2px 2px 0 ${LINE}` }}>
          RANKED · 30s
        </span>
        {/* The sonar below says what is happening and for how long, so this no
            longer repeats it — the two captions sat one above the other. */}
      </div>

      {waiting ? (
        <Sonar waitedMs={waitedMs} hosting={state === "hosting"} />
      ) : (
        <>
          <div style={{ fontSize: "clamp(19px, 5.6vw, 24px)", fontWeight: 900, letterSpacing: "-.035em", lineHeight: 1.1, marginBottom: 5 }}>
            Draft a real person
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 700, opacity: .8, lineHeight: 1.4, marginBottom: 13 }}>
            {!signedIn
              ? "Beat a human and it counts. Needs an account — there has to be somewhere to put the result."
              : "Win and take their rating, plus coins toward this week's board."}
          </div>
        </>
      )}

      {!signedIn ? (
        <Btn full tone="dark" onClick={signInWithDiscord}><DiscordIcon size={15} /> SIGN IN TO PLAY RANKED</Btn>
      ) : waiting ? (
        <Btn full tone="dark" onClick={onCancel}>CANCEL</Btn>
      ) : (
        <Btn full tone="dark" onClick={onQueue}>FIND AN OPPONENT ONLINE</Btn>
      )}

      {error && <div style={{ fontSize: 11, fontWeight: 700, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

/**
 * Looking for someone.
 *
 * A queue with no feedback reads as broken inside about eight seconds, and the
 * old one offered a single line of text that ticked a counter — which says a
 * number is going up, not that anything is being searched. This is a sonar:
 * rings leaving the centre on a stagger, a hand sweeping round, and the count
 * underneath.
 *
 * It is drawn in ink on the tile's own gold rather than in a pastel, because it
 * sits INSIDE the ladder card — a second fill on top of a fill is how this
 * layout stops reading as paper.
 */
function Sonar({ waitedMs, hosting }: { waitedMs: number; hosting: boolean }) {
  const secs = Math.floor(waitedMs / 1000);
  return (
    <div style={{ padding: "4px 0 13px" }}>
      <div style={{
        position: "relative", height: 104, display: "grid", placeItems: "center",
        overflow: "hidden", marginBottom: 9,
      }}>
        {/* Three rings on a stagger. Each leaves the middle and fades, so there
            is always one mid-flight — a single ring reads as a pulse, three
            read as something being swept. */}
        {[0, 0.8, 1.6].map((delay) => (
          <span key={delay} style={{
            position: "absolute", width: 104, height: 104, borderRadius: "50%",
            border: `2px solid ${ON_FILL}`, boxSizing: "border-box", opacity: 0,
            animation: `dl-sonar 2.4s ease-out ${delay}s infinite`,
          }} />
        ))}
        {/* The hand. A plain bar pinned at the centre and turned, which is the
            cheapest honest radar there is — no gradient, nothing to composite. */}
        <span style={{
          position: "absolute", width: 2, height: 44, background: ON_FILL, opacity: .5,
          transformOrigin: "50% 100%", top: "calc(50% - 44px)",
          animation: "dl-spin 2.4s linear infinite",
        }} />
        <span style={{
          position: "relative", width: 42, height: 42, borderRadius: "50%", display: "grid", placeItems: "center",
          background: PANEL, border: `2.5px solid ${ON_FILL}`, boxSizing: "border-box",
        }}>
          <DotaMark size={22} />
        </span>
      </div>

      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "-.02em" }}>
          {hosting ? "Your room is open" : "Looking for an opponent"}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, opacity: .75, marginTop: 3, lineHeight: 1.4 }}>
          {hosting
            ? "Nobody was queueing, so it was posted in Discord. Sit tight, or share the code."
            : `Searching the queue · ${secs}s`}
        </div>
      </div>
    </div>
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
  fill, rot, kicker, title, sub, cta, onClick, marks,
}: {
  fill: string; rot: number; kicker: string; title: string; sub: string; cta: string;
  onClick: () => void;
  /** Dire's claw, faint, behind the words. */
  marks?: boolean;
}) {
  return (
    <div style={{ flex: "1 1 0", minWidth: 0, transform: `rotate(${rot}deg)` }}>
      <button className="dl-btn" onClick={() => { play("pick"); onClick(); }} style={{
        width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
        position: "relative", overflow: "hidden", borderRadius: R_CARD, padding: "14px 13px 13px", boxSizing: "border-box",
        background: PANEL, border: `${BW_2}px solid ${LINE}`, color: CREAM, ...lift(5),
      }}>
        {/*
         * Three claw slashes in Dire's red, at a tenth opacity, tucked into the
         * corner behind the text. It marks the Counterpicker as the Dota-red
         * mode without turning the tile into a red card — anything stronger
         * fights the pastel the rest of the page is built from, and anything
         * that overlapped the words would be decoration charging rent.
         */}
        {marks && (
          <svg viewBox="0 0 64 64" aria-hidden style={{
            position: "absolute", top: 6, right: 6, width: 52, height: 52,
            opacity: .16, pointerEvents: "none",
          }}>
            <g stroke={ENEMY} strokeWidth="5.5" strokeLinecap="round" fill="none">
              <path d="M10 4 C24 16, 32 30, 36 52" />
              <path d="M26 2 C40 14, 48 28, 52 50" />
              <path d="M42 4 C54 16, 60 28, 62 46" />
            </g>
          </svg>
        )}
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
