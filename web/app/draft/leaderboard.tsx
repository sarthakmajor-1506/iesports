"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Panel, Btn, DiscordIcon, signInWithDiscord,
  CREAM, PANEL, PANEL_2, LINE, MUTED, DIM, GREEN,
  LEMON, GOLD_FILL, ON_FILL, R_CHIP,
} from "./ui";
import { Skeleton } from "./theme";

/**
 * The one board.
 *
 * This used to be two: a ranked ladder (Elo, all-time plus its own daily
 * variant) and a separate "Solo Scores" average-points board — three numbers
 * for one game, and the reason a player's name could be right on one and
 * wrong on another (two write paths, two trusted strings; see
 * lib/draftIdentity.ts for the actual fix). Coins fold both game modes into
 * one board and one number: what you won this month. It resets on the 1st
 * IST, so first place is winnable by whoever plays tonight rather than settled
 * by whoever showed up first and never lost since — an all-time board is
 * decided within a fortnight, and after that it tells everyone outside the
 * top ten that nothing they do this evening matters.
 *
 * IT USED TO RESET WEEKLY, and a Monday roll was too blunt for a board this
 * size: one good evening was the whole board, and the Monday after it every
 * player opened the app to a zero and no record that the evening happened.
 *
 * Elo still moves in the background on every ranked live result and still
 * decides matchmaking, but it is not shown here and this board does not sort
 * by it.
 */

export type MonthlyRow = {
  uid: string; name: string; avatar: string | null;
  coins: number; games: number; wins: number;
  rank?: number | null;
};

/**
 * How long is left in the period.
 *
 * Days first: this counted only hours and minutes, which was fine for a week
 * but reads as "RESETS IN 719h" for a month. The largest two units are always
 * enough — nobody needs the minutes when the answer is three weeks.
 */
const countdown = (ms: number) => {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

/**
 * Just your own coin total for the month, for the header chip.
 *
 * Reads the same endpoint the board does. A signed-out player has no row and
 * no total, and gets null rather than a zero — there is a difference between
 * "you have won nothing yet" and "there is nobody to have won anything", and
 * the chip renders nothing for the second.
 *
 * The caller's own row comes back inside `rows` when they are in the top 25
 * and in `you` when they are not, so both are checked; a signed-in player who
 * has never scored is in neither, which is a real zero.
 */
export function useMyCoins(uid: string | null, refreshKey?: number): number | null {
  const [coins, setCoins] = useState<number | null>(null);

  useEffect(() => {
    if (!uid) return;
    let dead = false;
    fetch(`/api/draftlab/leaderboard?limit=25&uid=${encodeURIComponent(uid)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (dead) return;
        const mine = (d.rows ?? []).find((r: MonthlyRow) => r.uid === uid) ?? d.you ?? null;
        setCoins(mine?.coins ?? 0);
      })
      .catch(() => {});
    return () => { dead = true; };
  }, [uid, refreshKey]);

  return uid ? coins : null;
}

export function Leaderboard({ uid, refreshKey }: { uid: string | null; refreshKey?: number }) {
  const [rows, setRows] = useState<MonthlyRow[] | null>(null);
  const [you, setYou] = useState<(MonthlyRow & { rank: number | null }) | null>(null);
  const [resetsInMs, setResetsInMs] = useState(0);
  // The board names its own period ("SEPTEMBER"), server-side, so the heading
  // can never disagree with the bucket the rows were actually read from.
  const [label, setLabel] = useState("THIS MONTH");

  const load = useCallback(() => {
    fetch(`/api/draftlab/leaderboard?limit=25${uid ? `&uid=${encodeURIComponent(uid)}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows ?? []); setYou(d.you ?? null);
        setResetsInMs(d.resetsInMs ?? 0);
        if (typeof d.label === "string" && d.label) setLabel(d.label);
      })
      .catch(() => setRows([]));
  }, [uid]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div style={{ paddingBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <span className="dl-stk" style={{ background: GOLD_FILL, fontSize: 9.5 }}>{label}</span>
        <span style={{ flex: "1 1 auto" }} />
        <span style={{ fontSize: 9, color: DIM, fontWeight: 900, letterSpacing: .6 }}>RESETS IN {countdown(resetsInMs)}</span>
      </div>

      {rows == null && <Skeleton h={130} />}

      {rows != null && rows.length === 0 && (
        <Panel style={{ padding: "20px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>🪙</div>
          <div style={{ fontSize: 15, color: CREAM, fontWeight: 900, marginBottom: 6, letterSpacing: "-.02em" }}>Nobody has coins yet this month.</div>
          <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 600, lineHeight: 1.5, maxWidth: 300, margin: "0 auto 14px" }}>
            Win a draft — solo or against a real person — and your points land here as coins. First place is up for
            grabs until the 1st.
          </div>
          {!uid && (
            <div style={{ display: "inline-block", minWidth: 170 }}>
              <Btn full tone="lilac" onClick={signInWithDiscord}><DiscordIcon /> SIGN IN TO COMPETE</Btn>
            </div>
          )}
        </Panel>
      )}

      {rows != null && rows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6 }}>
          {rows.map((r, i) => <Row key={r.uid} r={r} rank={i + 1} me={r.uid === uid} />)}
        </div>
      )}

      {/* Your own row, pinned, even when it is nowhere near the top. */}
      {you && !rows?.some((r) => r.uid === you.uid) && (
        <>
          <div style={{ height: 8 }} />
          <Row r={you} rank={you.rank ?? null} me />
        </>
      )}
    </div>
  );
}

/**
 * One place on the board.
 *
 * NO RANK BADGE. Each row used to carry a Dota medal name — Herald through
 * Immortal — drawn from all-time ranked Elo. It sat beside a coin total that
 * is about this month and both game modes, so the two disagreed by design: a
 * player could be freshly Archon and leading the board, which reads as one of
 * the two numbers being wrong. The board is coins, and only coins.
 */
function Row({ r, rank, me }: { r: MonthlyRow; rank: number | null; me?: boolean }) {
  const badge = rank === 1 ? GOLD_FILL : rank === 2 ? "#DCE1E8" : rank === 3 ? "#E6B389" : null;
  const fg = me ? ON_FILL : CREAM;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 9, padding: "7px 10px 7px 7px", borderRadius: R_CHIP,
      background: me ? LEMON : PANEL, border: `2px solid ${LINE}`, boxShadow: `3px 3px 0 ${LINE}`,
      boxSizing: "border-box",
    }}>
      <span style={{
        width: 24, height: 24, borderRadius: 8, flexShrink: 0, display: "grid", placeItems: "center",
        background: badge ?? PANEL_2, color: ON_FILL, fontSize: 10.5, fontWeight: 900,
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
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
          <span style={{ fontSize: 9.5, color: me ? ON_FILL : DIM, opacity: me ? .7 : 1, fontWeight: 700, letterSpacing: .3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.games} {r.games === 1 ? "game" : "games"} this month · {r.wins}W
          </span>
        </div>
      </div>

      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{
          fontSize: 15, fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1, letterSpacing: "-.02em",
          color: me ? ON_FILL : GREEN,
        }}>
          🪙 {r.coins}
        </div>
        <div style={{ fontSize: 8.5, color: me ? ON_FILL : DIM, opacity: me ? .7 : 1, letterSpacing: .5, fontWeight: 900 }}>
          COINS
        </div>
      </div>
    </div>
  );
}
