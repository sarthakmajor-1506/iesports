/** CS2 Active Duty map pool. Shared by the match-config endpoint, the
 *  admin panel's map picker, and save_planned_maps validation — one list,
 *  never duplicated. */
export const CS2_ACTIVE_DUTY_MAPS = [
  "de_mirage", "de_inferno", "de_nuke", "de_ancient", "de_anubis", "de_dust2", "de_train",
];

/**
 * Starting sides per map, exactly the three values MatchZy accepts in a match
 * config's `map_sides`. "knife" plays a knife round and waits for the winning
 * team to type .stay / .switch in game; the other two assign sides outright
 * and skip the knife.
 *
 * Assigning sides here is the only admin-side control over the knife decision
 * that exists. MatchZy's css_stay / css_switch handlers return immediately
 * when there is no calling player, so they cannot be issued over RCON from
 * the panel — if the knife runs, only the players can end it.
 */
export const CS2_MAP_SIDES = ["knife", "team1_ct", "team1_t"];

/** Panel labels — "team1" is meaningless without the actual team name. */
export function cs2MapSideLabel(side: string, team1Name?: string, team2Name?: string): string {
  const t1 = team1Name || "Team 1";
  const t2 = team2Name || "Team 2";
  if (side === "team1_ct") return `${t1} CT · ${t2} T`;
  if (side === "team1_t") return `${t1} T · ${t2} CT`;
  return "Knife round";
}
