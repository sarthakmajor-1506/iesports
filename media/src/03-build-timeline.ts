import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { CONFIG } from './config.js';
import { formatTimestamp, saveJson } from './utils.js';
import type { RoundTimestamp, ScoreboardReading } from './types.js';

const LABEL = 'TIMELINE';

function getScoreFiles(): string[] {
  return fs.readdirSync(CONFIG.cropsDir)
    .filter(f => f.startsWith('score_') && f.endsWith('.png'))
    .sort()
    .map(f => path.join(CONFIG.cropsDir, f));
}

function frameNumberFromFile(filePath: string): number {
  const match = path.basename(filePath).match(/(\d+)\.png$/);
  return match ? parseInt(match[1], 10) : 0;
}

function frameToTimestamp(frameNumber: number): number {
  return (frameNumber - 1) * CONFIG.frameInterval;
}

async function analyzeScoreboards(client: Anthropic, files: string[]): Promise<ScoreboardReading[]> {
  const images = files.map(f => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: 'image/png' as const,
      data: fs.readFileSync(f).toString('base64'),
    },
  }));

  const response = await client.messages.create({
    model: CONFIG.visionModel,
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: [
        ...images,
        {
          type: 'text',
          text: `These are ${files.length} scoreboard crops from a Valorant tournament video, taken every 5 seconds.
For each image (in order), read:
- team1_name (left team name)
- team2_name (right team name)
- team1_score (left score, the large number)
- team2_score (right score, the large number)
- round_score (smaller numbers below main score, like "1-0", if visible)
- scene_type: "gameplay" | "agent_select" | "loading" | "post_match" | "other"

If the scoreboard is not visible or unreadable, set scene_type to "other" and leave scores as null.

Respond ONLY with a JSON array of ${files.length} objects, one per image, in order. No markdown, no explanation.
Example: [{"team1_name":"Muth Rajya","team2_name":"Radiant Reapers","team1_score":4,"team2_score":11,"round_score":"1-0","scene_type":"gameplay"}, ...]`,
        },
      ],
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  // Extract JSON from response (handle potential markdown wrapping)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error(`[${LABEL}] Failed to parse response: ${text.slice(0, 200)}`);
    return [];
  }
  return JSON.parse(jsonMatch[0]);
}

function buildTimeline(readings: { frameNumber: number; reading: ScoreboardReading }[]): RoundTimestamp[] {
  const rounds: RoundTimestamp[] = [];
  let currentMatchIndex = 0;
  let lastScore = { t1: -1, t2: -1 };
  let roundStart: number | null = null;
  let roundNumber = 0;
  let currentTeams = { t1: '', t2: '' };

  for (const { frameNumber, reading } of readings) {
    if (reading.scene_type !== 'gameplay' || reading.team1_score === null || reading.team2_score === null) {
      continue;
    }

    const timestamp = frameToTimestamp(frameNumber);
    const t1 = reading.team1_score;
    const t2 = reading.team2_score;

    // First gameplay frame
    if (lastScore.t1 === -1) {
      lastScore = { t1, t2 };
      roundStart = timestamp;
      roundNumber = t1 + t2 + 1;
      currentTeams = { t1: reading.team1_name || 'Team 1', t2: reading.team2_name || 'Team 2' };
      continue;
    }

    // Detect match boundary (scores reset to 0-0)
    if (t1 === 0 && t2 === 0 && (lastScore.t1 > 0 || lastScore.t2 > 0)) {
      // Close previous round
      if (roundStart !== null) {
        rounds.push({
          matchIndex: currentMatchIndex,
          roundNumber,
          team1Name: currentTeams.t1,
          team2Name: currentTeams.t2,
          team1Score: lastScore.t1,
          team2Score: lastScore.t2,
          startTimestamp: roundStart,
          endTimestamp: timestamp,
          frameFile: `score_${String(frameNumber).padStart(6, '0')}.png`,
        });
      }
      currentMatchIndex++;
      roundNumber = 1;
      roundStart = timestamp;
      lastScore = { t1, t2 };
      currentTeams = { t1: reading.team1_name || currentTeams.t1, t2: reading.team2_name || currentTeams.t2 };
      continue;
    }

    // Detect score change (new round)
    if (t1 !== lastScore.t1 || t2 !== lastScore.t2) {
      if (roundStart !== null) {
        rounds.push({
          matchIndex: currentMatchIndex,
          roundNumber,
          team1Name: currentTeams.t1,
          team2Name: currentTeams.t2,
          team1Score: lastScore.t1,
          team2Score: lastScore.t2,
          startTimestamp: roundStart,
          endTimestamp: timestamp,
          frameFile: `score_${String(frameNumber).padStart(6, '0')}.png`,
        });
      }
      roundNumber = t1 + t2 + 1;
      roundStart = timestamp;
      lastScore = { t1, t2 };
      if (reading.team1_name) currentTeams.t1 = reading.team1_name;
      if (reading.team2_name) currentTeams.t2 = reading.team2_name;
    }
  }

  // Close the last round
  if (roundStart !== null) {
    const lastReading = readings[readings.length - 1];
    rounds.push({
      matchIndex: currentMatchIndex,
      roundNumber,
      team1Name: currentTeams.t1,
      team2Name: currentTeams.t2,
      team1Score: lastScore.t1,
      team2Score: lastScore.t2,
      startTimestamp: roundStart,
      endTimestamp: frameToTimestamp(lastReading.frameNumber),
      frameFile: `score_${String(lastReading.frameNumber).padStart(6, '0')}.png`,
    });
  }

  return rounds;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_key_here') {
    console.error(`[${LABEL}] Set ANTHROPIC_API_KEY in .env`);
    process.exit(1);
  }

  const client = new Anthropic();
  const scoreFiles = getScoreFiles();
  console.log(`[${LABEL}] Found ${scoreFiles.length} scoreboard crops`);

  // Batch into groups
  const batchSize = CONFIG.batchSize;
  const allReadings: { frameNumber: number; reading: ScoreboardReading }[] = [];

  for (let i = 0; i < scoreFiles.length; i += batchSize) {
    const batch = scoreFiles.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(scoreFiles.length / batchSize);

    console.log(`[${LABEL}] Processing batch ${batchNum}/${totalBatches} (${batch.length} images)...`);

    const readings = await analyzeScoreboards(client, batch);

    for (let j = 0; j < readings.length; j++) {
      const frameNumber = frameNumberFromFile(batch[j]);
      allReadings.push({ frameNumber, reading: readings[j] });
    }
  }

  console.log(`[${LABEL}] Parsed ${allReadings.length} scoreboard readings`);

  // Build timeline
  const timeline = buildTimeline(allReadings);

  // Save
  saveJson(path.join(CONFIG.dataDir, 'timeline.json'), timeline);

  // Print summary
  console.log(`\n[${LABEL}] === Timeline Summary ===`);
  let currentMatch = -1;
  for (const round of timeline) {
    if (round.matchIndex !== currentMatch) {
      currentMatch = round.matchIndex;
      console.log(`\n  Match ${round.matchIndex + 1}: ${round.team1Name} vs ${round.team2Name}`);
    }
    console.log(
      `    Round ${round.roundNumber}: ${formatTimestamp(round.startTimestamp)} → ${formatTimestamp(round.endTimestamp)}  (Score: ${round.team1Score}-${round.team2Score})`
    );
  }

  console.log(`\n[${LABEL}] Total rounds detected: ${timeline.length}`);
  console.log(`[${LABEL}] Done ✓`);
}

main();
