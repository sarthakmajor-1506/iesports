import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Draft Lab — live rooms.
 *
 * Two people draft against each other in real time. Clients watch the room with
 * onSnapshot (reads are open in firestore.rules) but never write directly: every
 * mutation lands here so turn order, hero availability and the pick deadline are
 * checked somewhere the players cannot edit.
 *
 * Time is the interesting part. The countdown is driven by `deadline`, an
 * absolute server timestamp written when a turn begins, so both clients agree
 * even if their clocks or frame rates differ. A late pick is rejected; either
 * player may then call `timeout`, which is how a disconnected opponent stops
 * being able to freeze the game forever.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1
const newCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");

const TURN_MS = 30_000;
/** Grace for latency, so a pick sent just before the buzzer is not thrown away. */
const SLACK_MS = 2_500;
/** Ten alternating picks; host opens, guest closes. */
const TURNS: ("host" | "guest")[] = Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? "host" : "guest"));

const clean = (v: unknown, max = 24) =>
  typeof v === "string" ? v.trim().slice(0, max).replace(/[<>]/g, "") : "";

type Room = {
  code: string;
  status: "waiting" | "drafting" | "done";
  host: { id: string; name: string };
  guest: { id: string; name: string } | null;
  picks: { by: "host" | "guest"; heroId: number; auto?: boolean }[];
  turnIndex: number;
  deadline: number | null;
  quizHost?: { points: number; correct: number } | null;
  quizGuest?: { points: number; correct: number } | null;
};

const seatOf = (room: Room, id: string): "host" | "guest" | null =>
  room.host?.id === id ? "host" : room.guest?.id === id ? "guest" : null;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action;
    const playerId = clean(body.playerId, 64);
    if (!playerId) return NextResponse.json({ error: "playerId required" }, { status: 400 });

    /* ------------------------------------------------------------ create */
    if (action === "create") {
      let code = newCode();
      for (let i = 0; i < 5; i++) {
        const hit = await adminDb.collection("draftlabRooms").doc(code).get();
        if (!hit.exists) break;
        code = newCode();
      }
      const room: Room = {
        code,
        status: "waiting",
        host: { id: playerId, name: clean(body.name) || "Host" },
        guest: null,
        picks: [],
        turnIndex: 0,
        deadline: null,
      };
      await adminDb.collection("draftlabRooms").doc(code).set({ ...room, createdAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ ok: true, code, seat: "host" });
    }

    const code = clean(body.code, 8).toUpperCase();
    if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
    const ref = adminDb.collection("draftlabRooms").doc(code);

    /* -------------------------------------------------------------- join */
    if (action === "join") {
      const out = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { error: "No room with that code", status: 404 };
        const room = snap.data() as Room;

        const seat = seatOf(room, playerId);
        if (seat) return { ok: true, seat }; // rejoining is not an error

        if (room.guest) return { error: "That room is full", status: 409 };
        const guest = { id: playerId, name: clean(body.name) || "Guest" };
        // Both seats filled: start immediately and start the first clock.
        tx.update(ref, { guest, status: "drafting", deadline: Date.now() + TURN_MS });
        return { ok: true, seat: "guest" as const };
      });
      if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status });
      return NextResponse.json(out);
    }

    /* ------------------------------------------------- pick, or time out */
    if (action === "pick" || action === "timeout") {
      const heroId = typeof body.heroId === "number" ? body.heroId : null;

      const out = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { error: "No room with that code", status: 404 };
        const room = snap.data() as Room;
        if (room.status !== "drafting") return { error: "Room is not drafting", status: 409 };

        const seat = seatOf(room, playerId);
        if (!seat) return { error: "You are not in this room", status: 403 };

        const turnIndex = room.picks.length;
        if (turnIndex >= TURNS.length) return { error: "Draft already finished", status: 409 };
        const whose = TURNS[turnIndex];
        const expired = room.deadline != null && Date.now() > room.deadline + SLACK_MS;

        if (action === "pick") {
          if (whose !== seat) return { error: "Not your turn", status: 409 };
          if (expired) return { error: "Too late — that turn expired", status: 409 };
        } else {
          // Anyone may force a timeout, but only once the clock has genuinely run
          // out; that is what stops a disconnected player hanging the draft.
          if (!expired) return { error: "Turn has not expired yet", status: 409 };
        }

        const taken = new Set(room.picks.map((p) => p.heroId));
        let chosen = heroId;
        if (action === "timeout" || chosen == null || taken.has(chosen)) {
          const fallback = Array.isArray(body.fallback) ? body.fallback.filter((h: unknown) => typeof h === "number") : [];
          chosen = fallback.find((h: number) => !taken.has(h)) ?? null;
          if (chosen == null) return { error: "No hero available", status: 409 };
        }

        const picks = [...room.picks, { by: whose, heroId: chosen, ...(action === "timeout" ? { auto: true } : {}) }];
        const finished = picks.length >= TURNS.length;
        tx.update(ref, {
          picks,
          turnIndex: picks.length,
          status: finished ? "done" : "drafting",
          deadline: finished ? null : Date.now() + TURN_MS,
        });
        return { ok: true, heroId: chosen, finished };
      });

      if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status });
      return NextResponse.json(out);
    }

    /* ------------------------------------------------- quiz score submit */
    if (action === "quiz") {
      const points = typeof body.points === "number" ? Math.max(0, Math.min(30, Math.round(body.points))) : null;
      const correct = typeof body.correct === "number" ? Math.max(0, Math.min(3, Math.round(body.correct))) : 0;
      if (points == null) return NextResponse.json({ error: "points required" }, { status: 400 });

      const out = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { error: "No room with that code", status: 404 };
        const room = snap.data() as Room;
        const seat = seatOf(room, playerId);
        if (!seat) return { error: "You are not in this room", status: 403 };
        const field = seat === "host" ? "quizHost" : "quizGuest";
        // First submission stands — a resubmit cannot improve a score.
        if ((room as unknown as Record<string, unknown>)[field]) return { ok: true, already: true };
        tx.update(ref, { [field]: { points, correct } });
        return { ok: true };
      });
      if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status });
      return NextResponse.json(out);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("[draftlab] room action failed:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const code = (req.nextUrl.searchParams.get("code") || "").trim().toUpperCase().slice(0, 8);
    if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
    const snap = await adminDb.collection("draftlabRooms").doc(code).get();
    if (!snap.exists) return NextResponse.json({ error: "No such room" }, { status: 404 });
    const d = snap.data() as Room;
    return NextResponse.json({
      code: d.code, status: d.status, host: d.host, guest: d.guest,
      picks: d.picks, turnIndex: d.turnIndex, deadline: d.deadline,
      quizHost: d.quizHost ?? null, quizGuest: d.quizGuest ?? null,
      turns: TURNS, turnMs: TURN_MS,
    });
  } catch (e) {
    console.error("[draftlab] room read failed:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
