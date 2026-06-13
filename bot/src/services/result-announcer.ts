/**
 * Result announcer — robust, settle-path-agnostic operational messaging.
 *
 * Triggers on the END STATE (a match flipping to `completed`), NOT on a specific
 * settle path — so it catches every completion (GC, web auto-settle, admin)
 * exactly once. For each newly-completed match it posts result + "next game later
 * today" to the tournament's Discord channel, and the same to WhatsApp via the
 * outbox when `tournament.whatsappGroupId` is set. Idempotent via
 * `resultAnnouncedAt`; anti-backblast via WINDOW_MS + a one-time backfill.
 *
 * Game-generic: Dota (collection `tournaments`, winner on `m.winner`, has match
 * duration) and Valorant (collection `valorantTournaments`, winner derived from
 * the series score, no duration).
 */
import { Client, TextChannel } from "discord.js";
import { getDb } from "./firebase";

const FIELD = "resultAnnouncedAt";
const WINDOW_MS = 6 * 3600 * 1000;

type GameCfg = { coll: string; statuses: string[]; requireMatchId?: boolean; hasDuration?: boolean };
const GAMES: GameCfg[] = [
  { coll: "tournaments", statuses: ["ongoing"], requireMatchId: true, hasDuration: true },               // Dota
  { coll: "valorantTournaments", statuses: ["ongoing", "upcoming", "active", "live"], hasDuration: false }, // Valorant
];

const istDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const istTime = (d: Date) => d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });

// Resolve winner/loser names from explicit fields, else from the score. null = draw/unknown.
function winnerOf(m: any): { w: string; l: string } | null {
  if (m.winner === "team1") return { w: m.team1Name, l: m.team2Name };
  if (m.winner === "team2") return { w: m.team2Name, l: m.team1Name };
  if (m.winnerId && m.winnerId === m.team1Id) return { w: m.team1Name, l: m.team2Name };
  if (m.winnerId && m.winnerId === m.team2Id) return { w: m.team2Name, l: m.team1Name };
  if (m.winnerName) return { w: m.winnerName, l: m.winnerName === m.team1Name ? m.team2Name : m.team1Name };
  const a = m.team1Score ?? 0, b = m.team2Score ?? 0;
  if (a > b) return { w: m.team1Name, l: m.team2Name };
  if (b > a) return { w: m.team2Name, l: m.team1Name };
  return null;
}

async function announceForTournament(client: Client, db: any, cfg: GameCfg, tdoc: any): Promise<void> {
  const t: any = tdoc.data();
  const nowMs = Date.now();
  const matchesCol = db.collection(cfg.coll).doc(tdoc.id).collection("matches");

  // Cheap path: read only the most-recently-completed matches (completedAt only
  // exists on finished games, so this single-field orderBy returns recent
  // results without scanning the whole collection). Almost every tick has
  // nothing new to announce, so this avoids reading all matches every minute.
  const recent = (await matchesCol.orderBy("completedAt", "desc").limit(15).get()).docs.map((d: any) => ({ id: d.id, ...(d.data() as any) }));
  const todo = recent.filter((m: any) =>
    m.status === "completed" && !m[FIELD] &&
    m.completedAt && (nowMs - Date.parse(m.completedAt)) < WINDOW_MS &&
    (!cfg.requireMatchId || m.dotaMatchId || m.game1?.dotaMatchId) &&
    !!winnerOf(m)
  );
  if (!todo.length) return; // nothing new — done in 15 reads

  // Only when there IS something to announce do we read all matches, for the
  // "next game today" line. This is rare (a few times per tournament night).
  const matches = (await matchesCol.get()).docs.map((d: any) => ({ id: d.id, ...(d.data() as any) }));

  for (const m of todo) {
    try {
      const wl = winnerOf(m)!;
      const score = `${m.team1Score ?? 0}–${m.team2Score ?? 0}`;
      const tname = t.name || "iesports";
      const dur = cfg.hasDuration ? Math.round((m.game1?.durationSeconds || m.durationSec || 0) / 60) : 0;
      const durStr = dur ? ` · ⏱ ${dur}m` : "";

      const next = matches
        .filter((x: any) =>
          x.status !== "completed" && x.scheduledTime &&
          istDay(new Date(x.scheduledTime)) === istDay(new Date(nowMs)) &&
          Date.parse(x.scheduledTime) > nowMs &&
          x.team1Name && x.team2Name && x.team1Name !== "TBD" && x.team2Name !== "TBD")
        .sort((a: any, b: any) => String(a.scheduledTime).localeCompare(String(b.scheduledTime)))[0];

      const discordMsg =
        `🏆 **${tname} — Result**\n**${wl.w}** def. ${wl.l}  (${score})${durStr}` +
        (next ? `\n\n⚔️ **Next up today:** ${next.team1Name} vs ${next.team2Name} — ${istTime(new Date(next.scheduledTime))} IST` : "");
      const waMsg =
        `🏆 *${tname} — Result*\n*${wl.w}* def. ${wl.l}  (${score})${durStr}` +
        (next ? `\n\n⚔️ *Next up today:* ${next.team1Name} vs ${next.team2Name} — ${istTime(new Date(next.scheduledTime))} IST` : "");

      const chId = m.tournamentChannelId || t.discordChannelId;
      if (chId) {
        const ch = (await client.channels.fetch(chId).catch(() => null)) as TextChannel | null;
        if (ch && (ch as any).isTextBased?.()) await ch.send(discordMsg);
      }
      if (t.whatsappGroupId) {
        await db.collection("whatsappOutbox").add({
          action: "send-text",
          target: { type: "group", id: t.whatsappGroupId },
          text: waMsg,
          dedupeKey: `result-${tdoc.id}-${m.id}`,
          status: "pending",
          createdAt: new Date().toISOString(),
          source: "result-announcer",
        });
      }
      await db.collection(cfg.coll).doc(tdoc.id).collection("matches").doc(m.id).set({ [FIELD]: new Date().toISOString() }, { merge: true });
      console.log(`[Announcer] ${cfg.coll}/${tdoc.id}/${m.id} — ${wl.w}${t.whatsappGroupId ? " (+WA)" : ""}`);
    } catch (e: any) {
      console.error(`[Announcer] ${cfg.coll}/${tdoc.id}/${m.id} failed:`, e?.message || e);
    }
  }
}

export async function announceResults(client: Client): Promise<void> {
  const db = getDb();
  for (const cfg of GAMES) {
    try {
      const snap = await db.collection(cfg.coll).where("status", "in", cfg.statuses).get();
      for (const tdoc of snap.docs) await announceForTournament(client, db, cfg, tdoc);
    } catch (e: any) {
      console.error(`[Announcer] ${cfg.coll} query failed:`, e?.message || e);
    }
  }
}
