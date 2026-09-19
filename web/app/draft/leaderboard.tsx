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
 * one board and one number: what you won this week. It resets Monday IST, so
 * first place is winnable by whoever plays tonight rather than settled by
 * whoever showed up first and never lost since — an all-time board is
 * decided within a fortnight, and after that it tells everyone outside the
 * top ten that nothing they do this evening matters.
 *
 * Elo still moves in the background on every ranked live result — it is what
 * the medal badge next to a name is drawn from — but it is flavour here, not
 * the sort key.
 */

export type WeeklyRow = {
  uid: string; name: string; avatar: string | null;
  coins: number; games: number; wins: number;
  medal: string; medalFill: string;
  rank?: number | null;
};

const hhmm = (ms: number) => {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

/**
 * Just your own coin total for the week, for the header chip.
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
        const mine = (d.rows ?? []).find((r: WeeklyRow) => r.uid === uid) ?? d.you ?? null;
        setCoins(mine?.coins ?? 0);
      })
      .catch(() => {});
    return () => { dead = true; };
  }, [uid, refreshKey]);

  return uid ? coins : null;
}

export function Leaderboard({ uid, refreshKey }: { uid: string | null; refreshKey?: number }) {
  const [rows, setRows] = useState<WeeklyRow[] | null>(null);
  const [you, setYou] = useState<(WeeklyRow & { rank: number | null }) | null>(null);
  const [resetsInMs, setResetsInMs] = useState(0);

  const load = useCallback(() => {
    fetch(`/api/draftlab/leaderboard?limit=25${uid ? `&uid=${encodeURIComponent(uid)}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setRows(d.rows ?? []); setYou(d.you ?? null); setResetsInMs(d.resetsInMs ?? 0); })
      .catch(() => setRows([]));
  }, [uid]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div style={{ paddingBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <span className="dl-stk" style={{ background: GOLD_FILL, fontSize: 9.5 }}>THIS WEEK</span>
        <span style={{ flex: "1 1 auto" }} />
        <span style={{ fontSize: 9, color: DIM, fontWeight: 900, letterSpacing: .6 }}>RESETS IN {hhmm(resetsInMs)}</span>
      </div>

      {rows == null && <Skeleton h={130} />}

      {rows != null && rows.length === 0 && (
        <Panel style={{ padding: "20px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>🪙</div>
          <div style={{ fontSize: 15, color: CREAM, fontWeight: 900, marginBottom: 6, letterSpacing: "-.02em" }}>Nobody has coins yet this week.</div>
          <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 600, lineHeight: 1.5, maxWidth: 300, margin: "0 auto 14px" }}>
            Win a draft — solo or against a real person — and your points land here as coins. First place is up for
            grabs until Monday.
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
 * The medal is Dota's own name for a rating band — Herald through Immortal —
 * because a number between 900 and 1800 means nothing to a player and
 * "Divine" means everything. It is drawn from all-time Elo (ranked live
 * results only), sitting next to a coin total that is entirely about this
 * week and both game modes; a player can be freshly Archon and still be
 * leading the board on a good week.
 */
function Row({ r, rank, me }: { r: WeeklyRow; rank: number | null; me?: boolean }) {
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
          <span style={{
            fontSize: 7.5, fontWeight: 900, letterSpacing: .5, padding: "1px 6px", borderRadius: 999,
            background: r.medalFill, color: ON_FILL, border: `1.5px solid ${LINE}`, flexShrink: 0,
          }}>{r.medal.toUpperCase()}</span>
          <span style={{ fontSize: 9.5, color: me ? ON_FILL : DIM, opacity: me ? .7 : 1, fontWeight: 700, letterSpacing: .3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.games} {r.games === 1 ? "game" : "games"} this week · {r.wins}W
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
