import { NextRequest, NextResponse } from "next/server";
import openid from "openid";
import axios from "axios";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  const realm = process.env.NEXT_PUBLIC_APP_URL!;
  const returnUrl = `${realm}/api/auth/steam-callback`;

  const firebaseUid = req.cookies.get("firebase_uid")?.value;
  if (!firebaseUid) {
    return NextResponse.json({ error: "No Firebase UID in cookie" }, { status: 400 });
  }

  const relyingParty = new openid.RelyingParty(returnUrl, realm, true, true, []);

  return new Promise<NextResponse>((resolve) => {
    relyingParty.verifyAssertion(req.url, async (err, result) => {
      if (err || !result?.authenticated) {
        resolve(NextResponse.json({ error: "Verification failed" }, { status: 401 }));
        return;
      }

      const steamId = result.claimedIdentifier?.replace(
        "https://steamcommunity.com/openid/id/", ""
      );
      if (!steamId) {
        resolve(NextResponse.json({ error: "No Steam ID" }, { status: 400 }));
        return;
      }

      try {
        // Check 1: Steam ID not already linked to another user
        const steamQuery = await adminDb.collection("users")
          .where("steamId", "==", steamId).get();
        if (!steamQuery.empty) {
          const existing = steamQuery.docs[0];
          if (existing.id !== firebaseUid) {
            const res = NextResponse.redirect(`${realm}/dashboard?steam=already_taken`);
            res.cookies.delete("firebase_uid");
            resolve(res);
            return;
          }
        }

        // Check 2: User doesn't already have a different Steam ID
        const userDoc = await adminDb.collection("users").doc(firebaseUid).get();
        if (userDoc.exists) {
          const existingData = userDoc.data();
          if (existingData?.steamId && existingData.steamId !== steamId) {
            const res = NextResponse.redirect(`${realm}/dashboard?steam=already_linked`);
            res.cookies.delete("firebase_uid");
            resolve(res);
            return;
          }
        }

        // Fetch Steam profile
        const steamRes = await axios.get(
          `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${process.env.STEAM_API_KEY}&steamids=${steamId}`
        );
        const profile = steamRes.data.response.players[0];

        // Save to Firestore
        await adminDb.collection("users").doc(firebaseUid).update({
          steamId,
          steamName: profile.personaname,
          steamAvatar: profile.avatarfull,
          steamLinkedAt: new Date(),
        });

        const res = NextResponse.redirect(`${realm}/connect-steam?steam=linked`);
        res.cookies.delete("firebase_uid");
        resolve(res);
      } catch (e) {
        resolve(NextResponse.json({ error: "Failed to save Steam data" }, { status: 500 }));
      }
    });
  });
}