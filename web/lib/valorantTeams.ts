// Team registration for Valorant — captain pays once, teammates join by code.
//
// Introduced when League of Rising Stars: Horizon switched from ₹500 per player
// (shuffled into teams on the day) to ₹2000 per pre-formed team. The shape:
//
//   captain names the team → pays entryFee → team + code created at settlement
//   captain shares the code → each teammate joins with it, free
//
// Where things live, and why:
//
//   valorantTournaments/{id}/teams/{team-N}   the team, in the SAME collection
//       the admin shuffle writes. Standings, fixtures, brackets, the team page
//       and the tournament page all read teams from here, so a registered team
//       flows through the rest of the tournament with no second code path.
//   valorantTournaments/{id}/soloPlayers/{uid} every member is still a player
//       document (with `teamId`), so slot counts, rank tiers, the players tab,
//       the WhatsApp provisioning and every existing payment check keep working.
//   valorantTeamCodes/{CODE}                  the join code. NOT on the team
//       document: teams are readable by any signed-in user (firestore.rules),
//       and a code there would let anyone join any team. This collection is
//       unlisted in the rules, so it is server-only.
//   valorantTournaments/{id}/teamHolds/{uid}  a team seat reserved at checkout,
//       for the same reason slot holds exist: the last team seat must not be
//       sold to two captains at once.
//
// `slotsBooked` keeps counting PLAYERS (rule 12 in CLAUDE.md still applies, and
// recountSlots still compares it to soloPlayers). Team capacity is counted from
// the teams collection itself against `totalTeams`.

import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";

export const TEAM_HOLD_TTL_MS = 20 * 60 * 1000;
export const TEAM_CODES = "valorantTeamCodes";

// No 0/O, 1/I/L: the code is read off a phone screen and typed on another.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export const teamSizeOf = (t: any): number => Math.max(1, Number(t?.teamSize) || 5);

export const totalTeamsOf = (t: any): number =>
  Number(t?.totalTeams) || Math.floor((Number(t?.totalSlots) || 0) / teamSizeOf(t)) || 0;

export const normalizeTeamCode = (raw: unknown): string =>
  String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

/** Team names are shown in brackets, overlays and share images — keep them plain. */
export function cleanTeamName(raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  if (name.length < 2) return { ok: false, error: "Team name must be at least 2 characters" };
  if (name.length > 24) return { ok: false, error: "Team name must be 24 characters or less" };
  if (!/^[A-Z0-9 .'&!_-]+$/.test(name)) return { ok: false, error: "Use letters, numbers, spaces and . ' & ! _ - only" };
  return { ok: true, name };
}

function newCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return out;
}

const tRef = (tournamentId: string) => adminDb.collection("valorantTournaments").doc(tournamentId);
const teamsCol = (tournamentId: string) => tRef(tournamentId).collection("teams");
const holdsCol = (tournamentId: string) => tRef(tournamentId).collection("teamHolds");
const playerRef = (tournamentId: string, uid: string) => tRef(tournamentId).collection("soloPlayers").doc(uid);

/** Same ordering the shuffle and the team box use. */
const ratingOf = (m: any) => (m?.iesportsRating > 0 ? m.iesportsRating : (Number(m?.riotTier) || 0) * 100);

function skillStats(members: any[]) {
  const total = members.reduce((s, m) => s + ratingOf(m), 0);
  return {
    totalSkillLevel: total,
    avgSkillLevel: members.length ? Math.round((total / members.length) * 100) / 100 : 0,
  };
}

const holdIsLive = (h: any, now: number) => h?.paid === true || (h?.expiresAt && Date.parse(h.expiresAt) > now);

// ── Checkout ────────────────────────────────────────────────────────────────

export type TeamReserveResult =
  | { ok: true }
  | { ok: false; reason: "no_tournament" | "full" | "name_taken" | "already_on_team" };

/**
 * Reserve a team seat and the team's name before the captain is sent to PayU.
 * Counts existing teams and other captains' live holds inside one transaction.
 */
export async function reserveTeamForCheckout(args: {
  tournamentId: string;
  uid: string;
  txnid: string;
  teamName: string;
}): Promise<TeamReserveResult> {
  const { tournamentId, uid, txnid, teamName } = args;
  const now = Date.now();

  return adminDb.runTransaction(async (tx) => {
    const [tSnap, teamsSnap, holdsSnap, pSnap] = await Promise.all([
      tx.get(tRef(tournamentId)), tx.get(teamsCol(tournamentId)), tx.get(holdsCol(tournamentId)), tx.get(playerRef(tournamentId, uid)),
    ]);
    if (!tSnap.exists) return { ok: false as const, reason: "no_tournament" as const };

    if ((pSnap.data() as any)?.teamId || teamsSnap.docs.some((d) => ((d.data() as any).memberUids || []).includes(uid))) {
      return { ok: false as const, reason: "already_on_team" as const };
    }

    const taken = new Set(teamsSnap.docs.map((d) => String((d.data() as any).teamName || "").toUpperCase()));
    let activeHolds = 0;
    const stale: FirebaseFirestore.DocumentReference[] = [];
    for (const d of holdsSnap.docs) {
      if (d.id === uid) continue; // renewing our own hold is not a new claim
      const h = d.data() as any;
      if (holdIsLive(h, now)) {
        activeHolds++;
        if (h.teamName) taken.add(String(h.teamName).toUpperCase());
      } else stale.push(d.ref);
    }

    if (taken.has(teamName.toUpperCase())) return { ok: false as const, reason: "name_taken" as const };

    const total = totalTeamsOf(tSnap.data());
    if (total > 0 && teamsSnap.size + activeHolds >= total) return { ok: false as const, reason: "full" as const };

    for (const ref of stale) tx.delete(ref);
    tx.set(holdsCol(tournamentId).doc(uid), {
      uid, txnid, teamName, paid: false,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(now + TEAM_HOLD_TTL_MS).toISOString(),
    }, { merge: true });
    return { ok: true as const };
  });
}

/** Paid team holds never expire: the seat is the captain's until the team exists. */
export async function markTeamHoldPaid(tournamentId: string, uid: string, txnid: string) {
  await holdsCol(tournamentId).doc(uid).set(
    { uid, txnid, paid: true, expiresAt: null, paidAt: new Date().toISOString() },
    { merge: true }
  );
}

export async function releaseTeamHold(tournamentId: string, uid: string) {
  await holdsCol(tournamentId).doc(uid).delete().catch(() => {});
}

// ── Create ──────────────────────────────────────────────────────────────────

export type CreateTeamResult =
  | { ok: true; created: boolean; teamId: string; teamName: string; code: string; slotsBooked: number }
  | { ok: false; reason: "no_tournament" | "already_on_team" | "full" | "name_taken" | "code_exhausted" };

/**
 * Create the team with its captain as the first member, atomically.
 *
 * When `txnid` is given the payment document is part of the transaction and
 * records the team it produced, so a replay (duplicate webhook, the status page
 * retrying, reconcile) returns the same team instead of making a second one.
 */
export async function createRegisteredTeam(args: {
  tournamentId: string;
  uid: string;
  teamName: string;
  player: Record<string, any>;
  txnid?: string | null;
}): Promise<CreateTeamResult> {
  const { tournamentId, uid, teamName, player, txnid } = args;
  const pRef = playerRef(tournamentId, uid);
  const hRef = holdsCol(tournamentId).doc(uid);
  const payRef = txnid ? adminDb.collection("payments").doc(txnid) : null;

  return adminDb.runTransaction(async (tx) => {
    const [tSnap, teamsSnap, pSnap, hSnap, paySnap] = await Promise.all([
      tx.get(tRef(tournamentId)), tx.get(teamsCol(tournamentId)), tx.get(pRef), tx.get(hRef),
      payRef ? tx.get(payRef) : Promise.resolve(null),
    ]);
    if (!tSnap.exists) return { ok: false as const, reason: "no_tournament" as const };
    const t = tSnap.data() as any;

    // Replay of a payment that already produced its team.
    const prior = (paySnap?.data() as any)?.team;
    if (prior?.teamId && teamsSnap.docs.some((d) => d.id === prior.teamId)) {
      return { ok: true as const, created: false, teamId: prior.teamId, teamName: prior.teamName, code: prior.code, slotsBooked: Number(t.slotsBooked) || 0 };
    }

    if ((pSnap.data() as any)?.teamId || teamsSnap.docs.some((d) => ((d.data() as any).memberUids || []).includes(uid))) {
      return { ok: false as const, reason: "already_on_team" as const };
    }
    if (teamsSnap.docs.some((d) => String((d.data() as any).teamName || "").toUpperCase() === teamName.toUpperCase())) {
      return { ok: false as const, reason: "name_taken" as const };
    }
    // A captain holding a paid seat was counted at checkout, so they get in even
    // if the count now reads full.
    const total = totalTeamsOf(t);
    if (total > 0 && teamsSnap.size >= total && !hSnap.exists) {
      return { ok: false as const, reason: "full" as const };
    }

    // Reads must all happen before the first write, so the code is found first.
    let code = "";
    for (let i = 0; i < 8 && !code; i++) {
      const candidate = newCode();
      const c = await tx.get(adminDb.collection(TEAM_CODES).doc(candidate));
      if (!c.exists) code = candidate;
    }
    if (!code) return { ok: false as const, reason: "code_exhausted" as const };

    const teamIndex = teamsSnap.docs.reduce((m, d) => Math.max(m, Number((d.data() as any).teamIndex) || 0), 0) + 1;
    const teamId = `team-${teamIndex}`;
    const existingPlayer = pSnap.exists ? (pSnap.data() as any) : null;
    const member = { ...player, registeredAt: existingPlayer?.registeredAt || player.registeredAt, teamId };
    const now = new Date().toISOString();

    tx.set(teamsCol(tournamentId).doc(teamId), {
      tournamentId,
      teamIndex,
      teamName,
      teamNameSet: true,
      captainUid: uid,
      members: [member],
      memberUids: [uid],
      registrationStatus: teamSizeOf(t) <= 1 ? "complete" : "forming",
      source: "registration",
      txnid: txnid || null,
      ...skillStats([member]),
      createdAt: now,
    });
    tx.set(adminDb.collection(TEAM_CODES).doc(code), { code, tournamentId, teamId, captainUid: uid, createdAt: now });

    let slotsBooked = Number(t.slotsBooked) || 0;
    if (existingPlayer) {
      // Already on the roster (e.g. added by an admin): counted already.
      tx.set(pRef, member, { merge: true });
    } else {
      tx.set(pRef, member);
      slotsBooked += 1;
      tx.update(tRef(tournamentId), { slotsBooked });
      tx.set(adminDb.collection("users").doc(uid), { registeredValorantTournaments: FieldValue.arrayUnion(tournamentId) }, { merge: true });
    }
    if (hSnap.exists) tx.delete(hRef);
    if (payRef) tx.set(payRef, { team: { teamId, teamName, code, createdAt: now } }, { merge: true });

    return { ok: true as const, created: true, teamId, teamName, code, slotsBooked };
  });
}

// ── Join ────────────────────────────────────────────────────────────────────

export type TeamCodeInfo = { code: string; tournamentId: string; teamId: string };

export async function resolveTeamCode(raw: unknown): Promise<TeamCodeInfo | null> {
  const code = normalizeTeamCode(raw);
  if (code.length !== CODE_LENGTH) return null;
  const snap = await adminDb.collection(TEAM_CODES).doc(code).get();
  if (!snap.exists) return null;
  const d = snap.data() as any;
  return { code, tournamentId: d.tournamentId, teamId: d.teamId };
}

export type JoinTeamResult =
  | { ok: true; teamId: string; teamName: string; captainUid: string; memberCount: number; teamSize: number; newPlayer: boolean; slotsBooked: number }
  | { ok: false; reason: "no_team" | "already_in_this_team" | "already_on_team" | "team_full" };

export async function joinTeam(args: {
  tournamentId: string;
  teamId: string;
  uid: string;
  player: Record<string, any>;
}): Promise<JoinTeamResult> {
  const { tournamentId, teamId, uid, player } = args;
  const teamRef = teamsCol(tournamentId).doc(teamId);
  const pRef = playerRef(tournamentId, uid);

  return adminDb.runTransaction(async (tx) => {
    const [tSnap, teamSnap, pSnap, mine] = await Promise.all([
      tx.get(tRef(tournamentId)), tx.get(teamRef), tx.get(pRef),
      tx.get(teamsCol(tournamentId).where("memberUids", "array-contains", uid)),
    ]);
    if (!tSnap.exists || !teamSnap.exists) return { ok: false as const, reason: "no_team" as const };
    const t = tSnap.data() as any;
    const team = teamSnap.data() as any;

    if ((team.memberUids || []).includes(uid)) return { ok: false as const, reason: "already_in_this_team" as const };
    if (!mine.empty || (pSnap.data() as any)?.teamId) return { ok: false as const, reason: "already_on_team" as const };

    const size = teamSizeOf(t);
    const members = [...(team.members || [])];
    if (members.length >= size) return { ok: false as const, reason: "team_full" as const };

    const existingPlayer = pSnap.exists ? (pSnap.data() as any) : null;
    const member = { ...player, registeredAt: existingPlayer?.registeredAt || player.registeredAt, teamId };
    members.push(member);

    tx.update(teamRef, {
      members,
      memberUids: FieldValue.arrayUnion(uid),
      registrationStatus: members.length >= size ? "complete" : "forming",
      ...skillStats(members),
    });

    let slotsBooked = Number(t.slotsBooked) || 0;
    if (existingPlayer) {
      tx.set(pRef, member, { merge: true });
    } else {
      tx.set(pRef, member);
      slotsBooked += 1;
      tx.update(tRef(tournamentId), { slotsBooked });
      tx.set(adminDb.collection("users").doc(uid), { registeredValorantTournaments: FieldValue.arrayUnion(tournamentId) }, { merge: true });
    }

    return {
      ok: true as const, teamId, teamName: team.teamName, captainUid: team.captainUid,
      memberCount: members.length, teamSize: size, newPlayer: !existingPlayer, slotsBooked,
    };
  });
}

// ── Leave ───────────────────────────────────────────────────────────────────

export type LeaveTeamResult =
  | { ok: true; teamName: string }
  | { ok: false; reason: "not_on_team" | "captain" };

/**
 * A teammate leaves before registration closes. No money moves: they paid
 * nothing to join. They come off the roster entirely.
 *
 * Captains cannot leave: they paid for the team and their teammates are relying
 * on the code. That is an admin conversation, not a button.
 */
export async function leaveTeam(args: { tournamentId: string; uid: string }): Promise<LeaveTeamResult> {
  const { tournamentId, uid } = args;
  const pRef = playerRef(tournamentId, uid);

  return adminDb.runTransaction(async (tx) => {
    const [tSnap, pSnap, mine] = await Promise.all([
      tx.get(tRef(tournamentId)), tx.get(pRef),
      tx.get(teamsCol(tournamentId).where("memberUids", "array-contains", uid)),
    ]);
    if (!tSnap.exists || mine.empty) return { ok: false as const, reason: "not_on_team" as const };

    const teamDoc = mine.docs[0];
    const team = teamDoc.data() as any;
    if (team.captainUid === uid) return { ok: false as const, reason: "captain" as const };

    const members = (team.members || []).filter((m: any) => m?.uid !== uid);
    tx.update(teamDoc.ref, {
      members,
      memberUids: FieldValue.arrayRemove(uid),
      registrationStatus: "forming",
      ...skillStats(members),
    });

    if (pSnap.exists) {
      const t = tSnap.data() as any;
      tx.delete(pRef);
      tx.update(tRef(tournamentId), { slotsBooked: Math.max(0, (Number(t.slotsBooked) || 0) - 1) });
      tx.set(adminDb.collection("users").doc(uid), { registeredValorantTournaments: FieldValue.arrayRemove(tournamentId) }, { merge: true });
    }

    return { ok: true as const, teamName: team.teamName };
  });
}

// ── Read ────────────────────────────────────────────────────────────────────

/** The team this player is on in this tournament, if any. */
export async function findTeamFor(tournamentId: string, uid: string) {
  const snap = await teamsCol(tournamentId).where("memberUids", "array-contains", uid).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...(snap.docs[0].data() as any) };
}

/** The join code for a team — only ever returned to that team's own members. */
export async function codeForTeam(tournamentId: string, teamId: string): Promise<string | null> {
  const snap = await adminDb.collection(TEAM_CODES)
    .where("tournamentId", "==", tournamentId)
    .where("teamId", "==", teamId)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].id;
}
