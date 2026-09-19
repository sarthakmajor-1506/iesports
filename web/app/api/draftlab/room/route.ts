import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { draftSequence, type SeqStep } from "@/lib/draftSequence";
import { QUIZ_COUNT, MAX_POINTS } from "@/lib/quiz";
import { settleRoom } from "@/lib/draftLadderServer";

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
 *
 * Bans use the same `draftSequence()` solo uses (role 0 = host, role 1 = guest),
 * so the two modes cannot drift into different turn orders again.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1
const newCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");

const TURN_MS = 30_000;
/** Grace for latency, so a pick sent just before the buzzer is not thrown away. */
const SLACK_MS = 2_500;

const clean = (v: unknown, max = 24) =>
  typeof v === "string" ? v.trim().slice(0, max).replace(/[<>]/g, "") : "";

type Move = { by: "host" | "guest"; kind: "pick" | "ban"; heroId: number; auto?: boolean };
/**
 * A seat.
 *
 * `id` is the anonymous per-browser id the room has always been keyed on, and
 * it stays the key: a guest with no account must still be able to play.
 *
 * NO uid LIVES HERE. Room documents are readable by anyone holding the
 * five-character code — that is what lets the two clients watch the draft with
 * onSnapshot. A Discord-login account's uid is literally `discord_<their
 * Discord id>`, so putting one in this document would publish a player's
 * Discord identity to anybody who was ever sent the room link. The accounts
 * behind the seats live in `draftlabRoomSeats/{code}`, which no client can
 * read, and the room carries only the booleans the UI actually needs.
 */
type Seat = { id: string; name: string; avatar?: string | null };

/** Server-only: which accounts are sitting in a room. Never sent to a client. */
const SEATS = "draftlabRoomSeats";
type SeatUids = { hostUid?: string | null; guestUid?: string | null };
type Room = {
  code: string;
  status: "waiting" | "drafting" | "done";
  host: Seat;
  guest: Seat | null;
  bans: boolean;
  picks: Move[];
  turnIndex: number;
  deadline: number | null;
  /** Both seats signed in, decided when the guest sits down and never revised. */
  ranked?: boolean;
  /** Whether the host has an account, so the waiting room can say what ranked depends on. */
  hostSignedIn?: boolean;
  /** Set once the ladder has been paid out, so a replayed request cannot pay twice. */
  settled?: boolean;
  result?: { outcome: "host" | "guest" | "draw"; hostWinProb: number; deltaHost: number; deltaGuest: number } | null;
  quizHost?: { points: number; correct: number } | null;
  quizGuest?: { points: number; correct: number } | null;
};

const seatOf = (room: Room, id: string): "host" | "guest" | null =>
  room.host?.id === id ? "host" : room.guest?.id === id ? "guest" : null;

const roleSeat = (step: SeqStep): "host" | "guest" => (step.role === 0 ? "host" : "guest");

/**
 * The signed-in account behind this request, if there is one.
 *
 * Never fails the request: an unverifiable or absent token simply means the
 * seat is anonymous and the room will not be ranked. The uid is taken from the
 * verified token and never from the body, so a client cannot claim to be
 * somebody else and climb their ladder.
 */
async function callerUid(req: NextRequest): Promise<string | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    return (await adminAuth.verifyIdToken(token)).uid;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action;
    const playerId = clean(body.playerId, 64);
    if (!playerId) return NextResponse.json({ error: "playerId required" }, { status: 400 });
    const uid = await callerUid(req);
    const avatar = clean(body.avatar, 300) || null;

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
        host: { id: playerId, name: clean(body.name) || "Host", avatar },
        guest: null,
        bans: !!body.bans,
        picks: [],
        turnIndex: 0,
        deadline: null,
        ranked: false,
        hostSignedIn: !!uid,
        settled: false,
      };
      await adminDb.collection("draftlabRooms").doc(code).set({ ...room, createdAt: FieldValue.serverTimestamp() });
      await adminDb.collection(SEATS).doc(code).set({ hostUid: uid, guestUid: null } satisfies SeatUids);
      return NextResponse.json({ ok: true, code, seat: "host", signedIn: !!uid });
    }

    const code = clean(body.code, 8).toUpperCase();
    if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
    const ref = adminDb.collection("draftlabRooms").doc(code);

    /* -------------------------------------------------------------- join */
    if (action === "join") {
      const seatsRef = adminDb.collection(SEATS).doc(code);
      const out = await adminDb.runTransaction(async (tx) => {
        const [snap, seatsSnap] = await Promise.all([tx.get(ref), tx.get(seatsRef)]);
        if (!snap.exists) return { error: "No room with that code", status: 404 };
        const room = snap.data() as Room;
        const seats = (seatsSnap.exists ? seatsSnap.data() : {}) as SeatUids;

        const seat = seatOf(room, playerId);
        if (seat) return { ok: true, seat }; // rejoining is not an error

        if (room.guest) return { error: "That room is full", status: 409 };
        const guest: Seat = { id: playerId, name: clean(body.name) || "Guest", avatar };
        /*
         * Ranked is decided here, once, and never revised.
         *
         * Both players have to be signed in for a result to mean anything — an
         * anonymous seat has nothing to attach a rating to, and letting a room
         * become ranked later would mean a player could sign in mid-draft and
         * turn a game they were losing into one that counts, or not.
         *
         * The two accounts must also differ, or a player with two tabs open
         * could farm their own rating.
         */
        const ranked = !!seats.hostUid && !!uid && seats.hostUid !== uid;
        // Both seats filled: start immediately and start the first clock.
        tx.update(ref, { guest, ranked, status: "drafting", deadline: Date.now() + TURN_MS });
        tx.set(seatsRef, { hostUid: seats.hostUid ?? null, guestUid: uid }, { merge: true });
        return { ok: true, seat: "guest" as const, ranked };
      });
      if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status });
      return NextResponse.json({ ...out, signedIn: !!uid });
    }

    /* ------------------------------------------------- pick, ban, or time out */
    if (action === "pick" || action === "timeout") {
      const heroId = typeof body.heroId === "number" ? body.heroId : null;

      const out = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return { error: "No room with that code", status: 404 };
        const room = snap.data() as Room;
        if (room.status !== "drafting") return { error: "Room is not drafting", status: 409 };

        const seat = seatOf(room, playerId);
        if (!seat) return { error: "You are not in this room", status: 403 };

        const seq = draftSequence(!!room.bans);
        const turnIndex = room.picks.length;
        if (turnIndex >= seq.length) return { error: "Draft already finished", status: 409 };
        const step = seq[turnIndex];
        const whose = roleSeat(step);
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

        const picks = [...room.picks, { by: whose, kind: step.kind, heroId: chosen, ...(action === "timeout" ? { auto: true } : {}) }];
        const finished = picks.length >= seq.length;
        tx.update(ref, {
          picks,
          turnIndex: picks.length,
          status: finished ? "done" : "drafting",
          deadline: finished ? null : Date.now() + TURN_MS,
        });
        return { ok: true, heroId: chosen, kind: step.kind, finished };
      });

      if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status });

      /*
       * The draft is over — pay the ladder.
       *
       * Deliberately outside the transaction above. Settling has to read both
       * players' ladder rows, and a Firestore transaction must do all of its
       * reads before any write; folding that into the pick would mean the turn
       * itself could fail on a ladder contention retry. `settleRoom` is
       * idempotent on the room's `settled` flag, so the worst case here is that
       * the ladder lands a moment after the final pick does.
       */
      if (out.finished) {
        try { await settleRoom(code); } catch (e) { console.error("[draftlab] settle failed:", e); }
      }
      return NextResponse.json(out);
    }

    /* ------------------------------------------------- quiz score submit */
    if (action === "quiz") {
      // Bounds follow the round length rather than the 3-question round this was
      // written against, or a five-question score would be clamped to the old
      // ceiling the moment it arrived.
      const MAX_QUIZ = QUIZ_COUNT * MAX_POINTS;
      const points = typeof body.points === "number" ? Math.max(0, Math.min(MAX_QUIZ, Math.round(body.points))) : null;
      const correct = typeof body.correct === "number" ? Math.max(0, Math.min(QUIZ_COUNT, Math.round(body.correct))) : 0;
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
    const seq = draftSequence(!!d.bans);
    return NextResponse.json({
      code: d.code, status: d.status, host: d.host, guest: d.guest, bans: !!d.bans,
      picks: d.picks, turnIndex: d.turnIndex, deadline: d.deadline,
      ranked: !!d.ranked, hostSignedIn: !!d.hostSignedIn, result: d.result ?? null,
      quizHost: d.quizHost ?? null, quizGuest: d.quizGuest ?? null,
      turns: seq.length, turnMs: TURN_MS,
    });
  } catch (e) {
    console.error("[draftlab] room read failed:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
