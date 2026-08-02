/**
 * Render the tournament explainer to an MP4.
 *
 * The on-page version needs none of this — it plays through @remotion/player.
 * This produces the shareable file for WhatsApp, Discord and Instagram from the
 * exact same composition, so the two can never tell different stories.
 *
 *   npx tsx scripts/renderExplainer.ts
 *   npx tsx scripts/renderExplainer.ts --scale=2 --out=public/videos/foo.mp4
 *
 * First run downloads a headless Chrome (~150MB) and takes a few minutes.
 */
import * as path from "path";
import * as fs from "fs";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split("=")[1];
const ROOT = process.cwd();
const SCALE = Number(arg("scale")) || 1.5;              // 720x900 → 1080x1350
const OUT = path.resolve(ROOT, arg("out") || "public/videos/cs2-prelims-explainer.mp4");

(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  console.log("bundling…");
  const serveUrl = await bundle({
    entryPoint: path.join(ROOT, "remotion/index.ts"),
    // The composition imports through the "@/..." alias the Next app uses;
    // Remotion's webpack knows nothing about tsconfig paths.
    webpackOverride: (cfg) => ({
      ...cfg,
      resolve: {
        ...cfg.resolve,
        alias: { ...(cfg.resolve?.alias || {}), "@": ROOT },
      },
    }),
    onProgress: p => process.stdout.write(`\r  ${Math.round(p)}%   `),
  });
  console.log("\nbundled.");

  const composition = await selectComposition({ serveUrl, id: "TournamentExplainer" });
  console.log(`rendering ${composition.durationInFrames} frames at ${Math.round(composition.width * SCALE)}x${Math.round(composition.height * SCALE)}…`);

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: OUT,
    scale: SCALE,
    // No audio track at all — the film is captioned and autoplays muted.
    muted: true,
    onProgress: ({ progress }) => process.stdout.write(`\r  ${Math.round(progress * 100)}%   `),
  });

  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log(`\n\ndone → ${OUT}  (${kb} KB)`);
})().catch(e => { console.error(e); process.exit(1); });
