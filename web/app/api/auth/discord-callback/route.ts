import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dota2?discord=error`);
  }

  const cookieStore = await cookies();
  const uid = cookieStore.get("firebase_uid")?.value;

  if (!uid) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dota2?discord=error`);
  }

  try {
    // Exchange code for access token
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
    if (!tokenData.access_token) throw new Error("No access token");

    // Fetch Discord user profile
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const discordUser = await userRes.json();
    if (!discordUser.id) throw new Error("No Discord user ID");

    // Auto-join user to IEsports Discord server
    await fetch(`https://discord.com/api/guilds/${process.env.DISCORD_SERVER_ID}/members/${discordUser.id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ access_token: tokenData.access_token }),
    });

    // Save to Firestore
    await adminDb.collection("users").doc(uid).update({
      discordId: discordUser.id,
      discordUsername: discordUser.username,
      discordAvatar: discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
        : null,
      discordConnectedAt: new Date(),
    });

    cookieStore.delete("firebase_uid");

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dota2?discord=linked`);
  } catch (e: any) {
    console.error("Discord callback error:", e.message);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dota2?discord=error`);
  }
}