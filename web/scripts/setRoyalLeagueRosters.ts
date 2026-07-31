/**
 * Rebuild the Royal Sports League rosters from the WhatsApp team lists.
 *
 * The lists are first names only, and several resolve to more than one
 * registered player (three Rishabhs, two Namans) while many have no account at
 * all. A wrong guess produces a player who cannot join a whitelisted server and
 * only surfaces when nine people are already waiting, so this script never
 * guesses: a name resolves to exactly one registered player or it is reported
 * and the slot is left empty. Names that need a human decision are pinned by
 * uid in RESOLVED below.
 *
 * A player may appear on only one team. The same first name on two lists is
 * treated as a conflict and reported, because in this event that is either two
 * different people or one person double-booked across groups — both need a
 * human, and silently picking one corrupts a group's standings.
 *
 * Dry run by default:
 *   npx tsx scripts/setRoyalLeagueRosters.ts
 *   npx tsx scripts/setRoyalLeagueRosters.ts --apply
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
const APPLY = process.argv.includes("--apply");
const TID = "cs2-royal-sports-league";

/**
 * The lists exactly as Hunter sent them at 19:01 and 20:14 on 31 Jul, in the
 * slot order of the published fixture sheet. Keep the spellings — they are the
 * evidence for who was meant, and "Rishab" vs "Rishabh" is the only thing
 * separating two registered players.
 */
const ROSTERS: Record<string, { name: string; players: string[] }> = {
  A1: { name: "Utsav Ultimates",  players: ["Raunak", "Rajat", "Aman", "Abhay", "Rishabh"] },
  A2: { name: "Surana Strikers",  players: ["Utkarsh", "Anshul", "Rishav", "Naman", "Rishab"] },
  A3: { name: "Nawabzade",        players: ["Samyak", "Ishan", "Prateek", "Nishant", "Anant"] },
  A4: { name: "HM Gladiators",    players: ["Punit", "Saumil", "Ayush", "Rushabh", "Rishabh Patni"] },
  B1: { name: "BKT Titans",       players: ["Piyush", "Pranay", "Ishu", "Yash", "Abhishek"] },
  B2: { name: "Gokhru Smashers",  players: [] }, // never supplied
  B3: { name: "Oscar",            players: ["Aradhya", "Subodh", "Mihir", "Naman", "Akshay"] },
  B4: { name: "Fanboy",           players: ["Ankish", "Harshal", "Vishesh", "Pulkit", "Samyak"] },
};

/**
 * Human decisions, keyed "<slot>:<name from the list>". Anything in here skips
 * name matching entirely and uses the uid given — this is where an ambiguous
 * first name gets settled once someone has actually asked which player it is.
 * Set to null to record "confirmed not registered" and silence the report.
 */
const RESOLVED: Record<string, string | null> = {
  // e.g. "A2:Naman": "discord_1532652320901562442",  // Naman Kala
};

interface Reg { uid: string; steamId: string; names: string[]; label: string }

function normalize(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z]/g, "");
}

/** A list name matches a registration when it is a whole word of any of that
 *  player's names — substring matching alone makes "Aman" match "Naman". */
function matches(listName: string, reg: Reg): boolean {
  const needle = normalize(listName);
  if (!needle) return false;
  return reg.names.some((n) => {
    const words = String(n).split(/[^A-Za-z]+/).map(normalize).filter(Boolean);
    if (words.includes(needle)) return true;
    // Two-word list entries ("Rishabh Patni") match when every word does.
    const needleWords = String(listName).split(/\s+/).map(normalize).filter(Boolean);
    return needleWords.length > 1 && needleWords.every(w => words.includes(w));
  });
}

async function main() {
  const tref = db.collection("cs2Tournaments").doc(TID);
  const [spSnap, usersSnap, teamsSnap] = await Promise.all([
    tref.collection("soloPlayers").get(),
    db.collection("users").get(),
    tref.collection("teams").get(),
  ]);
  const umap = new Map(usersSnap.docs.map(d => [d.id, d.data() as any]));

  const registered: Reg[] = spSnap.docs.map(d => {
    const p: any = d.data(); const u: any = umap.get(d.id) || {};
    const names = [p.steamName, u.steamName, u.fullName, u.discordUsername].filter(Boolean);
    return {
      uid: d.id,
      steamId: p.steamId || u.steamId || "",
      names,
      label: `${u.fullName || p.steamName || d.id}${p.steamId || u.steamId ? "" : " !!NO-STEAM"}`,
    };
  });

  const taken = new Map<string, string>();   // uid -> "slot:name" that claimed it
  const conflicts: string[] = [];
  const unresolved: string[] = [];
  const ambiguous: string[] = [];
  const rosters: Record<string, Array<{ uid: string; label: string }>> = {};

  for (const [slot, spec] of Object.entries(ROSTERS)) {
    rosters[slot] = [];
    for (const listName of spec.players) {
      const key = `${slot}:${listName}`;

      if (key in RESOLVED) {
        const uid = RESOLVED[key];
        if (!uid) { unresolved.push(`${key} — recorded as not registered`); continue; }
        const reg = registered.find(r => r.uid === uid);
        if (!reg) { unresolved.push(`${key} — pinned uid ${uid} is not registered for this tournament`); continue; }
        if (taken.has(uid)) { conflicts.push(`${key} and ${taken.get(uid)} both resolve to ${reg.label}`); continue; }
        taken.set(uid, key); rosters[slot].push({ uid, label: `${reg.label} (pinned)` });
        continue;
      }

      const hits = registered.filter(r => matches(listName, r));
      if (hits.length === 0) { unresolved.push(`${key} — no registered player`); continue; }
      if (hits.length > 1) {
        ambiguous.push(`${key} — ${hits.length} candidates: ${hits.map(h => `${h.label} [${h.uid}]`).join("  |  ")}`);
        continue;
      }
      const reg = hits[0];
      if (taken.has(reg.uid)) { conflicts.push(`${key} and ${taken.get(reg.uid)} both resolve to ${reg.label}`); continue; }
      taken.set(reg.uid, key);
      rosters[slot].push({ uid: reg.uid, label: reg.label });
    }
  }

  console.log("=== ROSTERS FROM THE WHATSAPP LISTS ===");
  for (const [slot, spec] of Object.entries(ROSTERS)) {
    console.log(`\n${slot}  ${spec.name}  — ${rosters[slot].length}/${spec.players.length || 5} resolved`);
    for (const m of rosters[slot]) console.log(`     ✓ ${m.label}`);
    for (const p of spec.players) {
      const key = `${slot}:${p}`;
      if (unresolved.some(u => u.startsWith(key + " ")) ) console.log(`     ✗ ${p} — not registered`);
      if (ambiguous.some(a => a.startsWith(key + " "))) console.log(`     ? ${p} — ambiguous, see below`);
      if (conflicts.some(c => c.startsWith(key + " "))) console.log(`     ! ${p} — conflict, see below`);
    }
    if (!spec.players.length) console.log("     (roster never supplied)");
  }

  if (ambiguous.length) { console.log("\n=== NEEDS A DECISION (pin in RESOLVED) ==="); ambiguous.forEach(a => console.log(`  ${a}`)); }
  if (conflicts.length) { console.log("\n=== CONFLICTS (same player on two teams) ==="); conflicts.forEach(c => console.log(`  ${c}`)); }

  const unclaimed = registered.filter(r => !taken.has(r.uid));
  if (unclaimed.length) {
    console.log(`\n=== REGISTERED BUT ON NO LIST (${unclaimed.length}) ===`);
    unclaimed.forEach(r => console.log(`  ${r.label.padEnd(28)} ${r.uid}`));
  }

  const total = Object.values(rosters).reduce((n, r) => n + r.length, 0);
  console.log(`\n${total}/40 slots filled.`);

  if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); return; }

  // Members are rewritten wholesale, not merged: a roster correction that only
  // adds players would leave a wrongly-assigned player in place, which is the
  // exact failure this script exists to fix.
  const batch = db.batch();
  for (const [slot, spec] of Object.entries(ROSTERS)) {
    const id = slot.toLowerCase();
    const existing: any = teamsSnap.docs.find(d => d.id === id)?.data() || {};
    const members = rosters[slot].map(m => {
      const u: any = umap.get(m.uid) || {};
      const p: any = spSnap.docs.find(d => d.id === m.uid)?.data() || {};
      return {
        uid: m.uid,
        steamName: p.steamName || u.steamName || u.fullName || "",
        steamAvatar: p.steamAvatar || u.steamAvatar || "",
        skillLevel: 1, cs2RankTier: 0,
      };
    });
    batch.set(tref.collection("teams").doc(id), {
      ...existing, id, slot, tournamentId: TID, teamName: spec.name,
      captainUid: members[0]?.uid || "", members,
    }, { merge: true });
  }
  await batch.commit();
  console.log("\nWritten.");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
