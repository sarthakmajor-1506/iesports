import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const V = "34dcab4e-edc0-481c-bad2-3853968c6330"; // Game 1 Lotus
const region = "ap";
const key = process.env.HENRIK_API_KEY!;

async function main() {
  const r = await fetch(`https://api.henrikdev.xyz/valorant/v4/match/${region}/${V}`, {
    headers: { Authorization: key },
  });
  const j: any = await r.json();
  const data = j.data;

  console.log("Top-level keys:", Object.keys(data));
  const round0 = (data.rounds || [])[0];
  if (!round0) {
    console.log("No rounds");
    return;
  }
  console.log("\nRound[0] keys:", Object.keys(round0));
  console.log("\nRound[0] raw (first 3000 chars):");
  console.log(JSON.stringify(round0, null, 2).slice(0, 3000));
}

main().catch(e => { console.error(e); process.exit(1); });
