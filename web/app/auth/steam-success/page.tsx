"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getFirebaseAuth } from "@/lib/firebase";
import { Suspense } from "react";

function SteamSuccessInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      router.replace("/?error=steam_failed");
      return;
    }
    // Sign in, then redirect. The Dota rank sync is triggered automatically
    // by AuthContext once the user state loads (it watches for
    // steamLinked + dotaRankTier==null and fires /api/dota/sync once per session).
    getFirebaseAuth().then(({ auth, mod }) => mod.signInWithCustomToken(auth, token))
      .then(() => {
        let dest = "/valorant";
        try {
          const pending = localStorage.getItem("pendingRegistration");
          if (pending) { dest = pending + "?register=true"; localStorage.removeItem("pendingRegistration"); }
          else { const saved = sessionStorage.getItem("redirectAfterLogin"); if (saved) { dest = saved; sessionStorage.removeItem("redirectAfterLogin"); } }
        } catch {}
        router.replace(dest);
      })
      .catch((e) => {
        console.error("signInWithCustomToken failed:", e.message);
        router.replace("/?error=steam_failed");
      });
  }, []);

  return (
    <div style={{
      minHeight: "100vh", background: "#0d1117",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 44, height: 44,
          border: "3px solid #1b2838",
          borderTopColor: "#F05A28",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
          margin: "0 auto 16px",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: "#aaa", fontSize: 15, fontFamily: "system-ui, sans-serif", fontWeight: 600 }}>
          Signing you in via Steam…
        </p>
        <p style={{ color: "#666", fontSize: 12, fontFamily: "system-ui, sans-serif", marginTop: 8, maxWidth: 280 }}>
          Your Dota 2 rank will sync in the background — no need to wait.
        </p>
      </div>
    </div>
  );
}

export default function SteamSuccess() {
  return (
    <Suspense fallback={null}>
      <SteamSuccessInner />
    </Suspense>
  );
}