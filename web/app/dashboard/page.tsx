"use client";

import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Dashboard() {
  const { user, loading, steamLinked } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push("/");
    else if (!loading && user && !steamLinked) router.push("/connect-steam");
    else if (!loading && user && steamLinked) router.push("/dota2");
  }, [user, loading, steamLinked, router]);

  return (
    <div style={{ minHeight: "100vh", background: "#050505", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#555" }}>Loading...</p>
    </div>
  );
}