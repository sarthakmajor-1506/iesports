(async () => {
  for (const mid of ["8822010785", "8821987573"]) {
    const url = `https://api.stratz.com/api/v1/match/${mid}`;
    try {
      const r = await fetch(url, { headers: { "User-Agent": "iesports-dev" } });
      const j = await r.json();
      console.log(`STRATZ ${mid}: HTTP ${r.status}  body=${JSON.stringify(j).slice(0, 300)}`);
    } catch (e: any) { console.log(`STRATZ ${mid}: error ${e.message}`); }
  }
  // Also try OpenDota's parse request — submits the match for re-indexing
  for (const mid of ["8822010785"]) {
    try {
      const r = await fetch(`https://api.opendota.com/api/request/${mid}`, { method: "POST" });
      const j = await r.json();
      console.log(`OpenDota request-parse ${mid}: HTTP ${r.status}  body=${JSON.stringify(j).slice(0, 200)}`);
    } catch (e: any) { console.log(`OpenDota request error: ${e.message}`); }
  }
})();
