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
  steamName: string;
  steamAvatar: string;
};

type DiscordConnection = {
  type: string;
  name: string;
  id: string;
  verified: boolean;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  steamLinked: boolean;
  dotaProfile: DotaProfile | null;
  riotData: RiotData | null;
  userProfile: UserProfile | null;
  discordConnections: DiscordConnection[];
  registeredTournaments: Set<string>;
  registeredValorantTournaments: Set<string>;
  registeredSoloTournaments: Set<string>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  steamLinked: false,
  dotaProfile: null,
  riotData: null,
  userProfile: null,
  discordConnections: [],
  registeredTournaments: new Set(),
  registeredValorantTournaments: new Set(),
  registeredSoloTournaments: new Set(),
  refreshUser: async () => {},
  logout: async () => {},
});

// Pages that strictly require authentication (redirects unauthenticated users to /)
const AUTH_REQUIRED_PATHS = ["/connect-steam", "/connect-riot", "/dashboard"];
const AUTH_REQUIRED_PREFIXES = ["/solo/"];

function requiresAuth(pathname: string): boolean {
  if (AUTH_REQUIRED_PATHS.includes(pathname)) return true;
  return AUTH_REQUIRED_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [steamLinked, setSteamLinked] = useState(false);
  const [dotaProfile, setDotaProfile] = useState<DotaProfile | null>(null);
  const [riotData, setRiotData] = useState<RiotData | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [discordConnections, setDiscordConnections] = useState<DiscordConnection[]>([]);
  const [registeredTournaments, setRegisteredTournaments] = useState<Set<string>>(new Set());
  const [registeredValorantTournaments, setRegisteredValorantTournaments] = useState<Set<string>>(new Set());
  const [registeredSoloTournaments, setRegisteredSoloTournaments] = useState<Set<string>>(new Set());
  const router = useRouter();
  const pathname = usePathname();

  // Shared helper to sync user state from Firestore
  const syncUserData = async (u: User) => {
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
      steamName: data?.steamName || "",
      steamAvatar: data?.steamAvatar || "",
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

    setDiscordConnections(data?.discordConnections || []);
    setRegisteredTournaments(new Set(data?.registeredTournaments || []));
    setRegisteredValorantTournaments(new Set(data?.registeredValorantTournaments || []));
    setRegisteredSoloTournaments(new Set(data?.registeredSoloTournaments || []));

    return { hasSteam };
  };

  // Public method to re-read user data (after linking accounts etc.)
  const refreshUser = async () => {
    if (!user) return;
    await syncUserData(user);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);

      if (u) {
        await syncUserData(u);
      } else {
        setSteamLinked(false);
        setDotaProfile(null);
        setRiotData(null);
        setUserProfile(null);
        setDiscordConnections([]);
        setRegisteredTournaments(new Set());
        setRegisteredValorantTournaments(new Set());
        setRegisteredSoloTournaments(new Set());
      }

      setLoading(false);
    });

    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redirect logic — runs when auth state or pathname changes, no Firestore reads
  useEffect(() => {
    if (loading) return;
    if (user && steamLinked && pathname === "/connect-steam") {
      router.push("/valorant");
    }
    if (!user && requiresAuth(pathname)) {
      try { sessionStorage.setItem("redirectAfterLogin", pathname + window.location.search); } catch {}
      router.push("/");
    }
  }, [user, loading, steamLinked, pathname, router]);

  const logout = async () => {
    // Clear discord prompt dismissal so it shows fresh on next login
    if (user) {
      try { sessionStorage.removeItem(`discord_prompt_dismissed_${user.uid}`); } catch {}
    }
    await signOut(auth);
    router.push("/");
  };

  return (
    
    <AuthContext.Provider value={{ user, loading, steamLinked, dotaProfile, riotData, userProfile, discordConnections, registeredTournaments, registeredValorantTournaments, registeredSoloTournaments, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);