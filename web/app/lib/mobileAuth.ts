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

/**
 * Opens an external community link with smart app + new-tab handling.
 *
 * Desktop: opens web URL in a new tab AND silently attempts to launch
 *   the desktop app (Steam client / Discord app) via a hidden iframe.
 *
 * Mobile: navigates directly to the web URL — iOS Universal Links and
 *   Android App Links will open the native app when installed, falling
 *   back to the browser automatically.
 */
export function openExternalLink(webUrl: string, appProtocolUrl?: string) {
  if (isMobile()) {
    window.location.href = webUrl;
  } else {
    window.open(webUrl, "_blank", "noopener,noreferrer");
    if (appProtocolUrl) {
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = appProtocolUrl;
      document.body.appendChild(iframe);
      setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 1000);
    }
  }
}

/** Opens a Discord community link (channel or invite) — tries native app first */
export function openDiscordLink(webUrl: string) {
  let appUrl: string | undefined;
  const channelMatch = webUrl.match(/discord\.com\/channels\/(\d+\/\d+)/);
  if (channelMatch) appUrl = `discord://discord.com/channels/${channelMatch[1]}`;
  const inviteMatch = webUrl.match(/discord\.gg\/(\w+)/);
  if (inviteMatch) appUrl = `discord://discord.gg/${inviteMatch[1]}`;
  openExternalLink(webUrl, appUrl);
}

/** Opens a Steam community link — tries native Steam client first */
export function openSteamLink(webUrl: string) {
  openExternalLink(webUrl, `steam://openurl/${webUrl}`);
}
