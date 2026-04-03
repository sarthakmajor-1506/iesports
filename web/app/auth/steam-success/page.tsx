"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
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
    signInWithCustomToken(auth, token)
      .then(() => {
        let dest = "/valorant";
        try { const saved = sessionStorage.getItem("redirectAfterLogin"); if (saved) { dest = saved; sessionStorage.removeItem("redirectAfterLogin"); } } catch {}
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
        <p style={{ color: "#666", fontSize: 14, fontFamily: "system-ui, sans-serif" }}>
          Signing you in via Steam…
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