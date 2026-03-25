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
        phone: d.phone || null,
        // Riot
        riotGameName: d.riotGameName || null,
        riotTagLine: d.riotTagLine || null,
        riotRank: d.riotRank || null,
        riotTier: d.riotTier || null,
        riotVerified: d.riotVerified || null,
        riotAvatar: d.riotAvatar || null,
        // Steam
        steamId: d.steamId || null,
        steamName: d.steamName || null,
        // Discord
        discordId: d.discordId || null,
        discordUsername: d.discordUsername || null,
        // Tournaments
        registeredValorantTournaments: d.registeredValorantTournaments || [],
        registeredTournaments: d.registeredTournaments || [],
        // Meta
        createdAt: d.createdAt?.toDate?.()?.toISOString?.() || d.createdAt || null,
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