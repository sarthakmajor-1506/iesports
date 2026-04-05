"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { User } from "firebase/auth";

interface Comment {
  id: string;
  uid: string;
  displayName: string;
  avatar?: string;
  text: string;
  createdAt: string | null;
}

interface CommentSectionProps {
  tournamentId: string;
  section: "standings" | "leaderboard";
  game?: "valorant" | "dota2";
  user: User | null;
  riotData?: any;
  userProfile?: any;
  dotaProfile?: any;
}

const EMOJI_BAR = ["🔥","💪","👏","😂","💀","🏆","⚡","🎯","👀","🫡","💯","🤯","😎","❤️","👍","👎","🤡","😭","🙌","✨","💥","🎮","⚔️","😤","🥳","GG"];

const timeAgo = (iso: string | null): string => {
  if (!iso) return "";
  const date = new Date(iso);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
};

export default function CommentSection({ tournamentId, section, game = "valorant", user, riotData, userProfile, dotaProfile }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/comments?tournamentId=${tournamentId}&section=${section}&game=${game}`);
      const data = await res.json();
      if (data.comments) setComments(data.comments);
    } catch (e) { console.error("Failed to fetch comments:", e); }
  }, [tournamentId, section, game]);

  useEffect(() => {
    fetchComments();
    const interval = setInterval(fetchComments, 10000);
    return () => clearInterval(interval);
  }, [fetchComments]);

  const getDisplayInfo = () => {
    if (riotData?.riotGameName) return { name: `${riotData.riotGameName}#${riotData.riotTagLine}`, avatar: riotData.riotAvatar || null };
    if (userProfile?.discordUsername) return { name: userProfile.discordUsername, avatar: null };
    if (userProfile?.fullName) return { name: userProfile.fullName, avatar: null };
    return { name: "Player", avatar: null };
  };

  const handleSend = async () => {
    if (!text.trim() || !user || sending) return;
    const commentText = text.trim();
    const info = getDisplayInfo();
    setSending(true);
    setText("");
    setShowEmoji(false);

    const tempId = `temp-${Date.now()}`;
    const optimistic: Comment = { id: tempId, uid: user.uid, displayName: info.name, avatar: info.avatar || undefined, text: commentText, createdAt: new Date().toISOString() };
    setComments(prev => [optimistic, ...prev]);

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ tournamentId, section, game, text: commentText, displayName: info.name, avatar: info.avatar }),
      });
      const data = await res.json();
      setComments(prev => prev.map(c => c.id === tempId ? { ...c, id: data.id || tempId } : c));
    } catch (e) {
      console.error("Failed to send comment:", e);
      setComments(prev => prev.filter(c => c.id !== tempId));
    }
    finally { setSending(false); }
  };

  const handleDelete = async (commentId: string) => {
    if (!user || deletingId) return;
    setDeletingId(commentId);
    const removed = comments.find(c => c.id === commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
    try {
      const token = await user.getIdToken();
      await fetch("/api/comments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ tournamentId, commentId, game }),
      });
    } catch (e) {
      console.error("Failed to delete comment:", e);
      if (removed) setComments(prev => [removed, ...prev]);
    }
    finally { setDeletingId(null); }
  };

  const insertEmoji = (emoji: string) => {
    setText(prev => prev + emoji);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const accent = game === "dota2" ? "#3B82F6" : "#3CCBFF";

  return (
    <>
      <style>{`
        @keyframes cs-slide-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cs-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cs-pulse-send { 0% { transform: scale(1); } 50% { transform: scale(0.92); } 100% { transform: scale(1); } }
        .cs-card .cs-delete { opacity: 0; transition: opacity 0.15s; }
        .cs-card:hover .cs-delete { opacity: 1; }
        .cs-emoji-btn { transition: transform 0.1s; cursor: pointer; user-select: none; }
        .cs-emoji-btn:hover { transform: scale(1.3); }
        .cs-emoji-btn:active { transform: scale(0.9); animation: cs-pulse-send 0.2s; }
        .cs-scrollbar::-webkit-scrollbar { width: 4px; }
        .cs-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .cs-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
        .cs-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
        .cs-input-bar:focus-within { border-color: ${accent}66 !important; box-shadow: 0 0 20px ${accent}14 !important; }
      `}</style>

      <div style={{
        marginTop: 24,
        borderRadius: 16,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16 }}>🗯️</span>
            <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "rgba(255,255,255,0.7)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Sledge</span>
            {comments.length > 0 && (
              <span style={{
                fontSize: "0.65rem", fontWeight: 700, color: `${accent}cc`,
                background: `${accent}1a`, border: `1px solid ${accent}33`,
                borderRadius: 100, padding: "1px 8px", lineHeight: "1.5",
              }}>{comments.length}</span>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          {user ? (
            <>
              <div className="cs-input-bar" style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 100, padding: "6px 6px 6px 14px",
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}>
                {(() => {
                  const info = getDisplayInfo();
                  return info.avatar ? (
                    <img src={info.avatar} alt="" style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, background: `linear-gradient(135deg, ${accent}, ${accent}88)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 800, color: "#fff" }}>
                      {(info.name || "P")[0].toUpperCase()}
                    </div>
                  );
                })()}
                <input
                  ref={inputRef}
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Drop your take..."
                  maxLength={300}
                  style={{
                    flex: 1, background: "none", border: "none", outline: "none",
                    color: "#F0EEEA", fontSize: "0.84rem", fontFamily: "inherit",
                    padding: "4px 0",
                  }}
                />
                <button
                  onClick={() => setShowEmoji(!showEmoji)}
                  style={{
                    background: showEmoji ? `${accent}26` : "rgba(255,255,255,0.05)",
                    border: showEmoji ? `1px solid ${accent}4d` : "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "50%", width: 32, height: 32, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.9rem", transition: "all 0.15s", flexShrink: 0,
                  }}
                >😊</button>
                <button
                  onClick={handleSend}
                  disabled={!text.trim() || sending}
                  style={{
                    background: text.trim() ? `linear-gradient(135deg, ${accent}, ${accent}bb)` : "rgba(255,255,255,0.06)",
                    border: "none", borderRadius: "50%", width: 32, height: 32, cursor: text.trim() ? "pointer" : "default",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.2s", flexShrink: 0,
                    opacity: sending ? 0.5 : 1,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
              {showEmoji && (
                <div style={{
                  display: "flex", flexWrap: "wrap", gap: 4, marginTop: 10, padding: "8px 4px",
                  background: "rgba(255,255,255,0.03)", borderRadius: 12,
                  animation: "cs-fade-in 0.15s ease",
                }}>
                  {EMOJI_BAR.map(e => (
                    <span
                      key={e}
                      className="cs-emoji-btn"
                      onClick={() => insertEmoji(e)}
                      style={{
                        fontSize: e.length > 2 ? "0.7rem" : "1.1rem",
                        padding: e.length > 2 ? "4px 8px" : "4px 5px",
                        borderRadius: 8,
                        background: e.length > 2 ? `${accent}1a` : "transparent",
                        fontWeight: e.length > 2 ? 800 : 400,
                        color: e.length > 2 ? accent : "inherit",
                        lineHeight: 1,
                      }}
                    >{e}</span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{
              textAlign: "center", padding: "10px 0",
              fontSize: "0.82rem", color: "rgba(255,255,255,0.35)",
            }}>
              <span style={{ color: `${accent}b3`, fontWeight: 700, cursor: "pointer" }}
                onClick={() => window.location.href = "/"}
              >Log in</span> to drop a sledge
            </div>
          )}
        </div>

        {/* Comments List */}
        <div ref={listRef} className="cs-scrollbar" style={{
          maxHeight: 380, overflowY: "auto", padding: comments.length > 0 ? "8px 8px" : "0",
        }}>
          {comments.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "36px 20px",
              color: "rgba(255,255,255,0.2)", fontSize: "0.84rem",
            }}>
              <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.5 }}>🗯️</div>
              No sledges yet. Be the first!
            </div>
          ) : (
            comments.map((c, i) => {
              const isOwn = user?.uid === c.uid;
              const isDeleting = deletingId === c.id;
              return (
                <div
                  key={c.id}
                  className="cs-card"
                  style={{
                    display: "flex", gap: 10, padding: "10px 12px",
                    borderRadius: 12,
                    marginBottom: 4,
                    animation: `cs-slide-in 0.3s ease ${Math.min(i * 0.03, 0.3)}s both`,
                    opacity: isDeleting ? 0.4 : 1,
                    transition: "opacity 0.2s",
                  }}
                >
                  {/* Avatar */}
                  {c.avatar ? (
                    <img src={c.avatar} alt="" style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, objectFit: "cover", marginTop: 2, border: `2px solid ${isOwn ? accent + "44" : "rgba(255,255,255,0.06)"}` }} />
                  ) : (
                    <div style={{
                      width: 30, height: 30, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                      background: `linear-gradient(135deg, hsl(${(c.uid || "").charCodeAt(0) * 37 % 360}, 60%, 45%), hsl(${(c.uid || "").charCodeAt(1) * 37 % 360}, 50%, 35%))`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.65rem", fontWeight: 800, color: "#fff",
                      border: `2px solid ${isOwn ? accent + "44" : "rgba(255,255,255,0.06)"}`,
                    }}>
                      {(c.displayName || "P")[0].toUpperCase()}
                    </div>
                  )}
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: "0.74rem", fontWeight: 700, color: isOwn ? accent : "rgba(255,255,255,0.6)" }}>
                        {c.displayName}
                      </span>
                      {isOwn && (
                        <span style={{ fontSize: "0.52rem", fontWeight: 700, color: `${accent}80`, background: `${accent}14`, borderRadius: 100, padding: "1px 6px", lineHeight: "1.5" }}>you</span>
                      )}
                      <span style={{ fontSize: "0.62rem", color: "rgba(255,255,255,0.18)" }}>{timeAgo(c.createdAt)}</span>
                    </div>
                    <div style={{
                      display: "inline-block",
                      fontSize: "0.82rem", color: isOwn ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.65)", lineHeight: 1.5,
                      wordBreak: "break-word",
                      background: isOwn ? `${accent}12` : "rgba(255,255,255,0.04)",
                      border: `1px solid ${isOwn ? accent + "22" : "rgba(255,255,255,0.06)"}`,
                      borderRadius: "2px 12px 12px 12px",
                      padding: "6px 12px",
                      maxWidth: "100%",
                    }}>{c.text}</div>
                  </div>
                  {/* Delete */}
                  {isOwn && (
                    <button
                      className="cs-delete"
                      onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                      style={{
                        background: "none", border: "none", cursor: "pointer", padding: 4,
                        color: "rgba(255,255,255,0.15)", flexShrink: 0, alignSelf: "center",
                        transition: "color 0.15s",
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.color = "#ef4444")}
                      onMouseOut={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.15)")}
                      title="Delete"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
