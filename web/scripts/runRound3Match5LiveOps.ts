/**
 * Live ops for round3-match5 (Radiant Reapers vs Baby Boomers).
 * Runs against production iesports.in:
 *   1. POST /api/valorant/substitute  Orcus → Sheeshu  on team-10
 *   2. POST /api/valorant/match-fetch  game 1 (Icebox)
 *   3. POST /api/valorant/match-fetch  game 2 (Lotus)
 *   4. POST /api/valorant/substitute  Sheeshu → Orcus  on team-10  (revert)
 *
 * Halts on first non-2xx so we never leave the roster in a bad state without
 * surfacing it.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;
const ADMIN_KEY = process.env.ADMIN_SECRET!;
const TID = "league-of-rising-stars-ascension";
const TEAM_RADIANT = "team-10";
const ORCUS_UID = "discord_741592452485480488";
const SHEESHU_UID = "discord_867791085644283934";
const MATCH_DOC = "round3-match5";
const GAME1_ID = "1f1ba3c4-d9ce-41ec-8f98-f9657d815094"; // Icebox
const GAME2_ID = "79effef3-9cf6-43b3-96d4-84d6ed71fa2e"; // Lotus

if (!APP_URL || !ADMIN_KEY) throw new Error("APP_URL or ADMIN_KEY missing in env");

async function call(path: string, body: any): Promise<any> {
  const url = `${APP_URL.replace(/\/$/, "")}${path}`;
  console.log(`\n→ POST ${path}`);
  console.log(`  body=${JSON.stringify({ ...body, adminKey: "<hidden>" })}`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {}
  console.log(`  ← ${res.status}  ${json ? JSON.stringify(json).slice(0, 500) : text.slice(0, 500)}`);
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${text.slice(0, 300)}`);
  return json;
}

async function run() {
  console.log(`URL: ${APP_URL}\n=== Live ops for ${MATCH_DOC} ===`);

  // 1. Sub Sheeshu in for Orcus
  console.log("\n──── STEP 1: substitute Orcus → Sheeshu ────");
  await call("/api/valorant/substitute", {
    tournamentId: TID,
    adminKey: ADMIN_KEY,
    teamId: TEAM_RADIANT,
    oldPlayerUid: ORCUS_UID,
    newPlayerUid: SHEESHU_UID,
  });

  // 2. Fetch game 1
  console.log("\n──── STEP 2: fetch game 1 (Icebox) ────");
  const g1 = await call("/api/valorant/match-fetch", {
    tournamentId: TID,
    adminKey: ADMIN_KEY,
    matchDocId: MATCH_DOC,
    valorantMatchId: GAME1_ID,
    gameNumber: 1,
    region: "ap",
  });
  console.log(`  game1 winner=${g1.winner ?? g1.gameWinner ?? "?"}  team1RoundsWon=${g1.team1RoundsWon ?? "?"}  team2RoundsWon=${g1.team2RoundsWon ?? "?"}`);

  // 3. Fetch game 2
  console.log("\n──── STEP 3: fetch game 2 (Lotus) ────");
  const g2 = await call("/api/valorant/match-fetch", {
    tournamentId: TID,
    adminKey: ADMIN_KEY,
    matchDocId: MATCH_DOC,
    valorantMatchId: GAME2_ID,
    gameNumber: 2,
    region: "ap",
  });
  console.log(`  game2 winner=${g2.winner ?? g2.gameWinner ?? "?"}  team1RoundsWon=${g2.team1RoundsWon ?? "?"}  team2RoundsWon=${g2.team2RoundsWon ?? "?"}`);

  // 4. Revert sub
  console.log("\n──── STEP 4: revert substitute (Sheeshu → Orcus) ────");
  await call("/api/valorant/substitute", {
    tournamentId: TID,
    adminKey: ADMIN_KEY,
    teamId: TEAM_RADIANT,
    oldPlayerUid: SHEESHU_UID,
    newPlayerUid: ORCUS_UID,
  });

  console.log("\n✅ All four steps succeeded.");
}

run().catch(e => { console.error("\n❌ HALTED:", e?.message || e); process.exit(1); });
