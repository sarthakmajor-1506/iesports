"use client";

import { useState } from "react";
import { type Engine } from "@/lib/draftlab";
import { type DraftReport, type HeroReport, type Matchup } from "@/lib/draftReport";
import { HeroImg, heroBase } from "./hero-art";
import {
  Panel,
  CREAM, PANEL_2, LINE, MUTED, DIM, GREEN, ENEMY,
  LEMON, MINT, PINK, LILAC, ON_FILL, R_CHIP,
} from "./ui";

/**
 * The reckoning behind the verdict.
 *
 * The result screen used to state who won the draft and show three counter
 * edges per side. Everything else the model had computed — what each of the ten
 * heroes was worth, all twenty-five matchups, what each turn moved and what was
 * on the board instead — was thrown away. This is that, laid out.
 *
 * All of it reads off one `DraftReport` (lib/draftReport.ts), which is derived
 * from the move list alone, so a live room and a solo game get the same screen
 * rather than the mode with richer local state getting a better post-mortem.
 */

const pct = (v: number | null) => (v == null ? "–" : `${Math.round(v * 100)}%`);
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;

/** Mint when it favours the hero, pink when it does not, paper when it is level. */
const matchTone = (w: number | null) => {
  if (w == null) return { bg: PANEL_2, fg: DIM };
  if (w >= 0.53) return { bg: MINT, fg: ON_FILL };
  if (w <= 0.47) return { bg: PINK, fg: ON_FILL };
  return { bg: PANEL_2, fg: CREAM };
};

function Portrait({ engine, id, size = 26 }: { engine: Engine; id: number; size?: number }) {
  const h = engine.heroById.get(id);
  return (
    <span title={h?.name} style={{
      flexShrink: 0, width: size, height: size * 0.72, borderRadius: 5, overflow: "hidden",
      border: `1.5px solid ${LINE}`, boxSizing: "border-box", background: "var(--tile)", display: "block",
    }}>
      {h && <HeroImg base={heroBase(h.img)} shape="crop" position="50% 20%" />}
    </span>
  );
}

/**
 * A section that can be folded away.
 *
 * The detail here is the point, so everything opens by default — but a
 * post-mortem nobody can collapse is a wall, and the turn log alone is sixteen
 * rows in a bans draft.
 */
function Fold({
  title, tone = LEMON, children, open: initial = true, note,
}: { title: string; tone?: string; children: React.ReactNode; open?: boolean; note?: string }) {
  const [open, setOpen] = useState(initial);
  return (
    <Panel style={{ padding: "10px 12px 11px" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
          background: "none", border: "none", padding: 0, fontFamily: "inherit", textAlign: "left",
        }}
      >
        <span className="dl-stk" style={{ background: tone, fontSize: 9 }}>{title}</span>
        <span style={{ flex: "1 1 auto" }} />
        <span style={{ fontSize: 13, fontWeight: 900, color: DIM, lineHeight: 1 }}>{open ? "−" : "+"}</span>
      </button>
      {note && open && (
        <div style={{ fontSize: 9.5, color: MUTED, fontWeight: 700, lineHeight: 1.4, marginTop: 7 }}>{note}</div>
      )}
      {open && <div style={{ marginTop: 9 }}>{children}</div>}
    </Panel>
  );
}

/* ------------------------------------------------------------ where it went */

/**
 * The verdict, decomposed.
 *
 * A win probability on its own is an assertion. These are the three things the
 * model actually adds up — how good the heroes are on their own, how they match
 * into the other five, and how they work with their own four — so the number
 * has somewhere to come from.
 */
export function WhereItWasWon({ report }: { report: DraftReport }) {
  const rows: { label: string; v: number; hint: string }[] = [
    { label: "HERO STRENGTH", v: report.split.base, hint: "how the ten rate on their own" },
    { label: "MATCHUPS", v: report.split.counters, hint: "your five against their five" },
    { label: "SYNERGY", v: report.split.synergy, hint: "how each five works together" },
  ];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.v)));

  return (
    <Fold title="WHERE THE DRAFT WAS DECIDED" tone={LILAC}
      note="What each part is worth to you, in points of win probability: this draft, minus the same draft with that part taken out.">
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 9 }}>
        {rows.map((r) => {
          const good = r.v >= 0;
          return (
            <div key={r.label}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 9, letterSpacing: 1.1, fontWeight: 900, color: DIM, flexShrink: 0 }}>{r.label}</span>
                <span style={{ flex: "1 1 auto", minWidth: 0, fontSize: 9.5, color: MUTED, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.hint}</span>
                <span style={{ fontSize: 12, fontWeight: 900, color: good ? GREEN : ENEMY, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{signed(r.v)}</span>
              </div>
              {/* A centre line with the bar leaving it either way, so which side
                  a term fell on is legible without reading the sign. */}
              <div style={{ position: "relative", height: 9, background: PANEL_2, border: `2px solid ${LINE}`, borderRadius: 999, boxSizing: "border-box" }}>
                <span style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 2, background: LINE }} />
                <span style={{
                  position: "absolute", top: 0, bottom: 0,
                  left: good ? "50%" : `${50 - (Math.abs(r.v) / max) * 50}%`,
                  width: `${(Math.abs(r.v) / max) * 50}%`,
                  background: good ? MINT : PINK,
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </Fold>
  );
}

/* ------------------------------------------------------------- the matchups */

/**
 * Every cross matchup in the draft, at once.
 *
 * Twenty-five numbers is a grid, not a list: your five down the side, their
 * five across the top, each cell your hero's head-to-head win rate against
 * theirs. Reading a row tells you what one of your heroes is walking into;
 * reading a column tells you which of yours answers one of theirs.
 */
export function MatchupGrid({ report, engine }: { report: DraftReport; engine: Engine }) {
  const { mine, theirs } = report;
  const byPair = new Map<string, Matchup>();
  for (const m of report.matchups) byPair.set(`${m.ally}:${m.foe}`, m);
  const worth = new Map(report.heroes.filter((h) => h.mine).map((h) => [h.heroId, h.worth]));

  if (!mine.length || !theirs.length) return null;

  return (
    <Fold title="EVERY MATCHUP" tone={PINK}
      note="Your hero's win rate against theirs. Mint is ahead, pink is behind, and a dash means the model has never seen the pair.">
      <div style={{ display: "grid", gridTemplateColumns: `minmax(0, 1fr) repeat(${theirs.length}, 40px)`, gap: 3, alignItems: "center" }}>
        {/* Their five, as the column heads. */}
        <span />
        {theirs.map((t) => (
          <span key={t} style={{ display: "grid", placeItems: "center" }}>
            <Portrait engine={engine} id={t} size={32} />
          </span>
        ))}

        {mine.map((a) => {
          const w = worth.get(a) ?? 0;
          return (
            <Row key={a}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <Portrait engine={engine} id={a} size={26} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 10.5, fontWeight: 800, color: CREAM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {engine.heroById.get(a)?.name ?? `#${a}`}
                  </span>
                  <span style={{ display: "block", fontSize: 9, fontWeight: 900, color: w >= 0 ? GREEN : ENEMY, fontVariantNumeric: "tabular-nums" }}>
                    {signed(w)}
                  </span>
                </span>
              </span>
              {theirs.map((t) => {
                const m = byPair.get(`${a}:${t}`);
                const tone = matchTone(m?.winRate ?? null);
                return (
                  <span key={t} title={`${engine.heroById.get(a)?.name} vs ${engine.heroById.get(t)?.name}`} style={{
                    height: 28, borderRadius: 6, display: "grid", placeItems: "center", boxSizing: "border-box",
                    background: tone.bg, color: tone.fg, border: `1.5px solid ${LINE}`,
                    fontSize: 10, fontWeight: 900, fontVariantNumeric: "tabular-nums",
                  }}>{pct(m?.winRate ?? null)}</span>
                );
              })}
            </Row>
          );
        })}
      </div>
    </Fold>
  );
}

/** Grid rows are flat children, so this is only here to keep the JSX honest. */
function Row({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/* --------------------------------------------------------------- the heroes */

/**
 * Each of the ten, and what it did.
 *
 * `worth` is a counterfactual rather than a coefficient — the draft re-run
 * without that hero — so it already contains its strength, its matchups and its
 * pairings. The two matchups beside it are the extremes of its row in the grid
 * above: the one it wins hardest and the one it loses hardest.
 */
export function HeroBreakdown({ report, engine, meName, themName }: {
  report: DraftReport; engine: Engine; meName: string; themName: string;
}) {
  return (
    <Fold title="HERO BY HERO" tone={MINT}
      note="What each hero is worth to its own side — the draft re-run without it, in points of win probability.">
      <HeroSide engine={engine} rows={report.heroes.filter((h) => h.mine)} label={meName.toUpperCase()} tone={GREEN} />
      <div style={{ height: 10 }} />
      <HeroSide engine={engine} rows={report.heroes.filter((h) => !h.mine)} label={themName.toUpperCase()} tone={ENEMY} />
    </Fold>
  );
}

/** Declared here rather than inside HeroBreakdown: a component created during
 *  render is a new type every pass, so React remounts it and it loses state. */
function HeroSide({ engine, rows, label, tone }: {
  engine: Engine; rows: HeroReport[]; label: string; tone: string;
}) {
  const name = (id: number) => engine.heroById.get(id)?.name ?? `#${id}`;
  return (
    <div>
      <div style={{ fontSize: 9, letterSpacing: 1.2, color: tone, marginBottom: 6, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 7 }}>
        {rows.map((h) => {
          const best = h.matchups[0];
          const worst = h.matchups[h.matchups.length - 1];
          const partner = h.pairings[0];
          return (
            <div key={h.heroId} style={{
              display: "flex", gap: 8, padding: "7px 8px", borderRadius: R_CHIP, boxSizing: "border-box",
              background: PANEL_2, border: `2px solid ${LINE}`,
            }}>
              <Portrait engine={engine} id={h.heroId} size={38} />
              <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ flex: "1 1 auto", minWidth: 0, fontSize: 11.5, fontWeight: 900, color: CREAM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {name(h.heroId)}
                  </span>
                  {h.turn != null && (
                    <span style={{ fontSize: 8.5, color: DIM, fontWeight: 900, flexShrink: 0 }}>
                      #{h.turn}{h.auto ? " · CLOCK" : ""}
                    </span>
                  )}
                  <span style={{ fontSize: 12, fontWeight: 900, color: h.worth >= 0 ? GREEN : ENEMY, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                    {signed(h.worth)}
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                  {best && best.winRate != null && best.edge > 0 && (
                    <Chip tone={MINT}>beats {name(best.foe)} {pct(best.winRate)}</Chip>
                  )}
                  {worst && worst.winRate != null && worst.edge < 0 && worst.foe !== best?.foe && (
                    <Chip tone={PINK}>loses to {name(worst.foe)} {pct(worst.winRate)}</Chip>
                  )}
                  {partner && partner.edge > 0 && (
                    <Chip tone={LEMON}>with {name(partner.b)}</Chip>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 900, letterSpacing: .2, padding: "2px 6px", borderRadius: 999,
      background: tone, color: ON_FILL, border: `1.5px solid ${LINE}`, boxSizing: "border-box",
      whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis",
    }}>{children}</span>
  );
}

/* ---------------------------------------------------------------- the turns */

/**
 * The draft, in the order it happened.
 *
 * Every turn carries what it moved and — for a pick — where it ranked among
 * everything still on the board, which is the difference between "you lost" and
 * "this is the turn you lost it on".
 */
export function TurnLog({ report, engine, meName, themName }: {
  report: DraftReport; engine: Engine; meName: string; themName: string;
}) {
  const name = (id: number) => engine.heroById.get(id)?.name ?? `#${id}`;

  return (
    <Fold title="TURN BY TURN" tone={LEMON} open={false}
      note="The swing is what each move did to your win probability. Rank is where the hero stood among everything still available, for whoever took it.">
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6 }}>
        {report.turns.map((t) => {
          const good = t.swing >= 0;
          const reason: string[] = [];
          if (t.kind === "ban") reason.push("banned");
          if (t.rank != null && t.pool != null) {
            reason.push(t.rank === 1 ? "their top option" : `ranked ${t.rank} of ${t.pool}`);
          }
          if (t.answers != null) reason.push(`answers ${name(t.answers)}`);
          if (t.punishedBy != null) reason.push(`walks into ${name(t.punishedBy)}`);
          if (t.regret != null && t.regret >= 1 && t.bestAlt != null) {
            reason.push(`${name(t.bestAlt)} was worth ${t.regret.toFixed(1)} more`);
          }
          if (t.auto) reason.push("taken by the clock");

          return (
            <div key={t.turn} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
              <span style={{
                flexShrink: 0, width: 18, textAlign: "right", fontSize: 9, fontWeight: 900,
                color: DIM, fontVariantNumeric: "tabular-nums", paddingTop: 5,
              }}>{t.turn}</span>
              <Portrait engine={engine} id={t.heroId} size={30} />
              <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  {/* Ellipsised rather than sliced: a hard cut turned "The
                      Counterpicker" into "THE COUNTE", which reads as a bug. */}
                  <span style={{
                    fontSize: 8.5, fontWeight: 900, letterSpacing: .6, flexShrink: 0,
                    maxWidth: 74, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    color: t.mine ? GREEN : ENEMY,
                  }}>{(t.mine ? meName : themName).toUpperCase()}</span>
                  <span style={{ flex: "1 1 auto", minWidth: 0, fontSize: 11, fontWeight: 800, color: t.kind === "ban" ? DIM : CREAM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: t.kind === "ban" ? "line-through" : "none" }}>
                    {name(t.heroId)}
                  </span>
                  {t.kind === "pick" && (
                    <span style={{ fontSize: 10.5, fontWeight: 900, color: good ? GREEN : ENEMY, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                      {signed(t.swing)}
                    </span>
                  )}
                </div>
                {reason.length > 0 && (
                  <div style={{ fontSize: 9.5, color: MUTED, fontWeight: 700, lineHeight: 1.35, marginTop: 1 }}>
                    {reason.join(" · ")}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Fold>
  );
}

/* ------------------------------------------------------------- all together */

/**
 * The whole post-mortem, in the order it is worth reading: what decided it,
 * then the matchups, then each hero, then the turns that got there.
 */
export function DraftPostMortem({ report, engine, meName, themName }: {
  report: DraftReport; engine: Engine; meName: string; themName: string;
}) {
  return (
    <>
      <WhereItWasWon report={report} />
      <MatchupGrid report={report} engine={engine} />
      <HeroBreakdown report={report} engine={engine} meName={meName} themName={themName} />
      <TurnLog report={report} engine={engine} meName={meName} themName={themName} />
      {report.minEvidence < 300 && (
        <div style={{ fontSize: 9.5, color: MUTED, fontWeight: 700, lineHeight: 1.4, padding: "0 2px" }}>
          Thin evidence: the rarest pair in this draft has only {report.minEvidence} games behind it,
          so treat the smaller numbers above as a lean rather than a reading.
        </div>
      )}
    </>
  );
}
