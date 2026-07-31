/**
 * One-shot setup for a hidden, ₹10-entry CS2 solo test tournament — used to
 * exercise the PayU payment flow end to end (see docs/CLAUDE.md's "PayU
 * Payment Gateway" section) without touching real registration data.
 *
 * isTestTournament: true keeps it out of /api/featured-tournaments and
 * /api/tournaments/list. CS2 solo was picked for this test because it has
 * no extra rank-refresh/Elo side effects (unlike Valorant) and no deadline
 * gate (unlike Dota solo) — the simplest path through the payment webhook.
 *
 * Run:
 *   npx tsx scripts/setupPayuTestTournament.ts             # create
 *   npx tsx scripts/setupPayuTestTournament.ts teardown    # delete
 */
import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = admin.firestore();

const TOURNAMENT_ID = "test-payu-cs2-solo";

async function setup() {
  const ref = db.collection("cs2Tournaments").doc(TOURNAMENT_ID);
  const now = new Date();
  const later = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  await ref.set({
    id: TOURNAMENT_ID,
    name: "TEST — PayU CS2 Solo",
    game: "cs2",
    format: "shuffle",
    status: "upcoming",
    isTestTournament: true,
    entryFee: 10,
    prizePool: "0",
    totalSlots: 5,
    slotsBooked: 0,
    registrationDeadline: later.toISOString(),
    startDate: later.toISOString(),
    endDate: later.toISOString(),
    desc: "Internal PayU payment-flow test. Do not promote.",
  }, { merge: true });

  console.log(`✓ Tournament: ${TOURNAMENT_ID} (cs2Tournaments)`);
  console.log(`✓ entryFee: ₹10, totalSlots: 5, slotsBooked: 0`);
  console.log(`✓ Hidden from website (isTestTournament: true)`);
  console.log(``);
  console.log(`Register via the CS2 tournament page — you'll need to find/link this`);
  console.log(`tournament by ID since it's hidden from public listings, or temporarily`);
  console.log(`query it in the admin panel / Firestore console.`);
  console.log(``);
  console.log(`To revert: npx tsx scripts/setupPayuTestTournament.ts teardown`);
  process.exit(0);
}

async function teardown() {
  const ref = db.collection("cs2Tournaments").doc(TOURNAMENT_ID);
  const soloPlayers = await ref.collection("soloPlayers").get();
  for (const d of soloPlayers.docs) {
    await d.ref.delete();
    await db.collection("users").doc(d.id).set({
      registeredCS2Tournaments: admin.firestore.FieldValue.arrayRemove(TOURNAMENT_ID),
    }, { merge: true });
  }
  if (soloPlayers.size) console.log(`✓ cleared ${soloPlayers.size} registration(s), unlinked from user docs`);

  const orders = await db.collection("payuOrders").where("tournamentId", "==", TOURNAMENT_ID).get();
  for (const d of orders.docs) await d.ref.delete();
  if (orders.size) console.log(`✓ cleared ${orders.size} payuOrders doc(s)`);

  await ref.delete();
  console.log(`✓ deleted tournament ${TOURNAMENT_ID}`);
  process.exit(0);
}

const run = process.argv[2] === "teardown" ? teardown : setup;
run().catch((e) => { console.error(e); process.exit(1); });
