/**
 * One-off, 27 Aug 2026.
 *
 * Harsh Chadha (`discord_336082463728205824`) paid ₹500 for Horizon on 11 Aug.
 * The registration that settlement fired straight after failed with "Full name
 * is required" — under "seat first, setup after" his profile was still empty at
 * that moment. He came back later and added his name and phone but never linked
 * a Riot ID, so he has been holding a paid slot outside the tournament for over
 * two weeks and nothing ever told him.
 *
 * This DMs him about finishing his details. It deliberately says nothing about
 * a refund: he still wants to play, his slot is held, and offering money back
 * to someone who has not asked for it turns a fixable gap into a cancellation.
 *
 * The recurring version of this is /api/cron/payments-watch, which now nudges
 * anyone in this state within a couple of hours. This script exists because
 * Harsh predates it.
 *
 *   npx tsx scripts/ad-hoc/_dmHorizonUnfinishedSetup.ts
 *   npx tsx scripts/ad-hoc/_dmHorizonUnfinishedSetup.ts --apply
 */
import { config } from "dotenv";
import * as path from "path";
config({ path: path.resolve(__dirname, "../../.env.local") });

const APPLY = process.argv.includes("--apply");
const UID = "discord_336082463728205824";
const TID = "league-of-rising-stars-horizon";

(async () => {
  const { adminDb } = await import("../../lib/firebaseAdmin");
  const { sendDM } = await import("../../lib/discord");

  const [userSnap, tSnap, entSnap] = await Promise.all([
    adminDb.collection("users").doc(UID).get(),
    adminDb.collection("valorantTournaments").doc(TID).get(),
    adminDb.collection("paidEntries").doc(`valorant__${TID}__${UID}`).get(),
  ]);

  const u = (userSnap.data() || {}) as any;
  const t = (tSnap.data() || {}) as any;

  const missing = [
    !u.fullName && "your full name",
    !(u.phone || u.phoneNumber) && "your phone number",
    !u.discordId && "your Discord account",
    !u.riotGameName && "your Riot ID",
  ].filter(Boolean) as string[];

  console.log(`player:      ${u.fullName || UID}`);
  console.log(`entitlement: ${entSnap.exists ? "GRANTED (slot is held)" : "MISSING — do not send this, check the payment first"}`);
  console.log(`registered:  ${((u.registeredValorantTournaments || []) as string[]).includes(TID) ? "yes — nothing to chase" : "no"}`);
  console.log(`missing:     ${missing.length ? missing.join(", ") : "nothing"}`);

  if (!entSnap.exists) { console.log("\nno entitlement — stopping."); return; }
  if (!missing.length) { console.log("\nnothing missing — stopping."); return; }

  // The link goes to a real person, so it never comes from .env.local: running
  // this locally would DM them a localhost URL. Pass --base to override.
  const base = process.argv.find(a => a.startsWith("--base="))?.split("=")[1] || "https://iesports.in";
  if (/localhost|127\.0\.0\.1/.test(base)) { console.log("\nbase is localhost, refusing to send."); return; }

  const link = `${base}/valorant/tournament/${TID}`;
  const message = [
    `Hey ${u.fullName?.split(" ")[0] || "there"}, your slot in **${t.name || "HORIZON - ROUND 1"}** is paid for and still held for you.`,
    ``,
    `We just never got ${missing.join(" and ")}, so you are not on the roster yet. Add it here and you are in:`,
    link,
    ``,
    `Takes a minute, and you will not be charged again. This only finishes what you already paid for. Reply here if anything is stuck.`,
  ].join("\n");

  console.log(`\n--- message ---\n${message}\n---------------`);

  if (!APPLY) { console.log("\nDRY RUN — re-run with --apply to send"); return; }

  const discordId = u.discordId || UID.replace("discord_", "");
  const res = await sendDM(discordId, message);
  console.log(res.ok ? "\nsent." : `\nFAILED: ${res.error}`);
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
