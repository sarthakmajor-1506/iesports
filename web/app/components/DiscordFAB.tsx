"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { navigateWithAppPriority } from "@/app/lib/mobileAuth";

export default function DiscordFAB() {
  const { user } = useAuth();
  const [discordLinked, setDiscordLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) {
        setDiscordLinked(!!snap.data().discordId);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  // Expand/collapse animation cycle for non-logged-in users
  useEffect(() => {
    if (user) return;
    const interval = setInterval(() => {
      setExpanded(prev => !prev);
    }, 3000);
    return () => clearInterval(interval);
  }, [user]);

  if (loading || discordLinked) return null;

  const handleClick = () => {
    if (user) {
      navigateWithAppPriority(`/api/auth/discord?uid=${user.uid}`);
    } else {
      window.open("/api/auth/discord-login", "_blank");
    }
  };

  // Logged-in user: simple Discord icon FAB
  if (user) {
    return (
      <button
        onClick={handleClick}
        title="Connect Discord"
        style={{ position: "fixed", bottom: 28, right: 28, zIndex: 999, width: 52, height: 52, borderRadius: "50%", background: "#5865F2", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(88,101,242,0.5)", cursor: "pointer", border: "none", transition: "transform 0.15s" }}
        onMouseEnter={e => e.currentTarget.style.transform = "scale(1.1)"}
        onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="white">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.08.114 18.1.132 18.114a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>
      </button>
    );
  }

  // Not logged in: animated expanding/collapsing pill FAB
  return (
    <>
      <style>{`
        @keyframes ie-fab-glow {
          0%, 100% { box-shadow: 0 8px 24px rgba(88,101,242,0.5), 0 0 0 0 rgba(88,101,242,0); }
          50% { box-shadow: 0 8px 24px rgba(88,101,242,0.5), 0 0 0 8px rgba(88,101,242,0.15); }
        }
      `}</style>
      <button
        onClick={handleClick}
        title="Join us now to register!"
        style={{
          position: "fixed", bottom: 28, right: 28, zIndex: 999,
          height: 52, borderRadius: 100,
          background: "#5865F2",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          cursor: "pointer", border: "none",
          padding: expanded ? "0 20px 0 16px" : "0 13px",
          width: expanded ? "auto" : 52,
          minWidth: 52,
          overflow: "hidden",
          transition: "all 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          animation: "ie-fab-glow 2.5s ease-in-out infinite",
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white" style={{ flexShrink: 0 }}>
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.08.114 18.1.132 18.114a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
        </svg>
        <span style={{
          color: "#fff", fontWeight: 800, fontSize: "0.82rem", whiteSpace: "nowrap",
          opacity: expanded ? 1 : 0,
          maxWidth: expanded ? 200 : 0,
          transition: "opacity 0.4s ease, max-width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          overflow: "hidden",
        }}>
          Join us now!
        </span>
      </button>
    </>
  );
}