import * as dotenv from "dotenv"; import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });
import { initFirebase } from "../src/services/firebase";
(async () => {
  const db = initFirebase();
  const snap = await db.collection("dotaResultJobs").orderBy("createdAt","desc").limit(3).get();
  for (const d of snap.docs) {
    const j = d.data() as any;
    console.log(`\n=== ${d.id} status=${j.status} updatedAt=${j.updatedAt||"-"} ===`);
    if (j.error) console.log("ERROR:", j.error);
    if (j.report) console.log("report:", JSON.stringify(j.report, null, 1));
    if (j.logs) console.log("logs(tail):\n" + (j.logs as string[]).slice(-25).join("\n"));
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
