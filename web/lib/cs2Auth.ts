/** Constant-time comparison for the CS2_MATCH_CONFIG_TOKEN shared secret,
 *  used by both the match-config GET and the matchzy-events webhook POST. */
export function safeTokenEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The shared secret, trimmed. This value is pasted by hand into two separate
 * hosting dashboards (Vercel and Railway) and must match byte for byte on
 * both. A stray space is invisible in those UIs but makes every MatchZy
 * request 401 with no hint as to why, so normalise here rather than trust the
 * paste. Returns null when unset so callers fail closed.
 */
export function cs2ConfigToken(): string | null {
  const raw = process.env.CS2_MATCH_CONFIG_TOKEN?.trim();
  return raw ? raw : null;
}

/** Validate an inbound MatchZy request's token header against the configured
 *  secret. Both sides trimmed, constant-time compared. */
export function cs2TokenValid(provided: string | null | undefined): boolean {
  const configured = cs2ConfigToken();
  const given = provided?.trim();
  if (!configured || !given) return false;
  return safeTokenEqual(given, configured);
}
