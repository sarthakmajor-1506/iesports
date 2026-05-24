(async () => {
  const mids = ["8822010785", "8821987573"];
  // Also submit a parse request for the Bsinger match
  await fetch(`https://api.opendota.com/api/request/8821987573`, { method: "POST" });
  console.log("Submitted parse requests for both. Polling every 30s for max 5 min...\n");
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 30000));
    for (const mid of mids) {
      const r = await fetch(`https://api.opendota.com/api/matches/${mid}`);
      const j: any = await r.json();
      if (j.error) {
        console.log(`[${new Date().toISOString().slice(11,19)}] ${mid}: ${j.error}`);
      } else {
        console.log(`\n✅ ${mid}: HTTP ${r.status} — match available!`);
        console.log(`  radiant_win=${j.radiant_win}  duration=${j.duration}s  game_mode=${j.game_mode}  lobby_type=${j.lobby_type}`);
        console.log(`  players: ${(j.players || []).length}`);
        if (j.players) {
          for (const p of j.players) {
            console.log(`    ${p.account_id} hero=${p.hero_id} side=${p.player_slot < 128 ? "radiant" : "dire"} K/D/A=${p.kills}/${p.deaths}/${p.assists}`);
          }
        }
        return;
      }
    }
  }
  console.log("\n⚠️ Still not indexed after 5 min. OpenDota may not parse practice lobbies.");
})();
