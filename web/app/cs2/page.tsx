"use client";
import Navbar from "../components/Navbar";
export default function CS2() {
  return (
    <div style={{ minHeight: "100vh", background: "#050505", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      <Navbar />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh" }}>
        <p style={{ fontSize: 64 }}>🔫</p>
        <h2 style={{ fontSize: 26, fontWeight: 800 }}>CS2</h2>
        <p style={{ color: "#444", marginTop: 8, fontSize: 15 }}>Tournaments coming soon!</p>
      </div>
    </div>
  );
}