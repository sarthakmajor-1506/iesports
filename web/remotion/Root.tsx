/**
 * Remotion entry for rendering the films to video files.
 *
 * The on-page versions play through @remotion/player and need none of this —
 * this exists so the same compositions can be exported as MP4s for WhatsApp,
 * Discord and Instagram without either film being authored twice.
 */
import { Composition } from "remotion";
import { TournamentExplainer } from "../app/components/remotion/TournamentExplainer";
import { PerksExplainer } from "../app/components/remotion/PerksExplainer";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="TournamentExplainer"
      component={TournamentExplainer as any}
      durationInFrames={900}   // 30s @ 30fps
      fps={30}
      width={720}
      height={900}
      // Horizon as it actually runs since 14 Sep 2026: ₹2,000 per team of five,
      // captain pays once and shares a join code. Render the solo cut (random
      // draw, refundable slot) only for a tournament that still works that way
      // — pass registrationMode: "solo".
      defaultProps={{
        game: "valorant" as const,
        tournamentName: "LEAGUE OF RISING STARS - HORIZON",
        dateLabel: "Sunday 27 September",
        prizePool: "8,000",
        entryFee: 2000,
        totalSlots: 20,
        deadlineLabel: "24 Sept",
        finalTime: "17:00",
        registrationMode: "team" as const,
        teamSize: 5,
        totalTeams: 4,
        groupBestOf: 1,     // Bo1 round robin
        finalBestOf: 3,     // Bo3 Grand Final
      }}
    />
    <Composition
      id="PerksExplainer"
      component={PerksExplainer as any}
      durationInFrames={600}   // 20s
      fps={30}
      width={720}
      height={900}
      defaultProps={{ game: "valorant" as const, entryFee: 2000, perTeam: true, teamSize: 5 }}
    />
  </>
);
