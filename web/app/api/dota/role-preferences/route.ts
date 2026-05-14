import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import type { DotaRole } from "@/lib/types";

const VALID_ROLES = new Set<DotaRole>([
  "safe_lane",
  "mid",
  "off_lane",
  "soft_support",
  "hard_support",
]);

export async function POST(req: NextRequest) {
  try {
    const { tournamentId, uid, roles } = (await req.json()) as {
      tournamentId?: string;
      uid?: string;
      roles?: DotaRole[];
    };

    if (!tournamentId || !uid) {
      return NextResponse.json({ error: "Missing tournamentId or uid" }, { status: 400 });
    }
    if (!Array.isArray(roles)) {
      return NextResponse.json({ error: "roles must be an array" }, { status: 400 });
    }
    // Dedupe + validate
    const cleaned = Array.from(new Set(roles)).filter((r): r is DotaRole =>
      VALID_ROLES.has(r as DotaRole)
    );
    if (cleaned.length < 2) {
      return NextResponse.json({ error: "Pick at least 2 roles" }, { status: 400 });
    }
    if (cleaned.length > 5) {
      return NextResponse.json({ error: "You can pick at most 5 roles" }, { status: 400 });
    }

    const playerRef = adminDb
      .collection("tournaments")
      .doc(tournamentId)
      .collection("players")
      .doc(uid);

    const snap = await playerRef.get();
    if (!snap.exists) {
      return NextResponse.json(
        { error: "You must be registered for this tournament before picking roles" },
        { status: 400 }
      );
    }

    await playerRef.update({
      rolePreferences: cleaned,
      rolePreferencesUpdatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, roles: cleaned });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET returns the player's current rolePreferences for a tournament (or null).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tournamentId = searchParams.get("tournamentId");
    const uid = searchParams.get("uid");
    if (!tournamentId || !uid) {
      return NextResponse.json({ error: "Missing tournamentId or uid" }, { status: 400 });
    }
    const snap = await adminDb
      .collection("tournaments")
      .doc(tournamentId)
      .collection("players")
      .doc(uid)
      .get();
    if (!snap.exists) {
      return NextResponse.json({ roles: null, registered: false });
    }
    const data = snap.data() || {};
    return NextResponse.json({
      roles: (data.rolePreferences as DotaRole[]) || null,
      registered: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
