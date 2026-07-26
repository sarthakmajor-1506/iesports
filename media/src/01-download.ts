import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { CONFIG } from './config.js';
import { checkTool, ensureDir, fileSizeMB, run, runVisible } from './utils.js';

const LABEL = 'DOWNLOAD';

function main() {
  const url = process.env.YOUTUBE_URL;
  if (!url) {
    console.error(`[${LABEL}] YOUTUBE_URL not set in .env`);
    process.exit(1);
  }

  // Check prerequisites
  const hasYtDlp = checkTool('yt-dlp', 'brew install yt-dlp');
  const hasFfmpeg = checkTool('ffmpeg', 'brew install ffmpeg');
  const hasFfprobe = checkTool('ffprobe', 'brew install ffmpeg');
  if (!hasYtDlp || !hasFfmpeg || !hasFfprobe) {
    process.exit(1);
  }

  ensureDir(CONFIG.inputDir);

  const outputFile = CONFIG.videoFile;
  const startSec = process.env.DOWNLOAD_START;
  const endSec = process.env.DOWNLOAD_END;

  // Build yt-dlp command
  const parts = [
    'yt-dlp',
    '-f "bestvideo[height<=1080]+bestaudio"',
    '--merge-output-format mp4',
  ];

  // If time range specified, download only that section
  if (startSec && endSec) {
    parts.push(`--download-sections "*${startSec}-${endSec}"`);
    parts.push('--force-keyframes-at-cuts');
    console.log(`[${LABEL}] Downloading section: ${startSec}s → ${endSec}s (${Number(endSec) - Number(startSec)}s)`);
  } else {
    console.log(`[${LABEL}] Downloading full video`);
  }

  parts.push(`-o "${outputFile}"`);
  parts.push(`"${url}"`);

  const cmd = parts.join(' ');

  // Check if file already exists
  if (fs.existsSync(outputFile)) {
    const size = fileSizeMB(outputFile);
    console.log(`[${LABEL}] File already exists: ${outputFile} (${size} MB)`);
    console.log(`[${LABEL}] Delete it to re-download.`);
  } else {
    console.log(`[${LABEL}] Starting download...`);
    runVisible(cmd, LABEL);
  }

  // Verify the file
  if (!fs.existsSync(outputFile)) {
    console.error(`[${LABEL}] Download failed — file not found: ${outputFile}`);
    process.exit(1);
  }

  const size = fileSizeMB(outputFile);
  console.log(`[${LABEL}] File size: ${size} MB`);

  // Verify streams with ffprobe
  console.log(`[${LABEL}] Verifying streams...`);
  const probeCmd = `ffprobe -v error -show_entries stream=codec_type -of csv=p=0 "${outputFile}"`;
  const streams = run(probeCmd, LABEL).trim();
  const streamTypes = streams.split('\n').map(s => s.trim());

  const hasVideo = streamTypes.includes('video');
  const hasAudio = streamTypes.includes('audio');

  console.log(`[${LABEL}] Video stream: ${hasVideo ? '✓' : '✗'}`);
  console.log(`[${LABEL}] Audio stream: ${hasAudio ? '✓' : '✗'}`);

  if (!hasVideo || !hasAudio) {
    console.error(`[${LABEL}] Missing stream(s). The file may be incomplete.`);
    process.exit(1);
  }

  // Get duration
  const durationCmd = `ffprobe -v error -show_entries format=duration -of csv=p=0 "${outputFile}"`;
  const duration = parseFloat(run(durationCmd, LABEL).trim());
  console.log(`[${LABEL}] Duration: ${Math.floor(duration / 60)}m ${Math.floor(duration % 60)}s`);

  // Extract a single reference frame from the middle for HUD calibration
  const calibrationFrame = path.join(CONFIG.inputDir, 'calibration_frame.png');
  if (!fs.existsSync(calibrationFrame)) {
    const midpoint = Math.floor(duration / 2);
    const frameCmd = `ffmpeg -y -i "${outputFile}" -ss ${midpoint} -frames:v 1 "${calibrationFrame}"`;
    run(frameCmd, LABEL);
    console.log(`[${LABEL}] Calibration frame saved: ${calibrationFrame}`);
    console.log(`[${LABEL}] → Open this image to verify HUD crop regions before running step 2.`);
  }

  console.log(`[${LABEL}] Done ✓`);
}

main();
