"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../context/AuthContext";

type OrderStatus = "initiated" | "pending" | "success" | "failure";

function PayuReturnInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const type = searchParams.get("type"); // "success" | "failure" from PayU's surl/furl
  const txnid = searchParams.get("txnid");

  const [status, setStatus] = useState<OrderStatus | "checking" | "timeout" | "error">("checking");
  const [tournamentId, setTournamentId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!txnid || !user) {
      setStatus(type === "success" ? "pending" : "failure");
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 8; // ~16s of polling — webhook usually wins the race against this page

    const poll = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/payu/order-status?txnid=${encodeURIComponent(txnid)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setStatus("error"); return; }

        setTournamentId(data.tournamentId || null);
        if (data.registrationCompleted) { setStatus("success"); return; }
        if (data.status === "failure") { setStatus("failure"); return; }

        attempts++;
        if (attempts >= maxAttempts) { setStatus("timeout"); return; }
        setTimeout(poll, 2000);
      } catch {
        if (!cancelled) setStatus("error");
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [authLoading, user, txnid, type]);

  useEffect(() => {
    try {
      const pending = localStorage.getItem("pendingRegistration");
      if (pending && (status === "success" || status === "failure")) {
        localStorage.removeItem("pendingRegistration");
      }
    } catch {}
  }, [status]);

  const goBack = () => {
    router.replace(tournamentId ? `/?tournament=${tournamentId}` : "/");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        {(status === "checking" || status === "pending") && (
          <>
            <div style={{ width: 44, height: 44, border: "3px solid #1a1a1a", borderTopColor: "#3CCBFF", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ color: "#fff", fontSize: 16, fontWeight: 700, fontFamily: "system-ui, sans-serif" }}>Confirming your payment…</p>
            <p style={{ color: "#666", fontSize: 12, marginTop: 8, fontFamily: "system-ui, sans-serif" }}>This usually takes a few seconds.</p>
          </>
        )}
        {status === "success" && (
          <>
            <p style={{ fontSize: 48 }}>✅</p>
            <p style={{ color: "#4ade80", fontSize: 18, fontWeight: 800, fontFamily: "system-ui, sans-serif" }}>Payment successful — you're registered!</p>
            <button onClick={goBack} style={{ marginTop: 20, padding: "12px 24px", background: "#3CCBFF", border: "none", borderRadius: 8, color: "#000", fontWeight: 700, cursor: "pointer" }}>
              Back to tournament
            </button>
          </>
        )}
        {status === "failure" && (
          <>
            <p style={{ fontSize: 48 }}>❌</p>
            <p style={{ color: "#f87171", fontSize: 18, fontWeight: 800, fontFamily: "system-ui, sans-serif" }}>Payment didn't go through</p>
            <p style={{ color: "#666", fontSize: 13, marginTop: 8, fontFamily: "system-ui, sans-serif" }}>No slot was booked — you can try again.</p>
            <button onClick={goBack} style={{ marginTop: 20, padding: "12px 24px", background: "#222", border: "1px solid #333", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
              Back to tournament
            </button>
          </>
        )}
        {(status === "timeout" || status === "error") && (
          <>
            <p style={{ fontSize: 48 }}>⏳</p>
            <p style={{ color: "#fbbf24", fontSize: 16, fontWeight: 700, fontFamily: "system-ui, sans-serif" }}>
              Payment received — confirming registration
            </p>
            <p style={{ color: "#666", fontSize: 13, marginTop: 8, fontFamily: "system-ui, sans-serif" }}>
              This is taking longer than usual. Check your dashboard shortly — your registration will appear once confirmed.
            </p>
            <button onClick={goBack} style={{ marginTop: 20, padding: "12px 24px", background: "#222", border: "1px solid #333", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
              Back to tournament
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function PayuReturn() {
  return (
    <Suspense fallback={null}>
      <PayuReturnInner />
    </Suspense>
  );
}
