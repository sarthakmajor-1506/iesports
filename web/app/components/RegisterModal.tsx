"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";

type Props = {
  tournament: any;
  user: any;
  dotaProfile: any;
  game?: "dota2" | "valorant";
  onClose: () => void;
  onSuccess: () => void;
};

type Step = "choose" | "create" | "join" | "solo" | "success" | "connect";

export default function RegisterModal({ tournament, user, dotaProfile, game = "dota2", onClose, onSuccess }: Props) {
  const { riotData } = useAuth();
  const [step, setStep] = useState<Step>("connect"); // always start at connect check
  const [joinCode, setJoinCode] = useState("");
  const [teamCode, setTeamCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const router = useRouter();

  const isValorant = game === "valorant";
  const isShuffle = isValorant && tournament?.format === "shuffle";
  const accentColor = isValorant ? "#ff4655" : "#f97316";

  const isProfilePrivate = !isValorant && (!dotaProfile?.dotaRankTier || dotaProfile?.dotaRankTier === 0);

  // ── Account connection status ────────────────────────────────────────────
  const hasSteam = !!dotaProfile?.steamId || !!user?.steamId;
  const riotStatus = riotData?.riotVerified || "unlinked";
  const hasRiot = riotStatus === "verified";
  const riotPending = riotStatus === "pending";
  const hasDiscord = !!user?.discordId || !!dotaProfile?.discordId;

  // Determine which accounts are required based on game
  const missingAccounts: { id: string; label: string; icon: string; action: () => void; color: string }[] = [];

  if (isValorant) {
    if (!hasRiot && !riotPending) {
      missingAccounts.push({
        id: "riot", label: "Riot ID", icon: "/riot-games.png",
        action: () => router.push("/connect-riot"), color: "#ff4655",
      });
    }
  } else {
    if (!hasSteam) {
      missingAccounts.push({
        id: "steam", label: "Steam",
        icon: "https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg",
        action: () => { window.location.href = `/api/auth/steam?uid=${user?.uid}`; }, color: "#111",
      });
    }
  }

  // Discord is recommended for both
  if (!hasDiscord) {
    missingAccounts.push({
      id: "discord", label: "Discord", icon: "",
      action: () => { window.location.href = `/api/auth/discord?uid=${user?.uid}`; }, color: "#5865F2",
    });
  }

  const hasRequiredAccounts = isValorant ? (hasRiot || riotPending) : hasSteam;

  // Auto-advance past connect step if all required accounts are linked
  const actualStep = step === "connect" && hasRequiredAccounts
    ? (isShuffle ? "solo" : "choose")
    : step;

  const handleCreateTeam = async () => {
    setLoading(true); setError("");
    try {
      const endpoint = isValorant ? "/api/valorant/teams/create" : "/api/teams/create";
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tournamentId: tournament.id, uid: user.uid }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTeamCode(data.teamCode); onSuccess(); setStep("success");
    } catch (e: any) { setError(e.message || "Failed to create team"); } finally { setLoading(false); }
  };

  const handleJoinTeam = async () => {
    if (joinCode.length !== 6) { setError("Enter a valid 6-digit code"); return; }
    setLoading(true); setError("");
    try {
      const endpoint = isValorant ? "/api/valorant/teams/join" : "/api/teams/join";
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: joinCode.toUpperCase(), uid: user.uid }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSuccess(); setStep("success");
    } catch (e: any) { setError(e.message || "Failed to join team"); } finally { setLoading(false); }
  };

  const handleSolo = async () => {
    setLoading(true); setError(""); setWarning("");
    try {
      const endpoint = isValorant ? "/api/valorant/solo" : "/api/teams/solo";
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tournamentId: tournament.id, uid: user.uid }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.warning) setWarning(data.warning);
      onSuccess(); setStep("success");
    } catch (e: any) { setError(e.message || "Failed to register"); } finally { setLoading(false); }
  };

  const handleWhatsApp = () => {
    const gameName = isValorant ? "Valorant" : "Dota 2";
    const msg = encodeURIComponent(`Join my ${gameName} team on Indian Esports!\nTournament: ${tournament.name}\n${teamCode ? `Team Code: ${teamCode}\n` : ""}Join here: ${window.location.origin}`);
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "#0e0e0e", border: "1px solid #1a1a1a", borderRadius: 16,
        padding: 32, width: "100%", maxWidth: 460, position: "relative",
      }}>
        <button onClick={onClose} style={{
          position: "absolute", top: 16, right: 16,
          background: "transparent", border: "none", color: "#444",
          fontSize: 20, cursor: "pointer", lineHeight: 1,
        }}>✕</button>

        <p style={{ color: accentColor, fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>REGISTER</p>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 4, marginBottom: 16, color: "#fff" }}>{tournament.name}</h2>

        {/* ═══════ CONNECT STEP — shows when required accounts missing ═══════ */}
        {actualStep === "connect" && (
          <div>
            <div style={{
              background: "#1a0808", border: "1px solid #7f1d1d", borderRadius: 10,
              padding: "14px 16px", marginBottom: 20,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#dc2626", animation: "reg-pulse 2s infinite" }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: "#fca5a5" }}>Connect Required Accounts</span>
              </div>
              <p style={{ fontSize: 12, color: "#991b1b", lineHeight: 1.6 }}>
                You need to connect the following account{missingAccounts.filter(a => a.id !== "discord").length > 1 ? "s" : ""} before registering for this tournament.
              </p>
            </div>

            <style>{`@keyframes reg-pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {missingAccounts.map(acc => {
                const isRequired = acc.id !== "discord";
                return (
                  <button key={acc.id} onClick={acc.action} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "14px 16px", background: "#111", borderRadius: 10,
                    border: isRequired ? "1.5px solid #7f1d1d" : "1px solid #222",
                    cursor: "pointer", textAlign: "left" as const, width: "100%",
                    transition: "all 0.15s",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = acc.color; e.currentTarget.style.background = "#1a1a1a"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = isRequired ? "#7f1d1d" : "#222"; e.currentTarget.style.background = "#111"; }}
                  >
                    {acc.id === "discord" ? (
                      <svg width={22} height={22} viewBox="0 0 24 24" fill="#5865F2" style={{ flexShrink: 0 }}>
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.08.114 18.1.132 18.114a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                      </svg>
                    ) : (
                      <img src={acc.icon} alt="" style={{ width: 22, height: 22, borderRadius: 4, flexShrink: 0, opacity: 0.7 }} />
                    )}
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 700, fontSize: 14, color: "#fff", marginBottom: 2 }}>Connect {acc.label}</p>
                      <p style={{ fontSize: 11, color: "#555" }}>
                        {isRequired ? "Required to register" : "Recommended for notifications"}
                      </p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {isRequired && (
                        <span style={{
                          fontSize: "0.58rem", fontWeight: 800, padding: "3px 8px", borderRadius: 100,
                          background: "#7f1d1d", color: "#fca5a5",
                        }}>Required</span>
                      )}
                      <span style={{ color: "#555", fontSize: 16 }}>→</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Already connected accounts */}
            {(hasSteam || hasRiot || riotPending || hasDiscord) && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#333", marginBottom: 8, textTransform: "uppercase" as const }}>Connected</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {hasSteam && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "#0a1a0a", border: "1px solid #166534", borderRadius: 100, fontSize: "0.72rem", color: "#4ade80", fontWeight: 600 }}>
                      <span style={{ fontSize: 10 }}>✓</span> Steam
                    </div>
                  )}
                  {(hasRiot || riotPending) && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: riotPending ? "#1a1200" : "#0a1a0a", border: `1px solid ${riotPending ? "#854d0e" : "#166534"}`, borderRadius: 100, fontSize: "0.72rem", color: riotPending ? "#fbbf24" : "#4ade80", fontWeight: 600 }}>
                      <span style={{ fontSize: 10 }}>{riotPending ? "⏳" : "✓"}</span> Riot ID
                    </div>
                  )}
                  {hasDiscord && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "#0a0a1a", border: "1px solid #312e81", borderRadius: 100, fontSize: "0.72rem", color: "#818cf8", fontWeight: 600 }}>
                      <span style={{ fontSize: 10 }}>✓</span> Discord
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Skip for optional (Discord) — only if required accounts are met */}
            {hasRequiredAccounts && missingAccounts.every(a => a.id === "discord") && (
              <button onClick={() => setStep(isShuffle ? "solo" : "choose")} style={{
                width: "100%", padding: 14,
                background: `linear-gradient(135deg, ${accentColor}, ${isValorant ? "#cc1a2a" : "#ea580c"})`,
                border: "none", borderRadius: 8, color: "#fff",
                fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 4,
              }}>
                Continue to Register →
              </button>
            )}

            {/* If Discord is the only missing one, show skip option */}
            {hasRequiredAccounts && missingAccounts.length > 0 && missingAccounts.every(a => a.id === "discord") && (
              <button onClick={() => setStep(isShuffle ? "solo" : "choose")} style={{
                width: "100%", padding: 10, marginTop: 8,
                background: "transparent", border: "1px solid #222", borderRadius: 8,
                color: "#555", fontSize: 12, cursor: "pointer",
              }}>
                Skip Discord for now
              </button>
            )}
          </div>
        )}

        {/* Dota: private profile warning */}
        {!isValorant && isProfilePrivate && actualStep === "choose" && (
          <div style={{
            background: "#1a1200", border: "1px solid #854d0e",
            borderRadius: 10, padding: "12px 14px", marginBottom: 20,
            display: "flex", gap: 10, alignItems: "flex-start",
          }}>
            <span style={{ fontSize: 16, marginTop: 1 }}>⚠️</span>
            <div>
              <p style={{ color: "#fbbf24", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Your Dota 2 profile appears to be private</p>
              <p style={{ color: "#92400e", fontSize: 12, lineHeight: 1.6 }}>
                You can still register, but your rank won't be verified. Turn on{" "}
                <span style={{ color: "#fbbf24", fontWeight: 600 }}>Expose Public Match Data</span> in Dota 2 → Settings → Social.
              </p>
            </div>
          </div>
        )}

        {/* Riot pending warning for Valorant */}
        {isValorant && riotPending && actualStep !== "connect" && actualStep !== "success" && (
          <div style={{
            background: "#1a1200", border: "1px solid #854d0e",
            borderRadius: 10, padding: "12px 14px", marginBottom: 16,
            display: "flex", gap: 10, alignItems: "flex-start",
          }}>
            <span style={{ fontSize: 16, marginTop: 1 }}>⏳</span>
            <div>
              <p style={{ color: "#fbbf24", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Riot ID verification pending</p>
              <p style={{ color: "#92400e", fontSize: 12, lineHeight: 1.6 }}>
                You can register now, but please complete the verification on the{" "}
                <span style={{ color: "#fbbf24", fontWeight: 600, cursor: "pointer", textDecoration: "underline" }} onClick={() => router.push("/connect-riot")}>Connect Riot page</span> before the tournament starts.
              </p>
            </div>
          </div>
        )}

        {/* ═══════ SHUFFLE FORMAT: Direct solo registration ═══════ */}
        {actualStep === "solo" && isShuffle && (
          <div>
            <p style={{ color: "#aaa", fontSize: 14, marginBottom: 8, lineHeight: 1.6 }}>
              This is a <span style={{ color: accentColor, fontWeight: 700 }}>shuffle tournament</span> — all players register solo. Teams will be auto-generated with balanced skill levels after registration closes.
            </p>
            <p style={{ color: "#666", fontSize: 12, marginBottom: 20 }}>No premades, no comfort picks — just raw skill.</p>
            {error && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <button onClick={handleSolo} disabled={loading} style={{
              width: "100%", padding: 14,
              background: loading ? "#991b1b" : `linear-gradient(135deg, ${accentColor}, #cc1a2a)`,
              border: "none", borderRadius: 8, color: "#fff",
              fontWeight: 700, fontSize: 15, cursor: loading ? "default" : "pointer",
            }}>
              {loading ? "Registering..." : "Register Solo →"}
            </button>
          </div>
        )}

        {/* ═══════ STANDARD/AUCTION: 3-choice menu ═══════ */}
        {actualStep === "choose" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button onClick={() => setStep("create")} style={{
              padding: "18px 20px", background: "#111", border: "1px solid #222",
              borderRadius: 10, color: "#fff", cursor: "pointer", textAlign: "left" as const,
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = accentColor)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#222")}
            >
              <p style={{ fontWeight: 700, fontSize: 15 }}>🏅 Create a Team</p>
              <p style={{ color: "#555", fontSize: 12, marginTop: 4 }}>Be the captain, invite up to 4 friends with a code</p>
            </button>

            <button onClick={() => setStep("join")} style={{
              padding: "18px 20px", background: "#111", border: "1px solid #222",
              borderRadius: 10, color: "#fff", cursor: "pointer", textAlign: "left" as const,
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "#3b82f6")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#222")}
            >
              <p style={{ fontWeight: 700, fontSize: 15 }}>🔗 Join a Team</p>
              <p style={{ color: "#555", fontSize: 12, marginTop: 4 }}>Enter the 6-digit code your captain shared</p>
            </button>

            <button onClick={handleSolo} disabled={loading} style={{
              padding: "18px 20px", background: "#111", border: "1px solid #222",
              borderRadius: 10, color: "#fff", cursor: loading ? "default" : "pointer", textAlign: "left" as const,
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "#22c55e")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#222")}
            >
              <p style={{ fontWeight: 700, fontSize: 15 }}>🎮 Find Me a Team</p>
              <p style={{ color: "#555", fontSize: 12, marginTop: 4 }}>
                {loading ? "Registering..." : "Register solo, we'll place you in a team by rank"}
              </p>
            </button>
            {error && <p style={{ color: "#ef4444", fontSize: 13, textAlign: "center" }}>{error}</p>}
          </div>
        )}

        {actualStep === "create" && (
          <div>
            <p style={{ color: "#aaa", fontSize: 14, marginBottom: 24 }}>
              You'll be the team captain. We'll generate a 6-digit code you can share with your teammates.
            </p>
            {error && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep("choose")} style={{
                flex: 1, padding: 12, background: "transparent", border: "1px solid #1a1a1a",
                borderRadius: 8, color: "#555", fontSize: 13, cursor: "pointer",
              }}>← Back</button>
              <button onClick={handleCreateTeam} disabled={loading} style={{
                flex: 2, padding: 12,
                background: loading ? "#b45309" : `linear-gradient(135deg, ${accentColor}, #ea580c)`,
                border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 14, cursor: loading ? "default" : "pointer",
              }}>{loading ? "Creating..." : "Create Team →"}</button>
            </div>
          </div>
        )}

        {actualStep === "join" && (
          <div>
            <p style={{ color: "#aaa", fontSize: 14, marginBottom: 16 }}>Enter the 6-digit code your captain shared with you.</p>
            <input type="text" placeholder="e.g. AX72KP" maxLength={6} value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              style={{
                width: "100%", padding: 14, background: "#111", border: "1px solid #222",
                borderRadius: 8, color: "#fff", fontSize: 22, letterSpacing: 8, textAlign: "center" as const,
                boxSizing: "border-box" as const, marginBottom: 12, outline: "none",
              }}
            />
            {error && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep("choose")} style={{
                flex: 1, padding: 12, background: "transparent", border: "1px solid #1a1a1a",
                borderRadius: 8, color: "#555", fontSize: 13, cursor: "pointer",
              }}>← Back</button>
              <button onClick={handleJoinTeam} disabled={loading} style={{
                flex: 2, padding: 12,
                background: loading ? "#166534" : "linear-gradient(135deg, #22c55e, #16a34a)",
                border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 14, cursor: loading ? "default" : "pointer",
              }}>{loading ? "Joining..." : "Join Team →"}</button>
            </div>
          </div>
        )}

        {actualStep === "success" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 48 }}>🎉</p>
            <h3 style={{ fontSize: 20, fontWeight: 800, marginTop: 12, color: "#fff" }}>
              {teamCode ? "Team Created!" : "You're Registered!"}
            </h3>

            {teamCode ? (
              <>
                <p style={{ color: "#555", fontSize: 13, marginTop: 8, marginBottom: 24 }}>Share this code with your teammates</p>
                <div style={{ background: "#111", border: "1px solid #222", borderRadius: 10, padding: "20px", marginBottom: 20 }}>
                  <p style={{ color: "#555", fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>TEAM CODE</p>
                  <p style={{ fontSize: 36, fontWeight: 800, letterSpacing: 10, color: accentColor }}>{teamCode}</p>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => navigator.clipboard.writeText(teamCode)} style={{
                    flex: 1, padding: 12, background: "#111", border: "1px solid #1a1a1a",
                    borderRadius: 8, color: "#aaa", fontSize: 13, cursor: "pointer",
                  }}>📋 Copy Code</button>
                  <button onClick={handleWhatsApp} style={{
                    flex: 1, padding: 12, background: "linear-gradient(135deg, #25d366, #128c7e)",
                    border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
                  }}>💬 Share on WhatsApp</button>
                </div>
              </>
            ) : isShuffle ? (
              <p style={{ color: "#555", fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
                You're registered! Teams will be auto-generated with balanced skill levels after registration closes.
              </p>
            ) : (
              <p style={{ color: "#555", fontSize: 13, marginTop: 8 }}>
                You're in the solo pool. We'll assign you to a team based on your rank before the tournament starts.
              </p>
            )}

            {warning && (
              <div style={{ marginTop: 12, background: "#1a1200", border: "1px solid #854d0e", borderRadius: 8, padding: "10px 14px", textAlign: "left" as const }}>
                <p style={{ color: "#fbbf24", fontSize: 12, fontWeight: 700, marginBottom: 3 }}>⚠️ Note</p>
                <p style={{ color: "#92400e", fontSize: 11, lineHeight: 1.6 }}>{warning}</p>
              </div>
            )}

            {!isValorant && isProfilePrivate && (
              <div style={{ marginTop: 16, background: "#1a1200", border: "1px solid #854d0e", borderRadius: 8, padding: "10px 14px", textAlign: "left" as const }}>
                <p style={{ color: "#fbbf24", fontSize: 12, fontWeight: 700, marginBottom: 3 }}>⚠️ Action needed to claim prizes</p>
                <p style={{ color: "#92400e", fontSize: 11, lineHeight: 1.6 }}>
                  Enable <span style={{ color: "#fbbf24" }}>Expose Public Match Data</span> in Dota 2 → Settings → Social and play one match.
                </p>
              </div>
            )}

            <button onClick={onClose} style={{
              marginTop: 16, width: "100%", padding: 12, background: "transparent",
              border: "1px solid #1a1a1a", borderRadius: 8, color: "#444", fontSize: 13, cursor: "pointer",
            }}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}