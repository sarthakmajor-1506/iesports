import 'dotenv/config';
import fs from 'fs';
import { CONFIG } from './config.js';
import { ensureDir, fileSizeMB, run } from './utils.js';

const LABEL = 'FRAMES';

function main() {
  if (!fs.existsSync(CONFIG.videoFile)) {
    console.error(`[${LABEL}] Video not found: ${CONFIG.videoFile}`);
    console.error(`[${LABEL}] Run "npm run download" first.`);
    process.exit(1);
  }

  ensureDir(CONFIG.framesDir, CONFIG.cropsDir);

  const { scoreboard, discordLeft, discordRight } = CONFIG.regions;
  const interval = CONFIG.frameInterval;
  const video = CONFIG.videoFile;

  const startTime = Date.now();

  // Extract scoreboard crops directly from video (skip full frame extraction)
  console.log(`[${LABEL}] Extracting scoreboard crops (1 every ${interval}s)...`);
  run(
    `ffmpeg -y -i "${video}" -vf "fps=1/${interval},crop=${scoreboard.w}:${scoreboard.h}:${scoreboard.x}:${scoreboard.y}" "${CONFIG.cropsDir}/score_%06d.png"`,
    LABEL
  );

  // Extract discord left crops
  console.log(`[${LABEL}] Extracting Discord left crops...`);
  run(
    `ffmpeg -y -i "${video}" -vf "fps=1/${interval},crop=${discordLeft.w}:${discordLeft.h}:${discordLeft.x}:${discordLeft.y}" "${CONFIG.cropsDir}/discord_left_%06d.png"`,
    LABEL
  );

  // Extract discord right crops
  console.log(`[${LABEL}] Extracting Discord right crops...`);
  run(
    `ffmpeg -y -i "${video}" -vf "fps=1/${interval},crop=${discordRight.w}:${discordRight.h}:${discordRight.x}:${discordRight.y}" "${CONFIG.cropsDir}/discord_right_%06d.png"`,
    LABEL
  );

  // Count and report
  const scoreFiles = fs.readdirSync(CONFIG.cropsDir).filter(f => f.startsWith('score_'));
  const leftFiles = fs.readdirSync(CONFIG.cropsDir).filter(f => f.startsWith('discord_left_'));
  const rightFiles = fs.readdirSync(CONFIG.cropsDir).filter(f => f.startsWith('discord_right_'));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Calculate total disk usage
  const allFiles = fs.readdirSync(CONFIG.cropsDir).map(f => `${CONFIG.cropsDir}/${f}`);
  const totalBytes = allFiles.reduce((sum, f) => sum + fs.statSync(f).size, 0);
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);

  console.log(`[${LABEL}] ---`);
  console.log(`[${LABEL}] Scoreboard crops: ${scoreFiles.length}`);
  console.log(`[${LABEL}] Discord left crops: ${leftFiles.length}`);
  console.log(`[${LABEL}] Discord right crops: ${rightFiles.length}`);
  console.log(`[${LABEL}] Total disk usage: ${totalMB} MB`);
  console.log(`[${LABEL}] Time: ${elapsed}s`);
  console.log(`[${LABEL}] Done ✓`);
}

main();
