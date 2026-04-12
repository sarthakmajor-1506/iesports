"use client";

import { Player } from "@remotion/player";
import { ShuffleRevealComposition, getShuffleDuration } from "./remotion/ShuffleReveal";
import type { ShuffleTeam } from "./remotion/ShuffleReveal";

interface Props {
  tournamentName: string;
  teams: ShuffleTeam[];
  teamCount: number;
}

export default function ShuffleVideoPlayer({ tournamentName, teams, teamCount }: Props) {
  return (
    <div style={{ borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 30px rgba(0,0,0,0.5)" }}>
      <Player
        component={ShuffleRevealComposition as any}
        inputProps={{
          tournamentName,
          game: "valorant" as const,
          teams,
        }}
        durationInFrames={getShuffleDuration(teamCount)}
        fps={30}
        compositionWidth={1920}
        compositionHeight={1080}
        style={{ width: "100%", aspectRatio: "16/9" }}
        controls
        autoPlay
      />
    </div>
  );
}
