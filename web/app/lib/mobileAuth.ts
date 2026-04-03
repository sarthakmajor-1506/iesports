/**
 * On mobile, fetches the OAuth URL from our API and navigates directly to the
 * provider domain (discord.com / steamcommunity.com). This lets iOS universal
 * links and Android app links open the native app when installed.
 *
 * On desktop (or if the fetch fails), falls back to the normal server-redirect flow.
 */

function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export async function navigateWithAppPriority(apiPath: string) {
  if (isMobile()) {
    try {
      const separator = apiPath.includes("?") ? "&" : "?";
      const res = await fetch(`${apiPath}${separator}redirect=false`);
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
          return;
        }
      }
    } catch {
      // fall through to default
    }
  }
  window.location.href = apiPath;
}
