/**
 * Draft Lab — quiz bank check.
 *
 * Generates several hundred papers and asserts every question is well formed and
 * every image it references actually resolves on the CDN. Run after rebuilding
 * knowledge.json:  npx tsx scripts/draftlab/testQuiz.ts
 */
import fs from "node:fs";
import { buildQuiz, type Knowledge } from "../../lib/quiz";

async function main() {
  const k: Knowledge = JSON.parse(fs.readFileSync("./public/draftlab/knowledge.json", "utf8"));
  const urls = new Set<string>();
  let bad = 0, total = 0;
  const kinds: Record<string, number> = {};

  for (let i = 0; i < 600; i++) {
    const qs = buildQuiz(k, "seed-" + i, 3);
    if (qs.length !== 3) { console.log("SHORT PAPER", i, qs.length); bad++; }
    for (const q of qs) {
      total++;
      kinds[q.kind] = (kinds[q.kind] ?? 0) + 1;
      if (!q.prompt || q.options.length !== 4) { console.log("MALFORMED", q.kind, q.prompt); bad++; }
      if (q.options.filter((o) => o.correct).length !== 1) { console.log("NOT ONE CORRECT", q.kind, q.prompt); bad++; }
      if (new Set(q.options.map((o) => o.label)).size !== 4) { console.log("DUP OPTIONS", q.kind, q.prompt); bad++; }
      if (q.img) urls.add(q.img);
      for (const o of q.options) if (o.img) urls.add(o.img);
    }
  }
  console.log(`papers 600 · questions ${total} · problems ${bad}`);
  console.log("kind mix", kinds);

  const q = [...urls];
  const broken: string[] = [];
  const worker = async () => {
    while (q.length) {
      const u = q.shift()!;
      try { const r = await fetch(u, { method: "HEAD", signal: AbortSignal.timeout(20000) }); if (!r.ok) broken.push(`${u} ${r.status}`); }
      catch { broken.push(`${u} ERR`); }
    }
  };
  await Promise.all(Array.from({ length: 24 }, worker));
  console.log(`distinct art urls used ${urls.size} · broken ${broken.length}`);
  if (broken.length) console.log(broken.slice(0, 15).join("\n"));
  process.exit(bad || broken.length ? 1 : 0);
}
main();
