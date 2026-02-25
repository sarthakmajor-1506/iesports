"use client";
import Navbar from "../components/Navbar";
export default function Valorant() {
  return (
    <div style={{ minHeight: "100vh", background: "#050505", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      <Navbar />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
        <img src="https://upload.wikimedia.org/wikipedia/commons/f/fc/Valorant_logo_-_pink_color_version.svg" style={{ width: 80, marginBottom: 24 }} />
        <h2 style={{ fontSize: 26, fontWeight: 800 }}>Valorant</h2>
        <p style={{ color: "#444", marginTop: 8, fontSize: 15 }}>Tournaments coming soon!</p>
      </div>
    </div>
  );
}