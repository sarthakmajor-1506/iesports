import { adminDb } from "@/lib/firebaseAdmin";
import { getWhatsAppConfig } from "@/lib/whatsapp";
import { checkoutGroup, releaseGroup } from "@/lib/whatsappGroupPool";

/**
 * Tournament-lifecycle WhatsApp orchestration (the reuse-pool model).
 *
 * Every function here is:
 *   - GATED behind config/whatsapp.lifecycleEnabled (no-op when off), so these
 *     can be wired into live routes and stay dormant until the flag is flipped.
 *   - BEST-EFFORT: all errors are swallowed + logged. A WhatsApp problem must
 *     never break registration, team publishing, or result fetching.
 *   - IDEMPOTENT: re-running won't double-provision (guarded by settled handle
 *     fields / the whatsappProvisioned flag).
 *
 * Scope is exactly two group types: per-tournament and per-team. There is no
 * "general" group — community-wide broadcasts use the community Announcements
 * group (the community parent) directly.
 */

/** Normalize a team `members` array (uid strings or {uid} objects) to uid[]. */
function toUids(members: any[]): string[] {
  return (members || [])
    .map((m) => (typeof m === "string" ? m : m?.uid))
    .filter((u: any): u is string => typeof u === "string" && !!u);
}

/** Resolve a set of uids to dialable phone digits (deduped, empties dropped). */
async function phonesForUids(uids: string[]): Promise<string[]> {
  const unique = [...new Set(uids.filter(Boolean))];
  if (unique.length === 0) return [];
  const snaps = await Promise.all(unique.map((u) => adminDb.collection("users").doc(u).get()));
  const out: string[] = [];
  for (const s of snaps) {
    const phone = s.exists ? (s.data() as any)?.phone : null;
    const digits = phone ? String(phone).replace(/[^\d]/g, "") : "";
    if (digits) out.push(digits);
  }
  return out;
}

/**
 * Provision the per-tournament WhatsApp group with every registered player.
 * Idempotent via the `whatsappProvisioned` flag on the tournament doc.
 */
export async function provisionTournamentGroup(
  tournamentId: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const cfg = await getWhatsAppConfig();
    if (!cfg.lifecycleEnabled) return { ok: false, reason: "disabled" };
    const tRef = adminDb.collection("valorantTournaments").doc(tournamentId);
    const tSnap = await tRef.get();
    if (!tSnap.exists) return { ok: false, reason: "no-tournament" };
    const t = tSnap.data() as any;
    if (t.whatsappProvisioned === true || t.whatsappTournamentGroupId) {
      return { ok: false, reason: "already-provisioned" };
    }
    const players = await tRef.collection("soloPlayers").get();
    const uids = players.docs.map((d) => (d.data() as any).uid || d.id);
    const phones = await phonesForUids(uids);
    await checkoutGroup({
      type: "tournament",
      name: String(t.name || "iesports tournament"),
      participantPhones: phones,
      tournamentId,
      settleDocPath: `valorantTournaments/${tournamentId}`,
      settleField: "whatsappTournamentGroupId",
      adminsOnly: true,
    });
    await tRef.set(
      { whatsappProvisioned: true, whatsappProvisionedAt: new Date().toISOString() },
      { merge: true },
    );
    return { ok: true };
  } catch (e: any) {
    console.warn("[WA lifecycle] provisionTournamentGroup:", e?.message || e);
    return { ok: false, reason: e?.message || "error" };
  }
}

/**
 * Provision a per-team WhatsApp group for each team in a tournament. Idempotent
 * per team via the `whatsappTeamGroupId` field on each team doc.
 */
export async function provisionTeamGroups(
  tournamentId: string,
): Promise<{ ok: boolean; count?: number; reason?: string }> {
  try {
    const cfg = await getWhatsAppConfig();
    if (!cfg.lifecycleEnabled) return { ok: false, reason: "disabled" };
    const tRef = adminDb.collection("valorantTournaments").doc(tournamentId);
    const tSnap = await tRef.get();
    if (!tSnap.exists) return { ok: false, reason: "no-tournament" };
    const tName = String((tSnap.data() as any).name || "iesports");
    const teamsSnap = await tRef.collection("teams").get();
    let count = 0;
    for (const teamDoc of teamsSnap.docs) {
      const team = teamDoc.data() as any;
      if (team.whatsappTeamGroupId) continue; // already provisioned
      const phones = await phonesForUids(toUids(team.members));
      const teamName = String(team.teamName || `Team ${team.teamIndex || ""}`).trim();
      await checkoutGroup({
        type: "team",
        name: `${tName} — ${teamName}`,
        participantPhones: phones,
        tournamentId,
        teamId: teamDoc.id,
        settleDocPath: `valorantTournaments/${tournamentId}/teams/${teamDoc.id}`,
        settleField: "whatsappTeamGroupId",
        adminsOnly: true,
      });
      count++;
    }
    return { ok: true, count };
  } catch (e: any) {
    console.warn("[WA lifecycle] provisionTeamGroups:", e?.message || e);
    return { ok: false, reason: e?.message || "error" };
  }
}

/**
 * Release every pooled group (tournament + teams) assigned to a finished
 * tournament back to the free pool. Bot strips members to staff, renames, and
 * (best-effort) revokes the invite.
 */
export async function releaseTournamentGroups(
  tournamentId: string,
): Promise<{ ok: boolean; released?: number; reason?: string }> {
  try {
    const cfg = await getWhatsAppConfig();
    if (!cfg.lifecycleEnabled) return { ok: false, reason: "disabled" };
    const poolSnap = await adminDb
      .collection("whatsappGroupPool")
      .where("assignedTournamentId", "==", tournamentId)
      .get();
    let released = 0;
    for (const d of poolSnap.docs) {
      await releaseGroup(d.id);
      released++;
    }
    return { ok: true, released };
  } catch (e: any) {
    console.warn("[WA lifecycle] releaseTournamentGroups:", e?.message || e);
    return { ok: false, reason: e?.message || "error" };
  }
}
