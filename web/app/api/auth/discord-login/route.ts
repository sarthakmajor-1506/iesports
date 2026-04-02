import { NextResponse } from "next/server";

export async function GET() {
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/discord-login-callback`;

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify guilds.join",
    state: "discord_login",
  });

  return NextResponse.redirect(`https://discord.com/oauth2/authorize?${params}`);
}