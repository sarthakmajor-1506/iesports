// ═══════════════════════════════════════════════════════════════════════════════
// REPLACE the matches tab section in /app/valorant/tournament/[id]/page.tsx
// Find: {activeTab === "matches" && (
// Replace the entire matches block with this:
// ═══════════════════════════════════════════════════════════════════════════════

/*

          {activeTab === "matches" && (
            <div>
              {matches.length === 0 ? (
                <div className="vtd-empty">
                  <span className="vtd-empty-icon">⚔️</span>
                  <span className="vtd-empty-title">No matches scheduled</span>
                  <span className="vtd-empty-sub">Matches will appear once pairings are generated.</span>
                </div>
              ) : (
                (() => {
                  const days = [...new Set(matches.map((m: any) => m.matchDay))].sort((a, b) => a - b);
                  return days.map(day => (
                    <div key={day}>
                      <div className="vtd-match-day-label">Day {day}</div>
                      {matches.filter((m: any) => m.matchDay === day).map((m: any) => {
                        const hasGame1 = !!m.game1;
                        const hasGame2 = !!m.game2;
                        const isComplete = m.status === "completed";
                        const isDraw = isComplete && m.team1Score === m.team2Score;

                        return (
                          <div key={m.id} style={{ marginBottom: 12 }}>
                            {/* Series card */}
                            <div className="vtd-match-card" style={isComplete ? { borderColor: "#bbf7d0" } : m.status === "live" ? { borderColor: "#fde68a" } : {}}>
                              <div className="vtd-match-team">
                                <div style={{ fontWeight: 700 }}>{m.team1Name}</div>
                                {m.team1ValorantSide && <div style={{ fontSize: "0.62rem", color: "#999" }}>{m.team1ValorantSide} side</div>}
                              </div>
                              <div className="vtd-match-score">
                                {isComplete ? (
                                  <>
                                    <span className={m.team1Score > m.team2Score ? "win" : m.team1Score < m.team2Score ? "loss" : ""} style={{ fontSize: "1.3rem" }}>{m.team1Score}</span>
                                    <span style={{ color: "#ccc", margin: "0 4px" }}>-</span>
                                    <span className={m.team2Score > m.team1Score ? "win" : m.team2Score < m.team1Score ? "loss" : ""} style={{ fontSize: "1.3rem" }}>{m.team2Score}</span>
                                  </>
                                ) : (
                                  <span className="vtd-match-status" style={{
                                    background: m.status === "live" ? "#dcfce7" : "#F2F1EE",
                                    color: m.status === "live" ? "#16a34a" : "#999",
                                  }}>
                                    {m.status === "live" ? "LIVE" : "BO2"}
                                  </span>
                                )}
                              </div>
                              <div className="vtd-match-team right">
                                <div style={{ fontWeight: 700 }}>{m.team2Name}</div>
                                {m.team2ValorantSide && <div style={{ fontSize: "0.62rem", color: "#999" }}>{m.team2ValorantSide} side</div>}
                              </div>
                            </div>

                            {/* Game details (show if at least one game fetched) */}
                            {(hasGame1 || hasGame2) && (
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 4 }}>
                                {/* Game 1 */}
                                <div style={{
                                  padding: "8px 12px", borderRadius: 8,
                                  background: hasGame1 ? "#fff" : "#F8F7F4",
                                  border: `1px solid ${hasGame1 ? "#E5E3DF" : "#F2F1EE"}`,
                                  opacity: hasGame1 ? 1 : 0.5,
                                }}>
                                  <div style={{ fontSize: "0.62rem", fontWeight: 800, color: "#ff4655", marginBottom: 4 }}>
                                    GAME 1 {hasGame1 ? `— ${m.game1.mapName}` : "— Pending"}
                                  </div>
                                  {hasGame1 && (
                                    <div style={{ fontSize: "0.78rem", color: "#444" }}>
                                      <span style={{ color: m.game1.winningTeam === "Red" ? "#16a34a" : "#999" }}>Red {m.game1.redRoundsWon}</span>
                                      <span style={{ color: "#ccc" }}> - </span>
                                      <span style={{ color: m.game1.winningTeam === "Blue" ? "#16a34a" : "#999" }}>{m.game1.blueRoundsWon} Blue</span>
                                    </div>
                                  )}
                                </div>
                                {/* Game 2 */}
                                <div style={{
                                  padding: "8px 12px", borderRadius: 8,
                                  background: hasGame2 ? "#fff" : "#F8F7F4",
                                  border: `1px solid ${hasGame2 ? "#E5E3DF" : "#F2F1EE"}`,
                                  opacity: hasGame2 ? 1 : 0.5,
                                }}>
                                  <div style={{ fontSize: "0.62rem", fontWeight: 800, color: "#3b82f6", marginBottom: 4 }}>
                                    GAME 2 {hasGame2 ? `— ${m.game2.mapName}` : "— Pending"}
                                  </div>
                                  {hasGame2 && (
                                    <div style={{ fontSize: "0.78rem", color: "#444" }}>
                                      <span style={{ color: m.game2.winningTeam === "Red" ? "#16a34a" : "#999" }}>Red {m.game2.redRoundsWon}</span>
                                      <span style={{ color: "#ccc" }}> - </span>
                                      <span style={{ color: m.game2.winningTeam === "Blue" ? "#16a34a" : "#999" }}>{m.game2.blueRoundsWon} Blue</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Lobby info */}
                            {m.lobbyName && (
                              <div className="vtd-lobby-info">
                                🎮 Lobby: <strong>{m.lobbyName}</strong> {m.lobbyPassword && <>| Password: <strong>{m.lobbyPassword}</strong></>}
                              </div>
                            )}

                            {/* Series result summary */}
                            {isComplete && (
                              <div style={{
                                marginTop: 4, padding: "6px 12px", borderRadius: 6,
                                background: isDraw ? "#fffbeb" : "#f0fdf4",
                                border: `1px solid ${isDraw ? "#fde68a" : "#bbf7d0"}`,
                                fontSize: "0.72rem", fontWeight: 700,
                                color: isDraw ? "#92400e" : "#16a34a",
                                textAlign: "center",
                              }}>
                                {isDraw 
                                  ? `Draw 1-1 — 1 point each`
                                  : `${m.team1Score > m.team2Score ? m.team1Name : m.team2Name} wins ${Math.max(m.team1Score, m.team2Score)}-${Math.min(m.team1Score, m.team2Score)} — 2 points`
                                }
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ));
                })()
              )}
            </div>
          )}

*/
