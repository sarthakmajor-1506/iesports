"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Btn, DiscordIcon, signInWithDiscord, Segment,
  CREAM, PANEL, PANEL_2, LINE, MUTED, DIM, GREEN, ENEMY,
  LEMON, MINT, GOLD_FILL, ON_FILL, R_CHIP,
} from "./ui";
import { Skeleton } from "./theme";

/**
 * The head-to-head board.
 *
 * Two tabs, and the order matters: TODAY is first and is the default. An
 * all-time board is decided inside a fortnight, and from then on it tells
 * everyone outside the top ten that tonight cannot change anything — the number
 * they are chasing was set by whoever showed up first. A board that empties at
 * midnight is winnable by whoever opens the app this evening, which is the
 * reason to open it.
 *
 * Ranking today on rating GAINED rather than rating held is the same argument
 * one level down: sorting the daily board by Elo would just reprint the all-time
 * board with fewer rows.
 */

type LadderRow = {
  uid: string; name: string; avatar: string | null;
  elo: number; peak: number; games: number; wins: number; losses: number; draws: number;
  streak: number; you: boolean; medal: string; medalFill: string;
  rank?: number | null; ranked?: boolean;
};
type DailyRow = { uid: string; name: string; avatar: string | null; delta: number; games: number; wins: number; you: boolean };

const hhmm = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

export function Ladder({ uid, refreshKey }: { uid: string | null; refreshKey?: number }) {
  const [scope, setScope] = useState<"today" | "all">("today");
  const [rows, setRows] = useState<(LadderRow | DailyRow)[] | null>(null);
  const [you, setYou] = useState<(LadderRow & DailyRow) | null>(null);
  const [resetsInMs, setResetsInMs] = useState(0);
  const [minGames, setMinGames] = useState(3);

  const load = useCallback(() => {
    setRows(null);
    fetch(`/api/draftlab/ladder?scope=${scope}&limit=25${uid ? `&uid=${encodeURIComponent(uid)}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows ?? []);
        setYou(d.you ?? null);
        setResetsInMs(d.resetsInMs ?? 0);
        if (d.minGames) setMinGames(d.minGames);
      })
      .catch(() => setRows([]));
  }, [scope, uid]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div style={{ paddingBottom: 18 }}>
      {/* No "LADDER" sticker here: the control that switched to this board is
          directly above and already says so. */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <Segment dense value={scope} onChange={setScope}
            options={[{ v: "today", label: "TODAY", accent: LEMON }, { v: "all", label: "ALL TIME", accent: MINT }]} />
        </div>
        <span style={{ fontSize: 9, color: DIM, fontWeight: 900, letterSpacing: .6, flexShrink: 0 }}>
          {scope === "today" ? `RESETS IN ${hhmm(resetsInMs)}` : `${minGames}+ GAMES`}
        </span>
      </div>

      {rows == null && <Skeleton h={130} />}

      {rows != null && rows.length === 0 && (
        <div className="dl-card" style={{ padding: "18px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 15, color: CREAM, fontWeight: 900, marginBottom: 6, letterSpacing: "-.02em" }}>
            {scope === "today" ? "Nobody has played today." : "The ladder is empty."}
          </div>
          <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 600, lineHeight: 1.5, maxWidth: 300, margin: "0 auto 14px" }}>
            {uid
              ? "Queue for a ladder game and the first result of the day is yours."
              : "The ladder is head to head against a real person, so it needs an account to pay the result to."}
          </div>
          {!uid && (
            <div style={{ display: "inline-block", minWidth: 170 }}>
              <Btn full tone="lilac" onClick={signInWithDiscord}><DiscordIcon /> SIGN IN</Btn>
            </div>
          )}
        </div>
      )}

      {rows != null && rows.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {rows.map((r, i) => <Row key={r.uid} r={r} rank={i + 1} scope={scope} />)}
        </div>
      )}

      {/* Your own row, pinned, however far down it is. */}
      {you && !rows?.some((r) => r.uid === you.uid) && (
        <>
          <div style={{ height: 8 }} />
          <Row r={you} rank={you.rank ?? null} scope={scope} />
          {scope === "all" && you.ranked === false && (
            <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, marginTop: 7, paddingLeft: 2 }}>
              {Math.max(0, minGames - (you.games ?? 0))} more ladder {minGames - (you.games ?? 0) === 1 ? "game" : "games"} to be ranked.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Row({ r, rank, scope }: { r: LadderRow | DailyRow; rank: number | null; scope: "today" | "all" }) {
  const me = r.you;
  const daily = scope === "today";
  const d = r as DailyRow;
  const l = r as LadderRow;
  const medalFill = !daily && l.medalFill ? l.medalFill : null;
  const badge = rank === 1 ? GOLD_FILL : rank === 2 ? "#DCE1E8" : rank === 3 ? "#E6B389" : null;

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
        <div style={{ fontSize: 12.5, fontWeight: 900, color: me ? ON_FILL : CREAM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.name}{me && <span style={{ fontSize: 9, marginLeft: 6, letterSpacing: .8, opacity: .65 }}>YOU</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
          {/* Dota's own medal names, because a number between 900 and 1800 means
              nothing to a player and "Divine" means everything. */}
          {medalFill && (
            <span style={{
              fontSize: 7.5, fontWeight: 900, letterSpacing: .5, padding: "1px 6px", borderRadius: 999,
              background: medalFill, color: ON_FILL, border: `1.5px solid ${LINE}`, flexShrink: 0,
            }}>{l.medal.toUpperCase()}</span>
          )}
          <span style={{ fontSize: 9.5, color: me ? ON_FILL : DIM, opacity: me ? .7 : 1, fontWeight: 700, letterSpacing: .3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {daily
              ? `${d.games} today · ${d.wins}W`
              : `${l.games} games · ${l.wins}W ${l.losses}L${l.draws ? ` ${l.draws}D` : ""}${l.streak >= 3 ? ` · ${l.streak} in a row` : ""}`}
          </span>
        </div>
      </div>

      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{
          fontSize: 15, fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1, letterSpacing: "-.02em",
          color: me ? ON_FILL : daily ? (d.delta > 0 ? GREEN : d.delta < 0 ? ENEMY : CREAM) : CREAM,
        }}>
          {daily ? `${d.delta > 0 ? "+" : ""}${d.delta}` : l.elo}
        </div>
        <div style={{ fontSize: 8.5, color: me ? ON_FILL : DIM, opacity: me ? .7 : 1, letterSpacing: .5, fontWeight: 900 }}>
          {daily ? "TODAY" : `PEAK ${l.peak}`}
        </div>
      </div>
    </div>
  );
}
