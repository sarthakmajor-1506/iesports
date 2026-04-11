"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

type Report = {
  id: string;
  targetUid: string;
  reporterUid: string;
  reporterName: string;
  type: "rank_too_high" | "rank_too_low";
  comment: string;
  createdAt: string;
};

type Props = {
  playerUid: string;
  playerName: string;
  tournamentId: string;
  game: string;
  user: any;
  userName: string;
  reports: Report[];
  onReportSubmitted: () => void;
  accentColor?: string;
};

export default function RankReportBadge({ playerUid, playerName, tournamentId, game, user, userName, reports, onReportSubmitted }: Props) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const playerReports = reports.filter(r => r.targetUid === playerUid);
  const highCount = playerReports.filter(r => r.type === "rank_too_high").length;
  const lowCount = playerReports.filter(r => r.type === "rank_too_low").length;
  const totalCount = playerReports.length;
  const alreadyReported = user && playerReports.some(r => r.reporterUid === user.uid);
  const isSelf = user?.uid === playerUid;

  const submit = async (type: "rank_too_high" | "rank_too_low") => {
    if (!user || isSelf || alreadyReported) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/rank-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId, game, targetUid: playerUid, targetName: playerName, reporterUid: user.uid, reporterName: userName, type, comment: comment.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setComment("");
      onReportSubmitted();
    } catch (e: any) {
      setError(e.message || "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteReport = async (reportId: string) => {
    if (!user) return;
    try {
      const res = await fetch("/api/rank-reports", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId, game, reportId, uid: user.uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onReportSubmitted();
    } catch (e: any) {
      setError(e.message || "Failed to delete");
    }
  };

  const handleOpen = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const left = Math.min(r.left, window.innerWidth - 296);
      setPopoverPos({ top: r.bottom + 6, left: Math.max(8, left) });
    }
    setOpen(!open);
  };

  const popoverContent = open && mounted ? createPortal(
    <>
      <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,0.3)" }} />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed", top: popoverPos.top, left: popoverPos.left, zIndex: 100000,
          background: "#141414", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12,
          padding: 14, width: 280, boxShadow: "0 12px 48px rgba(0,0,0,0.8)",
          maxHeight: "60vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "#E6E6E6" }}>Rank Reports — {playerName}</span>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>

        {playerReports.length === 0 ? (
          <div style={{ fontSize: "0.68rem", color: "#555550", marginBottom: 10, textAlign: "center", padding: "8px 0" }}>No reports yet</div>
        ) : (
          <div style={{ maxHeight: 160, overflowY: "auto", marginBottom: 10 }}>
            {playerReports.map(r => (
              <div key={r.id} style={{ padding: "6px 8px", background: "rgba(255,255,255,0.03)", borderRadius: 8, marginBottom: 4, fontSize: "0.68rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      fontWeight: 800, fontSize: "0.6rem", padding: "1px 6px", borderRadius: 100,
                      background: r.type === "rank_too_high" ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                      color: r.type === "rank_too_high" ? "#ef4444" : "#22c55e",
                      border: `1px solid ${r.type === "rank_too_high" ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
                    }}>{r.type === "rank_too_high" ? "↑ Too High" : "↓ Too Low"}</span>
                    <span style={{ color: "#8A8880", fontWeight: 600 }}>{r.reporterName}</span>
                  </div>
                  {user && r.reporterUid === user.uid && (
                    <button onClick={() => deleteReport(r.id)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "0.6rem", padding: "2px 4px" }} title="Delete your report">✕</button>
                  )}
                </div>
                {r.comment && <div style={{ color: "#777", marginTop: 3 }}>{r.comment}</div>}
              </div>
            ))}
          </div>
        )}

        {user && !isSelf && !alreadyReported ? (
          <div>
            <input
              type="text"
              placeholder="Optional comment (max 200 chars)"
              value={comment}
              onChange={e => setComment(e.target.value)}
              maxLength={200}
              style={{
                width: "100%", padding: "7px 10px", background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#E6E6E6",
                fontSize: "0.7rem", fontFamily: "inherit", marginBottom: 8, boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => submit("rank_too_high")}
                disabled={submitting}
                style={{
                  flex: 1, padding: "6px 0", background: "rgba(239,68,68,0.1)", color: "#ef4444",
                  border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: "0.68rem",
                  fontWeight: 800, cursor: submitting ? "default" : "pointer", fontFamily: "inherit",
                  opacity: submitting ? 0.5 : 1,
                }}
              >↑ Rank Too High</button>
              <button
                onClick={() => submit("rank_too_low")}
                disabled={submitting}
                style={{
                  flex: 1, padding: "6px 0", background: "rgba(34,197,94,0.1)", color: "#22c55e",
                  border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, fontSize: "0.68rem",
                  fontWeight: 800, cursor: submitting ? "default" : "pointer", fontFamily: "inherit",
                  opacity: submitting ? 0.5 : 1,
                }}
              >↓ Rank Too Low</button>
            </div>
            {error && <div style={{ fontSize: "0.62rem", color: "#ef4444", marginTop: 4 }}>{error}</div>}
          </div>
        ) : isSelf ? (
          <div style={{ fontSize: "0.62rem", color: "#555550", textAlign: "center" }}>Can&apos;t report your own rank</div>
        ) : alreadyReported ? (
          <div style={{ fontSize: "0.62rem", color: "#555550", textAlign: "center" }}>You&apos;ve already reported this player</div>
        ) : (
          <div style={{ fontSize: "0.62rem", color: "#555550", textAlign: "center" }}>Sign in to report</div>
        )}
      </div>
    </>,
    document.body
  ) : null;

  return (
    <span style={{ display: "inline-flex", alignItems: "center" }} onClick={e => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        style={{
          background: totalCount > 0 ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.05)",
          border: `1px solid ${totalCount > 0 ? "rgba(245,158,11,0.3)" : "rgba(255,255,255,0.1)"}`,
          borderRadius: 100, padding: "2px 8px", cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: "0.6rem", fontWeight: 700, color: totalCount > 0 ? "#f59e0b" : "#555550",
          transition: "all 0.15s",
        }}
      >
        {totalCount > 0 ? (
          <>
            {highCount > 0 && <span title="Rank too high">↑{highCount}</span>}
            {lowCount > 0 && <span title="Rank too low">↓{lowCount}</span>}
          </>
        ) : (
          <span>Report</span>
        )}
      </button>
      {popoverContent}
    </span>
  );
}
