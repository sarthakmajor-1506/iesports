import { adminDb } from "@/lib/firebaseAdmin";

/**
 * WhatsApp outbox helpers.
 *
 * The `whatsappOutbox` Firestore collection is a typed action queue consumed
 * by the standalone whatsapp/ sender service. Every enqueue here writes a
 * single doc; the sender picks it up, runs the action against WhatsApp Web,
 * and (optionally) settles a result back into another Firestore doc (e.g.
 * after creating a group, writes the new group id into the tournament doc).
 *
 *   whatsappOutbox/{id}:
 *     {
 *       action:  "send-text" | "send-media" | "send-poll"
 *                | "create-group" | "add-participants" | "remove-participants",
 *       target:  { type: "group" | "dm" | "broadcast", id?, phone?, phones? },
 *       text?, mediaUrl?,
 *       pollQuestion?, pollOptions?, pollAllowMultiple?,
 *       groupName?, participantPhones?,
 *       settleDocPath?, settleField?,
 *       status:  "pending" | "sent" | "skipped" | "error",
 *       dedupeKey?, source?, createdAt, attempts?, error?, settled?, ...
 *     }
 *
 * BACKWARD COMPATIBILITY: docs written by the original `enqueueWhatsApp(text)`
 * still work — the sender treats a doc with no `action` field as
 * `send-text` to the env-configured legacy group.
 *
 * All enqueue helpers are best-effort and swallow errors — a WhatsApp issue
 * must never break the calling flow (tournament registration, result fetch,
 * etc.). On error we just log and move on.
 */

export type WhatsAppTarget =
  | { type: "group"; id: string }
  | { type: "dm"; phone: string }
  | { type: "broadcast"; phones: string[] };

/**
 * Admin-editable WhatsApp settings (the `config/whatsapp` Firestore doc).
 * Defaults are applied when fields are missing so callers don't need to
 * special-case a fresh install.
 */
export interface WhatsAppConfig {
  /** WA group id of the iesports-wide announcement channel. */
  iesportsGeneralGroupId?: string;
  /** Only announce a match as "running late" once we're this many minutes
   *  past the scheduled time. Default 60. */
  lateMatchAnnounceMinutes: number;
}

export async function getWhatsAppConfig(): Promise<WhatsAppConfig> {
  try {
    const snap = await adminDb.collection("config").doc("whatsapp").get();
    const data = snap.exists ? (snap.data() as any) : {};
    return {
      iesportsGeneralGroupId: data.iesportsGeneralGroupId || undefined,
      lateMatchAnnounceMinutes:
        typeof data.lateMatchAnnounceMinutes === "number" ? data.lateMatchAnnounceMinutes : 60,
    };
  } catch {
    return { lateMatchAnnounceMinutes: 60 };
  }
}

export interface EnqueueOpts {
  dedupeKey?: string;
  source?: string;
  /** When set, sender writes the action's result (group id, message id) into
   *  Firestore at `${settleDocPath}.${settleField}`. */
  settleDocPath?: string;
  settleField?: string;
}

/**
 * Internal: write the outbox doc. Best-effort, swallows errors.
 */
async function writeOutbox(doc: Record<string, any>): Promise<void> {
  try {
    await adminDb.collection("whatsappOutbox").add({
      ...doc,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.warn("[WA] enqueue failed:", e?.message || e);
  }
}

/**
 * Check whether a user has opted out of WhatsApp messages. The opt-out
 * flag is set by the sender service when it receives a STOP/UNSUBSCRIBE
 * reply from a user's number.
 */
async function isOptedOut(uid: string): Promise<boolean> {
  if (!uid) return false;
  try {
    const snap = await adminDb.collection("users").doc(uid).get();
    return snap.exists && snap.data()?.whatsappOptOut === true;
  } catch {
    return false;
  }
}

/**
 * Legacy entrypoint preserved for the Dota result resolver and any other
 * call sites that just want to post a string to the env-configured group.
 * New code should prefer one of the typed helpers below.
 */
export async function enqueueWhatsApp(
  text: string,
  dedupeKey?: string,
  source = "web",
): Promise<void> {
  await writeOutbox({
    text,
    source,
    ...(dedupeKey ? { dedupeKey } : {}),
  });
}

/** Send a plain-text message to a target (group, dm, or broadcast). */
export async function enqueueWhatsAppText(
  target: WhatsAppTarget,
  text: string,
  opts: EnqueueOpts = {},
): Promise<void> {
  await writeOutbox({
    action: "send-text",
    target,
    text,
    source: opts.source || "web",
    ...(opts.dedupeKey ? { dedupeKey: opts.dedupeKey } : {}),
  });
}

/**
 * Send a 1:1 DM to a user's phone number. If `uid` is provided we'll check
 * `users.whatsappOptOut` first and silently skip if they've opted out.
 *
 * `phone` should be E.164 (e.g. "+919876543210"). The sender normalizes it
 * to `<digits>@c.us` for whatsapp-web.js.
 */
export async function enqueueWhatsAppDM(
  phone: string,
  text: string,
  opts: EnqueueOpts & { uid?: string } = {},
): Promise<void> {
  if (opts.uid && await isOptedOut(opts.uid)) return;
  if (!phone) return;
  await writeOutbox({
    action: "send-text",
    target: { type: "dm", phone },
    text,
    source: opts.source || "web",
    ...(opts.dedupeKey ? { dedupeKey: opts.dedupeKey } : {}),
  });
}

/**
 * Send media (image, video, document) to a target. `mediaUrl` must be an
 * https URL the sender can fetch — typically a Firebase Storage download URL.
 */
export async function enqueueWhatsAppMedia(
  target: WhatsAppTarget,
  mediaUrl: string,
  caption: string,
  opts: EnqueueOpts = {},
): Promise<void> {
  await writeOutbox({
    action: "send-media",
    target,
    mediaUrl,
    text: caption,
    source: opts.source || "web",
    ...(opts.dedupeKey ? { dedupeKey: opts.dedupeKey } : {}),
  });
}

/**
 * Send a poll (whatsapp-web.js native Poll). Options is an array of choices;
 * defaults to single-answer unless `allowMultiple` is true.
 */
export async function enqueueWhatsAppPoll(
  target: WhatsAppTarget,
  question: string,
  options: string[],
  opts: EnqueueOpts & { allowMultiple?: boolean } = {},
): Promise<void> {
  await writeOutbox({
    action: "send-poll",
    target,
    pollQuestion: question,
    pollOptions: options,
    pollAllowMultiple: !!opts.allowMultiple,
    source: opts.source || "web",
    ...(opts.dedupeKey ? { dedupeKey: opts.dedupeKey } : {}),
  });
}

/**
 * Create a new WhatsApp group with the named participants. After creation,
 * the sender writes the new group id into `settleDocPath.settleField` — that
 * field then becomes the canonical handle to message the group later via
 * `enqueueWhatsAppText({ type: "group", id })`.
 *
 * Participant phones should be E.164 strings.
 */
export async function enqueueWhatsAppCreateGroup(
  groupName: string,
  participantPhones: string[],
  settleDocPath: string,
  settleField: string,
  opts: Omit<EnqueueOpts, "settleDocPath" | "settleField"> = {},
): Promise<void> {
  await writeOutbox({
    action: "create-group",
    groupName,
    participantPhones,
    settleDocPath,
    settleField,
    source: opts.source || "web",
    ...(opts.dedupeKey ? { dedupeKey: opts.dedupeKey } : {}),
  });
}

/** Add participants to an existing group. */
export async function enqueueWhatsAppAddParticipants(
  groupId: string,
  participantPhones: string[],
  opts: EnqueueOpts = {},
): Promise<void> {
  await writeOutbox({
    action: "add-participants",
    target: { type: "group", id: groupId },
    participantPhones,
    source: opts.source || "web",
    ...(opts.dedupeKey ? { dedupeKey: opts.dedupeKey } : {}),
  });
}

/** Remove participants from a group (admin action — bot must be group admin). */
export async function enqueueWhatsAppRemoveParticipants(
  groupId: string,
  participantPhones: string[],
  opts: EnqueueOpts = {},
): Promise<void> {
  await writeOutbox({
    action: "remove-participants",
    target: { type: "group", id: groupId },
    participantPhones,
    source: opts.source || "web",
    ...(opts.dedupeKey ? { dedupeKey: opts.dedupeKey } : {}),
  });
}
