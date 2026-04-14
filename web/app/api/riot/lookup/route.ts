import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/riot/lookup
 *
 * Body: { riotId: "GameName#TAG", region?: "ap", uid?: string }
 *
 * Calls the interim Valorant rank API to fetch:
 *   1. Account data (name, tag, avatar, level, puuid)
 *   2. MMR/rank data (current tier, rank name)
 *
 * Returns combined player card data for the connect-riot page.
 *
 * Auth: Authorization header with raw API key (no Bearer prefix)
 * Alt auth: ?api_key= query param
 * Region default: "ap" (Asia Pacific — covers India/SEA)
 */

const HENRIK_BASE = "https://api.henrikdev.xyz/valorant";

function henrikFetch(path: string): Promise<Response> {
  const apiKey = process.env.HENRIK_API_KEY || "";
  // Accepts auth via Authorization header (raw key, NOT Bearer)
  // AND via ?api_key= query param. We use both for maximum compatibility.
  const separator = path.includes("?") ? "&" : "?";
  const url = apiKey ? `${HENRIK_BASE}${path}${separator}api_key=${apiKey}` : `${HENRIK_BASE}${path}`;

  return fetch(url, {
    headers: {
      "Accept": "application/json",
      ...(apiKey ? { "Authorization": apiKey } : {}),
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { riotId, region = "ap", uid } = body;

    if (!riotId || typeof riotId !== "string") {
      return NextResponse.json({ error: "Missing riotId" }, { status: 400 });
    }

    // Parse "GameName#TAG" format
    const hashIndex = riotId.lastIndexOf("#");
    if (hashIndex === -1 || hashIndex === 0 || hashIndex === riotId.length - 1) {
      return NextResponse.json(
        { error: "Invalid format. Use GameName#TAG (e.g. Player#1234)" },
        { status: 400 }
      );
    }

    const gameName = riotId.substring(0, hashIndex).trim();
    const tagLine = riotId.substring(hashIndex + 1).trim();

    if (!gameName || !tagLine) {
      return NextResponse.json(
        { error: "Invalid format. Use GameName#TAG (e.g. Player#1234)" },
        { status: 400 }
      );
    }

    const encodedName = encodeURIComponent(gameName);
    const encodedTag = encodeURIComponent(tagLine);

    // ── 1. Fetch account data ────────────────────────────────────────────
    // Using v1 endpoint: /valorant/v1/account/{name}/{tag}
    const accountRes = await henrikFetch(`/v1/account/${encodedName}/${encodedTag}`);

    if (accountRes.status === 404) {
      return NextResponse.json(
        { error: `Player "${gameName}#${tagLine}" not found. Check spelling and tag.` },
        { status: 404 }
      );
    }

    if (accountRes.status === 429) {
      return NextResponse.json(
        { error: "Rate limited by Riot API. Please try again in a minute." },
        { status: 429 }
      );
    }

    if (!accountRes.ok) {
      const errText = await accountRes.text().catch(() => "Unknown error");
      console.error("Riot account lookup error:", accountRes.status, errText);
      return NextResponse.json(
        { error: "Failed to look up player. Try again." },
        { status: 502 }
      );
    }

    const accountJson = await accountRes.json();
    const account = accountJson.data;

    if (!account) {
      return NextResponse.json(
        { error: `Player "${gameName}#${tagLine}" not found.` },
        { status: 404 }
      );
    }

    // ── 1b. Uniqueness check — ensure puuid isn't linked to another account ──
    if (uid && account.puuid) {
      const existing = await adminDb.collection("users")
        .where("riotPuuid", "==", account.puuid)
        .limit(1)
        .get();
      if (!existing.empty && existing.docs[0].id !== uid) {
        return NextResponse.json({
          error: "This Riot ID is already linked to another iEsports account. Each Riot ID can only be used once."
        }, { status: 409 });
      }
    }

    // ── 2. Fetch MMR/rank data ───────────────────────────────────────────
    // Using v2 endpoint: /valorant/v2/mmr/{region}/{name}/{tag}
    let rank = "Unranked";
    let tier = 0;

    try {
      const mmrRes = await henrikFetch(`/v2/mmr/${region}/${encodedName}/${encodedTag}`);

      if (mmrRes.ok) {
        const mmrJson = await mmrRes.json();
        const mmrData = mmrJson.data;

        if (mmrData?.current_data?.currenttierpatched) {
          rank = mmrData.current_data.currenttierpatched;   // e.g. "Diamond 3"
          tier = mmrData.current_data.currenttier || 0;     // e.g. 20
        }
      } else {
        // MMR fetch failed — player might have no ranked data
        // This is non-blocking, we still return the account info
        console.warn("MMR lookup returned:", mmrRes.status, "— defaulting to Unranked");
      }
    } catch (mmrErr) {
      // Non-blocking — rank data is optional
      console.warn("MMR fetch failed (non-blocking):", mmrErr);
    }

    // ── 3. Return combined player card ───────────────────────────────────
    return NextResponse.json({
      gameName: account.name,
      tagLine: account.tag,
      region: account.region || region,
      accountLevel: account.account_level || 0,
      avatar: account.card?.small || account.card?.large || "",
      puuid: account.puuid || "",
      rank,       // e.g. "Diamond 3" or "Unranked"
      tier,       // e.g. 20 (currenttier integer)
    });
  } catch (e: any) {
    console.error("Riot lookup error:", e.message);
    return NextResponse.json(
      { error: "Server error. Please try again." },
      { status: 500 }
    );
  }
}