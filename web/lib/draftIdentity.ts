import { adminDb } from "@/lib/firebaseAdmin";

/**
 * Draft Lab — who a uid actually is.
 *
 * THE BUG THIS EXISTS TO CLOSE. Every write to the ladder or the weekly board
 * used to trust a name string the client sent with the request. Most call
 * sites got it right, but one did not: a player matched into a live room as
 * the joining side was seated by an internal auto-join call that read
 * `localStorage.getItem("draftlab_name")` — a field only ever populated for a
 * signed-out guest typing a name into the "PLAYING AS" box — instead of their
 * resolved Steam/Discord name. For a signed-in player that value is empty, so
 * the fallback fired and "Guest" got written into the room, and from there
 * into the ladder, permanently, the next time they settled a game. Meanwhile
 * the same player's SOLO games, submitted through a different code path that
 * built the name correctly, showed up right there. Two boards, two paths, one
 * of them wrong — which is exactly the shape of bug a "pass the right string"
 * fix does not stay fixed against; the next new call site can make the same
 * mistake.
 *
 * THE FIX. Nothing that writes to a permanent board trusts a client-supplied
 * name or avatar again. It looks the account up here instead. `users/{uid}` is
 * the same collection AuthContext reads client-side to decide what to show in
 * the navbar, and it is written directly by the Steam-link and Discord-login
 * routes the moment an account exists — so for any uid that can reach a
 * ranked screen at all, this is already populated and already correct.
 */

export type PlayerIdentity = { name: string; avatar: string | null };

export async function resolvePlayerIdentity(
  uid: string,
  fallbackName?: string | null,
  fallbackAvatar?: string | null
): Promise<PlayerIdentity> {
  try {
    const snap = await adminDb.collection("users").doc(uid).get();
    const d = snap.exists ? snap.data()! : {};
    const name = d.steamName || d.discordUsername || fallbackName || "Player";
    const avatar = d.steamAvatar || d.discordAvatar || fallbackAvatar || null;
    return { name, avatar };
  } catch {
    // A lookup failure must never be the reason a settlement fails — better a
    // provisional name this once than a game whose result cannot be recorded.
    return { name: fallbackName || "Player", avatar: fallbackAvatar ?? null };
  }
}
