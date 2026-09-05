"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildEngine, rankCandidates, type DraftModel, type Engine } from "@/lib/draftlab";
import {
  PERSONALITIES, botPick, botBan, banValue, playerWinProb, tempoMap,
  strongestCounter, type TempoRow,
} from "@/lib/draftbot";
import type { Knowledge } from "@/lib/quiz";
import { useAuth } from "@/app/context/AuthContext";
import { authPost } from "@/app/lib/authFetch";
import {
  Shell, Band, Btn, Segment, Panel, Label, Field, Pips,
  RED, CREAM, PANEL, LINE, MUTED, DIM, GREEN, GOLD,
} from "./ui";
import { TeamRow, BanStrip, HeroGrid, DraftStyles, setRenderConcurrency } from "./hero-art";
import { QuizRound, type QuizResult } from "./quiz";
import { Result, ResultBand, ResultActions } from "./result";
import { LiveView } from "./live-view";
import { Leaderboard } from "./leaderboard";
import { useRoomActions } from "./live";

type Slot = { by: "bot" | "you"; kind: "ban" | "pick" };

const QUICK: Slot[] = Array.from({ length: 10 }, (_, i) => ({
  by: (i % 2 === 0 ? "bot" : "you") as "bot" | "you",
  kind: "pick" as const,
}));

/** Three bans each across two phases, snake picks, you close. */
const CAPTAINS: Slot[] = [
  { by: "bot", kind: "ban" }, { by: "you", kind: "ban" },
  { by: "bot", kind: "ban" }, { by: "you", kind: "ban" },
  { by: "bot", kind: "pick" }, { by: "you", kind: "pick" },
  { by: "you", kind: "pick" }, { by: "bot", kind: "pick" },
  { by: "bot", kind: "ban" }, { by: "you", kind: "ban" },
  { by: "bot", kind: "pick" }, { by: "you", kind: "pick" },
  { by: "you", kind: "pick" }, { by: "bot", kind: "pick" },
  { by: "bot", kind: "pick" }, { by: "you", kind: "pick" },
];

export type Ev = {
  by: "bot" | "you"; kind: "ban" | "pick"; heroId: number;
  swing: number; regret: number; bestAlt: number; rank: number; pool: number;
  punishedBy: number | null; answering: number | null; answerRate: number | null;
  deniedRank: number | null;
};

type Stage = "menu" | "drafting" | "quiz" | "done";
const COUNTER = PERSONALITIES.find((p) => p.id === "counter")!;

export default function DraftDuelPage() {
  return (
    <Suspense fallback={<Shell tab="duel" head={<Band title="Draft Duel" />}><DraftStyles /></Shell>}>
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
  const [format, setFormat] = useState<"quick" | "captains">("quick");
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

  const SEQ = format === "captains" ? CAPTAINS : QUICK;
  const yours = useMemo(() => events.filter((e) => e.kind === "pick" && e.by === "you").map((e) => e.heroId), [events]);
  const theirs = useMemo(() => events.filter((e) => e.kind === "pick" && e.by === "bot").map((e) => e.heroId), [events]);
  const bans = useMemo(() => events.filter((e) => e.kind === "ban").map((e) => ({ by: e.by, heroId: e.heroId })), [events]);

  const turnIndex = events.length;
  const slot = stage !== "drafting" || turnIndex >= SEQ.length ? null : SEQ[turnIndex];

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

  // Draft over -> straight into the quiz round.
  useEffect(() => {
    if (stage === "drafting" && turnIndex >= SEQ.length) setStage("quiz");
  }, [stage, turnIndex, SEQ.length]);

  const finalP = useMemo(
    () => (engine && (stage === "quiz" || stage === "done") ? playerWinProb(engine, yours, theirs, true) : null),
    [engine, stage, yours, theirs]
  );

  const act = (heroId: number) => {
    if (!engine || !slot || slot.by !== "you") return;
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
      const r = await authPost("/api/draftlab/leaderboard", {
        uid: user.uid,
        name: steamName || name || "Anonymous",
        avatar: userProfile?.steamAvatar || null,
        mine: mineIds, theirs: theirIds,
        quizSeed: q?.seed ?? null, quizPicks: q?.picks ?? null, quizPoints: q?.points ?? 0,
      });
      const d = await r.json();
      if (d?.scored) setScored(d.scored);
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
        mode: "duel", format, scenarioId: `duel-counter-${format}`,
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
  }, [stage, logged, finalP, yours, theirs, events, bans, format, startedAt, quiz, submitScore]);

  const restart = () => {
    setEvents([]); setSearch(""); setLogged(false); setQuiz(null); setScored(null);
    setStartedAt(Date.now()); rngState.current = Math.floor(Math.random() * 0xffffffff);
    setStage("drafting");
  };
  const toMenu = () => { setEvents([]); setQuiz(null); setScored(null); setLogged(false); setStage("menu"); };
  const saveName = (n: string) => { setName(n); try { localStorage.setItem("draftlab_name", n); } catch {} };

  if (error) {
    return <Shell tab="duel" head={<Band title="Draft Duel" />}><DraftStyles /><Panel style={{ marginTop: 12 }}><span style={{ color: RED, fontSize: 13 }}>{error}</span></Panel></Shell>;
  }
  if (!model || !engine) {
    return (
      <Shell tab="duel" head={<Band title="Draft Duel" />}>
        <DraftStyles />
        <div className="dl-sheen" style={{ height: 130, borderRadius: 14, background: PANEL, marginTop: 12 }} />
      </Shell>
    );
  }

  const heroById = (id: number) => engine.heroById.get(id);
  const heroName = (id: number) => heroById(id)?.name ?? `#${id}`;
  const heroOf = (id: number) => { const h = heroById(id)!; return { id, img: h.img, name: h.name }; };

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
          <Band title="Draft Duel" compact sub="Draft, then three questions"
            right={
              <span style={{
                maxWidth: 130, fontSize: 10.5, fontWeight: 800, color: user ? GREEN : DIM,
                border: `1px solid ${user ? GREEN + "55" : LINE}`, borderRadius: 8, padding: "4px 8px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{user ? (steamName || name || "Signed in") : "Guest"}</span>
            } />
        }
      >
        <DraftStyles />

        <div className="dl-in" style={{ display: "grid", gap: 9, paddingTop: 11 }}>
          <div style={{
            position: "relative", overflow: "hidden", borderRadius: 15, padding: "13px 13px 12px",
            background: `linear-gradient(150deg, ${PANEL} 40%, ${RED}1e)`, border: `1px solid ${LINE}`,
          }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: RED, boxShadow: `0 0 14px ${RED}` }} />
            <div style={{ fontSize: 9, letterSpacing: 1.6, color: RED, fontWeight: 900, marginBottom: 4 }}>SOLO</div>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.4, marginBottom: 3 }}>The Counterpicker</div>
            <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.4, marginBottom: 10 }}>
              It answers whatever you take.
            </div>
            {/* Two rows, not three items across: at 320px a segment plus a
                button squeezes the labels until they wrap or clip. */}
            <Segment dense value={format} onChange={setFormat} accent={RED}
              options={[{ v: "quick", label: "NO BANS" }, { v: "captains", label: "BANS" }]} />
            <div style={{ marginTop: 7 }}><Btn full tone="red" onClick={restart}>PLAY</Btn></div>
          </div>

          <div style={{
            position: "relative", overflow: "hidden", borderRadius: 15, padding: "13px 13px 12px",
            background: `linear-gradient(150deg, ${PANEL} 40%, ${GOLD}1a)`, border: `1px solid ${LINE}`,
          }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: GOLD, boxShadow: `0 0 14px ${GOLD}` }} />
            <div style={{ fontSize: 9, letterSpacing: 1.6, color: GOLD, fontWeight: 900, marginBottom: 4 }}>LIVE · 30s A PICK</div>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.4, marginBottom: 3 }}>Play a friend</div>
            <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.4, marginBottom: 10 }}>
              Draft head-to-head, then the same questions.
            </div>
            <Btn full tone="gold" onClick={async () => {
              const d = await roomCall({ action: "create", name: steamName || name || "Host" });
              if (d?.code) setLiveCode(d.code);
            }}>CREATE A ROOM</Btn>
            <div style={{ display: "flex", gap: 7, marginTop: 7 }}>
              <Field value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                placeholder="CODE" autoCapitalize="characters"
                style={{ flex: "1 1 auto", minWidth: 0, letterSpacing: 4, fontWeight: 900, textAlign: "center", padding: "8px 6px", minHeight: 38 }} />
              <Btn tone="dark" disabled={busy || codeInput.length < 4} onClick={async () => {
                setBusy(true); setJoinError(null);
                const j = await roomCall({ action: "join", code: codeInput, name: steamName || name || "Guest" });
                setBusy(false);
                if (j?.ok) setLiveCode(codeInput); else setJoinError("No room with that code.");
              }}>{busy ? "…" : "JOIN"}</Btn>
            </div>
            {joinError && <div style={{ color: RED, fontSize: 11.5, marginTop: 7 }}>{joinError}</div>}
          </div>

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

  /* -------------------------------------------------------------- quiz */
  if (stage === "quiz") {
    return (
      <Shell tab={null} head={<Band title="Draft locked" compact accent={GOLD} sub="Now the questions" />}>
        <DraftStyles />
        <div style={{ display: "grid", gap: 10, paddingTop: 10, paddingBottom: 16 }}>
          <TeamRow side="you" label="YOUR FIVE" heroes={yours.map(heroOf)} latest={null} motion={motion} height="clamp(56px, 16vw, 80px)" />
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
    const totalPicks = SEQ.filter((s) => s.kind === "pick" && s.by === "you").length;

    return (
      <Shell
        tab={null}
        head={
          <Band
            compact accent={banning ? RED : yourTurn ? GOLD : MUTED} onBack={toMenu}
            title="vs The Counterpicker"
            sub={botThinking ? "They're thinking…" : yourTurn ? (banning ? "Ban a hero" : "Pick a hero") : "Waiting…"}
            right={<Pips total={totalPicks} filled={yours.length} color={yourTurn ? GOLD : DIM} />}
          >
            <div style={{ display: "grid", gap: 7, marginTop: 8 }}>
              <TeamRow side="them" label="THE COUNTERPICKER" motion={motion} height="clamp(52px, 15vw, 74px)"
                heroes={theirs.map(heroOf)} latest={lastBotPick?.heroId ?? null}
                note={lastBotPick?.answering != null ? (
                  <span style={{ fontSize: 9, color: RED, textAlign: "right", lineHeight: 1.2 }}>
                    answers your {heroName(lastBotPick.answering)}
                  </span>
                ) : undefined} />
              <TeamRow side="you" label="YOU" motion={motion} height="clamp(52px, 15vw, 74px)"
                heroes={yours.map(heroOf)} latest={lastPick?.by === "you" ? lastPick.heroId : null} />
            </div>
            {bans.length > 0 && <div style={{ marginTop: 7 }}><BanStrip bans={bans} byId={heroById} /></div>}
            <Field value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={yourTurn ? (banning ? "Search — banning" : "Search heroes") : "Waiting for them…"}
              disabled={!yourTurn}
              style={{ marginTop: 8, padding: "7px 11px", minHeight: 34, opacity: yourTurn ? 1 : .4, borderColor: banning && yourTurn ? RED : LINE }} />
          </Band>
        }
      >
        <DraftStyles />
        {lastBotBan && lastBotBan.deniedRank != null && lastBotBan.deniedRank <= 5 && (
          <div style={{ fontSize: 11.5, color: RED, padding: "8px 2px 0" }}>
            They banned <strong style={{ color: CREAM }}>{heroName(lastBotBan.heroId)}</strong> — your
            {lastBotBan.deniedRank === 1 ? " best" : ` #${lastBotBan.deniedRank}`} option.
          </div>
        )}
        <div style={{ padding: "9px 0 16px", opacity: yourTurn ? 1 : .32, pointerEvents: yourTurn ? "auto" : "none" }}>
          <HeroGrid ids={filtered} byId={heroById} onPick={act} dim={banning} />
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
      <DraftStyles />
      <Result engine={engine} events={events} yours={yours} theirs={theirs} finalP={finalP}
        quiz={quiz} tempos={tempos} motion={motion} scored={scored} />
    </Shell>
  );
}
