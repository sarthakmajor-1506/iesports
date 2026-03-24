// ═══════════════════════════════════════════════════════════════════════════════
// LEADERBOARD TAB — Add to /app/valorant/tournament/[id]/page.tsx
//
// STEP 1: Update the Tab type and TABS array at the top of the file:
//
//   type Tab = "overview" | "players" | "teams" | "standings" | "matches" | "leaderboard";
//
//   Add to TABS array:
//   { key: "leaderboard", label: "Leaderboard", icon: "🏅" },
//
// STEP 2: Add a leaderboard state variable with the other useState calls:
//
//   const [leaderboard, setLeaderboard] = useState<any[]>([]);
//
// STEP 3: Add this useEffect for the leaderboard listener (alongside other listeners):
//
//   useEffect(() => {
//     if (!id) return;
//     const unsub = onSnapshot(
//       collection(db, "valorantTournaments", id, "leaderboard"),
//       (snap) => {
//         const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
//         list.sort((a: any, b: any) => {
//           // Sort by avg combat score (totalScore / matchesPlayed), then KD
//           const acsA = (a.totalScore || 0) / Math.max(1, a.matchesPlayed || 1);
//           const acsB = (b.totalScore || 0) / Math.max(1, b.matchesPlayed || 1);
//           if (Math.abs(acsB - acsA) > 1) return acsB - acsA;
//           return (b.kd || 0) - (a.kd || 0);
//         });
//         setLeaderboard(list);
//       }
//     );
//     return () => unsub();
//   }, [id]);
//
// STEP 4: Add this Firestore rule for leaderboard subcollection:
//
//   match /valorantTournaments/{id}/leaderboard/{playerId} {
//     allow read: if request.auth != null;
//     allow write: if false;
//   }
//
// STEP 5: Add this JSX block inside the tab content section (after the matches tab):
// ═══════════════════════════════════════════════════════════════════════════════

/*

          {activeTab === "leaderboard" && (
            <div className="vtd-card">
              <span className="vtd-card-label">Player Leaderboard — MVP Tracker</span>
              {leaderboard.length === 0 ? (
                <div className="vtd-empty">
                  <span className="vtd-empty-icon">🏅</span>
                  <span className="vtd-empty-title">No stats yet</span>
                  <span className="vtd-empty-sub">Player stats will appear once match data is fetched.</span>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="vtd-standings-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Player</th>
                        <th>Agent(s)</th>
                        <th>Maps</th>
                        <th style={{ color: "#16a34a" }}>K</th>
                        <th style={{ color: "#dc2626" }}>D</th>
                        <th>A</th>
                        <th style={{ color: "#ff4655" }}>K/D</th>
                        <th>ACS</th>
                        <th>HS%</th>
                        <th>DMG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((p: any, i: number) => {
                        const acs = Math.round((p.totalScore || 0) / Math.max(1, p.totalRoundsPlayed || 1));
                        return (
                          <tr key={p.id} style={i === 0 ? { background: "#FFFBEB" } : {}}>
                            <td style={{ fontWeight: 800, color: i === 0 ? "#f59e0b" : i < 3 ? "#ff4655" : "#bbb" }}>
                              {i === 0 ? "👑" : i + 1}
                            </td>
                            <td>
                              <div style={{ fontWeight: 700 }}>{p.name}</div>
                              <div style={{ fontSize: "0.68rem", color: "#999" }}>#{p.tag}</div>
                            </td>
                            <td style={{ fontSize: "0.72rem", color: "#888" }}>
                              {(p.agents || []).join(", ")}
                            </td>
                            <td>{p.matchesPlayed || 0}</td>
                            <td style={{ fontWeight: 700, color: "#16a34a" }}>{p.totalKills || 0}</td>
                            <td style={{ color: "#dc2626" }}>{p.totalDeaths || 0}</td>
                            <td>{p.totalAssists || 0}</td>
                            <td style={{ fontWeight: 800, color: (p.kd || 0) >= 1.0 ? "#16a34a" : "#dc2626" }}>
                              {p.kd || 0}
                            </td>
                            <td style={{ fontWeight: 700 }}>{acs}</td>
                            <td>{p.hsPercent || 0}%</td>
                            <td style={{ fontSize: "0.78rem", color: "#888" }}>{p.totalDamageDealt || 0}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 12, padding: "10px 14px", background: "#F8F7F4", borderRadius: 8, fontSize: "0.72rem", color: "#999", lineHeight: 1.6 }}>
                    <strong style={{ color: "#666" }}>How MVP is determined:</strong> Players ranked by Average Combat Score (ACS = total score / rounds played), then K/D ratio as tiebreaker. 
                    K = Kills, D = Deaths, A = Assists, ACS = Avg Combat Score per round, HS% = Headshot percentage, DMG = Total damage dealt.
                  </div>
                </div>
              )}
            </div>
          )}

*/
