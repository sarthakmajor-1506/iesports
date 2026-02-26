import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get("uid");

  if (!uid) return NextResponse.json({ error: "Missing uid" }, { status: 400 });

  const cookieStore = await cookies();
  cookieStore.set("firebase_uid", uid, {
    httpOnly: true,
    maxAge: 60 * 5,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/discord-callback`,
    response_type: "code",
    scope: "identify guilds.join",
  });

  return NextResponse.redirect(`https://discord.com/oauth2/authorize?${params}`);
}