import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });
(async () => {
  const KEY = process.env.STEAM_API_KEY;
  console.log(`STEAM_API_KEY set: ${KEY ? "yes (len=" + KEY.length + ")" : "NO"}\n`);
  for (const mid of ["8822010785", "8821987573", "8813888349"]) {
    const url = `https://api.steampowered.com/IDOTA2Match_570/GetMatchDetails/V001/?key=${KEY}&match_id=${mid}`;
    const r = await fetch(url);
    const j = await r.json();
    console.log(`match ${mid}: HTTP ${r.status}  body=${JSON.stringify(j).slice(0, 300)}`);
  }
})();
