import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/admin/save-shuffle-video
 *
 * Persists the Firebase Storage URL of a rendered shuffle-reveal MP4 onto the
 * Valorant tournament doc. The admin renders the video once in the browser
 * (via ShuffleVideoPlayer), uploads the blob to Storage, then calls this route
 * so future downloads can fetch the cached URL instead of re-rendering.
 *
 * Body: {
 *   adminKey: string,
 *   tournamentId: string,
 *   videoUrl: string,
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { adminKey, tournamentId, videoUrl } = await req.json();

    if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!tournamentId || !videoUrl) {
      return NextResponse.json({ error: "Missing tournamentId or videoUrl" }, { status: 400 });
    }
    if (typeof videoUrl !== "string" || !videoUrl.startsWith("https://")) {
      return NextResponse.json({ error: "videoUrl must be a https URL" }, { status: 400 });
    }

    const tournRef = adminDb.collection("valorantTournaments").doc(tournamentId);
    const tournDoc = await tournRef.get();
    if (!tournDoc.exists) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    await tournRef.update({
      shuffleVideoUrl: videoUrl,
      shuffleVideoUpdatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("save-shuffle-video error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
