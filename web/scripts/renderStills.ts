/** Pull key frames out of the explainer so the design can be reviewed as images. */
import * as path from "path";
import * as fs from "fs";
import { bundle } from "@remotion/bundler";
import { selectComposition, renderStill } from "@remotion/renderer";

const ROOT = process.cwd();
const FRAMES = (process.argv.find(a => a.startsWith("--frames="))?.split("=")[1] || "40,130,210,270,350,470,600,700,780,870")
  .split(",").map(Number);
const OUTDIR = path.resolve(ROOT, "public/videos/stills");

/**
 * The explainer has a solo cut and a team cut and only one can be the default,
 * so the other is unreviewable without a way to pass props:
 *
 *   npx tsx scripts/renderStills.ts --props='{"registrationMode":"solo","entryFee":500}'
 *
 * `--prefix=` keeps two runs from overwriting each other's frames.
 */
const PROPS = JSON.parse(process.argv.find(a => a.startsWith("--props="))?.slice("--props=".length) || "{}");
const PREFIX = process.argv.find(a => a.startsWith("--prefix="))?.split("=")[1] || "f";

(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const serveUrl = await bundle({
    entryPoint: path.join(ROOT, "remotion/index.ts"),
    webpackOverride: (cfg) => ({ ...cfg, resolve: { ...cfg.resolve, alias: { ...(cfg.resolve?.alias || {}), "@": ROOT } } }),
  });
  const composition = await selectComposition({
    serveUrl,
    id: process.argv.find(a=>a.startsWith("--id="))?.split("=")[1] || "TournamentExplainer",
    inputProps: PROPS,
  });
  for (const frame of FRAMES) {
    const out = path.join(OUTDIR, `${PREFIX}${String(frame).padStart(3, "0")}.png`);
    await renderStill({ composition, serveUrl, output: out, frame, overwrite: true, inputProps: PROPS });
    console.log(`frame ${frame} → ${out}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
