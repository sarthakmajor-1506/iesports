import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * Draft Lab — anonymous response log.
 *
 * V0 has no accounts, but every response is still recorded, in the shape a
 * graded-response rating model (IRT) can consume later: one row per decision,
 * carrying the player's choice, the model's candidate values, and the regret.
 * Collecting this from day one is what avoids a migration when the rating
 * system is eventually built.
 *
 * Writes go through the Admin SDK rather than the client so firestore.rules
 * does not have to be opened up for anonymous writes.
 */
const MODES = ["quick", "draft", "duel"];
const FORMATS = ["quick", "captains"];

/**
 * Field schema for a logged response.
 *
 * This is a map rather than a hand-written object literal because three separate
 * fields have now been silently dropped by hand-maintained destructuring — `mode`
 * and `draftPicks`, then `format` and `bans` — each time producing rows that
 * looked fine but had lost the very thing they were added to record. Anything the
 * client sends that is not listed here is still preserved (below), so the failure
 * mode is now an unvalidated field rather than a missing one.
 */
type Coerce = (v: unknown) => unknown;
const num: Coerce = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (max: number): Coerce => (v) => (typeof v === "string" ? v.slice(0, max) : null);
const oneOf = (allowed: string[]): Coerce => (v) => (typeof v === "string" && allowed.includes(v) ? v : null);
const ids = (max: number): Coerce => (v) => (Array.isArray(v) ? v.slice(0, max).filter((x) => typeof x === "number") : null);
const nums = (max: number): Coerce => (v) => (Array.isArray(v) ? v.slice(0, max).filter((x) => typeof x === "number") : null);

const SCHEMA: Record<string, Coerce> = {
  mode: (v) => (typeof v === "string" && MODES.includes(v) ? v : "unknown"),
  format: oneOf(FORMATS),
  scenarioId: str(120),
  anonId: str(64),
  chosenHero: num,
  chosenP: num,
  bestHero: num,
  bestP: num,
  actualPick: num,
  regretPP: num,
  elapsedMs: num,
  botPersonality: str(32),
  botPicks: ids(5),
  draftPicks: ids(5),
  bans: ids(14),
  perPickRegret: nums(5),
  // Firestore rejects nested arrays outright — storing [heroId, p] tuples
  // silently failed every write until it was caught — so these are objects.
  candidateTop: (v) =>
    Array.isArray(v)
      ? v.slice(0, 10).map((c: unknown) => (Array.isArray(c) ? { h: c[0], p: c[1] } : c))
      : [],
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { scenarioId, anonId, chosenHero } = body;

    if (typeof scenarioId !== "string" || typeof chosenHero !== "number" || typeof anonId !== "string") {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const doc: Record<string, unknown> = {};
    for (const [key, coerce] of Object.entries(SCHEMA)) doc[key] = coerce(body[key]);

    // Keep anything new the client sends rather than dropping it on the floor.
    for (const [key, value] of Object.entries(body)) {
      if (key in SCHEMA) continue;
      if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
        doc[`x_${key}`] = typeof value === "string" ? value.slice(0, 200) : value;
      }
    }

    await adminDb.collection("draftlabResponses").add({
      ...doc,
      modelVersion: "v0",
      createdAt: new Date(),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    // Never let logging break the game loop.
    console.error("[draftlab] response log failed:", e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

/** Aggregate pick distribution for a scenario — "what did everyone else pick". */
export async function GET(req: NextRequest) {
  try {
    const scenarioId = req.nextUrl.searchParams.get("scenarioId");
    if (!scenarioId) return NextResponse.json({ error: "scenarioId required" }, { status: 400 });

    const snap = await adminDb
      .collection("draftlabResponses")
      .where("scenarioId", "==", scenarioId)
      .limit(1000)
      .get();

    const counts: Record<string, number> = {};
    snap.forEach((d) => {
      const h = d.data().chosenHero;
      if (typeof h === "number") counts[h] = (counts[h] || 0) + 1;
    });

    return NextResponse.json({ total: snap.size, counts });
  } catch (e) {
    console.error("[draftlab] distribution fetch failed:", e);
    return NextResponse.json({ total: 0, counts: {} });
  }
}
