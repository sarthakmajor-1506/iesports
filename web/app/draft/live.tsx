"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type Seat = "host" | "guest";
export type LiveRoom = {
  code: string;
  status: "waiting" | "drafting" | "done";
  host: { id: string; name: string };
  guest: { id: string; name: string } | null;
  picks: { by: Seat; heroId: number; auto?: boolean }[];
  turnIndex: number;
  deadline: number | null;
  quizHost?: { points: number; correct: number } | null;
  quizGuest?: { points: number; correct: number } | null;
};

export const TURNS: Seat[] = Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? "host" : "guest"));
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

  const call = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/draftlab/room", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, playerId: playerId() }),
      });
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

/** Big turn clock. Turns red and pulses in the last five seconds. */
export function TurnClock({ seconds, yours }: { seconds: number | null; yours: boolean }) {
  if (seconds == null) return null;
  const urgent = seconds <= 5;
  const pct = Math.max(0, Math.min(1, seconds / (TURN_MS / 1000)));
  const color = urgent ? "#e0453a" : yours ? "#c9a227" : "#8a7d7a";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <div style={{ position: "relative", width: 42, height: 42, flexShrink: 0 }}>
        <svg width="42" height="42" viewBox="0 0 42 42" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="21" cy="21" r="18" fill="none" stroke="#2a2020" strokeWidth="4" />
          <circle
            cx="21" cy="21" r="18" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 18}`}
            strokeDashoffset={`${2 * Math.PI * 18 * (1 - pct)}`}
            style={{ transition: "stroke-dashoffset .22s linear, stroke .3s" }}
          />
        </svg>
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontWeight: 800, color, fontVariantNumeric: "tabular-nums",
          animation: urgent ? "dl-pulse .7s ease-in-out infinite" : undefined,
        }}>{Math.ceil(seconds)}</div>
      </div>
    </div>
  );
}
