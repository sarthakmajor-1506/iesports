"use client";

import { useCallback, useEffect, useState } from "react";
import { Label, Panel, RED, CREAM, PANEL, PANEL_2, LINE, MUTED, DIM, GREEN, GOLD } from "./ui";

export type LeaderRow = {
  uid: string; name: string; avatar: string | null;
  games: number; points: number; avg: number; best: number; wins: number; quiz: number;
  ranked: boolean; rank?: number | null;
};

/**
 * Who is actually good at this.
 *
 * Ranked on average points per game rather than the total, so the board rewards
 * drafting well rather than drafting often — a total would put whoever played
 * most on top and tell nobody anything. Three games is the floor for a place on
 * it; below that a single lucky draft would sit at number one.
 */
export function Leaderboard({ uid, refreshKey }: { uid: string | null; refreshKey?: number }) {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [you, setYou] = useState<(LeaderRow & { rank?: number | null }) | null>(null);
  const [minGames, setMinGames] = useState(3);

  const load = useCallback(() => {
    fetch(`/api/draftlab/leaderboard?limit=25${uid ? `&uid=${encodeURIComponent(uid)}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setRows(d.rows ?? []); setYou(d.you ?? null); setMinGames(d.minGames ?? 3); })
      .catch(() => setRows([]));
  }, [uid]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div style={{ paddingBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 7 }}>
        <Label color={GOLD} style={{ marginBottom: 0 }}>LEADERBOARD</Label>
        <span style={{ flex: "1 1 auto" }} />
        <span style={{ fontSize: 9.5, color: DIM, letterSpacing: .4 }}>AVG PER GAME · {minGames}+ GAMES</span>
      </div>

      {rows == null && <div className="dl-sheen" style={{ height: 120, borderRadius: 12, background: PANEL }} />}

      {rows != null && rows.length === 0 && (
        <Panel style={{ padding: "14px 13px" }}>
          <div style={{ fontSize: 13, color: CREAM, fontWeight: 700, marginBottom: 3 }}>Nobody is on the board yet.</div>
          <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.45 }}>
            Sign in and play {minGames} drafts to claim first place. Your score is the model&apos;s verdict on your five
            heroes plus what you scored on the questions.
          </div>
        </Panel>
      )}

      {rows != null && rows.length > 0 && (
        <div style={{ display: "grid", gap: 3 }}>
          {rows.map((r, i) => <Row key={r.uid} r={r} rank={i + 1} me={r.uid === uid} />)}
        </div>
      )}

      {/* Your own row, pinned, even when it is nowhere near the top. */}
      {you && !rows?.some((r) => r.uid === you.uid) && (
        <>
          <div style={{ height: 8 }} />
          <Row r={you} rank={you.rank ?? null} me />
          {!you.ranked && (
            <div style={{ fontSize: 11, color: MUTED, marginTop: 6, paddingLeft: 2 }}>
              {minGames - you.games} more {minGames - you.games === 1 ? "game" : "games"} to be ranked.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Row({ r, rank, me }: { r: LeaderRow; rank: number | null; me?: boolean }) {
  const medal = rank === 1 ? GOLD : rank === 2 ? "#c9cdd6" : rank === 3 ? "#c58a4d" : null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 9, padding: "6px 9px 6px 6px", borderRadius: 10,
      background: me ? `${GOLD}14` : PANEL, border: `1px solid ${me ? GOLD + "55" : LINE}`,
    }}>
      <span style={{
        width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: "grid", placeItems: "center",
        background: medal ?? PANEL_2, color: medal ? "#140f06" : MUTED, fontSize: 10.5, fontWeight: 900,
      }}>{rank ?? "—"}</span>

      {r.avatar
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={r.avatar} alt="" style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, objectFit: "cover" }} />
        : <span style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, background: PANEL_2, display: "grid", placeItems: "center", color: DIM, fontSize: 11, fontWeight: 900 }}>{r.name.slice(0, 1).toUpperCase()}</span>}

      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: CREAM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.name}{me && <span style={{ color: GOLD, fontSize: 9.5, marginLeft: 5, letterSpacing: .6 }}>YOU</span>}
        </div>
        <div style={{ fontSize: 9.5, color: DIM, letterSpacing: .3 }}>
          {r.games} games · {r.wins}W · quiz {r.quiz}
        </div>
      </div>

      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: r.avg >= 60 ? GREEN : r.avg >= 45 ? CREAM : RED, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
          {r.avg.toFixed(1)}
        </div>
        <div style={{ fontSize: 8.5, color: DIM, letterSpacing: .5, fontWeight: 800 }}>BEST {r.best}</div>
      </div>
    </div>
  );
}
