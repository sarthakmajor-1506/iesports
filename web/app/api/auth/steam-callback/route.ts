import { NextRequest, NextResponse } from "next/server";
import openid from "openid";
import axios from "axios";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  const realm = process.env.NEXT_PUBLIC_APP_URL!;
  const returnUrl = `${realm}/api/auth/steam-callback`;

  const relyingParty = new openid.RelyingParty(returnUrl, realm, true, true, []);

  return new Promise<NextResponse>((resolve) => {
    relyingParty.verifyAssertion(req.url, async (err, result) => {
      if (err || !result?.authenticated) {
        console.error("❌ OpenID verification failed:", err);
        resolve(NextResponse.json({ error: "Verification failed", detail: String(err) }, { status: 401 }));
        return;
      }

      const steamId = result.claimedIdentifier?.replace(
        "https://steamcommunity.com/openid/id/", ""
      );
      if (!steamId) {
        resolve(NextResponse.json({ error: "No Steam ID" }, { status: 400 }));
        return;
      }

      console.log("✅ Steam ID verified:", steamId);

      try {
        // Step 1: Fetch Steam profile
        console.log("🔍 Fetching Steam profile...");
        const steamRes = await axios.get(
          `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${process.env.STEAM_API_KEY}&steamids=${steamId}`
        );
        const profile = steamRes.data.response.players[0];
        console.log("✅ Steam profile:", profile?.personaname);

        // Step 2: Check Firestore for existing user
        console.log("🔍 Checking Firestore for existing user...");
        const existingQuery = await adminDb.collection("users")
          .where("steamId", "==", steamId).limit(1).get();

        let firebaseUid: string;

        if (!existingQuery.empty) {
          firebaseUid = existingQuery.docs[0].id;
          console.log("✅ Existing user found:", firebaseUid);
          await adminDb.collection("users").doc(firebaseUid).update({
            steamName: profile.personaname,
            steamAvatar: profile.avatarfull,
          });
        } else {
          console.log("🆕 New user, creating Firebase Auth entry...");
          const firebaseUser = await adminAuth.createUser({
            uid: `steam_${steamId}`,
            displayName: profile.personaname,
            photoURL: profile.avatarfull,
          }).catch(async (createErr) => {
            console.log("⚠️ createUser failed (may already exist):", createErr.message);
            return adminAuth.getUser(`steam_${steamId}`);
          });

          firebaseUid = firebaseUser.uid;
          console.log("✅ Firebase UID:", firebaseUid);

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
          console.log("✅ Firestore doc created");
        }

        // Step 3: Create custom token
        console.log("🔑 Creating custom token...");
        const customToken = await adminAuth.createCustomToken(firebaseUid);
        console.log("✅ Custom token created, redirecting...");

        resolve(NextResponse.redirect(`${realm}/auth/steam-success?token=${customToken}`));
      } catch (e: any) {
        console.error("❌ Steam callback error:", e.message);
        console.error("❌ Full error:", JSON.stringify(e, Object.getOwnPropertyNames(e)));
        resolve(NextResponse.json({
          error: "Failed to complete Steam login",
          detail: e.message,
        }, { status: 500 }));
      }
    });
  });
}