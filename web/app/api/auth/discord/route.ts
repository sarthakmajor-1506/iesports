import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get("uid");

  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

  const returnTo = searchParams.get("returnTo") || "";
  const state = returnTo ? `${uid}:${returnTo}` : uid;

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/discord-callback`,
    response_type: "code",
    scope: "identify guilds.join",
    state,
  });

  const url = `https://discord.com/oauth2/authorize?${params}`;

  if (req.nextUrl.searchParams.get("redirect") === "false") {
    return NextResponse.json({ url });
  }
  return NextResponse.redirect(url);
}