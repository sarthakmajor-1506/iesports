/**
 * Walks every root collection in the iesports-auth Firestore project,
 * recursively follows subcollections, and dumps the entire tree to
 * timestamped JSON files on local disk.
 *
 * Layout written:
 *   _backups/firestore-YYYY-MM-DDTHHMM/
 *     _meta.json
 *     {collection}/
 *       {docId}/
 *         _data.json
 *         {subcollection}/
 *           {subDocId}/
 *             _data.json
 *             ...
 *
 * Timestamps and DocumentReferences are serialised with a __type wrapper
 * so they round-trip if you ever need to restore. Use ImportFirestore script
 * (not yet written) or restore via gcloud firestore import after converting.
 *
 *   npx tsx scripts/ad-hoc/_backupFirestore.ts
 */
import { config } from "dotenv";
config({ path: "/Users/sjain/Documents/iesports/iesports/web/.env.local" });
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp, DocumentReference, GeoPoint, FieldValue } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";

if (!getApps().length) initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
})});

const db = getFirestore();
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
const BACKUP_ROOT = `/Users/sjain/Documents/iesports/iesports/_backups/firestore-${stamp}`;

function serialize(value: any): any {
  if (value === null || value === undefined) return value;
  if (value instanceof Timestamp) return { __type: "Timestamp", iso: value.toDate().toISOString() };
  if (value instanceof DocumentReference) return { __type: "DocumentReference", path: value.path };
  if (value instanceof GeoPoint) return { __type: "GeoPoint", lat: value.latitude, lng: value.longitude };
  if (value instanceof Buffer) return { __type: "Bytes", base64: value.toString("base64") };
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === "object") {
    const out: any = {};
    for (const k of Object.keys(value)) out[k] = serialize(value[k]);
    return out;
  }
  return value;
}

let totalDocs = 0;
let totalBytes = 0;
const collectionStats: Record<string, { docs: number; bytes: number }> = {};

async function backupCollection(colRef: FirebaseFirestore.CollectionReference, basePath: string, rootName: string, depth: number = 0): Promise<void> {
  let snap;
  try {
    snap = await colRef.get();
  } catch (e: any) {
    console.log(`  ${"  ".repeat(depth)}[skip ${colRef.path}] ${e?.message || e}`);
    return;
  }
  if (snap.empty) return;
  fs.mkdirSync(basePath, { recursive: true });
  for (const doc of snap.docs) {
    const docDir = path.join(basePath, sanitize(doc.id));
    fs.mkdirSync(docDir, { recursive: true });
    const dataPath = path.join(docDir, "_data.json");
    const json = JSON.stringify(serialize(doc.data()), null, 2);
    fs.writeFileSync(dataPath, json);
    totalDocs++;
    totalBytes += Buffer.byteLength(json);
    collectionStats[rootName].docs++;
    collectionStats[rootName].bytes += Buffer.byteLength(json);
    if (totalDocs % 100 === 0) process.stdout.write(`\r  written ${totalDocs} docs (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);
    let subCols: FirebaseFirestore.CollectionReference[];
    try {
      subCols = await doc.ref.listCollections();
    } catch {
      subCols = [];
    }
    for (const sub of subCols) {
      await backupCollection(sub, path.join(docDir, sub.id), rootName, depth + 1);
    }
  }
}

function sanitize(name: string): string {
  // Firestore doc IDs can contain weird chars; replace anything filesystem-unsafe.
  return name.replace(/[/\\:*?"<>|]/g, "_");
}

(async () => {
  console.log(`Firestore project: ${process.env.FIREBASE_PROJECT_ID}`);
  console.log(`Backup destination: ${BACKUP_ROOT}\n`);
  fs.mkdirSync(BACKUP_ROOT, { recursive: true });

  const startedAt = Date.now();
  const rootCols = await db.listCollections();
  console.log(`Found ${rootCols.length} root collections:`);
  rootCols.forEach(c => console.log(`  - ${c.id}`));
  console.log();

  for (const col of rootCols) {
    collectionStats[col.id] = { docs: 0, bytes: 0 };
    const t0 = Date.now();
    console.log(`\nBacking up: ${col.id}`);
    await backupCollection(col, path.join(BACKUP_ROOT, col.id), col.id);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const s = collectionStats[col.id];
    process.stdout.write(`\r  ${col.id}: ${s.docs} docs, ${(s.bytes / 1024).toFixed(1)} KB, ${elapsed}s${" ".repeat(20)}\n`);
  }

  const meta = {
    project: process.env.FIREBASE_PROJECT_ID,
    backedUpAt: new Date().toISOString(),
    durationSec: ((Date.now() - startedAt) / 1000).toFixed(1),
    totalDocs,
    totalBytes,
    rootCollections: rootCols.map(c => c.id),
    perCollection: collectionStats,
  };
  fs.writeFileSync(path.join(BACKUP_ROOT, "_meta.json"), JSON.stringify(meta, null, 2));

  console.log(`\n✅ Backup complete.`);
  console.log(`   ${totalDocs} docs · ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Saved to: ${BACKUP_ROOT}`);
  console.log(`   Manifest: ${path.join(BACKUP_ROOT, "_meta.json")}`);
  process.exit(0);
})().catch(e => { console.error("\nBACKUP FAILED:", e?.message || e); process.exit(1); });
