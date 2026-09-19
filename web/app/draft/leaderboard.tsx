"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Panel, Btn, DiscordIcon, signInWithDiscord,
  CREAM, PANEL, PANEL_2, LINE, MUTED, DIM, GREEN, ENEMY,
  LEMON, GOLD_FILL, ON_FILL, R_CHIP,
} from "./ui";
import { Skeleton } from "./theme";

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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <span className="dl-stk" style={{ background: GOLD_FILL, fontSize: 9.5 }}>LEADERBOARD</span>
        <span style={{ flex: "1 1 auto" }} />
        <span style={{ fontSize: 9, color: DIM, fontWeight: 900, letterSpacing: .6 }}>AVG PER GAME · {minGames}+ GAMES</span>
      </div>

      {rows == null && <Skeleton h={130} />}

      {rows != null && rows.length === 0 && (
        <Panel style={{ padding: "20px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>👑</div>
          <div style={{ fontSize: 15, color: CREAM, fontWeight: 900, marginBottom: 6, letterSpacing: "-.02em" }}>First place is empty.</div>
          <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 600, lineHeight: 1.5, maxWidth: 300, margin: "0 auto 14px" }}>
            Play {minGames} drafts signed in and it is yours. Your score is the model&apos;s verdict on your five heroes
            plus what you scored on the questions.
          </div>
          <div style={{ display: "inline-block", minWidth: 170 }}>
            <Btn full tone="lilac" onClick={signInWithDiscord}>
              <DiscordIcon /> SIGN IN TO COMPETE
            </Btn>
          </div>
        </Panel>
      )}

      {rows != null && rows.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {rows.map((r, i) => <Row key={r.uid} r={r} rank={i + 1} me={r.uid === uid} />)}
        </div>
      )}

      {/* Your own row, pinned, even when it is nowhere near the top. */}
      {you && !rows?.some((r) => r.uid === you.uid) && (
        <>
          <div style={{ height: 8 }} />
          <Row r={you} rank={you.rank ?? null} me />
          {!you.ranked && (
            <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, marginTop: 7, paddingLeft: 2 }}>
              {minGames - you.games} more {minGames - you.games === 1 ? "game" : "games"} to be ranked.
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * One place on the board.
 *
 * The medal is the rank badge's fill — gold, silver, bronze — and your own row
 * is a filled lemon card rather than a tinted one, so finding yourself in a list
 * of twenty-five is a glance rather than a read. Everything on a filled row has
 * to use `--on-fill`, which is why the numbers here do not follow `--text`.
 */
function Row({ r, rank, me }: { r: LeaderRow; rank: number | null; me?: boolean }) {
  const medal = rank === 1 ? GOLD_FILL : rank === 2 ? "#DCE1E8" : rank === 3 ? "#E6B389" : null;
  const fg = me ? ON_FILL : CREAM;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 9, padding: "7px 10px 7px 7px", borderRadius: R_CHIP,
      background: me ? LEMON : PANEL, border: `2px solid ${LINE}`, boxShadow: `3px 3px 0 ${LINE}`,
      boxSizing: "border-box",
    }}>
      <span style={{
        width: 24, height: 24, borderRadius: 8, flexShrink: 0, display: "grid", placeItems: "center",
        background: medal ?? PANEL_2, color: ON_FILL, fontSize: 10.5, fontWeight: 900,
        border: `2px solid ${LINE}`, boxSizing: "border-box",
      }}>{rank ?? "—"}</span>

      {r.avatar
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={r.avatar} alt="" style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, objectFit: "cover", border: `2px solid ${LINE}`, boxSizing: "border-box" }} />
        : <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, background: PANEL_2, display: "grid", placeItems: "center", color: DIM, fontSize: 11, fontWeight: 900, border: `2px solid ${LINE}`, boxSizing: "border-box" }}>{r.name.slice(0, 1).toUpperCase()}</span>}

      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 900, color: fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.name}{me && <span style={{ fontSize: 9, marginLeft: 6, letterSpacing: .8, opacity: .65 }}>YOU</span>}
        </div>
        <div style={{ fontSize: 9.5, color: me ? ON_FILL : DIM, opacity: me ? .7 : 1, fontWeight: 700, letterSpacing: .3 }}>
          {r.games} games · {r.wins}W · quiz {r.quiz}
        </div>
      </div>

      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{
          fontSize: 15, fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1, letterSpacing: "-.02em",
          color: me ? ON_FILL : r.avg >= 60 ? GREEN : r.avg >= 45 ? CREAM : ENEMY,
        }}>
          {r.avg.toFixed(1)}
        </div>
        <div style={{ fontSize: 8.5, color: me ? ON_FILL : DIM, opacity: me ? .7 : 1, letterSpacing: .5, fontWeight: 900 }}>BEST {r.best}</div>
      </div>
    </div>
  );
}
