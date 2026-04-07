"use client";

import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";


type Step = "search" | "confirm" | "done";

type RiotPlayer = {
  gameName: string;
  tagLine: string;
  region: string;
  accountLevel: number;
  avatar: string;
  puuid: string;
  rank: string;
  tier: number;
};

export default function ConnectRiot() {
  const { user, loading, riotData } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>("search");
  const [riotId, setRiotId] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [player, setPlayer] = useState<RiotPlayer | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [screenshotExpanded, setScreenshotExpanded] = useState(false);
  const [consent, setConsent] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!loading && riotData) {
      if (riotData.riotVerified === "pending") setStep("done");
      if (riotData.riotVerified === "verified") setStep("done");
    }
  }, [loading, riotData]);

  const handleSearch = async () => {
    if (!riotId.includes("#")) {
      setError("Enter your Riot ID in the format: Name#TAG");
      return;
    }
    setSearching(true);
    setError("");
    try {
      const res = await fetch("/api/riot/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riotId, uid: user?.uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Player not found");
      setPlayer(data);
      setStep("confirm");
    } catch (e: any) {
      setError(e.message || "Failed to look up player");
    } finally {
      setSearching(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("File must be under 5MB");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file");
      return;
    }
    setError("");
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!user || !player || !consent) return;
    setUploading(true);
    setError("");
    try {
      let screenshotUrl = "";

      if (selectedFile) {
        const timestamp = Date.now();
        const storageRef = ref(storage, `riot-screenshots/${user.uid}/${timestamp}.jpg`);
        await uploadBytes(storageRef, selectedFile);
        screenshotUrl = await getDownloadURL(storageRef);
      }

      await updateDoc(doc(db, "users", user.uid), {
        riotGameName: player.gameName,
        riotTagLine: player.tagLine,
        riotAvatar: player.avatar,
        riotRank: player.rank,
        riotTier: player.tier,
        riotPuuid: player.puuid,
        riotRegion: player.region,
        riotAccountLevel: player.accountLevel,
        riotVerified: "pending",
        ...(screenshotUrl && { riotScreenshotUrl: screenshotUrl }),
        riotLinkedAt: new Date().toISOString(),
        riotVerificationNote: `Submitted by UID: ${user.uid} | Display: ${user.displayName || "N/A"} | Phone: ${user.phoneNumber || "N/A"}`,
      });

      setStep("done");
    } catch (e: any) {
      setError(e.message || "Failed to submit. Try again.");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0A0A0C", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ width: 36, height: 36, border: "3px solid #2A2A30", borderTopColor: "#ff4655", borderRadius: "50%", animation: "cr-spin 0.8s linear infinite" }} />
        <style>{`@keyframes cr-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) return null;

  const alreadyLinked = riotData?.riotVerified === "pending" || riotData?.riotVerified === "verified";

  return (
    <>
      <style>{`
        @keyframes cr-spin { to { transform: rotate(360deg); } }
        @keyframes cr-fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .cr-page { min-height: 100vh; background: #0A0A0C; font-family: var(--font-geist-sans), system-ui, sans-serif; }
        .cr-container { max-width: 520px; margin: 0 auto; padding: 40px 24px 60px; }
        .cr-card { background: #121215; border: 1px solid #2A2A30; border-radius: 16px; padding: 32px; position: relative; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.3); animation: cr-fade-in 0.3s ease; }
        .cr-accent { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #ff4655, #ff6b77); }
        .cr-title { font-size: 22px; font-weight: 800; color: #F0EEEA; margin-bottom: 4px; }
        .cr-subtitle { font-size: 13px; color: #8A8880; line-height: 1.6; margin-bottom: 24px; }
        .cr-label { font-size: 0.62rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #ff4655; margin-bottom: 12px; display: block; }
        .cr-input { width: 100%; padding: 14px 16px; background: #18181C; border: 1.5px solid #2A2A30; border-radius: 10px; font-size: 15px; font-family: inherit; font-weight: 600; color: #F0EEEA; outline: none; transition: border-color 0.2s; box-sizing: border-box; }
        .cr-input:focus { border-color: #ff4655; }
        .cr-input::placeholder { color: #555550; font-weight: 400; }
        .cr-btn { width: 100%; padding: 14px; background: #ff4655; color: #fff; border: none; border-radius: 100px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit; transition: background 0.15s; margin-top: 16px; }
        .cr-btn:hover { background: #e63e4d; }
        .cr-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .cr-btn-outline { width: 100%; padding: 12px; background: transparent; color: #8A8880; border: 1px solid #2A2A30; border-radius: 100px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.15s; margin-top: 10px; }
        .cr-btn-outline:hover { background: #18181C; color: #F0EEEA; }
        .cr-error { color: #f87171; font-size: 13px; margin-top: 10px; text-align: center; }

        .cr-player { display: flex; align-items: center; gap: 16px; background: #18181C; border: 1px solid #2A2A30; border-radius: 12px; padding: 16px; margin-bottom: 20px; animation: cr-fade-in 0.3s ease; }
        .cr-player-avatar { width: 56px; height: 56px; border-radius: 10px; border: 2px solid #ff4655; object-fit: cover; }
        .cr-player-info { flex: 1; min-width: 0; }
        .cr-player-name { font-size: 16px; font-weight: 800; color: #F0EEEA; }
        .cr-player-tag { color: #555550; font-weight: 400; }
        .cr-player-meta { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
        .cr-player-pill { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 100px; background: #0A0A0C; border: 1px solid #2A2A30; color: #8A8880; }
        .cr-player-pill.rank { background: rgba(255,70,85,0.1); border-color: rgba(255,70,85,0.3); color: #ff4655; }

        .cr-accordion-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: #18181C; border: 1px solid #2A2A30; border-radius: 10px; cursor: pointer; user-select: none; transition: all 0.15s; margin-bottom: 0; }
        .cr-accordion-header:hover { background: #1e1e22; border-color: #3a3a42; }
        .cr-accordion-header.open { border-radius: 10px 10px 0 0; border-bottom-color: transparent; background: rgba(255,70,85,0.06); border-color: rgba(255,70,85,0.25); }
        .cr-accordion-left { display: flex; align-items: center; gap: 8px; }
        .cr-accordion-title { font-size: 13px; font-weight: 700; color: #8A8880; }
        .cr-accordion-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 100px; background: rgba(22,163,74,0.1); border: 1px solid rgba(34,197,94,0.3); color: #4ade80; }
        .cr-accordion-chevron { font-size: 11px; color: #555550; transition: transform 0.2s; }
        .cr-accordion-chevron.open { transform: rotate(180deg); }
        .cr-accordion-body { border: 1px solid rgba(255,70,85,0.25); border-top: none; border-radius: 0 0 10px 10px; padding: 16px 14px; background: #121215; margin-bottom: 0; overflow: hidden; }

        .cr-upload-zone { border: 2px dashed #2A2A30; border-radius: 12px; padding: 24px 20px; text-align: center; cursor: pointer; transition: all 0.2s; background: #0A0A0C; }
        .cr-upload-zone:hover { border-color: #ff4655; background: rgba(255,70,85,0.04); }
        .cr-upload-zone.has-file { border-color: #ff4655; border-style: solid; background: #18181C; }
        .cr-preview { max-width: 100%; max-height: 180px; border-radius: 8px; margin-top: 12px; object-fit: contain; }

        .cr-success { text-align: center; }
        .cr-success-icon { font-size: 48px; margin-bottom: 16px; }
        .cr-success-title { font-size: 20px; font-weight: 800; color: #F0EEEA; margin-bottom: 8px; }
        .cr-success-text { font-size: 13px; color: #8A8880; line-height: 1.6; margin-bottom: 24px; }
        .cr-status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 16px; border-radius: 100px; font-size: 12px; font-weight: 700; }
        .cr-status-badge.pending { background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.3); color: #fbbf24; }
        .cr-status-badge.verified { background: rgba(22,163,74,0.1); border: 1px solid rgba(34,197,94,0.3); color: #4ade80; }

        .cr-consent { display: flex; align-items: flex-start; gap: 10px; padding: 14px; background: #18181C; border: 1px solid #2A2A30; border-radius: 10px; margin-top: 16px; cursor: pointer; user-select: none; transition: border-color 0.15s; }
        .cr-consent:hover { border-color: #3a3a42; }
        .cr-consent-check { width: 18px; height: 18px; border-radius: 4px; border: 2px solid #2A2A30; background: #0A0A0C; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; transition: all 0.15s; }
        .cr-consent-check.checked { background: #ff4655; border-color: #ff4655; }
        .cr-consent-text { font-size: 12px; color: #8A8880; line-height: 1.5; }
      `}</style>

      <div className="cr-page">
        <Navbar />
        <div className="cr-container">

          {/* ALREADY LINKED */}
          {alreadyLinked && (
            <div className="cr-card">
              <div className="cr-accent" />
              <div className="cr-success">
                <div className="cr-success-icon">
                  {riotData?.riotVerified === "verified" ? "✅" : "⏳"}
                </div>
                <div className="cr-success-title">
                  {riotData?.riotVerified === "verified" ? "Riot ID Verified" : "Verification Pending"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center", margin: "16px 0" }}>
                  {riotData?.riotAvatar && (
                    <img src={riotData.riotAvatar} alt="" style={{ width: 40, height: 40, borderRadius: 8, border: "2px solid #ff4655" }} />
                  )}
                  <span style={{ fontSize: 16, fontWeight: 700, color: "#F0EEEA" }}>
                    {riotData?.riotGameName}<span style={{ color: "#555550" }}>#{riotData?.riotTagLine}</span>
                  </span>
                </div>
                {riotData?.riotRank && (
                  <span className="cr-player-pill rank" style={{ display: "inline-block", marginBottom: 16 }}>
                    {riotData.riotRank}
                  </span>
                )}
                <div className="cr-success-text">
                  {riotData?.riotVerified === "verified"
                    ? "Your Riot ID has been verified. You're all set to join Valorant tournaments."
                    : "Your Riot ID has been submitted for verification. This usually takes under 24 hours. You can still browse tournaments while you wait."
                  }
                </div>
                <span className={`cr-status-badge ${riotData?.riotVerified}`}>
                  {riotData?.riotVerified === "verified" ? "✓ Verified" : "⏳ Pending Review"}
                </span>
                <button className="cr-btn-outline" onClick={() => router.push("/valorant")} style={{ marginTop: 20 }}>
                  Browse Valorant Tournaments →
                </button>
              </div>
            </div>
          )}

          {/* STEP 1: SEARCH */}
          {!alreadyLinked && step === "search" && (
            <div className="cr-card">
              <div className="cr-accent" />
              <span className="cr-label">Connect Riot ID</span>
              <h1 className="cr-title">Link Your Valorant Account</h1>
              <p className="cr-subtitle">
                Enter your Riot ID to connect your Valorant account. We'll verify your rank and identity.
              </p>
              <input
                className="cr-input"
                type="text"
                placeholder="PlayerName#TAG"
                value={riotId}
                onChange={(e) => setRiotId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                autoFocus
              />
              {error && <p className="cr-error">{error}</p>}
              <button className="cr-btn" onClick={handleSearch} disabled={searching || !riotId.trim()}>
                {searching ? "Searching..." : "Search Player →"}
              </button>
              <button className="cr-btn-outline" onClick={() => router.back()}>
                ← Go Back
              </button>
            </div>
          )}

          {/* STEP 2: CONFIRM + SCREENSHOT + CONSENT + SUBMIT (combined) */}
          {!alreadyLinked && step === "confirm" && player && (
            <div className="cr-card">
              <div className="cr-accent" />
              <span className="cr-label">Is this you?</span>

              {/* Player card */}
              <div className="cr-player">
                {player.avatar && (
                  <img className="cr-player-avatar" src={player.avatar} alt={player.gameName} />
                )}
                <div className="cr-player-info">
                  <div className="cr-player-name">
                    {player.gameName}<span className="cr-player-tag">#{player.tagLine}</span>
                  </div>
                  <div className="cr-player-meta">
                    <span className="cr-player-pill rank">{player.rank}</span>
                    <span className="cr-player-pill">Level {player.accountLevel}</span>
                    <span className="cr-player-pill">{player.region.toUpperCase()}</span>
                  </div>
                </div>
              </div>

              {/* Optional screenshot accordion */}
              <div style={{ marginBottom: 0 }}>
                <div
                  className={`cr-accordion-header${screenshotExpanded ? " open" : ""}`}
                  onClick={() => setScreenshotExpanded(!screenshotExpanded)}
                >
                  <div className="cr-accordion-left">
                    <span style={{ fontSize: 16 }}>📸</span>
                    <span className="cr-accordion-title">Attach Career Screenshot</span>
                    <span className="cr-accordion-badge">Optional</span>
                    {selectedFile && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 100, background: "rgba(255,70,85,0.1)", border: "1px solid rgba(255,70,85,0.3)", color: "#ff4655" }}>✓ Added</span>}
                  </div>
                  <span className={`cr-accordion-chevron${screenshotExpanded ? " open" : ""}`}>▼</span>
                </div>

                {screenshotExpanded && (
                  <div className="cr-accordion-body">
                    <p style={{ fontSize: 12, color: "#3CCBFF", lineHeight: 1.5, margin: "0 0 12px 0", padding: "8px 10px", background: "rgba(60,203,255,0.08)", border: "1px solid rgba(60,203,255,0.2)", borderRadius: 8 }}>
                      Open Valorant → Career tab → take a screenshot showing your name and rank. Helps us verify faster.
                    </p>
                    <div
                      className={`cr-upload-zone${selectedFile ? " has-file" : ""}`}
                      onClick={() => fileRef.current?.click()}
                    >
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileSelect}
                        style={{ display: "none" }}
                      />
                      {previewUrl ? (
                        <>
                          <img src={previewUrl} alt="Preview" className="cr-preview" />
                          <p style={{ fontSize: 12, color: "#555550", marginTop: 8 }}>Click to change</p>
                        </>
                      ) : (
                        <>
                          <p style={{ fontSize: 28, marginBottom: 6 }}>📁</p>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "#8A8880" }}>Click to upload screenshot</p>
                          <p style={{ fontSize: 11, color: "#555550", marginTop: 3 }}>PNG, JPG — max 5MB</p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Consent checkbox */}
              <div className="cr-consent" onClick={() => setConsent(c => !c)}>
                <div className={`cr-consent-check${consent ? " checked" : ""}`}>
                  {consent && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span className="cr-consent-text">
                  I consent to Indian Esports using my Riot account data (Riot ID, rank, match history) for tournament matchmaking, rank verification, and game tracking purposes.
                </span>
              </div>

              {error && <p className="cr-error">{error}</p>}

              <button className="cr-btn" onClick={handleSubmit} disabled={uploading || !consent}>
                {uploading ? "Submitting..." : "Confirm & Submit →"}
              </button>
              <button className="cr-btn-outline" onClick={() => { setStep("search"); setPlayer(null); setSelectedFile(null); setPreviewUrl(""); setScreenshotExpanded(false); setError(""); setConsent(true); }}>
                Try a different ID
              </button>
            </div>
          )}

          {/* DONE */}
          {!alreadyLinked && step === "done" && (
            <div className="cr-card">
              <div className="cr-accent" />
              <div className="cr-success">
                <div className="cr-success-icon">🎉</div>
                <div className="cr-success-title">Riot ID Submitted!</div>
                <div className="cr-success-text">
                  Your Riot ID has been submitted for verification. We'll review it within 24 hours.
                  You can browse Valorant tournaments while you wait.
                </div>
                <span className="cr-status-badge pending">⏳ Pending Review</span>
                <button className="cr-btn" onClick={() => {
                  try {
                    const pending = localStorage.getItem("pendingRegistration");
                    if (pending) { localStorage.removeItem("pendingRegistration"); router.push(pending + "?register=true"); return; }
                  } catch {}
                  router.push("/valorant");
                }} style={{ marginTop: 24 }}>
                  {typeof window !== "undefined" && localStorage.getItem("pendingRegistration") ? "Return to Registration →" : "Browse Valorant Tournaments →"}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
