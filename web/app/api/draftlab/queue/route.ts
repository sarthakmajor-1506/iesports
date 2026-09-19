import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Draft Lab — the ladder queue.
 *
 * THE COLD START IS THE WHOLE PROBLEM. A matchmaking queue at this scale is an
 * empty room: the honest expected number of other people waiting at 11pm is
 * zero, and a queue that spins forever teaches players that the mode is dead.
 * So the queue does not only wait — when nobody is there to match, it announces
 * that somebody is looking, into the Discord server these players are already
 * sitting in. The distribution advantage this product has over any other daily
 * game is that its audience is in one room; this is the endpoint that uses it.
 *
 * HOW MATCHING WORKS. Everything happens in one transaction against a single
 * `open` document, so two people pressing the button at the same moment cannot
 * both be told to wait. The first player parks there; the second takes the
 * parked player, creates the room and writes the code onto both entries, which
 * is how the waiting client finds out where to go.
 *
 * WHY NOT onSnapshot. Queue entries carry a uid and a display name, and
 * `draftlabQueue` is not readable from the client — only rooms are. The waiting
 * client polls this route instead, which is a request every two seconds for at
 * most a couple of minutes.
 */

const QUEUE = "draftlabQueue";
const OPEN_DOC = "open";
/** A parked player who has not polled within this long has closed the tab. */
const STALE_MS = 45_000;
/** How long before the Discord shout goes out, so a quick match stays silent. */
const SHOUT_AFTER_MS = 12_000;
/** One shout per this long, whoever is queueing, so the channel is not spammed. */
const SHOUT_COOLDOWN_MS = 20 * 60_000;

const clean = (v: unknown, max = 24) =>
  typeof v === "string" ? v.trim().slice(0, max).replace(/[<>]/g, "") : "";

type Parked = {
  uid: string;
  playerId: string;
  name: string;
  avatar: string | null;
  since: number;
  lastSeen: number;
  bans: boolean;
  code?: string | null;
};

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

/**
 * Tell the Discord server somebody is looking for a game.
 *
 * Posted with the bot token the web app already holds, straight to Discord's
 * REST API, rather than through the bot process — that process runs live
 * tournaments, and a queue ping is not worth a deployment of it.
 *
 * Silent and non-fatal when unconfigured: no channel set means no shout, and a
 * Discord outage must never stop somebody joining a queue.
 */
async function shout(name: string, code: string) {
  const channel = process.env.DISCORD_DRAFT_CHANNEL_ID;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!channel || !token) return;

  const role = process.env.DISCORD_DRAFT_ROLE_ID;
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const mention = role ? `<@&${role}> ` : "";
  try {
    await fetch(`https://discord.com/api/v10/channels/${channel}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bot ${token}` },
      body: JSON.stringify({
        content: `${mention}**${name}** is looking for a draft — first to click gets the seat.\n${base}/draft?live=${code}`,
        // Only the configured role is ever pinged; nothing here may ping
        // everyone, and a stray @everyone in a display name cannot become one.
        allowed_mentions: role ? { roles: [role], parse: [] } : { parse: [] },
      }),
    });
  } catch (e) {
    console.error("[draftlab] queue shout failed:", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action;
    const playerId = clean(body.playerId, 64);
    const uid = await callerUid(req);

    if (!uid) return NextResponse.json({ error: "Sign in to use the ladder." }, { status: 401 });
    if (!playerId) return NextResponse.json({ error: "playerId required" }, { status: 400 });

    const openRef = adminDb.collection(QUEUE).doc(OPEN_DOC);
    const mineRef = adminDb.collection(QUEUE).doc(uid);

    /* --------------------------------------------------------------- leave */
    if (action === "leave") {
      await adminDb.runTransaction(async (tx) => {
        const open = await tx.get(openRef);
        const parked = open.exists ? (open.data() as Parked) : null;
        if (parked?.uid === uid) tx.delete(openRef);
        tx.delete(mineRef);
      });
      return NextResponse.json({ ok: true, state: "idle" });
    }

    /* ---------------------------------------------------------------- poll */
    if (action === "poll") {
      const mine = await mineRef.get();
      if (!mine.exists) return NextResponse.json({ ok: true, state: "idle" });
      const d = mine.data() as Parked;
      if (d.code) {
        // Matched. The entry is cleared now the client has been told where to go.
        await mineRef.delete().catch(() => {});
        return NextResponse.json({ ok: true, state: "matched", code: d.code });
      }
      await mineRef.update({ lastSeen: Date.now() }).catch(() => {});
      await openRef.update({ lastSeen: Date.now() }).catch(() => {});

      // The shout waits a beat: if somebody is already queueing, a match lands
      // in a second or two and the channel never hears about it.
      const waited = Date.now() - (d.since ?? Date.now());
      if (waited > SHOUT_AFTER_MS && !d.code) {
        const stamp = await adminDb.collection(QUEUE).doc("shout").get();
        const last = (stamp.data()?.at as number) ?? 0;
        if (Date.now() - last > SHOUT_COOLDOWN_MS) {
          await adminDb.collection(QUEUE).doc("shout").set({ at: Date.now() });
          // A room is made up front so the Discord link is a seat, not an
          // invitation to go and find one.
          const created = await createRoomFor(d);
          if (created) {
            await mineRef.update({ code: created, hosting: true }).catch(() => {});
            await openRef.delete().catch(() => {});
            await shout(d.name, created);
            return NextResponse.json({ ok: true, state: "hosting", code: created, shouted: true });
          }
        }
      }
      return NextResponse.json({ ok: true, state: "waiting", waitedMs: waited });
    }

    /* ---------------------------------------------------------------- join */
    if (action !== "join") return NextResponse.json({ error: "Unknown action" }, { status: 400 });

    const name = clean(body.name) || "Player";
    const avatar = clean(body.avatar, 300) || null;
    const bans = !!body.bans;
    const now = Date.now();

    const out = await adminDb.runTransaction(async (tx) => {
      const open = await tx.get(openRef);
      const parked = open.exists ? (open.data() as Parked) : null;
      const fresh = parked && now - (parked.lastSeen ?? parked.since ?? 0) < STALE_MS;

      // Somebody else is waiting: take them.
      if (parked && fresh && parked.uid !== uid) {
        tx.delete(openRef);
        return { match: parked };
      }

      // Nobody there, or the parked player is me, or they left the tab open and
      // went away — park (or re-park) myself.
      const me: Parked = { uid, playerId, name, avatar, since: now, lastSeen: now, bans, code: null };
      tx.set(openRef, me);
      tx.set(mineRef, me);
      return { match: null };
    });

    if (!out.match) return NextResponse.json({ ok: true, state: "waiting" });

    // Matched. The room is created outside the transaction — it is a write to a
    // different collection and a retry here would leak empty rooms.
    const code = await createRoomFor(out.match);
    if (!code) return NextResponse.json({ ok: true, state: "waiting" });

    await adminDb.collection(QUEUE).doc(out.match.uid).set({ ...out.match, code }, { merge: true });
    await mineRef.delete().catch(() => {});
    return NextResponse.json({ ok: true, state: "matched", code, opponent: out.match.name });
  } catch (e) {
    console.error("[draftlab] queue failed:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** Open a room with the parked player already seated as host. */
async function createRoomFor(parked: Parked): Promise<string | null> {
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const newCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
  try {
    let code = newCode();
    for (let i = 0; i < 5; i++) {
      const hit = await adminDb.collection("draftlabRooms").doc(code).get();
      if (!hit.exists) break;
      code = newCode();
    }
    await adminDb.collection("draftlabRooms").doc(code).set({
      code,
      status: "waiting",
      // No uid in here — the room is readable by anyone holding the code. See
      // the note on `Seat` in the room route.
      host: { id: parked.playerId, name: parked.name, avatar: parked.avatar },
      guest: null,
      bans: !!parked.bans,
      picks: [],
      turnIndex: 0,
      deadline: null,
      ranked: false,
      hostSignedIn: true,
      settled: false,
      fromQueue: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    await adminDb.collection("draftlabRoomSeats").doc(code).set({ hostUid: parked.uid, guestUid: null });
    return code;
  } catch (e) {
    console.error("[draftlab] queue room create failed:", e);
    return null;
  }
}
