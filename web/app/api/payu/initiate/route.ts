import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebaseAdmin";
import { buildTxnId, buildPaymentFormFields, formatAmount, getPayuBaseUrl, getPayuConfig } from "@/lib/payu";

type Game = "dota2" | "valorant" | "cs2";

const GAME_CONFIG: Record<Game, { collection: string; subcollection: string; userArrayField: string }> = {
  dota2: { collection: "soloTournaments", subcollection: "players", userArrayField: "registeredSoloTournaments" },
  cs2: { collection: "cs2Tournaments", subcollection: "soloPlayers", userArrayField: "registeredCS2Tournaments" },
  valorant: { collection: "valorantTournaments", subcollection: "soloPlayers", userArrayField: "registeredValorantTournaments" },
};

/** Verifies the caller's Firebase ID token and returns their uid. Throws on missing/invalid token. */
async function requireUid(req: NextRequest): Promise<string> {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) throw new Error("UNAUTHORIZED");
  const decoded = await adminAuth.verifyIdToken(match[1]);
  return decoded.uid;
}

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    uid = await requireUid(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { tournamentId, game } = await req.json();
    if (!tournamentId || !game || !(game in GAME_CONFIG)) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }
    const cfg = GAME_CONFIG[game as Game];

    const userDoc = await adminDb.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (!userData.fullName) return NextResponse.json({ error: "Full name is required. Please update your profile." }, { status: 400 });
    const phone = userData.phone || userData.phoneNumber;
    if (!phone) return NextResponse.json({ error: "Phone number is required. Please log in with your phone number." }, { status: 400 });
    if (!userData.discordId) return NextResponse.json({ error: "Discord account is required. Please connect Discord first." }, { status: 400 });
    if (game === "valorant") {
      if (!userData.riotGameName || (userData.riotVerified || "unlinked") === "unlinked") {
        return NextResponse.json({ error: "Connect your Riot ID first" }, { status: 400 });
      }
    } else if (!userData.steamId) {
      return NextResponse.json({ error: "Connect your Steam account first" }, { status: 400 });
    }

    const tDoc = await adminDb.collection(cfg.collection).doc(tournamentId).get();
    if (!tDoc.exists) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    const tData = tDoc.data()!;

    if (game === "dota2") {
      const now = new Date();
      if (tData.weekEnd && now > new Date(tData.weekEnd)) {
        return NextResponse.json({ error: "Tournament has ended" }, { status: 400 });
      }
    }
    if (tData.registrationDeadline && new Date() > new Date(tData.registrationDeadline)) {
      return NextResponse.json({ error: "Registration deadline has passed" }, { status: 400 });
    }

    const entryFee = tData.entryFee || 0;
    if (entryFee <= 0) {
      return NextResponse.json({ error: "This tournament is free — use the direct registration endpoint" }, { status: 400 });
    }

    if ((tData.slotsBooked || 0) >= tData.totalSlots) {
      return NextResponse.json({ error: "Tournament is full" }, { status: 400 });
    }

    const existingReg = await adminDb.collection(cfg.collection).doc(tournamentId).collection(cfg.subcollection).doc(uid).get();
    if (existingReg.exists) {
      return NextResponse.json({ error: "You are already registered for this tournament" }, { status: 400 });
    }

    // "Already has a paid order" check keys off a COMPLETED order, not mere
    // existence — an abandoned checkout must not permanently lock a retry.
    // NOTE: this compound query needs a Firestore composite index
    // (uid ASC, tournamentId ASC, registrationCompleted ASC) — Firestore will
    // throw with a direct console link to create it on first run if missing.
    const priorOrders = await adminDb
      .collection("payuOrders")
      .where("uid", "==", uid)
      .where("tournamentId", "==", tournamentId)
      .where("registrationCompleted", "==", true)
      .limit(1)
      .get();
    if (!priorOrders.empty) {
      return NextResponse.json({ error: "You are already registered for this tournament" }, { status: 400 });
    }

    const { mode } = getPayuConfig();
    const txnid = buildTxnId("ie");
    const amount = formatAmount(entryFee);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    await adminDb.collection("payuOrders").doc(txnid).set({
      txnid,
      uid,
      tournamentId,
      game,
      amount: entryFee,
      currency: "INR",
      status: "initiated",
      mihpayid: null,
      payuStatus: null,
      registrationCompleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mode,
    });

    const fields = buildPaymentFormFields({
      txnid,
      amount,
      productinfo: `${tData.name || "iesports tournament"} entry fee`,
      firstname: userData.fullName,
      // Discord OAuth's "email" scope was only added after this integration
      // shipped — most users won't have a real one yet until they re-link.
      // The actual payment receipt is a Discord DM (see lib/payuBooking.ts),
      // not this field; it exists only because PayU's form requires it.
      email: userData.email || `${uid}@users.iesports.in`,
      phone: String(phone).replace(/\D/g, "").slice(-10),
      // PayU POSTs the browser back to surl/furl — a page.tsx can't handle
      // POST, so these point at a route.ts that redirects (GET) to the real
      // return page. See app/api/payu/return/route.ts.
      surl: `${appUrl}/api/payu/return?type=success`,
      furl: `${appUrl}/api/payu/return?type=failure`,
      udf1: tournamentId,
      udf2: game,
      udf3: uid,
    });

    return NextResponse.json({ payuUrl: getPayuBaseUrl(mode), fields });
  } catch (e: any) {
    console.error("PayU initiate error:", e.message);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
