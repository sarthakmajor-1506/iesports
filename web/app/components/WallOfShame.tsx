"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { User } from "firebase/auth";
import { Skull, X } from "lucide-react";

type Kind = "tomato" | "bail";
type ShameType = "wanted" | "warning";

interface Entry {
  id: string;
  uid: string;
  playerName: string;
  playerAvatar?: string;
  riotGameName?: string;
  riotTagLine?: string;
  type: ShameType;
  reason: string;
  tomatoCount: number;
  bailCount: number;
  createdAt: string;
}

interface Props {
  tournamentId: string;
  user: User | null;
  onRequireLogin?: () => void;
}

const INLINE_STYLES = `
  @keyframes wos-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.6); }
    50%      { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
  }
  @keyframes wos-btn-in {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes wos-modal-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes wos-card-in {
    from { opacity: 0; transform: translateY(18px) rotate(var(--wos-rot, 0deg)); }
    to   { opacity: 1; transform: translateY(0) rotate(var(--wos-rot, 0deg)); }
  }
  @keyframes wos-tomato-splat {
    0%   { transform: scale(0) rotate(0deg); opacity: 0; }
    30%  { transform: scale(1.4) rotate(60deg); opacity: 1; }
    70%  { transform: scale(1.1) rotate(120deg); opacity: 0.85; }
    100% { transform: scale(0.6) rotate(180deg); opacity: 0; }
  }
  @keyframes wos-bail-halo {
    0%   { transform: scale(0); opacity: 0.9; }
    100% { transform: scale(2.6); opacity: 0; }
  }
  @keyframes wos-count-bump {
    0%   { transform: scale(1); color: inherit; }
    40%  { transform: scale(1.35); }
    100% { transform: scale(1); color: inherit; }
  }
  @keyframes wos-card-shake {
    0%, 100% { transform: translateX(0) rotate(var(--wos-rot, 0deg)); }
    20%      { transform: translateX(-3px) rotate(calc(var(--wos-rot, 0deg) - 1deg)); }
    40%      { transform: translateX(3px)  rotate(calc(var(--wos-rot, 0deg) + 1deg)); }
    60%      { transform: translateX(-2px) rotate(calc(var(--wos-rot, 0deg) - 0.5deg)); }
    80%      { transform: translateX(2px)  rotate(var(--wos-rot, 0deg)); }
  }
`;

function initials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map(p => p[0] || "").join("").toUpperCase() || name[0].toUpperCase();
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

export default function WallOfShame({ tournamentId, user, onRequireLogin }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loginPrompt, setLoginPrompt] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // If the user signs in after being prompted, close the prompt automatically.
  useEffect(() => { if (user) setLoginPrompt(false); }, [user]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [myVotes, setMyVotes] = useState<Record<string, Kind>>({});
  const [loading, setLoading] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [shakeId, setShakeId] = useState<string | null>(null);
  const [splatKey, setSplatKey] = useState<Record<string, number>>({});
  const [bumpKey, setBumpKey] = useState<Record<string, number>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    try {
      const headers: HeadersInit = {};
      if (user) {
        const token = await user.getIdToken();
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`/api/valorant/wall-of-shame?tournamentId=${encodeURIComponent(tournamentId)}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setMyVotes(data.myVotes || {});
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, user]);

  useEffect(() => { if (open) load(); }, [open, load]);

  // Lock page scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const { wanted, warning, wantedTomato, warningTomato } = useMemo(() => {
    const w: Entry[] = [];
    const a: Entry[] = [];
    let wt = 0, at = 0;
    for (const e of entries) {
      if (e.type === "wanted") { w.push(e); wt += e.tomatoCount || 0; }
      else if (e.type === "warning") { a.push(e); at += e.tomatoCount || 0; }
    }
    w.sort((x, y) => (y.tomatoCount || 0) - (x.tomatoCount || 0));
    a.sort((x, y) => (y.tomatoCount || 0) - (x.tomatoCount || 0));
    return { wanted: w, warning: a, wantedTomato: wt, warningTomato: at };
  }, [entries]);

  const totalWanted = wanted.length;
  const totalWarning = warning.length;

  const vote = async (entry: Entry, kind: Kind) => {
    if (!user) {
      setLoginPrompt(true);
      return;
    }
    if (myVotes[entry.id]) return; // already voted — locked
    if (votingId) return;
    setVotingId(entry.id);
    setErrorMsg(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/valorant/wall-of-shame/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tournamentId, entryId: entry.id, kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Vote failed");
      setEntries(prev => prev.map(e => e.id === entry.id
        ? { ...e, tomatoCount: data.tomatoCount, bailCount: data.bailCount }
        : e));
      setMyVotes(prev => ({ ...prev, [entry.id]: kind }));
      const animKey = `${entry.id}:${kind}`;
      setSplatKey(prev => ({ ...prev, [animKey]: Date.now() }));
      setBumpKey(prev => ({ ...prev, [animKey]: Date.now() }));
      setShakeId(entry.id);
      setTimeout(() => setShakeId(null), 500);
    } catch (e: any) {
      const msg = e?.message || "Vote failed";
      setErrorMsg(msg);
      if (/already voted/i.test(msg)) {
        // Server says we already voted but client state disagreed — refresh.
        load();
      }
      setTimeout(() => setErrorMsg(null), 3000);
    } finally {
      setVotingId(null);
    }
  };

  return (
    <>
      <style>{INLINE_STYLES}</style>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="View the Wall of Shame"
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 20px",
          borderRadius: 100,
          border: "1px solid rgba(239,68,68,0.45)",
          background: "linear-gradient(135deg, rgba(127,29,29,0.85) 0%, rgba(185,28,28,0.65) 55%, rgba(239,68,68,0.4) 100%)",
          color: "#fee2e2",
          fontFamily: "inherit",
          fontSize: "0.86rem",
          fontWeight: 800,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          cursor: "pointer",
          boxShadow: "0 4px 20px rgba(239,68,68,0.25), inset 0 1px 0 rgba(255,255,255,0.12)",
          transition: "transform 0.15s, box-shadow 0.15s, filter 0.15s",
          animation: "wos-btn-in 0.5s cubic-bezier(0.16,1,0.3,1), wos-pulse 2.6s ease-in-out infinite",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = "translateY(-1px) scale(1.02)";
          e.currentTarget.style.filter = "brightness(1.12)";
          e.currentTarget.style.boxShadow = "0 6px 26px rgba(239,68,68,0.4), inset 0 1px 0 rgba(255,255,255,0.2)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = "translateY(0) scale(1)";
          e.currentTarget.style.filter = "brightness(1)";
          e.currentTarget.style.boxShadow = "0 4px 20px rgba(239,68,68,0.25), inset 0 1px 0 rgba(255,255,255,0.12)";
        }}
      >
        <Skull size={16} strokeWidth={2.4} />
        <span>Wall of Shame</span>
      </button>

      {open && mounted && createPortal((
        <div
          role="dialog"
          aria-modal="true"
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "radial-gradient(ellipse at center, rgba(20,10,10,0.92) 0%, rgba(0,0,0,0.97) 70%)",
            backdropFilter: "blur(6px)",
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            overflowY: "auto",
            padding: "40px 16px 60px",
            animation: "wos-modal-in 0.25s ease-out",
          }}
        >
          <div style={{ width: "100%", maxWidth: 1180 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
              <div>
                <div style={{
                  fontFamily: "'Georgia', 'Times New Roman', serif",
                  fontSize: "clamp(2.2rem, 5vw, 3.6rem)",
                  fontWeight: 900,
                  color: "#f1f5f9",
                  letterSpacing: "0.02em",
                  textShadow: "0 0 24px rgba(239,68,68,0.25), 0 2px 8px rgba(0,0,0,0.6)",
                  textTransform: "uppercase",
                  lineHeight: 1,
                }}>
                  The Graveyard
                </div>
                <div style={{ marginTop: 10, color: "rgba(226,232,240,0.55)", fontSize: "0.92rem", letterSpacing: "0.05em" }}>
                  Where outlaws rest. Vote anonymously — one shot per entry.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{
                  width: 40, height: 40, borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)", color: "#e2e8f0",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", transition: "all 0.15s", flexShrink: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.18)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.4)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
              >
                <X size={18} />
              </button>
            </div>

            {loading && (
              <div style={{ textAlign: "center", color: "rgba(226,232,240,0.55)", padding: "60px 0", fontSize: "0.92rem" }}>
                Exhuming records…
              </div>
            )}

            {!loading && entries.length === 0 && (
              <div style={{
                textAlign: "center", color: "rgba(226,232,240,0.55)",
                padding: "80px 20px", fontSize: "0.92rem",
                border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 12,
              }}>
                No convicts yet. A quiet tournament — suspiciously so.
              </div>
            )}

            {!loading && entries.length > 0 && (
              <>
                {/* WANTED */}
                <SectionHeader
                  title="Wanted"
                  subtitle="No Show"
                  accent="#ef4444"
                  count={totalWanted}
                  tomatoes={wantedTomato}
                />
                {wanted.length === 0 ? (
                  <EmptyRow text="No no-shows. Yet." accent="#ef4444" />
                ) : (
                  <div style={gridStyle}>
                    {wanted.map((e, i) => (
                      <PosterCard
                        key={e.id}
                        entry={e}
                        variant="wanted"
                        tilt={(i % 2 === 0 ? -1.2 : 1.2) + (i * 0.2 % 1)}
                        myVote={myVotes[e.id]}
                        shake={shakeId === e.id}
                        voting={votingId === e.id}
                        splatStamp={splatKey[`${e.id}:tomato`]}
                        bailStamp={splatKey[`${e.id}:bail`]}
                        tomatoBumpStamp={bumpKey[`${e.id}:tomato`]}
                        bailBumpStamp={bumpKey[`${e.id}:bail`]}
                        onTomato={() => vote(e, "tomato")}
                        onBail={() => vote(e, "bail")}
                      />
                    ))}
                  </div>
                )}

                {/* WARNING */}
                <div style={{ marginTop: 56 }}>
                  <SectionHeader
                    title="Warning"
                    subtitle="Late to the Party"
                    accent="#f59e0b"
                    count={totalWarning}
                    tomatoes={warningTomato}
                  />
                  {warning.length === 0 ? (
                    <EmptyRow text="Nobody's been late. Punctual bunch." accent="#f59e0b" />
                  ) : (
                    <div style={gridStyle}>
                      {warning.map((e, i) => (
                        <PosterCard
                          key={e.id}
                          entry={e}
                          variant="warning"
                          tilt={(i % 2 === 0 ? 1.2 : -1.2) + (i * 0.2 % 1)}
                          myVote={myVotes[e.id]}
                          shake={shakeId === e.id}
                          voting={votingId === e.id}
                          splatStamp={splatKey[`${e.id}:tomato`]}
                          bailStamp={splatKey[`${e.id}:bail`]}
                          tomatoBumpStamp={bumpKey[`${e.id}:tomato`]}
                          bailBumpStamp={bumpKey[`${e.id}:bail`]}
                          onTomato={() => vote(e, "tomato")}
                          onBail={() => vote(e, "bail")}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {errorMsg && (
              <div style={{
                position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
                background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)",
                color: "#fecaca", padding: "10px 18px", borderRadius: 100,
                fontSize: "0.84rem", fontWeight: 700, backdropFilter: "blur(6px)",
                zIndex: 220,
              }}>
                {errorMsg}
              </div>
            )}

            {loginPrompt && !user && (
              <div
                onClick={e => { if (e.target === e.currentTarget) setLoginPrompt(false); }}
                style={{
                  position: "fixed", inset: 0, zIndex: 230,
                  background: "rgba(0,0,0,0.8)", backdropFilter: "blur(5px)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: 16,
                  animation: "wos-modal-in 0.2s ease-out",
                }}
              >
                <div style={{
                  background: "#0e0e0e", border: "1px solid #1a1a1a", borderRadius: 16,
                  padding: 28, width: "100%", maxWidth: 380, position: "relative", textAlign: "center",
                }}>
                  <button
                    onClick={() => setLoginPrompt(false)}
                    aria-label="Close"
                    style={{
                      position: "absolute", top: 14, right: 14,
                      background: "transparent", border: "none", color: "#444",
                      fontSize: 18, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >✕</button>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🍅</div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 6 }}>
                    Sign in to cast your vote
                  </h3>
                  <p style={{ fontSize: 12, color: "#888", marginBottom: 20, lineHeight: 1.5 }}>
                    One vote per account, anonymously tallied. We won&apos;t show who voted — just the counters.
                  </p>
                  <button
                    onClick={() => {
                      try { localStorage.setItem("pendingRegistration", window.location.pathname); } catch {}
                      window.location.href = "/api/auth/discord-login";
                    }}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                      padding: "13px 20px", width: "100%",
                      background: "rgba(88,101,242,0.15)", color: "#818cf8",
                      border: "1px solid rgba(88,101,242,0.35)", borderRadius: 10,
                      fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#818cf8">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.12-.098.246-.198.373-.292a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419s.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419s.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                    </svg>
                    Sign in with Discord
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ), document.body)}
    </>
  );
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
  gap: 22,
  padding: "8px 4px 4px",
};

function SectionHeader({ title, subtitle, accent, count, tomatoes }: {
  title: string; subtitle: string; accent: string; count: number; tomatoes: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
      <div style={{
        width: 12, height: 12, borderRadius: 3, background: accent,
        boxShadow: `0 0 12px ${accent}`, flexShrink: 0,
      }} />
      <div style={{
        fontFamily: "'Georgia', serif", fontSize: "1.6rem", fontWeight: 900,
        color: accent, textTransform: "uppercase", letterSpacing: "0.15em",
      }}>
        {title}
      </div>
      <div style={{ color: "rgba(226,232,240,0.45)", fontSize: "0.86rem", letterSpacing: "0.05em", fontStyle: "italic" }}>
        {subtitle}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.76rem", color: "rgba(226,232,240,0.5)" }}>
        <span>{count} {count === 1 ? "convict" : "convicts"}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>🍅 {tomatoes}</span>
      </div>
    </div>
  );
}

function EmptyRow({ text, accent }: { text: string; accent: string }) {
  return (
    <div style={{
      padding: "36px 20px", textAlign: "center",
      border: `1px dashed ${accent}22`, borderRadius: 10,
      color: "rgba(226,232,240,0.45)", fontSize: "0.88rem", fontStyle: "italic",
    }}>
      {text}
    </div>
  );
}

interface PosterProps {
  entry: Entry;
  variant: "wanted" | "warning";
  tilt: number;
  myVote?: Kind;
  shake: boolean;
  voting: boolean;
  splatStamp?: number;
  bailStamp?: number;
  tomatoBumpStamp?: number;
  bailBumpStamp?: number;
  onTomato: () => void;
  onBail: () => void;
}

function PosterCard({
  entry, variant, tilt,
  myVote, shake, voting,
  splatStamp, bailStamp, tomatoBumpStamp, bailBumpStamp,
  onTomato, onBail,
}: PosterProps) {
  const isWanted = variant === "wanted";
  const paper = isWanted
    ? "linear-gradient(180deg, #e7d2a5 0%, #d4b77d 100%)"
    : "linear-gradient(180deg, #fde9a9 0%, #f2cc66 100%)";
  const edge = isWanted ? "rgba(67,38,12,0.55)" : "rgba(92,60,10,0.55)";
  const inkDark = isWanted ? "#3b1d0a" : "#4a2d06";
  const inkMid = isWanted ? "#6b3819" : "#7a4b10";
  const accent = isWanted ? "#ef4444" : "#f59e0b";

  const votedTomato = myVote === "tomato";
  const votedBail = myVote === "bail";
  const voted = !!myVote;

  const shakeStyle = shake ? "wos-card-shake 0.45s ease-in-out" : "";
  const cardAnim = `wos-card-in 0.55s cubic-bezier(0.16,1,0.3,1) both${shakeStyle ? `, ${shakeStyle}` : ""}`;

  return (
    <div style={{
      position: "relative",
      paddingTop: 14,
      ["--wos-rot" as any]: `${tilt}deg`,
    }}>
      {/* Pushpin */}
      <div style={{
        position: "absolute", top: 2, left: "50%", transform: "translateX(-50%)",
        width: 14, height: 14, borderRadius: "50%",
        background: "radial-gradient(circle at 35% 35%, #94a3b8, #475569)",
        boxShadow: "0 2px 4px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.3)",
        zIndex: 2,
      }} />
      <div style={{
        position: "relative",
        background: paper,
        border: `2px solid ${edge}`,
        borderRadius: 4,
        padding: "14px 13px 12px",
        boxShadow: "0 6px 22px rgba(0,0,0,0.55), 0 2px 4px rgba(0,0,0,0.4)",
        animation: cardAnim,
        transform: `rotate(${tilt}deg)`,
        transformOrigin: "top center",
        color: inkDark,
        fontFamily: "'Georgia', 'Times New Roman', serif",
        overflow: "hidden",
      }}>
        {/* Texture overlay */}
        <div aria-hidden="true" style={{
          position: "absolute", inset: 0,
          backgroundImage: "radial-gradient(rgba(67,38,12,0.08) 1px, transparent 1px)",
          backgroundSize: "3px 3px",
          pointerEvents: "none", mixBlendMode: "multiply",
        }} />

        <div style={{
          textAlign: "center", fontWeight: 900, fontSize: "1.3rem",
          letterSpacing: "0.12em", color: inkDark, position: "relative",
        }}>
          {isWanted ? "WANTED" : "WARNING"}
        </div>
        <div style={{
          textAlign: "center", fontSize: "0.56rem", letterSpacing: "0.35em",
          color: inkMid, marginTop: 1, textTransform: "uppercase", fontWeight: 700,
          position: "relative",
        }}>
          {isWanted ? "No Show" : "Late to the Party"}
        </div>

        {/* Avatar */}
        <div style={{
          marginTop: 10, display: "flex", justifyContent: "center", position: "relative",
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: 4,
            border: `2px solid ${edge}`,
            background: entry.playerAvatar ? `url(${entry.playerAvatar}) center/cover` : "rgba(67,38,12,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden", position: "relative",
            fontFamily: "'Georgia', serif", fontSize: "1.5rem", fontWeight: 900, color: inkDark,
            filter: isWanted ? "sepia(0.2) contrast(1.05)" : "contrast(1.02)",
          }}>
            {!entry.playerAvatar && initials(entry.playerName)}
          </div>
        </div>

        <div style={{
          marginTop: 8, textAlign: "center", fontSize: "0.98rem",
          fontWeight: 700, color: inkDark, position: "relative",
        }}>
          {entry.playerName}
        </div>
        {(entry.riotGameName || entry.riotTagLine) && (
          <div style={{
            textAlign: "center", fontSize: "0.64rem", color: inkMid,
            marginTop: 1, position: "relative",
          }}>
            {entry.riotGameName}{entry.riotTagLine ? `#${entry.riotTagLine}` : ""}
          </div>
        )}

        <div style={{
          margin: "9px 0 7px", height: 1, background: edge, opacity: 0.35,
          position: "relative",
        }} />

        <div style={{
          fontSize: "0.56rem", fontWeight: 900, letterSpacing: "0.14em",
          color: inkMid, textAlign: "center", textTransform: "uppercase",
          position: "relative",
        }}>
          Crime Against the Community
        </div>
        <div style={{
          marginTop: 4, fontStyle: "italic", textAlign: "center",
          fontSize: "0.74rem", lineHeight: 1.35, color: inkDark,
          position: "relative", minHeight: 36,
        }}>
          &ldquo;{entry.reason}&rdquo;
        </div>

        <div style={{
          marginTop: 10, border: `1px solid ${edge}`, borderRadius: 3,
          padding: "6px 8px", background: "rgba(67,38,12,0.05)",
          display: "flex", justifyContent: "space-around", alignItems: "center",
          position: "relative",
        }}>
          <CountBlock
            icon="🍅"
            label="Tomatoes"
            count={entry.tomatoCount || 0}
            inkDark={inkDark}
            inkMid={inkMid}
            bumpStamp={tomatoBumpStamp}
          />
          <div style={{ width: 1, height: 26, background: edge, opacity: 0.4 }} />
          <CountBlock
            icon="🛡️"
            label="Bail Me Out"
            count={entry.bailCount || 0}
            inkDark={inkDark}
            inkMid={inkMid}
            bumpStamp={bailBumpStamp}
          />
        </div>

        <div style={{
          marginTop: 7, fontSize: "0.54rem", color: inkMid, textAlign: "center",
          position: "relative",
        }}>
          Posted: {formatDate(entry.createdAt)}
        </div>

        <div style={{ marginTop: 9, display: "flex", gap: 6, position: "relative" }}>
          <ActionButton
            label={votedTomato ? "Thrown" : "Throw Tomato"}
            emoji="🍅"
            disabled={voted || voting}
            active={votedTomato}
            accent="#b91c1c"
            onClick={onTomato}
          />
          <ActionButton
            label={votedBail ? "Bailed" : "Bail Out"}
            emoji="🛡️"
            disabled={voted || voting}
            active={votedBail}
            accent="#0369a1"
            onClick={onBail}
          />
        </div>

        {/* Splat / halo overlays */}
        {splatStamp && (
          <div key={`splat-${splatStamp}`} aria-hidden="true" style={{
            position: "absolute", top: "40%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: 140, height: 140, pointerEvents: "none",
            background: "radial-gradient(circle, rgba(220,38,38,0.85) 0%, rgba(220,38,38,0.35) 40%, transparent 70%)",
            borderRadius: "50%", zIndex: 4,
            animation: "wos-tomato-splat 0.6s ease-out forwards",
          }} />
        )}
        {bailStamp && (
          <div key={`halo-${bailStamp}`} aria-hidden="true" style={{
            position: "absolute", top: "40%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: 120, height: 120, pointerEvents: "none",
            border: "4px solid rgba(59,130,246,0.6)",
            borderRadius: "50%", zIndex: 4,
            boxShadow: "0 0 30px rgba(59,130,246,0.6)",
            animation: "wos-bail-halo 0.7s ease-out forwards",
          }} />
        )}

        {voted && (
          <div style={{
            position: "absolute", top: 10, right: 10,
            fontSize: "0.58rem", fontWeight: 900, letterSpacing: "0.2em",
            padding: "3px 8px", borderRadius: 2,
            background: accent, color: "#fff", textTransform: "uppercase",
            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
            transform: "rotate(8deg)",
            zIndex: 3,
          }}>
            Vote Cast
          </div>
        )}
      </div>
    </div>
  );
}

function CountBlock({ icon, label, count, inkDark, inkMid, bumpStamp }: {
  icon: string; label: string; count: number; inkDark: string; inkMid: string; bumpStamp?: number;
}) {
  return (
    <div style={{ textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: "0.48rem", letterSpacing: "0.14em", color: inkMid, textTransform: "uppercase", fontWeight: 700 }}>
        {label}
      </div>
      <div
        key={bumpStamp || 0}
        style={{
          marginTop: 1, fontSize: "1rem", fontWeight: 900, color: inkDark,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
          animation: bumpStamp ? "wos-count-bump 0.45s ease-out" : "none",
        }}
      >
        <span style={{ fontSize: "0.8rem" }}>{icon}</span>
        {count}
      </div>
    </div>
  );
}

function ActionButton({ label, emoji, disabled, active, accent, onClick }: {
  label: string; emoji: string; disabled: boolean; active: boolean; accent: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        padding: "6px 8px",
        borderRadius: 3,
        border: `1px solid ${active ? accent : "rgba(67,38,12,0.5)"}`,
        background: active
          ? `linear-gradient(180deg, ${accent} 0%, ${accent}dd 100%)`
          : "rgba(67,38,12,0.08)",
        color: active ? "#fff" : "#3b1d0a",
        fontFamily: "inherit",
        fontSize: "0.66rem",
        fontWeight: 800,
        letterSpacing: "0.03em",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled && !active ? 0.6 : 1,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
        transition: "transform 0.1s, filter 0.1s, box-shadow 0.1s",
      }}
      onMouseEnter={e => {
        if (disabled) return;
        e.currentTarget.style.filter = "brightness(1.08)";
        e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.25)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.filter = "brightness(1)";
        e.currentTarget.style.boxShadow = "none";
      }}
      onMouseDown={e => { if (!disabled) e.currentTarget.style.transform = "translateY(1px)"; }}
      onMouseUp={e => { e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <span>{emoji}</span>
      <span>{label}</span>
    </button>
  );
}
