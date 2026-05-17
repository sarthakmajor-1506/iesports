/**
 * Resolve a tournament's Dota match results via the Game Coordinator.
 *
 * The GC is the only source that serves bot-hosted practice/custom lobbies
 * (Steam Web API GetMatchDetails is locked; OpenDota never indexes them).
 * iesportsbot hosted every lobby, so its own GC match history surfaces every
 * tournament game even when no match id was captured live.
 *
 * Used by both the Firestore-triggered job (bot already holds the GC — no
 * session fight) and the standalone scripts/gcFetchDotaResults.ts.
 */
import type { Firestore } from "firebase-admin/firestore";
import { getDotaBot, type DotaMatchDetails } from "./dota-gc";

const STEAM64_BASE = BigInt("76561197960265728");
const to32 = (id64?: string | null) => { try { return id64 ? (BigInt(id64) - STEAM64_BASE).toString() : null; } catch { return null; } };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export interface ResolveOpts {
  tournamentId: string;
  apply: boolean;
  forcedMatchIds?: string[];   // extra Dota match ids to always include
  windowPaddingHrs?: number;   // hrs of slack around scheduled times (default 6)
  log?: (s: string) => void;
}
export interface ResolveReport {
  resolved: { tournamentMatchId: string; dotaMatchId: string; winner: string; winnerName: string; overlap: number; durationSec: number }[];
  unresolved: string[];
  candidatesTried: number;
  written: boolean;
}

async function resolveRoster(db: Firestore, tid: string, teamId: string) {
  const t = (await db.collection("tournaments").doc(tid).collection("teams").doc(teamId).get()).data();
  const out: any[] = [];
  for (const m of (t?.members || []) as any[]) {
    let steamId: string | null = null, steamName: string | null = m.steamName || null;
    try { const u = (await db.collection("users").doc(m.uid).get()).data() || {}; steamId = u.steamId || null; steamName = steamName || u.steamName || null; } catch {}
    if (!steamId && typeof m.uid === "string" && m.uid.startsWith("steam_")) steamId = m.uid.slice(6);
    out.push({ uid: m.uid, name: m.fullName || steamName || m.uid, steam32: to32(steamId), teamId, teamName: t?.teamName });
  }
  return out;
}

export async function resolveDotaResults(db: Firestore, opts: ResolveOpts): Promise<ResolveReport> {
  const log = opts.log || ((s: string) => console.log(s));
  const tid = opts.tournamentId;
  const padMs = (opts.windowPaddingHrs ?? 6) * 3600_000;

  // Load every not-yet-completed match + both rosters
  const msnap = await db.collection("tournaments").doc(tid).collection("matches").get();
  const matchDefs: Record<string, any> = {};
  const by32 = new Map<string, any>();
  let minT = Infinity, maxT = -Infinity;
  for (const d of msnap.docs) {
    const md: any = d.data();
    if (md.status === "completed" || md.status === "cancelled") continue;
    if (!md.team1Id || !md.team2Id) continue;
    const t1 = await resolveRoster(db, tid, md.team1Id);
    const t2 = await resolveRoster(db, tid, md.team2Id);
    matchDefs[d.id] = { id: d.id, md, t1, t2, roster: [...t1, ...t2] };
    for (const p of [...t1, ...t2]) if (p.steam32) by32.set(p.steam32, { ...p, matchId: d.id });
    const sched = md.startedAt || md.scheduledTime;
    if (sched) { const ts = Date.parse(sched); if (!isNaN(ts)) { minT = Math.min(minT, ts); maxT = Math.max(maxT, ts); } }
  }
  const ids = Object.keys(matchDefs);
  log(`Tournament ${tid}: ${ids.length} unresolved matches (${ids.join(", ")})`);
  if (!ids.length) return { resolved: [], unresolved: [], candidatesTried: 0, written: false };

  const winFrom = (isFinite(minT) ? minT - padMs : Date.now() - 7 * 864e5) / 1000;
  const winTo = (isFinite(maxT) ? maxT + padMs : Date.now()) / 1000;

  // hero names (public, read-only)
  const heroName: Record<number, string> = {};
  try { (await (await fetch("https://api.opendota.com/api/heroes")).json() as any[]).forEach(h => heroName[h.id] = h.localized_name); } catch {}

  const bot = getDotaBot();
  if (!bot.isReady()) { log("Connecting GC…"); await bot.connect(); await sleep(2000); }
  log(`GC ready. iesportsbot steam32=${bot.getOwnSteam32()}`);

  let hist: Awaited<ReturnType<typeof bot.requestPlayerMatchHistory>> = [];
  try { hist = await bot.requestPlayerMatchHistory({ matchesRequested: 100 }); }
  catch (e: any) { log(`Match history request failed: ${e?.message || e}`); }
  const d = bot.lastMHDebug;
  log(`Match-history GC raw: len=${d.rawLen} decodedCount=${d.rawCount} fields=[${d.fields}] err=${d.err || "-"}`);
  const inWin = hist.filter(h => h.startTime >= winFrom && h.startTime <= winTo);
  log(`Match history ${hist.length}, in-window ${inWin.length}; window ${new Date(winFrom * 1000).toISOString()} → ${new Date(winTo * 1000).toISOString()}`);
  if (hist.length) log(`  hist sample: ${hist.slice(0, 8).map(h => `${h.matchId}@${new Date(h.startTime * 1000).toISOString()}(lt${h.lobbyType})`).join(" ")}`);
  const candidateIds = Array.from(new Set([...(opts.forcedMatchIds || []), ...inWin.map(h => h.matchId)])).filter(Boolean);
  log(`Candidates (${candidateIds.length}): ${candidateIds.join(", ")}`);

  type Mapped = { dota: DotaMatchDetails; matchId: string; ov: number };
  const best: Record<string, Mapped> = {};
  for (const mid of candidateIds) {
    let det: DotaMatchDetails;
    try { det = await bot.requestMatchDetails(mid); } catch (e: any) { log(`  ${mid}: ${e.message}`); await sleep(1500); continue; }
    await sleep(1600);
    const tally: Record<string, number> = {};
    for (const p of det.players) { const r = by32.get(String(p.accountId)); if (r) tally[r.matchId] = (tally[r.matchId] || 0) + 1; }
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    const ov = top ? top[1] : 0, tgt = top ? top[0] : null;
    log(`  dota ${mid} result=${det.result} players=${det.players.length} start=${new Date(det.startTime * 1000).toISOString()} lobby=${det.lobbyType} outcome=${det.matchOutcome} -> ${tgt || "?"} (ov ${ov}/10)`);
    log(`     raw len=${det.rawLen} fields=[${det.topFields}] hex=${det.rawHex}`);
    if (tgt && ov >= 6 && (!best[tgt] || ov > best[tgt].ov)) best[tgt] = { dota: det, matchId: mid, ov };
  }

  const report: ResolveReport = { resolved: [], unresolved: [], candidatesTried: candidateIds.length, written: false };
  const nowIso = new Date().toISOString();
  for (const id of ids) {
    const d = matchDefs[id]; const hit = best[id];
    if (!hit) { report.unresolved.push(id); log(`  ${id}: no confident GC match`); continue; }
    const det = hit.dota;
    const sc: any = { [d.md.team1Id]: { r: 0, dr: 0 }, [d.md.team2Id]: { r: 0, dr: 0 } };
    for (const p of det.players) { const rp = by32.get(String(p.accountId)); if (!rp || rp.matchId !== id) continue; (p.isRadiant ? sc[rp.teamId].r++ : sc[rp.teamId].dr++); }
    const team1Side = sc[d.md.team1Id].r >= sc[d.md.team1Id].dr ? "radiant" : "dire";
    const team2Side = team1Side === "radiant" ? "dire" : "radiant";
    if (det.radiantWin === null) { report.unresolved.push(id); log(`  ${id}: dota ${hit.matchId} outcome unknown — skipped`); continue; }
    const winner = det.radiantWin ? (team1Side === "radiant" ? "team1" : "team2") : (team1Side === "radiant" ? "team2" : "team1");
    const winnerName = winner === "team1" ? d.md.team1Name : d.md.team2Name;
    const playerStats = d.roster.map((rp: any) => {
      const p = det.players.find(x => String(x.accountId) === rp.steam32);
      return {
        uid: rp.uid, name: rp.name, teamId: rp.teamId, teamName: rp.teamName,
        side: p ? (p.isRadiant ? "radiant" : "dire") : (rp.teamId === d.md.team1Id ? team1Side : team2Side),
        found: !!p, hero: p ? (heroName[p.heroId] || `hero_${p.heroId}`) : null,
        kills: p?.kills ?? null, deaths: p?.deaths ?? null, assists: p?.assists ?? null,
        gpm: p?.gpm ?? null, xpm: p?.xpm ?? null, lastHits: p?.lastHits ?? null,
        denies: p?.denies ?? null, netWorth: p?.netWorth ?? null, heroDamage: p?.heroDamage ?? null,
        towerDamage: p?.towerDamage ?? null, heroHealing: p?.heroHealing ?? null, level: p?.level ?? null,
        won: p ? (p.isRadiant === det.radiantWin) : (rp.teamId === (winner === "team1" ? d.md.team1Id : d.md.team2Id)),
      };
    });
    log(`  ${id}: dota ${hit.matchId} (ov ${hit.ov}/10) ${d.md.team1Name}=${team1Side} ${d.md.team2Name}=${team2Side} ${Math.round(det.durationSec / 60)}m → ${winnerName}`);
    if (opts.apply) {
      await db.collection("tournaments").doc(tid).collection("matches").doc(id).set({
        status: "completed",
        team1Score: winner === "team1" ? 1 : 0, team2Score: winner === "team2" ? 1 : 0, winner,
        completedAt: nowIso, dotaMatchId: hit.matchId,
        result: { source: "gc-bot", dotaMatchId: hit.matchId, radiantWin: det.radiantWin, durationSeconds: det.durationSec, team1Side, team2Side, winnerTeam: winner, matchOutcome: det.matchOutcome, fetchedAt: nowIso },
        games: { game1: { dotaMatchId: hit.matchId, winner, durationSeconds: det.durationSec, completedAt: nowIso, status: "completed" } },
        playerStats,
      }, { merge: true });
      report.written = true;
      log(`     ✅ written (${playerStats.length} player stats)`);
    }
    report.resolved.push({ tournamentMatchId: id, dotaMatchId: hit.matchId, winner, winnerName, overlap: hit.ov, durationSec: det.durationSec });
  }
  return report;
}
