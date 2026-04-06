import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET() {
  try {
    // ── Dota 2: fetch from "tournaments" collection ──
    const dotaSnap = await adminDb.collection("tournaments").get();
    const dotaAll = dotaSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const dotaFeatured = dotaAll
      .filter((t: any) => t.status === "upcoming" || t.status === "active" || t.status === "ongoing")
      .sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    // ── Valorant: fetch from "valorantTournaments" collection ──
    const now = new Date();
    const valSnap = await adminDb.collection("valorantTournaments").get();
    const valAll = valSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const valIsEnded = (t: any) => t.status === "ended" || (t.endDate && now > new Date(t.endDate));
    const valFeatured = valAll
      .filter((t: any) => !t.isTestTournament && !valIsEnded(t))
      .sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    // If no active/upcoming Valorant tournament, show the most recent ended one
    let valResult = valFeatured.length > 0 ? valFeatured[0] : null;
    if (!valResult) {
      const valEnded = valAll
        .filter((t: any) => !t.isTestTournament && valIsEnded(t))
        .sort((a: any, b: any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
      if (valEnded.length > 0) valResult = valEnded[0];
    }

    // ── Completed tournaments for "Recent Results" section ──
    const dotaIsEnded = (t: any) => t.status === "ended" || t.status === "completed" || (t.endDate && now > new Date(t.endDate));
    const dotaCompleted = dotaAll
      .filter((t: any) => dotaIsEnded(t))
      .sort((a: any, b: any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    const valCompleted = valAll
      .filter((t: any) => !t.isTestTournament && valIsEnded(t))
      .sort((a: any, b: any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

    return NextResponse.json({
      dota: dotaFeatured.length > 0 ? dotaFeatured[0] : null,
      valorant: valResult,
      completedValorant: valCompleted.length > 0 ? valCompleted[0] : null,
      completedDota: dotaCompleted.length > 0 ? dotaCompleted[0] : null,
    });
  } catch (e: any) {
    console.error("[API] Featured tournaments error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}