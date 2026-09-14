import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { recalcTiers } from "@/lib/recalcTiers";
import { syncPlayerSnapshot } from "@/lib/valorantPlayerSnapshot";
import { ratingToRank } from "@/lib/elo";
import { sendRegistrationDM } from "@/lib/discord";
import { requirePaidEntry, isTeamRegistration } from "@/lib/paidEntry";
import { claimSoloSlot } from "@/lib/registrationSlots";
import { verifyCaller } from "@/lib/apiAuth";
import { prepareValorantPlayer, valorantProfileError } from "@/lib/valorantRegistration";

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, uid } = await req.json();
    if (!tournamentId || !uid) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // ── Who is asking ──────────────────────────────────────────────────────
    // The player's own token, or our server finishing a paid registration.
    const caller = await verifyCaller(req, uid);
    if (!caller.ok) return NextResponse.json({ error: caller.error }, { status: caller.status });

    // ── Check user doc ─────────────────────────────────────────────────────
    const userDoc = await adminDb.collection("users").doc(uid).get();
    const userData = userDoc.data();
    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Mandatory fields, and a linked Riot ID ("pending" verification is allowed)
    const profileError = valorantProfileError(userData);
    if (profileError) {
      return NextResponse.json({ error: profileError }, { status: 400 });
    }
    const riotVerified = userData.riotVerified || "unlinked";

    // ── Check tournament exists ────────────────────────────────────────────
    const tournamentDoc = await adminDb.collection("valorantTournaments").doc(tournamentId).get();
    const tData = tournamentDoc.data();
    if (!tData) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // A team tournament is entered by creating or joining a team. Registering
    // solo here would put a player on the roster who belongs to no team and
    // paid nothing towards one.
    if (isTeamRegistration(tData)) {
      return NextResponse.json(
        { error: "This tournament takes team registrations. Create a team or join one with a team code.", teamRegistration: true },
        { status: 400 }
      );
    }

    // Check slots
    if (tData.slotsBooked >= tData.totalSlots) {
      return NextResponse.json({ error: "Tournament is full" }, { status: 400 });
    }

    // Paid entry — checked before the rank refresh below, so an unpaid attempt
    // costs nothing and writes nothing.
    const gate = await requirePaidEntry({ game: "valorant", tournamentId, uid, tournament: tData });
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.error, requiresPayment: gate.requiresPayment, entryFee: gate.entryFee },
        { status: gate.status }
      );
    }

    // ── Check not already registered ───────────────────────────────────────
    const existingDoc = await adminDb
      .collection("valorantTournaments")
      .doc(tournamentId)
      .collection("soloPlayers")
      .doc(uid)
      .get();

    if (existingDoc.exists) {
      return NextResponse.json({ error: "You are already registered for this tournament" }, { status: 400 });
    }

    // ── Refresh rank, seed or floor-check rating ──────────────────────────
    // Nothing is written yet. Everything is computed first and committed only
    // once the slot has actually been claimed, because this route can run
    // twice at once (duplicate PayU webhook, double-clicked button) and the
    // loser of that race must leave no trace behind. It used to write rating
    // history before claiming, which is how one player ended up with two
    // "seed" entries for a single registration.
    const prepared = await prepareValorantPlayer(uid, userData);
    const { iesportsRating, currentRank, rankRefreshed, ratingChanged } = prepared;

    // ── Claim the slot ────────────────────────────────────────────────────
    // One transaction writes the player document, moves `slotsBooked` and adds
    // the tournament to the user's array. A second concurrent caller loses here
    // and is told they are already registered, instead of quietly counting the
    // same player twice.
    const claim = await claimSoloSlot({
      game: "valorant",
      tournamentId,
      uid,
      player: prepared.player,
    });

    if (!claim.ok) {
      if (claim.reason === "already_registered") {
        return NextResponse.json({ error: "You are already registered for this tournament" }, { status: 400 });
      }
      if (claim.reason === "full") {
        return NextResponse.json({ error: "Tournament is full" }, { status: 400 });
      }
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // ── Everything below happens exactly once, after the claim ────────────
    await adminDb.collection("users").doc(uid).update(prepared.userUpdate);
    if (prepared.rankHistoryEntry) {
      await adminDb.collection("users").doc(uid).collection("rankHistory").add(prepared.rankHistoryEntry);
    }

    // ── Recalculate tiers for all players based on quantiles ──────────────
    await recalcTiers(tournamentId);

    // ── Refresh denormalized playersSnapshot on the tournament doc ────────
    await syncPlayerSnapshot(tournamentId);

    // ── Send registration DM (fire-and-forget — never blocks registration) ──
    const discordId = userData.discordId || (uid.startsWith("discord_") ? uid.replace("discord_", "") : "");
    if (discordId) {
      sendRegistrationDM({
        discordId,
        playerName: userData.riotGameName || userData.fullName || "Player",
        tournamentName: tData.name || "Tournament",
        tournamentId,
        startDate: tData.startDate || "",
        registrationDeadline: tData.registrationDeadline || "",
        format: tData.format || "shuffle",
        prizePool: tData.prizePool || "TBD",
        slotsBooked: claim.slotsBooked,
        totalSlots: tData.totalSlots || 0,
        iesportsRank: ratingToRank(iesportsRating),
      }).catch(() => {}); // never fail the registration
    }

    return NextResponse.json({
      success: true,
      riotVerified,
      rankRefreshed,
      ratingChanged,
      iesportsRating,
      iesportsRank: ratingToRank(iesportsRating),
      riotRank: currentRank,
      warning: riotVerified === "pending"
        ? "Your Riot ID is pending verification. Registration accepted but may require verification before tournament starts."
        : undefined,
    });
  } catch (e: any) {
    console.error("Valorant solo registration error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
