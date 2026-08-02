/**
 * Remotion entry for rendering the explainer to a real video file.
 *
 * The on-page version plays through @remotion/player and needs none of this —
 * this exists purely so the same composition can be exported as an MP4 for
 * WhatsApp, Discord and Instagram without the film being authored twice.
 */
import { Composition } from "remotion";
import { TournamentExplainer } from "../app/components/remotion/TournamentExplainer";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="TournamentExplainer"
    component={TournamentExplainer as any}
    durationInFrames={900}   // 30s @ 30fps
    fps={30}
    width={720}
    height={900}             // 4:5 — rendered at scale for delivery
    defaultProps={{
      game: "cs2" as const,
      tournamentName: "CS2 Prelims",
      dateLabel: "Sunday 13 September",
      prizePool: "8,000",
      entryFee: 500,
      totalSlots: 20,
      deadlineLabel: "11 Sept",
      finalTime: "17:00",
    }}
  />
);
