import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

  try {
    const userDoc = await adminDb.collection("users").doc(uid).get();
    if (!userDoc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const d = userDoc.data()!;
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
    });
  } catch (e) {
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}
