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
      defaultProps={{
        game: "valorant" as const,
        tournamentName: "LEAGUE OF RISING STARS - HORIZON",
        dateLabel: "Sunday 27 September",
        prizePool: "8,000",
        entryFee: 500,
        totalSlots: 20,
        deadlineLabel: "24 Sept",
        finalTime: "22:30",
      }}
    />
    <Composition
      id="PerksExplainer"
      component={PerksExplainer as any}
      durationInFrames={450}   // 15s
      fps={30}
      width={720}
      height={900}
      defaultProps={{ game: "valorant" as const, entryFee: 500 }}
    />
  </>
);
