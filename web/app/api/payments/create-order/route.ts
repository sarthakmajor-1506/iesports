import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import Razorpay from "razorpay";

// Lazy-init so the Next.js build "Collect page data" pass (which lacks
// runtime env vars) doesn't crash on `new Razorpay({key_id: "", ...})` —
// that constructor throws when key_id is empty. Defer until first request.
let _razorpay: Razorpay | null = null;
function getRazorpay(): Razorpay {
  if (_razorpay) return _razorpay;
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error("Razorpay not configured — set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET");
  }
  _razorpay = new Razorpay({ key_id, key_secret });
  return _razorpay;
}

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, uid } = await req.json();
    if (!tournamentId || !uid) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const userDoc = await adminDb.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!userData.riotGameName) {
      return NextResponse.json({ error: "Connect your Riot ID first" }, { status: 400 });
    }

    const tournamentDoc = await adminDb.collection("valorantTournaments").doc(tournamentId).get();
    const tData = tournamentDoc.data();
    if (!tData) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    if (tData.slotsBooked >= tData.totalSlots) {
      return NextResponse.json({ error: "Tournament is full" }, { status: 400 });
    }

    const existingDoc = await adminDb
      .collection("valorantTournaments")
      .doc(tournamentId)
      .collection("soloPlayers")
      .doc(uid)
      .get();

    if (existingDoc.exists) {
      return NextResponse.json({ error: "Already registered" }, { status: 400 });
    }

    const riotTier = userData.riotTier || 0;
    if (riotTier < 21) {
      return NextResponse.json({ error: "Ascendant+ rank required" }, { status: 400 });
    }

    const amountInPaise = (tData.entryFee || 600) * 100;

    const order = await getRazorpay().orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `${tournamentId}_${uid}_${Date.now()}`,
      notes: {
        tournamentId,
        uid,
        riotGameName: userData.riotGameName,
        riotTagLine: userData.riotTagLine || "",
      },
    });

    return NextResponse.json({
      orderId: order.id,
      amount: amountInPaise,
      currency: "INR",
      tournamentName: tData.name,
    });
  } catch (e: any) {
    console.error("Create order error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
