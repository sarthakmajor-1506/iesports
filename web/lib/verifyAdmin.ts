import { adminDb, adminAuth } from "@/lib/firebaseAdmin";

/**
 * Admin role system:
 *   - "super_admin": full access (uses ADMIN_SECRET or role on user doc)
 *   - "cafe_admin": tournament-scoped access (verified via Firebase Auth token)
 *
 * API routes call verifyAdmin() with the request body to determine access level.
 * Cafe admins can only access tournaments they own (ownerId === their uid).
 */

export type AdminRole = "super_admin" | "cafe_admin";

export interface AdminAuth {
  role: AdminRole;
  uid: string; // uid of the admin (for cafe admin) or "super" for secret-based
}

/**
 * Verify admin access from request body.
 *
 * Accepts either:
 *   1. { adminKey } — matches ADMIN_SECRET → super_admin
 *   2. { authToken } — Firebase Auth ID token → checks user doc for role
 *
 * Throws if unauthorized.
 */
export async function verifyAdmin(body: {
  adminKey?: string;
  authToken?: string;
}): Promise<AdminAuth> {
  // 1. Super admin via secret key
  if (body.adminKey && body.adminKey === process.env.ADMIN_SECRET) {
    return { role: "super_admin", uid: "super" };
  }

  // 2. Token-based auth (cafe admin or super admin by role)
  if (body.authToken) {
    try {
      const decoded = await adminAuth.verifyIdToken(body.authToken);
      const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
      if (!userDoc.exists) throw new Error("User not found");

      const role = userDoc.data()?.role as AdminRole | undefined;
      if (role === "super_admin") return { role: "super_admin", uid: decoded.uid };
      if (role === "cafe_admin") return { role: "cafe_admin", uid: decoded.uid };

      throw new Error("No admin role");
    } catch (e: any) {
      throw new Error("Unauthorized: " + (e.message || "invalid token"));
    }
  }

  throw new Error("Unauthorized");
}

/**
 * Check if a cafe admin owns a specific tournament.
 * Super admins always have access.
 */
export async function verifyTournamentAccess(
  admin: AdminAuth,
  tournamentId: string,
  collection: string = "valorantTournaments"
): Promise<boolean> {
  if (admin.role === "super_admin") return true;

  const tDoc = await adminDb.collection(collection).doc(tournamentId).get();
  if (!tDoc.exists) return false;

  return tDoc.data()?.ownerId === admin.uid;
}
