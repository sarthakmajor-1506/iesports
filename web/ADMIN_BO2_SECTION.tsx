// ═══════════════════════════════════════════════════════════════════════════════
// REPLACE section 6 in your admin panel with this.
// Also add these state variables at the top:
//
//   const [fetchMatchDocId, setFetchMatchDocId] = useState("");
//   const [game1MatchId, setGame1MatchId] = useState("");
//   const [game2MatchId, setGame2MatchId] = useState("");
//   const [fetchRegion, setFetchRegion] = useState("ap");
//   const [excludedPuuids, setExcludedPuuids] = useState("");
//
// Then replace the old section 6 with this JSX:
// ═══════════════════════════════════════════════════════════════════════════════

/*

            {/* BO2 Match Fetch */}
            <div style={{ ...sectionStyle, gridColumn: "1 / -1" }}>
              <span style={labelStyle}>6. BO2 Series — Fetch Match Stats</span>
              <p style={{ fontSize: "0.72rem", color: "#888", marginBottom: 12, lineHeight: 1.5 }}>
                Each BO2 series has 2 games (maps). Enter the Valorant match UUID for each game. 
                After both are fetched, the series score auto-computes and standings update.
              </p>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: "0.68rem", fontWeight: 700, color: "#999", display: "block", marginBottom: 4 }}>Match Doc ID</label>
                  <input value={fetchMatchDocId} onChange={e => setFetchMatchDocId(e.target.value)} placeholder="e.g. day1-match1" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: "0.68rem", fontWeight: 700, color: "#999", display: "block", marginBottom: 4 }}>Region</label>
                  <select value={fetchRegion} onChange={e => setFetchRegion(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                    <option value="ap">AP (India)</option>
                    <option value="eu">EU</option>
                    <option value="na">NA</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 4 }}>
                <div style={{ padding: 12, background: "#F8F7F4", borderRadius: 10, border: "1px solid #E5E3DF" }}>
                  <label style={{ fontSize: "0.68rem", fontWeight: 800, color: "#ff4655", display: "block", marginBottom: 6 }}>GAME 1 (Map 1)</label>
                  <input value={game1MatchId} onChange={e => setGame1MatchId(e.target.value)} placeholder="Valorant Match UUID" style={inputStyle} />
                  <button disabled={loading || !game1MatchId} style={{ ...btnStyle, width: "100%", marginTop: 4 }} onClick={() => apiCall("/api/valorant/match-fetch", {
                    tournamentId,
                    matchDocId: fetchMatchDocId,
                    valorantMatchId: game1MatchId,
                    gameNumber: 1,
                    region: fetchRegion,
                    excludedPuuids: excludedPuuids ? excludedPuuids.split(",").map(s => s.trim()) : [],
                  })}>
                    Fetch Game 1
                  </button>
                </div>
                <div style={{ padding: 12, background: "#F8F7F4", borderRadius: 10, border: "1px solid #E5E3DF" }}>
                  <label style={{ fontSize: "0.68rem", fontWeight: 800, color: "#3b82f6", display: "block", marginBottom: 6 }}>GAME 2 (Map 2)</label>
                  <input value={game2MatchId} onChange={e => setGame2MatchId(e.target.value)} placeholder="Valorant Match UUID" style={inputStyle} />
                  <button disabled={loading || !game2MatchId} style={{ ...btnSecondary, width: "100%", marginTop: 4 }} onClick={() => apiCall("/api/valorant/match-fetch", {
                    tournamentId,
                    matchDocId: fetchMatchDocId,
                    valorantMatchId: game2MatchId,
                    gameNumber: 2,
                    region: fetchRegion,
                    excludedPuuids: excludedPuuids ? excludedPuuids.split(",").map(s => s.trim()) : [],
                  })}>
                    Fetch Game 2
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: "0.68rem", fontWeight: 700, color: "#999", display: "block", marginBottom: 4 }}>Excluded PUUIDs (substitutes — comma separated, optional)</label>
                <input value={excludedPuuids} onChange={e => setExcludedPuuids(e.target.value)} placeholder="puuid1, puuid2" style={inputStyle} />
              </div>
            </div>

*/
