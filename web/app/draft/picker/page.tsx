"use client";

import { useEffect, useMemo, useState } from "react";
import { buildEngine, evaluate, rankCandidates, type DraftModel, type Engine } from "@/lib/draftlab";
import { counterMap, tempoMap, teamTempo, type TempoRow } from "@/lib/draftbot";
import {
  Shell, Band, Segment, Field, Panel, Delta,
  CREAM, PANEL, LINE, MUTED, DIM, ALLY, ENEMY,
  ALLY_FILL, ENEMY_FILL, LEMON, ON_FILL, R_CHIP, BW, lift,
} from "../ui";
import { Skeleton } from "../theme";
import { HeroImg, heroBase } from "../hero-art";

const ROLE_ORDER = ["Carry", "Support", "Nuker", "Disabler", "Durable", "Escape", "Initiator", "Pusher", "Jungler"];

/**
 * Draft Picker — a tool, not a game.
 *
 * You are mid-draft in a real match and want to know what is actually left. Fill
 * in what both sides have taken and it ranks every remaining hero by what it does
 * to win probability — for whichever side you are currently filling in, so it
 * answers "what should I take?" and "what are they about to take?" with the same
 * control.
 *
 * The board and the side selector are pinned. Choosing a side is the single most
 * repeated action here, and in the previous version it lived at the bottom of a
 * long page, so every pick meant scrolling down to switch and back up to read.
 *
 * Size follows commitment, not browsing. The five heroes you have put on the
 * board are the big pictures; the pool underneath is a dense grid you scan. An
 * earlier version had this exactly backwards — huge candidate cards above a row
 * of 33px chips for the heroes actually chosen.
 */
export default function PickerPage() {
  const [model, setModel] = useState<DraftModel | null>(null);
  const [mine, setMine] = useState<number[]>([]);
  const [theirs, setTheirs] = useState<number[]>([]);
  const [side, setSide] = useState<"mine" | "theirs">("mine");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");

  useEffect(() => { fetch("/draftlab/model.json").then((r) => r.json()).then(setModel).catch(() => {}); }, []);

  const engine: Engine | null = useMemo(() => (model ? buildEngine(model) : null), [model]);
  const tempos = useMemo(() => (model ? tempoMap(model as { tempo?: TempoRow[] }) : new Map()), [model]);

  const roles = useMemo(() => {
    if (!model) return [];
    const seen = new Set<string>();
    model.heroes.forEach((h) => h.roles.forEach((r) => seen.add(r)));
    return ROLE_ORDER.filter((r) => seen.has(r));
  }, [model]);

  const available = useMemo(() => {
    if (!model) return [];
    const used = new Set([...mine, ...theirs]);
    return model.heroes.filter((h) => !used.has(h.id)).map((h) => h.id);
  }, [model, mine, theirs]);

  /**
   * Ranked for the side currently being filled in.
   *
   * `mine` is Radiant and `theirs` is Dire throughout, so switching the segment
   * flips the team index and the list answers the other half of the question.
   */
  const ranked = useMemo(() => {
    if (!engine) return [];
    const full = side === "mine" ? mine.length >= 5 : theirs.length >= 5;
    if (full) return [];
    return rankCandidates(engine, mine, theirs, available, side === "mine" ? 0 : 1);
  }, [engine, mine, theirs, available, side]);

  const p = useMemo(() => {
    if (!engine || (!mine.length && !theirs.length)) return null;
    return evaluate(engine, mine, theirs).p;
  }, [engine, mine, theirs]);

  if (!model || !engine) {
    return (
      <Shell tab="picker" head={<Band title="Draft Picker" />}>
          <Skeleton h={120} style={{ marginTop: 12 }} />
      </Shell>
    );
  }

  const heroById = (id: number) => engine.heroById.get(id);
  const heroName = (id: number) => heroById(id)?.name ?? `#${id}`;
  const add = (id: number) => {
    const target = side === "mine" ? mine : theirs;
    if (target.length >= 5) return;
    (side === "mine" ? setMine : setTheirs)([...target, id]);
    setSearch("");
  };
  const remove = (id: number, from: "mine" | "theirs") =>
    (from === "mine" ? setMine : setTheirs)((from === "mine" ? mine : theirs).filter((h) => h !== id));

  const q = search.trim().toLowerCase();
  const list = ranked
    .filter((c) => !q || heroName(c.heroId).toLowerCase().includes(q))
    .filter((c) => role === "all" || heroById(c.heroId)?.roles.includes(role))
    .slice(0, 60);
  const { theirsWin } = counterMap(engine, mine, theirs);
  // A one-hero-a-side board says nothing about pace; wait for a real shape.
  const dTempo = mine.length >= 3 && theirs.length >= 3 ? teamTempo(mine, tempos) - teamTempo(theirs, tempos) : 0;
  const accent = side === "mine" ? ALLY : ENEMY;
  const accentFill = side === "mine" ? ALLY_FILL : ENEMY_FILL;
  const best = list.length ? Math.max(...list.map((c) => c.delta)) : 0;

  return (
    <Shell
      tab="picker"
      head={
        <Band
          title="Draft Picker" compact accent={accentFill}
          sub="Fill in the board — it ranks what is left"
          right={
            (mine.length || theirs.length) ? (
              <button className="dl-btn" onClick={() => { setMine([]); setTheirs([]); }} style={{
                background: PANEL, border: `2px solid ${LINE}`, color: CREAM, fontFamily: "inherit",
                borderRadius: 999, padding: "5px 11px", fontSize: 10, fontWeight: 900, cursor: "pointer",
                letterSpacing: .8, ...lift(2),
              }}>RESET</button>
            ) : undefined
          }
        >
          {/* Always occupies its space, so adding the first hero does not shove
              the whole list down under the thumb that just tapped it. */}
          <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "10px 0 8px", visibility: p == null ? "hidden" : "visible" }}>
            <span style={{ fontSize: 19, fontWeight: 900, color: ALLY, fontVariantNumeric: "tabular-nums", lineHeight: 1, letterSpacing: "-.02em" }}>{((p ?? 0.5) * 100).toFixed(1)}%</span>
            <div style={{ flex: "1 1 auto", height: 13, background: ENEMY_FILL, borderRadius: 999, overflow: "hidden", border: `${BW}px solid ${LINE}`, boxSizing: "border-box" }}>
              <div style={{
                width: `${(p ?? 0.5) * 100}%`, height: "100%", background: ALLY_FILL, boxSizing: "border-box",
                borderRight: `${BW}px solid ${LINE}`, transition: "width .5s var(--ease)",
              }} />
            </div>
            <span style={{ fontSize: 19, fontWeight: 900, color: ENEMY, fontVariantNumeric: "tabular-nums", lineHeight: 1, letterSpacing: "-.02em" }}>{((1 - (p ?? 0.5)) * 100).toFixed(1)}%</span>
          </div>

          {/* The board: one row a side, so a chosen hero is a picture you can
              actually read. Ten slots across a phone made each one a 33px chip —
              the heroes you have committed to should be the biggest thing here,
              not the pool you are still browsing. */}
          <div style={{ display: "grid", gap: 6, margin: "9px 0 8px" }}>
            <Slots label="YOUR TEAM" fill={ALLY_FILL} ids={mine} onRemove={(id) => remove(id, "mine")} heroById={heroById}
              onEmpty={() => setSide("mine")} />
            <Slots label="ENEMY" fill={ENEMY_FILL} ids={theirs} onRemove={(id) => remove(id, "theirs")} heroById={heroById}
              onEmpty={() => setSide("theirs")} />
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ flex: "0 0 40%" }}>
              <Segment
                dense value={side} onChange={setSide}
                options={[
                  { v: "mine", label: "ALLY", accent: ALLY_FILL, dot: ALLY },
                  { v: "theirs", label: "ENEMY", accent: ENEMY_FILL, dot: ENEMY },
                ]}
              />
            </div>
            <Field value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search heroes"
              style={{ flex: "1 1 auto", padding: "6px 10px", fontSize: 16, minHeight: 34 }} />
          </div>

          {roles.length > 0 && (
            <div style={{ display: "flex", gap: 4, marginTop: 7, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 1 }}>
              {["all", ...roles].map((r) => {
                const on = role === r;
                return (
                  <button key={r} className="dl-btn dl-flat" onClick={() => setRole(r)} style={{
                    flexShrink: 0, padding: "4px 10px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
                    background: on ? accentFill : PANEL, color: on ? ON_FILL : DIM,
                    border: `2px solid ${LINE}`, fontSize: 9.5, fontWeight: 900, letterSpacing: .5,
                  }}>{r === "all" ? "ALL" : r.toUpperCase()}</button>
                );
              })}
            </div>
          )}
        </Band>
      }
    >

      {(theirsWin.length > 0 || Math.abs(dTempo) > 0.12) && (
        <Panel style={{ margin: "11px 0 9px", padding: "10px 12px" }}>
          {theirsWin.slice(0, 2).map((r, i) => (
            <div key={i} style={{ fontSize: 11.5, color: MUTED, fontWeight: 600, padding: "2px 0" }}>
              <b style={{ color: ENEMY }}>{heroName(r.attacker)}</b> is beating your <b style={{ color: CREAM }}>{heroName(r.defender)}</b>
              {r.winRate != null && ` · ${(r.winRate * 100).toFixed(0)}%`}
            </div>
          ))}
          {Math.abs(dTempo) > 0.12 && (
            <div style={{ marginTop: theirsWin.length ? 7 : 0 }}>
              <span className="dl-stk" style={{ background: LEMON, fontSize: 8.5, whiteSpace: "normal" }}>
                {dTempo > 0 ? "You want this game to end early" : "You scale — survive the early game"}
              </span>
            </div>
          )}
        </Panel>
      )}

      <div style={{ margin: "13px 0 9px" }}>
        <span className="dl-stk" style={{ background: accentFill, fontSize: 9 }}>
          {side === "mine" ? "BEST PICKS LEFT FOR YOU" : "WHAT THEY WANT NEXT"}
        </span>
      </div>

      {list.length === 0 && (
        <div style={{ fontSize: 12.5, color: MUTED, fontWeight: 600, padding: "10px 2px 20px" }}>
          {(side === "mine" ? mine : theirs).length >= 5
            ? "That side is full. Switch sides or reset."
            : "Nothing matches that search."}
        </div>
      )}

      {/* The pool is deliberately dense. It is a list you scan, not a list you
          admire — the heroes worth looking at are the ones already on the board
          above, and every row of tiles saved here is a row of options seen. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(clamp(50px, 15vw, 64px), 1fr))", gap: 7, paddingBottom: 16 }}>
        {list.map((c, i) => {
          const h = heroById(c.heroId)!;
          const top = i === 0 && !q && role === "all";
          // Normalised against the best delta on screen, so the scale is relative
          // to this board rather than an absolute that is meaningless at 5 picks.
          const strength = best > 0 ? Math.max(0, c.delta) / best : 0;
          // Depth tracks the size of the swing. A glow did this before, which on
          // paper is a smudge; a taller shadow lifts the strong options off the
          // page instead, and the best one on the board gets an accent outline.
          const depth = strength > .12 ? 2 + Math.round(strength * 3) : 2;
          return (
            <button
              key={c.heroId} className="dl-pick" onClick={() => add(c.heroId)} title={`${h.name} · ${c.delta >= 0 ? "+" : ""}${c.delta.toFixed(1)}%`}
              style={{
                position: "relative", borderRadius: R_CHIP, overflow: "hidden", cursor: "pointer", padding: 0,
                background: "var(--tile)", aspectRatio: "1 / 1", boxSizing: "border-box",
                border: `${top ? 3.5 : BW}px solid ${top ? accent : LINE}`, ...lift(depth),
              }}
            >
              <HeroImg base={heroBase(h.img)} name={h.name} />
              <span style={{ position: "absolute", top: 2, left: 2 }}>
                <Delta v={c.delta} forThem={side === "theirs"} size={8.5} />
              </span>
              <span style={{
                position: "absolute", left: 0, right: 0, bottom: 0, fontSize: 7, color: "#FFF7EA", fontWeight: 900,
                background: "#16131F", padding: "2px", letterSpacing: .2,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{h.name}</span>
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 10.5, color: DIM, fontWeight: 600, lineHeight: 1.5, padding: "0 2px 14px" }}>
        Trained on 2.57M ranked matches, patch {model.patch}. It knows hero matchups and pairings — not lanes, roles,
        items or your teammates. Treat a close call as a close call.
      </div>
    </Shell>
  );
}

/** One team's five slots. Tap a filled one to take it back off the board. */
function Slots({
  label, ids, fill, onRemove, onEmpty, heroById,
}: {
  label: string; ids: number[]; fill: string;
  onRemove: (id: number) => void; onEmpty: () => void;
  heroById: (id: number) => { img: string; name: string } | undefined;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
        <span className="dl-stk" style={{ background: fill, fontSize: 8, padding: "2px 8px", borderWidth: 2, boxShadow: `2px 2px 0 ${LINE}` }}>
          {label}
        </span>
        <span className="dl-rule" style={{ flex: "1 1 auto" }} />
        <span style={{ fontSize: 8.5, color: DIM, fontWeight: 900 }}>{ids.length}/5</span>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {Array.from({ length: 5 }).map((_, i) => {
          const id = ids[i];
          const h = id != null ? heroById(id) : null;
          return (
            <div key={i} style={{ flex: "1 1 0", minWidth: 0 }}>
              {h ? (
                <button onClick={() => onRemove(id)} className="dl-pick" title={`Remove ${h.name}`} style={{
                  width: "100%", aspectRatio: "1 / 1", padding: 0, borderRadius: 9, overflow: "hidden",
                  border: `2px solid ${LINE}`, background: "var(--tile)", cursor: "pointer", display: "block",
                  position: "relative", boxSizing: "border-box", ...lift(2),
                }}>
                  <HeroImg base={heroBase(h.img)} name={h.name} />
                  <span style={{
                    position: "absolute", left: 0, right: 0, bottom: 0, fontSize: 7, color: "#FFF7EA", fontWeight: 900,
                    background: "#16131F", padding: "1px 2px",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{h.name}</span>
                </button>
              ) : (
                <button onClick={onEmpty} className="dl-pick dl-flat" aria-label={`Add to ${label}`} style={{
                  width: "100%", aspectRatio: "1 / 1", borderRadius: 9, border: `2px dashed ${LINE}`,
                  display: "grid", placeItems: "center", color: DIM, fontSize: 15, fontWeight: 900,
                  background: "transparent", cursor: "pointer", boxSizing: "border-box",
                }}>+</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
