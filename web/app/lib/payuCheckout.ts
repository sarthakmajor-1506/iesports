// Client-side hand-off to PayU Hosted Checkout.
//
// PayU's checkout is a page, not an API — the browser has to arrive there via a
// real form POST carrying the signed fields. fetch() cannot do this: the
// response is HTML meant to be rendered, and PayU sets its own cookies on that
// navigation.
//
// The flow is deliberately "register first, pay only if told to": the server
// answers 402 when a tournament needs paying for, so the client never has to
// decide what is free, and a mispriced client can't skip the charge.

export type CheckoutGame = "dota2" | "dota_solo" | "valorant" | "cs2";
export type CheckoutMode = "solo" | "team_create" | "team_join";

const escapeAttr = (v: string) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function formHtml(action: string, params: Record<string, string>): string {
  const inputs = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${escapeAttr(k)}" value="${escapeAttr(v)}">`)
    .join("");

  // A visible fallback matters: if the auto-submit is blocked for any reason,
  // an empty tab is a dead end, and the player has already decided to pay.
  return `<!doctype html><html><head><meta charset="utf-8"><title>Redirecting to PayU…</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#0e0e0e;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="text-align:center">
    <p style="font-size:15px">Taking you to PayU…</p>
    <form id="payuform" method="POST" action="${escapeAttr(action)}">${inputs}
      <button type="submit" style="margin-top:14px;padding:11px 20px;font-size:14px;border:0;border-radius:8px;background:#3CCBFF;color:#04202b;font-weight:700;cursor:pointer">Continue</button>
    </form>
  </div>
  <script>document.getElementById('payuform').submit();</script>
</body></html>`;
}

function postInThisTab(action: string, params: Record<string, string>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  form.style.display = "none";
  for (const [name, value] of Object.entries(params)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value ?? "";
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export type CheckoutOutcome =
  | { kind: "redirecting" }                 // this tab is leaving for PayU
  | { kind: "popup"; txnid: string }        // paying in another tab; watch the status
  | { kind: "free" }                        // no fee — caller should just register
  | { kind: "already_paid" }                // entitlement exists — caller should just register
  | { kind: "error"; error: string };

export async function startPayuCheckout(args: {
  uid: string;
  game: CheckoutGame;
  tournamentId: string;
  mode?: CheckoutMode;
  /** Open PayU in a second tab and leave this page intact. */
  newTab?: boolean;
}): Promise<CheckoutOutcome> {
  // The tab MUST be opened synchronously, inside the click that triggered this.
  // Opening it after the `await` below costs the user-gesture context and every
  // popup blocker kills it. Opened blank now, filled in once we have the signed
  // fields; closed again if the server says no payment is needed.
  const tab = args.newTab ? window.open("", "_blank") : null;

  try {
    const res = await fetch("/api/payments/payu/initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: args.uid,
        game: args.game,
        tournamentId: args.tournamentId,
        mode: args.mode || "solo",
        // Where to send the player once PayU is done with them.
        returnTo: `${window.location.pathname}${window.location.search}`,
      }),
    });
    const data = await res.json();

    if (!res.ok)        { tab?.close(); return { kind: "error", error: data?.error || "Could not start payment" }; }
    if (data.free)      { tab?.close(); return { kind: "free" }; }
    if (data.alreadyPaid) { tab?.close(); return { kind: "already_paid" }; }
    if (!data.action || !data.params) {
      tab?.close();
      return { kind: "error", error: "Payment gateway did not return a checkout" };
    }

    // Remember where to come back to, matching how the Steam/Discord hand-offs
    // preserve the player's place in the registration flow.
    try { localStorage.setItem("pendingRegistration", window.location.pathname); } catch {}

    if (tab && !tab.closed) {
      tab.document.open();
      tab.document.write(formHtml(data.action, data.params));
      tab.document.close();
      tab.focus?.();
      return { kind: "popup", txnid: data.txnid };
    }

    // Popup blocked, or a same-tab checkout was requested. Either way the
    // player still gets to PayU — they just come back via the return URL.
    postInThisTab(data.action, data.params);
    return { kind: "redirecting" };
  } catch (e: any) {
    tab?.close();
    return { kind: "error", error: e?.message || "Could not reach the payment service" };
  }
}
