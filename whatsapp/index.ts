/**
 * IEsports WhatsApp sender.
 *
 * Mirrors the Discord result flow for WhatsApp: result-fetch code (web/bot)
 * writes a doc to the `whatsappOutbox` Firestore collection; this persistent
 * service — logged into WhatsApp Web once via QR — consumes pending docs and
 * posts them to the configured group.
 *
 *   whatsappOutbox/{id}: { text, status:"pending"|"sent"|"error"|"skipped",
 *                          dedupeKey?, source?, createdAt, attempts?, error? }
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
const { Client, LocalAuth } = pkg as any;
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

let ready = false;
let processing = false;

async function resolveGroup(): Promise<{ id: string; name: string } | null> {
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
      const text = String(data.text || "").trim();
      if (!text) { await d.ref.set({ status: "error", error: "empty text" }, { merge: true }); continue; }
      try {
        await client.sendMessage(GROUP_ID, text);
        await d.ref.set({ status: "sent", sentAt: new Date().toISOString() }, { merge: true });
        console.log(`[WA] sent ${d.id} (${text.length} chars)`);
      } catch (e: any) {
        const attempts = (data.attempts || 0) + 1;
        const fatal = attempts >= 5;
        await d.ref.set({
          status: fatal ? "error" : "pending",
          attempts,
          error: String(e?.message || e),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
        console.error(`[WA] send ${d.id} failed (attempt ${attempts}): ${e?.message || e}`);
      }
    }
  } catch (e: any) {
    console.error("[WA] drain error:", e?.message || e);
  } finally {
    processing = false;
  }
}

client.on("ready", async () => {
  const g = await resolveGroup();
  if (!g) { setStatus({ state: "ready_no_group", lastError: "group not found" }); console.error("[WA] no target group — set WHATSAPP_GROUP_NAME/ID"); return; }
  ready = true;
  console.log(`[WA] ✅ ready — posting to "${g.name}" (${g.id})`);
  setStatus({ state: "ready", groupId: g.id, groupName: g.name, lastError: null });

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
