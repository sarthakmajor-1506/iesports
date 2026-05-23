import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAdmin } from "@/lib/verifyAdmin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Enqueue / poll a dotaResultJobs document so the Railway bot can resolve
 * practice-lobby match results via the Game Coordinator.
 *
 * POST { tournamentId, forcedMatchIds?: string[], adminKey/authToken }
 *   → creates dotaResultJobs/{id} and returns { ok, jobId }
 *
 * GET ?jobId=xxx&adminKey=xxx
 *   → returns current { status, report, logs, error } of that job doc
 */

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  try { await verifyAdmin({ adminKey: body.adminKey, authToken: body.authToken }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  const tournamentId = String(body.tournamentId || "").trim();
  if (!tournamentId) return NextResponse.json({ error: "tournamentId required" }, { status: 400 });

  const forcedMatchIds: string[] = Array.isArray(body.forcedMatchIds)
    ? body.forcedMatchIds.map(String).filter(Boolean)
    : [];

  const ref = await adminDb.collection("dotaResultJobs").add({
    tournamentId,
    status: "pending",
    apply: true,
    forcedMatchIds,
    createdAt: new Date().toISOString(),
    serverCreatedAt: FieldValue.serverTimestamp(),
    createdBy: "admin-panel",
  });

  return NextResponse.json({ ok: true, jobId: ref.id });
}

export async function GET(req: NextRequest) {
  const adminKey = req.nextUrl.searchParams.get("adminKey") || "";
  const authToken = req.nextUrl.searchParams.get("authToken") || "";
  const jobId = req.nextUrl.searchParams.get("jobId") || "";

  try { await verifyAdmin({ adminKey, authToken }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });

  const snap = await adminDb.collection("dotaResultJobs").doc(jobId).get();
  if (!snap.exists) return NextResponse.json({ error: "job not found" }, { status: 404 });

  const data = snap.data() as any;
  return NextResponse.json({
    ok: true,
    status: data.status,
    report: data.report || null,
    logs: (data.logs || []).slice(-50),
    error: data.error || null,
    updatedAt: data.updatedAt || null,
  });
}
