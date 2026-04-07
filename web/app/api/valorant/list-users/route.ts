import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/valorant/list-users
 *
 * Returns all users from the root `users` collection with their linked accounts status.
 * Used by the admin Player Registry tab.
 */
export async function POST(req: NextRequest) {
  try {
    const { adminKey } = await req.json();

    if (!adminKey) {
      return NextResponse.json({ error: "Missing admin key" }, { status: 400 });
    }
    if (adminKey !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const usersSnap = await adminDb.collection("users").get();

    const users = usersSnap.docs.map(doc => {
      const d = doc.data();
      return {
        uid: doc.id,
        // Identity
        fullName: d.fullName || null,
        phone: d.phone || null,
        // Riot
        riotGameName: d.riotGameName || null,
        riotTagLine: d.riotTagLine || null,
        riotRank: d.riotRank || null,
        riotTier: d.riotTier || null,
        riotPuuid: d.riotPuuid || null,
        riotRegion: d.riotRegion || null,
        riotAccountLevel: d.riotAccountLevel || null,
        riotVerified: d.riotVerified || null,
        riotVerificationNote: d.riotVerificationNote || null,
        riotAvatar: d.riotAvatar || null,
        riotScreenshotUrl: d.riotScreenshotUrl || null,
        riotLinkedAt: d.riotLinkedAt?.toDate?.()?.toISOString?.() || d.riotLinkedAt || null,
        // Steam
        steamId: d.steamId || null,
        steamName: d.steamName || null,
        steamAvatar: d.steamAvatar || null,
        steamLinkedAt: d.steamLinkedAt?.toDate?.()?.toISOString?.() || d.steamLinkedAt || null,
        // Dota
        dotaRankTier: d.dotaRankTier || null,
        dotaBracket: d.dotaBracket || null,
        dotaMMR: d.dotaMMR || null,
        // Discord
        discordId: d.discordId || null,
        discordUsername: d.discordUsername || null,
        discordAvatar: d.discordAvatar || null,
        discordConnectedAt: d.discordConnectedAt?.toDate?.()?.toISOString?.() || d.discordConnectedAt || null,
        // Tournaments
        registeredValorantTournaments: d.registeredValorantTournaments || [],
        registeredTournaments: d.registeredTournaments || [],
        registeredSoloTournaments: d.registeredSoloTournaments || [],
        // Meta
        createdAt: d.createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
        upiId: d.upiId || null,
      };
    });

    return NextResponse.json({
      success: true,
      count: users.length,
      users,
    });
  } catch (e: any) {
    console.error("List users error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}