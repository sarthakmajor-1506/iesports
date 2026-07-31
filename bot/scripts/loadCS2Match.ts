/**
 * Load a match onto a CS2 server directly over RCON, bypassing the admin
 * panel and the command queue.
 *
 * This is the break-glass path for when the bot cannot reach a server — most
 * likely because that server's credentials are not on the Railway service yet,
 * which is exactly the state a newly-added second box is in during an event.
 * It does what web/app/api/admin/cs2-server's load_match action does: allocate
 * a numeric MatchZy match id, write the cs2MatchzyIndex reverse lookup the
 * result webhook resolves through, then point MatchZy at our config endpoint.
 *
 * Prefer the admin panel when the bot can do it. Nothing here writes the
 * server state doc, so the panel's status bar will not know this match was
 * loaded — only the webhook events will show it.
 *
 *   npx tsx scripts/loadCS2Match.ts --tid=cs2-royal-sports-league --match=rsl-a3-v-a4 \
 *     --host=62.72.41.184 --port=27021 --password=xxx --token=<CS2_MATCH_CONFIG_TOKEN>
 *
 * --host/--port/--password default to the CS2_RCON_*_2 env pair, and --token to
 * CS2_MATCH_CONFIG_TOKEN. Add --dry to print what it would do.
 */
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";
import { rconExec, rconArg } from "../src/services/cs2-rcon";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  })});
}
const db = getFirestore(getApp());

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const DRY = process.argv.includes("--dry");

const TID = arg("tid") || "cs2-royal-sports-league";
const MATCH = arg("match");
const HOST = arg("host") || process.env.CS2_RCON_HOST_2;
const PORT = Number(arg("port") || process.env.CS2_RCON_PORT_2 || 27015);
const PASSWORD = arg("password") || process.env.CS2_RCON_PASSWORD_2;
const TOKEN = arg("token") || process.env.CS2_MATCH_CONFIG_TOKEN;
// Must be the www. form — iesports.in 307-redirects and MatchZy is not
// guaranteed to follow redirects.
const BASE = arg("base") || "https://www.iesports.in";

async function main() {
  if (!MATCH || !HOST || !PASSWORD || !TOKEN) {
    console.error("usage: --match=<matchId> [--tid=] --host= --port= --password= --token=");
    console.error("       (host/port/password fall back to CS2_RCON_*_2, token to CS2_MATCH_CONFIG_TOKEN)");
    process.exit(1);
  }

  const matchRef = db.collection("cs2Tournaments").doc(TID).collection("matches").doc(MATCH);
  const snap = await matchRef.get();
  if (!snap.exists) { console.error(`match ${TID}/${MATCH} not found`); process.exit(1); }
  const m: any = snap.data();
  console.log(`${TID}/${MATCH}: ${m.team1Name} vs ${m.team2Name}  area=${m.area ?? "-"}  MR${m.maxRounds ?? "?"}  status=${m.status}`);
  console.log(`target: ${HOST}:${PORT}`);
  if (m.area && String(m.area) !== "2" && (HOST === process.env.CS2_RCON_HOST_2)) {
    console.log(`  note: this match is area ${m.area}, and you are loading it on the area 2 box.`);
  }

  // Seconds, not milliseconds: MatchZy parses matchid as a 32-bit int and a
  // 13-digit Date.now() overflows it, which it reports only as
  // "Match load failed!". Bump on collision — two loads in the same second
  // would otherwise route one match's webhook events into the other's doc.
  let matchzyMatchId = Math.floor(Date.now() / 1000);
  for (let i = 0; i < 10; i++) {
    const clash = await db.collection("cs2MatchzyIndex").doc(String(matchzyMatchId)).get();
    if (!clash.exists) break;
    matchzyMatchId += 1;
  }

  const url = `${BASE}/api/cs2/match-config/${MATCH}?t=${encodeURIComponent(TID)}`;
  if (DRY) { console.log(`\nDRY — would allocate ${matchzyMatchId} and load ${url}`); return; }

  await matchRef.set({ matchzyMatchId }, { merge: true });
  await db.collection("cs2MatchzyIndex").doc(String(matchzyMatchId)).set({
    tournamentId: TID, matchId: MATCH, createdAt: new Date().toISOString(),
  });
  console.log(`allocated matchzyMatchId=${matchzyMatchId}`);

  const r = await rconExec(
    [`matchzy_loadmatch_url ${rconArg(url)} ${rconArg("X-IESports-Token")} ${rconArg(TOKEN)}`],
    { host: HOST!, port: PORT, password: PASSWORD! },
  );
  console.log(r.ok ? `sent. server said: ${r.output || "(nothing)"}` : `RCON failed: ${r.error}`);
  console.log("\nMatchZy accepting the config shows up as a series_start in cs2MatchzyEvents,");
  console.log("and the server hostname changing to the two team names. Silence means it rejected it.");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
