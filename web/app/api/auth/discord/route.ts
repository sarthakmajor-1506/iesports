import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get("uid");

  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/discord-callback`,
    response_type: "code",
    scope: "identify guilds.join",
    state: uid,  // ← pass uid as state, no cookie needed
  });

  return NextResponse.redirect(`https://discord.com/oauth2/authorize?${params}`);
}