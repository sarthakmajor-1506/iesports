"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Navbar, { triggerPhoneModal } from "@/app/components/Navbar";
import { PlayerAvatarBadge } from "@/app/components/PlayerAvatarBadge";
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
  riotPeakRank?: string; riotPeakTier?: number;
  iesportsRating?: number; iesportsRank?: string; iesportsTier?: number; iesportsMatchesPlayed?: number;
  discordUsername?: string; discordId?: string;
  discordConnections?: DiscordConnection[];
  steamName?: string; steamId?: string; steamAvatar?: string;
  dotaRankTier?: number; dotaBracket?: string; dotaMMR?: number;
  phone?: string; upiId?: string; displayName?: string; personalPhoto?: string;
}

interface RankHistoryItem {
  timestamp: string;
  type: "seed" | "match" | "riot_refresh" | "admin_override" | "riot_id_change";
  ratingBefore: number;
  ratingAfter: number;
  delta: number;
  matchId?: string;
  tournamentId?: string;
  tournamentName?: string;
  teamName?: string;
  opponentTeamName?: string;
  result?: "win" | "draw" | "loss";
  mapScore?: string;
  roundScore?: string;
  gameNum?: number;
  opponentAvgRating?: number;
  riotRankBefore?: string;
  riotRankAfter?: string;
  adminNote?: string;
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
  const searchParams = useSearchParams();
  const uid = params.uid as string;
  const { user, steamLinked, riotData: authRiotData, discordConnections } = useAuth();
  const isOwnProfile = !!user && user.uid === uid;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [matchHistory, setMatchHistory] = useState<MatchHistoryItem[]>([]);
  const [rankHistory, setRankHistory] = useState<RankHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Default tab: from URL ?tab=, else own profile → account, else valorant
  const urlTab = searchParams.get("tab") as ProfileTab | null;
  const [activeTab, setActiveTab] = useState<ProfileTab>(urlTab || "valorant");
  const [tabInitialized, setTabInitialized] = useState(!!urlTab);
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);

  // UPI state
  const [upiInput, setUpiInput] = useState("");
  const [upiSaving, setUpiSaving] = useState(false);
  const [upiSaved, setUpiSaved] = useState(false);

  // Display name state
  const [nameInput, setNameInput] = useState("");

  // Dota rank manual sync state (button on Dota tab for own profile)
  const [dotaSyncState, setDotaSyncState] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [dotaSyncMsg, setDotaSyncMsg] = useState("");
  const refreshDotaRank = async () => {
    if (!isOwnProfile || !profile?.steamId || dotaSyncState === "syncing") return;
    setDotaSyncState("syncing");
    setDotaSyncMsg("");
    try {
      const { getFirebaseAuth } = await import("@/lib/firebase");
      const { auth } = await getFirebaseAuth();
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) { setDotaSyncState("error"); setDotaSyncMsg("Not signed in"); return; }
      const res = await fetch("/api/dota/sync", { method: "POST", headers: { Authorization: `Bearer ${idToken}` } });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setDotaSyncState("success");
        setDotaSyncMsg("Rank updated");
        // Reload the profile doc so the UI picks up the new values
        try {
          const snap = await getDoc(doc(db, "users", uid as string));
          if (snap.exists()) setProfile({ ...(profile as UserProfile), ...(snap.data() as UserProfile), uid: uid as string });
        } catch {}
      } else {
        setDotaSyncState("error");
        setDotaSyncMsg(body?.error || `Sync failed (${res.status})`);
      }
    } catch (e: any) {
      setDotaSyncState("error");
      setDotaSyncMsg(e?.message || "Network error");
    }
  };
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

  // Set default tab to "account" for own profile once auth loads
  useEffect(() => {
    if (!tabInitialized && user && user.uid === uid) {
      setActiveTab("account");
      setTabInitialized(true);
    }
  }, [user, uid, tabInitialized]);

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
          riotPeakRank: d.riotPeakRank, riotPeakTier: d.riotPeakTier,
          iesportsRating: d.iesportsRating, iesportsRank: d.iesportsRank,
          iesportsTier: d.iesportsTier, iesportsMatchesPlayed: d.iesportsMatchesPlayed,
          discordUsername: d.discordUsername, discordId: d.discordId, discordConnections: d.discordConnections,
          steamName: d.steamName, steamId: d.steamId, steamAvatar: d.steamAvatar,
          dotaRankTier: d.dotaRankTier, dotaBracket: d.dotaBracket, dotaMMR: d.dotaMMR,
          phone: d.phone, upiId: undefined, // loaded separately for owner only
          displayName: d.displayName,
          personalPhoto: d.personalPhoto,
        });

        // Load private owner-only fields via client SDK
        if (isOwnProfile) {
          const ownerDoc = await getDoc(doc(db, "users", uid));
          if (ownerDoc.exists()) {
            const od = ownerDoc.data();
            setProfile(prev => prev ? { ...prev, phone: od.phone || null, upiId: od.upiId || null, fullName: od.fullName || prev.fullName || null, personalPhoto: od.personalPhoto || prev.personalPhoto || null } : prev);
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
          // Fetch all tournaments in parallel instead of sequential loop
          const tournamentIds = d.registeredValorantTournaments.slice(0, 10);
          const tournamentResults = await Promise.all(tournamentIds.map(async (tId: string) => {
            try {
              const [tDoc, matchesSnap] = await Promise.all([
                getDoc(doc(db, "valorantTournaments", tId)),
                getDocs(query(collection(db, "valorantTournaments", tId, "matches"), orderBy("matchDay"))),
              ]);
              return { tId, tName: tDoc.exists() ? tDoc.data().name : tId, matches: matchesSnap };
            } catch { return null; }
          }));
          for (const result of tournamentResults) {
            if (!result) continue;
            const { tId, tName, matches: matchesSnap } = result;
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
          }
          history.sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
          setMatchHistory(history);
        }

        // Rank history comes from API (admin SDK — bypasses security rules)
        if (d.rankHistory?.length > 0) {
          setRankHistory(d.rankHistory as RankHistoryItem[]);
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

  const displayName = profile?.riotGameName || profile?.discordUsername || profile?.steamName || "Unknown";
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
          <button onClick={() => { try { sessionStorage.setItem("redirectAfterLogin", window.location.pathname); } catch {} window.location.href = "/api/auth/discord-login"; }}
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

          {/* ═══ TAB BAR (master tabs) ═══ */}
          <div className="pp-tab-bar" style={{ marginBottom: 20 }}>
            <button className={`pp-tab ${activeTab === "valorant" ? "active" : ""}`} onClick={() => setActiveTab("valorant")}>Valorant</button>
            <button className={`pp-tab ${activeTab === "dota" ? "active" : ""}`} onClick={() => setActiveTab("dota")}>Dota 2</button>
            {isOwnProfile && (
              <button className={`pp-tab pp-tab-private ${activeTab === "account" ? "active" : ""}`} onClick={() => setActiveTab("account")}>
                My Account
              </button>
            )}
          </div>

          {/* ═══ HERO HEADER ═══ */}
          <div className="pp-hero">
            <div className="pp-hero-bg" />
            <div className="pp-hero-content">
              <PlayerAvatarBadge
                mvpBracket={(profile as any).mvpBracket}
                isChampion={(profile as any).isChampion}
                size={110}
              >
                {activeTab === "valorant" ? (
                  profile.riotAvatar ? (
                    <img src={profile.riotAvatar} alt={displayName} className="pp-avatar" />
                  ) : profile.discordId ? (
                    <div className="pp-avatar-init" style={{ background: "linear-gradient(135deg, #818cf8 0%, #6366f1 100%)" }}>{(profile.discordUsername || displayName)[0]?.toUpperCase()}</div>
                  ) : (
                    <div className="pp-avatar-init">{displayName[0]?.toUpperCase()}</div>
                  )
                ) : activeTab === "dota" ? (
                  profile.steamAvatar ? (
                    <img src={profile.steamAvatar} alt={profile.steamName || displayName} className="pp-avatar" />
                  ) : (
                    <div className="pp-avatar-init" style={{ background: "linear-gradient(135deg, #1b2838 0%, #2a475e 100%)" }}>{(profile.steamName || displayName)[0]?.toUpperCase()}</div>
                  )
                ) : (
                  profile.personalPhoto ? (
                    <img src={profile.personalPhoto} alt={displayName} className="pp-avatar" />
                  ) : (
                    <div className="pp-avatar-init">{displayName[0]?.toUpperCase()}</div>
                  )
                )}
              </PlayerAvatarBadge>

              <div className="pp-hero-info">
                <h1 className="pp-name">
                  {activeTab === "valorant" ? (profile.riotGameName || profile.discordUsername || displayName) : activeTab === "dota" ? (profile.steamName || profile.discordUsername || displayName) : (profile.fullName || displayName)}
                  {displayTag && <span className="pp-tag">#{displayTag}</span>}
                </h1>

                {activeTab === "valorant" && (
                  <div className="pp-rank-badges">
                    {profile.iesportsRank && (
                      <span className="pp-rank-pill pp-rank-pill-primary">
                        <span className="pp-rank-pill-icon">⚡</span>
                        {profile.iesportsRank}
                        <span className="pp-rank-pill-sub">iE</span>
                      </span>
                    )}
                    {profile.riotRank && (
                      <span className="pp-rank-pill">
                        {profile.riotRank}
                        <span className="pp-rank-pill-sub">RIOT</span>
                      </span>
                    )}
                    {profile.riotPeakRank && profile.riotPeakRank !== profile.riotRank && (
                      <span className="pp-rank-pill pp-rank-pill-peak">
                        {profile.riotPeakRank}
                        <span className="pp-rank-pill-sub">PEAK</span>
                      </span>
                    )}
                  </div>
                )}
                {activeTab === "dota" && (
                  <div className="pp-rank-badges">
                    {profile.dotaRankTier ? (() => {
                      const dotaRanks = ["", "Herald", "Guardian", "Crusader", "Archon", "Legend", "Ancient", "Divine", "Immortal"];
                      const medal = Math.floor((profile.dotaRankTier || 0) / 10);
                      const stars = (profile.dotaRankTier || 0) % 10;
                      const exactRank = medal >= 1 && medal <= 8 ? `${dotaRanks[medal]}${stars > 0 ? ` ${stars}` : ""}` : "Unranked";
                      return <span className="pp-rank-pill pp-rank-pill-steam">{exactRank}</span>;
                    })() : <span className="pp-rank-pill" style={{ opacity: 0.5 }}>Unranked</span>}
                    {profile.dotaMMR && <span className="pp-rank-pill pp-rank-pill-steam">{profile.dotaMMR} MMR</span>}
                  </div>
                )}
                {activeTab === "account" && (
                  <div style={{ fontSize: "0.72rem", color: "#555550", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Your Profile</div>
                )}
              </div>
            </div>

            {/* Connection notices */}
            {activeTab === "valorant" && !profile.riotGameName && profile.discordId && (
              <div style={{ margin: "0 20px 16px", padding: "10px 16px", background: "rgba(129,140,248,0.06)", border: "1px solid rgba(129,140,248,0.15)", borderRadius: 10 }}>
                <div style={{ fontSize: "0.72rem", color: "#818cf8", fontWeight: 700 }}>Riot ID not connected</div>
                <div style={{ fontSize: "0.62rem", color: "#8A8880", marginTop: 2 }}>Connect your Riot ID to see your Valorant rank and register for tournaments.</div>
                {isOwnProfile && (
                  <button onClick={() => { try { localStorage.removeItem("pendingRegistration"); sessionStorage.setItem("redirectAfterLogin", window.location.pathname); } catch {} window.location.href = "/connect-riot"; }} style={{ marginTop: 6, padding: "4px 12px", borderRadius: 100, background: "rgba(129,140,248,0.12)", color: "#818cf8", border: "1px solid rgba(129,140,248,0.3)", fontSize: "0.66rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Connect Riot ID</button>
                )}
              </div>
            )}
            {activeTab === "dota" && !profile.steamId && profile.discordId && (
              <div style={{ margin: "0 20px 16px", padding: "10px 16px", background: "rgba(102,192,244,0.06)", border: "1px solid rgba(102,192,244,0.15)", borderRadius: 10 }}>
                <div style={{ fontSize: "0.72rem", color: "#66c0f4", fontWeight: 700 }}>Steam not connected</div>
                <div style={{ fontSize: "0.62rem", color: "#8A8880", marginTop: 2 }}>Connect your Steam account to see your Dota 2 rank and register for tournaments.</div>
                {isOwnProfile && (
                  <button onClick={() => { try { localStorage.removeItem("pendingRegistration"); sessionStorage.setItem("redirectAfterLogin", window.location.pathname); } catch {} navigateWithAppPriority(`/api/auth/steam?uid=${user?.uid}`); }} style={{ marginTop: 6, padding: "4px 12px", borderRadius: 100, background: "rgba(102,192,244,0.12)", color: "#66c0f4", border: "1px solid rgba(102,192,244,0.3)", fontSize: "0.66rem", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Connect Steam</button>
                )}
              </div>
            )}
          </div>

          {/* ═══ STATS CARDS — tab-aware ═══ */}
          {activeTab === "valorant" && (() => {
            const kd = vStats ? (vStats.totalDeaths > 0 ? Math.round(((vStats.totalKills || 0) / vStats.totalDeaths) * 100) / 100 : (vStats.totalKills || 0)) : 0;
            const hsP = vStats?.hsPercent || 0;
            return vStats ? (
              <div className="pp-stats-row">
                <div className="pp-stat-card pp-stat-hero">
                  <div className="pp-stat-value" style={{ fontSize: "2.2rem", color: "#3CCBFF" }}>{profile.iesportsRank || profile.riotRank || "Unranked"}</div>
                  <div className="pp-stat-label">Rank</div>
                  {profile.iesportsRating && <div style={{ fontSize: "0.65rem", color: "#555550", marginTop: 2 }}>{profile.iesportsRating} SR</div>}
                </div>
                <div className="pp-stat-card">
                  <div className="pp-stat-value">{totalGames}</div>
                  <div className="pp-stat-label">Maps</div>
                </div>
                <div className="pp-stat-card">
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 4 }}>
                    <span className="pp-stat-value pp-stat-green">{gamesWon}</span>
                    <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "#555550" }}>/</span>
                    <span className="pp-stat-value pp-stat-red">{gamesLost}</span>
                  </div>
                  <div className="pp-stat-label">W / L</div>
                </div>
                <div className="pp-stat-card">
                  <div className="pp-stat-value" style={{ color: winRate >= 50 ? "#4ade80" : "#f87171" }}>{winRate}%</div>
                  <div className="pp-stat-label">Win Rate</div>
                  <div className="pp-winbar"><div className="pp-winbar-fill" style={{ width: `${Math.min(100, winRate)}%`, background: winRate >= 50 ? "linear-gradient(90deg, #22c55e, #4ade80)" : "linear-gradient(90deg, #dc2626, #f87171)" }} /></div>
                </div>
                <div className="pp-stat-card">
                  <div className="pp-stat-value" style={{ color: kd >= 1 ? "#4ade80" : "#f87171" }}>{kd.toFixed(2)}</div>
                  <div className="pp-stat-label">K/D</div>
                </div>
                <div className="pp-stat-card">
                  <div className="pp-stat-value" style={{ color: "#a78bfa" }}>{computedAcs}</div>
                  <div className="pp-stat-label">ACS</div>
                </div>
              </div>
            ) : (
              <div className="pp-stats-row">
                <div className="pp-stat-card pp-stat-hero">
                  <div className="pp-stat-value" style={{ fontSize: "2.2rem", color: "#3CCBFF" }}>{profile.iesportsRank || profile.riotRank || "Unranked"}</div>
                  <div className="pp-stat-label">Rank</div>
                </div>
                <div className="pp-stat-card"><div className="pp-stat-value">0</div><div className="pp-stat-label">Maps</div></div>
                <div className="pp-stat-card"><div className="pp-stat-value" style={{ color: "#555550" }}>—</div><div className="pp-stat-label">W / L</div></div>
                <div className="pp-stat-card"><div className="pp-stat-value" style={{ color: "#555550" }}>—</div><div className="pp-stat-label">Win Rate</div></div>
                <div className="pp-stat-card"><div className="pp-stat-value" style={{ color: "#555550" }}>—</div><div className="pp-stat-label">K/D</div></div>
                <div className="pp-stat-card"><div className="pp-stat-value" style={{ color: "#555550" }}>—</div><div className="pp-stat-label">ACS</div></div>
              </div>
            );
          })()}
          {activeTab === "dota" && (() => {
            const dotaRanks = ["", "Herald", "Guardian", "Crusader", "Archon", "Legend", "Ancient", "Divine", "Immortal"];
            const tier = profile.dotaRankTier || 0;
            const medal = Math.floor(tier / 10);
            const stars = tier % 10;
            const exactRank = tier > 0 && medal >= 1 && medal <= 8 ? `${dotaRanks[medal]}${stars > 0 ? ` ${stars}` : ""}` : "Unranked";
            const bracketLabel = profile.dotaBracket ? ({ herald_guardian: "Herald – Guardian", crusader_archon: "Crusader – Archon", legend_ancient: "Legend – Ancient", divine_immortal: "Divine – Immortal" } as Record<string,string>)[profile.dotaBracket] || profile.dotaBracket : "—";
            return (
            <>
              <div className="pp-stats-row">
                <div className="pp-stat-card pp-stat-hero" style={{ borderColor: "rgba(102,192,244,0.2)", background: "linear-gradient(135deg, rgba(102,192,244,0.06) 0%, #121218 100%)" }}><div className="pp-stat-value" style={{ fontSize: "2.2rem", color: "#66c0f4" }}>{exactRank}</div><div className="pp-stat-label">Dota 2 Rank</div></div>
                <div className="pp-stat-card"><div className="pp-stat-value" style={{ color: "#66c0f4" }}>{profile.dotaMMR || "—"}</div><div className="pp-stat-label">MMR</div></div>
                <div className="pp-stat-card"><div className="pp-stat-value" style={{ fontSize: "0.95rem" }}>{bracketLabel}</div><div className="pp-stat-label">Bracket</div></div>
                <div className="pp-stat-card"><div className="pp-stat-value" style={{ color: "#555550" }}>—</div><div className="pp-stat-label">Tournaments</div></div>
                <div className="pp-stat-card"><div className="pp-stat-value" style={{ color: "#555550" }}>—</div><div className="pp-stat-label">Win Rate</div></div>
              </div>
              {isOwnProfile && profile.steamId && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 18px", padding: "10px 14px", background: "rgba(102,192,244,0.06)", border: "1px solid rgba(102,192,244,0.18)", borderRadius: 10 }}>
                  <div style={{ fontSize: 12, color: "#8A8880", flex: 1, lineHeight: 1.5 }}>
                    {tier > 0
                      ? "Rank fetched from OpenDota. Click refresh to re-sync your latest matches and MMR."
                      : "Rank data is fetched from OpenDota and can take 30-120 seconds on the first load."}
                  </div>
                  <button
                    onClick={refreshDotaRank}
                    disabled={dotaSyncState === "syncing"}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 100,
                      background: dotaSyncState === "syncing" ? "rgba(102,192,244,0.1)" : "rgba(102,192,244,0.18)",
                      color: "#66c0f4",
                      border: "1px solid rgba(102,192,244,0.35)",
                      fontSize: "0.72rem",
                      fontWeight: 800,
                      cursor: dotaSyncState === "syncing" ? "default" : "pointer",
                      fontFamily: "inherit",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {dotaSyncState === "syncing" ? "Syncing..." : dotaSyncState === "success" ? "✓ Synced" : "Refresh Rank"}
                  </button>
                </div>
              )}
              {isOwnProfile && dotaSyncMsg && dotaSyncState === "error" && (
                <div style={{ margin: "0 0 18px", padding: "8px 14px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, fontSize: 12, color: "#f87171" }}>
                  {dotaSyncMsg}
                </div>
              )}
            </>
            );
          })()}

          {/* ═══ VALORANT TAB CONTENT ═══ */}
          {activeTab === "valorant" && (<>
          {/* ═══ IESPORTS RANK CARD ═══ */}
          {profile.iesportsRank && (() => {
            const rating = profile.iesportsRating || 0;
            const ratingPct = Math.min(100, Math.max(0, ((rating - 300) / 2400) * 100));
            return (
            <div className="pp-rank-card">
              <div className="pp-rank-card-glow" />
              <div style={{ position: "relative", zIndex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <span className="pp-section-label" style={{ marginBottom: 0, color: "#3CCBFF" }}>iEsports Rating</span>
                  <span style={{ fontSize: "0.62rem", fontWeight: 700, color: "#555550" }}>{profile.iesportsMatchesPlayed || 0} games played</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: "2.8rem", fontWeight: 900, color: "#3CCBFF", lineHeight: 1, textShadow: "0 0 30px rgba(60,203,255,0.3)" }}>{profile.iesportsRank}</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#F0EEEA", marginTop: 4 }}>{rating} <span style={{ fontSize: "0.7rem", color: "#555550", fontWeight: 700 }}>SR</span></div>
                  </div>
                  <div style={{ flex: 1, display: "flex", gap: 12 }}>
                    <div className="pp-rank-mini-card">
                      <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#F0EEEA" }}>{profile.riotRank || "Unranked"}</div>
                      <div style={{ fontSize: "0.52rem", fontWeight: 700, color: "#555550", textTransform: "uppercase", letterSpacing: "0.08em" }}>Current</div>
                    </div>
                    <div className="pp-rank-mini-card">
                      <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#F0EEEA" }}>{profile.riotPeakRank || "—"}</div>
                      <div style={{ fontSize: "0.52rem", fontWeight: 700, color: "#555550", textTransform: "uppercase", letterSpacing: "0.08em" }}>Peak</div>
                    </div>
                  </div>
                </div>
                <div className="pp-rating-bar">
                  <div className="pp-rating-bar-fill" style={{ width: `${ratingPct}%` }} />
                  <div className="pp-rating-bar-marks">
                    <span>300</span><span>900</span><span>1500</span><span>2100</span><span>2700</span>
                  </div>
                </div>
              </div>
            </div>
            );
          })()}

          {/* ═══ NON-MATCH RANK EVENTS (seed, admin, refresh) ═══ */}
          {rankHistory.filter(rh => rh.type !== "match").length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {rankHistory.filter(rh => rh.type !== "match").map((rh, i) => {
                const isPositive = rh.delta > 0;
                const deltaColor = isPositive ? "#4ade80" : rh.delta === 0 ? "#8A8880" : "#f87171";
                const deltaSign = isPositive ? "+" : "";
                const date = new Date(rh.timestamp);
                const dateStr = date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
                return (
                  <div key={`event-${i}`} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", borderRadius: 10,
                    background: (rh.type === "admin_override" || rh.type === "riot_id_change") ? "rgba(167,139,250,0.06)" : "rgba(60,203,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.04)",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {rh.type === "seed" ? (
                        <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#3CCBFF" }}>Rating Started</div>
                      ) : rh.type === "riot_refresh" ? (
                        <>
                          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#3CCBFF" }}>Riot Rank Refresh</div>
                          <div style={{ fontSize: "0.6rem", color: "#555550", marginTop: 2 }}>{rh.riotRankBefore} &rarr; {rh.riotRankAfter}</div>
                        </>
                      ) : rh.type === "riot_id_change" ? (
                        <>
                          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#a78bfa" }}>Admin Adjustment — Riot ID Changed</div>
                          <div style={{ fontSize: "0.6rem", color: "#555550", marginTop: 2 }}>{(rh as any).oldRiotId} &rarr; {(rh as any).newRiotId}</div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#a78bfa" }}>Admin Adjustment</div>
                          {rh.adminNote && <div style={{ fontSize: "0.68rem", color: "#8A8880", marginTop: 2 }}>{rh.adminNote}</div>}
                        </>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "0.82rem", fontWeight: 800, color: deltaColor }}>{deltaSign}{rh.delta}</div>
                        <div style={{ fontSize: "0.58rem", color: "#555550", fontWeight: 600 }}>{rh.ratingBefore} &rarr; {rh.ratingAfter}</div>
                      </div>
                      <div style={{ fontSize: "0.56rem", color: "#3a3a42", fontWeight: 600, minWidth: 60, textAlign: "right" }}>{dateStr}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* How IEsports Rank Works (always visible) */}
          {profile.iesportsRank && (
            <div className="pp-section" style={{ cursor: "pointer" }} onClick={e => {
              const content = (e.currentTarget.querySelector('[data-explainer]') as HTMLElement);
              if (content) content.style.display = content.style.display === "none" ? "block" : "none";
              const arrow = (e.currentTarget.querySelector('[data-arrow]') as HTMLElement);
              if (arrow) arrow.style.transform = content?.style.display === "none" ? "rotate(0deg)" : "rotate(180deg)";
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="pp-section-label" style={{ marginBottom: 0 }}>How is your IEsports Rank calculated?</span>
                <span data-arrow style={{ fontSize: 10, color: "#3a3a42", transition: "transform 0.2s" }}>&#9660;</span>
              </div>
              <div data-explainer style={{ display: "none", marginTop: 14 }} onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: "0.78rem", color: "#8A8880", lineHeight: 1.6 }}>
                  <div>
                    <div style={{ fontWeight: 800, color: "#F0EEEA", fontSize: "0.72rem", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Starting Rank</div>
                    Your IEsports rank starts as the average of your <span style={{ color: "#3CCBFF", fontWeight: 700 }}>current Valorant rank</span> and your <span style={{ color: "#3CCBFF", fontWeight: 700 }}>peak rank</span> (the highest you've ever achieved). This ensures players can't sandbag by intentionally deranking.
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: "#F0EEEA", fontSize: "0.72rem", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Game Performance</div>
                    Every game you play on IEsports adjusts your rank. Wins and losses are <span style={{ color: "#3CCBFF", fontWeight: 700 }}>equally weighted</span> — stomp a game 13-3 and you gain more than a close 13-11. Each game in a BO3 counts individually.
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: "#F0EEEA", fontSize: "0.72rem", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Underdog Bonus</div>
                    Beat a team rated higher than yours? You gain significantly more points. The bigger the upset, the bigger the reward. Lose to a stronger team? The penalty is tiny.
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: "#F0EEEA", fontSize: "0.72rem", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Riot Rank Floor</div>
                    Your IEsports rank can never drop below your Riot rank average. Each time you register for a tournament, your Riot rank is refreshed — if it went up, your IEsports rank gets bumped up too.
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: "#F0EEEA", fontSize: "0.72rem", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Admin Adjustments</div>
                    Tournament admins can manually adjust ratings when needed (e.g., verified smurf, known skill level). Every adjustment is logged with a reason and visible in your rank history.
                  </div>
                  <div style={{ padding: "10px 14px", background: "rgba(60,203,255,0.05)", borderRadius: 8, border: "1px solid rgba(60,203,255,0.1)" }}>
                    <div style={{ fontWeight: 800, color: "#3CCBFF", fontSize: "0.66rem", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Rating Scale</div>
                    <span style={{ color: "#e0e0da" }}>Same as Valorant ranks — Iron 1 (300 pts) through Radiant (2700 pts). Each rank tier = 100 points.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Valorant stats + match history continue below */}
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
                      // Find rank history entries for this match
                      const matchRh = rankHistory.filter(rh => rh.type === "match" && rh.matchId === mh.matchDocId && rh.tournamentId === mh.tournamentId);
                      const matchTotalDelta = matchRh.reduce((sum, rh) => sum + rh.delta, 0);
                      const matchRatingBefore = matchRh.length > 0 ? matchRh[matchRh.length - 1].ratingBefore : null;
                      const matchRatingAfter = matchRh.length > 0 ? matchRh[0].ratingAfter : null;

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
                            {matchRh.length > 0 && (
                              <div style={{ textAlign: "right", minWidth: 70, marginRight: 4 }}>
                                <div style={{ fontSize: "0.82rem", fontWeight: 800, color: matchTotalDelta > 0 ? "#4ade80" : matchTotalDelta < 0 ? "#f87171" : "#8A8880" }}>
                                  {matchTotalDelta > 0 ? "+" : ""}{matchTotalDelta}
                                </div>
                                <div style={{ fontSize: "0.52rem", color: "#555550", fontWeight: 600 }}>{matchRatingBefore} &rarr; {matchRatingAfter}</div>
                              </div>
                            )}
                            <span className={`pp-match-expand ${isExpanded ? "open" : ""}`}>▼</span>
                          </div>
                          {isExpanded && (
                            <div className="pp-match-detail">
                              {mh.games.map(g => {
                                const won = g.winner === g.playerTeam;
                                // Find rank history for this specific game
                                const gameRh = matchRh.find(rh => (rh as any).gameNum === g.gameNum);
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
                                      {gameRh && (
                                        <span style={{ fontSize: "0.72rem", fontWeight: 800, color: gameRh.delta > 0 ? "#4ade80" : "#f87171", minWidth: 36, textAlign: "right" }}>
                                          {gameRh.delta > 0 ? "+" : ""}{gameRh.delta}
                                        </span>
                                      )}
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
            <>
              {profile.steamId ? (
                <div className="pp-section">
                  <span className="pp-section-label">Dota 2 Profile</span>
                  {(() => {
                    const dotaRanks = ["", "Herald", "Guardian", "Crusader", "Archon", "Legend", "Ancient", "Divine", "Immortal"];
                    const tier = profile.dotaRankTier || 0;
                    const medal = Math.floor(tier / 10);
                    const stars = tier % 10;
                    const exactRank = tier > 0 && medal >= 1 && medal <= 8 ? `${dotaRanks[medal]}${stars > 0 ? ` ${stars}` : ""}` : null;
                    return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #1e1e22" }}>
                      <span style={{ fontSize: "0.72rem", color: "#8A8880" }}>Steam Name</span>
                      <span style={{ fontSize: "0.72rem", color: "#F0EEEA", fontWeight: 700 }}>{profile.steamName || "—"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #1e1e22" }}>
                      <span style={{ fontSize: "0.72rem", color: "#8A8880" }}>Rank</span>
                      <span style={{ fontSize: "0.72rem", color: "#66c0f4", fontWeight: 700 }}>{exactRank || "Unranked"}</span>
                    </div>
                    {profile.dotaMMR && (
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #1e1e22" }}>
                        <span style={{ fontSize: "0.72rem", color: "#8A8880" }}>MMR</span>
                        <span style={{ fontSize: "0.72rem", color: "#F0EEEA", fontWeight: 700 }}>{profile.dotaMMR}</span>
                      </div>
                    )}
                  </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="pp-section">
                  <span className="pp-section-label">Dota 2</span>
                  <div className="pp-empty">Steam account not connected. Connect Steam to see Dota 2 rank and tournament stats.</div>
                </div>
              )}
              <div className="pp-section">
                <span className="pp-section-label">Dota 2 Match History</span>
                <div className="pp-empty">Dota 2 tournament match history coming soon.</div>
              </div>
            </>
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
                        try { localStorage.removeItem("pendingRegistration"); sessionStorage.setItem("redirectAfterLogin", window.location.pathname); } catch {}
                        if (hasDiscordAccount(discordConnections, "steam", steamLinked)) { triggerDiscordPrompt(); }
                        else { navigateWithAppPriority(`/api/auth/steam?uid=${user?.uid}`); }
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
                      <button className="pp-acc-link-btn" onClick={() => { try { localStorage.removeItem("pendingRegistration"); } catch {} navigateWithAppPriority(`/api/auth/discord?uid=${user?.uid}&returnTo=${encodeURIComponent(window.location.pathname)}`); }}>Connect</button>
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
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {profile.riotVerified === "verified" ? (
                        <span className="pp-acc-badge pp-acc-linked">✓ Verified</span>
                      ) : profile.riotVerified === "pending" ? (
                        <span className="pp-acc-badge pp-acc-pending">⏳ Pending</span>
                      ) : (
                        <button className="pp-acc-link-btn" onClick={() => {
                          try { localStorage.removeItem("pendingRegistration"); sessionStorage.setItem("redirectAfterLogin", window.location.pathname); } catch {}
                          if (hasDiscordAccount(discordConnections, "riot", !!authRiotData?.riotLinked)) { triggerDiscordPrompt(); }
                          else { window.location.href = "/connect-riot"; }
                        }}>Connect</button>
                      )}
                      {profile.riotGameName && (
                        <button onClick={() => router.push("/connect-riot")} style={{
                          padding: "4px 10px", borderRadius: 100, background: "rgba(255,70,85,0.08)",
                          color: "#ff6b77", border: "1px solid rgba(255,70,85,0.25)", fontSize: "0.62rem",
                          fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                        }}>Change</button>
                      )}
                    </div>
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

  /* ── Hero Header ── */
  .pp-hero { position: relative; margin-bottom: 24px; border-radius: 18px; overflow: hidden; background: #0E0E14; border: 1px solid #1E1E28; }
  .pp-hero-bg { position: absolute; inset: 0; background: linear-gradient(135deg, rgba(60,203,255,0.08) 0%, transparent 40%, rgba(99,102,241,0.06) 70%, transparent 100%); pointer-events: none; }
  .pp-hero-bg::after { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at 30% 20%, rgba(60,203,255,0.06) 0%, transparent 60%); }
  .pp-hero-content { position: relative; z-index: 1; display: flex; align-items: center; gap: 24px; padding: 32px 28px 28px; }
  .pp-hero-info { flex: 1; min-width: 0; }

  .pp-avatar { width: 100px; height: 100px; border-radius: 18px; object-fit: cover; border: 3px solid rgba(60,203,255,0.25); box-shadow: 0 0 24px rgba(60,203,255,0.12), 0 4px 20px rgba(0,0,0,0.4); }
  .pp-avatar-init { width: 100px; height: 100px; border-radius: 18px; background: linear-gradient(135deg, #3CCBFF 0%, #2A9FCC 100%); display: flex; align-items: center; justify-content: center; font-size: 36px; font-weight: 900; color: #fff; border: 3px solid rgba(60,203,255,0.25); box-shadow: 0 0 24px rgba(60,203,255,0.12); }
  .pp-name { font-size: 1.8rem; font-weight: 900; color: #F0EEEA; margin: 0; line-height: 1.15; }
  .pp-tag { color: #555550; font-weight: 600; font-size: 0.95rem; margin-left: 4px; }

  /* Rank pills */
  .pp-rank-badges { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .pp-rank-pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 14px; border-radius: 100px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); font-size: 0.78rem; font-weight: 800; color: #e0e0da; }
  .pp-rank-pill-primary { background: rgba(60,203,255,0.1); border-color: rgba(60,203,255,0.3); color: #3CCBFF; }
  .pp-rank-pill-peak { background: rgba(251,191,36,0.08); border-color: rgba(251,191,36,0.25); color: #fbbf24; }
  .pp-rank-pill-steam { background: rgba(102,192,244,0.1); border-color: rgba(102,192,244,0.25); color: #66c0f4; }
  .pp-rank-pill-icon { font-size: 0.72rem; }
  .pp-rank-pill-sub { font-size: 0.5rem; font-weight: 700; color: #555550; letter-spacing: 0.1em; margin-left: 2px; }

  /* ── Stats Row ── */
  .pp-stats-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; margin-bottom: 24px; }
  .pp-stat-card { background: #121218; border: 1px solid #1E1E28; border-radius: 14px; padding: 18px 10px; text-align: center; position: relative; overflow: hidden; transition: border-color 0.2s, box-shadow 0.2s; }
  .pp-stat-card:hover { border-color: rgba(60,203,255,0.2); box-shadow: 0 0 16px rgba(60,203,255,0.06); }
  .pp-stat-hero { grid-column: span 2; background: linear-gradient(135deg, rgba(60,203,255,0.06) 0%, #121218 100%); border-color: rgba(60,203,255,0.2); }
  .pp-stat-value { font-size: 1.5rem; font-weight: 900; color: #F0EEEA; line-height: 1.15; }
  .pp-stat-green { color: #4ade80; }
  .pp-stat-red { color: #f87171; }
  .pp-stat-label { font-size: 0.58rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: #555550; margin-top: 6px; }

  /* Win rate bar */
  .pp-winbar { width: 100%; height: 3px; background: rgba(255,255,255,0.06); border-radius: 3px; margin-top: 8px; overflow: hidden; }
  .pp-winbar-fill { height: 100%; border-radius: 3px; transition: width 0.6s ease; }

  /* ── Rank Card ── */
  .pp-rank-card { position: relative; background: #0E0E14; border: 1px solid rgba(60,203,255,0.2); border-radius: 16px; padding: 24px; margin-bottom: 16px; overflow: hidden; }
  .pp-rank-card-glow { position: absolute; top: -40px; left: -40px; width: 200px; height: 200px; background: radial-gradient(circle, rgba(60,203,255,0.12) 0%, transparent 70%); pointer-events: none; }
  .pp-rank-mini-card { flex: 1; text-align: center; padding: 12px 8px; background: rgba(255,255,255,0.03); border: 1px solid #1E1E28; border-radius: 12px; }
  .pp-rating-bar { position: relative; width: 100%; height: 6px; background: rgba(255,255,255,0.06); border-radius: 6px; overflow: hidden; }
  .pp-rating-bar-fill { height: 100%; border-radius: 6px; background: linear-gradient(90deg, #2A9FCC, #3CCBFF, #60d5ff); transition: width 0.8s ease; box-shadow: 0 0 12px rgba(60,203,255,0.4); }
  .pp-rating-bar-marks { display: flex; justify-content: space-between; margin-top: 4px; }
  .pp-rating-bar-marks span { font-size: 0.48rem; font-weight: 700; color: #3a3a42; }

  /* ── Tab Bar ── */
  .pp-tab-bar { display: flex; gap: 0; border-bottom: 2px solid #1E1E28; margin-bottom: 24px; }
  .pp-tab { padding: 10px 24px; font-size: 0.86rem; font-weight: 700; color: #555550; cursor: pointer; border-bottom: 2.5px solid transparent; margin-bottom: -2px; transition: all 0.15s; background: none; border-top: none; border-left: none; border-right: none; font-family: inherit; }
  .pp-tab.active { color: #3CCBFF; border-bottom-color: #3CCBFF; }
  .pp-tab-private { margin-left: auto; }
  .pp-tab-private.active { color: #60a5fa; border-bottom-color: #60a5fa; }

  /* ── Sections ── */
  .pp-section { background: #121218; border: 1px solid #1E1E28; border-radius: 14px; padding: 20px 24px; margin-bottom: 16px; }
  .pp-section-label { display: block; font-size: 0.62rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #555550; margin-bottom: 16px; }

  .pp-detail-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .pp-detail-item { text-align: center; padding: 14px 10px; background: rgba(255,255,255,0.02); border: 1px solid #1E1E28; border-radius: 12px; }
  .pp-detail-num { display: block; font-size: 1.4rem; font-weight: 800; color: #F0EEEA; }
  .pp-detail-lbl { display: block; font-size: 0.58rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #555550; margin-top: 4px; }

  .pp-agents-row { display: flex; gap: 10px; flex-wrap: wrap; }
  .pp-agent-chip { display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: rgba(255,255,255,0.03); border: 1px solid #1E1E28; border-radius: 100px; }
  .pp-agent-name { font-size: 0.82rem; font-weight: 700; color: #e0e0da; }
  .pp-agent-count { font-size: 0.68rem; color: #555550; }

  .pp-empty { text-align: center; padding: 40px 20px; color: #555550; font-size: 0.85rem; }

  /* ── Match History ── */
  .pp-matches { display: flex; flex-direction: column; gap: 8px; }
  .pp-match-card { border: 1px solid #1E1E28; border-radius: 12px; overflow: hidden; background: #121218; }
  .pp-match-header { display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer; transition: background 0.1s; }
  .pp-match-header:hover { background: rgba(255,255,255,0.03); }
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
  .pp-game-row.won { background: rgba(22,163,74,0.08); }
  .pp-game-row.lost { background: rgba(239,68,68,0.06); }
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

  /* ── Account ── */
  .pp-acc-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: rgba(255,255,255,0.02); border: 1px solid #1E1E28; border-radius: 10px; }
  .pp-acc-left { display: flex; align-items: center; gap: 12px; }
  .pp-acc-name { font-size: 0.84rem; font-weight: 700; color: #e0e0da; }
  .pp-acc-detail { font-size: 0.72rem; color: #555550; margin-top: 1px; }
  .pp-acc-badge { font-size: 0.62rem; font-weight: 800; padding: 3px 10px; border-radius: 100px; }
  .pp-acc-linked { background: rgba(22,163,74,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); }
  .pp-acc-pending { background: rgba(251,191,36,0.1); color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); }
  .pp-acc-missing { background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
  .pp-acc-link-btn { font-size: 0.72rem; font-weight: 800; padding: 5px 14px; border-radius: 100px; background: rgba(96,165,250,0.1); color: #60a5fa; border: 1px solid rgba(96,165,250,0.3); cursor: pointer; font-family: inherit; transition: background 0.15s; }
  .pp-acc-link-btn:hover { background: rgba(96,165,250,0.18); }

  .pp-upi-input { flex: 1; background: rgba(255,255,255,0.03); border: 1px solid #1E1E28; border-radius: 10px; padding: 10px 14px; font-size: 0.88rem; color: #F0EEEA; font-family: inherit; outline: none; transition: border-color 0.15s; }
  .pp-upi-input:focus { border-color: #60a5fa; }
  .pp-upi-input::placeholder { color: #3a3a42; }
  .pp-upi-btn { padding: 10px 20px; border-radius: 10px; background: rgba(96,165,250,0.12); color: #60a5fa; border: 1px solid rgba(96,165,250,0.3); font-size: 0.84rem; font-weight: 800; cursor: pointer; font-family: inherit; transition: background 0.15s; white-space: nowrap; }
  .pp-upi-btn:hover:not(:disabled) { background: rgba(96,165,250,0.2); }
  .pp-upi-btn:disabled { opacity: 0.5; cursor: default; }

  @media (max-width: 700px) {
    .pp-hero-content { padding: 24px 20px 20px; gap: 16px; }
    .pp-avatar { width: 80px; height: 80px; border-radius: 16px; }
    .pp-avatar-init { width: 80px; height: 80px; border-radius: 16px; font-size: 30px; }
    .pp-name { font-size: 1.35rem; }
    .pp-stats-row { grid-template-columns: repeat(3, 1fr); }
    .pp-stat-hero { grid-column: span 3; }
    .pp-stat-value { font-size: 1.3rem; }
    .pp-detail-grid { grid-template-columns: repeat(2, 1fr); }
    .pp-match-meta { min-width: 80px; }
    .pp-match-team { max-width: 80px; font-size: 0.72rem; }
    .pp-game-row { flex-direction: column; align-items: flex-start; gap: 6px; }
    .pp-rank-card { padding: 20px 16px; }
  }
  @media (max-width: 420px) {
    .pp-hero-content { padding: 20px 16px 16px; gap: 12px; }
    .pp-avatar { width: 68px; height: 68px; }
    .pp-avatar-init { width: 68px; height: 68px; font-size: 26px; }
    .pp-name { font-size: 1.15rem; }
    .pp-stats-row { grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .pp-stat-hero { grid-column: span 2; }
    .pp-rank-pill { font-size: 0.68rem; padding: 4px 10px; }
  }
`;
