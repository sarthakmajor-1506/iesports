/**
 * Horizon, 14 Sep 2026: solo registration → team registration.
 *
 * Sarthak's call: solo entries are cancelled outright and refunded in full,
 * manually (he calls anyone who does not send a UPI ID). Refunds are kept
 * entirely separate from team registration — no credit, no discount.
 *
 * Steps (each can be run on its own with --only=):
 *
 *   roster    remove every solo player from the roster (website), release any
 *             paid slot hold, void each solo entitlement, and record
 *             refunds/{txnid} as `owed` with method "manual". The refund record
 *             is what stops `payuTools reconcile --apply` and the payments cron
 *             from treating these players as broken registrations and putting
 *             them back in.
 *   dm        DM each payer: tournament is now teams, entry cancelled, reply
 *             with a UPI ID for the ₹500 (replies forward to #direct-messages).
 *   announce  post the format change to #announcements.
 *
 * ORDER: deploy the team-registration code first, then run this, then
 * convertToTeamRegistration.ts --apply. Production without the new code still
 * takes solo registrations.
 *
 *   npx tsx scripts/ad-hoc/_horizonCancelSoloEntries.ts                     # dry run, prints messages
 *   npx tsx scripts/ad-hoc/_horizonCancelSoloEntries.ts --apply
 *   npx tsx scripts/ad-hoc/_horizonCancelSoloEntries.ts --only=announce --apply
 */
import { config } from "dotenv";
import * as path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { releaseSoloSlot, releaseHold } from "@/lib/registrationSlots";
import { paidEntryId } from "@/lib/paidEntry";
import { sendDM, sendChannelMessage } from "@/lib/discord";
import { recalcTiers } from "@/lib/recalcTiers";
import { syncPlayerSnapshot } from "@/lib/valorantPlayerSnapshot";

config({ path: path.resolve(__dirname, "../../.env.local") });

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

const TID = "league-of-rising-stars-horizon";
const LINK = `https://www.iesports.in/valorant/tournament/${TID}`;
const ANNOUNCEMENTS_CHANNEL_ID = "1475548984859951307"; // #announcements

// Sarthak's own account — its ₹500 was a live test. Removed from the roster
// like everyone else, but no refund record and no DM.
const OWN_ACCOUNTS = new Set(["discord_1302366375263735808"]);

const APPLY = process.argv.includes("--apply");
const only = process.argv.find(a => a.startsWith("--only="))?.split("=")[1]?.split(",");
const step = (s: string) => !only || only.includes(s);

const dmText = (firstName: string) => [
  `Hi ${firstName}, an update on **League of Rising Stars: Horizon**.`,
  ``,
  `We've changed it from a solo tournament to a **team tournament** — ₹2,000 per team of 5, captain registers the team and teammates join free with a code. Because of that, all solo registrations have been cancelled and you've been removed from the player list.`,
  ``,
  `Your **₹500 entry fee will be refunded in full.** Please reply to this message with your **UPI ID** so we can send it. If we don't hear from you, we'll give you a call.`,
  ``,
  `Want to play with a team? Register here: ${LINK}`,
].join("\n");

const ANNOUNCEMENT = [
  `📢 **League of Rising Stars: Horizon is now a TEAM tournament**`,
  ``,
  `• **₹2,000 per team of 5** · prize pool **₹8,000**, winner takes all`,
  `• The captain registers the team, pays once and gets a **team code**`,
  `• Teammates join **free** with the code — every player needs a linked Riot ID`,
  `• **4 team slots** · registration closes **24 September**`,
  `• Match day **27 September** · check-in on Discord from 10:30 AM IST`,
  ``,
  `Registered solo before? Your entry has been cancelled and your ₹500 will be refunded in full — check your DMs.`,
  ``,
  `Register your team 👉 ${LINK}`,
].join("\n");

async function main() {
  const tRef = db.collection("valorantTournaments").doc(TID);
  const t = (await tRef.get()).data() as any;
  if (!t) throw new Error("Horizon not found");

  const paid = (await db.collection("payments").where("tournamentId", "==", TID).where("status", "==", "paid").get())
    .docs.map(d => ({ txnid: d.id, ...(d.data() as any) }))
    .filter(p => p.game === "valorant" && p.mode !== "team_create");
  const roster = await tRef.collection("soloPlayers").get();
  const holds = await tRef.collection("slotHolds").get();

  const uids = Array.from(new Set([...paid.map(p => p.uid), ...roster.docs.map(d => d.id)]));
  const people = await Promise.all(uids.map(async uid => {
    const u = ((await db.collection("users").doc(uid).get()).data() || {}) as any;
    const payment = paid.filter(p => p.uid === uid).sort((a, b) => String(b.settledAt || "").localeCompare(String(a.settledAt || "")))[0];
    const refund = payment ? (await db.collection("refunds").doc(payment.txnid).get()).data() : null;
    return {
      uid, u, payment, refund,
      onRoster: roster.docs.some(d => d.id === uid),
      own: OWN_ACCOUNTS.has(uid),
      discordId: u.discordId || (uid.startsWith("discord_") ? uid.slice(8) : ""),
      firstName: String(u.fullName || u.discordUsername || "there").split(" ")[0],
    };
  }));

  console.log(`\n=== ${t.name} — solo entries (format now: ${t.registrationMode || "solo"}) ===\n`);
  for (const p of people) {
    console.log(`  ${p.uid.padEnd(30)} ${(p.u.fullName || "?").padEnd(18)} ${(p.u.riotGameName ? `${p.u.riotGameName}#${p.u.riotTagLine}` : "(no Riot ID)").padEnd(18)} ${p.onRoster ? "ON SITE " : "off site"}  ${p.payment ? `paid ₹${p.payment.amount} ${p.payment.txnid}` : "no payment"}${p.own ? "  [own account: no refund/DM]" : ""}${p.refund ? `  refund already ${p.refund.status}` : ""}  UPI: ${p.u.upiId || "—"}  phone: ${p.u.phone || p.u.phoneNumber || "—"}`);
  }
  console.log(`\n  slot holds: ${holds.size}   slotsBooked: ${t.slotsBooked}`);

  const refundees = people.filter(p => p.payment && !p.own);
  if (step("dm")) {
    console.log(`\n=== DM (to ${refundees.length}) ===\n`);
    console.log(dmText("<name>").split("\n").map(l => `  │ ${l}`).join("\n"));
  }
  if (step("announce")) {
    console.log(`\n=== #announcements ===\n`);
    console.log(ANNOUNCEMENT.split("\n").map(l => `  │ ${l}`).join("\n"));
  }

  if (!APPLY) { console.log(`\nDRY RUN — nothing written or sent. Re-run with --apply${only ? ` --only=${only.join(",")}` : ""}.`); return; }

  if (step("roster")) {
    console.log(`\n→ roster`);
    for (const p of people) {
      if (p.onRoster) {
        const r = await releaseSoloSlot({ game: "valorant", tournamentId: TID, uid: p.uid });
        console.log(`  removed ${p.uid}: ${r.ok ? `slotsBooked now ${r.slotsBooked}` : r.reason}`);
      }
      await releaseHold("valorant", TID, p.uid);
      await db.collection("paidEntries").doc(paidEntryId("valorant", TID, p.uid)).set(
        { voided: true, voidedAt: new Date().toISOString(), voidReason: "solo registration cancelled — Horizon changed to team registration" },
        { merge: true }
      );
      if (p.payment && !p.own && !p.refund) {
        await db.collection("refunds").doc(p.payment.txnid).set({
          txnid: p.payment.txnid,
          uid: p.uid,
          game: "valorant",
          tournamentId: TID,
          tournamentName: t.name || TID,
          amount: Number(p.payment.amount) || 0,
          status: "owed",
          method: "manual",
          reason: "solo registration cancelled — Horizon changed to team registration",
          upiId: p.u.upiId || null,
          playerName: p.u.fullName || p.u.riotGameName || "",
          discordId: p.discordId,
          phone: p.u.phone || p.u.phoneNumber || "",
          payuMihpayid: p.payment.payuMihpayid || null,
          openedAt: new Date().toISOString(),
        });
        console.log(`  refund owed ₹${p.payment.amount} → ${p.uid} (${p.payment.txnid})`);
      }
    }
    await recalcTiers(TID);
    await syncPlayerSnapshot(TID);
  }

  if (step("dm")) {
    console.log(`\n→ dm`);
    for (const p of refundees) {
      if (!p.discordId) { console.log(`  ${p.uid}: no Discord ID — call them`); continue; }
      const r = await sendDM(p.discordId, dmText(p.firstName));
      console.log(`  ${p.uid}: ${r.ok ? "sent" : `FAILED — ${r.error} (call them)`}`);
    }
  }

  if (step("announce")) {
    const r = await sendChannelMessage(ANNOUNCEMENTS_CHANNEL_ID, ANNOUNCEMENT);
    console.log(`\n→ announce: ${r.ok ? "posted to #announcements" : `FAILED — ${r.error}`}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
