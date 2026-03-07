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

type AuthContextType = {
  user: User | null;
  loading: boolean;
  steamLinked: boolean;
  dotaProfile: DotaProfile | null;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  steamLinked: false,
  dotaProfile: null,
  logout: async () => {},
});

// Pages that don't need auth — /auth/steam-success MUST be here
// so AuthContext doesn't redirect away before signInWithCustomToken completes
const PUBLIC_PATHS = ["/", "/login", "/auth/steam-success"];

// Pages that need auth but not Steam
const STEAM_EXEMPT_PATHS = ["/connect-steam"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [steamLinked, setSteamLinked] = useState(false);
  const [dotaProfile, setDotaProfile] = useState<DotaProfile | null>(null);
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

        if (!PUBLIC_PATHS.includes(pathname)) {
          if (hasSteam && STEAM_EXEMPT_PATHS.includes(pathname)) {
            router.push("/dashboard");
          }
        }
      } else {
        setSteamLinked(false);
        setDotaProfile(null);
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