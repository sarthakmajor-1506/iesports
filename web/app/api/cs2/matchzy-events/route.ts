import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { cs2TokenValid } from "@/lib/cs2Auth";
import { settleCS2Match } from "@/lib/settleCS2Match";

/**
 * MatchZy result webhook (`matchzy_remote_log_url`, Get5-compatible event
 * format). Token-auth, idempotent on (matchid, map_number, event,
 * round_number).
 *
 * Every event is logged to `cs2MatchzyEvents` BEFORE any parsing,
 * unconditionally. Keep that: it is the only record if the extraction below
 * is wrong, and it is how the real payload shape was established.
 *
 * A confirmed MatchZy 0.8.5 series_start looks like:
 *   {"team1":{"id":"","name":"Hunter"},"team2":{"id":"","name":"Major"},
 *    "num_maps":1,"matchid":900001,"event":"series_start"}
 * Note `matchid` is a NUMBER and teams are OBJECTS, so scores live at
 * `team1.score` rather than Get5's documented flat `team1_score`. The
 * helpers below accept either, because reading only the flat form yields 0
 * for every round — a pipeline that looks healthy while recording 0-0.
 *
 * Field-shape rule: games are written keyed `game1`/`game2`/`game3`
 * (map_number 0 → game1), never as an array. See
 * web/app/cs2/tournament/[id]/page.tsx:98.
 */

/**
 * Pull a team's score out of an event payload, tolerating both shapes.
 *
 * A real series_start from MatchZy 0.8.5 arrives as
 * `{"team1":{"id":"","name":"Hunter"},...}` — team objects, not flat keys —
 * so scores are expected at `team1.score`. Get5's documented schema uses flat
 * `team1_score`. Reading only the flat form silently yields 0 for every round,
 * which looks like a working pipeline recording a 0-0 game. Check both, and
 * return null rather than 0 when genuinely absent so callers can tell
 * "no score in this event" from "score is zero".
 */
function teamScore(payload: any, team: "team1" | "team2"): number | null {
  const flat = payload?.[`${team}_score`];
  const nested = payload?.[team]?.score;
  const v = flat ?? nested;
  return Number.isFinite(Number(v)) ? Number(v) : null;
}

/** Same tolerance for the series score reported on series_end. */
function seriesScore(payload: any, team: "team1" | "team2"): number | undefined {
  const flat = payload?.[`${team}_series_score`];
  const nested = payload?.[team]?.series_score;
  const v = flat ?? nested;
  return Number.isFinite(Number(v)) ? Number(v) : undefined;
}

function gameKeyFor(mapNumber: any): string {
  const n = Number.isFinite(Number(mapNumber)) ? Number(mapNumber) : 0;
  return `game${n + 1}`;
}

function seenKeyFor(payload: any): string {
  const matchid = payload?.matchid ?? "x";
  const mapNumber = payload?.map_number ?? "x";
  const event = payload?.event ?? "unknown";
  const roundNumber = payload?.round_number ?? "x";
  return `${matchid}_${mapNumber}_${event}_${roundNumber}`.replace(/[^a-zA-Z0-9_.-]/g, "_");
}

export async function POST(req: NextRequest) {
  if (!cs2TokenValid(req.headers.get("x-iesports-token"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: any;
  try { payload = await req.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  // Forensic trail, unconditional, before any parsing. This is intentionally
  // never gated on anything below succeeding.
  await adminDb.collection("cs2MatchzyEvents").add({
    receivedAt: new Date().toISOString(),
    raw: payload,
  }).catch(() => {});

  const event = String(payload?.event || "");
  if (!event) return NextResponse.json({ ok: true, skipped: "no event field" });

  // Resolve which of our matches this belongs to. A missing index doc means
  // this event belongs to someone else's pug on the shared box — return 200
  // with no write rather than erroring, so MatchZy doesn't retry forever.
  const indexSnap = await adminDb.collection("cs2MatchzyIndex").doc(String(payload.matchid)).get();
  if (!indexSnap.exists) {
    return NextResponse.json({ ok: true, skipped: "unknown matchid (not our match)" });
  }
  const { tournamentId, matchId } = indexSnap.data() as { tournamentId: string; matchId: string };

  // Idempotency: MatchZy can resend, round_end fires 20-30x per map. `.create()`
  // throws ALREADY_EXISTS on a duplicate — no read-then-write race.
  const seenRef = adminDb.collection("cs2MatchzyEventSeen").doc(seenKeyFor(payload));
  try {
    await seenRef.create({ tournamentId, matchId, event, at: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: true, skipped: "duplicate event" });
  }

  const tref = adminDb.collection("cs2Tournaments").doc(tournamentId);
  const matchRef = tref.collection("matches").doc(matchId);
  const nowIso = new Date().toISOString();

  try {
    switch (event) {
      case "series_start": {
        await matchRef.set({ status: "live", liveStartedAt: nowIso }, { merge: true });
        break;
      }

      case "going_live": {
        const gk = gameKeyFor(payload.map_number);
        await matchRef.set({
          status: "live",
          [gk]: { team1RoundsWon: 0, team2RoundsWon: 0, status: "live" },
          liveUpdatedAt: nowIso,
        }, { merge: true });
        break;
      }

      case "round_end": {
        const gk = gameKeyFor(payload.map_number);
        const t1 = teamScore(payload, "team1");
        const t2 = teamScore(payload, "team2");
        // Skip rather than write zeros: a round_end we can't read a score from
        // would otherwise overwrite a correct running score with 0-0.
        if (t1 === null && t2 === null) break;
        await matchRef.set({
          [gk]: { team1RoundsWon: t1 ?? 0, team2RoundsWon: t2 ?? 0 },
          liveUpdatedAt: nowIso,
        }, { merge: true });
        break;
      }

      case "map_result": {
        const gk = gameKeyFor(payload.map_number);
        const t1 = teamScore(payload, "team1");
        const t2 = teamScore(payload, "team2");
        await matchRef.set({
          [gk]: {
            // On a map_result with no readable score, leave whatever the
            // round_end stream already recorded rather than zeroing it.
            ...(t1 !== null || t2 !== null
              ? { team1RoundsWon: t1 ?? 0, team2RoundsWon: t2 ?? 0 }
              : {}),
            status: "completed", completedAt: nowIso,
            ...(payload.map_name ? { map: String(payload.map_name) } : {}),
          },
        }, { merge: true });
        break;
      }

      case "series_end": {
        // Read back whatever per-map data round_end/map_result already wrote
        // so the Discord message reports the deciding map's real score,
        // without settleCS2Match re-synthesizing (and clobbering) game1.
        const freshSnap = await matchRef.get();
        const fresh: any = freshSnap.data() || {};
        const winnerTeam = payload.winner?.team === "team2" ? "team2" : "team1";
        const team1SeriesScore = seriesScore(payload, "team1");
        const team2SeriesScore = seriesScore(payload, "team2");

        let highestGame = 1;
        for (let i = 1; i <= 5; i++) if (fresh[`game${i}`]) highestGame = i;
        const decidingGame = fresh[`game${highestGame}`] || {};

        await settleCS2Match(adminDb, {
          tournamentId, matchId,
          winner: winnerTeam,
          team1Rounds: decidingGame.team1RoundsWon ?? null,
          team2Rounds: decidingGame.team2RoundsWon ?? null,
          team1SeriesScore, team2SeriesScore,
          games: {}, // per-map data already written; don't touch it here
          source: "matchzy",
        });
        break;
      }

      case "map_picked":
      case "map_vetoed":
      case "side_picked": {
        await matchRef.set({
          vetoLog: FieldValue.arrayUnion({
            event, map: payload.map_name ?? null, team: payload.team ?? null,
            side: payload.side ?? null, at: nowIso,
          }),
        }, { merge: true });
        break;
      }

      case "demo_upload_ended": {
        if (payload.url) {
          const gk = gameKeyFor(payload.map_number);
          await matchRef.set({ [gk]: { demoUrl: String(payload.url) } }, { merge: true });
        }
        break;
      }

      case "player_disconnect":
      default:
        break;
    }
  } catch (e: any) {
    // Never make MatchZy retry over a Firestore write failure — the raw
    // event is already durably logged above.
    return NextResponse.json({ ok: true, error: e?.message || String(e) });
  }

  return NextResponse.json({ ok: true });
}
