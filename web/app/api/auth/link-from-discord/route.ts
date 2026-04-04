import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { adminDb } from "@/lib/firebaseAdmin";
import { fetchAndSyncPlayer } from "@/lib/fetchAndSyncPlayer";

/**
 * POST /api/auth/link-from-discord
 *
 * Links a Steam or Riot account to an existing user using data
 * discovered from their Discord connected accounts.
 *
 * Body: { uid, type: "steam" | "riot", platformId, platformName }
 *
 * Steam: Uses Steam API to fetch profile + OpenDota to fetch rank.
 * Riot:  Uses Henrik Dev API to look up rank, saves with "pending" verification.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { uid, type, platformId, platformName } = body;

    if (!uid || !type) {
      return NextResponse.json({ error: "Missing uid or type" }, { status: 400 });
    }

    // ── STEAM ────────────────────────────────────────────────────────────
    if (type === "steam") {
      const steamId = platformId;
      if (!steamId) {
        return NextResponse.json({ error: "Missing Steam ID" }, { status: 400 });
      }

      // Check if this Steam ID is already linked to another user
      const existingQuery = await adminDb
        .collection("users")
        .where("steamId", "==", steamId)
        .limit(1)
        .get();

      if (!existingQuery.empty && existingQuery.docs[0].id !== uid) {
        return NextResponse.json(
          { error: "This Steam account is already linked to another user." },
          { status: 409 }
        );
      }

      // Fetch Steam profile from Steam API
      const steamRes = await axios.get(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${process.env.STEAM_API_KEY}&steamids=${steamId}`
      );
      const players = steamRes.data?.response?.players;
      if (!players || players.length === 0) {
        return NextResponse.json(
          { error: "Could not find Steam profile. The Steam ID from Discord may be invalid." },
          { status: 404 }
        );
      }
      const profile = players[0];

      // Save to Firestore
      await adminDb.collection("users").doc(uid).set(
        {
          steamId,
          steamName: profile.personaname,
          steamAvatar: profile.avatarfull,
          steamLinkedAt: new Date(),
        },
        { merge: true }
      );

      // Fetch Dota rank + matches (non-blocking failure)
      try {
        await fetchAndSyncPlayer({ uid, steamId, db: adminDb });
      } catch {}

      return NextResponse.json({
        success: true,
        steamId,
        steamName: profile.personaname,
        steamAvatar: profile.avatarfull,
      });
    }

    // ── RIOT ─────────────────────────────────────────────────────────────
    if (type === "riot") {
      // platformName from Discord is the Riot ID (e.g. "Name#TAG")
      const riotIdFull = platformName;
      if (!riotIdFull || !riotIdFull.includes("#")) {
        return NextResponse.json(
          { error: "Invalid Riot ID format. Expected Name#TAG." },
          { status: 400 }
        );
      }

      const [gameName, tagLine] = riotIdFull.split("#");
      if (!gameName || !tagLine) {
        return NextResponse.json({ error: "Invalid Riot ID format." }, { status: 400 });
      }

      // Look up via Henrik Dev API
      const baseUrl = "https://api.henrikdev.xyz";
      const apiKey = process.env.HENRIK_API_KEY;
      const headers: Record<string, string> = {};
      if (apiKey) headers["Authorization"] = apiKey;

      // Fetch account data
      const accRes = await fetch(
        `${baseUrl}/valorant/v1/account/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}?api_key=${apiKey}`,
        { headers }
      );
      if (!accRes.ok) {
        return NextResponse.json(
          { error: "Could not find this Riot ID. It may have changed since you linked it on Discord." },
          { status: 404 }
        );
      }
      const accData = await accRes.json();
      const account = accData.data;
      if (!account?.puuid) {
        return NextResponse.json({ error: "Invalid account data from Riot API." }, { status: 404 });
      }

      // Uniqueness check
      const existingRiot = await adminDb
        .collection("users")
        .where("riotPuuid", "==", account.puuid)
        .limit(1)
        .get();

      if (!existingRiot.empty && existingRiot.docs[0].id !== uid) {
        return NextResponse.json(
          { error: "This Riot account is already linked to another user." },
          { status: 409 }
        );
      }

      // Fetch MMR data
      const region = account.region || "ap";
      let rank = "Unranked";
      let tier = 0;
      try {
        const mmrRes = await fetch(
          `${baseUrl}/valorant/v2/mmr/${region}/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}?api_key=${apiKey}`,
          { headers }
        );
        if (mmrRes.ok) {
          const mmrData = await mmrRes.json();
          const cd = mmrData.data?.current_data;
          if (cd?.currenttierpatched) {
            rank = cd.currenttierpatched;
            tier = cd.currenttier || 0;
          }
        }
      } catch {}

      const avatar = account.card?.small || account.card?.wide || "";

      // Save to Firestore
      await adminDb.collection("users").doc(uid).set(
        {
          riotGameName: account.name || gameName,
          riotTagLine: account.tag || tagLine,
          riotAvatar: avatar,
          riotRank: rank,
          riotTier: tier,
          riotPuuid: account.puuid,
          riotRegion: region,
          riotAccountLevel: account.account_level || 0,
          riotVerified: "pending",
          riotLinkedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      return NextResponse.json({
        success: true,
        riotGameName: account.name || gameName,
        riotTagLine: account.tag || tagLine,
        riotRank: rank,
        riotAvatar: avatar,
      });
    }

    return NextResponse.json({ error: "Invalid type. Must be 'steam' or 'riot'." }, { status: 400 });
  } catch (e: any) {
    console.error("link-from-discord error:", e.message);
    return NextResponse.json(
      { error: "Failed to link account. Please try connecting manually." },
      { status: 500 }
    );
  }
}
