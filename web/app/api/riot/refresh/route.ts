import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/riot/refresh
 *
 * Re-fetches name/tag/rank/avatar for the user's EXISTING Riot account (same PUUID).
 * Use when a player changed their Riot name/tag but it's the same account.
 * No re-verification needed.
 */
export async function POST(req: NextRequest) {
  try {
    const { uid } = await req.json();
    if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

    const userDoc = await adminDb.collection("users").doc(uid).get();
    if (!userDoc.exists) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const userData = userDoc.data()!;
    if (!userData.riotPuuid) {
      return NextResponse.json({ error: "No Riot ID linked" }, { status: 400 });
    }

    const henrikKey = process.env.HENRIK_API_KEY || "";

    // Fetch account data by PUUID (most reliable — doesn't depend on name/tag)
    let gameName = userData.riotGameName;
    let tagLine = userData.riotTagLine;
    let avatar = userData.riotAvatar;
    let accountLevel = userData.riotAccountLevel || 0;
    let region = userData.riotRegion || "ap";

    // Try PUUID-based lookup first
    const acctRes = await fetch(
      `https://api.henrikdev.xyz/valorant/v1/by-puuid/account/${userData.riotPuuid}?api_key=${henrikKey}`,
      { headers: { "Authorization": henrikKey } }
    );

    if (acctRes.ok) {
      const acctData = await acctRes.json();
      const d = acctData.data;
      gameName = d.name || gameName;
      tagLine = d.tag || tagLine;
      avatar = d.card?.small || d.card?.large || avatar;
      accountLevel = d.account_level || accountLevel;
      region = d.region || region;
    }

    // Fetch updated rank
    let rank = userData.riotRank || "Unranked";
    let tier = userData.riotTier || 0;

    const mmrRes = await fetch(
      `https://api.henrikdev.xyz/valorant/v2/mmr/${region}/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}?api_key=${henrikKey}`,
      { headers: { "Authorization": henrikKey } }
    );

    if (mmrRes.ok) {
      const mmrData = await mmrRes.json();
      rank = mmrData.data?.current_data?.currenttierpatched || rank;
      tier = mmrData.data?.current_data?.currenttier || tier;
    }

    // Update user doc
    await adminDb.collection("users").doc(uid).update({
      riotGameName: gameName,
      riotTagLine: tagLine,
      riotAvatar: avatar,
      riotRank: rank,
      riotTier: tier,
      riotRegion: region,
      riotAccountLevel: accountLevel,
      riotRefreshedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      gameName,
      tagLine,
      avatar,
      rank,
      tier,
      region,
      accountLevel,
    });
  } catch (e: any) {
    console.error("Riot refresh error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
