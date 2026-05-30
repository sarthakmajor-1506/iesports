import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
})});
const db = getFirestore();

const MAJOR_UID = "discord_1302366375263735808";
const MAJOR_STEAM32 = "168976871";
const MAJOR_STEAM64 = "76561198129242599";
const APPLY = process.argv.includes("--apply");

const RANK_TIER_NAMES: Record<number, string> = {
  10:"Herald 1",11:"Herald 2",12:"Herald 3",13:"Herald 4",14:"Herald 5",
  20:"Guardian 1",21:"Guardian 2",22:"Guardian 3",23:"Guardian 4",24:"Guardian 5",
  30:"Crusader 1",31:"Crusader 2",32:"Crusader 3",33:"Crusader 4",34:"Crusader 5",
  40:"Archon 1",41:"Archon 2",42:"Archon 3",43:"Archon 4",44:"Archon 5",
  50:"Legend 1",51:"Legend 2",52:"Legend 3",53:"Legend 4",54:"Legend 5",
  60:"Ancient 1",61:"Ancient 2",62:"Ancient 3",63:"Ancient 4",64:"Ancient 5",
  70:"Divine 1",71:"Divine 2",72:"Divine 3",73:"Divine 4",74:"Divine 5",
  80:"Immortal",
};
function bracketFor(tier: number): string {
  if (tier >= 70) return "divine_immortal";
  if (tier >= 50) return "legend_ancient";
  if (tier >= 30) return "crusader_archon";
  return "herald_guardian";
}

(async () => {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);

  console.log("=== Step 1: Fetch Steam profile via Steam API ===");
  const steamRes = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${process.env.STEAM_API_KEY}&steamids=${MAJOR_STEAM64}`);
  const steamData = await steamRes.json();
  const profile = steamData?.response?.players?.[0];
  if (!profile) { console.log("  Steam profile not found, aborting."); process.exit(1); }
  console.log(`  Steam profile: ${profile.personaname}`);
  console.log(`  Avatar: ${profile.avatarfull}`);

  console.log("\n=== Step 2: Fetch Dota rank via OpenDota ===");
  const odRes = await fetch(`https://api.opendota.com/api/players/${MAJOR_STEAM32}`);
  const odData = await odRes.json();
  const rankTier = odData?.rank_tier || 0;
  const mmrEstimate = odData?.mmr_estimate?.estimate || null;
  const rankName = RANK_TIER_NAMES[rankTier] || "Unranked";
  const bracket = bracketFor(rankTier);
  console.log(`  Rank tier: ${rankTier} (${rankName})`);
  console.log(`  MMR estimate: ${mmrEstimate}`);
  console.log(`  Bracket: ${bracket}`);

  console.log("\n=== Step 3: Current user doc ===");
  const userRef = db.collection("users").doc(MAJOR_UID);
  const before = (await userRef.get()).data() as any;
  console.log(`  Current steamId: ${before.steamId}`);
  console.log(`  Current steamName: ${before.steamName}`);
  console.log(`  Current dotaRankTier: ${before.dotaRankTier} (${RANK_TIER_NAMES[before.dotaRankTier] || "?"})`);

  console.log("\n=== Step 4: Updated user doc fields ===");
  const updates: any = {
    steamId: MAJOR_STEAM64,
    steamName: profile.personaname,
    steamAvatar: profile.avatarfull,
    steamLinkedAt: new Date().toISOString(),
    dotaRankTier: rankTier,
    dotaBracket: bracket,
    rankFetchedAt: new Date().toISOString(),
  };
  if (mmrEstimate) updates.dotaMMR = mmrEstimate;
  for (const k of Object.keys(updates)) console.log(`  ${k}: ${updates[k]}`);

  console.log("\n=== Step 5: Team memberships referencing Major ===");
  const teamsAffected: string[] = [];
  const dotaTournaments = await db.collection("tournaments").get();
  for (const td of dotaTournaments.docs) {
    const teams = await td.ref.collection("teams").get();
    for (const tdoc of teams.docs) {
      const tdata = tdoc.data() as any;
      const members = Array.isArray(tdata.members) ? tdata.members : [];
      const idx = members.indexOf(MAJOR_UID);
      if (idx >= 0) {
        teamsAffected.push(`tournaments/${td.id}/teams/${tdoc.id} (Major is member)`);
      }
    }
  }
  teamsAffected.forEach(t => console.log(`  ${t}`));
  console.log("  (team docs only store member UIDs as strings, no cached Steam — nothing to update there)");

  if (APPLY) {
    await userRef.set(updates, { merge: true });
    console.log("\n✅ Applied. Major's user doc updated.");
  } else {
    console.log("\nDry-run only. Re-run with --apply.");
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
