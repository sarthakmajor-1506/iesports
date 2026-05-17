/**
 * Web-driven bot lobby control.
 *
 * Web can't call the bot directly (the bot holds the GC), so control flows
 * through Firestore:
 *   - web writes a command   → `botLobbyCommands/{id}` {action, params, status:"pending"}
 *   - bot executes via GC    → updates the command doc {status:"done"|"error"}
 *   - bot publishes live state→ `botLobbyControl/state` (web polls this)
 *
 * All GC primitives already exist on DotaBot; this just wires them to a
 * command channel + a live-state document.
 */
import type { Firestore } from "firebase-admin/firestore";
import { getDotaBot } from "./dota-gc";

const STEAM64_BASE = BigInt("76561197960265728");
const TEAM_LABEL: Record<number, string> = { 0: "Radiant", 1: "Dire", 4: "Unassigned" };

type LobbyStatus = "idle" | "creating" | "active" | "launching" | "launched" | "destroying" | "error";

interface StatePatch {
  status?: LobbyStatus;
  lobbyName?: string | null;
  password?: string | null;
  region?: string | null;
  gameMode?: string | null;
  lastError?: string | null;
  lastCommand?: string | null;
}

// In-memory mirror of the lobby config (members come live from the GC).
const cfg = { lobbyName: null as string | null, password: null as string | null, region: null as string | null, gameMode: null as string | null, status: "idle" as LobbyStatus };
let nameCache = new Map<string, string>(); // steam32 -> display name

async function resolveNames(db: Firestore, steam32s: string[]): Promise<void> {
  const missing = steam32s.filter(s => !nameCache.has(s));
  if (!missing.length) return;
  // users are keyed by steamId (steam64); resolve in chunks of 10 via 'in'
  for (let i = 0; i < missing.length; i += 10) {
    const chunk = missing.slice(i, i + 10);
    const ids64 = chunk.map(s => (BigInt(s) + STEAM64_BASE).toString());
    try {
      const snap = await db.collection("users").where("steamId", "in", ids64).get();
      const by64 = new Map<string, string>();
      snap.forEach(d => { const x = d.data(); if (x.steamId) by64.set(String(x.steamId), x.fullName || x.steamName || x.discordUsername || ""); });
      for (let k = 0; k < chunk.length; k++) {
        const nm = by64.get(ids64[k]);
        nameCache.set(chunk[k], nm || `steam:${chunk[k]}`);
      }
    } catch {
      for (const s of chunk) if (!nameCache.has(s)) nameCache.set(s, `steam:${s}`);
    }
  }
}

export async function publishLobbyState(db: Firestore, patch: StatePatch = {}): Promise<void> {
  Object.assign(cfg, patch);
  const bot = getDotaBot();
  const ready = (() => { try { return bot.isReady(); } catch { return false; } })();
  const raw = ready ? bot.getLobbyMembers() : [];
  await resolveNames(db, raw.map(m => String(m.id)));
  const members = raw.map(m => ({
    steam32: String(m.id),
    name: nameCache.get(String(m.id)) || `steam:${m.id}`,
    team: m.team,
    teamLabel: TEAM_LABEL[m.team] ?? `team${m.team}`,
  }));
  await db.collection("botLobbyControl").doc("state").set({
    status: cfg.status,
    gcReady: ready,
    lobbyName: cfg.lobbyName,
    password: cfg.password,
    region: cfg.region,
    gameMode: cfg.gameMode,
    members,
    memberCount: members.length,
    lastError: patch.lastError ?? null,
    lastCommand: patch.lastCommand ?? null,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

async function runCommand(db: Firestore, id: string, action: string, params: any): Promise<{ ok: boolean; result?: any; error?: string }> {
  const bot = getDotaBot();
  try {
    if (!bot.isReady() && action !== "refresh") return { ok: false, error: "GC not ready (bot still connecting)" };
    switch (action) {
      case "create": {
        const name = String(params?.name || "IEsports Lobby");
        const password = String(params?.password || "ies");
        const region = String(params?.region || "India");
        const gameMode = String(params?.gameMode || "AP");
        cfg.status = "creating";
        await publishLobbyState(db, { status: "creating", lobbyName: name, password, region, gameMode, lastCommand: "create" });
        const res = await bot.createLobby(name, password, gameMode, region);
        cfg.status = "active";
        await publishLobbyState(db, { status: "active", lobbyName: name, password, region, gameMode, lastCommand: "create", lastError: null });
        return { ok: true, result: res };
      }
      case "invite": { bot.invitePlayer(String(params.steam32)); return { ok: true }; }
      case "invite_all": {
        const ids: string[] = Array.isArray(params?.steam32s) ? params.steam32s.map(String) : [];
        await bot.inviteAll(ids);
        return { ok: true, result: { invited: ids.length } };
      }
      case "kick": { bot.kickPlayer(String(params.steam32)); return { ok: true }; }
      case "shuffle": { const m = await bot.shuffleTeams(); return { ok: true, result: { members: m.length } }; }
      case "flip": { const m = await bot.flipTeams(); return { ok: true, result: { members: m.length } }; }
      case "launch": {
        cfg.status = "launching";
        await publishLobbyState(db, { status: "launching", lastCommand: "launch" });
        bot.startGame();
        cfg.status = "launched";
        return { ok: true };
      }
      case "destroy": {
        cfg.status = "destroying";
        await publishLobbyState(db, { status: "destroying", lastCommand: "destroy" });
        await bot.destroyLobby();
        cfg.status = "idle";
        Object.assign(cfg, { lobbyName: null, password: null, region: null, gameMode: null });
        return { ok: true };
      }
      case "refresh": return { ok: true };
      default: return { ok: false, error: `unknown action "${action}"` };
    }
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

let processing = false;

/** Wire into index.ts after the bot is up. Low-latency via onSnapshot. */
export function startBotLobbyControl(db: Firestore): void {
  // Live-state heartbeat so the panel always shows fresh members/GC status.
  setInterval(() => { publishLobbyState(db).catch(() => {}); }, 5000);
  publishLobbyState(db, { status: cfg.status }).catch(() => {});

  db.collection("botLobbyCommands").where("status", "==", "pending")
    .onSnapshot(async (snap) => {
      if (processing) return;
      const docs = snap.docs.sort((a, b) => String(a.data().createdAt || "").localeCompare(String(b.data().createdAt || "")));
      if (!docs.length) return;
      processing = true;
      try {
        for (const d of docs) {
          const c = d.data() as any;
          await d.ref.set({ status: "processing", updatedAt: new Date().toISOString() }, { merge: true });
          console.log(`[BotLobby] ▶ ${d.id} action=${c.action}`);
          const r = await runCommand(db, d.id, c.action, c.params || {});
          await d.ref.set({
            status: r.ok ? "done" : "error",
            result: r.result ?? null,
            error: r.error ?? null,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          await publishLobbyState(db, {
            lastCommand: c.action,
            lastError: r.ok ? null : (r.error || "error"),
          });
          console.log(`[BotLobby] ${r.ok ? "✅" : "✗"} ${d.id} ${r.error || ""}`);
        }
      } catch (e: any) {
        console.error("[BotLobby] consumer error:", e?.message || e);
      } finally {
        processing = false;
      }
    }, (err) => console.error("[BotLobby] snapshot error:", err?.message || err));

  console.log("[BotLobby] command consumer + state publisher running");
}
