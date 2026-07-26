export interface RoundTimestamp {
  matchIndex: number;
  roundNumber: number;
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
  startTimestamp: number;
  endTimestamp: number;
  frameFile: string;
}

export interface SpeakerEvent {
  timestamp: number;
  speakers: string[];
  team: 'left' | 'right';
}

export interface HighlightClip {
  id: string;
  matchIndex: number;
  roundNumber: number;
  reason: string;
  startTime: number;
  endTime: number;
  outputFile: string;
  subtitleFile?: string;
}

export interface CropRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ScoreboardReading {
  team1_name: string | null;
  team2_name: string | null;
  team1_score: number | null;
  team2_score: number | null;
  round_score: string | null;
  scene_type: 'gameplay' | 'agent_select' | 'loading' | 'post_match' | 'other';
}
