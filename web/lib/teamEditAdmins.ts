// UIDs allowed to edit / delete team names and logos for any team in any
// tournament, regardless of whether they are a member of that team.
export const TEAM_EDIT_ADMIN_UIDS: readonly string[] = [
  "discord_1302366375263735808",
];

export function canEditAnyTeam(uid: string | null | undefined): boolean {
  return !!uid && TEAM_EDIT_ADMIN_UIDS.includes(uid);
}
