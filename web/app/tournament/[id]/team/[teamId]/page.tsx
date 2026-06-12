"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/app/components/Navbar";
import { readCache, writeCache } from "@/lib/pageCache";

// Dota team-analytics page — mirrors the Valorant team detail page. Shows how a
// team is playing: record + form, per-player form & signature heroes, the team's
// most-drafted heroes, computed strengths/weaknesses, upcoming matches, and match
// history. Computes everything client-side from /api/tournaments/detail (which
// returns teams, matches-with-game1.playerStats, and standings).

const C = {
  bg: "#0c0c0e", text: "#f0f0e8", text2: "#b8b6ae", text3: "#8A8880",
  win: "#4ade80", winSoft: "rgba(74,222,128,0.12)", loss: "#ef4444", lossSoft: "rgba(239,68,68,0.12)",
  accent: "#A12B1F", gold: "#fbbf24", panel: "rgba(20,20,24,0.85)", border: "rgba(255,255,255,0.08)",
};
const norm = (s: string) => String(s || "").toLowerCase().replace(/\[.*?\]/g, "").replace(/[^a-z0-9]/g, "").trim();
const istTime = (z: string) => { try { return new Date(z).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }); } catch { return ""; } };

export default function DotaTeamPage() {
  const params = useParams() as { id: string; teamId: string };
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Shares the `tdetail:<id>:dota2` cache with the tournament page, so
    // navigating tournament <-> team renders instantly (stale-while-revalidate).
    const key = `tdetail:${params.id}:dota2`;
    const cached = readCache(key);
    if (cached) { setData(cached); setLoading(false); }
    fetch(`/api/tournaments/detail?id=${encodeURIComponent(params.id)}&game=dota2`)
      .then(r => r.json()).then(d => { writeCache(key, d); setData(d); }).catch(() => {}).finally(() => setLoading(false));
  }, [params.id, params.teamId]);

  const a = useMemo(() => data ? computeAnalytics(data, params.teamId) : null, [data, params.teamId]);

  if (loading) return <Shell><div style={{ padding: 60, textAlign: "center", color: C.text3 }}>Loading team…</div></Shell>;
  if (!a) return <Shell><div style={{ padding: 60, textAlign: "center", color: C.text3 }}>Team not found.</div></Shell>;

  return (
    <Shell>
      <Link href={`/tournament/${params.id}?tab=teams`} style={{ color: C.text3, fontSize: "0.8rem", textDecoration: "none" }}>← Back to {a.tournamentName}</Link>

      {/* HERO */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, margin: "16px 0 26px", flexWrap: "wrap" }}>
        <div style={{ width: 70, height: 70, borderRadius: 14, background: `linear-gradient(135deg, ${C.accent}, #7A1F15)`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: "1.6rem", color: "#fff", overflow: "hidden", flexShrink: 0 }}>
          {a.teamLogo ? <img src={a.teamLogo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : a.initials}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ margin: 0, fontSize: "1.9rem", fontWeight: 900, color: C.text }}>{a.teamName}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.95rem", fontWeight: 800, color: C.text2 }}>{a.wins}W – {a.losses}L</span>
            {a.rank > 0 && <span style={{ fontSize: "0.8rem", color: C.gold, fontWeight: 700 }}>#{a.rank} in standings · {a.points} pts</span>}
            <span style={{ display: "flex", gap: 4 }}>{a.form.map((r: string, i: number) => <Pill key={i} r={r} />)}</span>
          </div>
        </div>
      </div>

      {/* KEY STATS */}
      <Grid cols="repeat(auto-fit, minmax(140px, 1fr))">
        <Stat label="Matches" value={a.played} />
        <Stat label="Win rate" value={`${a.winRate}%`} accent={a.winRate >= 50 ? C.win : C.loss} />
        <Stat label="Avg kills / game" value={a.avgKills} />
        <Stat label="Avg duration" value={a.avgDur ? `${a.avgDur}m` : "—"} />
        <Stat label="Top performer" value={a.topPlayer?.name || "—"} sub={a.topPlayer ? `KDA ${a.topPlayer.kda}` : ""} accent={C.gold} />
      </Grid>

      {/* STRENGTHS / WEAKNESSES */}
      {a.insights.length > 0 && (
        <Section title="How they're playing">
          <Grid cols="repeat(auto-fit, minmax(260px, 1fr))">
            {a.insights.map((ins: any, i: number) => (
              <div key={i} style={{ background: C.panel, border: `1px solid ${ins.kind === "strength" ? C.win + "44" : ins.kind === "weakness" ? C.loss + "44" : C.border}`, borderRadius: 12, padding: "14px 16px", borderLeft: `3px solid ${ins.kind === "strength" ? C.win : ins.kind === "weakness" ? C.loss : C.text3}` }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: ins.kind === "strength" ? C.win : ins.kind === "weakness" ? C.loss : C.text3, marginBottom: 5 }}>{ins.kind}</div>
                <div style={{ fontSize: "0.9rem", fontWeight: 800, color: C.text, marginBottom: 3 }}>{ins.headline}</div>
                <div style={{ fontSize: "0.8rem", color: C.text2, lineHeight: 1.45 }}>{ins.detail}</div>
              </div>
            ))}
          </Grid>
        </Section>
      )}

      {/* ROSTER */}
      <Section title="Roster & form">
        <Grid cols="repeat(auto-fit, minmax(260px, 1fr))">
          {a.roster.map((p: any, i: number) => (
            <div key={i} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: `linear-gradient(135deg, ${C.accent}, #7A1F15)`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#fff", overflow: "hidden", flexShrink: 0 }}>
                  {p.avatar ? <img src={p.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (p.name[0] || "?").toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                  <div style={{ fontSize: "0.7rem", color: C.text3 }}>{p.games > 0 ? `${p.games} games` : "no match data"}</div>
                </div>
              </div>
              {p.games > 0 ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 10 }}>
                    <Mini label="KDA" value={p.kda} accent={C.gold} />
                    <Mini label="K/D/A" value={`${p.k}/${p.d}/${p.a}`} />
                    <Mini label="Avg GPM" value={p.gpm || "—"} />
                    <Mini label="Deaths" value={p.d} accent={p.d >= 9 ? C.loss : C.text} />
                  </div>
                  {p.heroes.length > 0 && (
                    <div style={{ fontSize: "0.72rem", color: C.text2, marginBottom: p.pool?.length ? 6 : 0 }}>
                      <span style={{ color: C.text3 }}>This tourney: </span>{p.heroes.map((h: any) => `${h.hero} (${h.n})`).join(", ")}
                    </div>
                  )}
                  {p.pool?.length > 0 && (
                    <div style={{ fontSize: "0.72rem", color: C.text2 }}>
                      <span style={{ color: C.text3 }}>Best in pubs: </span>{p.pool.slice(0, 4).map((h: any) => `${h.hero} ${h.winPct}%`).join(", ")}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: "0.75rem", color: C.text3 }}>
                  No recorded matches{p.pool?.length ? <> · <span style={{ color: C.text2 }}>pub best: {p.pool.slice(0, 3).map((h: any) => `${h.hero} ${h.winPct}%`).join(", ")}</span></> : ""}
                </div>
              )}
            </div>
          ))}
        </Grid>
      </Section>

      {/* TEAM HERO POOL */}
      {a.teamHeroes.length > 0 && (
        <Section title="Most-drafted heroes">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {a.teamHeroes.map((h: any, i: number) => (
              <div key={i} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 700, color: C.text, fontSize: "0.85rem" }}>{h.hero}</span>
                <span style={{ fontSize: "0.7rem", color: C.text3 }}>×{h.n}</span>
                {h.g > 0 && <span style={{ fontSize: "0.7rem", color: h.win / h.g >= 0.5 ? C.win : C.loss, fontWeight: 700 }}>{Math.round(100 * h.win / h.g)}%</span>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* DRAFT PLAN per upcoming opponent */}
      {a.draftPlans.length > 0 && (
        <Section title="Draft plan — upcoming matches">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {a.draftPlans.map((dp: any, i: number) => (
              <div key={i} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontWeight: 900, fontSize: "1.05rem", color: C.text }}>vs {dp.opp}</span>
                  <span style={{ fontSize: "0.74rem", color: C.text3 }}>{dp.label} · {dp.time ? `${dp.time} IST` : "TBD"}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
                  {/* BAN */}
                  <div>
                    <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.loss, marginBottom: 8 }}>🚫 Ban against them</div>
                    {[...dp.banByPlayer, ...dp.wonHeroes].slice(0, 6).map((b: any, j: number) => (
                      <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ fontWeight: 700, color: C.text, fontSize: "0.85rem" }}>{b.hero}</span>
                        {b.winPct != null && <span style={{ fontSize: "0.7rem", color: b.winPct >= 55 ? C.win : C.text3, fontWeight: 700 }}>{b.winPct}%</span>}
                        <span style={{ fontSize: "0.68rem", color: C.text3, marginLeft: "auto" }}>{b.player ? `${b.player}'s ${b.note}` : b.note}</span>
                      </div>
                    ))}
                  </div>
                  {/* PICK */}
                  <div>
                    <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.win, marginBottom: 8 }}>🎯 Your best picks</div>
                    {dp.myPicks.slice(0, 6).map((p: any, j: number) => (
                      <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ fontWeight: 700, color: C.text, fontSize: "0.85rem" }}>{p.hero}</span>
                        {p.winPct != null && <span style={{ fontSize: "0.7rem", color: p.winPct >= 55 ? C.win : C.text3, fontWeight: 700 }}>{p.winPct}%</span>}
                        <span style={{ fontSize: "0.68rem", color: C.text3, marginLeft: "auto" }}>{p.player}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {dp.note && <div style={{ marginTop: 12, fontSize: "0.82rem", color: C.gold, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, padding: "8px 12px" }}>💡 {dp.note}</div>}
              </div>
            ))}
          </div>
          <div style={{ fontSize: "0.68rem", color: C.text3, marginTop: 8 }}>% = win rate. Ban list = opponents' signature heroes (from their recent pub games + heroes they won on this tournament). Picks = your players' best heroes.</div>
        </Section>
      )}

      {/* MATCH HISTORY */}
      {a.history.length > 0 && (
        <Section title="Match history">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {a.history.map((h: any, i: number) => (
              <Link key={i} href={`/tournament/${params.id}/match/${h.id}`} style={{ textDecoration: "none" }}>
                <div style={{ background: C.panel, border: `1px solid ${h.win ? C.win + "33" : C.loss + "33"}`, borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, borderLeft: `3px solid ${h.win ? C.win : C.loss}` }}>
                  <span style={{ width: 22, fontWeight: 900, color: h.win ? C.win : C.loss }}>{h.win ? "W" : "L"}</span>
                  <span style={{ flex: 1, color: C.text, fontWeight: 700, fontSize: "0.88rem" }}>vs {h.opp}</span>
                  {h.hasStats && <span style={{ fontSize: "0.6rem", fontWeight: 800, color: C.gold, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 5, padding: "1px 6px" }}>📊 FULL STATS</span>}
                  <span style={{ color: C.text2, fontWeight: 800 }}>{h.score}</span>
                  <span style={{ color: C.text3, fontSize: "0.72rem", minWidth: 40, textAlign: "right" }}>{h.dur ? `${h.dur}m` : ""}</span>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}
      <div style={{ height: 50 }} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (<div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter',system-ui,sans-serif" }}><Navbar /><div style={{ maxWidth: 1080, margin: "0 auto", padding: "20px 18px" }}>{children}</div></div>);
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (<div style={{ marginTop: 32 }}><h2 style={{ fontSize: "1.25rem", fontWeight: 900, margin: "0 0 16px", color: C.text }}>{title}</h2>{children}</div>);
}
function Grid({ cols, children }: { cols: string; children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: cols, gap: 12 }}>{children}</div>;
}
function Stat({ label, value, sub, accent = C.text }: { label: string; value: any; sub?: string; accent?: string }) {
  return (<div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px" }}>
    <div style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: C.text3, marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: "1.5rem", fontWeight: 900, color: accent, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    {sub && <div style={{ fontSize: "0.74rem", color: C.text2, marginTop: 4 }}>{sub}</div>}
  </div>);
}
function Mini({ label, value, accent = C.text }: { label: string; value: any; accent?: string }) {
  return (<div style={{ textAlign: "center" }}><div style={{ fontSize: "0.95rem", fontWeight: 800, color: accent }}>{value}</div><div style={{ fontSize: "0.55rem", color: C.text3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div></div>);
}
function Pill({ r }: { r: string }) {
  const win = r === "W";
  return <span style={{ width: 18, height: 18, borderRadius: 4, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.62rem", fontWeight: 900, background: win ? C.winSoft : C.lossSoft, color: win ? C.win : C.loss }}>{r}</span>;
}

// ── analytics computation ─────────────────────────────────────────────────────
const nameMatch = (rn: string, key: string) => {
  if (rn === key) return true;
  if (rn.length < 3 || key.length < 3) return false;
  return rn.includes(key) || key.includes(rn);
};

function computeAnalytics(data: any, teamId: string) {
  const teams: any[] = data.teams || [];
  const team = teams.find(t => t.id === teamId);
  if (!team) return null;
  const matches: any[] = data.matches || [];
  const standings: any[] = data.standings || [];

  // Full profile for ANY team — used for self + every opponent so we can derive
  // ban targets (their signature heroes) and pick suggestions (your best heroes).
  type Row = { name: string; hero: string; k: number; d: number; a: number; gpm: number; win: boolean };
  function profileOf(tid: string) {
    const t = teams.find(x => x.id === tid);
    if (!t) return null;
    const mine = matches.filter(m => m.team1Id === tid || m.team2Id === tid);
    const completed = mine.filter(m => m.status === "completed").sort((a, b) => String(a.completedAt).localeCompare(String(b.completedAt)));
    const won = (m: any) => m.winner === "team1" ? m.team1Id === tid : m.winner === "team2" ? m.team2Id === tid : (m.team1Id === tid ? (m.team1Score ?? 0) > (m.team2Score ?? 0) : (m.team2Score ?? 0) > (m.team1Score ?? 0));
    const side = (m: any) => m.game1?.radiantTeamId === tid ? "radiant" : m.game1?.direTeamId === tid ? "dire" : null;
    const rows: Row[] = [];
    let durSum = 0, durN = 0;
    for (const m of completed) {
      const w = won(m); const s = side(m);
      if (m.game1?.durationSeconds) { durSum += m.game1.durationSeconds; durN++; }
      (m.game1?.playerStats || []).filter((p: any) => s && p.side === s).forEach((p: any) => rows.push({ name: p.name, hero: p.hero, k: p.kills || 0, d: p.deaths || 0, a: p.assists || 0, gpm: p.gpm || 0, win: w }));
    }
    const wins = completed.filter(won).length, losses = completed.length - wins;
    const avgDur = durN ? Math.round(durSum / durN / 60) : 0;
    // per-player aggregate + their stored pub hero pool
    const roster: any[] = (t.members || []).map((mem: any) => {
      const key = norm(mem.steamName || mem.name || mem.fullName);
      const mr = rows.filter(r => nameMatch(norm(r.name), key));
      const g = mr.length;
      const sum = (f: keyof Row) => mr.reduce((s, r) => s + (Number(r[f]) || 0), 0);
      const heroCount: Record<string, number> = {};
      mr.forEach(r => { if (r.hero && r.hero !== "?") heroCount[r.hero] = (heroCount[r.hero] || 0) + 1; });
      const tourneyHeroes = Object.entries(heroCount).sort((a, b) => b[1] - a[1]).map(([hero, n]) => ({ hero, n }));
      const withGpm = mr.filter(r => r.gpm > 0);
      const pool: any[] = mem.dotaHeroPool || [];
      // best signature hero: prefer a high-games pub main; fall back to tournament hero
      const sig = pool.length ? [...pool].sort((a, b) => b.games - a.games)[0] : null;
      return {
        name: mem.steamName || mem.fullName || "?", avatar: mem.steamAvatar, games: g,
        k: g ? +(sum("k") / g).toFixed(1) : 0, d: g ? +(sum("d") / g).toFixed(1) : 0, a: g ? +(sum("a") / g).toFixed(1) : 0,
        gpm: withGpm.length ? Math.round(withGpm.reduce((s, r) => s + r.gpm, 0) / withGpm.length) : 0,
        kda: +((sum("k") + sum("a")) / Math.max(1, sum("d"))).toFixed(2),
        tourneyHeroes, pool, sig,
      };
    });
    // team most-drafted (tournament) heroes with win%
    const heroAgg: Record<string, { n: number; win: number }> = {};
    rows.forEach(r => { if (r.hero && r.hero !== "?") { const h = heroAgg[r.hero] || (heroAgg[r.hero] = { n: 0, win: 0 }); h.n++; if (r.win) h.win++; } });
    const teamHeroes = Object.entries(heroAgg).sort((a, b) => b[1].n - a[1].n).map(([hero, v]) => ({ hero, n: v.n, winPct: Math.round(100 * v.win / v.n) }));
    const ranked = roster.filter(p => p.games > 0).sort((a, b) => b.kda - a.kda);
    return { name: t.teamName || t.name, completed, won, side, rows, roster, teamHeroes, wins, losses, avgDur, ranked, weakLink: ranked.filter(p => p.d >= 9).sort((a, b) => b.d - a.d)[0] || null };
  }

  const self = profileOf(teamId)!;
  const { roster, teamHeroes, completed, won, side, wins, losses, avgDur } = self;
  const form = completed.slice(-5).map((m: any) => won(m) ? "W" : "L");
  const killsTot = self.rows.reduce((s, r) => s + r.k, 0);
  const gamesWithStats = new Set(completed.filter((m: any) => (m.game1?.playerStats || []).length).map((m: any) => m.id)).size;
  const avgKills = gamesWithStats ? Math.round(killsTot / gamesWithStats) : 0;
  const topPlayer = self.ranked[0] || null;

  // insights
  const insights: any[] = [];
  const winRate = completed.length ? Math.round(100 * wins / completed.length) : 0;
  if (completed.length >= 2) insights.push(winRate >= 60 ? { kind: "strength", headline: `Winning ${winRate}% of matches`, detail: `${wins}W–${losses}L — one of the form teams.` } : winRate <= 40 ? { kind: "weakness", headline: `Struggling at ${winRate}% win rate`, detail: `${wins}W–${losses}L — needs to fix draft/execution.` } : { kind: "neutral", headline: `Even record (${wins}W–${losses}L)`, detail: `Small margins decide their games.` });
  if (topPlayer) insights.push({ kind: "strength", headline: `${topPlayer.name} is carrying`, detail: `Team-best ${topPlayer.kda} KDA${topPlayer.tourneyHeroes[0] ? ` — leans on ${topPlayer.tourneyHeroes[0].hero}` : ""}. Build around him.` });
  if (self.weakLink && (!topPlayer || self.weakLink.name !== topPlayer.name)) insights.push({ kind: "weakness", headline: `${self.weakLink.name} dies too much`, detail: `Averaging ${self.weakLink.d} deaths/game — feeding tempo. Tighter positioning + a defensive item would help.` });
  if (avgDur) insights.push({ kind: "neutral", headline: avgDur <= 38 ? "Fast-tempo team" : "Late-game team", detail: avgDur <= 38 ? `Avg game ${avgDur} min — they end early; punish a slow start.` : `Avg game ${avgDur} min — they grind to the late game.` });

  // upcoming + per-opponent DRAFT PLAN
  const mineAll = matches.filter(m => m.team1Id === teamId || m.team2Id === teamId);
  const draftPlans = mineAll.filter(m => m.status !== "completed" && m.scheduledTime && m.team1Name !== "TBD" && m.team2Name !== "TBD")
    .sort((a, b) => String(a.scheduledTime).localeCompare(String(b.scheduledTime)))
    .map(m => {
      const oppId = m.team1Id === teamId ? m.team2Id : m.team1Id;
      const opp = profileOf(oppId);
      const oppName = m.team1Id === teamId ? m.team2Name : m.team1Name;
      // BAN targets: each opponent player's signature pub hero (sorted by winPct), plus heroes they won on in the tournament
      const banByPlayer = (opp?.roster || []).filter((p: any) => p.sig).map((p: any) => ({ player: p.name, hero: p.sig.hero, winPct: p.sig.winPct, games: p.sig.games, note: "pub main" }))
        .sort((a: any, b: any) => b.winPct - a.winPct);
      const wonHeroes = (opp?.teamHeroes || []).filter((h: any) => h.winPct >= 60 && h.n >= 1).slice(0, 3).map((h: any) => ({ hero: h.hero, winPct: h.winPct, note: `won ${h.n}× this tourney` }));
      // PICK suggestions: your players' signature pub heroes
      const myPicks = roster.filter((p: any) => p.sig).map((p: any) => ({ player: p.name, hero: p.sig.hero, winPct: p.sig.winPct, games: p.sig.games }));
      // note from opponent profile
      let note = "";
      if (opp?.weakLink) note = `${opp.weakLink.name} is their weak link (${opp.weakLink.d} deaths/game) — hunt that lane.`;
      else if (opp && opp.avgDur && opp.avgDur <= 38) note = "They run fast tempo — survive the early game and out-scale them.";
      else if (opp) note = `${opp.wins}W–${opp.losses}L — play disciplined and contest the map.`;
      return { opp: oppName, time: m.scheduledTime ? istTime(m.scheduledTime) : "", label: m.bracketLabel || "Match", banByPlayer, wonHeroes, myPicks, note };
    });

  // history (most recent first) — flag matches with full per-player stats
  const history = completed.slice().reverse().map((m: any) => ({
    id: m.id, opp: m.team1Id === teamId ? m.team2Name : m.team1Name, win: won(m),
    score: m.game1?.radiantScore != null && m.game1?.direScore != null ? (side(m) === "radiant" ? `${m.game1.radiantScore}-${m.game1.direScore}` : `${m.game1.direScore}-${m.game1.radiantScore}`) : `${m.team1Id === teamId ? m.team1Score : m.team2Score}-${m.team1Id === teamId ? m.team2Score : m.team1Score}`,
    dur: m.game1?.durationSeconds ? Math.round(m.game1.durationSeconds / 60) : 0,
    hasStats: (m.game1?.playerStats || []).length > 0,
  }));

  const rankRow = standings.find((s: any) => s.teamId === teamId || s.id === teamId);
  const rank = rankRow ? (standings.slice().sort((a: any, b: any) => (b.points || 0) - (a.points || 0)).findIndex((s: any) => (s.teamId || s.id) === teamId) + 1) : 0;

  return {
    teamName: team.teamName || team.name, teamLogo: team.teamLogo, initials: (team.teamName || "?").split(/\s+/).map((w: string) => w[0]).join("").slice(0, 3).toUpperCase(),
    tournamentName: data.tournament?.name || "tournament",
    wins, losses, played: completed.length, winRate, form, avgKills, avgDur, topPlayer,
    rank, points: rankRow?.points || 0,
    roster: roster.map((p: any) => ({ ...p, heroes: p.tourneyHeroes.slice(0, 3) })),
    teamHeroes: teamHeroes.slice(0, 12).map((h: any) => ({ hero: h.hero, n: h.n, g: h.n, win: Math.round(h.winPct * h.n / 100) })),
    insights, draftPlans, history,
  };
}
