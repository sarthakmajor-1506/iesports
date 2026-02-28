"use client";

import { useAuth } from "../../../context/AuthContext";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { doc, onSnapshot, collection } from "firebase/firestore";
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

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, "soloTournaments", id), (snap) => {
      if (snap.exists()) setTournament({ id: snap.id, ...snap.data() } as SoloTournament);
      setTLoading(false);
    });
    return () => unsub();
  }, [id]);

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

  useEffect(() => {
    if (!tournament) return;
    const tick = () => setCountdown(getTimeUntilDeadline(tournament.registrationDeadline));
    tick();
    const i = setInterval(tick, 60000);
    return () => clearInterval(i);
  }, [tournament]);

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
      } catch {}
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

  const handleRefresh = async () => {
    if (!user || refreshing) return;
    setRefreshing(true);
    try {
      await fetch("/api/solo/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: id, uid: user.uid }),
      });
    } catch {}
    setRefreshing(false);
  };

  // ── Loading / not found ────────────────────────────────────────────────────
  if (loading || tLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#F8F7F4", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#bbb", fontSize: 14 }}>Loading…</p>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div style={{ minHeight: "100vh", background: "#F8F7F4", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#bbb", fontSize: 14 }}>Tournament not found.</p>
      </div>
    );
  }

  const isEnded    = tournament.status === "ended";
  const isUpcoming = tournament.status === "upcoming";
  const isActive   = tournament.status === "active";
  const regClosed  = countdown === "Registration Closed";
  const canRegister = !isEnded && !regClosed && !isRegistered;
  const slotsLeft  = tournament.totalSlots - tournament.slotsBooked;
  const myRank     = user ? players.findIndex((p) => p.uid === user.uid) + 1 : 0;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .st-page {
          min-height: 100vh;
          background: #F8F7F4;
          color: #111;
          font-family: var(--font-geist-sans), system-ui, sans-serif;
        }

        /* ── Hero ── */
        .st-hero {
          background: #fff;
          border-bottom: 1px solid #E5E3DF;
          padding: 28px 40px 28px;
        }
        .st-hero-inner {
          max-width: 1100px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 24px;
        }

        /* Back + badges row */
        .st-hero-top {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }
        .st-back-btn {
          background: #F8F7F4;
          border: 1px solid #E5E3DF;
          border-radius: 100px;
          color: #555;
          font-size: 0.78rem;
          font-weight: 600;
          padding: 5px 14px;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s;
        }
        .st-back-btn:hover { background: #F2F1EE; color: #111; }

        .st-badge {
          font-size: 0.65rem;
          font-weight: 800;
          padding: 4px 11px;
          border-radius: 100px;
          letter-spacing: 0.04em;
        }
        .st-badge.active   { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
        .st-badge.ended    { background: #F2F1EE; color: #888;    border: 1px solid #E5E3DF; }
        .st-badge.upcoming { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
        .st-badge.free     { background: #fff7ed; color: #ea580c; border: 1px solid #fed7aa; }
        .st-badge.pro      { background: #faf5ff; color: #7c3aed; border: 1px solid #e9d5ff; }

        .st-hero-title {
          font-size: 1.8rem;
          font-weight: 900;
          color: #111;
          letter-spacing: -0.02em;
          margin-bottom: 6px;
        }
        .st-hero-sub {
          font-size: 0.84rem;
          color: #888;
          line-height: 1.5;
        }

        /* Countdown chips */
        .st-countdown {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 14px;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 100px;
          padding: 7px 16px;
          font-size: 0.82rem;
        }
        .st-countdown span.label { color: #888; }
        .st-countdown span.time  { color: #16a34a; font-weight: 700; }

        .st-reg-closed {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 14px;
          background: #fff7ed;
          border: 1px solid #fed7aa;
          border-radius: 100px;
          padding: 7px 16px;
          font-size: 0.82rem;
          color: #ea580c;
          font-weight: 600;
        }

        /* Right panel */
        .st-hero-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 12px;
          min-width: 200px;
        }
        .st-prize-block { text-align: right; }
        .st-prize-label {
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #bbb;
          margin-bottom: 4px;
        }
        .st-prize-amount {
          font-size: 2rem;
          font-weight: 900;
          color: #F05A28;
          line-height: 1;
        }
        .st-slots-text {
          font-size: 0.75rem;
          color: #aaa;
          margin-top: 4px;
        }

        /* My score card */
        .st-my-score {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 12px;
          padding: 14px 18px;
          text-align: right;
          width: 100%;
        }
        .st-my-score-label {
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #86efac;
          margin-bottom: 4px;
        }
        .st-my-score-num {
          font-size: 2rem;
          font-weight: 900;
          color: #16a34a;
          line-height: 1;
        }
        .st-my-score-meta {
          font-size: 0.75rem;
          color: #86efac;
          margin-top: 4px;
        }

        /* Register / registered buttons */
        .st-register-btn {
          width: 100%;
          padding: 12px 0;
          background: #F05A28;
          border: none;
          border-radius: 100px;
          color: #fff;
          font-weight: 700;
          font-size: 0.9rem;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s;
          box-shadow: 0 3px 14px rgba(240,90,40,0.3);
        }
        .st-register-btn:hover:not(:disabled) { background: #D44A1A; }
        .st-register-btn:disabled { opacity: 0.6; cursor: default; }

        .st-registered-pill {
          width: 100%;
          padding: 11px 0;
          text-align: center;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 100px;
          color: #16a34a;
          font-weight: 700;
          font-size: 0.88rem;
        }
        .st-error { font-size: 0.8rem; color: #dc2626; text-align: right; }

        /* ── Smurf warning ── */
        .st-smurf-wrap {
          max-width: 1100px;
          margin: 20px auto 0;
          padding: 0 40px;
        }
        .st-smurf-banner {
          background: #fff7ed;
          border: 1px solid #fed7aa;
          border-radius: 12px;
          padding: 12px 18px;
          display: flex;
          gap: 10px;
          align-items: flex-start;
        }
        .st-smurf-text {
          font-size: 0.8rem;
          color: #92400e;
          line-height: 1.6;
        }
        .st-smurf-text strong { color: #ea580c; }

        /* ── Leaderboard ── */
        .st-lb-wrap {
          max-width: 1100px;
          margin: 20px auto 48px;
          padding: 0 40px;
        }
        .st-lb-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
        }
        .st-lb-title {
          font-size: 0.68rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #bbb;
        }
        .st-refresh-btn {
          background: #fff;
          border: 1px solid #E5E3DF;
          border-radius: 100px;
          color: #555;
          font-size: 0.78rem;
          font-weight: 600;
          padding: 5px 14px;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .st-refresh-btn:hover:not(:disabled) { background: #F2F1EE; color: #111; }
        .st-refresh-btn:disabled { opacity: 0.5; cursor: default; }

        /* Empty state */
        .st-empty {
          text-align: center;
          padding: 60px 0;
          color: #bbb;
        }
        .st-empty-emoji { font-size: 44px; margin-bottom: 16px; }
        .st-empty-text  { font-size: 0.9rem; }

        /* Table */
        .st-table {
          background: #fff;
          border: 1px solid #E5E3DF;
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 1px 4px rgba(0,0,0,0.06);
        }
        .st-table-head {
          display: grid;
          grid-template-columns: 56px 1fr 110px 110px 100px;
          padding: 10px 20px;
          border-bottom: 1px solid #F2F1EE;
          background: #F8F7F4;
        }
        .st-table-head span {
          font-size: 0.62rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #bbb;
        }
        .st-table-row {
          display: grid;
          grid-template-columns: 56px 1fr 110px 110px 100px;
          padding: 12px 20px;
          border-bottom: 1px solid #F8F7F4;
          align-items: center;
          transition: background 0.12s;
        }
        .st-table-row:last-child { border-bottom: none; }
        .st-table-row:hover { background: #F8F7F4; }
        .st-table-row.me {
          background: #f0fdf4;
          border-left: 3px solid #22c55e;
        }
        .st-table-row.me:hover { background: #dcfce7; }

        /* Rank cell */
        .st-rank-cell {
          display: flex;
          align-items: center;
          font-size: 0.88rem;
          font-weight: 700;
        }
        .st-rank-1 { color: #d97706; }
        .st-rank-2 { color: #6b7280; }
        .st-rank-3 { color: #b45309; }
        .st-rank-n { color: #bbb; }

        /* Player cell */
        .st-player-cell {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .st-player-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 2px solid #E5E3DF;
          flex-shrink: 0;
        }
        .st-player-avatar.me { border-color: #22c55e; }
        .st-player-name {
          font-size: 0.88rem;
          font-weight: 600;
          color: #111;
        }
        .st-player-name.me { color: #16a34a; }
        .st-player-you {
          font-size: 0.7rem;
          color: #16a34a;
          font-weight: 500;
          margin-left: 4px;
        }
        .st-disq {
          font-size: 0.72rem;
          color: #dc2626;
          margin-top: 2px;
        }

        /* Score cell */
        .st-score-cell {
          font-size: 0.95rem;
          font-weight: 800;
          color: #111;
        }
        .st-score-zero { color: #ddd; font-weight: 400; font-size: 0.85rem; }

        /* Meta cells */
        .st-meta-cell {
          font-size: 0.88rem;
          color: #555;
          font-weight: 500;
        }
        .st-top-match-val { color: #F05A28; font-weight: 700; }
        .st-top-match-empty { color: #ddd; }

        @media (max-width: 700px) {
          .st-hero { padding: 20px; }
          .st-smurf-wrap, .st-lb-wrap { padding: 0 16px; }
          .st-table-head,
          .st-table-row { grid-template-columns: 48px 1fr 80px 80px; }
          .st-table-head span:last-child,
          .st-table-row > *:last-child { display: none; }
        }
      `}</style>

      <div className="st-page">
        <Navbar />

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div className="st-hero">
          <div className="st-hero-inner">

            {/* Left */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="st-hero-top">
                <button className="st-back-btn" onClick={() => router.push("/dota2")}>
                  ← Back
                </button>
                <span className={`st-badge ${isEnded ? "ended" : isUpcoming ? "upcoming" : "active"}`}>
                  {isEnded ? "Ended" : isUpcoming ? "Upcoming" : "🟢 Active"}
                </span>
                <span className={`st-badge ${tournament.type === "paid" ? "pro" : "free"}`}>
                  {tournament.type === "paid" ? "⭐ PRO" : "FREE"}
                </span>
              </div>

              <h1 className="st-hero-title">{tournament.name}</h1>
              <p className="st-hero-sub">
                Play your normal ranked games — your top 3 match scores count toward the leaderboard.
              </p>

              {/* Countdown */}
              {isActive && !regClosed && (
                <div className="st-countdown">
                  <span>⏱️</span>
                  <span className="label">Registration ends in</span>
                  <span className="time">{countdown}</span>
                </div>
              )}
              {isActive && regClosed && (
                <div className="st-reg-closed">
                  🔒 Registration closed — Tournament ends Sunday
                </div>
              )}
            </div>

            {/* Right */}
            <div className="st-hero-right">
              <div className="st-prize-block">
                <div className="st-prize-label">Prize Pool</div>
                <div className="st-prize-amount">{tournament.prizePool}</div>
                <div className="st-slots-text">{slotsLeft} / {tournament.totalSlots} slots left</div>
              </div>

              {/* My score */}
              {isRegistered && myScore && (
                <div className="st-my-score">
                  <div className="st-my-score-label">My Score</div>
                  <div className="st-my-score-num">{myScore.cachedScore}</div>
                  <div className="st-my-score-meta">
                    Rank #{myRank} · {myScore.matchesPlayed} matches
                    {refreshing && <span style={{ marginLeft: 6, opacity: 0.6 }}>↻ updating…</span>}
                  </div>
                </div>
              )}

              {/* Register */}
              {canRegister && (
                <button
                  className="st-register-btn"
                  onClick={handleRegister}
                  disabled={registering}
                >
                  {registering ? "Registering…" : "Register Free →"}
                </button>
              )}
              {isRegistered && (
                <div className="st-registered-pill">✓ Registered</div>
              )}
              {error && <p className="st-error">{error}</p>}
            </div>
          </div>
        </div>

        {/* ── Smurf warning ─────────────────────────────────────────────────── */}
        <div className="st-smurf-wrap">
          <div className="st-smurf-banner">
            <span style={{ fontSize: 15, flexShrink: 0 }}>🤖</span>
            <p className="st-smurf-text">
              <strong>AI Smurf Monitor Active — </strong>
              Our system analyses your recent match history. Abnormal performance compared to your rank history will result in disqualification and prize forfeiture.
            </p>
          </div>
        </div>

        {/* ── Leaderboard ───────────────────────────────────────────────────── */}
        <div className="st-lb-wrap">
          <div className="st-lb-header">
            <span className="st-lb-title">Leaderboard — {players.length} Players</span>
            {isRegistered && (
              <button
                className="st-refresh-btn"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                {refreshing ? "↻ Refreshing…" : "↻ Refresh My Score"}
              </button>
            )}
          </div>

          {players.length === 0 ? (
            <div className="st-empty">
              <div className="st-empty-emoji">🏆</div>
              <p className="st-empty-text">No players yet. Be the first to register!</p>
            </div>
          ) : (
            <div className="st-table">
              {/* Header */}
              <div className="st-table-head">
                <span>Rank</span>
                <span>Player</span>
                <span>Score</span>
                <span>Matches</span>
                <span>Top Match</span>
              </div>

              {/* Rows */}
              {players.map((p, i) => {
                const rank = i + 1;
                const isMe = user?.uid === p.uid;
                const topMatchScore = p.cachedTopMatches?.[0]?.score || 0;

                const rankEl = rank === 1 ? (
                  <span style={{ fontSize: 18 }}>🥇</span>
                ) : rank === 2 ? (
                  <span style={{ fontSize: 18 }}>🥈</span>
                ) : rank === 3 ? (
                  <span style={{ fontSize: 18 }}>🥉</span>
                ) : (
                  <span className="st-rank-n">#{rank}</span>
                );

                return (
                  <div
                    key={p.uid}
                    className={`st-table-row${isMe ? " me" : ""}`}
                  >
                    {/* Rank */}
                    <div className="st-rank-cell">{rankEl}</div>

                    {/* Player */}
                    <div className="st-player-cell">
                      <img
                        src={p.steamAvatar || ""}
                        alt=""
                        className={`st-player-avatar${isMe ? " me" : ""}`}
                      />
                      <div>
                        <div className={`st-player-name${isMe ? " me" : ""}`}>
                          {p.steamName}
                          {isMe && <span className="st-player-you">(you)</span>}
                        </div>
                        {p.disqualified && (
                          <div className="st-disq">⚠️ Disqualified</div>
                        )}
                      </div>
                    </div>

                    {/* Score */}
                    <div>
                      {p.cachedScore > 0 ? (
                        <span className="st-score-cell">{p.cachedScore}</span>
                      ) : (
                        <span className="st-score-zero">—</span>
                      )}
                    </div>

                    {/* Matches */}
                    <div className="st-meta-cell">{p.matchesPlayed}</div>

                    {/* Top match */}
                    <div>
                      {topMatchScore > 0 ? (
                        <span className="st-top-match-val">{topMatchScore}</span>
                      ) : (
                        <span className="st-top-match-empty">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}