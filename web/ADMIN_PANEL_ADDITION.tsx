// ═══════════════════════════════════════════════════════════════════════════════
// ADD THIS SECTION to your existing /app/admin/page.tsx
// 
// 1. Add these state variables at the top with the other useState calls:
//
//    const [fetchMatchDocId, setFetchMatchDocId] = useState("");
//    const [valorantMatchId, setValorantMatchId] = useState("");
//    const [fetchRegion, setFetchRegion] = useState("ap");
//
// 2. Add this JSX block inside the adm-grid div, after the "Substitute Player" section:
// ═══════════════════════════════════════════════════════════════════════════════

/*

            {/* Fetch Match Stats from Valorant */}
            <div style={sectionStyle}>
              <span style={labelStyle}>6. Fetch Match Stats (Henrik API)</span>
              <input value={fetchMatchDocId} onChange={e => setFetchMatchDocId(e.target.value)} placeholder="Match Doc ID (e.g. day1-match1)" style={inputStyle} />
              <input value={valorantMatchId} onChange={e => setValorantMatchId(e.target.value)} placeholder="Valorant Match ID (UUID from match history)" style={inputStyle} />
              <select value={fetchRegion} onChange={e => setFetchRegion(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="ap">AP (India/Asia-Pacific)</option>
                <option value="eu">EU (Europe)</option>
                <option value="na">NA (North America)</option>
                <option value="kr">KR (Korea)</option>
              </select>
              <button disabled={loading} style={btnStyle} onClick={() => apiCall("/api/valorant/match-fetch", { 
                tournamentId, 
                matchDocId: fetchMatchDocId, 
                valorantMatchId, 
                region: fetchRegion 
              })}>
                Fetch & Store Stats
              </button>
              <p style={{ fontSize: "0.68rem", color: "#999", marginTop: 6, lineHeight: 1.5 }}>
                Enter the Valorant match UUID from the match history. Stats will be fetched from Henrik API and stored in the leaderboard.
              </p>
            </div>

*/
