import { adminDb } from "@/lib/firebaseAdmin";
import {
  getWhatsAppConfig,
  enqueueWhatsAppRenameGroup,
  enqueueWhatsAppAddParticipants,
  enqueueWhatsAppCreateGroup,
  enqueueWhatsAppResetGroup,
} from "@/lib/whatsapp";

/**
 * Reusable WhatsApp group pool.
 *
 * Model (decided 2026-05-31): we do NOT create a fresh group per tournament and
 * delete it after — that gets the dedicated number flagged. Instead we keep a
 * pool of long-lived group "shells" and rotate tournaments/teams through them by
 * renaming + swapping members. Groups are never deleted.
 *
 *   whatsappGroupPool/{groupId}:
 *     {
 *       groupId,                              // == doc id, the @g.us id
 *       type: "tournament" | "team",
 *       status: "free" | "in-use",
 *       currentName?,
 *       assignedTournamentId?, assignedTeamId?,
 *       createdAt, updatedAt,
 *     }
 *
 * Provisioning is lazy: checkout reuses a free shell if one exists, otherwise it
 * creates one (nested in the iesports community) and registers it on settle via
 * reconcilePendingPool(). Release strips a shell back to staff-only + renames +
 * revokes its invite, then marks it free.
 */

export type PoolGroupType = "tournament" | "team";
export type PoolGroupStatus = "free" | "in-use";

export interface PoolGroup {
  groupId: string;
  type: PoolGroupType;
  status: PoolGroupStatus;
  currentName?: string;
  assignedTournamentId?: string | null;
  assignedTeamId?: string | null;
  createdAt: string;
  updatedAt: string;
}

const POOL = "whatsappGroupPool";
const PENDING = "whatsappPoolPending";
const FREE_NAME = "iesports • available";

/** Register an existing group into the pool. Upsert; safe to call repeatedly. */
export async function registerPoolGroup(
  groupId: string,
  type: PoolGroupType,
  fields: Partial<PoolGroup> = {},
): Promise<void> {
  const now = new Date().toISOString();
  await adminDb.collection(POOL).doc(groupId).set(
    {
      groupId,
      type,
      status: fields.status || "free",
      currentName: fields.currentName ?? null,
      assignedTournamentId: fields.assignedTournamentId ?? null,
      assignedTeamId: fields.assignedTeamId ?? null,
      updatedAt: now,
      createdAt: fields.createdAt || now,
    },
    { merge: true },
  );
}

interface CheckoutOpts {
  type: PoolGroupType;
  /** The display name to give the group while it's in use. */
  name: string;
  /** Members to add (E.164 or digits). */
  participantPhones: string[];
  tournamentId?: string;
  teamId?: string;
  /** Where the group id should land so the caller can message it later, e.g.
   *  ("valorantTournaments/abc", "whatsappTournamentGroupId"). On reuse we write
   *  it immediately; on lazy-create the bot settles it here. */
  settleDocPath: string;
  settleField: string;
}

/**
 * Reserve a group for a tournament/team. Reuses a free shell of the right type
 * if one exists (rename + add members); otherwise lazily creates one nested in
 * the community. Returns `{ groupId }` immediately on reuse, or `{ groupId: null,
 * pending: true }` when a create was enqueued (id arrives via settle/reconcile).
 */
export async function checkoutGroup(
  opts: CheckoutOpts,
): Promise<{ groupId: string | null; reused: boolean; pending: boolean }> {
  const now = new Date().toISOString();

  // 1. Try to atomically reserve a free shell of this type.
  const reservedId = await adminDb.runTransaction(async (tx) => {
    const q = adminDb
      .collection(POOL)
      .where("type", "==", opts.type)
      .where("status", "==", "free")
      .limit(1);
    const snap = await tx.get(q);
    if (snap.empty) return null;
    const doc = snap.docs[0];
    tx.update(doc.ref, {
      status: "in-use",
      currentName: opts.name,
      assignedTournamentId: opts.tournamentId ?? null,
      assignedTeamId: opts.teamId ?? null,
      updatedAt: now,
    });
    return doc.id;
  });

  if (reservedId) {
    // Reuse path: rename, then add members, then record the handle on the caller doc.
    await enqueueWhatsAppRenameGroup(reservedId, opts.name, { source: "pool" });
    if (opts.participantPhones.length) {
      await enqueueWhatsAppAddParticipants(reservedId, opts.participantPhones, { source: "pool" });
    }
    await adminDb.doc(opts.settleDocPath).set({ [opts.settleField]: reservedId }, { merge: true });
    return { groupId: reservedId, reused: true, pending: false };
  }

  // 2. No free shell — lazily create one nested in the community, with members
  //    added at creation. The bot settles the new id into the caller doc; a
  //    pending marker lets reconcilePendingPool() register it into the pool.
  const cfg = await getWhatsAppConfig();
  await enqueueWhatsAppCreateGroup(
    opts.name,
    opts.participantPhones,
    opts.settleDocPath,
    opts.settleField,
    { parentGroupId: cfg.iesportsCommunityParentGroupId, source: "pool" },
  );
  await adminDb.collection(PENDING).add({
    type: opts.type,
    name: opts.name,
    tournamentId: opts.tournamentId ?? null,
    teamId: opts.teamId ?? null,
    settleDocPath: opts.settleDocPath,
    settleField: opts.settleField,
    createdAt: now,
  });
  return { groupId: null, reused: false, pending: true };
}

/**
 * Release a shell back to the pool: enqueue a bot-side reset (strip to staff +
 * rename to free + revoke invite) and mark the registry free. Idempotent.
 */
export async function releaseGroup(
  groupId: string,
  opts: { freeName?: string } = {},
): Promise<void> {
  const cfg = await getWhatsAppConfig();
  const freeName = opts.freeName || FREE_NAME;
  await enqueueWhatsAppResetGroup(groupId, cfg.staffPhones, freeName, { source: "pool" });
  await adminDb.collection(POOL).doc(groupId).set(
    {
      status: "free",
      currentName: freeName,
      assignedTournamentId: null,
      assignedTeamId: null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

/**
 * Finish lazy-create registration: for each pending marker whose settle target
 * now holds a group id, register that group into the pool as in-use and drop the
 * marker. Call from a cron or right after a checkout that created a shell.
 */
export async function reconcilePendingPool(): Promise<number> {
  const pend = await adminDb.collection(PENDING).get();
  let registered = 0;
  for (const d of pend.docs) {
    const p = d.data() as any;
    try {
      const targetSnap = await adminDb.doc(p.settleDocPath).get();
      const groupId = targetSnap.exists ? (targetSnap.data() as any)?.[p.settleField] : null;
      if (!groupId) continue; // bot hasn't settled the create yet
      await registerPoolGroup(groupId, p.type, {
        status: "in-use",
        currentName: p.name,
        assignedTournamentId: p.tournamentId ?? null,
        assignedTeamId: p.teamId ?? null,
      });
      await d.ref.delete();
      registered++;
    } catch (e: any) {
      console.warn("[WA pool] reconcile failed for", d.id, e?.message || e);
    }
  }
  return registered;
}
