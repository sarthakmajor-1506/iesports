import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { provisionTournamentGroup } from "@/lib/whatsappLifecycle";

/**
 * GET /api/cron/registration-close  (Vercel Cron, hourly)
 *
 * For each Valorant tournament whose registrationDeadline has passed and which
 * hasn't been provisioned yet, provision its WhatsApp group with the registered
 * players. provisionTournamentGroup is itself gated by config.lifecycleEnabled,
 * so while the flag is off this cron runs but does nothing.
 *
 * Auth: Vercel sets `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is
 * configured. We also accept `?secret=<ADMIN_SECRET>` for manual runs.
 */
function authorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") || "";
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  const secret = req.nextUrl.searchParams.get("secret");
  if (process.env.ADMIN_SECRET && secret === process.env.ADMIN_SECRET) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = Date.now();
  const results: any[] = [];
  try {
    const snap = await adminDb
      .collection("valorantTournaments")
      .where("status", "in", ["upcoming", "active"])
      .get();
    for (const d of snap.docs) {
      const t = d.data() as any;
      if (t.whatsappProvisioned === true) continue;
      const deadline = t.registrationDeadline ? Date.parse(t.registrationDeadline) : NaN;
      if (!deadline || isNaN(deadline) || deadline > now) continue; // registration still open
      const r = await provisionTournamentGroup(d.id);
      results.push({ tournamentId: d.id, ...r });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, processed: results.length, results });
}
