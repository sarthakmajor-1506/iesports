"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getFirebaseAuth } from "@/lib/firebase";
import { Suspense } from "react";

function DiscordSuccessInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      router.replace("/?error=discord_failed");
      return;
    }
    getFirebaseAuth().then(({ auth, mod }) => mod.signInWithCustomToken(auth, token))
      .then((cred) => {
        // Clear discord prompt dismissal so it shows fresh after login
        try { sessionStorage.removeItem(`discord_prompt_dismissed_${cred.user.uid}`); } catch {}
        let dest = "/valorant";
        // `dest` came back from Discord via the OAuth `state` round trip, so it
        // survives a hop through a different tab or app — sessionStorage can't.
        // It's still the fallback for any old cached link built before this.
        const fromState = searchParams.get("dest");
        if (fromState && fromState.startsWith("/") && !fromState.startsWith("//")) {
          dest = fromState;
        } else {
          try { const saved = sessionStorage.getItem("redirectAfterLogin"); if (saved) dest = saved; } catch {}
        }
        try { sessionStorage.removeItem("redirectAfterLogin"); } catch {}
        router.replace(dest);
      })
      .catch((e) => {
        console.error("signInWithCustomToken (Discord) failed:", e.message);
        router.replace("/?error=discord_failed");
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
          border: "3px solid #5865F2",
          borderTopColor: "#fff",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
          margin: "0 auto 16px",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: "#666", fontSize: 14, fontFamily: "system-ui, sans-serif" }}>
          Signing you in via Discord…
        </p>
      </div>
    </div>
  );
}

export default function DiscordSuccess() {
  return (
    <Suspense fallback={null}>
      <DiscordSuccessInner />
    </Suspense>
  );
}
