/**
 * WhatsApp outbox smoke test — enqueues one of each action type so you can
 * watch the standalone whatsapp/ sender process them end-to-end. Use during
 * Phase 0 verification or after touching the dispatcher.
 *
 * Required env (read from web/.env.local):
 *   FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
 *
 * Required CLI args:
 *   --phone <E.164>      e.g. --phone +919876543210     (a number you can read)
 *   [--group <id>]       e.g. --group 120363xxx@g.us   (any group you're in; optional)
 *   [--tournament <id>]  used as the settle-back doc for create-group
 *   [--media <url>]      https URL to an image; falls back to a public test image
 *   [--skip <a,b,c>]     comma list of actions to skip
 *                        (text-dm | text-group | media | poll | create-group)
 *
 * Run:
 *   cd web
 *   npx tsx scripts/dev-tools/smokeTestWhatsAppOutbox.ts --phone +91xxxxxxxxxx
 *
 * The script writes outbox docs and polls them for ~60s, printing transitions
 * (pending → sent / error / skipped). It does NOT clean up the docs — they
 * stay in Firestore so you can inspect them in the console.
 */
import { config } from "dotenv";
import * as path from "path";
config({ path: path.resolve(__dirname, "../../.env.local") });

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const PHONE = arg("--phone");
const GROUP_ID = arg("--group");
const TOURNAMENT_ID = arg("--tournament");
const MEDIA_URL = arg("--media") || "https://picsum.photos/600/400";
const SKIP = new Set((arg("--skip") || "").split(",").map((s) => s.trim()).filter(Boolean));

if (!PHONE) {
  console.error("usage: smokeTestWhatsAppOutbox.ts --phone +91xxxxxxxxxx [--group <id>] [--tournament <id>] [--media <url>] [--skip text-dm,text-group,...]");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");

async function enqueue(label: string, doc: Record<string, any>): Promise<string> {
  const ref = await db.collection("whatsappOutbox").add({
    ...doc,
    status: "pending",
    source: "smoke-test",
    dedupeKey: `smoke-${label}-${stamp}`,
    createdAt: new Date().toISOString(),
  });
  console.log(`✓ enqueued ${label} → ${ref.id}`);
  return ref.id;
}

(async () => {
  const ids: { label: string; id: string }[] = [];

  if (!SKIP.has("text-dm")) {
    ids.push({ label: "text-dm", id: await enqueue("text-dm", {
      action: "send-text",
      target: { type: "dm", phone: PHONE },
      text: `🧪 *Smoke test (DM)*\nIf you can read this, the WhatsApp DM path is alive. ${stamp}`,
    }) });
  }

  if (!SKIP.has("text-group") && GROUP_ID) {
    ids.push({ label: "text-group", id: await enqueue("text-group", {
      action: "send-text",
      target: { type: "group", id: GROUP_ID },
      text: `🧪 *Smoke test (group)*\nIf you can read this, the WhatsApp group path is alive. ${stamp}`,
    }) });
  } else if (!GROUP_ID) {
    console.log("· text-group skipped (no --group)");
  }

  if (!SKIP.has("media")) {
    ids.push({ label: "media", id: await enqueue("media", {
      action: "send-media",
      target: { type: "dm", phone: PHONE },
      mediaUrl: MEDIA_URL,
      text: `🧪 Smoke test image. ${stamp}`,
    }) });
  }

  if (!SKIP.has("poll")) {
    ids.push({ label: "poll", id: await enqueue("poll", {
      action: "send-poll",
      target: { type: "dm", phone: PHONE },
      pollQuestion: `🧪 Pick a smoke-test answer (${stamp.slice(11, 19)})`,
      pollOptions: ["Working great", "Looks good", "Something off"],
      pollAllowMultiple: false,
    }) });
  }

  if (!SKIP.has("create-group")) {
    // Settle the new group id into a scratch doc so we can read it after.
    const scratchPath = `whatsappSmokeTests/${stamp}`;
    ids.push({ label: "create-group", id: await enqueue("create-group", {
      action: "create-group",
      groupName: `iesports smoke ${stamp.slice(11, 19)}`,
      participantPhones: [PHONE],
      settleDocPath: TOURNAMENT_ID ? `valorantTournaments/${TOURNAMENT_ID}` : scratchPath,
      settleField: TOURNAMENT_ID ? "whatsappSmokeGroupId" : "groupId",
    }) });
    console.log(`   ↳ settle target: ${TOURNAMENT_ID ? `valorantTournaments/${TOURNAMENT_ID}.whatsappSmokeGroupId` : scratchPath + ".groupId"}`);
  }

  console.log("\nwaiting up to 60s for the sender to drain…\n");
  const deadline = Date.now() + 60_000;
  const seen = new Map<string, string>();
  while (Date.now() < deadline) {
    let allDone = true;
    for (const { label, id } of ids) {
      const snap = await db.collection("whatsappOutbox").doc(id).get();
      const status = (snap.data() as any)?.status;
      const error  = (snap.data() as any)?.error;
      const prev = seen.get(id);
      if (status !== prev) {
        seen.set(id, status);
        if (status === "sent")     console.log(`✓ ${label} → sent`);
        else if (status === "skipped") console.log(`· ${label} → skipped (${(snap.data() as any)?.reason || "?"})`);
        else if (status === "error")   console.log(`✗ ${label} → error: ${error}`);
        else                          console.log(`… ${label} → ${status}`);
      }
      if (status === "pending") allDone = false;
    }
    if (allDone) break;
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log("\ndone.");
  process.exit(0);
})();
