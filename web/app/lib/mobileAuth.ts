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

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

/**
 * Smart external link opener — tries native app first on every platform.
 *
 * Desktop:  opens web URL in a new tab, then fires the custom-protocol URL
 *           via window.location.href which triggers Chrome/Edge/Firefox's
 *           "Open <App>?" dialog when the desktop app is installed.
 *
 * Android:  uses an Intent URL so the OS opens the app if installed and
 *           falls back to the web URL automatically (no error dialog).
 *
 * iOS:      navigates to the custom-protocol URL; if the app is installed
 *           iOS opens it immediately. If not, a timeout redirects to the
 *           web URL instead.
 */
export function openExternalLink(
  webUrl: string,
  opts?: { protocol?: string; androidPackage?: string }
) {
  const protocol = opts?.protocol;
  const androidPackage = opts?.androidPackage;

  if (!protocol) {
    if (isMobile()) {
      window.location.href = webUrl;
    } else {
      window.open(webUrl, "_blank", "noopener,noreferrer");
    }
    return;
  }

  if (isAndroid() && androidPackage) {
    // Intent URL — app opens if installed; browser_fallback_url loads if not.
    const scheme = protocol.split("://")[0];
    const path = protocol.replace(/^\w+:\/\//, "");
    window.location.href =
      `intent://${path}#Intent;scheme=${scheme};package=${androidPackage};S.browser_fallback_url=${encodeURIComponent(webUrl)};end`;
  } else if (isMobile()) {
    // iOS / other mobile — try app scheme, fall back to web after 1.5 s.
    window.location.href = protocol;
    const timer = setTimeout(() => {
      if (!document.hidden) window.location.href = webUrl;
    }, 1500);
    const onHide = () => {
      if (document.hidden) {
        clearTimeout(timer);
        document.removeEventListener("visibilitychange", onHide);
      }
    };
    document.addEventListener("visibilitychange", onHide);
  } else {
    // Desktop — open web in new tab, then trigger OS protocol-handler dialog.
    window.open(webUrl, "_blank", "noopener,noreferrer");
    window.location.href = protocol;
  }
}

/** Opens a Discord community link (channel or invite) — tries native app first */
export function openDiscordLink(webUrl: string) {
  let protocol: string | undefined;
  const channelMatch = webUrl.match(/discord\.com\/channels\/(\d+\/\d+)/);
  if (channelMatch) protocol = `discord://discord.com/channels/${channelMatch[1]}`;
  const inviteMatch = webUrl.match(/discord\.gg\/(\w+)/);
  if (inviteMatch) protocol = `discord://invite/${inviteMatch[1]}`;
  openExternalLink(webUrl, { protocol, androidPackage: "com.discord" });
}

/** Opens a Steam community link — tries native Steam client first */
export function openSteamLink(webUrl: string) {
  openExternalLink(webUrl, {
    protocol: `steam://openurl/${webUrl}`,
    androidPackage: "com.valvesoftware.android.steam.community",
  });
}
