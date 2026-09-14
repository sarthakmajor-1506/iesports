// Signed requests to our own API.
//
// Registration, unregistration and payment routes take a `uid` and used to
// believe it. They now verify a Firebase ID token instead, so every browser
// call to one of them has to carry the caller's token. This is the one place
// that fetches it, so no call site has to remember how.
//
// The token is short-lived and the SDK refreshes it, so `getIdToken()` is
// called per request rather than cached here.

import { getFirebaseAuth } from "@/lib/firebase";

/** Bearer header for whoever is signed in, merged onto whatever else is needed. */
export async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  try {
    const { auth } = await getFirebaseAuth();
    const token = await auth.currentUser?.getIdToken();
    return token ? { Authorization: `Bearer ${token}`, ...extra } : { ...extra };
  } catch {
    // No token means the route answers 401, which is the correct outcome for a
    // signed-out caller. Failing the fetch here would just be a worse message.
    return { ...extra };
  }
}

/** fetch(), with the signed-in user's token attached. */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = await authHeaders((init.headers as Record<string, string>) || {});
  return fetch(input, { ...init, headers });
}

/** fetch() for a JSON POST body, with the token attached. */
export async function authPost(input: string, body: unknown, init: RequestInit = {}): Promise<Response> {
  return authFetch(input, {
    ...init,
    method: "POST",
    headers: { "Content-Type": "application/json", ...((init.headers as Record<string, string>) || {}) },
    body: JSON.stringify(body),
  });
}
