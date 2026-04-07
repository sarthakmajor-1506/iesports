"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Navbar, { triggerPhoneModal } from "@/app/components/Navbar";
import { useAuth } from "@/app/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, setDoc, collection, getDocs, query, orderBy } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { navigateWithAppPriority } from "@/app/lib/mobileAuth";
import { triggerDiscordPrompt, hasDiscordAccount } from "@/app/components/DiscordAccountsPrompt";

// ─── Types ────────────────────────────────────────────────────────────────────
type ProfileTab = "valorant" | "dota" | "account";

interface GlobalStats {
  puuid?: string; uid?: string; name?: string; tag?: string;
  valorant?: {
    totalKills: number; totalDeaths: number; totalAssists: number;
    totalScore: number; totalHeadshots: number; totalBodyshots: number; totalLegshots: number;
    totalDamageDealt: number; totalDamageReceived: number;
    matchesPlayed: number; totalRoundsPlayed: number; gamesWon: number;
    kd: number; acs: number; hsPercent: number;
    agents: string[]; tournaments: string[];
  };
  dota?: any;
}

interface DiscordConnection {
  type: string; name: string; id: string; verified: boolean;
}

interface UserProfile {
  uid: string;
  fullName?: string;
  riotGameName?: string; riotTagLine?: string; riotAvatar?: string;
  riotRank?: string; riotTier?: number; riotPuuid?: string; riotVerified?: string;
  discordUsername?: string; discordId?: string;
  discordConnections?: DiscordConnection[];
  steamName?: string; steamId?: string; steamAvatar?: string;
  phone?: string; upiId?: string; displayName?: string; personalPhoto?: string;
}

interface MatchHistoryItem {
  tournamentId: string; tournamentName: string;
  matchDocId: string; matchDay: number; matchIndex: number;
  team1Name: string; team2Name: string;
  team1Score: number; team2Score: number;
  games: { gameNum: number; mapName: string; winner: string; team1Rounds: number; team2Rounds: number; playerTeam: string;
    kills: number; deaths: number; assists: number; agent: string; score: number; acs: number; }[];
  completedAt?: string;
}

export default function PlayerProfile() {
  const params = useParams();
  const router = useRouter();
  const uid = params.uid as string;
  const { user, steamLinked, riotData: authRiotData, discordConnections } = useAuth();
  const isOwnProfile = !!user && user.uid === uid;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [matchHistory, setMatchHistory] = useState<MatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTab>(isOwnProfile ? "account" : "valorant");
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);

  // UPI state
  const [upiInput, setUpiInput] = useState("");
  const [upiSaving, setUpiSaving] = useState(false);
  const [upiSaved, setUpiSaved] = useState(false);

  // Display name state
  const [nameInput, setNameInput] = useState("");
  const [nameEditing, setNameEditing] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  // Full name state
  const [fullNameInput, setFullNameInput] = useState("");
  const [fullNameEditing, setFullNameEditing] = useState(false);
  const [fullNameSaving, setFullNameSaving] = useState(false);
  const [fullNameSaved, setFullNameSaved] = useState(false);

  // Personal photo state
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoSaved, setPhotoSaved] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const load = async () => {
      setLoading(true);
      try {
        // Use API route (Admin SDK) so public profiles work regardless of Firestore rules
        const res = await fetch(`/api/player/${uid}`);
        if (!res.ok) { setLoading(false); return; }
        const d = await res.json();

        setProfile({
          uid,
          fullName: d.fullName,
          riotGameName: d.riotGameName, riotTagLine: d.riotTagLine,
          riotAvatar: d.riotAvatar, riotRank: d.riotRank,
          riotTier: d.riotTier, riotPuuid: d.riotPuuid, riotVerified: d.riotVerified,
          discordUsername: d.discordUsername, discordId: d.discordId, discordConnections: d.discordConnections,
          steamName: d.steamName, steamId: d.steamId, steamAvatar: d.steamAvatar,
          phone: d.phone, upiId: undefined, // loaded separately for owner only
          displayName: d.displayName,
        });

        // Load private owner-only fields via client SDK
        if (isOwnProfile) {
          const ownerDoc = await getDoc(doc(db, "users", uid));
          if (ownerDoc.exists()) {
            const od = ownerDoc.data();
            setProfile(prev => prev ? { ...prev, phone: od.phone || null, upiId: od.upiId || null, fullName: od.fullName || prev.fullName || null } : prev);
            if (od.upiId) setUpiInput(od.upiId);
            if (od.displayName) setNameInput(od.displayName);
            if (od.fullName) setFullNameInput(od.fullName);
          }
        }

        if (d.riotPuuid) {
          const glDoc = await getDoc(doc(db, "globalLeaderboard", d.riotPuuid));
          if (glDoc.exists()) setGlobalStats(glDoc.data() as GlobalStats);
        }

        if (d.registeredValorantTournaments?.length > 0) {
          const history: MatchHistoryItem[] = [];
          for (const tId of d.registeredValorantTournaments.slice(0, 10)) {
            try {
              const tDoc = await getDoc(doc(db, "valorantTournaments", tId));
              const tName = tDoc.exists() ? tDoc.data().name : tId;
              const matchesSnap = await getDocs(
                query(collection(db, "valorantTournaments", tId, "matches"), orderBy("matchDay"))
              );
              for (const mDoc of matchesSnap.docs) {
                const m = mDoc.data();
                if (m.status !== "completed" && m.status !== "live") continue;
                const games: MatchHistoryItem["games"] = [];
                let playerInMatch = false;
                for (let gNum = 1; gNum <= 5; gNum++) {
                  const gKey = `game${gNum}`;
                  const g = m[gKey] || m.games?.[gKey];
                  if (!g || !g.playerStats) continue;
                  const ps = g.playerStats.find((p: any) => {
                    if (d.riotPuuid && p.puuid === d.riotPuuid) return true;
                    if (p.name?.toLowerCase() === d.riotGameName?.toLowerCase()) return true;
                    return false;
                  });
                  if (ps) {
                    playerInMatch = true;
                    const roundsInGame = g.roundsPlayed || (g.redRoundsWon + g.blueRoundsWon) || 1;
                    games.push({
                      gameNum: gNum,
                      mapName: g.mapName || "Unknown",
                      winner: g.winner || "",
                      team1Rounds: g.team1RoundsWon ?? 0,
                      team2Rounds: g.team2RoundsWon ?? 0,
                      playerTeam: ps.tournamentTeam || ps.teamId || "",
                      kills: ps.kills || 0, deaths: ps.deaths || 0, assists: ps.assists || 0,
                      agent: ps.agent || "Unknown", score: ps.score || 0,
                      acs: roundsInGame > 0 ? Math.round(ps.score / roundsInGame) : 0,
                    });
                  }
                }
                if (playerInMatch) {
                  history.push({
                    tournamentId: tId, tournamentName: tName, matchDocId: mDoc.id,
                    matchDay: m.matchDay, matchIndex: m.matchIndex,
                    team1Name: m.team1Name, team2Name: m.team2Name,
                    team1Score: m.team1Score, team2Score: m.team2Score,
                    games, completedAt: m.completedAt,
                  });
                }
              }
            } catch (e) { /* skip failed tournament */ }
          }
          history.sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
          setMatchHistory(history);
        }
      } catch (e) { /* profile load failed */ }
      finally { setLoading(false); }
    };
    load();
  }, [uid, isOwnProfile]);

  const saveName = async () => {
    if (!user || !nameInput.trim()) return;
    setNameSaving(true);
    await updateDoc(doc(db, "users", user.uid), { displayName: nameInput.trim() });
    setProfile(prev => prev ? { ...prev, displayName: nameInput.trim() } : prev);
    setNameSaving(false);
    setNameEditing(false);
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2500);
  };

  const saveFullName = async () => {
    if (!user || !fullNameInput.trim() || fullNameInput.trim().length < 2) return;
    setFullNameSaving(true);
    await updateDoc(doc(db, "users", user.uid), { fullName: fullNameInput.trim() });
    setProfile(prev => prev ? { ...prev, fullName: fullNameInput.trim() } : prev);
    setFullNameSaving(false);
    setFullNameEditing(false);
    setFullNameSaved(true);
    setTimeout(() => setFullNameSaved(false), 2500);
  };

  const uploadPersonalPhoto = async (file: File) => {
    if (!user || !file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) return; // 5MB max
    setPhotoUploading(true);
    try {
      const storage = getStorage();
      const ext = file.name.split(".").pop() || "jpg";
      const storageRef = ref(storage, `personal-photos/${user.uid}.${ext}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await setDoc(doc(db, "users", user.uid), { personalPhoto: url }, { merge: true });
      setProfile(prev => prev ? { ...prev, personalPhoto: url } : prev);
      setPhotoSaved(true);
      setTimeout(() => setPhotoSaved(false), 2500);
    } catch (e) { console.error("Photo upload error:", e); }
    setPhotoUploading(false);
  };

  const saveUpi = async () => {
    if (!user || !upiInput.trim()) return;
    setUpiSaving(true);
    await updateDoc(doc(db, "users", user.uid), { upiId: upiInput.trim() });
    setUpiSaving(false);
    setUpiSaved(true);
    setTimeout(() => setUpiSaved(false), 2500);
  };

  const displayName = profile?.displayName || profile?.riotGameName || profile?.discordUsername || profile?.steamName || "Unknown";
  const displayTag = profile?.riotTagLine || "";
  const vStats = globalStats?.valorant;
  const totalGames = vStats?.matchesPlayed || 0;
  const gamesWon = vStats?.gamesWon || 0;
  const gamesLost = totalGames - gamesWon;
  const winRate = totalGames > 0 ? Math.round((gamesWon / totalGames) * 1000) / 10 : 0;
  const computedAcs = vStats && vStats.totalRoundsPlayed > 0
    ? Math.round(vStats.totalScore / vStats.totalRoundsPlayed) : vStats?.acs || 0;
  const agentCounts: Record<string, number> = {};
  for (const mh of matchHistory) for (const g of mh.games) agentCounts[g.agent] = (agentCounts[g.agent] || 0) + 1;
  const topAgents = Object.entries(agentCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  if (loading) return (
    <><style>{baseStyles}</style>
    <div className="pp-page"><Navbar /><div className="pp-content"><div className="pp-loading">Loading player profile...</div></div></div></>
  );

  if (!user) return (
    <><style>{baseStyles}</style>
    <div style={{ minHeight: "100vh", background: "#0A0F2A", fontFamily: "var(--font-geist-sans),system-ui,sans-serif", display: "flex", flexDirection: "column" }}>
      <Navbar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>👤</div>
        <h2 style={{ fontSize: "1.4rem", fontWeight: 900, color: "#F0EEEA", marginBottom: 8 }}>Sign in to view player profile</h2>
        <p style={{ fontSize: "0.88rem", color: "#8A8880", marginBottom: 28, maxWidth: 400, lineHeight: 1.6 }}>Create an account or sign in to see player stats, match history, and more.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={() => { try { sessionStorage.setItem("redirectAfterLogin", window.location.pathname); } catch {} window.open("/api/auth/discord-login", "_blank"); }}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(88,101,242,0.15)", color: "#818cf8", border: "1px solid rgba(88,101,242,0.35)", borderRadius: 100, padding: "12px 28px", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Sign in with Discord
          </button>
        </div>
      </div>
    </div></>
  );

  if (!profile) return (
    <><style>{baseStyles}</style>
    <div className="pp-page"><Navbar /><div className="pp-content"><div className="pp-loading">Player not found.</div></div></div></>
  );

  return (
    <>
      <style>{baseStyles}</style>
      <div className="pp-page">
        <Navbar />
        <div className="pp-content">

          {/* Back button */}
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => router.back()} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 100, padding: "6px 16px", fontSize: "0.78rem", fontWeight: 700,
              color: "#8A8880", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#F0EEEA"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#8A8880"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
              Back
            </button>
          </div>

          {/* ═══ HEADER ═══ */}
          <div className="pp-header">
            <div className="pp-header-left">
              {profile.riotAvatar ? (
                <img src={profile.riotAvatar} alt={displayName} className="pp-avatar" />
              ) : (
                <div className="pp-avatar-init">{displayName[0]?.toUpperCase()}</div>
              )}
              <div className="pp-header-info">
                {nameEditing ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      placeholder="Enter your name"
                      maxLength={30}
                      autoFocus
                      onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setNameEditing(false); }}
                      style={{
                        padding: "6px 12px", background: "#111", border: "1px solid #333",
                        borderRadius: 8, color: "#fff", fontSize: "1.1rem", fontWeight: 800,
                        outline: "none", width: 200, fontFamily: "inherit",
                      }}
                    />
                    <button onClick={saveName} disabled={nameSaving} style={{
                      padding: "6px 14px", background: "#3CCBFF", color: "#fff", border: "none",
                      borderRadius: 8, fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    }}>{nameSaving ? "..." : "Save"}</button>
                    <button onClick={() => setNameEditing(false)} style={{
                      padding: "6px 14px", background: "transparent", color: "#555", border: "1px solid #333",
                      borderRadius: 8, fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    }}>Cancel</button>
                  </div>
                ) : (
                  <h1 className="pp-name">
                    {displayName}{displayTag && <span className="pp-tag">#{displayTag}</span>}
                    {isOwnProfile && (
                      <button onClick={() => { setNameInput(profile?.displayName || ""); setNameEditing(true); }} style={{
                        background: "transparent", border: "none", color: "#555550", cursor: "pointer",
                        fontSize: "0.7rem", marginLeft: 8, padding: "2px 6px", verticalAlign: "middle",
                      }} title="Edit display name">✏️</button>
                    )}
                    {nameSaved && <span style={{ fontSize: "0.65rem", color: "#4ade80", marginLeft: 8, fontWeight: 600 }}>Saved!</span>}
                  </h1>
                )}
                <div className="pp-rank">{profile.riotRank || "Unranked"}</div>
                {isOwnProfile && (
                  <div style={{ fontSize: "0.62rem", color: "#555550", marginTop: 4, fontWeight: 700, letterSpacing: "0.06em" }}>
                    YOUR PROFILE
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ═══ STATS CARDS ═══ */}
          {vStats ? (
            <div className="pp-stats-row">
              <div className="pp-stat-card pp-stat-primary"><div className="pp-stat-value">{computedAcs}</div><div className="pp-stat-label">ACS</div></div>
              <div className="pp-stat-card"><div className="pp-stat-value">{totalGames}</div><div className="pp-stat-label">Games Played</div></div>
              <div className="pp-stat-card"><div className="pp-stat-value pp-stat-green">{gamesWon}</div><div className="pp-stat-label">Wins</div></div>
              <div className="pp-stat-card"><div className="pp-stat-value pp-stat-red">{gamesLost}</div><div className="pp-stat-label">Losses</div></div>
              <div className="pp-stat-card"><div className="pp-stat-value" style={{ color: winRate >= 50 ? "#4ade80" : "#f87171" }}>{winRate}%</div><div className="pp-stat-label">Win Rate</div></div>
            </div>
          ) : (
            <div className="pp-stats-row">
              <div className="pp-stat-card pp-stat-primary"><div className="pp-stat-value">{profile.riotRank || "Unranked"}</div><div className="pp-stat-label">Valorant Rank</div></div>
              <div className="pp-stat-card"><div className="pp-stat-value">0</div><div className="pp-stat-label">Official Games</div></div>
              <div className="pp-stat-card"><div className="pp-stat-value" style={{ color: "#555550" }}>—</div><div className="pp-stat-label">ACS</div></div>
              <div className="pp-stat-card"><div className="pp-stat-value" style={{ color: "#555550" }}>—</div><div className="pp-stat-label">K/D</div></div>
              <div className="pp-stat-card"><div className="pp-stat-value" style={{ color: "#555550" }}>—</div><div className="pp-stat-label">Win Rate</div></div>
            </div>
          )}

          {/* ═══ TAB BAR ═══ */}
          <div className="pp-tab-bar">
            <button className={`pp-tab ${activeTab === "valorant" ? "active" : ""}`} onClick={() => setActiveTab("valorant")}>Valorant</button>
            <button className={`pp-tab ${activeTab === "dota" ? "active" : ""}`} onClick={() => setActiveTab("dota")}>Dota 2</button>
            {isOwnProfile && (
              <button className={`pp-tab pp-tab-private ${activeTab === "account" ? "active" : ""}`} onClick={() => setActiveTab("account")}>
                🔒 My Account
              </button>
            )}
          </div>

          {/* ═══ VALORANT TAB ═══ */}
          {activeTab === "valorant" && (
            <>
              {vStats ? (
                <div className="pp-section">
                  <span className="pp-section-label">Performance Breakdown</span>
                  <div className="pp-detail-grid">
                    <div className="pp-detail-item"><span className="pp-detail-num" style={{ color: "#4ade80" }}>{vStats.totalKills}</span><span className="pp-detail-lbl">Total Kills</span></div>
                    <div className="pp-detail-item"><span className="pp-detail-num" style={{ color: "#f87171" }}>{vStats.totalDeaths}</span><span className="pp-detail-lbl">Total Deaths</span></div>
                    <div className="pp-detail-item"><span className="pp-detail-num">{vStats.totalAssists}</span><span className="pp-detail-lbl">Total Assists</span></div>
                    <div className="pp-detail-item"><span className="pp-detail-num" style={{ color: vStats.kd >= 1.0 ? "#4ade80" : "#f87171", fontWeight: 900 }}>{vStats.kd}</span><span className="pp-detail-lbl">K/D Ratio</span></div>
                    <div className="pp-detail-item"><span className="pp-detail-num">{vStats.hsPercent}%</span><span className="pp-detail-lbl">HS%</span></div>
                    <div className="pp-detail-item"><span className="pp-detail-num" style={{ color: "#a78bfa" }}>{vStats.acs || Math.round((vStats.totalScore || 0) / Math.max(1, vStats.totalRoundsPlayed || 1))}</span><span className="pp-detail-lbl">ACS</span></div>
                  </div>
                </div>
              ) : (
                <div className="pp-section">
                  <span className="pp-section-label">Performance Breakdown</span>
                  <div className="pp-empty">No official tournament match data yet. Stats will appear here once matches are played and results are fetched.</div>
                </div>
              )}
              {topAgents.length > 0 && (
                <div className="pp-section">
                  <span className="pp-section-label">Most Played Agents</span>
                  <div className="pp-agents-row">
                    {topAgents.map(([agent, count]) => (
                      <div key={agent} className="pp-agent-chip">
                        <span className="pp-agent-name">{agent}</span>
                        <span className="pp-agent-count">{count} game{count > 1 ? "s" : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="pp-section">
                <span className="pp-section-label">Match History ({matchHistory.length})</span>
                {matchHistory.length === 0 ? (
                  <div className="pp-empty">No match data yet. Stats appear after tournament matches are fetched.</div>
                ) : (
                  <div className="pp-matches">
                    {matchHistory.map((mh) => {
                      const isExpanded = expandedMatch === `${mh.tournamentId}-${mh.matchDocId}`;
                      return (
                        <div key={`${mh.tournamentId}-${mh.matchDocId}`} className="pp-match-card">
                          <div className="pp-match-header" onClick={() => setExpandedMatch(isExpanded ? null : `${mh.tournamentId}-${mh.matchDocId}`)}>
                            <div className="pp-match-meta">
                              <span className="pp-match-tournament">{mh.tournamentName}</span>
                              <span className="pp-match-round">R{mh.matchDay} M{mh.matchIndex}</span>
                            </div>
                            <div className="pp-match-teams">
                              <span className="pp-match-team">{mh.team1Name}</span>
                              <span className="pp-match-score">{mh.team1Score} - {mh.team2Score}</span>
                              <span className="pp-match-team">{mh.team2Name}</span>
                            </div>
                            <span className={`pp-match-expand ${isExpanded ? "open" : ""}`}>▼</span>
                          </div>
                          {isExpanded && (
                            <div className="pp-match-detail">
                              {mh.games.map(g => {
                                const won = g.winner === g.playerTeam;
                                return (
                                  <div key={g.gameNum} className={`pp-game-row ${won ? "won" : "lost"}`}>
                                    <div className="pp-game-map">
                                      <span className="pp-game-num">Game {g.gameNum}</span>
                                      <span className="pp-game-map-name">{g.mapName}</span>
                                      <span className="pp-game-rounds">{g.team1Rounds}-{g.team2Rounds}</span>
                                    </div>
                                    <div className="pp-game-stats">
                                      <span className="pp-game-agent">{g.agent}</span>
                                      <span className="pp-game-kda">{g.kills}/{g.deaths}/{g.assists}</span>
                                      <span className="pp-game-acs">ACS {g.acs}</span>
                                      <span className={`pp-game-result ${won ? "win" : "loss"}`}>{won ? "WIN" : "LOSS"}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ═══ DOTA TAB ═══ */}
          {activeTab === "dota" && (
            <div className="pp-section">
              <span className="pp-section-label">Dota 2 Stats</span>
              <div className="pp-empty">Dota 2 tournament stats coming soon. This will show match history, win/loss record, and performance from official IEsports Dota 2 tournaments.</div>
            </div>
          )}

          {/* ═══ ACCOUNT TAB (private — own profile only) ═══ */}
          {activeTab === "account" && isOwnProfile && (
            <>
              {/* Full Name */}
              <div className="pp-section">
                <span className="pp-section-label">Full Name</span>
                <p style={{ fontSize: "0.82rem", color: "#8A8880", marginBottom: 16, marginTop: 0 }}>
                  Your full name is used for tournament rosters, match results, and prize payouts.
                </p>
                {fullNameEditing ? (
                  <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
                    <input
                      value={fullNameInput}
                      onChange={e => setFullNameInput(e.target.value)}
                      placeholder="Enter your full name"
                      maxLength={50}
                      autoFocus
                      onKeyDown={e => { if (e.key === "Enter") saveFullName(); if (e.key === "Escape") setFullNameEditing(false); }}
                      style={{
                        flex: 1, background: "#18181C", border: "1px solid #2A2A30", borderRadius: 10,
                        padding: "10px 14px", fontSize: "0.88rem", color: "#F0EEEA", fontFamily: "inherit",
                        outline: "none",
                      }}
                    />
                    <button onClick={saveFullName} disabled={fullNameSaving || fullNameInput.trim().length < 2} style={{
                      padding: "10px 20px", borderRadius: 10, background: "rgba(96,165,250,0.12)", color: "#60a5fa",
                      border: "1px solid rgba(96,165,250,0.3)", fontSize: "0.84rem", fontWeight: 800,
                      cursor: fullNameSaving ? "default" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                      opacity: fullNameInput.trim().length < 2 ? 0.5 : 1,
                    }}>{fullNameSaving ? "Saving..." : "Save"}</button>
                    <button onClick={() => setFullNameEditing(false)} style={{
                      padding: "10px 14px", background: "transparent", color: "#555", border: "1px solid #333",
                      borderRadius: 10, fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    }}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "1rem", fontWeight: 700, color: profile?.fullName ? "#F0EEEA" : "#555550" }}>
                      {profile?.fullName || "Not set"}
                    </span>
                    <button onClick={() => { setFullNameInput(profile?.fullName || ""); setFullNameEditing(true); }} style={{
                      padding: "5px 14px", borderRadius: 100, background: "rgba(96,165,250,0.1)",
                      color: "#60a5fa", border: "1px solid rgba(96,165,250,0.3)", fontSize: "0.72rem",
                      fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                    }}>{profile?.fullName ? "Edit" : "Add"}</button>
                  </div>
                )}
                {fullNameSaved && <span style={{ fontSize: "0.72rem", color: "#4ade80", marginTop: 8, display: "block", fontWeight: 600 }}>Saved!</span>}
              </div>

              {/* Personal Photo */}
              <div className="pp-section">
                <span className="pp-section-label">Personal Photo</span>
                <p style={{ fontSize: "0.82rem", color: "#8A8880", marginBottom: 16, marginTop: 0 }}>
                  Upload a photo of yourself. This is only used for tournament winner showcases and will not be displayed publicly on your profile.
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  {profile?.personalPhoto ? (
                    <img src={profile.personalPhoto} alt="" style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover", border: "2px solid #2A2A30" }} />
                  ) : (
                    <div style={{ width: 64, height: 64, borderRadius: 12, background: "#18181C", border: "2px dashed #2A2A30", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: "0.72rem" }}>
                      No photo
                    </div>
                  )}
                  <div>
                    <label style={{
                      display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10,
                      background: "rgba(96,165,250,0.1)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.3)",
                      fontSize: "0.76rem", fontWeight: 700, cursor: photoUploading ? "default" : "pointer", fontFamily: "inherit",
                      opacity: photoUploading ? 0.6 : 1,
                    }}>
                      {photoUploading ? "Uploading..." : profile?.personalPhoto ? "Change Photo" : "Upload Photo"}
                      <input type="file" accept="image/*" style={{ display: "none" }} disabled={photoUploading}
                        onChange={e => { if (e.target.files?.[0]) uploadPersonalPhoto(e.target.files[0]); }} />
                    </label>
                    {photoSaved && <span style={{ fontSize: "0.72rem", color: "#4ade80", marginLeft: 10, fontWeight: 600 }}>Saved!</span>}
                    <div style={{ fontSize: "0.62rem", color: "#555", marginTop: 6 }}>Max 5MB. JPG or PNG.</div>
                  </div>
                </div>
              </div>

              {/* Connected Accounts */}
              <div className="pp-section">
                <span className="pp-section-label">Connected Accounts</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

                  {/* Steam */}
                  <div className="pp-acc-row">
                    <div className="pp-acc-left">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/8/83/Steam_icon_logo.svg" alt="Steam" style={{ width: 22, height: 22, opacity: profile.steamId ? 1 : 0.35 }} />
                      <div>
                        <div className="pp-acc-name">Steam</div>
                        {profile.steamName
                          ? <div className="pp-acc-detail">{profile.steamName}</div>
                          : <div className="pp-acc-detail" style={{ color: "#f87171" }}>Not connected</div>}
                      </div>
                    </div>
                    {profile.steamId ? (
                      <span className="pp-acc-badge pp-acc-linked">✓ Linked</span>
                    ) : (
                      <button className="pp-acc-link-btn" onClick={() => {
                        if (hasDiscordAccount(discordConnections, "steam", steamLinked)) { triggerDiscordPrompt(); }
                        else { window.open(`/api/auth/steam?uid=${user?.uid}`, "_blank"); }
                      }}>Connect</button>
                    )}
                  </div>

                  {/* Discord */}
                  <div className="pp-acc-row">
                    <div className="pp-acc-left">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill={profile.discordId ? "#818cf8" : "#555550"}>
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.08.114 18.1.132 18.114a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                      </svg>
                      <div>
                        <div className="pp-acc-name">Discord</div>
                        {profile.discordUsername
                          ? <div className="pp-acc-detail">{profile.discordUsername}</div>
                          : <div className="pp-acc-detail" style={{ color: "#f87171" }}>Not connected</div>}
                      </div>
                    </div>
                    {profile.discordId ? (
                      <span className="pp-acc-badge pp-acc-linked">✓ Linked</span>
                    ) : (
                      <button className="pp-acc-link-btn" onClick={() => window.open(`/api/auth/discord?uid=${user?.uid}`, "_blank")}>Connect</button>
                    )}
                  </div>

                  {/* Riot */}
                  <div className="pp-acc-row">
                    <div className="pp-acc-left">
                      <img src="/riot-games.png" alt="Riot" style={{ width: 22, height: 22, borderRadius: 4, opacity: profile.riotGameName ? 1 : 0.35 }} />
                      <div>
                        <div className="pp-acc-name">Riot ID</div>
                        {profile.riotGameName
                          ? <div className="pp-acc-detail">{profile.riotGameName}#{profile.riotTagLine}</div>
                          : <div className="pp-acc-detail" style={{ color: "#f87171" }}>Not connected</div>}
                      </div>
                    </div>
                    {profile.riotVerified === "verified" ? (
                      <span className="pp-acc-badge pp-acc-linked">✓ Verified</span>
                    ) : profile.riotVerified === "pending" ? (
                      <span className="pp-acc-badge pp-acc-pending">⏳ Pending</span>
                    ) : (
                      <button className="pp-acc-link-btn" onClick={() => {
                        if (hasDiscordAccount(discordConnections, "riot", !!authRiotData?.riotLinked)) { triggerDiscordPrompt(); }
                        else { window.open("/connect-riot", "_blank"); }
                      }}>Connect</button>
                    )}
                  </div>

                  {/* Phone */}
                  <div className="pp-acc-row">
                    <div className="pp-acc-left">
                      <span style={{ fontSize: 20, opacity: profile.phone ? 1 : 0.35 }}>📱</span>
                      <div>
                        <div className="pp-acc-name">Phone</div>
                        {profile.phone
                          ? <div className="pp-acc-detail">{profile.phone.replace(/(\+\d{1,3})(\d{3})(\d+)(\d{3})$/, (_: string, code: string, a: string, _m: string, last: string) => `${code} ${a}*****${last}`)}</div>
                          : <div className="pp-acc-detail" style={{ color: "#f87171" }}>Not added</div>}
                      </div>
                    </div>
                    {profile.phone
                      ? <span className="pp-acc-badge pp-acc-linked">✓ Added</span>
                      : <button className="pp-acc-link-btn" onClick={() => triggerPhoneModal()}>Connect</button>}
                  </div>

                </div>
              </div>

              {/* Discord Linked Accounts */}
              {profile.discordConnections && profile.discordConnections.length > 0 && (
                <div className="pp-section">
                  <span className="pp-section-label">Discord Linked Accounts</span>
                  <p style={{ fontSize: "0.82rem", color: "#8A8880", marginBottom: 16, marginTop: 0 }}>
                    Accounts connected to your Discord profile.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {profile.discordConnections.map((conn, i) => {
                      const typeLabel: Record<string, string> = { steam: "Steam", riotgames: "Riot Games", twitch: "Twitch", youtube: "YouTube", twitter: "Twitter", github: "GitHub", spotify: "Spotify", xbox: "Xbox", playstation: "PlayStation", epicgames: "Epic Games", battlenet: "Battle.net" };
                      const typeColor: Record<string, string> = { steam: "#1b2838", riotgames: "#ff4655", twitch: "#9146ff", youtube: "#ff0000", twitter: "#1da1f2", github: "#fff", spotify: "#1db954", xbox: "#107c10", playstation: "#003087", epicgames: "#fff", battlenet: "#00AEFF" };
                      return (
                        <div key={`${conn.type}-${i}`} className="pp-acc-row">
                          <div className="pp-acc-left">
                            <span style={{ fontSize: 18, width: 22, textAlign: "center", display: "inline-block", color: typeColor[conn.type] || "#8A8880" }}>
                              {conn.type === "steam" ? "\u{1F3AE}" : conn.type === "riotgames" ? "\u{1F3AF}" : conn.type === "twitch" ? "\u{1F4FA}" : conn.type === "youtube" ? "\u{25B6}\uFE0F" : conn.type === "twitter" ? "\u{1F426}" : conn.type === "github" ? "\u{1F4BB}" : conn.type === "spotify" ? "\u{1F3B5}" : "\u{1F517}"}
                            </span>
                            <div>
                              <div className="pp-acc-name">{typeLabel[conn.type] || conn.type}</div>
                              <div className="pp-acc-detail">{conn.name}</div>
                            </div>
                          </div>
                          {conn.verified && <span className="pp-acc-badge pp-acc-linked">{"\u2713"} Verified</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* UPI Payment */}
              <div className="pp-section">
                <span className="pp-section-label">Payout Details</span>
                <p style={{ fontSize: "0.82rem", color: "#8A8880", marginBottom: 16, marginTop: 0 }}>
                  Add your UPI ID so we can send prize payouts instantly after tournament results are confirmed.
                </p>
                <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
                  <input
                    className="pp-upi-input"
                    type="text"
                    placeholder="yourname@upi"
                    value={upiInput}
                    onChange={e => setUpiInput(e.target.value)}
                  />
                  <button
                    className="pp-upi-btn"
                    onClick={saveUpi}
                    disabled={upiSaving || !upiInput.trim()}
                  >
                    {upiSaving ? "Saving…" : upiSaved ? "✓ Saved" : "Save"}
                  </button>
                </div>
                {profile.upiId && (
                  <div style={{ marginTop: 10, fontSize: "0.75rem", color: "#555550" }}>
                    Current: <span style={{ color: "#4ade80", fontWeight: 700 }}>{profile.upiId}</span>
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </>
  );
}

const baseStyles = `
  .pp-page { min-height: 100vh; background: #0A0A0C; font-family: var(--font-geist-sans), system-ui, sans-serif; }
  .pp-content { max-width: 860px; margin: 0 auto; padding: 20px 24px 60px; }
  .pp-loading { text-align: center; padding: 80px 20px; color: #555550; font-size: 0.9rem; }

  .pp-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
  .pp-header-left { display: flex; align-items: center; gap: 16px; }
  .pp-avatar { width: 72px; height: 72px; border-radius: 14px; object-fit: cover; border: 2px solid #2A2A30; }
  .pp-avatar-init { width: 72px; height: 72px; border-radius: 14px; background: linear-gradient(135deg, #3CCBFF 0%, #2A9FCC 100%); display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 900; color: #fff; }
  .pp-name { font-size: 1.5rem; font-weight: 900; color: #F0EEEA; margin: 0; }
  .pp-tag { color: #555550; font-weight: 400; font-size: 1.1rem; }
  .pp-rank { font-size: 0.82rem; color: #3CCBFF; font-weight: 700; margin-top: 2px; }

  .pp-stats-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 24px; }
  .pp-stat-card { background: #121215; border: 1px solid #2A2A30; border-radius: 14px; padding: 20px 16px; text-align: center; }
  .pp-stat-primary { border-color: #3CCBFF; background: rgba(60,203,255,0.06); }
  .pp-stat-value { font-size: 1.6rem; font-weight: 900; color: #F0EEEA; }
  .pp-stat-green { color: #4ade80; }
  .pp-stat-red { color: #f87171; }
  .pp-stat-label { font-size: 0.62rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #555550; margin-top: 4px; }

  .pp-tab-bar { display: flex; gap: 0; border-bottom: 2px solid #2A2A30; margin-bottom: 24px; }
  .pp-tab { padding: 10px 24px; font-size: 0.86rem; font-weight: 700; color: #555550; cursor: pointer; border-bottom: 2.5px solid transparent; margin-bottom: -2px; transition: all 0.15s; background: none; border-top: none; border-left: none; border-right: none; font-family: inherit; }
  .pp-tab.active { color: #3CCBFF; border-bottom-color: #3CCBFF; }
  .pp-tab-private { margin-left: auto; }
  .pp-tab-private.active { color: #60a5fa; border-bottom-color: #60a5fa; }

  .pp-section { background: #121215; border: 1px solid #2A2A30; border-radius: 14px; padding: 20px 24px; margin-bottom: 16px; }
  .pp-section-label { display: block; font-size: 0.62rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #555550; margin-bottom: 16px; }

  .pp-detail-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .pp-detail-item { text-align: center; padding: 12px; background: #18181C; border-radius: 10px; }
  .pp-detail-num { display: block; font-size: 1.4rem; font-weight: 800; color: #F0EEEA; }
  .pp-detail-lbl { display: block; font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #555550; margin-top: 4px; }

  .pp-agents-row { display: flex; gap: 10px; flex-wrap: wrap; }
  .pp-agent-chip { display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: #18181C; border: 1px solid #2A2A30; border-radius: 100px; }
  .pp-agent-name { font-size: 0.82rem; font-weight: 700; color: #e0e0da; }
  .pp-agent-count { font-size: 0.68rem; color: #555550; }

  .pp-empty { text-align: center; padding: 40px 20px; color: #555550; font-size: 0.85rem; }

  .pp-matches { display: flex; flex-direction: column; gap: 8px; }
  .pp-match-card { border: 1px solid #2A2A30; border-radius: 10px; overflow: hidden; }
  .pp-match-header { display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer; transition: background 0.1s; }
  .pp-match-header:hover { background: #18181C; }
  .pp-match-meta { display: flex; flex-direction: column; min-width: 120px; }
  .pp-match-tournament { font-size: 0.62rem; font-weight: 700; color: #555550; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
  .pp-match-round { font-size: 0.72rem; font-weight: 800; color: #3CCBFF; }
  .pp-match-teams { flex: 1; display: flex; align-items: center; justify-content: center; gap: 10px; }
  .pp-match-team { font-size: 0.82rem; font-weight: 700; color: #e0e0da; max-width: 140px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pp-match-score { font-size: 0.92rem; font-weight: 900; color: #F0EEEA; min-width: 50px; text-align: center; }
  .pp-match-expand { font-size: 10px; color: #3a3a42; transition: transform 0.2s; }
  .pp-match-expand.open { transform: rotate(180deg); color: #3CCBFF; }

  .pp-match-detail { padding: 0 16px 12px; }
  .pp-game-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-radius: 8px; margin-bottom: 4px; }
  .pp-game-row.won { background: rgba(22,163,74,0.1); }
  .pp-game-row.lost { background: rgba(239,68,68,0.08); }
  .pp-game-map { display: flex; align-items: center; gap: 10px; }
  .pp-game-num { font-size: 0.62rem; font-weight: 800; color: #555550; text-transform: uppercase; }
  .pp-game-map-name { font-size: 0.82rem; font-weight: 700; color: #e0e0da; }
  .pp-game-rounds { font-size: 0.78rem; font-weight: 800; color: #8A8880; }
  .pp-game-stats { display: flex; align-items: center; gap: 12px; }
  .pp-game-agent { font-size: 0.72rem; color: #8A8880; }
  .pp-game-kda { font-size: 0.82rem; font-weight: 800; color: #e0e0da; }
  .pp-game-acs { font-size: 0.72rem; font-weight: 700; color: #8A8880; }
  .pp-game-result { font-size: 0.58rem; font-weight: 800; padding: 2px 10px; border-radius: 100px; }
  .pp-game-result.win { background: rgba(22,163,74,0.15); color: #4ade80; }
  .pp-game-result.loss { background: rgba(239,68,68,0.12); color: #f87171; }

  .pp-acc-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: #18181C; border-radius: 10px; }
  .pp-acc-left { display: flex; align-items: center; gap: 12px; }
  .pp-acc-name { font-size: 0.84rem; font-weight: 700; color: #e0e0da; }
  .pp-acc-detail { font-size: 0.72rem; color: #555550; margin-top: 1px; }
  .pp-acc-badge { font-size: 0.62rem; font-weight: 800; padding: 3px 10px; border-radius: 100px; }
  .pp-acc-linked { background: rgba(22,163,74,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); }
  .pp-acc-pending { background: rgba(251,191,36,0.1); color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); }
  .pp-acc-missing { background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
  .pp-acc-link-btn { font-size: 0.72rem; font-weight: 800; padding: 5px 14px; border-radius: 100px; background: rgba(96,165,250,0.1); color: #60a5fa; border: 1px solid rgba(96,165,250,0.3); cursor: pointer; font-family: inherit; transition: background 0.15s; }
  .pp-acc-link-btn:hover { background: rgba(96,165,250,0.18); }

  .pp-upi-input { flex: 1; background: #18181C; border: 1px solid #2A2A30; border-radius: 10px; padding: 10px 14px; font-size: 0.88rem; color: #F0EEEA; font-family: inherit; outline: none; transition: border-color 0.15s; }
  .pp-upi-input:focus { border-color: #60a5fa; }
  .pp-upi-input::placeholder { color: #3a3a42; }
  .pp-upi-btn { padding: 10px 20px; border-radius: 10px; background: rgba(96,165,250,0.12); color: #60a5fa; border: 1px solid rgba(96,165,250,0.3); font-size: 0.84rem; font-weight: 800; cursor: pointer; font-family: inherit; transition: background 0.15s; white-space: nowrap; }
  .pp-upi-btn:hover:not(:disabled) { background: rgba(96,165,250,0.2); }
  .pp-upi-btn:disabled { opacity: 0.5; cursor: default; }

  @media (max-width: 700px) {
    .pp-stats-row { grid-template-columns: repeat(3, 1fr); }
    .pp-detail-grid { grid-template-columns: repeat(2, 1fr); }
    .pp-match-meta { min-width: 80px; }
    .pp-match-team { max-width: 80px; font-size: 0.72rem; }
    .pp-game-row { flex-direction: column; align-items: flex-start; gap: 6px; }
    .pp-name { font-size: 1.2rem; }
    .pp-avatar { width: 56px; height: 56px; }
    .pp-avatar-init { width: 56px; height: 56px; font-size: 22px; }
  }
`;
