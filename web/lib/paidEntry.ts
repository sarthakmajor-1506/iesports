// Paid-entry gate — the single place that decides "has this player paid?".
//
// Registration routes call requirePaidEntry() before writing anything. For a
// free tournament it returns immediately, so wiring it into a route is a
// two-line change with no behaviour change until an entry fee is set.
//
// Entitlement is a document with a DERIVED id (game__tournament__uid) rather
// than a query, which makes the check one indexed get, makes granting it twice
// a no-op, and means no composite index has to exist for a player to register.

import { adminDb } from "@/lib/firebaseAdmin";

export type PaidGame = "dota2" | "dota_solo" | "valorant" | "cs2";
export type RegistrationMode = "solo" | "team_create" | "team_join";

/**
 * Registration endpoints are looked up here, never taken from the client — the
 * settle step POSTs to whatever this map says, so a client-supplied path would
 * be a way to make the server call arbitrary internal routes.
 */
export const PAID_GAMES: Record<PaidGame, {
  collection: string;
  label: string;
  registeredField: string;
  /** Subcollection holding individually-registered players, for auditing. */
  playersSubcollection: string;
  endpoints: Partial<Record<RegistrationMode, string>>;
}> = {
  dota2: {
    collection: "tournaments",
    label: "Dota 2",
    registeredField: "registeredTournaments",
    playersSubcollection: "players",
    endpoints: { solo: "/api/teams/solo", team_create: "/api/teams/create", team_join: "/api/teams/join" },
  },
  dota_solo: {
    collection: "soloTournaments",
    label: "Dota 2 Solo",
    registeredField: "registeredSoloTournaments",
    playersSubcollection: "players",
    endpoints: { solo: "/api/solo/register" },
  },
  valorant: {
    collection: "valorantTournaments",
    label: "Valorant",
    registeredField: "registeredValorantTournaments",
    playersSubcollection: "soloPlayers",
    endpoints: { solo: "/api/valorant/solo" },
  },
  cs2: {
    collection: "cs2Tournaments",
    label: "CS2",
    registeredField: "registeredCS2Tournaments",
    playersSubcollection: "soloPlayers",
    endpoints: { solo: "/api/cs2/solo" },
  },
};

export const isPaidGame = (g: string): g is PaidGame => Object.prototype.hasOwnProperty.call(PAID_GAMES, g);

export const paidEntryId = (game: PaidGame, tournamentId: string, uid: string) =>
  `${game}__${tournamentId}__${uid}`;

export const entryFeeOf = (tournament: any): number => {
  const fee = Number(tournament?.entryFee);
  return Number.isFinite(fee) && fee > 0 ? fee : 0;
};

export async function loadTournament(game: PaidGame, tournamentId: string) {
  const snap = await adminDb.collection(PAID_GAMES[game].collection).doc(tournamentId).get();
  return snap.exists ? { id: snap.id, ...(snap.data() as any) } : null;
}

export type GateResult =
  | { ok: true; entryFee: number; paid: boolean }
  | { ok: false; status: number; error: string; requiresPayment: boolean; entryFee: number };

/**
 * Free tournaments pass straight through, so this is safe to call
 * unconditionally at the top of any registration route.
 */
export async function requirePaidEntry(args: {
  game: PaidGame;
  tournamentId: string;
  uid: string;
  tournament?: any; // pass it in when the caller already read the doc
}): Promise<GateResult> {
  const { game, tournamentId, uid } = args;

  const tournament = args.tournament ?? (await loadTournament(game, tournamentId));
  if (!tournament) {
    return { ok: false, status: 404, error: "Tournament not found", requiresPayment: false, entryFee: 0 };
  }

  const entryFee = entryFeeOf(tournament);
  if (entryFee <= 0) return { ok: true, entryFee: 0, paid: false };

  const entitlement = await adminDb.collection("paidEntries").doc(paidEntryId(game, tournamentId, uid)).get();
  if (entitlement.exists) return { ok: true, entryFee, paid: true };

  return {
    ok: false,
    status: 402,
    error: `This tournament has a ₹${entryFee} entry fee. Complete payment to register.`,
    requiresPayment: true,
    entryFee,
  };
}

/**
 * Records that a player has paid. Written once by whichever of the callback or
 * the webhook settles first; the second write is harmless because the id is
 * derived and the payload is identical.
 */
export async function grantPaidEntry(args: {
  game: PaidGame;
  tournamentId: string;
  uid: string;
  txnid: string;
  amount: number;
}) {
  const { game, tournamentId, uid, txnid, amount } = args;
  await adminDb.collection("paidEntries").doc(paidEntryId(game, tournamentId, uid)).set(
    { game, tournamentId, uid, txnid, amount, paidAt: new Date().toISOString() },
    { merge: true }
  );
}
