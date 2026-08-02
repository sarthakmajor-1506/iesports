"use client";

// Where PayU drops the player after checkout.
//
// The status endpoint re-verifies against PayU on every read, so this page
// polling is not cosmetic — it is what resolves a payment whose browser
// callback never landed. UPI and net banking can sit in "pending" for a few
// seconds after the bank page closes, hence the retry loop rather than a single
// fetch.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Status = {
  txnid: string;
  status: "initiated" | "paid" | "failed" | "pending" | "review";
  amount: number;
  game: string;
  tournamentId: string;
  tournamentName: string;
  registered: boolean;
  registrationError: string | null;
  payuMode: string | null;
  mihpayid: string | null;
  note: string | null;
  returnTo: string | null;
};

const TOURNAMENT_PATH: Record<string, (id: string) => string> = {
  dota2: (id) => `/tournament/${id}`,
  dota_solo: (id) => `/solo/${id}`,
  valorant: (id) => `/valorant/tournament/${id}`,
  cs2: (id) => `/cs2/tournament/${id}`,
};

const LOOK: Record<string, { icon: string; color: string; title: string }> = {
  paid:      { icon: "✅", color: "#4ade80", title: "Payment successful" },
  pending:   { icon: "⏳", color: "#fbbf24", title: "Payment processing" },
  initiated: { icon: "⏳", color: "#fbbf24", title: "Waiting for payment" },
  failed:    { icon: "❌", color: "#f87171", title: "Payment failed" },
  review:    { icon: "⚠️", color: "#fbbf24", title: "Payment needs review" },
};

export default function PaymentResultPage() {
  const params = useParams();
  const txnid = String(params?.txnid || "");

  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (!txnid || txnid === "unknown") { setError("No transaction reference was returned."); return; }

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/payments/status?txnid=${encodeURIComponent(txnid)}`, { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) { setError(json.error || "Could not load this payment"); return; }
        setData(json);

        // Keep asking while PayU has not reached a verdict — up to ~30s.
        if ((json.status === "pending" || json.status === "initiated") && tries < 10) {
          setTimeout(() => { if (!cancelled) setTries((t) => t + 1); }, 3000);
        }
      } catch {
        if (!cancelled) setError("Could not reach the server. Refresh to try again.");
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [txnid, tries]);

  // Opened as the PayU tab? Then this page is a receipt, not a destination —
  // the page that launched it is polling and will update itself, so get out of
  // the way once there is a verdict. `window.opener` is the only reliable
  // signal, and it is null on a same-tab checkout.
  const [isPopup, setIsPopup] = useState(false);
  useEffect(() => { setIsPopup(typeof window !== "undefined" && !!window.opener); }, []);

  const settled = data && (data.status === "paid" || data.status === "failed" || data.status === "review");

  useEffect(() => {
    if (!data || !settled) return;

    if (isPopup) {
      const t = setTimeout(() => { try { window.close(); } catch {} }, 2200);
      return () => clearTimeout(t);
    }

    // Same-tab checkout: put the player back where they started rather than
    // leaving them on a receipt with no obvious way onward.
    if (data.returnTo) {
      const sep = data.returnTo.includes("?") ? "&" : "?";
      const dest = `${data.returnTo}${sep}paid=${encodeURIComponent(data.txnid)}`;
      const t = setTimeout(() => { window.location.replace(dest); }, 2600);
      return () => clearTimeout(t);
    }
  }, [data, settled, isPopup]);

  const look = data ? LOOK[data.status] || LOOK.failed : null;

  // Carry the transaction id back to the tournament page so it can bypass the
  // CDN. Without this the player lands on a cached copy taken before their
  // registration was written and is told they are not registered for the thing
  // they just paid for — which is what happened on the first live payment.
  const tournamentHref = data && TOURNAMENT_PATH[data.game]
    ? `${TOURNAMENT_PATH[data.game](data.tournamentId)}${data.status === "paid" ? `?paid=${encodeURIComponent(data.txnid)}` : ""}`
    : "/";

  return (
    <div style={{
      minHeight: "100vh", background: "#080808",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: "#0e0e0e", border: "1px solid #1a1a1a", borderRadius: 16,
        padding: 32, width: "100%", maxWidth: 440, textAlign: "center",
      }}>
        {!data && !error && (
          <>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
            <p style={{ color: "#888", fontSize: 14 }}>Checking your payment…</p>
          </>
        )}

        {error && (
          <>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 10 }}>Something went wrong</h1>
            <p style={{ color: "#888", fontSize: 13, lineHeight: 1.6 }}>{error}</p>
          </>
        )}

        {data && look && (
          <>
            <div style={{ fontSize: 48, marginBottom: 10 }}>{look.icon}</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: look.color, marginBottom: 6 }}>{look.title}</h1>
            <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>{data.tournamentName}</p>

            <div style={{
              background: "#111", border: "1px solid #1a1a1a", borderRadius: 10,
              padding: "14px 16px", marginBottom: 20, textAlign: "left",
            }}>
              {[
                ["Amount", `₹${data.amount}`],
                ["Reference", data.txnid],
                ...(data.mihpayid ? [["PayU ID", data.mihpayid]] : []),
                ...(data.payuMode ? [["Method", data.payuMode]] : []),
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0" }}>
                  <span style={{ color: "#555", fontSize: 12 }}>{label}</span>
                  <span style={{ color: "#ccc", fontSize: 12, fontWeight: 600, wordBreak: "break-all", textAlign: "right" }}>{value}</span>
                </div>
              ))}
            </div>

            {data.status === "paid" && data.registered && (
              <p style={{ color: "#4ade80", fontSize: 13, marginBottom: 18, lineHeight: 1.6 }}>
                You&apos;re registered. Check Discord for your confirmation.
              </p>
            )}

            {data.status === "paid" && !data.registered && (
              <div style={{
                background: "#1a1200", border: "1px solid #854d0e", borderRadius: 8,
                padding: "10px 14px", marginBottom: 18, textAlign: "left",
              }}>
                <p style={{ color: "#fbbf24", fontSize: 12, fontWeight: 700, marginBottom: 3 }}>One step left</p>
                <p style={{ color: "#92400e", fontSize: 11, lineHeight: 1.6 }}>
                  Your payment went through. Head back to the tournament and hit Register to finish —
                  you won&apos;t be charged again.
                  {data.registrationError ? ` (${data.registrationError})` : ""}
                </p>
              </div>
            )}

            {(data.status === "pending" || data.status === "initiated") && (
              <p style={{ color: "#888", fontSize: 12, marginBottom: 18, lineHeight: 1.6 }}>
                Your bank hasn&apos;t confirmed yet. This page updates itself — keep it open for a few seconds.
                If money left your account, your slot is safe; the confirmation catches up.
              </p>
            )}

            {data.status === "failed" && (
              <p style={{ color: "#888", fontSize: 12, marginBottom: 18, lineHeight: 1.6 }}>
                No money was taken. You can try again from the tournament page.
                {data.note ? ` (${data.note})` : ""}
              </p>
            )}

            {data.status === "review" && (
              <p style={{ color: "#888", fontSize: 12, marginBottom: 18, lineHeight: 1.6 }}>
                We&apos;ve flagged this for a manual check and will sort it out — nothing more for you to do.
                Quote reference {data.txnid} if you get in touch.
              </p>
            )}

            {settled && (
              <p style={{ color: "#555", fontSize: 11, marginBottom: 12 }}>
                {isPopup ? "Closing this tab…" : "Taking you back…"}
              </p>
            )}

            <Link href={tournamentHref} style={{
              display: "block", padding: 13, borderRadius: 10, textDecoration: "none",
              background: "linear-gradient(135deg,#3CCBFF,#2A9FCC)", color: "#fff",
              fontWeight: 700, fontSize: 14,
            }}>
              Back to tournament →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
