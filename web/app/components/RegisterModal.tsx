"use client";

import { useState } from "react";

type Props = {
  tournament: any;
  user: any;
  dotaProfile: any;
  onClose: () => void;
  onSuccess: () => void;  // ← add this  
};

type Step = "choose" | "create" | "join" | "solo" | "success";

export default function RegisterModal({ tournament, user, dotaProfile, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>("choose");
  const [joinCode, setJoinCode] = useState("");
  const [teamCode, setTeamCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isProfilePrivate = !dotaProfile?.dotaRankTier || dotaProfile?.dotaRankTier === 0;

  const handleCreateTeam = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/teams/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: tournament.id, uid: user.uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTeamCode(data.teamCode);
      onSuccess();
      setStep("success");
    } catch (e: any) {
      setError(e.message || "Failed to create team");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinTeam = async () => {
    if (joinCode.length !== 6) { setError("Enter a valid 6-digit code"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/teams/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: joinCode.toUpperCase(), uid: user.uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSuccess();
      setStep("success");
    } catch (e: any) {
      setError(e.message || "Failed to join team");
    } finally {
      setLoading(false);
    }
  };

  const handleSolo = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/teams/solo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: tournament.id, uid: user.uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSuccess();
      setStep("success");
    } catch (e: any) {
      setError(e.message || "Failed to register");
    } finally {
      setLoading(false);
    }
  };

  const handleWhatsApp = () => {
    const msg = encodeURIComponent(`Join my Dota 2 team on Indian Esports!\nTournament: ${tournament.name}\nTeam Code: ${teamCode}\nJoin here: ${window.location.origin}`);
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

        <p style={{ color: "#f97316", fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>REGISTER</p>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 4, marginBottom: 16 }}>{tournament.name}</h2>

        {isProfilePrivate && step === "choose" && (
          <div style={{
            background: "#1a1200", border: "1px solid #854d0e",
            borderRadius: 10, padding: "12px 14px", marginBottom: 20,
            display: "flex", gap: 10, alignItems: "flex-start",
          }}>
            <span style={{ fontSize: 16, marginTop: 1 }}>⚠️</span>
            <div>
              <p style={{ color: "#fbbf24", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                Your Dota 2 profile appears to be private
              </p>
              <p style={{ color: "#92400e", fontSize: 12, lineHeight: 1.6 }}>
                You can still register, but your rank won't be verified. To enable rank-based matchmaking and qualify for prize payouts, turn on{" "}
                <span style={{ color: "#fbbf24", fontWeight: 600 }}>Expose Public Match Data</span>{" "}
                in Dota 2 → Settings → Social, then play one match. Changes take up to 24 hours to reflect.
              </p>
            </div>
          </div>
        )}

        {step === "choose" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button onClick={() => setStep("create")} style={{
              padding: "18px 20px", background: "#111", border: "1px solid #222",
              borderRadius: 10, color: "#fff", cursor: "pointer", textAlign: "left",
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "#f97316")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#222")}
            >
              <p style={{ fontWeight: 700, fontSize: 15 }}>🏅 Create a Team</p>
              <p style={{ color: "#555", fontSize: 12, marginTop: 4 }}>Be the captain, invite up to 4 friends with a code</p>
            </button>

            <button onClick={() => setStep("join")} style={{
              padding: "18px 20px", background: "#111", border: "1px solid #222",
              borderRadius: 10, color: "#fff", cursor: "pointer", textAlign: "left",
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "#3b82f6")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#222")}
            >
              <p style={{ fontWeight: 700, fontSize: 15 }}>🔗 Join a Team</p>
              <p style={{ color: "#555", fontSize: 12, marginTop: 4 }}>Enter the 6-digit code your captain shared</p>
            </button>

            <button onClick={handleSolo} disabled={loading} style={{
              padding: "18px 20px", background: "#111", border: "1px solid #222",
              borderRadius: 10, color: "#fff", cursor: loading ? "default" : "pointer", textAlign: "left",
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

        {step === "create" && (
          <div>
            <p style={{ color: "#aaa", fontSize: 14, marginBottom: 24 }}>
              You'll be the team captain. We'll generate a 6-digit code you can share with your teammates.
            </p>
            {error && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep("choose")} style={{
                flex: 1, padding: 12, background: "transparent",
                border: "1px solid #1a1a1a", borderRadius: 8, color: "#555",
                fontSize: 13, cursor: "pointer",
              }}>← Back</button>
              <button onClick={handleCreateTeam} disabled={loading} style={{
                flex: 2, padding: 12,
                background: loading ? "#b45309" : "linear-gradient(135deg, #f97316, #ea580c)",
                border: "none", borderRadius: 8, color: "#fff",
                fontWeight: 700, fontSize: 14, cursor: loading ? "default" : "pointer",
              }}>
                {loading ? "Creating..." : "Create Team →"}
              </button>
            </div>
          </div>
        )}

        {step === "join" && (
          <div>
            <p style={{ color: "#aaa", fontSize: 14, marginBottom: 16 }}>
              Enter the 6-digit code your team captain shared with you.
            </p>
            <input
              type="text"
              placeholder="e.g. AX72KP"
              maxLength={6}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              style={{
                width: "100%", padding: 14, background: "#111",
                border: "1px solid #222", borderRadius: 8, color: "#fff",
                fontSize: 22, letterSpacing: 8, textAlign: "center",
                boxSizing: "border-box", marginBottom: 12, outline: "none",
              }}
            />
            {error && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep("choose")} style={{
                flex: 1, padding: 12, background: "transparent",
                border: "1px solid #1a1a1a", borderRadius: 8, color: "#555",
                fontSize: 13, cursor: "pointer",
              }}>← Back</button>
              <button onClick={handleJoinTeam} disabled={loading} style={{
                flex: 2, padding: 12,
                background: loading ? "#166534" : "linear-gradient(135deg, #22c55e, #16a34a)",
                border: "none", borderRadius: 8, color: "#fff",
                fontWeight: 700, fontSize: 14, cursor: loading ? "default" : "pointer",
              }}>
                {loading ? "Joining..." : "Join Team →"}
              </button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 48 }}>🎉</p>
            <h3 style={{ fontSize: 20, fontWeight: 800, marginTop: 12 }}>
              {teamCode ? "Team Created!" : "You're Registered!"}
            </h3>

            {teamCode ? (
              <>
                <p style={{ color: "#555", fontSize: 13, marginTop: 8, marginBottom: 24 }}>
                  Share this code with your teammates
                </p>
                <div style={{
                  background: "#111", border: "1px solid #222", borderRadius: 10,
                  padding: "20px", marginBottom: 20,
                }}>
                  <p style={{ color: "#555", fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>TEAM CODE</p>
                  <p style={{ fontSize: 36, fontWeight: 800, letterSpacing: 10, color: "#f97316" }}>{teamCode}</p>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => navigator.clipboard.writeText(teamCode)} style={{
                    flex: 1, padding: 12, background: "#111",
                    border: "1px solid #1a1a1a", borderRadius: 8,
                    color: "#aaa", fontSize: 13, cursor: "pointer",
                  }}>📋 Copy Code</button>
                  <button onClick={handleWhatsApp} style={{
                    flex: 1, padding: 12,
                    background: "linear-gradient(135deg, #25d366, #128c7e)",
                    border: "none", borderRadius: 8,
                    color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
                  }}>💬 Share on WhatsApp</button>
                </div>
              </>
            ) : (
              <p style={{ color: "#555", fontSize: 13, marginTop: 8 }}>
                You're in the solo pool. We'll assign you to a team based on your rank before the tournament starts.
              </p>
            )}

            {isProfilePrivate && (
              <div style={{
                marginTop: 16, background: "#1a1200", border: "1px solid #854d0e",
                borderRadius: 8, padding: "10px 14px", textAlign: "left",
              }}>
                <p style={{ color: "#fbbf24", fontSize: 12, fontWeight: 700, marginBottom: 3 }}>
                  ⚠️ Action needed to claim prizes
                </p>
                <p style={{ color: "#92400e", fontSize: 11, lineHeight: 1.6 }}>
                  Enable <span style={{ color: "#fbbf24" }}>Expose Public Match Data</span> in Dota 2 → Settings → Social and play one match. Takes up to 24 hours to reflect.
                </p>
              </div>
            )}

            <button onClick={onClose} style={{
              marginTop: 16, width: "100%", padding: 12,
              background: "transparent", border: "1px solid #1a1a1a",
              borderRadius: 8, color: "#444", fontSize: 13, cursor: "pointer",
            }}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}