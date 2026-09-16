// The "how this tournament runs" steps, from the tournament document.
//
// Used by both format share cards — the static image (api/valorant/share-image)
// and the animated one (components/remotion/ShareSlide). They were two
// hand-copied arrays hardcoding "Swiss" and "Double Elimination", so a
// tournament with neither (Horizon: team entry, Bo1 round robin, top two into a
// Bo3 Grand Final) was advertised with a format it does not have. Pure and
// dependency-free so the server route and the client composition can share it.
//
// Numbering and colour stay with the caller; this decides only WHAT the steps are.

export type FormatStep = { lbl: string; sub: string; date?: string };

type FormatFields = {
  format?: string;
  registrationMode?: string;
  playersPerTeam?: number;
  teamSize?: number;
  matchesPerRound?: number;
  groupStageFormat?: string;
  playoffFormat?: string;
  bracketFormat?: string;
  bracketBestOf?: number;
  grandFinalBestOf?: number;
  registrationDeadline?: string;
  startDate?: string;
  endDate?: string;
  schedule?: { registrationOpens?: string; squadCreation?: string; groupStageStart?: string; tourneyStageStart?: string };
};

/** Group stage straight into one final, no bracket in between. */
export const isFinalOnly = (t: FormatFields) => t.playoffFormat === "Grand Final";

export function formatFlowSteps(t: FormatFields): FormatStep[] {
  const sc = t.schedule || {};
  const size = t.teamSize || t.playersPerTeam || 5;
  const groupBo = t.matchesPerRound || 2;
  const finalBo = t.grandFinalBestOf || 3;
  const teamEntry = t.registrationMode === "team";
  const finalOnly = isFinalOnly(t);
  const fmtLabel = t.format === "shuffle" ? "SHUFFLE" : t.format === "auction" ? "AUCTION" : "STANDARD";

  const steps: FormatStep[] = [];

  if (teamEntry) {
    // Rosters form at sign-up, so there is no separate formation step to date.
    steps.push({
      lbl: "Create or Join a Team",
      sub: `Captain creates the team & pays once  /  teammates join free with the team code`,
      date: sc.registrationOpens || t.registrationDeadline,
    });
  } else {
    steps.push({ lbl: "Register", sub: "Sign up on iesports.in  /  Connect Riot ID", date: sc.registrationOpens || t.registrationDeadline });
    steps.push({ lbl: "Team Formation", sub: `${fmtLabel} format  /  ${size}v${size}`, date: sc.squadCreation });
  }

  if (finalOnly) {
    steps.push({
      lbl: t.groupStageFormat || "Round Robin",
      sub: `Best of ${groupBo} (BO${groupBo})  /  every team plays every team`,
      date: sc.groupStageStart || t.startDate,
    });
    steps.push({ lbl: "Grand Final", sub: `Best of ${finalBo} (BO${finalBo})  /  top 2 teams  /  champion crowned`, date: t.endDate });
    return steps;
  }

  steps.push({ lbl: "Group Stage", sub: `${t.groupStageFormat || "Swiss"}  /  BO${groupBo}`, date: sc.groupStageStart || t.startDate });
  steps.push({
    lbl: "Play-off Stage",
    sub: `${t.bracketFormat === "single_elimination" ? "Single" : "Double"} Elimination  /  BO${t.bracketBestOf || 2}`,
    date: sc.tourneyStageStart,
  });
  steps.push({ lbl: "Grand Final", sub: `Best of ${finalBo}  /  Champion crowned`, date: t.endDate });
  return steps;
}
