/**
 * Full post-game per-player stats for a league-tagged Dota match, from OpenDota.
 *
 * Practice lobbies expose no per-player stats (the GC postgame only gives the
 * winner), which is why the Dota match-detail page + MVP were always blank.
 * League-tagged matches (league 19822) are public, so OpenDota carries the full
 * scoreboard, items, and draft. This normalizes one match into the exact
 * `game1.playerStats` shape the detail page and expanded match card render.
 */

const HERO_CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes";
const STEAM_CDN = "https://cdn.cloudflare.steamstatic.com";

type HeroInfo = { name: string; icon: string };
type ItemInfo = { name: string; icon: string };
let heroById: Record<number, HeroInfo> | null = null;
let itemById: Record<number, ItemInfo> | null = null;
let constAt = 0;

async function loadConstants() {
  if (heroById && itemById && Date.now() - constAt < 24 * 3600 * 1000) return;
  try {
    const heroes = (await (await fetch("https://api.opendota.com/api/heroes")).json()) as any[];
    const hm: Record<number, HeroInfo> = {};
    for (const h of heroes) {
      const short = String(h.name || "").replace("npc_dota_hero_", "");
      hm[h.id] = { name: h.localized_name || short, icon: `${HERO_CDN}/${short}.png` };
    }
    heroById = hm;
  } catch { if (!heroById) heroById = {}; }
  try {
    const items = (await (await fetch("https://api.opendota.com/api/constants/items")).json()) as Record<string, any>;
    const im: Record<number, ItemInfo> = {};
    for (const [key, v] of Object.entries(items)) {
      if (!v || typeof v.id !== "number") continue;
      const img = String(v.img || "");
      im[v.id] = { name: v.dname || key, icon: img ? (img.startsWith("http") ? img : STEAM_CDN + img) : "" };
    }
    itemById = im;
  } catch { if (!itemById) itemById = {}; }
}

export type DotaMatchStats = {
  found: boolean;
  dotaMatchId: string;
  leagueId?: number;
  durationSec: number;
  winnerSide: "radiant" | "dire" | null;
  radiantScore: number;
  direScore: number;
  players: any[]; // shape consumed by the match-detail page (see below)
  draft: { radiant: { picks: any[]; bans: any[] }; dire: { picks: any[]; bans: any[] } };
};

/** Fetch + normalize. Returns {found:false} if OpenDota hasn't indexed it yet. */
export async function fetchDotaMatchStats(dotaMatchId: string): Promise<DotaMatchStats> {
  const empty: DotaMatchStats = { found: false, dotaMatchId, durationSec: 0, winnerSide: null, radiantScore: 0, direScore: 0, players: [], draft: { radiant: { picks: [], bans: [] }, dire: { picks: [], bans: [] } } };
  if (!dotaMatchId) return empty;
  let j: any;
  try {
    j = await (await fetch(`https://api.opendota.com/api/matches/${dotaMatchId}`)).json();
  } catch { return empty; }
  if (!j || j.radiant_win == null || !Array.isArray(j.players)) return empty;

  await loadConstants();
  const heroes = heroById || {}, items = itemById || {};
  const heroName = (id: number) => heroes[id]?.name || `Hero ${id}`;
  const heroIcon = (id: number) => heroes[id]?.icon || null;
  const itemRef = (id: number) => (id && items[id] ? { id, name: items[id].name, icon: items[id].icon } : null);

  const players = j.players.map((p: any) => ({
    // identity
    accountId: p.account_id ?? null,
    name: p.personaname || (p.account_id ? `Player ${p.account_id}` : "Anonymous"),
    steamName: p.personaname || null,
    uid: null as string | null, // best-effort profile link can be added later (steam32 -> users)
    // side + hero
    side: p.isRadiant ? "radiant" : "dire",
    hero: heroName(p.hero_id),
    heroIcon: heroIcon(p.hero_id),
    // core stats (exact keys the page reads)
    kills: p.kills || 0, deaths: p.deaths || 0, assists: p.assists || 0,
    level: p.level || 0,
    netWorth: p.net_worth || 0,
    gpm: p.gold_per_min || 0, xpm: p.xp_per_min || 0,
    lastHits: p.last_hits || 0, denies: p.denies || 0,
    heroDamage: p.hero_damage || 0, towerDamage: p.tower_damage || 0, heroHealing: p.hero_healing || 0,
    // items
    items: [p.item_0, p.item_1, p.item_2, p.item_3, p.item_4, p.item_5].map(itemRef),
    neutralItem: itemRef(p.item_neutral),
  }));

  const draft = { radiant: { picks: [] as any[], bans: [] as any[] }, dire: { picks: [] as any[], bans: [] as any[] } };
  for (const pb of j.picks_bans || []) {
    const side = pb.team === 0 ? "radiant" : "dire";
    const ref = { heroId: pb.hero_id, name: heroName(pb.hero_id), icon: heroIcon(pb.hero_id) };
    (pb.is_pick ? draft[side].picks : draft[side].bans).push(ref);
  }

  return {
    found: true,
    dotaMatchId: String(j.match_id || dotaMatchId),
    leagueId: j.leagueid,
    durationSec: j.duration || 0,
    winnerSide: j.radiant_win ? "radiant" : "dire",
    radiantScore: j.radiant_score || 0,
    direScore: j.dire_score || 0,
    players,
    draft,
  };
}
