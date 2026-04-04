"use client";

import { useAuth } from "../context/AuthContext";
import { useState, useEffect, useCallback, useRef } from "react";

type LinkableAccount = {
  type: "steam" | "riot";
  name: string;
  id: string;
  verified: boolean;
};

/**
 * Helper other components can call to force this modal open,
 * e.g. when user clicks "Connect Steam" and we know Discord has that account.
 *
 * Usage:  import { triggerDiscordPrompt } from "./DiscordAccountsPrompt";
 *         triggerDiscordPrompt();
 */
export function triggerDiscordPrompt() {
  window.dispatchEvent(new CustomEvent("show-discord-prompt"));
}

/**
 * Returns true if the user has a Discord-linked account of the given type
 * that isn't yet connected on our app.  Lets callers decide whether to
 * open the manual flow or trigger the Discord prompt instead.
 */
export function hasDiscordAccount(
  discordConnections: { type: string }[],
  accountType: "steam" | "riot",
  alreadyLinked: boolean,
): boolean {
  if (alreadyLinked) return false;
  const discordType = accountType === "steam" ? "steam" : "riotgames";
  return discordConnections.some(c => c.type === discordType);
}

export default function DiscordAccountsPrompt() {
  const { user, discordConnections, steamLinked, riotData, refreshUser } = useAuth();
  const [visible, setVisible] = useState(false);
  const [linkable, setLinkable] = useState<LinkableAccount[]>([]);
  const [linking, setLinking] = useState<string | null>(null);
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const prevUidRef = useRef<string | null>(null);

  const storageKey = user ? `discord_prompt_dismissed_${user.uid}` : "";

  // Build the list of linkable accounts
  const buildLinkable = useCallback(() => {
    if (!user || discordConnections.length === 0) return [];
    const accounts: LinkableAccount[] = [];
    if (!steamLinked) {
      const steam = discordConnections.find(c => c.type === "steam");
      if (steam) accounts.push({ type: "steam", name: steam.name, id: steam.id, verified: steam.verified });
    }
    if (!riotData?.riotLinked) {
      const riot = discordConnections.find(c => c.type === "riotgames");
      if (riot) accounts.push({ type: "riot", name: riot.name, id: riot.id, verified: riot.verified });
    }
    return accounts;
  }, [user, discordConnections, steamLinked, riotData]);

  // Auto-show on login / when discordConnections first load
  useEffect(() => {
    // Reset state when user changes (new login / account switch)
    if (user?.uid !== prevUidRef.current) {
      prevUidRef.current = user?.uid ?? null;
      setLinked(new Set());
      setErrors({});
      setLinking(null);
    }

    if (!user) { setVisible(false); return; }

    // Check session dismissal (per-user key)
    try {
      if (sessionStorage.getItem(storageKey)) return;
    } catch {}

    const accounts = buildLinkable();
    if (accounts.length > 0) {
      setLinkable(accounts);
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [user, discordConnections, steamLinked, riotData, storageKey, buildLinkable]);

  // Listen for manual trigger (from Connect Steam/Riot buttons)
  useEffect(() => {
    const handler = () => {
      const accounts = buildLinkable();
      if (accounts.length > 0) {
        setLinkable(accounts);
        setLinked(new Set());
        setErrors({});
        setVisible(true);
        // Clear session dismissal so modal shows
        try { sessionStorage.removeItem(storageKey); } catch {}
      }
    };
    window.addEventListener("show-discord-prompt", handler);
    return () => window.removeEventListener("show-discord-prompt", handler);
  }, [buildLinkable, storageKey]);

  const handleLink = async (acc: LinkableAccount) => {
    if (!user) return;
    setLinking(acc.type);
    setErrors(prev => ({ ...prev, [acc.type]: "" }));
    try {
      const res = await fetch("/api/auth/link-from-discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          type: acc.type,
          platformId: acc.id,
          platformName: acc.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors(prev => ({ ...prev, [acc.type]: data.error || "Failed to link" }));
      } else {
        setLinked(prev => new Set(prev).add(acc.type));
        await refreshUser();
      }
    } catch {
      setErrors(prev => ({ ...prev, [acc.type]: "Network error. Please try again." }));
    } finally {
      setLinking(null);
    }
  };

  const handleDismiss = useCallback(() => {
    setVisible(false);
    try { sessionStorage.setItem(storageKey, "1"); } catch {}
  }, [storageKey]);

  // Auto-close when all accounts are linked
  useEffect(() => {
    if (linkable.length > 0 && linkable.every(a => linked.has(a.type))) {
      const timer = setTimeout(handleDismiss, 1500);
      return () => clearTimeout(timer);
    }
  }, [linked, linkable, handleDismiss]);

  if (!visible || linkable.length === 0) return null;

  const allLinked = linkable.every(a => linked.has(a.type));

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
          zIndex: 9999,
        }}
        onClick={handleDismiss}
      />
      {/* Modal */}
      <div style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 10000,
        background: "linear-gradient(145deg, #1a1a2e, #16162a)",
        border: "1px solid #5865F233",
        borderRadius: 16,
        padding: "28px 24px 24px",
        width: "min(420px, 92vw)",
        boxShadow: "0 20px 60px rgba(88,101,242,0.15), 0 0 0 1px rgba(88,101,242,0.1)",
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg, #5865F2, #4752C4)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width={20} height={20} viewBox="0 0 24 24" fill="#fff">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.08.114 18.1.132 18.114a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#F0EEEA" }}>
                {allLinked ? "All set!" : "Accounts found on Discord"}
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: "#8A8880", marginTop: 2 }}>
                {allLinked
                  ? "Your accounts have been linked successfully."
                  : "We found gaming accounts linked to your Discord. Use them to skip manual setup."}
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            style={{
              background: "none", border: "none", color: "#666", cursor: "pointer",
              fontSize: 20, padding: 4, lineHeight: 1, flexShrink: 0,
            }}
          >x</button>
        </div>

        {/* Account cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {linkable.map(acc => {
            const isLinked = linked.has(acc.type);
            const isLinking = linking === acc.type;
            const error = errors[acc.type];
            const icon = acc.type === "steam" ? "🎮" : "🎯";
            const label = acc.type === "steam" ? "Steam" : "Riot Games";
            const manualPath = acc.type === "steam" ? `/api/auth/steam${user ? `?uid=${user.uid}` : ""}` : "/connect-riot";

            return (
              <div key={acc.type} style={{
                background: isLinked ? "rgba(34,197,94,0.08)" : "rgba(88,101,242,0.06)",
                border: `1px solid ${isLinked ? "rgba(34,197,94,0.25)" : "rgba(88,101,242,0.15)"}`,
                borderRadius: 12,
                padding: "14px 16px",
                transition: "all 0.3s",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 22 }}>{icon}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#F0EEEA" }}>{label}</div>
                      <div style={{
                        fontSize: 11, color: "#8A8880",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {acc.name}
                        {acc.verified && <span style={{ color: "#5865F2", marginLeft: 4 }}>verified</span>}
                      </div>
                    </div>
                  </div>

                  {isLinked ? (
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: "#22c55e",
                      display: "flex", alignItems: "center", gap: 4,
                    }}>
                      Linked
                    </span>
                  ) : (
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => handleLink(acc)}
                        disabled={!!linking}
                        style={{
                          padding: "8px 14px",
                          background: isLinking ? "#333" : "linear-gradient(135deg, #5865F2, #4752C4)",
                          border: "none", borderRadius: 8, color: "#fff",
                          fontWeight: 700, fontSize: 12, cursor: linking ? "wait" : "pointer",
                          opacity: linking && !isLinking ? 0.5 : 1,
                          transition: "all 0.2s",
                        }}
                      >
                        {isLinking ? "Linking..." : "Use this"}
                      </button>
                      <button
                        onClick={() => window.open(manualPath, "_blank")}
                        disabled={!!linking}
                        style={{
                          padding: "8px 10px",
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid #333", borderRadius: 8, color: "#8A8880",
                          fontWeight: 600, fontSize: 11, cursor: "pointer",
                          opacity: linking ? 0.5 : 1,
                          transition: "all 0.2s",
                        }}
                      >
                        Manual
                      </button>
                    </div>
                  )}
                </div>
                {error && (
                  <p style={{ fontSize: 11, color: "#f87171", margin: "8px 0 0" }}>{error}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Skip link */}
        {!allLinked && (
          <button
            onClick={handleDismiss}
            style={{
              display: "block", width: "100%", marginTop: 16,
              background: "none", border: "none", color: "#666",
              fontSize: 12, cursor: "pointer", textAlign: "center",
              padding: 8,
            }}
          >
            I'll do this later
          </button>
        )}
      </div>
    </>
  );
}
