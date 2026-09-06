import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * Draft — what is actually happening right now.
 *
 * The home screen wants a live counter, and the only version of that worth
 * shipping is a true one. These are real aggregate counts: rooms whose status is
 * `drafting` at this instant, and drafts finished since midnight. A hardcoded
 * "1,247 drafts happening now" is a fabricated record, and the first person to
 * open two tabs and see it not move learns the whole product's numbers are
 * decoration — including the win probabilities, which are the actual thing being
 * sold here.
 *
 * `count()` is a server-side aggregation, so this reads no documents and stays
 * cheap enough to poll.
 */

export const revalidate = 0;

export async function GET() {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  try {
    const [live, today] = await Promise.all([
      adminDb.collection("draftlabRooms").where("status", "==", "drafting").count().get(),
      adminDb.collection("draftlabResponses").where("createdAt", ">=", midnight).count().get(),
    ]);
    return NextResponse.json({
      live: live.data().count,
      today: today.data().count,
    });
  } catch (e) {
    // A counter is decoration; it must never be the reason the menu fails to
    // render. The client treats nulls as "say nothing".
    console.error("[draftlab] pulse failed:", e);
    return NextResponse.json({ live: null, today: null });
  }
}
