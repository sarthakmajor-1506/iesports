import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const rawState = searchParams.get("state") || "";
  const colonIdx = rawState.indexOf(":");
  const uid = colonIdx > -1 ? rawState.slice(0, colonIdx) : rawState;
  const returnTo = colonIdx > -1 ? rawState.slice(colonIdx + 1) : "";

  if (!code || !uid) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/valorant?discord=error`);
  }

  const successRedirect = returnTo
    ? `${process.env.NEXT_PUBLIC_APP_URL}${returnTo}?discord=linked`
    : `${process.env.NEXT_PUBLIC_APP_URL}/valorant?discord=linked`;

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/discord-callback`,
      }),
    });

    const tokenData = await tokenRes.json();
    console.log("RAW DISCORD RESPONSE:", JSON.stringify(tokenData));
    console.log("REDIRECT URI:", `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/discord-callback`);
    console.log("CLIENT ID:", process.env.DISCORD_CLIENT_ID);
    console.log("CLIENT SECRET exists:", !!process.env.DISCORD_CLIENT_SECRET);
    if (!tokenData.access_token) throw new Error("No access token");

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const discordUser = await userRes.json();
    if (!discordUser.id) throw new Error("No Discord user ID");

    // Auto-join Discord server
    await fetch(`https://discord.com/api/guilds/${process.env.DISCORD_SERVER_ID}/members/${discordUser.id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ access_token: tokenData.access_token }),
    });

    // Uniqueness check — ensure discordId isn't linked to another account
    const existingDiscord = await adminDb.collection("users")
      .where("discordId", "==", discordUser.id)
      .limit(1)
      .get();
    if (!existingDiscord.empty && existingDiscord.docs[0].id !== uid) {
      const alreadyLinkedRedirect = returnTo
        ? `${process.env.NEXT_PUBLIC_APP_URL}${returnTo}?discord=already_linked`
        : `${process.env.NEXT_PUBLIC_APP_URL}/valorant?discord=already_linked`;
      return NextResponse.redirect(alreadyLinkedRedirect);
    }

    // Fetch Discord connected accounts (Steam, Riot, Twitch, etc.)
    let discordConnections: { type: string; name: string; id: string; verified: boolean }[] = [];
    try {
      const connRes = await fetch("https://discord.com/api/users/@me/connections", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (connRes.ok) {
        const rawConns = await connRes.json();
        discordConnections = (rawConns || []).map((c: any) => ({
          type: c.type,
          name: c.name,
          id: c.id,
          verified: !!c.verified,
        }));
      }
    } catch {}

    // Save to Firestore
    await adminDb.collection("users").doc(uid).set({
      discordId: discordUser.id,
      discordUsername: discordUser.username,
      discordAvatar: discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : null,
      discordConnectedAt: new Date(),
      ...(discordConnections.length > 0 ? { discordConnections } : {}),
    }, { merge: true });

    return NextResponse.redirect(successRedirect);
  } catch (e: any) {
    console.error("Discord callback error:", e.message);
    const errorRedirect = returnTo
      ? `${process.env.NEXT_PUBLIC_APP_URL}${returnTo}?discord=error`
      : `${process.env.NEXT_PUBLIC_APP_URL}/valorant?discord=error`;
    return NextResponse.redirect(errorRedirect);
  }
}