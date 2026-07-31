/**
 * Manage the spectator list for a CS2 tournament (or a single match).
 *
 * MatchZy runs with `matchzy_whitelist_enabled_default true`, so the server
 * refuses anyone not named in the match config. That includes admins, casters
 * and players wanting to watch the other group's game: without an entry here
 * they simply cannot connect. Spectators go into the config's
 * `spectators.players` map, which MatchZy reads as {steam64: name}.
 *
 * Entries are either a site uid (Steam64 resolved from soloPlayers/users) or a
 * bare 17-digit Steam64 for someone with no account on the site. Tournament
 * level applies to every match, so a caster is added once, not fifteen times.
 *
 * Takes effect on the NEXT load_match — MatchZy fetches the config once, when
 * the match loads, so adding someone mid-game does not let them in.
 *
 *   npx tsx scripts/setCS2Spectators.ts --list
 *   npx tsx scripts/setCS2Spectators.ts --add=76561198129242599 --apply
 *   npx tsx scripts/setCS2Spectators.ts --add=discord_123,76561198... --apply
 *   npx tsx scripts/setCS2Spectators.ts --remove=76561198129242599 --apply
 *   npx tsx scripts/setCS2Spectators.ts --match=rsl-a1-v-a2 --add=<uid> --apply
 */
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
if (!getApps().length) {
  initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  })});
}
const db = getFirestore(getApp());

const arg = (name: string): string | undefined =>
  process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const list = (name: string): string[] =>
  (arg(name) || "").split(",").map(s => s.trim()).filter(Boolean);

const APPLY = process.argv.includes("--apply");
const TID = arg("tid") || "cs2-royal-sports-league";
const MATCH = arg("match");

async function describe(entry: string): Promise<string> {
  if (/^\d{17}$/.test(entry)) {
    // Reverse-lookup is best effort: a raw Steam64 belonging to nobody on the
    // site is legitimate (a caster), not an error.
    const q = await db.collection("users").where("steamId", "==", entry).limit(1).get();
    const u: any = q.docs[0]?.data();
    return `steam64 ${entry}${u ? ` — ${u.steamName || u.fullName || q.docs[0].id}` : " (no site account)"}`;
  }
  const [solo, user] = await Promise.all([
    db.collection("cs2Tournaments").doc(TID).collection("soloPlayers").doc(entry).get(),
    db.collection("users").doc(entry).get(),
  ]);
  const steamId = solo.data()?.steamId || user.data()?.steamId;
  const name = solo.data()?.steamName || user.data()?.steamName || user.data()?.fullName;
  return steamId
    ? `uid ${entry} — ${name || "?"} (${steamId})`
    : `uid ${entry} — !! NO STEAM LINKED, will be skipped at load time`;
}

async function main() {
  const ref = MATCH
    ? db.collection("cs2Tournaments").doc(TID).collection("matches").doc(MATCH)
    : db.collection("cs2Tournaments").doc(TID);
  const snap = await ref.get();
  if (!snap.exists) { console.error(`${MATCH ? `match ${MATCH}` : `tournament ${TID}`} not found`); process.exit(1); }

  const current: string[] = Array.isArray((snap.data() as any)?.spectatorUids) ? (snap.data() as any).spectatorUids : [];
  const add = list("add");
  const remove = list("remove");
  const next = [...new Set([...current, ...add])].filter(e => !remove.includes(e));

  console.log(`=== ${MATCH ? `${TID}/${MATCH}` : TID} spectators ===`);
  if (!current.length) console.log("  (none)");
  for (const e of current) console.log(`  ${remove.includes(e) ? "-" : " "} ${await describe(e)}`);
  for (const e of add) if (!current.includes(e)) console.log(`  + ${await describe(e)}`);

  if (!add.length && !remove.length) return;
  if (!APPLY) { console.log(`\nDRY RUN — would store ${next.length} spectator(s). Re-run with --apply.`); return; }

  await ref.set({ spectatorUids: next }, { merge: true });
  console.log(`\nWritten: ${next.length} spectator(s). Applies to the next Load Match.`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
