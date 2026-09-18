import { NextResponse } from "next/server";
import { getFeaturedTournaments } from "@/lib/featuredTournaments";

/**
 * The landing page renders this data server-side now (app/page.tsx) and does
 * not call this route, but it stays as the public read of "what's on" and is
 * the same function behind both, so the two can never disagree.
 *
 * Cached at the edge: fresh for a minute, then served instantly from stale
 * while it revalidates behind the request. Nobody waits on Firestore.
 */
export const revalidate = 60;

export async function GET() {
  try {
    const data = await getFeaturedTournaments();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (e: any) {
    console.error("[API] Featured tournaments error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
