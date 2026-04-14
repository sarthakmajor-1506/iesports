// /app/api/auth/steam-callback/route.ts

import { NextRequest, NextResponse } from "next/server";
import openid from "openid";
import axios from "axios";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  const realm = process.env.NEXT_PUBLIC_APP_URL!;
  const linkUid = req.nextUrl.searchParams.get("linkUid") || "";
  const returnUrl = linkUid
    ? `${realm}/api/auth/steam-callback?linkUid=${encodeURIComponent(linkUid)}`
    : `${realm}/api/auth/steam-callback`;

  const relyingParty = new openid.RelyingParty(returnUrl, realm, true, true, []);

  return new Promise<NextResponse>((resolve) => {
    relyingParty.verifyAssertion(req.url, async (err, result) => {
      if (err || !result?.authenticated) {
        console.error("OpenID verification failed:", err);
        resolve(NextResponse.json({ error: "Verification failed" }, { status: 401 }));
        return;
      }

      const steamId = result.claimedIdentifier?.replace(
        "https://steamcommunity.com/openid/id/",
        ""
      );
      if (!steamId) {
        resolve(NextResponse.json({ error: "No Steam ID" }, { status: 400 }));
        return;
      }

      try {
        // Fetch Steam profile
        const steamRes = await axios.get(
          `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${process.env.STEAM_API_KEY}&steamids=${steamId}`
        );
        const profile = steamRes.data.response.players[0];

        let firebaseUid: string;

        if (linkUid) {
          // ── Linking Steam to an existing user (e.g. Discord-login user) ──
          // Check if this Steam ID is already linked to another account
          const existingSteam = await adminDb.collection("users")
            .where("steamId", "==", steamId)
            .limit(1)
            .get();
          if (!existingSteam.empty && existingSteam.docs[0].id !== linkUid) {
            const ownerName = existingSteam.docs[0].data().discordUsername || existingSteam.docs[0].data().riotGameName || "another user";
            resolve(NextResponse.redirect(`${realm}/connect-steam?error=${encodeURIComponent(`This Steam account is already linked to ${ownerName}. Each Steam account can only be used once.`)}`));
            return;
          }
          firebaseUid = linkUid;
          await adminDb.collection("users").doc(firebaseUid).set({
            steamId,
            steamName: profile.personaname,
            steamAvatar: profile.avatarfull,
            steamLinkedAt: new Date(),
          }, { merge: true });
        } else {
          // ── Standalone Steam login (no existing user) ──
          const existingQuery = await adminDb
            .collection("users")
            .where("steamId", "==", steamId)
            .limit(1)
            .get();

          if (!existingQuery.empty) {
            firebaseUid = existingQuery.docs[0].id;
            await adminDb.collection("users").doc(firebaseUid).update({
              steamName: profile.personaname,
              steamAvatar: profile.avatarfull,
            });
          } else {
            const firebaseUser = await adminAuth
              .createUser({
                uid: `steam_${steamId}`,
                displayName: profile.personaname,
                photoURL: profile.avatarfull,
              })
              .catch(async () => adminAuth.getUser(`steam_${steamId}`));

            firebaseUid = firebaseUser.uid;

            await adminDb.collection("users").doc(firebaseUid).set({
              steamId,
              steamName: profile.personaname,
              steamAvatar: profile.avatarfull,
              steamLinkedAt: new Date(),
              createdAt: new Date(),
              phone: null,
              dotaRankTier: null,
              dotaBracket: null,
              dotaMMR: null,
              smurfRiskScore: 0,
            });
          }
        }

        // OpenDota rank + match sync is NOT run here. It's slow (30-120s on
        // OpenDota's free tier) and would block the Steam login. The client
        // fires POST /api/dota/sync from the steam-success page once the
        // custom token signs in — that way the user sees their profile
        // immediately and rank data fills in asynchronously.

        const customToken = await adminAuth.createCustomToken(firebaseUid);
        resolve(NextResponse.redirect(`${realm}/auth/steam-success?token=${customToken}`));
      } catch (e: any) {
        console.error("Steam callback error:", e.message);
        resolve(
          NextResponse.json({ error: "Failed to complete Steam login", detail: e.message }, { status: 500 })
        );
      }
    });
  });
}