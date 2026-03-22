import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";

/**
 * GET /api/auth/discord-login-callback
 *
 * Handles Discord OAuth callback for the SIGN IN flow.
 * 
 * Flow:
 * 1. Exchange code for access token
 * 2. Fetch Discord user profile
 * 3. Check if a Firestore user with this discordId already exists
 *    - If yes: sign them in (create custom token for that uid)
 *    - If no: create a new Firebase Auth user + Firestore doc
 * 4. Auto-join Discord server
 * 5. Redirect to /auth/discord-success?token=XXX
 *
 * This is separate from /api/auth/discord-callback which LINKS Discord
 * to an existing authenticated user.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const realm = process.env.NEXT_PUBLIC_APP_URL!;

  if (!code || state !== "discord_login") {
    return NextResponse.redirect(`${realm}/?error=discord_failed`);
  }

  try {
    // ── 1. Exchange code for access token ────────────────────────────────
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${realm}/api/auth/discord-login-callback`,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error("Discord token exchange failed:", JSON.stringify(tokenData));
      throw new Error("No access token from Discord");
    }

    // ── 2. Fetch Discord user profile ────────────────────────────────────
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const discordUser = await userRes.json();
    if (!discordUser.id) throw new Error("No Discord user ID");

    const discordAvatar = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null;

    // ── 3. Find or create Firebase user ──────────────────────────────────
    let firebaseUid: string;

    // Check if user with this discordId already exists
    const existingQuery = await adminDb.collection("users")
      .where("discordId", "==", discordUser.id)
      .limit(1)
      .get();

    if (!existingQuery.empty) {
      // Existing user — sign them in
      firebaseUid = existingQuery.docs[0].id;
      
      // Update Discord profile data (username/avatar may have changed)
      await adminDb.collection("users").doc(firebaseUid).update({
        discordUsername: discordUser.username,
        discordAvatar,
      });
    } else {
      // New user — create Firebase Auth entry + Firestore doc
      const newUid = `discord_${discordUser.id}`;

      const firebaseUser = await adminAuth.createUser({
        uid: newUid,
        displayName: discordUser.username,
        photoURL: discordAvatar || undefined,
      }).catch(async (err) => {
        // May already exist if they tried before
        console.warn("createUser failed (may exist):", err.message);
        return adminAuth.getUser(newUid);
      });

      firebaseUid = firebaseUser.uid;

      await adminDb.collection("users").doc(firebaseUid).set({
        discordId: discordUser.id,
        discordUsername: discordUser.username,
        discordAvatar,
        discordConnectedAt: new Date(),
        createdAt: new Date(),
        // No Steam data — user signed in via Discord only
        steamId: null,
        steamName: null,
        steamAvatar: null,
        phone: null,
        dotaRankTier: null,
        dotaBracket: null,
        dotaMMR: null,
        smurfRiskScore: 0,
      }, { merge: true }); // merge:true so we don't overwrite if doc exists
    }

    // ── 4. Auto-join Discord server ──────────────────────────────────────
    try {
      await fetch(`https://discord.com/api/guilds/${process.env.DISCORD_SERVER_ID}/members/${discordUser.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ access_token: tokenData.access_token }),
      });
    } catch (joinErr) {
      // Non-blocking — don't fail login if server join fails
      console.warn("Discord server auto-join failed (non-blocking):", joinErr);
    }

    // ── 5. Create custom token and redirect ──────────────────────────────
    const customToken = await adminAuth.createCustomToken(firebaseUid);

    return NextResponse.redirect(`${realm}/auth/discord-success?token=${customToken}`);
  } catch (e: any) {
    console.error("Discord login callback error:", e.message);
    return NextResponse.redirect(`${realm}/?error=discord_failed`);
  }
}