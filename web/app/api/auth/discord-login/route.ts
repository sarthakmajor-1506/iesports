import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/discord-login-callback`;

  // Where to land the player once Discord hands control back. Carried in
  // `state` (round-trips through Discord's server) rather than sessionStorage,
  // which does not survive a new tab or an app hand-off.
  //
  // No returnTo means the caller did not ask for one — an older cached bundle,
  // or a button that never passed it. In that case `state` carries NO
  // destination at all, so the callback stays quiet and /auth/discord-success
  // falls back to sessionStorage. Defaulting to "/" here instead would be
  // worse than doing nothing: it overrides a perfectly good sessionStorage
  // value and dumps the player on the front page.
  const rawReturnTo = req.nextUrl.searchParams.get("returnTo");
  const returnTo =
    rawReturnTo && rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//") ? rawReturnTo : null;

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify guilds.join connections",
    state: returnTo ? `discord_login:${encodeURIComponent(returnTo)}` : "discord_login",
  });

  const url = `https://discord.com/oauth2/authorize?${params}`;

  if (req.nextUrl.searchParams.get("redirect") === "false") {
    return NextResponse.json({ url });
  }
  return NextResponse.redirect(url);
}