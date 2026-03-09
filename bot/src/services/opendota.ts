import axios from "axios";

const OPENDOTA_BASE = "https://api.opendota.com/api";

export interface MatchResult {
  matchId: string;
  duration: string;
  winner: "radiant" | "dire";
  radiantScore: number;
  direScore: number;
  gameMode: string;
  players: PlayerMatchStats[];
  mvp: PlayerMatchStats;
}

export interface PlayerMatchStats {
  accountId: number;
  steamName: string;
  hero: string;
  heroId: number;
  kills: number;
  deaths: number;
  assists: number;
  gpm: number;
  xpm: number;
  lastHits: number;
  heroDamage: number;
  isRadiant: boolean;
  isWinner: boolean;
}

// Hero ID → name mapping (top ~50, extend as needed)
const HERO_MAP: Record<number, string> = {
  1: "Anti-Mage", 2: "Axe", 3: "Bane", 4: "Bloodseeker", 5: "Crystal Maiden",
  6: "Drow Ranger", 7: "Earthshaker", 8: "Juggernaut", 9: "Mirana", 10: "Morphling",
  11: "Shadow Fiend", 12: "Phantom Lancer", 13: "Puck", 14: "Pudge", 15: "Razor",
  16: "Sand King", 17: "Storm Spirit", 18: "Sven", 19: "Tiny", 20: "Vengeful Spirit",
  21: "Windranger", 22: "Zeus", 23: "Kunkka", 25: "Lina", 26: "Lion",
  27: "Shadow Shaman", 28: "Slardar", 29: "Tidehunter", 30: "Witch Doctor",
  31: "Lich", 32: "Riki", 33: "Enigma", 34: "Tinker", 35: "Sniper",
  36: "Necrophos", 37: "Warlock", 38: "Beastmaster", 39: "Queen of Pain",
  40: "Venomancer", 41: "Faceless Void", 42: "Wraith King", 43: "Death Prophet",
  44: "Phantom Assassin", 45: "Pugna", 46: "Templar Assassin", 47: "Viper",
  48: "Luna", 49: "Dragon Knight", 50: "Dazzle", 51: "Clockwerk", 52: "Leshrac",
  53: "Nature's Prophet", 54: "Lifestealer", 55: "Dark Seer", 56: "Clinkz",
  57: "Omniknight", 58: "Enchantress", 59: "Huskar", 60: "Night Stalker",
  61: "Broodmother", 62: "Bounty Hunter", 63: "Weaver", 64: "Jakiro",
  65: "Batrider", 66: "Chen", 67: "Spectre", 68: "Ancient Apparition",
  69: "Doom", 70: "Ursa", 71: "Spirit Breaker", 72: "Gyrocopter",
  73: "Alchemist", 74: "Invoker", 75: "Silencer", 76: "Outworld Destroyer",
  77: "Lycan", 78: "Brewmaster", 79: "Shadow Demon", 80: "Lone Druid",
  81: "Chaos Knight", 82: "Meepo", 83: "Treant Protector", 84: "Ogre Magi",
  85: "Undying", 86: "Rubick", 87: "Disruptor", 88: "Nyx Assassin",
  89: "Naga Siren", 90: "Keeper of the Light", 91: "Io", 92: "Visage",
  93: "Slark", 94: "Medusa", 95: "Troll Warlord", 96: "Centaur Warrunner",
  97: "Magnus", 98: "Timbersaw", 99: "Bristleback", 100: "Tusk",
  101: "Skywrath Mage", 102: "Abaddon", 103: "Elder Titan", 104: "Legion Commander",
  105: "Techies", 106: "Ember Spirit", 107: "Earth Spirit", 108: "Underlord",
  109: "Terrorblade", 110: "Phoenix", 111: "Oracle", 112: "Winter Wyvern",
  113: "Arc Warden", 114: "Monkey King", 119: "Dark Willow", 120: "Pangolier",
  121: "Grimstroke", 123: "Hoodwink", 126: "Void Spirit", 128: "Snapfire",
  129: "Mars", 131: "Ringmaster", 135: "Dawnbreaker", 136: "Marci",
  137: "Primal Beast", 138: "Muerta",
};

function heroName(id: number): string {
  return HERO_MAP[id] || `Hero #${id}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDamage(dmg: number): string {
  if (dmg >= 1000) return `${(dmg / 1000).toFixed(1)}k`;
  return dmg.toString();
}

/**
 * Fetch completed match data from OpenDota.
 * Returns null if match not found or not yet parsed.
 */
export async function fetchMatchResult(matchId: string): Promise<MatchResult | null> {
  try {
    const res = await axios.get(`${OPENDOTA_BASE}/matches/${matchId}`);
    const data = res.data;

    if (!data || !data.players) return null;

    const players: PlayerMatchStats[] = data.players.map((p: any) => ({
      accountId: p.account_id,
      steamName: p.personaname || "Unknown",
      hero: heroName(p.hero_id),
      heroId: p.hero_id,
      kills: p.kills || 0,
      deaths: p.deaths || 0,
      assists: p.assists || 0,
      gpm: p.gold_per_min || 0,
      xpm: p.xp_per_min || 0,
      lastHits: p.last_hits || 0,
      heroDamage: p.hero_damage || 0,
      isRadiant: p.isRadiant,
      isWinner: p.isRadiant === data.radiant_win,
    }));

    // Determine MVP — highest (kills*3 + assists - deaths*2 + heroDamage/1000) on winning team
    const winners = players.filter((p) => p.isWinner);
    const mvp = winners.reduce((best, p) => {
      const score = p.kills * 3 + p.assists - p.deaths * 2 + p.heroDamage / 1000;
      const bestScore = best.kills * 3 + best.assists - best.deaths * 2 + best.heroDamage / 1000;
      return score > bestScore ? p : best;
    }, winners[0]);

    return {
      matchId,
      duration: formatDuration(data.duration || 0),
      winner: data.radiant_win ? "radiant" : "dire",
      radiantScore: data.radiant_score || 0,
      direScore: data.dire_score || 0,
      gameMode: data.game_mode?.toString() || "unknown",
      players,
      mvp,
    };
  } catch (err: any) {
    if (err.response?.status === 404) return null;
    console.error("[OpenDota] Error fetching match:", err.message);
    return null;
  }
}

/**
 * Request OpenDota to parse a match (if not already).
 */
export async function requestMatchParse(matchId: string): Promise<void> {
  try {
    await axios.post(`${OPENDOTA_BASE}/request/${matchId}`);
    console.log(`[OpenDota] Parse requested for match ${matchId}`);
  } catch {
    // Ignore — might already be parsed
  }
}

export { heroName, formatDuration, formatDamage };
