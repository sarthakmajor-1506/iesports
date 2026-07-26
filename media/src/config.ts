import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export const CONFIG = {
  root: ROOT,

  // Paths (all absolute)
  inputDir: path.join(ROOT, 'input'),
  outputDir: path.join(ROOT, 'output'),
  framesDir: path.join(ROOT, 'output', 'frames'),
  cropsDir: path.join(ROOT, 'output', 'crops'),
  highlightsDir: path.join(ROOT, 'output', 'highlights'),
  reelsDir: path.join(ROOT, 'output', 'reels'),
  dataDir: path.join(ROOT, 'data'),

  // Video
  videoFile: path.join(ROOT, 'input', 'grand-finale.mp4'),
  resolution: { width: 1920, height: 1080 },
  frameInterval: 5, // extract 1 frame every 5 seconds

  // Crop regions (1920x1080) — Calibrated from downloaded clip
  regions: {
    scoreboard: { x: 420, y: 15, w: 1080, h: 110 },
    discordLeft: { x: 0, y: 330, w: 250, h: 350 },
    discordRight: { x: 1660, y: 330, w: 260, h: 340 },
  },

  // Claude Vision
  visionModel: 'claude-sonnet-4-20250514',
  batchSize: 20,

  // Highlight clip settings
  clipBufferBefore: 10,
  clipBufferAfter: 5,
};
