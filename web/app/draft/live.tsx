"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { authPost } from "@/app/lib/authFetch";

export type Seat = "host" | "guest";
export type LiveRoom = {
  code: string;
  status: "waiting" | "drafting" | "done";
  host: { id: string; name: string; avatar?: string | null };
  guest: { id: string; name: string; avatar?: string | null } | null;
  /** Whether this room drafts with bans — set once, at creation. */
  bans: boolean;
  picks: { by: Seat; kind: "pick" | "ban"; heroId: number; auto?: boolean }[];
  turnIndex: number;
  deadline: number | null;
  /** Both seats signed in. Decided when the guest sits down, never revised. */
  ranked?: boolean;
  /** Whether the host has an account, so the waiting room can say what ranked depends on. */
  hostSignedIn?: boolean;
  /** Written by the server once the draft finishes; the source of the scoreboard. */
  result?: {
    outcome: "host" | "guest" | "draw"; hostWinProb: number;
    deltaHost: number; deltaGuest: number; coinsHost: number; coinsGuest: number;
  } | null;
  quizHost?: { points: number; correct: number } | null;
  quizGuest?: { points: number; correct: number } | null;
  /** Both sides ready → one shared instant to start the question clock from. */
  quizReadyHost?: boolean;
  quizReadyGuest?: boolean;
  quizStartAt?: number | null;
};

export const TURN_MS = 30_000;

export function playerId() {
  if (typeof window === "undefined") return "server";
  try {
    let id = localStorage.getItem("draftlab_player");
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("draftlab_player", id);
    }
    return id;
  } catch {
    return "nostore";
  }
}

/**
 * Live view of a room.
 *
 * Reads come straight from Firestore via onSnapshot so a pick appears on the
 * other screen the moment it is written — polling would make a 30-second turn
 * feel laggy. Writes go through /api/draftlab/room, which is the only thing that
 * can change a room, so the client is never trusted with turn order or the clock.
 */
export function useLiveRoom(code: string | null) {
  const [room, setRoom] = useState<LiveRoom | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [live, setLive] = useState(true);

  useEffect(() => {
    if (!code) { setRoom(null); return; }
    let stopped = false;
    let poll: ReturnType<typeof setInterval> | null = null;

    const fetchOnce = async () => {
      try {
        const r = await fetch(`/api/draftlab/room?code=${code}`, { cache: "no-store" });
        if (!r.ok) { if (r.status === 404) setErr("That room is gone."); return; }
        const d = await r.json();
        if (!stopped) { setErr(null); setRoom(d as LiveRoom); }
      } catch { /* transient; the next tick retries */ }
    };

    /**
     * Poll through the API instead of watching Firestore.
     *
     * onSnapshot needs client read access to `draftlabRooms`, and that rule ships
     * in firestore.rules but only takes effect once the rules are deployed. Until
     * then a listener just errors, so this falls back to a 1.2s poll — slower than
     * push, but a 30-second turn absorbs it, and the game works with no deploy.
     */
    const startPolling = () => {
      if (poll) return;
      setLive(false);
      void fetchOnce();
      poll = setInterval(fetchOnce, 1200);
    };

    let unsub: (() => void) | null = null;
    try {
      unsub = onSnapshot(
        doc(db, "draftlabRooms", code),
        (snap) => {
          if (stopped) return;
          if (!snap.exists()) { setErr("That room is gone."); setRoom(null); return; }
          setErr(null); setLive(true);
          setRoom(snap.data() as LiveRoom);
        },
        () => { if (!stopped) startPolling(); }
      );
    } catch { startPolling(); }

    // Nothing from the listener quickly? Assume it is blocked and poll.
    const guard = setTimeout(() => { if (!stopped && !room) startPolling(); }, 2500);

    return () => {
      stopped = true;
      clearTimeout(guard);
      if (poll) clearInterval(poll);
      if (unsub) unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return { room, err, live };
}

/**
 * Seconds left on the current turn, from the room's absolute deadline.
 *
 * Derived from a server timestamp rather than a local countdown so both players
 * see the same number — a client-side timer would drift apart on a slow tab and
 * they would disagree about who ran out of time.
 */
export function useCountdown(deadline: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline == null) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [deadline]);
  if (deadline == null) return null;
  return Math.max(0, (deadline - now) / 1000);
}

export function useRoomActions() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Every room call carries the signed-in player's token.
   *
   * The seat is still keyed on the anonymous browser id, so a guest plays
   * exactly as before. The token is what lets the server attach an ACCOUNT to
   * that seat, which is the only thing a ladder result can be paid to — and it
   * has to come from a verified token rather than a uid in the body, or
   * climbing somebody else's ladder would be a one-line edit in a console.
   */
  const call = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true); setError(null);
    try {
      const r = await authPost("/api/draftlab/room", { ...body, playerId: playerId() });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Something went wrong"); setBusy(false); return null; }
      setBusy(false);
      return d;
    } catch {
      setError("Could not reach the server."); setBusy(false); return null;
    }
  }, []);

  return { call, busy, error, setError };
}

/**
 * The ladder queue.
 *
 * Polls rather than listening: a queue entry carries an account and a display
 * name, and `draftlabQueue` is deliberately not client-readable — only rooms
 * are. A poll every two seconds for the couple of minutes somebody is waiting
 * is a cheap price for not opening that collection up.
 *
 * `hosting` is the cold-start case: nobody was queueing, so the server opened a
 * room and announced it in Discord. From the player's side that is still
 * waiting — they just have a room number now, and somebody clicking the link in
 * the channel drops straight into it.
 */
export type QueueState = "idle" | "waiting" | "hosting" | "matched";

export function useQueue(onMatch: (code: string) => void) {
  const [state, setState] = useState<QueueState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [waitedMs, setWaitedMs] = useState(0);
  const matched = useRef(false);

  const send = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const r = await authPost("/api/draftlab/queue", { action, playerId: playerId(), ...extra });
    const d = await r.json().catch(() => null);
    if (!r.ok) { setError(d?.error || "Could not reach the queue."); return null; }
    return d;
  }, []);

  const join = useCallback(async (name: string, avatar: string | null, bans: boolean) => {
    setError(null); matched.current = false;
    const d = await send("join", { name, avatar, bans });
    if (!d) { setState("idle"); return; }
    if (d.state === "matched" && d.code) { matched.current = true; setState("matched"); onMatch(d.code); return; }
    setState("waiting");
  }, [send, onMatch]);

  const leave = useCallback(async () => {
    setState("idle"); setWaitedMs(0);
    await send("leave");
  }, [send]);

  useEffect(() => {
    if (state !== "waiting" && state !== "hosting") return;
    let stop = false;
    const tick = async () => {
      const d = await send("poll");
      if (stop || !d) return;
      if (d.state === "matched" && d.code && !matched.current) {
        matched.current = true; setState("matched"); onMatch(d.code); return;
      }
      if (d.state === "hosting" && d.code && !matched.current) {
        matched.current = true; setState("hosting"); onMatch(d.code); return;
      }
      if (d.state === "idle") { setState("idle"); return; }
      setWaitedMs(d.waitedMs ?? 0);
    };
    const t = setInterval(tick, 2000);
    return () => { stop = true; clearInterval(t); };
  }, [state, send, onMatch]);

  /*
   * A player who closes the tab is cleaned up by the server, not by a beacon.
   * `sendBeacon` cannot carry an Authorization header, so an unload leave would
   * arrive unauthenticated and be rejected — and the route already treats a
   * parked entry that has not polled within 45 seconds as gone, which covers a
   * closed tab, a dead connection and a backgrounded phone alike.
   */
  return { state, error, waitedMs, join, leave };
}

/**
 * Fires the timeout exactly once per turn when the clock runs out.
 *
 * Both clients race to call it and the server settles it — whichever arrives
 * second is rejected because the turn has already advanced. That redundancy is
 * deliberate: if only the player on the clock could time themselves out, closing
 * their laptop would freeze the draft for the other person.
 */
export function useTurnTimeout(
  room: LiveRoom | null,
  onExpire: () => void,
  enabled: boolean
) {
  const firedFor = useRef<number>(-1);
  useEffect(() => {
    if (!enabled || !room || room.status !== "drafting" || room.deadline == null) return;
    const idx = room.picks.length;
    if (firedFor.current === idx) return;
    const wait = room.deadline + 2600 - Date.now();
    const t = setTimeout(() => { firedFor.current = idx; onExpire(); }, Math.max(0, wait));
    return () => clearTimeout(t);
  }, [room, onExpire, enabled]);
}

/**
 * The turn clock. A live draft is the one place real urgency is earned — solo
 * play against the bot is deliberately untimed, a study tool rather than a
 * race — so this is built to be the loudest thing on screen when it is yours.
 */
export function TurnClock({ seconds, yours, size = 44 }: { seconds: number | null; yours: boolean; size?: number }) {
  if (seconds == null) return null;
  const urgent = seconds <= 5;
  const warn = seconds <= 10;
  const pct = Math.max(0, Math.min(1, seconds / (TURN_MS / 1000)));
  // Mint while there is time, lemon at ten, pink at five — the colour is the
  // warning, so it lands before the number is read. These are the same three
  // fills the rest of the game uses for good / careful / bad.
  // Always a pastel, never a surface: the digits on top are `--on-fill`, so a
  // `--card` disc would print near-black on near-black in the night sheet.
  const fill = urgent ? "var(--pink)" : warn ? "var(--lemon)" : yours ? "var(--mint)" : "var(--lilac)";
  const r = size / 2 - 3;
  return (
    // A solid pastel disc with an INK arc drawn on top of it, rather than the
    // floating coloured ring this used to be. Two reasons: a 4px stroke on cream
    // with nothing behind it reads as a loading spinner, and the number needs a
    // surface that does not change under it — the fill is always a pastel, so
    // `--on-fill` is always the right colour for the digits, in both sheets.
    <div style={{
      position: "relative", width: size, height: size, flexShrink: 0, borderRadius: "50%",
      background: fill, border: "2.5px solid var(--stroke)", boxSizing: "border-box",
      boxShadow: "3px 3px 0 var(--stroke)",
      animation: urgent ? "dl-urgent .55s ease-in-out infinite" : undefined,
    }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        style={{ position: "absolute", top: -2.5, left: -2.5, transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--stroke)" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * r}`}
          strokeDashoffset={`${2 * Math.PI * r * (1 - pct)}`}
          style={{ transition: "stroke-dashoffset .22s linear" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.36, fontWeight: 900, color: "var(--on-fill)", fontVariantNumeric: "tabular-nums",
      }}>{Math.ceil(seconds)}</div>
    </div>
  );
}
