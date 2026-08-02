/**
 * PayU ops + test harness.
 *
 * Testing a gateway end to end needs a browser: PayU's checkout is a page the
 * player is redirected to, so `build` writes a self-submitting form you open
 * once. Everything else here is for reading state back.
 *
 *   npx tsx scripts/dev-tools/payuTools.ts list
 *   npx tsx scripts/dev-tools/payuTools.ts fee --game=cs2 --id=<tournamentId> --fee=10 --apply
 *   npx tsx scripts/dev-tools/payuTools.ts build --game=cs2 --id=<tournamentId> --uid=<uid> [--base=http://localhost:3000]
 *   npx tsx scripts/dev-tools/payuTools.ts show --txnid=<txnid>
 *   npx tsx scripts/dev-tools/payuTools.ts payments [--limit=20]
 */
import { config } from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { PAID_GAMES, paidEntryId, type PaidGame } from "@/lib/paidEntry";

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

const COLLECTIONS: Record<string, string> = {
  dota2: "tournaments",
  dota_solo: "soloTournaments",
  valorant: "valorantTournaments",
  cs2: "cs2Tournaments",
};

/**
 * Which PayU environment a payment came from. Documents written before
 * `payuEnv` existed are inferred from the merchant key recorded at initiate,
 * which settlement never touches.
 */
const payuEnvOf = (p: any): string => {
  if (p.payuEnv === "live" || p.payuEnv === "test") return p.payuEnv;
  if (!p.payuKey) return "unknown";
  const testKey = process.env.PAYU_TEST_KEY || process.env.PAYU_MERCHANT_KEY;
  return p.payuKey === testKey ? "test" : "live";
};

const cmd = process.argv[2] || "list";
const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const APPLY = process.argv.includes("--apply");

async function list() {
  for (const [game, collection] of Object.entries(COLLECTIONS)) {
    const snap = await db.collection(collection).get();
    console.log(`\n=== ${game} (${collection}) — ${snap.size} ===`);
    for (const d of snap.docs) {
      const t: any = d.data();
      const fee = Number(t.entryFee) || 0;
      const flag = t.isTestTournament ? "TEST" : "live";
      console.log(`  [${flag}] ${d.id}\n         name="${t.name}"  entryFee=₹${fee}  status=${t.status}  slots=${t.slotsBooked || 0}/${t.totalSlots || 0}`);
    }
  }
}

async function fee() {
  const game = arg("game") || "";
  const id = arg("id") || "";
  const value = Number(arg("fee"));
  if (!COLLECTIONS[game] || !id || !Number.isFinite(value)) {
    console.error("need --game=<dota2|dota_solo|valorant|cs2> --id=<tournamentId> --fee=<rupees>");
    process.exit(1);
  }

  const ref = db.collection(COLLECTIONS[game]).doc(id);
  const snap = await ref.get();
  if (!snap.exists) { console.error(`no such tournament: ${COLLECTIONS[game]}/${id}`); process.exit(1); }

  const t: any = snap.data();
  console.log(`${t.name} — entryFee ₹${Number(t.entryFee) || 0} → ₹${value}`);
  if (!t.isTestTournament) console.log("  ⚠ this is NOT flagged as a test tournament");

  if (!APPLY) { console.log("DRY RUN — re-run with --apply"); return; }
  await ref.update({ entryFee: value });
  console.log("done.");
}

/** Calls the real initiate endpoint and writes a form that posts to PayU. */
async function build() {
  const game = arg("game") || "";
  const id = arg("id") || "";
  const uid = arg("uid") || "";
  const base = arg("base") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const mode = arg("mode") || "solo";
  if (!game || !id || !uid) { console.error("need --game= --id= --uid="); process.exit(1); }

  const res = await fetch(`${base}/api/payments/payu/initiate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, game, tournamentId: id, mode }),
  });
  const data: any = await res.json();

  if (!res.ok) { console.error(`initiate failed (${res.status}):`, data.error); process.exit(1); }
  if (data.free) { console.error("tournament is free — set an entry fee first (see `fee` command)"); process.exit(1); }
  if (data.alreadyPaid) { console.error("this uid has already paid for this tournament"); process.exit(1); }

  const inputs = Object.entries(data.params)
    .map(([k, v]) => `      <input type="hidden" name="${k}" value="${String(v).replace(/"/g, "&quot;")}">`)
    .join("\n");

  const html = `<!doctype html>
<meta charset="utf-8">
<title>PayU checkout — ${data.txnid}</title>
<body style="font-family:system-ui;background:#111;color:#eee;padding:40px">
  <h2>Handing off to PayU…</h2>
  <p>txnid <code>${data.txnid}</code> → <code>${data.action}</code></p>
  <p>If nothing happens, press the button.</p>
  <form id="f" method="POST" action="${data.action}">
${inputs}
    <button type="submit" style="padding:12px 20px;font-size:15px">Pay now</button>
  </form>
  <script>document.getElementById('f').submit();</script>
</body>`;

  // Served by the dev server rather than opened as file:// — a form POST from
  // a file:// origin is treated as opaque by some browsers, and the redirect
  // back to localhost has to land in the same browsing context anyway.
  const dir = path.resolve(__dirname, "../../public/_payu");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${data.txnid}.html`), html, "utf8");

  console.log(`txnid:  ${data.txnid}`);
  console.log(`action: ${data.action}`);
  console.log(`amount: ₹${data.params.amount}`);
  console.log(`surl:   ${data.params.surl}`);
  console.log(`\nopen this to pay:\n  ${base}/_payu/${data.txnid}.html`);
}

async function show() {
  const txnid = arg("txnid") || "";
  if (!txnid) { console.error("need --txnid="); process.exit(1); }
  const snap = await db.collection("payments").doc(txnid).get();
  if (!snap.exists) { console.error("no such payment"); process.exit(1); }
  console.dir(snap.data(), { depth: 6 });

  const p: any = snap.data();
  const ent = await db.collection("paidEntries").doc(`${p.game}__${p.tournamentId}__${p.uid}`).get();
  console.log(`\npaidEntries doc: ${ent.exists ? "GRANTED" : "not granted"}`);
}

async function payments() {
  const limit = Number(arg("limit")) || 20;
  const snap = await db.collection("payments").orderBy("createdAt", "desc").limit(limit).get();
  console.log(`=== ${snap.size} most recent payments ===`);
  for (const d of snap.docs) {
    const p: any = d.data();
    console.log(`  ${p.status.padEnd(9)} [${payuEnvOf(p).padEnd(4)}] ₹${String(p.amount).padEnd(6)} ${d.id}  ${p.game}/${p.tournamentId}  uid=${p.uid}  reg=${p.registration?.ok ? "yes" : "no"}  ${p.settleNote || ""}`);
  }
}

/**
 * Re-run settlement for a payment that ended up `failed` or `review`.
 *
 * Goes through the running server's status endpoint rather than calling the
 * settle library directly, so what gets exercised is the same code path a
 * player's browser would hit.
 */
async function resettle() {
  const txnid = arg("txnid") || "";
  const base = arg("base") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  if (!txnid) { console.error("need --txnid="); process.exit(1); }

  const ref = db.collection("payments").doc(txnid);
  const before = await ref.get();
  if (!before.exists) { console.error("no such payment"); process.exit(1); }
  const prev: any = before.data();
  if (prev.status === "paid") { console.log("already paid — nothing to re-settle"); return; }

  console.log(`${txnid}: ${prev.status} (${prev.settleNote || "no note"})`);
  if (!APPLY) { console.log("DRY RUN — re-run with --apply"); return; }

  // The status endpoint only re-verifies transactions that are still open, so
  // reopen it first. PayU remains the authority on what it becomes next.
  await ref.update({ status: "pending" });
  const res = await fetch(`${base}/api/payments/status?txnid=${encodeURIComponent(txnid)}`, { cache: "no-store" });
  const data: any = await res.json();
  console.log(`→ ${data.status}  registered=${data.registered}  ${data.note || ""}`);
}

/**
 * Reconcile money against access: everyone who paid must be registered.
 *
 * Three independent facts have to agree for a paid player, and each is written
 * by a different step, so any one of them can be missing:
 *
 *   payments/{txnid}.status == "paid"        PayU took the money
 *   paidEntries/{game__tid__uid}             they are entitled to a slot
 *   users/{uid}.registered*Tournaments       they actually hold one
 *
 * The user array is the check rather than a per-game player document because
 * every registration path writes it — solo, team create and team join alike.
 *
 * Repairs re-grant the entitlement and replay the normal registration route, so
 * a repaired registration is indistinguishable from one that worked first time.
 *
 *   npx tsx scripts/dev-tools/payuTools.ts reconcile
 *   npx tsx scripts/dev-tools/payuTools.ts reconcile --base=https://www.iesports.in --apply
 */
async function reconcile() {
  const base = arg("base") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const paidSnap = await db.collection("payments").where("status", "==", "paid").get();
  const reviewSnap = await db.collection("payments").where("status", "==", "review").get();
  const entitlementSnap = await db.collection("paidEntries").get();

  const broken: { p: any; txnid: string; missingEntitlement: boolean; missingRegistration: boolean }[] = [];
  // Test-mode payments sit in the same collection as real ones. Summing them
  // together would report sandbox rupees as revenue, so they are counted apart.
  const collected: Record<string, number> = { live: 0, test: 0 };

  console.log(`=== ${paidSnap.size} paid payment(s) ===\n`);

  for (const d of paidSnap.docs) {
    const p: any = d.data();
    const env = payuEnvOf(p);
    collected[env] = (collected[env] || 0) + (Number(p.amount) || 0);

    const cfg = PAID_GAMES[p.game as PaidGame];
    if (!cfg) { console.log(`  ?? ${d.id} unknown game "${p.game}"`); continue; }

    const ent = await db.collection("paidEntries").doc(paidEntryId(p.game, p.tournamentId, p.uid)).get();
    const user = await db.collection("users").doc(p.uid).get();
    const registered = ((user.data() as any)?.[cfg.registeredField] || []).includes(p.tournamentId);

    const missingEntitlement = !ent.exists;
    const missingRegistration = !registered;
    const ok = !missingEntitlement && !missingRegistration;

    console.log(`  ${ok ? "OK  " : "FIX "} [${env.padEnd(4)}] ₹${String(p.amount).padEnd(5)} ${d.id}  ${p.game}/${p.tournamentId}  ${p.uid}`);
    if (missingEntitlement) console.log(`        no entitlement — paid but holds no claim to a slot`);
    if (missingRegistration) console.log(`        PAID BUT NOT REGISTERED${p.registration?.error ? ` — ${p.registration.error}` : ""}`);

    if (!ok) broken.push({ p, txnid: d.id, missingEntitlement, missingRegistration });
  }

  // An entitlement with no paid payment behind it means someone can register
  // for free. Reported, never auto-deleted — revoking access is a human call.
  const paidKeys = new Set(paidSnap.docs.map(d => {
    const p: any = d.data();
    return paidEntryId(p.game, p.tournamentId, p.uid);
  }));
  const orphans = entitlementSnap.docs.filter(d => !paidKeys.has(d.id));

  // The other direction: players holding a slot in a paid tournament with no
  // payment behind them. Usually people who registered before the fee existed
  // or before the gate shipped. They are not fraud and must not be removed
  // automatically — grandfathering them is often the right answer — but they
  // are unbilled revenue and you should know who they are.
  console.log(`\n=== registered without paying ===`);
  let unbilled = 0;

  for (const [game, cfg] of Object.entries(PAID_GAMES) as [PaidGame, typeof PAID_GAMES[PaidGame]][]) {
    const tournaments = await db.collection(cfg.collection).get();
    for (const t of tournaments.docs) {
      const fee = Number((t.data() as any).entryFee) || 0;
      if (fee <= 0) continue;

      const players = await t.ref.collection(cfg.playersSubcollection).get();
      const freeloaders: string[] = [];
      for (const p of players.docs) {
        const ent = await db.collection("paidEntries").doc(paidEntryId(game, t.id, p.id)).get();
        if (!ent.exists) freeloaders.push(p.id);
      }
      if (!freeloaders.length) continue;

      unbilled += freeloaders.length * fee;
      console.log(`  ${cfg.label} — ${(t.data() as any).name}  (₹${fee}/player)`);
      for (const uid of freeloaders) {
        const u = await db.collection("users").doc(uid).get();
        console.log(`      ${uid}  ${(u.data() as any)?.fullName || "?"}`);
      }
    }
  }
  if (!unbilled) console.log(`  none`);
  else console.log(`  → ₹${unbilled} of entry fees unbilled`);

  console.log(`\n=== summary ===`);
  console.log(`  paid payments      ${paidSnap.size}`);
  console.log(`  collected (LIVE)   ₹${collected.live || 0}   ← real money`);
  console.log(`  collected (test)   ₹${collected.test || 0}   sandbox, not revenue`);
  if (collected.unknown) console.log(`  collected (?)      ₹${collected.unknown}`);
  console.log(`  needing repair     ${broken.length}`);
  console.log(`  awaiting review    ${reviewSnap.size}${reviewSnap.size ? "  ← settled with an anomaly, check these by hand" : ""}`);
  console.log(`  orphan entitlements ${orphans.length}${orphans.length ? "  ← access without a paid payment" : ""}`);
  for (const o of orphans) console.log(`        ${o.id}`);

  if (!broken.length) { console.log(`\nnothing to repair.`); return; }
  if (!APPLY) { console.log(`\nDRY RUN — re-run with --apply --base=<site> to repair.`); return; }

  console.log(`\nrepairing against ${base}`);
  for (const b of broken) {
    const cfg = PAID_GAMES[b.p.game as PaidGame];
    const endpoint = cfg.endpoints[(b.p.mode || "solo") as keyof typeof cfg.endpoints];

    await db.collection("paidEntries").doc(paidEntryId(b.p.game, b.p.tournamentId, b.p.uid)).set(
      { game: b.p.game, tournamentId: b.p.tournamentId, uid: b.p.uid, txnid: b.txnid, amount: b.p.amount, paidAt: b.p.settledAt || new Date().toISOString() },
      { merge: true }
    );

    if (!endpoint) { console.log(`  ${b.txnid}: entitlement restored; ${b.p.mode} must be completed by the player`); continue; }

    try {
      const res = await fetch(`${base}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: b.p.tournamentId, uid: b.p.uid }),
      });
      const data: any = await res.json().catch(() => ({}));
      const ok = res.ok || /already registered|already in/i.test(data?.error || "");
      await db.collection("payments").doc(b.txnid).set(
        { registration: { ok, attemptedAt: new Date().toISOString(), endpoint, error: ok ? null : data?.error || `HTTP ${res.status}`, repairedBy: "reconcile" } },
        { merge: true }
      );
      console.log(`  ${b.txnid}: ${ok ? "registered" : `STILL FAILING — ${data?.error || res.status}`}`);
    } catch (e: any) {
      console.log(`  ${b.txnid}: repair call failed — ${e?.message || e}`);
    }
  }
}

const commands: Record<string, () => Promise<void>> = { list, fee, build, show, payments, resettle, reconcile };
const run = commands[cmd];
if (!run) { console.error(`unknown command "${cmd}" — one of: ${Object.keys(commands).join(", ")}`); process.exit(1); }
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
