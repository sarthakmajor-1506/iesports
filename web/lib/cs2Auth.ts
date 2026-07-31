/** Constant-time comparison for the CS2_MATCH_CONFIG_TOKEN shared secret,
 *  used by both the match-config GET and the matchzy-events webhook POST. */
export function safeTokenEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
