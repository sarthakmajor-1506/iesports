#!/usr/bin/env node
/**
 * One-off codemod: `${ACCENT}44` -> `${alpha(ACCENT, 27)}`.
 *
 * The app built translucent variants by appending two hex digits to a colour
 * constant. That works only while the constants are hex literals, and it is
 * exactly what blocked a light theme: the moment a colour becomes `var(--gold)`,
 * `var(--gold)44` is not a colour at all. `color-mix()` takes a `var()` happily,
 * so this rewrites every such site to the helper and frees the palette to be
 * swapped by a class.
 *
 *   node scripts/draftlab/alphaSweep.mjs
 */

import fs from "node:fs";
import path from "node:path";

const NAMES = ["GOLD", "ALLY", "ENEMY", "RADIANT", "DIRE", "GREEN", "DANGER", "accent", "tone", "color", "c"];
const PATTERN = new RegExp(String.raw`\$\{(${NAMES.join("|")})\}([0-9a-fA-F]{2})`, "g");

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp);
    else if (/\.tsx?$/.test(e.name)) files.push(fp);
  }
})("app/draft");

let total = 0;
for (const fp of files) {
  const before = fs.readFileSync(fp, "utf8");
  const after = before.replace(PATTERN, (_m, name, hex) => {
    total++;
    return "${alpha(" + name + ", " + Math.round((parseInt(hex, 16) / 255) * 100) + ")}";
  });
  if (after !== before) {
    fs.writeFileSync(fp, after);
    console.log("  rewrote", fp);
  }
}
console.log(`converted ${total} alpha concatenations across ${files.length} files`);
