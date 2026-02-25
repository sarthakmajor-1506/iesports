"use client";

import { useAuth } from "../../../context/AuthContext";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, onSnapshot, collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Navbar from "../../../components/Navbar";
import { SoloTournament, SoloPlayer } from "@/lib/types";
import { getTimeUntilDeadline } from "@/lib/soloTournaments";

export default function SoloTournamentPage() {
  const { user, loading, steamLinked } = useAuth();
  const router = useRouter();
  const params = useParams();
  const id = params.weekId as string;

  const [tournament, setTournament] = useState<SoloTournament | null>(null);
  const [players, setPlayers] = useState<SoloPlayer[]>([]);
  const [isRegistered, setIsRegistered] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [tLoading, setTLoading] = useState(true);
  const [countdown, setCountdown] = useState("");
  const [myScore, setMyScore] = useState<SoloPlayer | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/");
    if (!loading && user && !steamLinked) router.push("/connect-steam");
  }, [user, loading, steamLinked]);

  // Load tournament
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "soloTournaments", id), (snap) => {
      if (snap.exists()) setTournament({ id: snap.id, ...snap.data() } as SoloTournament);
      setTLoading(false);
    });
    return () => unsub();
  }, [id]);

  // Load leaderboard
  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      collection(db, "soloTournaments", id, "players"),
      (snap) => {
        const all = snap.docs.map((d) => d.data() as SoloPlayer);
        all.sort((a, b) => b.cachedScore - a.cachedScore);
        setPlayers(all);
        if (user) {
          const mine = all.find((p) => p.uid === user.uid);
          setMyScore(mine || null);
          setIsRegistered(!!mine);
        }
      }
    );
    return () => unsub();
  }, [id, user]);

  // Countdown
  useEffect(() => {
    if (!tournament) return;
    const tick = () => setCountdown(getTimeUntilDeadline(tournament.registrationDeadline));
    tick();
    const i = setInterval(tick, 60000);
    return () => clearInterval(i);
  }, [tournament]);

  // Auto-refresh my score when I visit
  useEffect(() => {
    if (!user || !id || !isRegistered) return;
    const refresh = async () => {
      setRefreshing(true);
      try {
        await fetch("/api/solo/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tournamentId: id, uid: user.uid }),
        });
      } catch (e) {}
      setRefreshing(false);
    };
    refresh();
  }, [isRegistered]);

  const handleRegister = async () => {
    if (!user) return;
    setRegistering(true);
    setError("");
    try {
      const res = await fetch("/api/solo/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: id, uid: user.uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIsRegistered(true);
    } catch (e: any) {
      setError(e.message || "Registration failed");
    } finally {
      setRegistering(false);
    }
  };

  if (loading || tLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#050505", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#555" }}>Loading...</p>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div style={{ minHeight: "100vh", background: "#050505", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#555" }}>Tournament not found.</p>
      </div>
    );
  }

  const isEnded = tournament.status === "ended";
  const isUpcoming = tournament.status === "upcoming";
  const regClosed = countdown === "Registration Closed";
  const canRegister = !isEnded && !regClosed && !isRegistered;
  const slotsLeft = tournament.totalSlots - tournament.slotsBooked;

  // Find my rank
  const myRank = user ? players.findIndex((p) => p.uid === user.uid) + 1 : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#050505", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      <Navbar />

      {/* Hero */}
      <div style={{
        background: "linear-gradient(135deg, #0f0f0f, #111)",
        borderBottom: "1px solid #1a1a1a", padding: "32px 40px",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, #f97316, #22c55e, #3b82f6)" }} />
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 24 }}>
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
              <button onClick={() => router.push("/dota2")} style={{
                background: "transparent", border: "1px solid #1a1a1a", borderRadius: 6,
                color: "#555", fontSize: 12, padding: "4px 10px", cursor: "pointer",
              }}>← Back</button>
              <span style={{
                background: isEnded ? "#1a1a1a" : "#16a34a15",
                color: isEnded ? "#444" : "#22c55e",
                padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700,
              }}>
                {isEnded ? "Ended" : isUpcoming ? "Upcoming" : "🟢 Active"}
              </span>
              <span style={{ background: "#111", color: "#555", padding: "3px 10px", borderRadius: 20, fontSize: 10 }}>
                {tournament.type === "paid" ? "⭐ PRO" : "FREE"}
              </span>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>{tournament.name}</h1>
            <p style={{ color: "#555", fontSize: 14 }}>Play your normal ranked games — top 3 match scores count toward leaderboard.</p>

            {/* Countdown */}
            {tournament.status === "active" && !regClosed && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                marginTop: 14, background: "#0f1a0f", border: "1px solid #14532d",
                borderRadius: 8, padding: "8px 14px",
              }}>
                <span>⏱️</span>
                <span style={{ color: "#555", fontSize: 13 }}>Tournament started —</span>
                <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 13 }}>Registration ends in {countdown}</span>
              </div>
            )}
            {regClosed && tournament.status === "active" && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                marginTop: 14, background: "#1a0f00", border: "1px solid #7c2d12",
                borderRadius: 8, padding: "8px 14px",
              }}>
                <span style={{ color: "#f97316", fontSize: 13, fontWeight: 700 }}>🔒 Registration closed — Tournament ends Sunday</span>
              </div>
            )}
          </div>

          {/* Right: Prize + Register */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 14, minWidth: 200 }}>
            <div style={{ textAlign: "right" }}>
              <p style={{ color: "#333", fontSize: 10, letterSpacing: 1 }}>PRIZE POOL</p>
              <p style={{ fontSize: 32, fontWeight: 800, color: "#f97316" }}>{tournament.prizePool}</p>
              <p style={{ color: "#444", fontSize: 12, marginTop: 4 }}>{slotsLeft} / {tournament.totalSlots} slots left</p>
            </div>

            {/* My score card if registered */}
            {isRegistered && myScore && (
              <div style={{
                background: "#0f1a0f", border: "1px solid #16a34a40",
                borderRadius: 10, padding: "12px 16px", textAlign: "right", width: "100%",
              }}>
                <p style={{ color: "#444", fontSize: 10, letterSpacing: 1 }}>MY SCORE</p>
                <p style={{ fontSize: 28, fontWeight: 800, color: "#22c55e" }}>{myScore.cachedScore}</p>
                <p style={{ color: "#444", fontSize: 12 }}>
                  Rank #{myRank} · {myScore.matchesPlayed} matches played
                  {refreshing && <span style={{ color: "#555", marginLeft: 8 }}>↻ updating...</span>}
                </p>
              </div>
            )}

            {/* Register button */}
            {canRegister && (
              <button onClick={handleRegister} disabled={registering} style={{
                width: "100%", padding: "12px 28px",
                background: registering ? "#b45309" : "linear-gradient(135deg, #f97316, #ea580c)",
                border: "none", borderRadius: 10, color: "#fff",
                fontWeight: 700, fontSize: 14, cursor: registering ? "default" : "pointer",
              }}>
                {registering ? "Registering..." : "Register Free →"}
              </button>
            )}
            {isRegistered && (
              <div style={{
                width: "100%", padding: "12px 0", textAlign: "center",
                background: "#14532d", border: "1px solid #16a34a40",
                borderRadius: 10, color: "#22c55e", fontWeight: 700, fontSize: 14,
              }}>✓ Registered</div>
            )}
            {error && <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>}
          </div>
        </div>
      </div>

      {/* Smurf warning */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 40px 0" }}>
        <div style={{
          background: "#1a0f00", border: "1px solid #7c2d12",
          borderRadius: 10, padding: "12px 18px",
          display: "flex", gap: 10, alignItems: "flex-start",
        }}>
          <span style={{ fontSize: 16 }}>🤖</span>
          <p style={{ color: "#78350f", fontSize: 13, lineHeight: 1.6 }}>
            <span style={{ color: "#f97316", fontWeight: 700 }}>AI Smurf Monitor Active — </span>
            Our system analyses your recent match history. Abnormal performance patterns compared to your rank history will result in disqualification and prize forfeiture.
          </p>
        </div>
      </div>

      {/* Leaderboard */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 40px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <p style={{ color: "#444", fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>
            LEADERBOARD — {players.length} PLAYERS
          </p>
          {isRegistered && (
            <button
              onClick={async () => {
                if (!user) return;
                setRefreshing(true);
                await fetch("/api/solo/refresh", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ tournamentId: id, uid: user.uid }),
                });
                setRefreshing(false);
              }}
              disabled={refreshing}
              style={{
                padding: "6px 14px", background: "transparent",
                border: "1px solid #1a1a1a", borderRadius: 6,
                color: refreshing ? "#333" : "#555", fontSize: 12,
                cursor: refreshing ? "default" : "pointer",
              }}
            >
              {refreshing ? "↻ Refreshing..." : "↻ Refresh My Score"}
            </button>
          )}
        </div>

        {players.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <p style={{ fontSize: 40 }}>🏆</p>
            <p style={{ color: "#444", marginTop: 16, fontSize: 15 }}>No players yet. Be the first to register!</p>
          </div>
        ) : (
          <div style={{ background: "#0a0a0a", border: "1px solid #141414", borderRadius: 12, overflow: "hidden" }}>
            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "60px 1fr 120px 120px 100px",
              padding: "12px 20px", borderBottom: "1px solid #141414",
            }}>
              {["RANK", "PLAYER", "SCORE", "MATCHES", "TOP MATCH"].map((h) => (
                <p key={h} style={{ color: "#333", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>{h}</p>
              ))}
            </div>

            {/* Rows */}
            {players.map((p, i) => {
              const rank = i + 1;
              const isMe = user?.uid === p.uid;
              const rankColor = rank === 1 ? "#f59e0b" : rank === 2 ? "#9ca3af" : rank === 3 ? "#b45309" : "#444";
              const rankEmoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
              const topMatchScore = p.cachedTopMatches?.[0]?.score || 0;

              return (
                <div
                  key={p.uid}
                  style={{
                    display: "grid", gridTemplateColumns: "60px 1fr 120px 120px 100px",
                    padding: "14px 20px",
                    borderBottom: "1px solid #0f0f0f",
                    background: isMe ? "#0f1a0f" : "transparent",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => !isMe && (e.currentTarget.style.background = "#0d0d0d")}
                  onMouseLeave={e => !isMe && (e.currentTarget.style.background = "transparent")}
                >
                  {/* Rank */}
                  <div style={{ display: "flex", alignItems: "center" }}>
                    {rankEmoji ? (
                      <span style={{ fontSize: 18 }}>{rankEmoji}</span>
                    ) : (
                      <span style={{ color: rankColor, fontWeight: 700, fontSize: 14 }}>#{rank}</span>
                    )}
                  </div>

                  {/* Player */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <img
                      src={p.steamAvatar || ""}
                      alt=""
                      style={{ width: 32, height: 32, borderRadius: "50%", border: isMe ? "2px solid #22c55e" : "2px solid #1a1a1a" }}
                    />
                    <div>
                      <p style={{ fontSize: 14, fontWeight: isMe ? 700 : 500, color: isMe ? "#22c55e" : "#fff" }}>
                        {p.steamName} {isMe && <span style={{ fontSize: 11, color: "#22c55e" }}>(you)</span>}
                      </p>
                      {p.disqualified && (
                        <p style={{ fontSize: 11, color: "#ef4444" }}>⚠️ Disqualified</p>
                      )}
                    </div>
                  </div>

                  {/* Score */}
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: p.cachedScore > 0 ? "#fff" : "#333" }}>
                      {p.cachedScore}
                    </span>
                    {p.cachedScore === 0 && (
                      <span style={{ color: "#333", fontSize: 11, marginLeft: 6 }}>no matches</span>
                    )}
                  </div>

                  {/* Matches */}
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span style={{ color: "#555", fontSize: 14 }}>{p.matchesPlayed}</span>
                  </div>

                  {/* Top match */}
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span style={{ color: topMatchScore > 0 ? "#f97316" : "#333", fontSize: 14, fontWeight: topMatchScore > 0 ? 700 : 400 }}>
                      {topMatchScore > 0 ? topMatchScore : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}