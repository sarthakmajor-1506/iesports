/**
 * Result announcer — robust, settle-path-agnostic operational messaging.
 *
 * Triggers on the END STATE (a Dota match flipping to `completed`), NOT on a
 * specific settle path — so it catches GC-settled, web-auto-settled, and
 * manually-settled matches alike, and announces each exactly once. For every
 * newly-completed match it posts a result + "next game later today" message to
 * the tournament's Discord channel, and (when `tournament.whatsappGroupId` is
 * set) the same to WhatsApp via the outbox. Idempotent via `resultAnnouncedAt`.
 *
 * Anti-backblast: only announces matches completed within WINDOW_MS, so deploying
 * never spams a backlog of old results (existing completed matches are also
 * backfilled with resultAnnouncedAt at rollout).
 */
import { Client, TextChannel } from "discord.js";
import { getDb } from "./firebase";

const FIELD = "resultAnnouncedAt";
const WINDOW_MS = 6 * 3600 * 1000;

const istDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const istTime = (d: Date) => d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });

export async function announceResults(client: Client): Promise<void> {
  const db = getDb();
  let tourneys;
  try {
    tourneys = await db.collection("tournaments").where("game", "==", "dota2").where("status", "==", "ongoing").get();
  } catch (e: any) {
    console.error("[Announcer] tournaments query failed:", e?.message || e);
    return;
  }
  const nowMs = Date.now();

  for (const tdoc of tourneys.docs) {
    const t: any = tdoc.data();
    const msnap = await db.collection("tournaments").doc(tdoc.id).collection("matches").get();
    const matches = msnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    const todo = matches.filter((m: any) =>
      m.status === "completed" && !m[FIELD] &&
      (m.dotaMatchId || m.game1?.dotaMatchId) &&
      m.completedAt && (nowMs - Date.parse(m.completedAt)) < WINDOW_MS
    );

    for (const m of todo) {
      try {
        const winnerName = m.winner === "team1" ? m.team1Name : m.winner === "team2" ? m.team2Name : null;
        const loserName = m.winner === "team1" ? m.team2Name : m.winner === "team2" ? m.team1Name : null;
        if (!winnerName) continue; // winner not resolvable yet — leave unmarked so it retries

        const dur = Math.round((m.game1?.durationSeconds || m.durationSec || 0) / 60);
        const score = `${m.team1Score ?? 0}–${m.team2Score ?? 0}`;
        const tname = t.name || "iesports";

        // Next game later TODAY (IST) in this tournament, if any.
        const next = matches
          .filter((x: any) =>
            x.status !== "completed" && x.scheduledTime &&
            istDay(new Date(x.scheduledTime)) === istDay(new Date(nowMs)) &&
            Date.parse(x.scheduledTime) > nowMs &&
            x.team1Name && x.team2Name && x.team1Name !== "TBD" && x.team2Name !== "TBD")
          .sort((a: any, b: any) => String(a.scheduledTime).localeCompare(String(b.scheduledTime)))[0];

        const durStr = dur ? ` · ⏱ ${dur}m` : "";
        const discordMsg =
          `🏆 **${tname} — Result**\n**${winnerName}** def. ${loserName}  (${score})${durStr}` +
          (next ? `\n\n⚔️ **Next up today:** ${next.team1Name} vs ${next.team2Name} — ${istTime(new Date(next.scheduledTime))} IST` : "");
        const waMsg =
          `🏆 *${tname} — Result*\n*${winnerName}* def. ${loserName}  (${score})${durStr}` +
          (next ? `\n\n⚔️ *Next up today:* ${next.team1Name} vs ${next.team2Name} — ${istTime(new Date(next.scheduledTime))} IST` : "");

        // Discord (always)
        const chId = m.tournamentChannelId || t.discordChannelId;
        if (chId) {
          const ch = (await client.channels.fetch(chId).catch(() => null)) as TextChannel | null;
          if (ch && (ch as any).isTextBased?.()) await ch.send(discordMsg);
        }
        // WhatsApp (gated: only when a group is configured on the tournament)
        if (t.whatsappGroupId) {
          await db.collection("whatsappOutbox").add({
            action: "send-text",
            target: { type: "group", id: t.whatsappGroupId },
            text: waMsg,
            dedupeKey: `dota-result-${tdoc.id}-${m.id}`,
            status: "pending",
            createdAt: new Date().toISOString(),
            source: "result-announcer",
          });
        }

        await db.collection("tournaments").doc(tdoc.id).collection("matches").doc(m.id).set({ [FIELD]: new Date().toISOString() }, { merge: true });
        console.log(`[Announcer] announced ${tdoc.id}/${m.id} — ${winnerName}${t.whatsappGroupId ? " (+WA)" : ""}`);
      } catch (e: any) {
        console.error(`[Announcer] ${tdoc.id}/${m.id} failed:`, e?.message || e);
      }
    }
  }
}
