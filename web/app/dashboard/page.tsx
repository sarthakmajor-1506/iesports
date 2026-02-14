"use client";

import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Dashboard() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [user, loading, router]);

  if (loading) {
    return <p style={{ padding: 40, color: "#fff", background: "#0a0a0a", minHeight: "100vh" }}>Loading...</p>;
  }

  if (!user) {
    return null;
  }

  return (
    <main style={{ padding: 40, background: "#0a0a0a", color: "#fff", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 28, fontWeight: "bold" }}>Dashboard</h1>
      <p style={{ marginTop: 10, color: "#999" }}>Logged in as: {user.phoneNumber}</p>
      <button
        onClick={async () => {
          await logout();
          window.location.href = "/";
        }}
        style={{
          marginTop: 20,
          padding: "10px 20px",
          background: "#dc2626",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          fontWeight: "bold",
        }}
      >
        Logout
      </button>
    </main>
  );
}