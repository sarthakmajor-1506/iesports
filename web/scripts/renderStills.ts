/** Pull key frames out of the explainer so the design can be reviewed as images. */
import * as path from "path";
import * as fs from "fs";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderStill } from "@remotion/renderer";

const ROOT = process.cwd();
const FRAMES = (process.argv.find(a => a.startsWith("--frames="))?.split("=")[1] || "40,130,210,270,350,470,600,700,780,870")
  .split(",").map(Number);
const OUTDIR = path.resolve(ROOT, "public/videos/stills");

(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const serveUrl = await bundle({
    entryPoint: path.join(ROOT, "remotion/index.ts"),
    webpackOverride: (cfg) => ({ ...cfg, resolve: { ...cfg.resolve, alias: { ...(cfg.resolve?.alias || {}), "@": ROOT } } }),
  });
  const composition = await selectComposition({ serveUrl, id: process.argv.find(a=>a.startsWith("--id="))?.split("=")[1] || "TournamentExplainer" });
  for (const frame of FRAMES) {
    const out = path.join(OUTDIR, `f${String(frame).padStart(3, "0")}.png`);
    await renderStill({ composition, serveUrl, output: out, frame, overwrite: true });
    console.log(`frame ${frame} → ${out}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
