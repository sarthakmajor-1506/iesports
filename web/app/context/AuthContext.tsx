"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useRouter, usePathname } from "next/navigation";

type DotaProfile = {
  dotaRankTier: number | null;
  dotaBracket: string | null;
  dotaMMR: number | null;
  smurfRiskScore: number | null;
};

type RiotData = {
  riotLinked: boolean;
  riotVerified: "unlinked" | "pending" | "verified";
  riotGameName: string;
  riotTagLine: string;
  riotAvatar: string;
  riotRank: string;
  riotTier: number;
};

type UserProfile = {
  fullName: string;
  phone: string;
  discordId: string;
  discordUsername: string;
  steamId: string;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  steamLinked: boolean;
  dotaProfile: DotaProfile | null;
  riotData: RiotData | null;
  userProfile: UserProfile | null;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  steamLinked: false,
  dotaProfile: null,
  riotData: null,
  userProfile: null,
  logout: async () => {},
});

// Pages that don't need auth — /auth/steam-success MUST be here
// so AuthContext doesn't redirect away before signInWithCustomToken completes
const PUBLIC_PATHS = ["/", "/login", "/auth/steam-success", "/auth/discord-success"];

// Pages that need auth but not Steam
const STEAM_EXEMPT_PATHS = ["/connect-steam", "/connect-riot"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [steamLinked, setSteamLinked] = useState(false);
  const [dotaProfile, setDotaProfile] = useState<DotaProfile | null>(null);
  const [riotData, setRiotData] = useState<RiotData | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);

      if (u) {
        const snap = await getDoc(doc(db, "users", u.uid));
        const data = snap.data();
        const hasSteam = !!data?.steamId;
        setSteamLinked(hasSteam);

        setDotaProfile({
          dotaRankTier: data?.dotaRankTier ?? null,
          dotaBracket: data?.dotaBracket ?? null,
          dotaMMR: data?.dotaMMR ?? null,
          smurfRiskScore: data?.smurfRiskScore ?? null,
        });

        setUserProfile({
          fullName: data?.fullName || "",
          phone: data?.phone || u.phoneNumber || "",
          discordId: data?.discordId || "",
          discordUsername: data?.discordUsername || "",
          steamId: data?.steamId || "",
        });

        const hasRiot = !!data?.riotGameName;
        setRiotData({
          riotLinked: hasRiot,
          riotVerified: hasRiot ? (data?.riotVerified || "pending") : "unlinked",
          riotGameName: data?.riotGameName || "",
          riotTagLine: data?.riotTagLine || "",
          riotAvatar: data?.riotAvatar || "",
          riotRank: data?.riotRank || "",
          riotTier: data?.riotTier || 0,
        });
        if (!PUBLIC_PATHS.includes(pathname)) {
          // If user has Steam linked and is still on /connect-steam, redirect to dashboard
          if (hasSteam && pathname === "/connect-steam") {
            router.push("/valorant");
          }
          // Don't redirect from /connect-riot — it's accessible to any logged-in user
        }
      } else {
        setSteamLinked(false);
        setDotaProfile(null);
        setRiotData(null);
        setUserProfile(null);
        if (!PUBLIC_PATHS.includes(pathname) && !pathname.startsWith("/player/")) {
          try { sessionStorage.setItem("redirectAfterLogin", pathname + window.location.search); } catch {}
          router.push("/");
        }
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [pathname]);

  const logout = async () => {
    await signOut(auth);
    router.push("/");
  };

  return (
    
    <AuthContext.Provider value={{ user, loading, steamLinked, dotaProfile, riotData, userProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);