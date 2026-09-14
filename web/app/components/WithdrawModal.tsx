"use client";

/**
 * Leaving a tournament you paid for.
 *
 * A browser `confirm()` was fine while every tournament was free. Once a seat
 * costs ₹500 the same click owes the player money, and the two things they need
 * at that moment are the amount coming back and somewhere to send it. We do not
 * ask anyone for a UPI ID up front (an extra field in front of registration
 * costs entries), so this is one of the two places it is actually needed.
 *
 * The refund itself is issued by hand from the PayU dashboard. What this screen
 * guarantees is that it is recorded, addressed, and not forgotten.
 */

import { useState } from "react";

type Props = {
  tournamentName: string;
  /** Rupees coming back. 0 or undefined means nothing was paid for this seat. */
  refundAmount?: number;
  /** UPI ID already on the account, if any. */
  upiId?: string | null;
  accent?: string;
  loading?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (upiId?: string) => void;
};

const VPA = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{0,63})@[a-zA-Z][a-zA-Z0-9.]{1,63}$/;

export default function WithdrawModal({
  tournamentName, refundAmount = 0, upiId, accent = "#3CCBFF",
  loading = false, error = "", onCancel, onConfirm,
}: Props) {
  const owed = refundAmount > 0;
  const [upi, setUpi] = useState(upiId || "");
  const [touched, setTouched] = useState(false);

  const upiValid = !owed || VPA.test(upi.trim());
  const showUpiError = owed && touched && !upiValid;

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#0e0e0e", border: "1px solid #1e1e28", borderRadius: 16,
          padding: 26, width: "100%", maxWidth: 420, fontFamily: "inherit",
        }}
      >
        <div style={{ fontSize: 11.5, letterSpacing: ".14em", color: "#55555f", fontWeight: 600, marginBottom: 12 }}>
          WITHDRAW
        </div>
        <div style={{ fontSize: 23, fontWeight: 700, color: "#F0EEEA", lineHeight: 1.25, marginBottom: 10 }}>
          Leave {tournamentName}?
        </div>

        {owed ? (
          <>
            <p style={{ fontSize: 13.5, color: "#8a8a94", lineHeight: 1.65, marginBottom: 16 }}>
              Your slot opens up for someone else and{" "}
              <strong style={{ color: "#4ade80" }}>₹{refundAmount}</strong> comes back to you. Refunds are sent
              by hand, usually within a couple of working days.
            </p>

            <label style={{ display: "block", fontSize: 12, color: "#8a8a94", marginBottom: 7 }}>
              UPI ID to refund to
            </label>
            <input
              value={upi}
              onChange={(e) => setUpi(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="yourname@bank"
              autoFocus={!upiId}
              style={{
                width: "100%", padding: "13px 15px", background: "#111",
                border: `1.5px solid ${showUpiError ? "#f87171" : "#222"}`, borderRadius: 11,
                color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
              }}
            />
            <p style={{ fontSize: 11.5, color: "#4a4a52", lineHeight: 1.6, marginTop: 7 }}>
              {upiId
                ? "Saved on your profile. Change it here if the refund should go somewhere else."
                : "We only ask for this when there's money to send you. It gets saved to your profile for prize payouts too."}
            </p>
            {showUpiError && (
              <p style={{ color: "#f87171", fontSize: 12, marginTop: 7 }}>
                That doesn&apos;t look like a UPI ID. It should look like yourname@bank.
              </p>
            )}
          </>
        ) : (
          <p style={{ fontSize: 13.5, color: "#8a8a94", lineHeight: 1.65, marginBottom: 16 }}>
            Your slot opens up for someone else. You can register again later if there is still room.
          </p>
        )}

        {error && <p style={{ color: "#f87171", fontSize: 12.5, marginTop: 12 }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              flex: 1, padding: 14, borderRadius: 11, border: "1px solid #222",
              background: "transparent", color: "#8a8a94", fontSize: 14, fontWeight: 700,
              cursor: loading ? "default" : "pointer", fontFamily: "inherit",
            }}
          >
            Stay in
          </button>
          <button
            onClick={() => {
              setTouched(true);
              if (!upiValid) return;
              onConfirm(owed ? upi.trim() : undefined);
            }}
            disabled={loading || (owed && !upi.trim())}
            style={{
              flex: 1, padding: 14, borderRadius: 11, border: 0,
              background: loading || (owed && !upi.trim()) ? "#1c1c1c" : accent,
              color: loading || (owed && !upi.trim()) ? "#666" : "#04202b",
              fontSize: 14, fontWeight: 700,
              cursor: loading || (owed && !upi.trim()) ? "default" : "pointer", fontFamily: "inherit",
            }}
          >
            {loading ? "Withdrawing…" : owed ? `Withdraw · ₹${refundAmount} back` : "Withdraw"}
          </button>
        </div>
      </div>
    </div>
  );
}
