import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/discord-login-callback`;

  // Where to land the player once Discord hands control back. Carried in
  // `state` (round-trips through Discord's server) rather than sessionStorage,
  // which does not survive a new tab or an app hand-off. Only same-origin
  // relative paths are accepted — anything else collapses to "/".
  const rawNext = req.nextUrl.searchParams.get("returnTo") || "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify guilds.join connections",
    state: `discord_login:${encodeURIComponent(next)}`,
  });

  const url = `https://discord.com/oauth2/authorize?${params}`;

  if (req.nextUrl.searchParams.get("redirect") === "false") {
    return NextResponse.json({ url });
  }
  return NextResponse.redirect(url);
}