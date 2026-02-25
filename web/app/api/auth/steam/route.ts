import { NextRequest, NextResponse } from "next/server";
import openid from "openid";

export async function GET(req: NextRequest) {
  const realm = process.env.NEXT_PUBLIC_APP_URL!;
  const returnUrl = `${realm}/api/auth/steam-callback`;

  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "No UID" }, { status: 400 });

  const relyingParty = new openid.RelyingParty(returnUrl, realm, true, true, []);

  return new Promise<NextResponse>((resolve) => {
    relyingParty.authenticate(
      "https://steamcommunity.com/openid",
      false,
      (err, authUrl) => {
        if (err || !authUrl) {
          resolve(NextResponse.json({ error: "Steam auth failed" }, { status: 500 }));
        } else {
          const res = NextResponse.redirect(authUrl);
          res.cookies.set("firebase_uid", uid, { httpOnly: true, maxAge: 300 });
          resolve(res);
        }
      }
    );
  });
}