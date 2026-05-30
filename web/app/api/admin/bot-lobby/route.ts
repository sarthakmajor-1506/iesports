import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyAdmin } from "@/lib/verifyAdmin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Bot Lobby control — one route, action-dispatched.
 *
 * Web can't talk to the bot directly (the bot holds the Dota GC), so this
 * route is a thin Firestore bridge:
 *   - action:"state"  → read `botLobbyControl/state` (bot publishes live here)
 *   - any command     → enqueue `botLobbyCommands/{id}` {status:"pending"}
 *                        which the bot consumes via onSnapshot and executes.
 *
 * Command actions: create | invite_all | invite | kick | shuffle | flip |
 *                   launch | destroy | refresh
 */

const COMMAND_ACTIONS = new Set([
  "create", "invite_all", "invite", "kick", "shuffle", "flip", "launch", "destroy", "refresh",
]);

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  try { await verifyAdmin({ adminKey: body.adminKey, authToken: body.authToken }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 401 }); }

  const action = String(body.action || "");

  // ── Live state read (panel polls this) ──────────────────────────────────
  if (action === "state") {
    const s = await adminDb.collection("botLobbyControl").doc("state").get();
    const recent = await adminDb.collection("botLobbyCommands")
      .orderBy("createdAt", "desc").limit(8).get();
    return NextResponse.json({
      ok: true,
      state: s.exists ? s.data() : { status: "idle", gcReady: false, members: [], memberCount: 0 },
      recentCommands: recent.docs.map(d => ({ id: d.id, ...d.data() })),
    });
  }

  // ── Enqueue a command for the bot ───────────────────────────────────────
  if (!COMMAND_ACTIONS.has(action)) {
    return NextResponse.json({ error: `unknown action "${action}"` }, { status: 400 });
  }

  // Light validation / normalisation per action
  const params: any = body.params || {};
  if (action === "create") {
    params.name = String(params.name || "iesports Lobby").slice(0, 60);
    params.password = String(params.password || "ies").slice(0, 30);
    params.region = String(params.region || "India");
    params.gameMode = String(params.gameMode || "AP");
    const cm = Number(params.cmPick || 0);
    params.cmPick = cm === 1 || cm === 2 ? cm : 0;
    if (params.radiantTeamName) params.radiantTeamName = String(params.radiantTeamName).slice(0, 40);
    if (params.direTeamName)    params.direTeamName    = String(params.direTeamName).slice(0, 40);
  }
  if ((action === "kick" || action === "invite") && !params.steam32) {
    return NextResponse.json({ error: "params.steam32 required" }, { status: 400 });
  }
  if (action === "invite_all") {
    params.steam32s = Array.isArray(params.steam32s) ? params.steam32s.map(String) : [];
  }

  const ref = await adminDb.collection("botLobbyCommands").add({
    action,
    params,
    status: "pending",
    createdAt: new Date().toISOString(),
    createdBy: body.by || "admin-panel",
    serverCreatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, commandId: ref.id, action });
}
