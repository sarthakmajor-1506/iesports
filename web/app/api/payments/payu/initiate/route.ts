// Start a PayU Hosted Checkout for a paid tournament entry.
//
// Returns the form action + fields for the browser to POST. It has to be a real
// form submission — PayU's checkout is a page the user is redirected to, not an
// API you can fetch().
//
// The amount is read from the tournament document and never from the request,
// so the price cannot be chosen by the caller. It is stored on the payment
// record at this point, and the settle step compares PayU's reported amount
// against that stored value.

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import {
  payuConfig, requestHash, newTxnId, formatAmount,
  sanitizeText, sanitizeName, resolveEmail, resolvePhone,
} from "@/lib/payu";
import {
  PAID_GAMES, isPaidGame, entryFeeOf, loadTournament, paidEntryId,
  type RegistrationMode,
} from "@/lib/paidEntry";

const MODES: RegistrationMode[] = ["solo", "team_create", "team_join"];

export async function POST(req: NextRequest) {
  try {
    const { uid, game, tournamentId, mode = "solo", returnTo } = await req.json();

    // Where to send the player after PayU. Caller-supplied, so it is restricted
    // to a same-site path: a bare "/..." that is not "//host" (which a browser
    // reads as protocol-relative and would turn this into an open redirect
    // pointing at someone else's site, from a page the player trusts).
    const safeReturnTo =
      typeof returnTo === "string" && /^\/(?!\/)[^\s]*$/.test(returnTo) && returnTo.length <= 300
        ? returnTo
        : null;

    if (!uid || !game || !tournamentId) {
      return NextResponse.json({ error: "Missing uid, game or tournamentId" }, { status: 400 });
    }
    if (!isPaidGame(game)) {
      return NextResponse.json({ error: `Unknown game "${game}"` }, { status: 400 });
    }
    if (!MODES.includes(mode)) {
      return NextResponse.json({ error: `Unknown registration mode "${mode}"` }, { status: 400 });
    }
    if (!PAID_GAMES[game].endpoints[mode as RegistrationMode]) {
      return NextResponse.json({ error: `${PAID_GAMES[game].label} does not support ${mode} registration` }, { status: 400 });
    }

    const tournament = await loadTournament(game, tournamentId);
    if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

    // ── Nothing to charge ────────────────────────────────────────────────
    const entryFee = entryFeeOf(tournament);
    if (entryFee <= 0) {
      return NextResponse.json({ free: true, message: "This tournament is free — register directly." });
    }

    // ── Already paid — don't take the money twice ────────────────────────
    const entitlement = await adminDb.collection("paidEntries").doc(paidEntryId(game, tournamentId, uid)).get();
    if (entitlement.exists) {
      return NextResponse.json({ alreadyPaid: true, message: "You've already paid for this tournament." });
    }

    // ── Refuse to charge for a registration that cannot succeed ──────────
    if (tournament.registrationDeadline && new Date() > new Date(tournament.registrationDeadline)) {
      return NextResponse.json({ error: "Registration has closed for this tournament" }, { status: 400 });
    }
    // Capacity has to count players who have paid but not yet finished setup.
    // `slotsBooked` only moves when a registration completes, so on its own it
    // would let the tournament oversell to everyone still in the setup step —
    // and the ones who lose that race would already have paid.
    if (tournament.totalSlots) {
      const paidHolders = await adminDb.collection("paidEntries").where("tournamentId", "==", tournamentId).get();
      const held = Math.max(Number(tournament.slotsBooked) || 0, paidHolders.size);
      if (held >= Number(tournament.totalSlots)) {
        return NextResponse.json({ error: "Tournament is full" }, { status: 400 });
      }
    }

    const userSnap = await adminDb.collection("users").doc(uid).get();
    const user = userSnap.data();
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if ((user[PAID_GAMES[game].registeredField] || []).includes(tournamentId)) {
      return NextResponse.json({ error: "You are already registered for this tournament" }, { status: 400 });
    }

    // Payment comes BEFORE profile setup: the player pays to hold a slot, then
    // supplies name, phone and their game account. So the only prerequisite is
    // Discord — that is how we reach someone whose payment succeeded but whose
    // setup never finished, which is the one failure mode this ordering creates.
    //
    // The rest is still demanded before the registration itself completes; it
    // has just moved after the money instead of in front of it.
    if (!user.discordId) {
      return NextResponse.json(
        { error: "Connect Discord first — it's how we reach you about your match.", needsDiscord: true },
        { status: 400 }
      );
    }

    // ── Build the checkout ───────────────────────────────────────────────
    const { key, salt, paymentUrl, mode: payuMode } = payuConfig();
    const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

    const txnid = newTxnId();
    const amount = formatAmount(entryFee);
    const productinfo = sanitizeText(`${PAID_GAMES[game].label} ${tournament.name || tournamentId}`, 90);
    const firstname = sanitizeName(user.fullName);
    const email = resolveEmail(user.email, uid);
    const phone = resolvePhone(user.phone || user.phoneNumber);

    const fields = {
      txnid, amount, productinfo, firstname, email,
      udf1: game, udf2: tournamentId, udf3: uid, udf4: mode, udf5: "",
    };
    const hash = requestHash(key, salt, fields);

    await adminDb.collection("payments").doc(txnid).set({
      txnid,
      uid,
      game,
      tournamentId,
      tournamentName: tournament.name || tournamentId,
      mode,
      amount: entryFee,          // authoritative — compared against PayU on settle
      amountStr: amount,
      currency: "INR",
      status: "initiated",
      // Which PayU environment took this money. Deliberately NOT `payuMode` —
      // settlement stores the payment instrument (UPI / NB / CC) under that
      // name, and letting the two share a field made sandbox rupees
      // indistinguishable from real ones in the reconciliation report.
      payuEnv: payuMode,
      payuKey: key,              // which credential set was used; never the salt
      returnTo: safeReturnTo,    // page to send the player back to afterwards
      productinfo, firstname, email, phone,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      txnid,
      action: paymentUrl,
      params: {
        key, txnid, amount, productinfo, firstname, email, phone,
        surl: `${origin}/api/payments/payu/callback`,
        furl: `${origin}/api/payments/payu/callback`,
        udf1: fields.udf1, udf2: fields.udf2, udf3: fields.udf3, udf4: fields.udf4, udf5: fields.udf5,
        hash,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not start payment" }, { status: 500 });
  }
}
