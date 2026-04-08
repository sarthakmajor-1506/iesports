import { adminDb, adminAuth } from "@/lib/firebaseAdmin";

/**
 * Drop-in replacement for `adminKey !== process.env.ADMIN_SECRET`.
 * Returns true if NOT authorized (same semantics as the old check).
 * Accepts ADMIN_SECRET or a Firebase Auth ID token from a cafe/super admin.
 */
export async function isNotAdmin(adminKey: string | undefined): Promise<boolean> {
  if (!adminKey) return true;
  if (adminKey === process.env.ADMIN_SECRET) return false; // authorized
  // Try as Firebase token
  try {
    const decoded = await adminAuth.verifyIdToken(adminKey);
    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userDoc.exists) return true;
    const role = userDoc.data()?.role;
    return role !== "super_admin" && role !== "cafe_admin";
  } catch {
    return true;
  }
}

/**
 * Lightweight admin check for API routes.
 *
 * Accepts either:
 *   1. adminKey === ADMIN_SECRET → super admin (full access)
 *   2. adminKey is a Firebase Auth ID token → verifies token, checks user role,
 *      and optionally checks tournament ownership for cafe admins
 *
 * This means API routes don't need any changes — they already pass `adminKey`.
 * The admin page passes either the secret (super admin) or a Firebase ID token (cafe admin).
 */
export async function checkAdmin(
  adminKey: string | undefined,
  tournamentId?: string,
  collection?: string
): Promise<{ ok: boolean; role: "super_admin" | "cafe_admin"; uid: string }> {
  if (!adminKey) return { ok: false, role: "super_admin", uid: "" };

  // 1. Check if it's the super admin secret
  if (adminKey === process.env.ADMIN_SECRET) {
    return { ok: true, role: "super_admin", uid: "super" };
  }

  // 2. Try as Firebase Auth ID token
  try {
    const decoded = await adminAuth.verifyIdToken(adminKey);
    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userDoc.exists) return { ok: false, role: "super_admin", uid: "" };

    const role = userDoc.data()?.role;
    if (role === "super_admin") return { ok: true, role: "super_admin", uid: decoded.uid };
    if (role !== "cafe_admin") return { ok: false, role: "super_admin", uid: "" };

    // Cafe admin — check tournament ownership if tournamentId provided
    if (tournamentId && collection) {
      const tDoc = await adminDb.collection(collection).doc(tournamentId).get();
      if (!tDoc.exists || tDoc.data()?.ownerId !== decoded.uid) {
        return { ok: false, role: "cafe_admin", uid: decoded.uid };
      }
    }

    return { ok: true, role: "cafe_admin", uid: decoded.uid };
  } catch {
    return { ok: false, role: "super_admin", uid: "" };
  }
}
