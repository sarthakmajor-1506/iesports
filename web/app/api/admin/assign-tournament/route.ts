import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * POST /api/admin/assign-tournament
 *
 * Super admin only. Assigns a tournament's ownerId to a cafe admin.
 *
 * Body: { adminKey, tournamentId, collection, cafeAdminUid }
 *   collection: "valorantTournaments" | "tournaments"
 */
export async function POST(req: NextRequest) {
  try {
    const { adminKey, tournamentId, collection: col, cafeAdminUid } = await req.json();

    if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized — super admin only" }, { status: 401 });
    }
    if (!tournamentId || !col || !cafeAdminUid) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Verify cafe admin exists and has role
    const userDoc = await adminDb.collection("users").doc(cafeAdminUid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const role = userDoc.data()?.role;
    if (role !== "cafe_admin" && role !== "super_admin") {
      return NextResponse.json({ error: "User is not a cafe admin" }, { status: 400 });
    }

    // Verify tournament exists
    const tRef = adminDb.collection(col).doc(tournamentId);
    const tDoc = await tRef.get();
    if (!tDoc.exists) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    await tRef.update({ ownerId: cafeAdminUid });

    const cafeName = userDoc.data()?.riotGameName || userDoc.data()?.discordUsername || cafeAdminUid;
    return NextResponse.json({
      success: true,
      tournamentId,
      tournamentName: tDoc.data()?.name,
      assignedTo: cafeName,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
