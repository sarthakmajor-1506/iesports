"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useRouter, usePathname } from "next/navigation";

type DoताProfile = {
  dotaRankTier: number | null;
  dotaBracket: string | null;
  dotaMMR: number | null;
  smurfRiskScore: number | null;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  steamLinked: boolean;
  dotaProfile: DoताProfile | null;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  steamLinked: false,
  dotaProfile: null,
  logout: async () => {},
});

// Pages that don't need auth
const PUBLIC_PATHS = ["/", "/login"];

// Pages that need auth but not Steam
const STEAM_EXEMPT_PATHS = ["/connect-steam"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [steamLinked, setSteamLinked] = useState(false);
  const [dotaProfile, setDotaProfile] = useState<DoताProfile | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);

      if (u) {
        // Check Steam status + fetch dota profile from Firestore
        const snap = await getDoc(doc(db, "users", u.uid));
        const data = snap.data();
        const hasSteam = !!data?.steamId;
        setSteamLinked(hasSteam);

        // Store dota profile data
        setDotaProfile({
          dotaRankTier: data?.dotaRankTier ?? null,
          dotaBracket: data?.dotaBracket ?? null,
          dotaMMR: data?.dotaMMR ?? null,
          smurfRiskScore: data?.smurfRiskScore ?? null,
        });

        // Redirect logic
        if (!PUBLIC_PATHS.includes(pathname)) {
          if (!hasSteam && !STEAM_EXEMPT_PATHS.includes(pathname)) {
            router.push("/connect-steam");
          } else if (hasSteam && STEAM_EXEMPT_PATHS.includes(pathname)) {
            router.push("/dashboard");
          }
        }
      } else {
        setSteamLinked(false);
        setDotaProfile(null);
        // Not logged in — redirect to login if on protected page
        if (!PUBLIC_PATHS.includes(pathname)) {
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
    <AuthContext.Provider value={{ user, loading, steamLinked, dotaProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);