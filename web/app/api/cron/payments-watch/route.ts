import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { sendDM, notifyOps } from "@/lib/discord";
import { PAID_GAMES, type PaidGame } from "@/lib/paidEntry";

/**
 * GET /api/cron/payments-watch  (Vercel Cron, daily)
 *
 * Every money state that needs a person used to reach nobody. It was written to
 * Firestore and waited to be remembered:
 *
 *   - a player pays, their profile is incomplete, the registration fails, and
 *     nothing ever tells them. One player sat like that for 16 days with ₹500
 *     taken and no slot, and the only reason we found out was a headcount that
 *     did not add up.
 *   - a payment lands in `review` (amount mismatch, bad hash). That state exists
 *     so a discrepancy reaches a human, and it never did.
 *   - a refund is owed after a withdrawal.
 *   - a payment sits `pending` for days, which is indistinguishable to the
 *     player from money taken and lost.
 *
 * This is the clock on all four. It DMs the players who can fix their own
 * situation and posts one digest for the rest.
 *
 * Auth: Vercel sets `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is
 * configured. `?secret=<ADMIN_SECRET>` works for a manual run.
 */
function authorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") || "";
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  const secret = req.nextUrl.searchParams.get("secret");
  if (process.env.ADMIN_SECRET && secret === process.env.ADMIN_SECRET) return true;
  return false;
}

/** Wait this long after payment before nudging, so we never chase someone mid-setup. */
const SETUP_GRACE_MS = 2 * 60 * 60 * 1000;
/** Re-send at most this often, so a player who never finishes is not DMed daily. */
const NUDGE_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** A payment stuck here this long is worth a human looking at it. */
const STALE_PENDING_MS = 24 * 60 * 60 * 1000;

const MISSING_LABEL: Record<string, string> = {
  name: "your full name",
  phone: "your phone number",
  discord: "your Discord account",
  riot: "your Riot ID",
  steam: "your Steam account",
};

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dryRun = req.nextUrl.searchParams.get("dry") === "1";
  const now = Date.now();
  const nudged: string[] = [];
  const digest: string[] = [];

  try {
    // ── Paid, still not registered ─────────────────────────────────────────
    const paidSnap = await adminDb.collection("payments").where("status", "==", "paid").get();

    for (const d of paidSnap.docs) {
      const p = d.data() as any;
      const cfg = PAID_GAMES[p.game as PaidGame];
      if (!cfg) continue;
      if (p.registration?.ok) continue;

      const settledAt = Date.parse(p.settledAt || p.createdAt || "") || 0;
      if (!settledAt || now - settledAt < SETUP_GRACE_MS) continue;

      const userSnap = await adminDb.collection("users").doc(p.uid).get();
      const u = (userSnap.data() || {}) as any;

      // Registered by another route (they came back and clicked through)?
      // Then there is nothing to chase.
      // A captain's payment is done when its team exists — not when the captain
      // is on the roster, which a player who paid solo before the switch already was.
      if (p.mode === "team_create" ? !!p.team?.teamId : (u[cfg.registeredField] || []).includes(p.tournamentId)) continue;

      // Withdrawn and awaiting a refund is not an unfinished setup.
      const refund = await adminDb.collection("refunds").doc(d.id).get();
      if (refund.exists && (refund.data() as any)?.status === "owed") continue;

      const missing = [
        !u.fullName && "name",
        !(u.phone || u.phoneNumber) && "phone",
        !u.discordId && "discord",
        p.game === "valorant" ? (!u.riotGameName && "riot") : (!u.steamId && "steam"),
      ].filter(Boolean) as string[];

      const lastNudge = Date.parse(p.setupNudge?.lastSentAt || "") || 0;
      const due = !lastNudge || now - lastNudge > NUDGE_INTERVAL_MS;

      if (!missing.length) {
        // Paid, profile complete, still not in. That is a fault, not a wait.
        digest.push(`⚠️ **Paid, complete, NOT registered** — ${u.fullName || p.uid} · ${cfg.label} · ${p.tournamentName || p.tournamentId} · \`${d.id}\`${p.registration?.error ? ` · ${p.registration.error}` : ""}`);
        continue;
      }

      if (!due) continue;

      const discordId = u.discordId || (String(p.uid).startsWith("discord_") ? String(p.uid).replace("discord_", "") : "");
      const list = missing.map((m) => MISSING_LABEL[m] || m).join(", ");
      const link = `${process.env.NEXT_PUBLIC_APP_URL || "https://iesports.in"}${
        p.game === "valorant" ? `/valorant/tournament/${p.tournamentId}`
        : p.game === "cs2" ? `/cs2/tournament/${p.tournamentId}`
        : p.game === "dota_solo" ? `/solo/${p.tournamentId}`
        : `/tournament/${p.tournamentId}`
      }`;

      if (discordId && !dryRun) {
        await sendDM(
          discordId,
          [
            `Your slot in **${p.tournamentName || p.tournamentId}** is paid for and being held for you.`,
            ``,
            `We still need ${list} before you are on the roster. It takes a minute:`,
            link,
            ``,
            `You will not be charged again. This just finishes what you already paid for.`,
          ].join("\n")
        ).catch(() => {});
      }

      if (!dryRun) {
        await d.ref.set(
          { setupNudge: { lastSentAt: new Date().toISOString(), missing, count: (p.setupNudge?.count || 0) + 1 } },
          { merge: true }
        );
      }
      nudged.push(`${p.uid} (${missing.join(", ")})`);
    }

    // ── Payments that settled with an anomaly ──────────────────────────────
    const reviewSnap = await adminDb.collection("payments").where("status", "==", "review").get();
    for (const d of reviewSnap.docs) {
      const p = d.data() as any;
      digest.push(`⚠️ **Review** — ₹${p.amount} · ${p.uid} · ${p.tournamentName || p.tournamentId} · \`${d.id}\` · ${p.settleNote || "no note"}`);
    }

    // ── Payments stuck in progress ─────────────────────────────────────────
    const pendingSnap = await adminDb.collection("payments").where("status", "==", "pending").get();
    for (const d of pendingSnap.docs) {
      const p = d.data() as any;
      const age = now - (Date.parse(p.updatedAt || p.createdAt || "") || now);
      if (age < STALE_PENDING_MS) continue;
      digest.push(`⏳ **Pending ${Math.floor(age / 86400000)}d** — ₹${p.amount} · ${p.uid} · \`${d.id}\``);
    }

    // ── Refunds owed ───────────────────────────────────────────────────────
    const refundSnap = await adminDb.collection("refunds").where("status", "==", "owed").get();
    for (const d of refundSnap.docs) {
      const r = d.data() as any;
      digest.push(`↩ **Refund owed** — ₹${r.amount} · ${r.playerName || r.uid} · ${r.tournamentName} · ${r.upiId ? `UPI \`${r.upiId}\`` : "**no UPI on file**"} · \`${d.id}\``);
    }

    // ── Slot counters that disagree with the roster ────────────────────────
    // The counter is what players see and what capacity is checked against, so
    // a drift is both a lie on the page and a slot nobody can buy.
    // Status values differ per game ("upcoming"/"active"/"ongoing"/"Open"), so
    // the finished ones are filtered out here rather than in the query.
    const DONE = new Set(["ended", "completed"]);
    for (const [, cfg] of Object.entries(PAID_GAMES)) {
      const tournaments = await adminDb.collection(cfg.collection).get();
      for (const t of tournaments.docs) {
        const data = t.data() as any;
        if (DONE.has(String(data.status || "").toLowerCase())) continue;
        const players = await t.ref.collection(cfg.playersSubcollection).get();
        const booked = Number(data.slotsBooked) || 0;
        if (booked !== players.size) {
          digest.push(`🔢 **Slot count drift** — ${cfg.label} · ${data.name || t.id} · slotsBooked=${booked} actual=${players.size}`);
        }
      }
    }

    if (digest.length && !dryRun) {
      await notifyOps([`**Payments watch** — ${new Date().toISOString().slice(0, 10)}`, ...digest].join("\n")).catch(() => {});
    }

    return NextResponse.json({ ok: true, dryRun, nudged, digest });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}
