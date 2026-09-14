/**
 * Give every already-paid player who is not yet registered a slot hold.
 *
 * Capacity used to be "slotsBooked, or the number of paid entitlements,
 * whichever is larger", read outside any transaction. It is now "slotsBooked
 * plus the live slot holds", counted inside one, which is what stops the last
 * seat being sold to two people at once.
 *
 * The catch is the changeover: anyone who paid BEFORE holds existed has an
 * entitlement and no hold, so the new count would not see them and their seat
 * could be sold to somebody else. This writes the missing holds once.
 *
 * Safe to re-run. Hold documents are keyed by uid, and a player who has since
 * registered is skipped.
 *
 *   npx tsx scripts/dev-tools/backfillSlotHolds.ts
 *   npx tsx scripts/dev-tools/backfillSlotHolds.ts --apply
 */
import { config } from "dotenv";
import * as path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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
const APPLY = process.argv.includes("--apply");

const GAMES: Record<string, { collection: string; players: string; label: string }> = {
  dota2:     { collection: "tournaments",         players: "players",     label: "Dota 2" },
  dota_solo: { collection: "soloTournaments",     players: "players",     label: "Dota 2 Solo" },
  valorant:  { collection: "valorantTournaments", players: "soloPlayers", label: "Valorant" },
  cs2:       { collection: "cs2Tournaments",      players: "soloPlayers", label: "CS2" },
};

(async () => {
  const ents = await db.collection("paidEntries").get();
  let written = 0;

  for (const e of ents.docs) {
    const ent = e.data() as any;
    if (ent.voided === true) continue;

    const cfg = GAMES[ent.game];
    if (!cfg) { console.log(`  ?? unknown game "${ent.game}" on ${e.id}`); continue; }

    const tRef = db.collection(cfg.collection).doc(ent.tournamentId);
    const tSnap = await tRef.get();
    if (!tSnap.exists) { console.log(`  ?? tournament gone: ${e.id}`); continue; }

    const status = String((tSnap.data() as any)?.status || "").toLowerCase();
    if (status === "ended" || status === "completed") continue;

    // Registered players are already in slotsBooked. A hold on top would count
    // them twice and shrink the tournament by one seat.
    const player = await tRef.collection(cfg.players).doc(ent.uid).get();
    if (player.exists) continue;

    const holdRef = tRef.collection("slotHolds").doc(ent.uid);
    if ((await holdRef.get()).exists) continue;

    const user = await db.collection("users").doc(ent.uid).get();
    console.log(`${cfg.label} — ${(tSnap.data() as any)?.name || ent.tournamentId}`);
    console.log(`   hold for ${ent.uid} (${(user.data() as any)?.fullName || "?"}) — paid ₹${ent.amount}, not registered`);

    if (APPLY) {
      await holdRef.set({
        uid: ent.uid,
        txnid: ent.txnid || null,
        paid: true,
        expiresAt: null,
        createdAt: ent.paidAt || new Date().toISOString(),
        paidAt: ent.paidAt || new Date().toISOString(),
        backfilled: true,
      }, { merge: true });
      console.log(`   → written`);
    }
    written++;
  }

  if (!written) console.log("every paid entitlement is either registered or already holding a slot.");
  else if (!APPLY) console.log(`\n${written} hold(s) missing. DRY RUN — re-run with --apply.`);
  else console.log(`\n${written} hold(s) written.`);
})().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
