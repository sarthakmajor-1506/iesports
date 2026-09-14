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
  PAID_GAMES, isPaidGame, entryFeeOf, loadTournament, paidEntryId, teamEntryId, isLiveEntitlement,
  isTeamRegistration, type RegistrationMode,
} from "@/lib/paidEntry";
import { reserveSlotForCheckout, releaseHold } from "@/lib/registrationSlots";
import { verifyCaller } from "@/lib/apiAuth";
import { valorantProfileError } from "@/lib/valorantRegistration";
import { cleanTeamName, findTeamFor, reserveTeamForCheckout, releaseTeamHold } from "@/lib/valorantTeams";

const MODES: RegistrationMode[] = ["solo", "team_create", "team_join"];

export async function POST(req: NextRequest) {
  try {
    const { uid, game, tournamentId, mode = "solo", returnTo, teamName: rawTeamName } = await req.json();

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

    // Only the player themselves may start a checkout in their name.
    const caller = await verifyCaller(req, uid);
    if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

    const tournament = await loadTournament(game, tournamentId);
    if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

    // ── Nothing to charge ────────────────────────────────────────────────
    const entryFee = entryFeeOf(tournament);
    if (entryFee <= 0) {
      return NextResponse.json({ free: true, message: "This tournament is free — register directly." });
    }

    // ── Team registration ────────────────────────────────────────────────
    // On a team tournament the only thing for sale is a team, bought by its
    // captain. Everyone else joins free with the code, so a solo checkout here
    // would take money for a seat that belongs to no team.
    const teamMode = game === "valorant" && isTeamRegistration(tournament);
    if (teamMode && mode !== "team_create") {
      return NextResponse.json({ error: "This tournament takes team registrations — create a team, or join one with a team code." }, { status: 400 });
    }
    if (game === "valorant" && !teamMode && mode === "team_create") {
      return NextResponse.json({ error: "This tournament does not take team registrations" }, { status: 400 });
    }

    // ── Already paid — don't take the money twice ────────────────────────
    // A voided entitlement (the player withdrew and is owed a refund) does not
    // count: they are free to buy back in.
    const entitlement = await adminDb.collection("paidEntries")
      .doc(teamMode ? teamEntryId(game, tournamentId, uid) : paidEntryId(game, tournamentId, uid)).get();
    if (isLiveEntitlement(entitlement)) {
      return NextResponse.json({ alreadyPaid: true, message: teamMode ? "You've already paid for a team in this tournament." : "You've already paid for this tournament." });
    }

    // ── Refuse to charge for a registration that cannot succeed ──────────
    if (tournament.registrationDeadline && new Date() > new Date(tournament.registrationDeadline)) {
      return NextResponse.json({ error: "Registration has closed for this tournament" }, { status: 400 });
    }
    // Cheap first pass so an obviously full tournament is refused before any
    // work is done. The authoritative check is the slot reservation below: this
    // one reads outside a transaction and two players arriving together would
    // both pass it. Team tournaments are capped by team count, checked there.
    if (!teamMode && tournament.totalSlots && (Number(tournament.slotsBooked) || 0) >= Number(tournament.totalSlots)) {
      return NextResponse.json({ error: "Tournament is full" }, { status: 400 });
    }

    const userSnap = await adminDb.collection("users").doc(uid).get();
    const user = userSnap.data();
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    let teamName = "";
    if (teamMode) {
      if (await findTeamFor(tournamentId, uid)) {
        return NextResponse.json({ error: "You're already on a team in this tournament" }, { status: 400 });
      }
      const cleaned = cleanTeamName(rawTeamName);
      if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
      teamName = cleaned.name;

      // Unlike solo, the captain's profile is required BEFORE paying. The team
      // and its code are created the moment the payment settles, with the
      // captain as its first player, and that cannot succeed without a Riot ID.
      // Seat-first-setup-after would take ₹2000 and leave a team with no code
      // for teammates to use — the 11 Aug failure, times five.
      const profileError = valorantProfileError(user);
      if (profileError) return NextResponse.json({ error: profileError, needsProfile: true }, { status: 400 });
    } else if ((user[PAID_GAMES[game].registeredField] || []).includes(tournamentId)) {
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

    // ── Reserve the seat before sending anyone to pay for it ──────────────
    // Under "seat first, setup after" the money moves before the registration
    // exists, so `slotsBooked` alone cannot protect the last slot: two players
    // checking out at the same moment would both be charged and only one could
    // get in. The hold is written inside a transaction that counts the other
    // live holds, so the second player is told the tournament is full while
    // that is still free to say. An unpaid hold expires on its own; a paid one
    // lasts until the player registers or withdraws.
    if (teamMode) {
      const reserved = await reserveTeamForCheckout({ tournamentId, uid, txnid, teamName });
      if (!reserved.ok) {
        const msg: Record<string, [number, string]> = {
          full: [400, "All team slots are taken"],
          name_taken: [400, "That team name is taken — pick another"],
          already_on_team: [400, "You're already on a team in this tournament"],
          no_tournament: [404, "Tournament not found"],
        };
        const [status, error] = msg[reserved.reason];
        return NextResponse.json({ error }, { status });
      }
    } else {
      const reserved = await reserveSlotForCheckout({ game, tournamentId, uid, txnid });
      if (!reserved.ok) {
        return NextResponse.json(
          { error: reserved.reason === "full" ? "Tournament is full" : "Tournament not found" },
          { status: reserved.reason === "full" ? 400 : 404 }
        );
      }
    }

    const amount = formatAmount(entryFee);
    const productinfo = sanitizeText(
      teamMode
        ? `${PAID_GAMES[game].label} ${tournament.name || tournamentId} team ${teamName}`
        : `${PAID_GAMES[game].label} ${tournament.name || tournamentId}`,
      90
    );
    const firstname = sanitizeName(user.fullName);
    const email = resolveEmail(user.email, uid);
    const phone = resolvePhone(user.phone || user.phoneNumber);

    const fields = {
      txnid, amount, productinfo, firstname, email,
      udf1: game, udf2: tournamentId, udf3: uid, udf4: mode, udf5: "",
    };

    let hash: string;
    try {
      hash = requestHash(key, salt, fields);
      await adminDb.collection("payments").doc(txnid).set({
        txnid,
        uid,
        game,
        tournamentId,
        tournamentName: tournament.name || tournamentId,
        mode,
        amount: entryFee,          // authoritative — compared against PayU on settle
        amountStr: amount,
        ...(teamMode ? { teamName } : {}),
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
    } catch (e) {
      // The seat is reserved but no checkout exists to fill it. Hand it back
      // now rather than making the next player wait out the hold's expiry.
      if (teamMode) await releaseTeamHold(tournamentId, uid);
      else await releaseHold(game, tournamentId, uid);
      throw e;
    }

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
