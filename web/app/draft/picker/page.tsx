"use client";

import { useEffect, useMemo, useState } from "react";
import { buildEngine, evaluate, rankCandidates, type DraftModel, type Engine } from "@/lib/draftlab";
import { counterMap, tempoMap, teamTempo, type TempoRow } from "@/lib/draftbot";
import {
  Shell, Band, Segment, Field, Panel, Label, Delta,
  RED, CREAM, PANEL, LINE, MUTED, DIM, GREEN, GOLD,
} from "../ui";
import { DraftStyles, HeroImg, heroBase } from "../hero-art";

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
 * The result list is a grid of large hero cards, not a thin row of thumbnails —
 * the picture should do most of the work, and a 48x32 crop next to a line of text
 * read as a spreadsheet, not a competitive tool.
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
        <DraftStyles />
        <div className="dl-sheen" style={{ height: 120, borderRadius: 10, background: PANEL, marginTop: 12 }} />
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
  const accent = side === "mine" ? GREEN : RED;

  return (
    <Shell
      tab="picker"
      head={
        <Band
          title="Draft Picker" compact accent={accent}
          sub="Fill in the board — it ranks what is left"
          right={
            (mine.length || theirs.length) ? (
              <button className="dl-btn" onClick={() => { setMine([]); setTheirs([]); }} style={{
                background: "rgba(255,255,255,.07)", border: `1px solid ${LINE}`, color: MUTED,
                borderRadius: 6, padding: "5px 10px", fontSize: 10.5, fontWeight: 900, cursor: "pointer", letterSpacing: .6,
              }}>RESET</button>
            ) : undefined
          }
        >
          {/* Always occupies its space, so adding the first hero does not shove
              the whole list down under the thumb that just tapped it. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "9px 0 8px", visibility: p == null ? "hidden" : "visible" }}>
            <span style={{ fontSize: 19, fontWeight: 900, color: GREEN, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{((p ?? 0.5) * 100).toFixed(1)}%</span>
            <div style={{ flex: "1 1 auto", height: 7, background: `linear-gradient(90deg, #7a231d, ${RED})`, borderRadius: 5, overflow: "hidden", border: `1px solid ${LINE}` }}>
              <div style={{ width: `${(p ?? 0.5) * 100}%`, height: "100%", background: `linear-gradient(90deg, ${GREEN}, #2b8f4c)`, boxShadow: `0 0 12px ${GREEN}`, transition: "width .5s ease" }} />
            </div>
            <span style={{ fontSize: 19, fontWeight: 900, color: RED, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{((1 - (p ?? 0.5)) * 100).toFixed(1)}%</span>
          </div>

          {/* The board: ten slots, yours and theirs, always on screen. */}
          <div style={{ display: "flex", gap: 3, alignItems: "center", margin: "8px 0" }}>
            <Slots ids={mine} accent={GREEN} onRemove={(id) => remove(id, "mine")} heroById={heroById} />
            <span style={{ fontSize: 8.5, color: DIM, fontWeight: 900, flexShrink: 0, padding: "0 1px" }}>VS</span>
            <Slots ids={theirs} accent={RED} onRemove={(id) => remove(id, "theirs")} heroById={heroById} />
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ flex: "0 0 40%" }}>
              <Segment
                dense value={side} onChange={setSide}
                options={[
                  { v: "mine", label: "ALLY", accent: GREEN, dot: GREEN },
                  { v: "theirs", label: "ENEMY", accent: RED, dot: RED },
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
                  <button key={r} className="dl-btn" onClick={() => setRole(r)} style={{
                    flexShrink: 0, padding: "4px 9px", borderRadius: 6, cursor: "pointer",
                    background: on ? accent : "transparent", color: on ? "#0b0810" : MUTED,
                    border: `1px solid ${on ? accent : LINE}`, fontSize: 9.5, fontWeight: 900, letterSpacing: .4,
                  }}>{r === "all" ? "ALL" : r.toUpperCase()}</button>
                );
              })}
            </div>
          )}
        </Band>
      }
    >
      <DraftStyles />

      {(theirsWin.length > 0 || Math.abs(dTempo) > 0.12) && (
        <Panel style={{ margin: "10px 0 8px", padding: "9px 11px" }}>
          {theirsWin.slice(0, 2).map((r, i) => (
            <div key={i} style={{ fontSize: 11.5, color: MUTED, padding: "1px 0" }}>
              <b style={{ color: RED }}>{heroName(r.attacker)}</b> is beating your <b style={{ color: CREAM }}>{heroName(r.defender)}</b>
              {r.winRate != null && ` · ${(r.winRate * 100).toFixed(0)}%`}
            </div>
          ))}
          {Math.abs(dTempo) > 0.12 && (
            <div style={{ fontSize: 11.5, color: GOLD, marginTop: theirsWin.length ? 5 : 0 }}>
              {dTempo > 0 ? "You want this game to end early." : "You scale better — survive the early game."}
            </div>
          )}
        </Panel>
      )}

      <Label color={accent} style={{ marginTop: 10 }}>
        {side === "mine" ? "BEST PICKS LEFT FOR YOU" : "WHAT THEY WANT NEXT"}
      </Label>

      {list.length === 0 && (
        <div style={{ fontSize: 12.5, color: MUTED, padding: "10px 2px 20px" }}>
          {(side === "mine" ? mine : theirs).length >= 5
            ? "That side is full. Switch sides or reset."
            : "Nothing matches that search."}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(clamp(88px, 27vw, 118px), 1fr))", gap: 8, paddingBottom: 16 }}>
        {list.map((c, i) => {
          const h = heroById(c.heroId)!;
          const top = i === 0 && !q && role === "all";
          return (
            <div
              key={c.heroId}
              className="dl-pick"
              onClick={() => add(c.heroId)}
              role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") add(c.heroId); }}
              style={{
                position: "relative", borderRadius: 9, overflow: "hidden", cursor: "pointer",
                background: "#0c0a12", aspectRatio: "3 / 4",
                border: `1px solid ${top ? accent + "88" : LINE}`,
                boxShadow: top ? `0 0 0 1px ${accent}, 0 8px 22px -10px ${accent}` : undefined,
              }}
            >
              <HeroImg base={heroBase(h.img)} name={h.name} />

              <span style={{
                position: "absolute", top: 5, left: 5, background: "rgba(6,5,10,.72)",
                border: `1px solid ${LINE}`, borderRadius: 6, padding: "2px 5px",
              }}>
                <Delta v={c.delta} forThem={side === "theirs"} size={11} />
              </span>

              <a
                href={`/draft/guide?hero=${c.heroId}`} aria-label={`About ${h.name}`}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute", top: 5, right: 5, width: 20, height: 20, borderRadius: 10,
                  background: "rgba(6,5,10,.72)", border: `1px solid ${LINE}`,
                  display: "grid", placeItems: "center", color: DIM, fontSize: 10.5, fontWeight: 900, textDecoration: "none",
                }}
              >i</a>

              <div style={{
                position: "absolute", left: 0, right: 0, bottom: 0,
                background: "linear-gradient(transparent, rgba(4,3,7,.96) 55%)", padding: "20px 6px 6px",
              }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: CREAM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.name}</div>
                <div style={{ fontSize: 8.5, color: DIM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: .3, marginTop: 1 }}>
                  {h.roles.slice(0, 2).join(" · ").toUpperCase()}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 10.5, color: DIM, lineHeight: 1.5, padding: "0 2px 14px" }}>
        Trained on 2.57M ranked matches, patch {model.patch}. It knows hero matchups and pairings — not lanes, roles,
        items or your teammates. Treat a close call as a close call.
      </div>
    </Shell>
  );
}

/** Five slots for one team. Tap a filled one to take it back off the board. */
function Slots({
  ids, accent, onRemove, heroById,
}: {
  ids: number[]; accent: string; onRemove: (id: number) => void;
  heroById: (id: number) => { img: string; name: string } | undefined;
}) {
  return (
    <div style={{ display: "flex", gap: 3, flex: "1 1 0", minWidth: 0 }}>
      {Array.from({ length: 5 }).map((_, i) => {
        const id = ids[i];
        const h = id != null ? heroById(id) : null;
        return (
          <div key={i} style={{ flex: "1 1 0", minWidth: 0 }}>
            {h ? (
              <button onClick={() => onRemove(id)} className="dl-pick" title={`Remove ${h.name}`} style={{
                width: "100%", aspectRatio: "1 / 1", padding: 0, borderRadius: 6, overflow: "hidden",
                border: `1px solid ${accent}88`, background: "#0c0a12", cursor: "pointer", display: "block",
              }}>
                <HeroImg base={heroBase(h.img)} name={h.name} />
              </button>
            ) : (
              <div style={{
                aspectRatio: "1 / 1", borderRadius: 6, border: `1px dashed ${accent}44`,
                display: "grid", placeItems: "center", color: `${accent}55`, fontSize: 11,
              }}>◆</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
