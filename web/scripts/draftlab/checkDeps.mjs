#!/usr/bin/env node
/**
 * Draft — dependency closure check.
 *
 * Walks every import reachable from the Draft entry points and asserts that each
 * resolved file is TRACKED IN GIT. `next build` passes locally whether or not a
 * dependency has been committed, so a file belonging to a different, unshipped
 * changeset can satisfy the build on this machine and be missing on the build
 * server. That is exactly what failed the first production deploy: `lib/apiAuth.ts`
 * and `app/lib/authFetch.ts` belong to the payment work and were never committed.
 *
 *   node scripts/draftlab/checkDeps.mjs
 */

import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";

const root = process.cwd();
const repo = path.join(root, "..");
const tracked = new Set(
  cp.execSync("git ls-files", { cwd: repo, maxBuffer: 1e8 }).toString()
    .split("\n").map((s) => s.trim()).filter(Boolean)
);

const EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"];
const seen = new Set();
const unresolved = [];
const untracked = [];

function resolve(spec, from) {
  let base;
  if (spec.startsWith("@/")) base = path.join(root, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null; // a package, not ours
  const candidates = ["", ...EXTS, ...EXTS.map((e) => `${path.sep}index${e}`)];
  for (const suffix of candidates) {
    const p = base + suffix;
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return undefined;
}

function walk(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const rel = path.relative(repo, file).split(path.sep).join("/");
  if (!tracked.has(rel)) untracked.push(rel);
  if (file.endsWith(".json")) return;
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
    const spec = m[1] || m[2];
    const r = resolve(spec, file);
    if (r === undefined) unresolved.push(`${rel} -> ${spec}`);
    else if (r) walk(r);
  }
}

const ENTRIES = [
  "app/draft/page.tsx",
  "app/draft/picker/page.tsx",
  "app/draft/guide/page.tsx",
  "app/api/draftlab/leaderboard/route.ts",
  "app/api/draftlab/room/route.ts",
  "app/api/draftlab/response/route.ts",
];
for (const e of ENTRIES) walk(path.join(root, e));

console.log(`files reached: ${seen.size}`);
console.log(`unresolvable imports: ${unresolved.length}`);
unresolved.forEach((u) => console.log(`  ${u}`));
console.log(`dependencies not tracked in git: ${untracked.length}`);
untracked.forEach((u) => console.log(`  ${u}`));
process.exit(unresolved.length || untracked.length ? 1 : 0);
