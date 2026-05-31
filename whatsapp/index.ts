/**
 * IEsports WhatsApp sender.
 *
 * Consumes typed action docs from the `whatsappOutbox` Firestore collection
 * and runs them against the linked WhatsApp Web session. Mirrors the Discord
 * notification stack — every tournament-lifecycle WhatsApp side effect goes
 * through this queue, so a WhatsApp outage never blocks the rest of the app.
 *
 *   whatsappOutbox/{id}: {
 *     action: "send-text" | "send-media" | "send-poll"
 *           | "create-group" | "add-participants" | "remove-participants"
 *           | "rename-group" | "revoke-invite" | "reset-group",
 *     target: { type: "group"|"dm"|"broadcast", id?, phone?, phones? },
 *     text?, mediaUrl?, pollQuestion?, pollOptions?, pollAllowMultiple?,
 *     groupName?, participantPhones?, parentGroupId?, sleep?, retainedPhones?,
 *     settleDocPath?, settleField?,
 *     status: "pending"|"sent"|"skipped"|"error",
 *     dedupeKey?, source?, createdAt, attempts?, error?, settled?,
 *   }
 *
 * LEGACY COMPAT: an outbox doc with no `action` field (just `{ text }`) is
 * treated as `send-text` to the env-configured group (the original Dota
 * result post format). Don't remove this branch without migrating every
 * existing producer.
 *
 * WhatsApp has no official group API, so this drives WhatsApp Web. Use a
 * DEDICATED number (unofficial automation can get a number limited). The
 * LocalAuth session persists to WWEBJS_DATA_PATH so you scan the QR only once.
 *
 * Run:  cd whatsapp && npm install && npm start   (scan the QR on first run)
 */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, ".env") });

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
// whatsapp-web.js is CommonJS; esModuleInterop makes this work.
import pkg from "whatsapp-web.js";
const { Client, LocalAuth, MessageMedia, Poll } = pkg as any;
import qrcode from "qrcode-terminal";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = getFirestore();

const GROUP_NAME = process.env.WHATSAPP_GROUP_NAME || "";
let GROUP_ID = process.env.WHATSAPP_GROUP_ID || "";
const DATA_PATH = process.env.WWEBJS_DATA_PATH || "./.wwebjs_auth";

async function setStatus(patch: Record<string, any>) {
  try {
    await db.collection("whatsappStatus").doc("state").set(
      { ...patch, updatedAt: new Date().toISOString() },
      { merge: true },
    );
  } catch (e: any) { console.warn("[WA] status write failed:", e?.message || e); }
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: DATA_PATH }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--no-first-run"],
  },
});

client.on("qr", (qr: string) => {
  console.log("\n[WA] Scan this QR with the WhatsApp account (Linked Devices):\n");
  qrcode.generate(qr, { small: true });
  setStatus({ state: "qr", note: "scan QR in terminal" });
});

client.on("authenticated", () => { console.log("[WA] authenticated"); setStatus({ state: "authenticated" }); });
client.on("auth_failure", (m: string) => { console.error("[WA] auth_failure:", m); setStatus({ state: "auth_failure", lastError: m }); });
client.on("disconnected", (r: string) => {
  console.warn("[WA] disconnected:", r);
  setStatus({ state: "disconnected", lastError: r });
  // whatsapp-web.js does not auto-reconnect cleanly; re-init.
  setTimeout(() => client.initialize().catch((e: any) => console.error("[WA] re-init failed:", e?.message || e)), 5000);
});

// Inbound STOP/UNSUBSCRIBE → flip users.whatsappOptOut. Anything else we
// ignore for now (the bot isn't a chatbot).
client.on("message", async (msg: any) => {
  try {
    const body = String(msg?.body || "").trim().toUpperCase();
    if (body !== "STOP" && body !== "UNSUBSCRIBE") return;
    const from = String(msg?.from || ""); // "<digits>@c.us"
    if (!from.endsWith("@c.us")) return;
    const digits = from.replace("@c.us", "");
    // Find the user by phone (stored as "+<digits>" in users.phone)
    const e164 = "+" + digits;
    const usersSnap = await db.collection("users").where("phone", "==", e164).limit(1).get();
    if (usersSnap.empty) {
      console.warn(`[WA] STOP from unknown phone ${e164}`);
      return;
    }
    await usersSnap.docs[0].ref.set({ whatsappOptOut: true, whatsappOptOutAt: new Date().toISOString() }, { merge: true });
    await client.sendMessage(from, "You've been unsubscribed from iesports WhatsApp messages. Reply START to re-subscribe.");
    console.log(`[WA] opted out ${e164}`);
  } catch (e: any) {
    console.error("[WA] inbound STOP handler error:", e?.message || e);
  }
});

let ready = false;
let processing = false;

/**
 * Resolve the env-configured legacy group (used for outbox docs with no
 * `action` field). Only runs once at startup. Returns null if no group
 * configured — legacy docs will error out, but new typed docs still work.
 */
async function resolveLegacyGroup(): Promise<{ id: string; name: string } | null> {
  if (GROUP_ID) {
    try { const c = await client.getChatById(GROUP_ID); return { id: GROUP_ID, name: c?.name || GROUP_NAME }; }
    catch { console.warn(`[WA] WHATSAPP_GROUP_ID ${GROUP_ID} not found, falling back to name`); }
  }
  if (!GROUP_NAME) return null;
  const chats = await client.getChats();
  const g = chats.find((c: any) => c.isGroup && c.name === GROUP_NAME);
  if (!g) { console.error(`[WA] group "${GROUP_NAME}" not found among ${chats.length} chats`); return null; }
  GROUP_ID = g.id._serialized;
  console.log(`[WA] resolved group "${GROUP_NAME}" -> ${GROUP_ID}  (pin this as WHATSAPP_GROUP_ID)`);
  return { id: GROUP_ID, name: g.name };
}

/** Convert E.164 ("+919876543210") to whatsapp-web.js contact id ("919876543210@c.us"). */
function phoneToChatId(phone: string): string {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  if (!digits) throw new Error(`invalid phone: ${phone}`);
  return `${digits}@c.us`;
}

/**
 * Resolve an action's target into a list of chat ids to send to.
 * - group: target.id
 * - dm:    target.phone normalized
 * - broadcast: target.phones[] each normalized (sent to one at a time; we
 *   intentionally don't use WhatsApp Broadcast Lists since the receiver
 *   must have the sender in their contacts).
 */
function resolveTargets(target: any): string[] {
  if (!target || typeof target !== "object") return GROUP_ID ? [GROUP_ID] : [];
  if (target.type === "group" && target.id) return [String(target.id)];
  if (target.type === "dm" && target.phone) return [phoneToChatId(target.phone)];
  if (target.type === "broadcast" && Array.isArray(target.phones)) {
    return target.phones.map((p: string) => phoneToChatId(p));
  }
  return [];
}

/** Write the result of a successful action back into Firestore. */
async function settle(docPath: string | undefined, field: string | undefined, value: any) {
  if (!docPath || !field) return;
  try {
    await db.doc(docPath).set({ [field]: value, [`${field}UpdatedAt`]: new Date().toISOString() }, { merge: true });
  } catch (e: any) {
    console.warn(`[WA] settle to ${docPath}.${field} failed:`, e?.message || e);
  }
}

// ── Action handlers ─────────────────────────────────────────────────────────

async function handleSendText(data: any): Promise<any> {
  const chats = resolveTargets(data.target);
  const text = String(data.text || "").trim();
  if (!text) throw new Error("empty text");
  if (chats.length === 0) throw new Error("no target resolved");
  const results: string[] = [];
  for (const chatId of chats) {
    const msg = await client.sendMessage(chatId, text);
    if (msg?.id?._serialized) results.push(msg.id._serialized);
    // Tiny jitter between broadcast recipients to avoid bursty patterns.
    if (chats.length > 1) await new Promise((r) => setTimeout(r, 250 + Math.random() * 500));
  }
  return results.length === 1 ? results[0] : results;
}

async function handleSendMedia(data: any): Promise<any> {
  const chats = resolveTargets(data.target);
  if (chats.length === 0) throw new Error("no target resolved");
  if (!data.mediaUrl) throw new Error("missing mediaUrl");
  const media = await MessageMedia.fromUrl(data.mediaUrl, { unsafeMime: true });
  const caption = String(data.text || "").trim();
  const results: string[] = [];
  for (const chatId of chats) {
    const msg = await client.sendMessage(chatId, media, caption ? { caption } : undefined);
    if (msg?.id?._serialized) results.push(msg.id._serialized);
    if (chats.length > 1) await new Promise((r) => setTimeout(r, 250 + Math.random() * 500));
  }
  return results.length === 1 ? results[0] : results;
}

async function handleSendPoll(data: any): Promise<any> {
  const chats = resolveTargets(data.target);
  if (chats.length === 0) throw new Error("no target resolved");
  const question = String(data.pollQuestion || "").trim();
  const options = Array.isArray(data.pollOptions) ? data.pollOptions.map(String).filter(Boolean) : [];
  if (!question || options.length < 2) throw new Error("poll needs question + ≥2 options");
  const results: string[] = [];
  for (const chatId of chats) {
    const poll = new Poll(question, options, { allowMultipleAnswers: !!data.pollAllowMultiple });
    const msg = await client.sendMessage(chatId, poll);
    if (msg?.id?._serialized) results.push(msg.id._serialized);
    if (chats.length > 1) await new Promise((r) => setTimeout(r, 250 + Math.random() * 500));
  }
  return results.length === 1 ? results[0] : results;
}

async function handleCreateGroup(data: any): Promise<string> {
  const name = String(data.groupName || "").trim();
  const phones: string[] = Array.isArray(data.participantPhones) ? data.participantPhones : [];
  if (!name) throw new Error("missing groupName");
  if (phones.length === 0) throw new Error("create-group needs at least one participant");
  const ids = phones.map(phoneToChatId);
  const parentGroupId = data.parentGroupId ? String(data.parentGroupId) : undefined;
  const options = parentGroupId ? { parentGroupId } : {};
  // createGroup returns either an object { gid: { _serialized }, missingParticipants } or a raw id; handle both.
  const res: any = await client.createGroup(name, ids, options);
  const gid = res?.gid?._serialized || res?.gid || res?.id?._serialized || res;
  if (!gid || typeof gid !== "string") throw new Error("createGroup returned no gid");
  if (res?.missingParticipants && Object.keys(res.missingParticipants).length > 0) {
    console.warn(`[WA] createGroup ${name}: missing participants`, res.missingParticipants);
  }
  return gid;
}

async function handleAddParticipants(data: any): Promise<any> {
  const groupId = data.target?.id;
  const phones: string[] = Array.isArray(data.participantPhones) ? data.participantPhones : [];
  if (!groupId || phones.length === 0) throw new Error("add-participants needs target.id + participantPhones");
  const chat: any = await client.getChatById(groupId);
  if (!chat?.isGroup) throw new Error(`${groupId} is not a group`);
  const ids = phones.map(phoneToChatId);
  // Throttle adds with per-participant jitter so a burst doesn't get the number flagged.
  const sleep = Array.isArray(data.sleep) ? data.sleep : [800, 1500];
  const res = await chat.addParticipants(ids, { sleep });
  return res;
}

async function handleRenameGroup(data: any): Promise<string> {
  const groupId = data.target?.id;
  const name = String(data.groupName || data.name || "").trim();
  if (!groupId) throw new Error("rename-group needs target.id");
  if (!name) throw new Error("rename-group needs groupName");
  const chat: any = await client.getChatById(groupId);
  if (!chat?.isGroup) throw new Error(`${groupId} is not a group`);
  await chat.setSubject(name);
  return name;
}

async function handleRevokeInvite(data: any): Promise<string> {
  const groupId = data.target?.id;
  if (!groupId) throw new Error("revoke-invite needs target.id");
  const chat: any = await client.getChatById(groupId);
  if (!chat?.isGroup) throw new Error(`${groupId} is not a group`);
  // Invalidates the current chat.whatsapp.com link; returns the new code.
  const newCode = await chat.revokeInvite();
  return typeof newCode === "string" ? newCode : "";
}

/**
 * Release a pooled group back to the free pool: remove every member except the
 * bot and the retained staff phones, rename to a neutral free name, and revoke
 * the invite link so the previous cohort can't rejoin. This is the "reuse, don't
 * delete" reset — the bot does it (not the web side) because only it knows the
 * group's current membership.
 */
async function handleResetGroup(data: any): Promise<any> {
  const groupId = data.target?.id;
  if (!groupId) throw new Error("reset-group needs target.id");
  const freeName = String(data.groupName || data.freeName || "iesports • available").trim();
  const retainedDigits = new Set(
    (Array.isArray(data.retainedPhones) ? data.retainedPhones : [])
      .map((p: string) => String(p).replace(/[^\d]/g, ""))
      .filter(Boolean),
  );
  const chat: any = await client.getChatById(groupId);
  if (!chat?.isGroup) throw new Error(`${groupId} is not a group`);
  const selfDigits = String(client.info?.wid?.user || "").replace(/[^\d]/g, "");
  const toRemove: string[] = (chat.participants || [])
    .map((p: any) => p.id?._serialized)
    .filter(Boolean)
    .filter((sid: string) => {
      const digits = String(sid).split("@")[0].replace(/[^\d]/g, "");
      return digits && digits !== selfDigits && !retainedDigits.has(digits);
    });
  let removed = 0;
  if (toRemove.length > 0) {
    await chat.removeParticipants(toRemove);
    removed = toRemove.length;
  }
  await chat.setSubject(freeName);
  let newInvite = "";
  try { newInvite = await chat.revokeInvite(); }
  catch (e: any) { console.warn("[WA] reset-group revokeInvite failed:", e?.message || e); }
  return { removed, name: freeName, invite: newInvite };
}

async function handleRemoveParticipants(data: any): Promise<any> {
  const groupId = data.target?.id;
  const phones: string[] = Array.isArray(data.participantPhones) ? data.participantPhones : [];
  if (!groupId || phones.length === 0) throw new Error("remove-participants needs target.id + participantPhones");
  const chat: any = await client.getChatById(groupId);
  if (!chat?.isGroup) throw new Error(`${groupId} is not a group`);
  const ids = phones.map(phoneToChatId);
  const res = await chat.removeParticipants(ids);
  return res;
}

/**
 * Dispatch one outbox doc. Returns the settled value (or undefined) on
 * success; throws on error. Legacy docs with no `action` field are treated
 * as send-text to the env-configured group.
 */
async function dispatch(data: any): Promise<any> {
  const action = data.action || (data.text ? "send-text" : null);
  if (!action) throw new Error("no action and no text");
  // Legacy: no action + text → send to env group.
  if (!data.action && data.text && !data.target) {
    if (!GROUP_ID) throw new Error("legacy outbox doc but no WHATSAPP_GROUP_ID resolved");
    return handleSendText({ ...data, target: { type: "group", id: GROUP_ID } });
  }
  switch (action) {
    case "send-text":           return handleSendText(data);
    case "send-media":          return handleSendMedia(data);
    case "send-poll":           return handleSendPoll(data);
    case "create-group":        return handleCreateGroup(data);
    case "add-participants":    return handleAddParticipants(data);
    case "remove-participants": return handleRemoveParticipants(data);
    case "rename-group":        return handleRenameGroup(data);
    case "revoke-invite":       return handleRevokeInvite(data);
    case "reset-group":         return handleResetGroup(data);
    default: throw new Error(`unknown action: ${action}`);
  }
}

async function drainOutbox() {
  if (!ready || processing) return;
  processing = true;
  try {
    const snap = await db.collection("whatsappOutbox")
      .where("status", "==", "pending").limit(20).get();
    if (snap.empty) return;
    const docs = snap.docs.sort((a, b) =>
      String(a.data().createdAt || "").localeCompare(String(b.data().createdAt || "")));
    for (const d of docs) {
      const data = d.data() as any;
      // dedupe — if a message with this key already sent, skip
      if (data.dedupeKey) {
        const dupe = await db.collection("whatsappOutbox")
          .where("dedupeKey", "==", data.dedupeKey).where("status", "==", "sent").limit(1).get();
        if (!dupe.empty) {
          await d.ref.set({ status: "skipped", reason: "dedupe", updatedAt: new Date().toISOString() }, { merge: true });
          continue;
        }
      }
      try {
        const settled = await dispatch(data);
        await settle(data.settleDocPath, data.settleField, settled);
        await d.ref.set({
          status: "sent",
          sentAt: new Date().toISOString(),
          ...(settled !== undefined ? { settled } : {}),
        }, { merge: true });
        console.log(`[WA] sent ${d.id} (${data.action || "legacy"})`);
      } catch (e: any) {
        const attempts = (data.attempts || 0) + 1;
        const fatal = attempts >= 5;
        await d.ref.set({
          status: fatal ? "error" : "pending",
          attempts,
          error: String(e?.message || e),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
        console.error(`[WA] ${data.action || "legacy"} ${d.id} failed (attempt ${attempts}): ${e?.message || e}`);
      }
    }
  } catch (e: any) {
    console.error("[WA] drain error:", e?.message || e);
  } finally {
    processing = false;
  }
}

client.on("ready", async () => {
  const g = await resolveLegacyGroup();
  if (g) {
    console.log(`[WA] ✅ ready — legacy group "${g.name}" (${g.id})`);
    setStatus({ state: "ready", groupId: g.id, groupName: g.name, lastError: null });
  } else {
    console.log(`[WA] ✅ ready — no legacy group configured (only typed outbox docs will dispatch)`);
    setStatus({ state: "ready", lastError: null });
  }
  ready = true;

  // Live listener for new pending messages + a safety poll every 15s.
  db.collection("whatsappOutbox").where("status", "==", "pending")
    .onSnapshot(() => { drainOutbox(); }, (err) => console.error("[WA] snapshot error:", err?.message || err));
  setInterval(drainOutbox, 15000);
  drainOutbox();
});

console.log("[WA] initializing WhatsApp Web client…");
setStatus({ state: "init" });
client.initialize().catch((e: any) => { console.error("[WA] init failed:", e?.message || e); process.exit(1); });

process.on("SIGTERM", () => { console.log("[WA] SIGTERM"); client.destroy().finally(() => process.exit(0)); });
process.on("SIGINT", () => { console.log("[WA] SIGINT"); client.destroy().finally(() => process.exit(0)); });
