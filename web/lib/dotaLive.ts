/**
 * Live Dota match feed for league-tagged tournament games.
 *
 * Bot lobbies tagged with our registered league (19822 "Domin8 League") surface
 * in the Steam Web API `GetLiveLeagueGames` endpoint with a full live scoreboard
 * (per-player hero, KDA, net worth, GPM/XPM, level). This module fetches that
 * feed server-side (Steam key stays on the server) and normalizes one match into
 * a shape the UI can render. Untagged practice lobbies never appear here, which
 * is exactly why we added the league tag.
 */

const HERO_CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes";

type HeroInfo = { name: string; icon: string };
let heroMap: Record<number, HeroInfo> | null = null;
let heroMapAt = 0;

async function getHeroMap(): Promise<Record<number, HeroInfo>> {
  // Hero constants are stable; refresh at most daily.
  if (heroMap && Date.now() - heroMapAt < 24 * 3600 * 1000) return heroMap;
  try {
    const r = await fetch("https://api.opendota.com/api/heroes");
    const arr = (await r.json()) as any[];
    const map: Record<number, HeroInfo> = {};
    for (const h of arr) {
      const short = String(h.name || "").replace("npc_dota_hero_", "");
      map[h.id] = { name: h.localized_name || short, icon: `${HERO_CDN}/${short}.png` };
    }
    heroMap = map;
    heroMapAt = Date.now();
  } catch {
    if (!heroMap) heroMap = {};
  }
  return heroMap;
}

export type LivePlayer = {
  accountId: number | null;
  name: string;
  heroId: number;
  heroName: string;
  heroIcon: string | null;
  kills: number; deaths: number; assists: number;
  lastHits: number; denies: number;
  netWorth: number; level: number;
  gpm: number; xpm: number;
  // Live world position (Dota coords, roughly -8000..8000). null until the hero
  // is on the map. Projected to the minimap client-side.
  x: number | null; y: number | null;
};

export type LiveMatch = {
  found: boolean;
  dotaMatchId: string;
  leagueId?: number;
  durationSec?: number;
  spectators?: number;
  streamDelaySec?: number;
  roshanRespawnSec?: number;
  radiant?: { score: number; players: LivePlayer[] };
  dire?: { score: number; players: LivePlayer[] };
  fetchedAt: string;
};

function mapPlayers(list: any[], names: Record<string, string>, heroes: Record<number, HeroInfo>): LivePlayer[] {
  return (list || []).map((p) => {
    const hero = heroes[p.hero_id];
    return {
      accountId: p.account_id ?? null,
      name: names[String(p.account_id)] || (p.account_id ? `Player ${p.account_id}` : "—"),
      heroId: p.hero_id || 0,
      heroName: hero?.name || (p.hero_id ? `Hero ${p.hero_id}` : "Picking…"),
      heroIcon: p.hero_id && hero ? hero.icon : null,
      kills: p.kills || 0, deaths: p.death || 0, assists: p.assists || 0,
      lastHits: p.last_hits || 0, denies: p.denies || 0,
      netWorth: p.net_worth || 0, level: p.level || 0,
      gpm: p.gold_per_min || 0, xpm: p.xp_per_min || 0,
      x: typeof p.position_x === "number" ? p.position_x : null,
      y: typeof p.position_y === "number" ? p.position_y : null,
    };
  });
}

/** Fetch + normalize one live league match. Returns {found:false} when the match
 *  is not currently in the live league feed (not started, ended, or untagged). */
export async function getLiveLeagueMatch(dotaMatchId: string, steamKey: string): Promise<LiveMatch> {
  const fetchedAt = new Date().toISOString();
  if (!dotaMatchId || !steamKey) return { found: false, dotaMatchId, fetchedAt };
  let games: any[] = [];
  try {
    const r = await fetch(`https://api.steampowered.com/IDOTA2Match_570/GetLiveLeagueGames/v1/?key=${steamKey}`);
    const j = (await r.json()) as any;
    games = j?.result?.games || [];
  } catch {
    return { found: false, dotaMatchId, fetchedAt };
  }
  const g = games.find((x) => String(x.match_id) === String(dotaMatchId));
  if (!g) return { found: false, dotaMatchId, fetchedAt };

  const heroes = await getHeroMap();
  const names: Record<string, string> = {};
  for (const p of g.players || []) if (p.account_id != null) names[String(p.account_id)] = p.name || "";
  const sb = g.scoreboard || {};
  return {
    found: true,
    dotaMatchId: String(g.match_id),
    leagueId: g.league_id,
    durationSec: Math.round(sb.duration || 0),
    spectators: g.spectators || 0,
    streamDelaySec: g.stream_delay_s || 0,
    roshanRespawnSec: Math.round(sb.roshan_respawn_timer || 0),
    radiant: { score: sb.radiant?.score || 0, players: mapPlayers(sb.radiant?.players, names, heroes) },
    dire: { score: sb.dire?.score || 0, players: mapPlayers(sb.dire?.players, names, heroes) },
    fetchedAt,
  };
}
