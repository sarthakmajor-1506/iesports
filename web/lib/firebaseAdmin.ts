import { initializeApp, cert, getApps, getApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getStorage, type Storage } from "firebase-admin/storage";

/**
 * Firebase Admin SDK — lazy-initialized.
 *
 * Eager init at module load (the previous pattern) crashes Next.js's
 * "Collecting page data" build pass: that worker imports every API route
 * to compute static/dynamic routing, but doesn't have FIREBASE_PROJECT_ID
 * / CLIENT_EMAIL / PRIVATE_KEY set in its env, so `cert()` throws and
 * the entire build fails. Every Vercel deploy was silently failing for
 * hours because of this — see the failed-deploy logs showing
 * "Failed to collect page data for /api/admin/adjust-rating".
 *
 * Proxy-based lazy exports defer the SDK init until the first method call
 * (i.e. at request time, when env vars ARE set), keeping the public API
 * (`adminDb.collection(...)`, etc.) unchanged for every existing caller.
 */
function ensureApp(): App {
  if (getApps().length) return getApp();
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin SDK not configured — set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
    );
  }
  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    storageBucket: "iesports-auth.firebasestorage.app",
  });
}

const lazy = <T extends object>(get: () => T): T =>
  new Proxy({} as T, {
    // CRITICAL: bind methods to the real target. Without this, calling
    // `adminDb.collection("...")` invokes the unbound method with `this`
    // set to the Proxy, and the Firestore SDK's internal write to
    // `this._settingsFrozen = true` throws "Cannot assign to read only
    // property '_settingsFrozen'" — the Proxy has no `set` trap that
    // forwards to the underlying instance.
    get(_t, prop) {
      const target = get();
      const value = (target as any)[prop];
      return typeof value === "function" ? value.bind(target) : value;
    },
    // Forward direct property writes (Firestore SDK does these internally).
    set(_t, prop, value) {
      (get() as any)[prop] = value;
      return true;
    },
    has(_t, prop) { return prop in (get() as any); },
    ownKeys(_t) { return Reflect.ownKeys(get() as any); },
    getOwnPropertyDescriptor(_t, prop) {
      return Object.getOwnPropertyDescriptor(get() as any, prop);
    },
  });

export const adminDb: Firestore = lazy(() => getFirestore(ensureApp()));
export const adminAuth: Auth = lazy(() => getAuth(ensureApp()));
export const adminStorage: Storage = lazy(() => getStorage(ensureApp()));
