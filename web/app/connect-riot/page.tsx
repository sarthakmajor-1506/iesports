// "use client";

// import { useAuth } from "../context/AuthContext";
// import { useRouter } from "next/navigation";
// import { useEffect, useState, useRef } from "react";
// import { doc, updateDoc } from "firebase/firestore";
// import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
// import { db, storage } from "@/lib/firebase";


// type Step = "search" | "confirm" | "upload" | "done";

// type RiotPlayer = {
//   gameName: string;
//   tagLine: string;
//   region: string;
//   accountLevel: number;
//   avatar: string;
//   puuid: string;
//   rank: string;
//   tier: number;
// };

// export default function ConnectRiot() {
//   const { user, loading, riotData } = useAuth();
//   const router = useRouter();

//   const [step, setStep] = useState<Step>("search");
//   const [riotId, setRiotId] = useState("");
//   const [searching, setSearching] = useState(false);
//   const [error, setError] = useState("");
//   const [player, setPlayer] = useState<RiotPlayer | null>(null);

//   // Upload state
//   const [uploading, setUploading] = useState(false);
//   const [selectedFile, setSelectedFile] = useState<File | null>(null);
//   const [previewUrl, setPreviewUrl] = useState("");
//   const fileRef = useRef<HTMLInputElement>(null);

//   useEffect(() => {
//     if (!loading && !user) router.push("/");
//   }, [user, loading, router]);

//   // If already linked and pending/verified, show status
//   useEffect(() => {
//     if (!loading && riotData) {
//       if (riotData.riotVerified === "pending") setStep("done");
//       if (riotData.riotVerified === "verified") setStep("done");
//     }
//   }, [loading, riotData]);

//   const handleSearch = async () => {
//     if (!riotId.includes("#")) {
//       setError("Enter your Riot ID in the format: Name#TAG");
//       return;
//     }
//     setSearching(true);
//     setError("");
//     try {
//       const res = await fetch("/api/riot/lookup", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ riotId }),
//       });
//       const data = await res.json();
//       if (!res.ok) throw new Error(data.error || "Player not found");
//       setPlayer(data);
//       setStep("confirm");
//     } catch (e: any) {
//       setError(e.message || "Failed to look up player");
//     } finally {
//       setSearching(false);
//     }
//   };

//   const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const file = e.target.files?.[0];
//     if (!file) return;
//     if (file.size > 5 * 1024 * 1024) {
//       setError("File must be under 5MB");
//       return;
//     }
//     if (!file.type.startsWith("image/")) {
//       setError("Please upload an image file");
//       return;
//     }
//     setError("");
//     setSelectedFile(file);
//     setPreviewUrl(URL.createObjectURL(file));
//   };

//   const handleUpload = async () => {
//     if (!selectedFile || !user || !player) return;
//     setUploading(true);
//     setError("");
//     try {
//       // Upload screenshot to Firebase Storage
//       const timestamp = Date.now();
//       const storageRef = ref(storage, `riot-screenshots/${user.uid}/${timestamp}.jpg`);
//       await uploadBytes(storageRef, selectedFile);
//       const screenshotUrl = await getDownloadURL(storageRef);

//       // Write Riot data to user doc in Firestore
//       // Write Riot data to user doc in Firestore
//       // Include extra fields so admin can cross-reference during manual verification
//       await updateDoc(doc(db, "users", user.uid), {
//         riotGameName: player.gameName,
//         riotTagLine: player.tagLine,
//         riotAvatar: player.avatar,
//         riotRank: player.rank,
//         riotTier: player.tier,
//         riotPuuid: player.puuid,
//         riotRegion: player.region,
//         riotAccountLevel: player.accountLevel,
//         riotVerified: "pending",
//         riotScreenshotUrl: screenshotUrl,
//         riotLinkedAt: new Date().toISOString(),
//         riotVerificationNote: `Submitted by UID: ${user.uid} | Display: ${user.displayName || "N/A"} | Phone: ${user.phoneNumber || "N/A"}`,
//       });

//       setStep("done");
//     } catch (e: any) {
//       console.error("Upload error:", e);
//       setError(e.message || "Failed to upload. Try again.");
//     } finally {
//       setUploading(false);
//     }
//   };

//   if (loading) {
//     return (
//       <div style={{ minHeight: "100vh", background: "#F8F7F4", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
//         <div style={{ width: 36, height: 36, border: "3px solid #E5E3DF", borderTopColor: "#ff4655", borderRadius: "50%", animation: "cr-spin 0.8s linear infinite" }} />
//         <style>{`@keyframes cr-spin { to { transform: rotate(360deg); } }`}</style>
//       </div>
//     );
//   }

//   if (!user) return null;

//   const alreadyLinked = riotData?.riotVerified === "pending" || riotData?.riotVerified === "verified";

//   return (
//     <>
//       <style>{`
//         @keyframes cr-spin { to { transform: rotate(360deg); } }
//         @keyframes cr-fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
//         .cr-page { min-height: 100vh; background: #F8F7F4; font-family: var(--font-geist-sans), system-ui, sans-serif; }
//         .cr-container { max-width: 520px; margin: 0 auto; padding: 40px 24px 60px; }
//         .cr-card { background: #fff; border: 1px solid #E5E3DF; border-radius: 16px; padding: 32px; position: relative; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.06); animation: cr-fade-in 0.3s ease; }
//         .cr-accent { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #ff4655, #ff6b77); }
//         .cr-title { font-size: 22px; font-weight: 800; color: #111; margin-bottom: 4px; }
//         .cr-subtitle { font-size: 13px; color: #888; line-height: 1.6; margin-bottom: 24px; }
//         .cr-label { font-size: 0.62rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #ff4655; margin-bottom: 12px; display: block; }
//         .cr-input { width: 100%; padding: 14px 16px; background: #F8F7F4; border: 1.5px solid #E5E3DF; border-radius: 10px; font-size: 15px; font-family: inherit; font-weight: 600; color: #111; outline: none; transition: border-color 0.2s; box-sizing: border-box; }
//         .cr-input:focus { border-color: #ff4655; }
//         .cr-input::placeholder { color: #bbb; font-weight: 400; }
//         .cr-btn { width: 100%; padding: 14px; background: #ff4655; color: #fff; border: none; border-radius: 100px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit; transition: background 0.15s; margin-top: 16px; }
//         .cr-btn:hover { background: #e63e4d; }
//         .cr-btn:disabled { opacity: 0.6; cursor: not-allowed; }
//         .cr-btn-outline { width: 100%; padding: 12px; background: transparent; color: #888; border: 1px solid #E5E3DF; border-radius: 100px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.15s; margin-top: 10px; }
//         .cr-btn-outline:hover { background: #F8F7F4; color: #555; }
//         .cr-error { color: #ef4444; font-size: 13px; margin-top: 10px; text-align: center; }

//         /* Player card */
//         .cr-player { display: flex; align-items: center; gap: 16px; background: #F8F7F4; border: 1px solid #E5E3DF; border-radius: 12px; padding: 16px; margin-bottom: 20px; animation: cr-fade-in 0.3s ease; }
//         .cr-player-avatar { width: 56px; height: 56px; border-radius: 10px; border: 2px solid #ff4655; object-fit: cover; }
//         .cr-player-info { flex: 1; min-width: 0; }
//         .cr-player-name { font-size: 16px; font-weight: 800; color: #111; }
//         .cr-player-tag { color: #888; font-weight: 400; }
//         .cr-player-meta { display: flex; gap: 12px; margin-top: 4px; flex-wrap: wrap; }
//         .cr-player-pill { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 100px; background: #fff; border: 1px solid #E5E3DF; color: #555; }
//         .cr-player-pill.rank { background: #fff0f1; border-color: #fecdd3; color: #ff4655; }

//         /* Upload area */
//         .cr-upload-zone { border: 2px dashed #E5E3DF; border-radius: 12px; padding: 32px 20px; text-align: center; cursor: pointer; transition: all 0.2s; background: #FAFAF9; }
//         .cr-upload-zone:hover { border-color: #ff4655; background: #fff5f5; }
//         .cr-upload-zone.has-file { border-color: #ff4655; border-style: solid; background: #fff; }
//         .cr-preview { max-width: 100%; max-height: 200px; border-radius: 8px; margin-top: 12px; object-fit: contain; }

//         /* Success state */
//         .cr-success { text-align: center; }
//         .cr-success-icon { font-size: 48px; margin-bottom: 16px; }
//         .cr-success-title { font-size: 20px; font-weight: 800; color: #111; margin-bottom: 8px; }
//         .cr-success-text { font-size: 13px; color: #888; line-height: 1.6; margin-bottom: 24px; }
//         .cr-status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 16px; border-radius: 100px; font-size: 12px; font-weight: 700; }
//         .cr-status-badge.pending { background: #fef3c7; border: 1px solid #fde68a; color: #92400e; }
//         .cr-status-badge.verified { background: #dcfce7; border: 1px solid #bbf7d0; color: #16a34a; }

//         /* Back link */
//         .cr-back { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; color: #888; text-decoration: none; margin-bottom: 20px; cursor: pointer; transition: color 0.15s; background: none; border: none; font-family: inherit; padding: 0; }
//         .cr-back:hover { color: #555; }
//       `}</style>

//       <div className="cr-page">
//         <div className="cr-container">

//           {/* ── ALREADY LINKED — show status ── */}
//           {alreadyLinked && (
//             <div className="cr-card">
//               <div className="cr-accent" />
//               <div className="cr-success">
//                 <div className="cr-success-icon">
//                   {riotData?.riotVerified === "verified" ? "✅" : "⏳"}
//                 </div>
//                 <div className="cr-success-title">
//                   {riotData?.riotVerified === "verified" ? "Riot ID Verified" : "Verification Pending"}
//                 </div>
//                 <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center", margin: "16px 0" }}>
//                   {riotData?.riotAvatar && (
//                     <img src={riotData.riotAvatar} alt="" style={{ width: 40, height: 40, borderRadius: 8, border: "2px solid #ff4655" }} />
//                   )}
//                   <span style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>
//                     {riotData?.riotGameName}<span style={{ color: "#888" }}>#{riotData?.riotTagLine}</span>
//                   </span>
//                 </div>
//                 {riotData?.riotRank && (
//                   <span className="cr-player-pill rank" style={{ display: "inline-block", marginBottom: 16 }}>
//                     {riotData.riotRank}
//                   </span>
//                 )}
//                 <div className="cr-success-text">
//                   {riotData?.riotVerified === "verified"
//                     ? "Your Riot ID has been verified. You're all set to join Valorant tournaments."
//                     : "Your Riot ID has been submitted for verification. This usually takes under 24 hours. You can still browse tournaments while you wait."
//                   }
//                 </div>
//                 <span className={`cr-status-badge ${riotData?.riotVerified}`}>
//                   {riotData?.riotVerified === "verified" ? "✓ Verified" : "⏳ Pending Review"}
//                 </span>
//                 <button className="cr-btn-outline" onClick={() => router.push("/valorant")} style={{ marginTop: 20 }}>
//                   Browse Valorant Tournaments →
//                 </button>
//               </div>
//             </div>
//           )}

//           {/* ── STEP 1: SEARCH RIOT ID ── */}
//           {!alreadyLinked && step === "search" && (
//             <div className="cr-card">
//               <div className="cr-accent" />
//               <span className="cr-label">Connect Riot ID</span>
//               <h1 className="cr-title">Link Your Valorant Account</h1>
//               <p className="cr-subtitle">
//                 Enter your Riot ID to connect your Valorant account. We'll verify your rank and identity.
//               </p>
//               <input
//                 className="cr-input"
//                 type="text"
//                 placeholder="PlayerName#TAG"
//                 value={riotId}
//                 onChange={(e) => setRiotId(e.target.value)}
//                 onKeyDown={(e) => e.key === "Enter" && handleSearch()}
//                 autoFocus
//               />
//               {error && <p className="cr-error">{error}</p>}
//               <button className="cr-btn" onClick={handleSearch} disabled={searching || !riotId.trim()}>
//                 {searching ? "Searching..." : "Search Player →"}
//               </button>
//               <button className="cr-btn-outline" onClick={() => router.back()}>
//                 ← Go Back
//               </button>
//             </div>
//           )}

//           {/* ── STEP 2: CONFIRM PLAYER ── */}
//           {!alreadyLinked && step === "confirm" && player && (
//             <div className="cr-card">
//               <div className="cr-accent" />
//               <span className="cr-label">Is this you?</span>
//               <div className="cr-player">
//                 {player.avatar && (
//                   <img className="cr-player-avatar" src={player.avatar} alt={player.gameName} />
//                 )}
//                 <div className="cr-player-info">
//                   <div className="cr-player-name">
//                     {player.gameName}<span className="cr-player-tag">#{player.tagLine}</span>
//                   </div>
//                   <div className="cr-player-meta">
//                     <span className="cr-player-pill rank">{player.rank}</span>
//                     <span className="cr-player-pill">Level {player.accountLevel}</span>
//                     <span className="cr-player-pill">{player.region.toUpperCase()}</span>
//                   </div>
//                 </div>
//               </div>
//               <button className="cr-btn" onClick={() => setStep("upload")}>
//                 This is me — Continue →
//               </button>
//               <button className="cr-btn-outline" onClick={() => { setStep("search"); setPlayer(null); setError(""); }}>
//                 Try a different ID
//               </button>
//             </div>
//           )}

//           {/* ── STEP 3: UPLOAD SCREENSHOT ── */}
//           {!alreadyLinked && step === "upload" && player && (
//             <div className="cr-card">
//               <div className="cr-accent" />
//               <span className="cr-label">Verify Your Identity</span>
//               <h2 className="cr-title" style={{ fontSize: 18 }}>Upload Career Screenshot</h2>
//               <p className="cr-subtitle">
//                 Upload a screenshot of your Valorant in-game career profile showing your Riot ID.
//                 This is used to confirm your identity manually.
//               </p>

//               <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, padding: "10px 14px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10 }}>
//                 <span style={{ fontSize: 14 }}>💡</span>
//                 <p style={{ fontSize: 12, color: "#0369a1", lineHeight: 1.5, margin: 0 }}>
//                   Open Valorant → Career tab → take a screenshot showing your name and rank.
//                 </p>
//               </div>

//               <div
//                 className={`cr-upload-zone${selectedFile ? " has-file" : ""}`}
//                 onClick={() => fileRef.current?.click()}
//               >
//                 <input
//                   ref={fileRef}
//                   type="file"
//                   accept="image/*"
//                   onChange={handleFileSelect}
//                   style={{ display: "none" }}
//                 />
//                 {previewUrl ? (
//                   <>
//                     <img src={previewUrl} alt="Preview" className="cr-preview" />
//                     <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>Click to change</p>
//                   </>
//                 ) : (
//                   <>
//                     <p style={{ fontSize: 32, marginBottom: 8 }}>📸</p>
//                     <p style={{ fontSize: 14, fontWeight: 600, color: "#555" }}>Click to upload screenshot</p>
//                     <p style={{ fontSize: 12, color: "#bbb", marginTop: 4 }}>PNG, JPG — max 5MB</p>
//                   </>
//                 )}
//               </div>

//               {error && <p className="cr-error">{error}</p>}

//               <button className="cr-btn" onClick={handleUpload} disabled={uploading || !selectedFile}>
//                 {uploading ? "Uploading..." : "Submit for Verification →"}
//               </button>
//               <button className="cr-btn-outline" onClick={() => { setStep("confirm"); setSelectedFile(null); setPreviewUrl(""); setError(""); }}>
//                 ← Back
//               </button>
//             </div>
//           )}

//           {/* ── STEP 4: DONE (just submitted) ── */}
//           {!alreadyLinked && step === "done" && (
//             <div className="cr-card">
//               <div className="cr-accent" />
//               <div className="cr-success">
//                 <div className="cr-success-icon">🎉</div>
//                 <div className="cr-success-title">Riot ID Submitted!</div>
//                 <div className="cr-success-text">
//                   Your Riot ID has been submitted for verification. We'll review it within 24 hours.
//                   You can browse Valorant tournaments while you wait.
//                 </div>
//                 <span className="cr-status-badge pending">⏳ Pending Review</span>
//                 <button className="cr-btn" onClick={() => router.push("/valorant")} style={{ marginTop: 24 }}>
//                   Browse Valorant Tournaments →
//                 </button>
//               </div>
//             </div>
//           )}

//         </div>
//       </div>
//     </>
//   );
// }




"use client";

import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";


type Step = "search" | "confirm" | "upload" | "done";

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

  // Submit with optional screenshot
  const handleSubmit = async () => {
    if (!user || !player) return;
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
      console.error("Upload error:", e);
      setError(e.message || "Failed to submit. Try again.");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#F8F7F4", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ width: 36, height: 36, border: "3px solid #E5E3DF", borderTopColor: "#ff4655", borderRadius: "50%", animation: "cr-spin 0.8s linear infinite" }} />
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
        .cr-page { min-height: 100vh; background: #F8F7F4; font-family: var(--font-geist-sans), system-ui, sans-serif; }
        .cr-container { max-width: 520px; margin: 0 auto; padding: 40px 24px 60px; }
        .cr-card { background: #fff; border: 1px solid #E5E3DF; border-radius: 16px; padding: 32px; position: relative; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.06); animation: cr-fade-in 0.3s ease; }
        .cr-accent { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #ff4655, #ff6b77); }
        .cr-title { font-size: 22px; font-weight: 800; color: #111; margin-bottom: 4px; }
        .cr-subtitle { font-size: 13px; color: #888; line-height: 1.6; margin-bottom: 24px; }
        .cr-label { font-size: 0.62rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #ff4655; margin-bottom: 12px; display: block; }
        .cr-input { width: 100%; padding: 14px 16px; background: #F8F7F4; border: 1.5px solid #E5E3DF; border-radius: 10px; font-size: 15px; font-family: inherit; font-weight: 600; color: #111; outline: none; transition: border-color 0.2s; box-sizing: border-box; }
        .cr-input:focus { border-color: #ff4655; }
        .cr-input::placeholder { color: #bbb; font-weight: 400; }
        .cr-btn { width: 100%; padding: 14px; background: #ff4655; color: #fff; border: none; border-radius: 100px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit; transition: background 0.15s; margin-top: 16px; }
        .cr-btn:hover { background: #e63e4d; }
        .cr-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .cr-btn-outline { width: 100%; padding: 12px; background: transparent; color: #888; border: 1px solid #E5E3DF; border-radius: 100px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.15s; margin-top: 10px; }
        .cr-btn-outline:hover { background: #F8F7F4; color: #555; }
        .cr-error { color: #ef4444; font-size: 13px; margin-top: 10px; text-align: center; }

        /* Player card */
        .cr-player { display: flex; align-items: center; gap: 16px; background: #F8F7F4; border: 1px solid #E5E3DF; border-radius: 12px; padding: 16px; margin-bottom: 20px; animation: cr-fade-in 0.3s ease; }
        .cr-player-avatar { width: 56px; height: 56px; border-radius: 10px; border: 2px solid #ff4655; object-fit: cover; }
        .cr-player-info { flex: 1; min-width: 0; }
        .cr-player-name { font-size: 16px; font-weight: 800; color: #111; }
        .cr-player-tag { color: #888; font-weight: 400; }
        .cr-player-meta { display: flex; gap: 12px; margin-top: 4px; flex-wrap: wrap; }
        .cr-player-pill { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 100px; background: #fff; border: 1px solid #E5E3DF; color: #555; }
        .cr-player-pill.rank { background: #fff0f1; border-color: #fecdd3; color: #ff4655; }

        /* Screenshot accordion */
        .cr-accordion-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: #F8F7F4; border: 1px solid #E5E3DF; border-radius: 10px; cursor: pointer; user-select: none; transition: all 0.15s; margin-bottom: 0; }
        .cr-accordion-header:hover { background: #f0efec; border-color: #d0cec9; }
        .cr-accordion-header.open { border-radius: 10px 10px 0 0; border-bottom-color: transparent; background: #fff5f5; border-color: #fecdd3; }
        .cr-accordion-left { display: flex; align-items: center; gap: 8px; }
        .cr-accordion-title { font-size: 13px; font-weight: 700; color: #555; }
        .cr-accordion-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 100px; background: #f0fdf4; border: 1px solid #bbf7d0; color: #16a34a; }
        .cr-accordion-chevron { font-size: 11px; color: #aaa; transition: transform 0.2s; }
        .cr-accordion-chevron.open { transform: rotate(180deg); }
        .cr-accordion-body { border: 1px solid #fecdd3; border-top: none; border-radius: 0 0 10px 10px; padding: 16px 14px; background: #fff; margin-bottom: 0; overflow: hidden; }

        /* Upload area */
        .cr-upload-zone { border: 2px dashed #E5E3DF; border-radius: 12px; padding: 24px 20px; text-align: center; cursor: pointer; transition: all 0.2s; background: #FAFAF9; }
        .cr-upload-zone:hover { border-color: #ff4655; background: #fff5f5; }
        .cr-upload-zone.has-file { border-color: #ff4655; border-style: solid; background: #fff; }
        .cr-preview { max-width: 100%; max-height: 180px; border-radius: 8px; margin-top: 12px; object-fit: contain; }

        /* Success state */
        .cr-success { text-align: center; }
        .cr-success-icon { font-size: 48px; margin-bottom: 16px; }
        .cr-success-title { font-size: 20px; font-weight: 800; color: #111; margin-bottom: 8px; }
        .cr-success-text { font-size: 13px; color: #888; line-height: 1.6; margin-bottom: 24px; }
        .cr-status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 16px; border-radius: 100px; font-size: 12px; font-weight: 700; }
        .cr-status-badge.pending { background: #fef3c7; border: 1px solid #fde68a; color: #92400e; }
        .cr-status-badge.verified { background: #dcfce7; border: 1px solid #bbf7d0; color: #16a34a; }

        /* Back link */
        .cr-back { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; color: #888; text-decoration: none; margin-bottom: 20px; cursor: pointer; transition: color 0.15s; background: none; border: none; font-family: inherit; padding: 0; }
        .cr-back:hover { color: #555; }
      `}</style>

      <div className="cr-page">
        <div className="cr-container">

          {/* ── ALREADY LINKED — show status ── */}
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
                  <span style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>
                    {riotData?.riotGameName}<span style={{ color: "#888" }}>#{riotData?.riotTagLine}</span>
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

          {/* ── STEP 1: SEARCH RIOT ID ── */}
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

          {/* ── STEP 2: CONFIRM PLAYER ── */}
          {!alreadyLinked && step === "confirm" && player && (
            <div className="cr-card">
              <div className="cr-accent" />
              <span className="cr-label">Is this you?</span>
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
              <button className="cr-btn" onClick={() => setStep("upload")}>
                This is me — Continue →
              </button>
              <button className="cr-btn-outline" onClick={() => { setStep("search"); setPlayer(null); setError(""); }}>
                Try a different ID
              </button>
            </div>
          )}

          {/* ── STEP 3: SUBMIT (screenshot optional) ── */}
          {!alreadyLinked && step === "upload" && player && (
            <div className="cr-card">
              <div className="cr-accent" />
              <span className="cr-label">Almost Done!</span>
              <h2 className="cr-title" style={{ fontSize: 18 }}>Confirm Your Riot ID</h2>
              <p className="cr-subtitle">
                Your account details have been fetched. You can submit now or optionally attach a screenshot to speed up manual verification.
              </p>

              {/* Player summary */}
              <div className="cr-player" style={{ marginBottom: 20 }}>
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
              <div style={{ marginBottom: 20 }}>
                <div
                  className={`cr-accordion-header${screenshotExpanded ? " open" : ""}`}
                  onClick={() => setScreenshotExpanded(!screenshotExpanded)}
                >
                  <div className="cr-accordion-left">
                    <span style={{ fontSize: 16 }}>📸</span>
                    <span className="cr-accordion-title">Attach Career Screenshot</span>
                    <span className="cr-accordion-badge">Optional</span>
                    {selectedFile && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 100, background: "#fff0f1", border: "1px solid #fecdd3", color: "#ff4655" }}>✓ Added</span>}
                  </div>
                  <span className={`cr-accordion-chevron${screenshotExpanded ? " open" : ""}`}>▼</span>
                </div>

                {screenshotExpanded && (
                  <div className="cr-accordion-body">
                    <p style={{ fontSize: 12, color: "#0369a1", lineHeight: 1.5, margin: "0 0 12px 0", padding: "8px 10px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8 }}>
                      💡 Open Valorant → Career tab → take a screenshot showing your name and rank. Helps us verify faster.
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
                          <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>Click to change</p>
                        </>
                      ) : (
                        <>
                          <p style={{ fontSize: 28, marginBottom: 6 }}>📁</p>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>Click to upload screenshot</p>
                          <p style={{ fontSize: 11, color: "#bbb", marginTop: 3 }}>PNG, JPG — max 5MB</p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {error && <p className="cr-error">{error}</p>}

              <button className="cr-btn" onClick={handleSubmit} disabled={uploading}>
                {uploading ? "Submitting..." : "Submit for Verification →"}
              </button>
              <button className="cr-btn-outline" onClick={() => { setStep("confirm"); setSelectedFile(null); setPreviewUrl(""); setScreenshotExpanded(false); setError(""); }}>
                ← Back
              </button>
            </div>
          )}

          {/* ── STEP 4: DONE (just submitted) ── */}
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