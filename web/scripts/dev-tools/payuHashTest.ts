/**
 * Regression test for the PayU response-hash check, run against real callbacks.
 *
 * This exists because the hash formula is the one part of the integration that
 * cannot be reasoned out from the docs alone — PayU picks a shape per account,
 * and getting it wrong silently sends good payments to manual review. Every
 * callback we have ever stored is replayed through the shipped verifier, so a
 * change to the formula that breaks a real payment fails here.
 *
 * It also asserts that tampering is still caught: flipping the amount or the
 * status on a genuine callback must invalidate the hash.
 *
 *   npx tsx scripts/dev-tools/payuHashTest.ts
 */
import { config } from "dotenv";
import * as path from "path";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { isResponseHashValid, payuConfig } from "@/lib/payu";

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

(async () => {
  const { salt, key, mode } = payuConfig();
  // Every payment that ever received a signed callback, whatever it settled to.
  const snap = await db.collection("payments").get();
  const signed = snap.docs.filter((d) => (d.data() as any).callbackBody?.hash);

  // A callback can only be verified with the salt that signed it. Test and live
  // payments share this collection, so replaying a live callback under test
  // credentials fails for the right reason and the wrong one — it would look
  // exactly like a broken hash formula. Only replay what this key signed.
  const withBody = signed.filter((d) => (d.data() as any).payuKey === key);
  const skipped = signed.length - withBody.length;

  if (!withBody.length) {
    console.log(`no ${mode}-mode callbacks to replay${skipped ? ` (${skipped} from the other environment skipped)` : " — run a payment first"}`);
    process.exit(0);
  }

  console.log(`replaying ${withBody.length} real ${mode}-mode callback(s)`);
  if (skipped) console.log(`(${skipped} callback(s) from the other PayU environment skipped — wrong salt to check them with)`);
  console.log();
  let failures = 0;

  for (const d of withBody) {
    const p: any = d.data();
    const body = p.callbackBody;

    const valid = isResponseHashValid(salt, key, body);
    const tamperedAmount = isResponseHashValid(salt, key, { ...body, amount: "1.00" });
    const tamperedStatus = isResponseHashValid(salt, key, { ...body, status: "success" === body.status ? "failure" : "success" });

    const ok = valid && !tamperedAmount && !tamperedStatus;
    if (!ok) failures++;

    console.log(`${ok ? "PASS" : "FAIL"}  ${d.id}  (${body.mode || "?"}, ${body.status})`);
    if (!valid) console.log("        genuine callback REJECTED — hash formula is wrong");
    if (tamperedAmount) console.log("        tampered amount ACCEPTED — verification is not binding");
    if (tamperedStatus) console.log("        tampered status ACCEPTED — verification is not binding");
  }

  console.log(`\n${withBody.length - failures}/${withBody.length} passed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
