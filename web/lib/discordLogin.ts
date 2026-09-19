/**
 * Where to send the browser to start "Sign in with Discord," carrying the
 * page to return to afterward.
 *
 * The destination rides in the OAuth `state` param (see
 * app/api/auth/discord-login/route.ts), not sessionStorage. `state`
 * round-trips through Discord's own server and comes back on the callback's
 * query string, so it survives context hops sessionStorage can't: a link
 * opened in a new tab, an Android intent:// hand-off to the Discord app, or
 * the bot's /draft link opened in Discord's own in-app browser.
 */
export function discordLoginUrl(next?: string): string {
  const path = next ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/");
  return `/api/auth/discord-login?returnTo=${encodeURIComponent(path)}`;
}
