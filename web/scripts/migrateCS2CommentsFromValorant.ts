/**
 * One-off cleanup: a bug in app/api/comments/route.ts routed CS2 comments to
 * `valorantTournaments/{id}/comments/*` instead of `cs2Tournaments/{id}/comments/*`.
 * This script:
 *   1. Lists every doc-id under `cs2Tournaments` (the real CS2 tournaments)
 *   2. For each one, checks if `valorantTournaments/{id}` exists with a `comments` subcollection
 *   3. Copies each misplaced comment into the correct cs2Tournaments path
 *   4. Deletes the source comment, then the (empty) parent valorantTournaments doc
 *
 * Run: npx tsx scripts/migrateCS2CommentsFromValorant.ts
 * Add --dry to preview without writing.
 */

import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore(getApp());
const DRY = process.argv.includes("--dry");

async function run() {
  console.log(DRY ? "🔎 DRY RUN — no writes" : "🚚 LIVE RUN — will copy + delete");

  const cs2Snap = await db.collection("cs2Tournaments").get();
  const cs2Ids = cs2Snap.docs.map(d => d.id);
  console.log(`Found ${cs2Ids.length} CS2 tournament(s): ${cs2Ids.join(", ")}`);

  let totalCopied = 0;
  let totalDeleted = 0;
  let parentsRemoved = 0;

  for (const id of cs2Ids) {
    const wrongRef = db.collection("valorantTournaments").doc(id);
    const wrongCommentsSnap = await wrongRef.collection("comments").get();

    if (wrongCommentsSnap.empty) {
      // Also clean the parent doc if it exists but is empty/orphaned
      const parent = await wrongRef.get();
      if (parent.exists) {
        const data = parent.data() || {};
        if (Object.keys(data).length === 0) {
          console.log(`  · ${id}: empty parent in valorantTournaments — removing`);
          if (!DRY) await wrongRef.delete();
          parentsRemoved++;
        } else {
          console.log(`  ⚠ ${id}: parent in valorantTournaments has fields ${JSON.stringify(Object.keys(data))} — leaving alone`);
        }
      }
      continue;
    }

    console.log(`\n  ${id}: ${wrongCommentsSnap.size} misplaced comment(s) found`);

    const correctRef = db.collection("cs2Tournaments").doc(id);

    for (const c of wrongCommentsSnap.docs) {
      const data = c.data();
      console.log(`    → copy comment ${c.id} (uid=${data.uid}, section=${data.section})`);
      if (!DRY) {
        await correctRef.collection("comments").doc(c.id).set(data);
        await c.ref.delete();
      }
      totalCopied++;
      totalDeleted++;
    }

    // Now check parent doc
    const parent = await wrongRef.get();
    if (parent.exists) {
      const data = parent.data() || {};
      if (Object.keys(data).length === 0) {
        console.log(`    ✗ removing empty parent valorantTournaments/${id}`);
        if (!DRY) await wrongRef.delete();
        parentsRemoved++;
      } else {
        console.log(`    ⚠ parent valorantTournaments/${id} has fields ${JSON.stringify(Object.keys(data))} — NOT deleting (review manually)`);
      }
    } else {
      console.log(`    (no parent doc to remove for ${id})`);
    }
  }

  console.log(`\n✅ Done.`);
  console.log(`   Comments copied:  ${totalCopied}`);
  console.log(`   Comments deleted: ${totalDeleted}`);
  console.log(`   Empty parents removed: ${parentsRemoved}`);
  if (DRY) console.log("   (dry-run — re-run without --dry to apply)");
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
