import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { checkAdmin } from "@/lib/checkAdmin";

/**
 * POST /api/admin/wall-of-shame
 *
 * Create / update / delete a Wall of Shame entry on a Valorant tournament.
 * Body:
 *   { adminKey, tournamentId, action: "create", entry: { uid, type, reason, playerName?, playerAvatar?, riotGameName?, riotTagLine? } }
 *   { adminKey, tournamentId, action: "update", entryId, updates: Partial<entry> }
 *   { adminKey, tournamentId, action: "delete", entryId }
 *   { adminKey, tournamentId, action: "reset-counts", entryId }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { adminKey, tournamentId, action } = body;

    if (!tournamentId || !action) {
      return NextResponse.json({ error: "tournamentId and action required" }, { status: 400 });
    }

    const admin = await checkAdmin(adminKey, tournamentId, "valorantTournaments");
    if (!admin.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const shameCol = adminDb.collection("valorantTournaments").doc(tournamentId).collection("wallOfShame");

    if (action === "create") {
      const entry = body.entry || {};
      if (!entry.uid || !entry.type || !entry.reason) {
        return NextResponse.json({ error: "uid, type, reason required" }, { status: 400 });
      }
      if (entry.type !== "wanted" && entry.type !== "warning") {
        return NextResponse.json({ error: "type must be 'wanted' or 'warning'" }, { status: 400 });
      }

      // Hydrate player display fields from users collection if not supplied.
      let playerName = entry.playerName || "";
      let playerAvatar = entry.playerAvatar || "";
      let riotGameName = entry.riotGameName || "";
      let riotTagLine = entry.riotTagLine || "";
      const userSnap = await adminDb.collection("users").doc(entry.uid).get();
      if (userSnap.exists) {
        const u = userSnap.data() || {};
        if (!playerName) playerName = u.riotGameName || u.steamName || u.fullName || u.discordUsername || entry.uid;
        if (!playerAvatar) playerAvatar = u.riotAvatar || u.discordAvatar || u.steamAvatar || "";
        if (!riotGameName) riotGameName = u.riotGameName || "";
        if (!riotTagLine) riotTagLine = u.riotTagLine || "";
      } else if (!playerName) {
        playerName = entry.uid;
      }

      const docRef = await shameCol.add({
        uid: entry.uid,
        playerName,
        playerAvatar,
        riotGameName,
        riotTagLine,
        type: entry.type,
        reason: entry.reason,
        tomatoCount: 0,
        bailCount: 0,
        createdAt: new Date().toISOString(),
        createdBy: admin.uid,
      });
      return NextResponse.json({ success: true, id: docRef.id });
    }

    if (action === "update") {
      const { entryId, updates } = body;
      if (!entryId || !updates) {
        return NextResponse.json({ error: "entryId and updates required" }, { status: 400 });
      }
      // Only allow these fields to be mutated by admins.
      const allowed: Record<string, any> = {};
      for (const k of ["type", "reason", "playerName", "playerAvatar", "riotGameName", "riotTagLine"]) {
        if (updates[k] !== undefined) allowed[k] = updates[k];
      }
      if (Object.keys(allowed).length === 0) {
        return NextResponse.json({ error: "No allowed fields in updates" }, { status: 400 });
      }
      await shameCol.doc(entryId).update(allowed);
      return NextResponse.json({ success: true });
    }

    if (action === "delete") {
      const { entryId } = body;
      if (!entryId) return NextResponse.json({ error: "entryId required" }, { status: 400 });
      const votesCol = shameCol.doc(entryId).collection("votes");
      const voteDocs = await votesCol.get();
      const batch = adminDb.batch();
      voteDocs.forEach(d => batch.delete(d.ref));
      batch.delete(shameCol.doc(entryId));
      await batch.commit();
      return NextResponse.json({ success: true });
    }

    if (action === "reset-counts") {
      const { entryId } = body;
      if (!entryId) return NextResponse.json({ error: "entryId required" }, { status: 400 });
      const votesCol = shameCol.doc(entryId).collection("votes");
      const voteDocs = await votesCol.get();
      const batch = adminDb.batch();
      voteDocs.forEach(d => batch.delete(d.ref));
      batch.update(shameCol.doc(entryId), { tomatoCount: 0, bailCount: 0 });
      await batch.commit();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
