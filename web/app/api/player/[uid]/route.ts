import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

  try {
    const userDoc = await adminDb.collection("users").doc(uid).get();
    if (!userDoc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const d = userDoc.data()!;

    // Fetch rank history via admin SDK (client SDK blocked by security rules)
    const rhSnap = await adminDb.collection("users").doc(uid)
      .collection("rankHistory")
      .orderBy("timestamp", "desc")
      .limit(100)
      .get();
    const rankHistory = rhSnap.docs.map(doc => doc.data());

    return NextResponse.json({
      uid,
      fullName: d.fullName || null,
      displayName: d.displayName || null,
      riotGameName: d.riotGameName || null,
      riotTagLine: d.riotTagLine || null,
      riotAvatar: d.riotAvatar || null,
      riotRank: d.riotRank || null,
      riotTier: d.riotTier || 0,
      riotPuuid: d.riotPuuid || null,
      riotVerified: d.riotVerified || null,
      riotPeakRank: d.riotPeakRank || null,
      riotPeakTier: d.riotPeakTier || 0,
      iesportsRating: d.iesportsRating || null,
      iesportsRank: d.iesportsRank || null,
      iesportsTier: d.iesportsTier || 0,
      iesportsMatchesPlayed: d.iesportsMatchesPlayed || 0,
      discordUsername: d.discordUsername || null,
      discordId: d.discordId || null,
      steamName: d.steamName || null,
      steamId: d.steamId || null,
      steamAvatar: d.steamAvatar || null,
      phone: d.phone ? "redacted" : null,   // never expose raw phone to public
      upiId: null,                           // never expose UPI publicly
      personalPhoto: d.personalPhoto || null,
      discordConnections: d.discordConnections || [],
      registeredValorantTournaments: d.registeredValorantTournaments || [],
      rankHistory,
    });
  } catch (e) {
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}
