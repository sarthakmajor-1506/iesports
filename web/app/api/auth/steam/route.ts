import { NextRequest, NextResponse } from "next/server";
import openid from "openid";

export async function GET(req: NextRequest) {
  const realm = process.env.NEXT_PUBLIC_APP_URL!;
  const returnUrl = `${realm}/api/auth/steam-callback`;

  const relyingParty = new openid.RelyingParty(returnUrl, realm, true, true, []);

  const noRedirect = req.nextUrl.searchParams.get("redirect") === "false";

  return new Promise<NextResponse>((resolve) => {
    relyingParty.authenticate(
      "https://steamcommunity.com/openid",
      false,
      (err, authUrl) => {
        if (err || !authUrl) {
          resolve(NextResponse.json({ error: "Steam auth failed" }, { status: 500 }));
        } else if (noRedirect) {
          resolve(NextResponse.json({ url: authUrl }));
        } else {
          resolve(NextResponse.redirect(authUrl));
        }
      }
    );
  });
}