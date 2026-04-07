// /app/api/auth/steam-callback/route.ts

import { NextRequest, NextResponse } from "next/server";
import openid from "openid";
import axios from "axios";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";
import { fetchAndSyncPlayer } from "@/lib/fetchAndSyncPlayer";

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

        // ── Fetch rank + matches immediately on Steam link ──────────
        try {
          await fetchAndSyncPlayer({
            uid: firebaseUid,
            steamId,
            db: adminDb,
          });
        } catch (syncErr: any) {
          // Non-blocking — don't fail the login if OpenDota is down
          console.error("OpenDota sync failed (non-blocking):", syncErr.message);
        }

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