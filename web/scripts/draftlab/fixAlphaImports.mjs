#!/usr/bin/env node
/**
 * Companion to `alphaSweep.mjs`: adds `alpha` to the `./ui` import of every file
 * the codemod touched. Splitting it out keeps each pass mechanical and reversible.
 *
 *   node scripts/draftlab/fixAlphaImports.mjs
 */

import fs from "node:fs";
import path from "node:path";

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp);
    else if (/\.tsx?$/.test(e.name)) files.push(fp);
  }
})("app/draft");

let fixed = 0;
for (const fp of files) {
  const src = fs.readFileSync(fp, "utf8");
  if (!/\balpha\(/.test(src)) continue;
  if (/\balpha\b[^\n]*from ["']\.\.?\/ui["']/.test(src)) continue;   // already imported
  if (/export const alpha/.test(src)) continue;                       // this is ui.tsx itself

  // Widen the existing `from "./ui"` / `from "../ui"` import.
  const out = src.replace(
    /import \{([\s\S]*?)\} from (["']\.\.?\/ui["'])/,
    (_m, names, mod) => `import {${names.replace(/\s*$/, "")}, alpha,\n} from ${mod}`.replace(/,\s*,/g, ","),
  );
  if (out === src) { console.log("  ! no ./ui import to widen:", fp); continue; }
  fs.writeFileSync(fp, out);
  fixed++;
  console.log("  imported alpha in", fp);
}
console.log(`added the import to ${fixed} files`);
