"use client";
import Navbar from "../components/Navbar";
import DotaTournaments from "../components/DotaTournaments";
import { useState } from "react";

import SoloTournaments from "../components/SoloTournaments";

type DotaTab = "tournaments" | "solo";

export default function Dota2() {
  const [dotaTab, setDotaTab] = useState<DotaTab>("tournaments");

  return (
    <div style={{ minHeight: "100vh", background: "#050505", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      <Navbar />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 30px 0" }}>
        <div style={{ display: "flex", gap: 2, background: "#0c0c0c", borderRadius: 10, padding: 4, border: "1px solid #1a1a1a", width: "fit-content" }}>
          {(["tournaments", "solo"] as DotaTab[]).map((tab) => (
            <button key={tab} onClick={() => setDotaTab(tab)} style={{
              padding: "12px 32px", borderRadius: 8, border: "none",
              background: dotaTab === tab ? "#1a1a1a" : "transparent",
              color: dotaTab === tab ? "#fff" : "#555",
              cursor: "pointer", fontSize: 15, fontWeight: dotaTab === tab ? 700 : 400,
            }}>
              {tab === "tournaments" ? "🏆 Tournaments" : "⚔️ Solo"}
              {tab === "solo" && <span style={{ fontSize: 9, color: "#555", background: "#111", padding: "1px 6px", borderRadius: 8, marginLeft: 6 }}>Soon</span>}
            </button>
          ))}
        </div>
      </div>
      {dotaTab === "tournaments" ? <DotaTournaments /> : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 500 }}>
          <p style={{ fontSize: 56 }}>⚔️</p>
          <h2 style={{ fontSize: 26, fontWeight: 800, marginTop: 16 }}>Solo Mode</h2>
          <p style={{ color: "#444", marginTop: 8, fontSize: 15 }}>1v1 and solo tournaments coming soon!</p>
        </div>
      )}
      {dotaTab === "solo" && <SoloTournaments />}
    </div>
  );
}
