/**
 * What the landing page puts in its first fold.
 *
 * This used to live inside app/api/featured-tournaments/route.ts, and the page
 * fetched it from the browser after hydration. That cost 2.4–4.4s before the
 * tournament card appeared: a cold Firestore connection, then five round trips
 * taken one after another, then 28.7KB of tournament documents on the wire —
 * none of it cached, all of it paid by every visitor.
 *
 * It is a plain function now so the page can render the card server-side, and
 * three things make it cheap:
 *
 *   PARALLEL. The team count and the two champion lookups no longer wait on
 *   each other. They are one wave, not a queue.
 *
 *   PROJECTED. `pick()` returns the ~18 fields the landing page reads. The raw
 *   documents carry rules arrays, playersSnapshot, previousFormat and
 *   previousRegistration — 29.8KB of valorantTournaments alone, none of which
 *   the card renders.
 *
 *   CACHED. Callers cache it: the page through `revalidate`, the route through
 *   s-maxage. The collections are tiny (8 documents between them) but the
 *   connection setup is not, and there is no reason to pay it per visitor.
 */

import { adminDb } from "@/lib/firebaseAdmin";

export type FeaturedMember = { name: string; tag?: string; avatar?: string; uid?: string };

export type FeaturedTournament = {
  id: string; name?: string; status?: string;
  startDate?: string; endDate?: string; registrationDeadline?: string;
  totalSlots?: number; slotsBooked?: number;
  prizePool?: string; entryFee?: number; format?: string;
  registrationMode?: "solo" | "team"; teamSize?: number; totalTeams?: number;
  /** Real team count, team mode only — see `withTeamCount`. */
  teamsBooked?: number;
  playoffFormat?: string;
  championTeamName?: string; championTeamId?: string; championMembers?: FeaturedMember[];
  schedule?: { registrationCloses?: string; groupStageStart?: string; tourneyStageStart?: string };
};

export type FeaturedPayload = {
  dota: FeaturedTournament | null;
  valorant: FeaturedTournament | null;
  cs2: FeaturedTournament | null;
  completedValorant: FeaturedTournament | null;
  completedDota: FeaturedTournament | null;
  /** Server clock at read time; the page seeds its countdown from it so the
   *  first client render matches the HTML instead of flashing. */
  generatedAt: number;
};

export const EMPTY_FEATURED = (): FeaturedPayload => ({
  dota: null, valorant: null, cs2: null,
  completedValorant: null, completedDota: null, generatedAt: Date.now(),
});

/** Only what the landing page reads. Everything else stays in Firestore. */
const pick = (t: any): FeaturedTournament | null => {
  if (!t) return null;
  const s = t.schedule || {};
  const out: FeaturedTournament = {
    id: t.id,
    name: t.name,
    status: t.status,
    startDate: t.startDate,
    endDate: t.endDate,
    registrationDeadline: t.registrationDeadline,
    totalSlots: t.totalSlots,
    slotsBooked: t.slotsBooked,
    prizePool: t.prizePool,
    entryFee: t.entryFee,
    format: t.format,
    registrationMode: t.registrationMode,
    teamSize: t.teamSize,
    totalTeams: t.totalTeams,
    playoffFormat: t.playoffFormat,
    schedule: {
      registrationCloses: s.registrationCloses,
      groupStageStart: s.groupStageStart,
      tourneyStageStart: s.tourneyStageStart,
    },
  };
  if (typeof t.teamsBooked === "number") out.teamsBooked = t.teamsBooked;
  if (t.championTeamName) out.championTeamName = t.championTeamName;
  if (t.championTeamId) out.championTeamId = t.championTeamId;
  if (t.championMembers) out.championMembers = t.championMembers;
  return out;
};

export async function getFeaturedTournaments(): Promise<FeaturedPayload> {
  const now = new Date();
  const [dotaSnap, valSnap, cs2Snap] = await Promise.all([
    adminDb.collection("tournaments").get(),
    adminDb.collection("valorantTournaments").get(),
    adminDb.collection("cs2Tournaments").get(),
  ]);

  const dotaAll = dotaSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
  const valAll = valSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
  const cs2All = cs2Snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

  const byStartAsc = (a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
  const byStartDesc = (a: any, b: any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime();

  // `status` alone is not enough: a tournament that finished months ago can
  // still read "ongoing" because nothing closes it out, and it then leads the
  // landing page ahead of the event that is actually next.
  const isPast = (t: any) => t.status === "ended" || t.status === "completed" || (t.endDate && now > new Date(t.endDate));
  const isBangalore = (t: any) => /bangalore/i.test(t.name || "");

  const dotaFeatured = dotaAll
    .filter(t => !t.isTestTournament && !isPast(t) && (t.status === "upcoming" || t.status === "active" || t.status === "ongoing"))
    .sort(byStartAsc);
  const valFeatured = valAll.filter(t => !t.isTestTournament && !isBangalore(t) && !isPast(t)).sort(byStartAsc);
  const cs2Featured = cs2All.filter(t => !t.isTestTournament && !isPast(t)).sort(byStartAsc);

  // Ended tournaments belong in "Recent Results" only, never in Featured too.
  const dotaCompleted = dotaAll.filter(t => !t.isTestTournament && isPast(t)).sort(byStartDesc);
  const valCompleted = valAll.filter(t => !t.isTestTournament && !isBangalore(t) && isPast(t)).sort(byStartDesc);

  // Under team registration `slotsBooked` keeps counting PLAYERS, and capacity
  // is counted from the teams collection against `totalTeams`
  // (lib/valorantTeams.ts). The card says "N of M teams", so it needs the real
  // number rather than slotsBooked ÷ teamSize, which is wrong for any
  // part-filled roster.
  const withTeamCount = async (t: any) => {
    if (!t || t.registrationMode !== "team") return t;
    try {
      const agg = await adminDb.collection("valorantTournaments").doc(t.id).collection("teams").count().get();
      return { ...t, teamsBooked: agg.data().count };
    } catch { return t; }
  };

  const detectChampion = async (t: any, game: "valorant" | "dota") => {
    if (t.championTeamId && t.championTeamName) return t;
    try {
      const col = game === "valorant" ? "valorantTournaments" : "tournaments";
      const snap = await adminDb.collection(col).doc(t.id).collection("matches")
        .where("isBracket", "==", true).where("bracketType", "==", "grand_final")
        .where("status", "==", "completed").get();
      if (!snap.empty) {
        const gf = snap.docs[0].data();
        const win = gf.team1Score > gf.team2Score;
        return { ...t, championTeamId: win ? gf.team1Id : gf.team2Id, championTeamName: win ? gf.team1Name : gf.team2Name };
      }
    } catch { /* skip */ }
    return t;
  };

  const enrichWithChampionMembers = async (tournament: any, game: "valorant" | "dota") => {
    if (!tournament) return null;
    const t = await detectChampion(tournament, game);
    if (!t?.championTeamId) return t;
    try {
      const col = game === "valorant" ? "valorantTournaments" : "tournaments";
      const teamDoc = await adminDb.collection(col).doc(t.id).collection("teams").doc(t.championTeamId).get();
      if (!teamDoc.exists) return t;
      const members = teamDoc.data()?.members || [];
      const names: FeaturedMember[] = [];
      const uidOnly: { index: number; uid: string }[] = [];
      for (let i = 0; i < Math.min(members.length, 5); i++) {
        const m = members[i];
        if (typeof m === "object" && m !== null) {
          names.push({
            name: m.riotGameName || m.steamName || m.displayName || "Unknown",
            tag: m.riotTagLine || undefined,
            avatar: m.riotAvatar || m.steamAvatar || undefined,
            uid: m.uid || undefined,
          });
        } else if (typeof m === "string") {
          names.push({ name: "Unknown", uid: m });
          uidOnly.push({ index: names.length - 1, uid: m });
        }
      }
      // One batched read instead of N individual ones.
      if (uidOnly.length > 0) {
        const docs = await adminDb.getAll(...uidOnly.map(u => adminDb.collection("users").doc(u.uid)));
        docs.forEach((d, i) => {
          if (!d.exists) return;
          const u = d.data();
          names[uidOnly[i].index] = {
            name: u?.riotGameName || u?.steamName || u?.displayName || "Unknown",
            tag: u?.riotTagLine || undefined,
            avatar: u?.riotAvatar || u?.steamAvatar || undefined,
            uid: uidOnly[i].uid,
          };
        });
      }
      return { ...t, championMembers: names };
    } catch { return t; }
  };

  // One wave. These three used to run in sequence, which is most of what the
  // browser was waiting on.
  const [valResult, completedVal, completedDota] = await Promise.all([
    withTeamCount(valFeatured[0] ?? null),
    enrichWithChampionMembers(valCompleted[0] ?? null, "valorant"),
    enrichWithChampionMembers(dotaCompleted[0] ?? null, "dota"),
  ]);

  return {
    dota: pick(dotaFeatured[0] ?? null),
    valorant: pick(valResult),
    cs2: pick(cs2Featured[0] ?? null),
    completedValorant: pick(completedVal),
    completedDota: pick(completedDota),
    generatedAt: Date.now(),
  };
}
