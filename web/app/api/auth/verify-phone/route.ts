// /app/api/auth/verify-phone/route.ts
// Optional phone verification — called after Steam login
// User is already authenticated. This just adds phone to their profile.
// Uses Firebase Admin to update Firestore (phone + phoneVerified flag).

import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const { idToken, phone } = await req.json();

    if (!idToken || !phone) {
      return NextResponse.json({ error: "Missing idToken or phone" }, { status: 400 });
    }

    // Verify the Firebase ID token to get the UID
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    // Save phone to Firestore user profile
    await adminDb.doc(`users/${uid}`).update({
      phone,
      phoneVerified: true,
      phoneVerifiedAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Phone verification error:", err);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}