# Payments — PayU

Paid tournament entry, end to end. Written after building and running it against
PayU's test environment on 1 Aug 2026; every claim here was observed, not
assumed.

---

## How it works

```
player clicks Register
      │
      ▼
POST /api/cs2/solo  (or any registration route)
      │  requirePaidEntry() → 402 { requiresPayment: true, entryFee }
      ▼
confirmation step — amount shown, player chooses to continue
      │  never redirect straight to a gateway off a button marked "Register"
      ▼
POST /api/payments/payu/initiate
      │  reads the fee from the tournament doc, writes payments/{txnid},
      │  signs the fields
      ▼
browser form-POSTs to test.payu.in/_payment      ← must be a real form POST
      │
      ▼
player pays (UPI / net banking / card)
      │
      ├─ browser  → POST /api/payments/payu/callback   (fast path)
      └─ server   → POST /api/payments/payu/webhook    (reliable path)
                          │
                          ▼
                 settlePayuPayment()
                   1. check the response hash
                   2. ask PayU what happened  ← the authority
                   3. compare amount to what we stored
                   4. transaction: mark paid, once
                   5. grant paidEntries/{game__tournament__uid}
                   6. call the registration route normally
                          │
                          ▼
             redirect → /payment/{txnid}
```

**The registration itself is never reimplemented.** Settlement calls the same
`/api/cs2/solo` (or equivalent) that a free tournament uses, so validation, rank
sync and the Discord DM cannot drift between the paid and free paths. The
entitlement granted in step 5 is what lets that route's own gate through.

---

## Charging a player

Turning payment on for a tournament is one field: set `entryFee` on the
tournament document. There is no separate switch, and no code change.

```bash
npx tsx scripts/dev-tools/payuTools.ts fee --game=valorant --id=<id> --fee=500 --apply
```

The UI derives everything else from that number:

- the entry fee is shown **before** the player commits, on the registration
  step, with "per player — each teammate pays their own" on team flows, because
  captains assume they are buying five slots;
- the confirm step shows the amount, names PayU, and says which methods work
  (UPI and Net Banking — cards are not enabled), with a "Not now" out;
- the button reads `Continue — ₹500 →` rather than `Register`, so the click that
  leads to a payment never looks like the click that doesn't.

`initiate` re-checks everything the registration route demands — profile
completeness, Discord, Steam or a verified Riot ID, deadline, slots, prior
registration — before creating a transaction. The UI only reaches payment after
those checks pass anyway, but the endpoint is directly reachable, and taking
money for a registration that is rejected seconds later is the worst failure
this system has: the player is out of pocket and the refund is manual.

## Checkout UX — and the three things not to "simplify"

The flow was tuned against real drop-off. Each of these looks like an easy
cleanup and each will break something:

**1. The tab is opened synchronously, before the network call.**

```ts
const tab = args.newTab ? window.open("", "_blank") : null;   // inside the click
const res = await fetch("/api/payments/payu/initiate", …);    // then the await
tab.document.write(formHtml(...));                            // fill it in after
```

Moving `window.open` after the `await` loses the user-gesture context and every
popup blocker kills it. The blank tab is opened first and filled in once the
signed fields arrive; it is closed again if the server says no payment is
needed. If the popup is blocked anyway, it falls back to a same-tab form POST —
the player still reaches PayU.

**2. The launching page polls; it does not listen.** The PayU tab navigates to a
third-party origin and back, so `postMessage` and `window.opener` handles are
not dependable across that. The tournament page polls
`/api/payments/status?txnid=` every 3s and flips itself to registered. That
endpoint re-verifies against PayU on read, so polling also *causes* a stuck
payment to settle.

**3. `returnTo` is validated twice.** It is caller-supplied, so it is restricted
to `^/(?!/)` — a same-site path that is not protocol-relative — on the way in
*and* on the way out of the status endpoint. `//evil.example.com` is read by
browsers as another origin, which would make this an open redirect from a page
the player already trusts. Verified rejected in production.

Also deliberate:

- **The confirm screen is the first screen** on a paid shuffle tournament. There
  used to be a "register solo" explainer with a fee card in front of it, which
  asked for money twice before taking any.
- **No "verifying your Riot ID" note on the payment screen.** Next to a ₹500
  request it reads as "we might reject you after you pay". It is also redundant:
  the server would not have quoted a price if verification blocked entry.
- **"Not now" closes** when the confirm screen is the first screen, and steps
  back when it was reached from a 402.

## Payment methods

Verified on the live account, 1–2 Aug 2026:

| Method | Live | Note |
|---|---|---|
| UPI — intent (GPay/PhonePe/etc. app buttons) | ✅ | **Mobile only.** Confirmed working on a phone. |
| UPI — QR | ✅ | What desktop shows instead of app buttons |
| UPI — collect ("Enter UPI ID") | ❌ | Per-merchant mode; on in sandbox, off on the live MID |
| Net Banking | ✅ | |
| Cards | ❌ | Not enabled — ask PayU |
| Wallet / EMI / Pay Later | ❌ | |

**Desktop showing only a QR under UPI is correct, not a bug.** A desktop browser
cannot launch a UPI app, so PayU substitutes a QR. This caused a false alarm
once — it looks like a broken or restricted checkout and it is neither. Check on
a phone before investigating.

None of this is controllable from our code: we send no `pg`, `bankcode`,
`enforce_paymethod` or `drop_category`, so PayU renders everything the merchant
account has enabled. Changing the available methods means asking PayU, not
editing this repo.

## Trust model

The callback arrives **through the player's browser**. It is evidence, not
proof. Three things are checked before a rupee is credited:

| Check | Catches |
|---|---|
| Response hash (SHA-512, salt) | anything not sent by PayU |
| `verify_payment` API call | a browser that reports success PayU never saw |
| Amount vs. the value stored at initiate | a tampered or mispriced payment |

The amount is read from the tournament document at initiate time and **never**
from the request, so the caller cannot choose the price.

If PayU says success but the amount doesn't match, or the hash fails, the
payment lands in `review` rather than being silently accepted or silently
dropped. That state exists so a discrepancy reaches a human instead of a log.

---

## The hash formats

**Request** (this one PayU validates for you — if it's wrong, checkout won't
render):

```
sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
```

**Response** — and this is the landmine. PayU picks a shape per account. This
account emits the form that **appends the merchant key**:

```
sha512(SALT|status|udf10|udf9|udf8|udf7|udf6|udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
                                                                                                          ^^^^^
```

Most PayU documentation and every sample you'll find online stops at `txnid`.
Using that form here rejects **every genuine callback**, which surfaces as
perfectly good payments piling up in `review` — a failure that looks like fraud
detection working rather than a bug. `isResponseHashValid()` accepts both forms
(plus the `additionalCharges` variants); all are salt-derived, so accepting more
shapes weakens nothing.

If you ever change accounts and payments start landing in `review` with
`callback hash did not validate`, this is the first thing to check:

```bash
npx tsx scripts/dev-tools/payuHashTest.ts
```

It replays every callback ever stored through the shipped verifier, and asserts
that tampering with the amount or status still fails.

---

## Environment

```env
PAYU_MODE=test              # test | live — selects credentials AND endpoint
PAYU_MERCHANT_KEY=…         # used when no mode-specific pair is set
PAYU_MERCHANT_SALT=…

# Preferred once you go live — keeps both pairs available and makes it
# impossible to pair a live salt with the test endpoint:
PAYU_TEST_KEY=…   PAYU_TEST_SALT=…
PAYU_LIVE_KEY=…   PAYU_LIVE_SALT=…

NEXT_PUBLIC_APP_URL=https://iesports.in   # becomes surl/furl — must be correct
```

Credentials live in **Dashboard → Developer → API Keys**, and the dashboard's
Test/Live toggle switches which pair is shown. Test and live are different
merchant IDs with different keys — they are not interchangeable.

`NEXT_PUBLIC_APP_URL` matters more than it looks: it is what PayU redirects the
player back to. If it is stale, players pay and land nowhere.

---

## Live status (as of 2 Aug 2026)

Live and proven end to end with a real ₹1 UPI payment, on desktop and mobile.
**Valorant Horizon is taking ₹500.**

- `PAYU_MODE=live` is set in Vercel **Production only**. Preview is deliberately
  left unset so a preview deploy throws a config error rather than quietly
  taking real money.
- `PAYU_LIVE_KEY` / `PAYU_LIVE_SALT` are in Vercel. They are **not** in
  `.env.local` — local development stays on the test merchant.
- Webhook registered: `https://iesports.in/api/payments/payu/webhook`,
  type `payments`, event `successful`. It fires reliably — the first live
  payment settled from the webhook, before the browser redirect arrived, and the
  duplicate delivery that followed was correctly a no-op.
- `NEXT_PUBLIC_APP_URL=https://iesports.in`. The apex redirects to `www` with a
  **307**, which preserves the POST method and body, so PayU's callback survives
  the hop. A 301 or 302 there would silently turn the callback into a bodyless
  GET.

See **Payment methods** below for what players can actually pay with — cards are
not enabled, and that will cost more registrations than anything else on this
page.

The registered webhook only subscribes to `successful`. Failed payments
therefore never webhook, and are resolved by the status page re-verifying on
load. That is sufficient; adding a `failed` event would only make the failure
page settle marginally sooner.

---

## Testing

Testing needs a browser, because PayU's checkout is a page rather than an API.

```bash
# 1. run the app
npm run dev

# 2. put a fee on a test tournament
npx tsx scripts/dev-tools/payuTools.ts list
npx tsx scripts/dev-tools/payuTools.ts fee --game=cs2 --id=<id> --fee=10 --apply

# 3. build a self-submitting checkout form for a real uid
npx tsx scripts/dev-tools/payuTools.ts build --game=cs2 --id=<id> --uid=<uid>
#    → open the printed http://localhost:3000/_payu/<txnid>.html

# 4. on PayU: UPI → "Enter Any UPI ID" → test@payu → Proceed
#    then follow the "click" link to the simulator and choose success/failure

# 5. inspect
npx tsx scripts/dev-tools/payuTools.ts show --txnid=<txnid>
npx tsx scripts/dev-tools/payuTools.ts payments
```

`localhost` works as a return URL because PayU redirects the *player's browser*,
not its own servers. The **webhook** cannot reach localhost — during local
testing the browser callback settles the payment instead, and the status page
re-verifies on load as a backstop.

Net banking's simulator asks for a login; UPI's does not, so UPI is the easier
automated path.

To re-run a payment that ended up `failed` or `review`:

```bash
npx tsx scripts/dev-tools/payuTools.ts resettle --txnid=<txnid> --apply
```

---

## The stale-page landmine

The first live payment succeeded, registered the player correctly, and the
tournament page still showed them as not registered. Nothing was wrong with the
payment: `/api/tournaments/detail` is CDN-cached, and with
`stale-while-revalidate=600` the edge served a snapshot taken **before** the
registration for up to ten minutes.

This is the same failure the CS2 runbook warns about — a stale page is
indistinguishable from a broken pipeline — and it is worse here, because the
player has just handed over money and is being told it did nothing.

The fix is a freshness token rather than a shorter cache:

- `/api/payments/payu/callback` → `/payment/{txnid}` → the tournament link
  carries `?paid=<txnid>`.
- The tournament page passes that through as `?fresh=<token>` on its detail
  fetch. A distinct query string misses the edge cache, and the route answers
  `Cache-Control: no-store` so the response is never stored either.
- The same `fresh` path is used after **any** write — registering, unregistering
  — not just payments. Free registration had the identical bug.
- Routine 60s polling stays cached, so the edge cache still absorbs the load it
  was added for.

If a player ever reports "I paid but I'm not registered", check the data before
touching the payment code — `reconcile` below answers it in one command. It has
been a display problem every time so far.

## Reconciliation

Three facts must agree for anyone who paid, and each is written by a different
step, so any one can be missing:

```
payments/{txnid}.status == "paid"      PayU took the money
paidEntries/{game__tid__uid}           they are entitled to a slot
users/{uid}.registered*Tournaments     they actually hold one
```

```bash
npx tsx scripts/dev-tools/payuTools.ts reconcile
npx tsx scripts/dev-tools/payuTools.ts reconcile --base=https://www.iesports.in --apply
```

It reports every paid payment, flags anyone paid-but-not-registered, separates
**live rupees from sandbox rupees** (both live in the same collection — summing
them together would report test money as revenue), and lists orphan
entitlements: access with no paid payment behind it. Orphans are reported and
never auto-deleted, because revoking someone's access is a human decision.

It also reports the opposite: **registered without paying** — players holding a
slot in a tournament that has a fee, with no payment behind it. That is normal
after turning a free tournament paid, or for anyone who registered before the
gate shipped. They are not fraud, so nothing is removed automatically; the
report just tells you who they are and how much is unbilled, and grandfathering
them is usually the right answer.

`--apply` re-grants the entitlement and replays the normal registration route,
so a repaired registration is identical to one that worked first time.

Two things also self-heal without anyone running a command: opening
`/payment/{txnid}` re-verifies an unsettled payment *and* retries a registration
that failed, and the webhook settles a payment whose player closed the tab.

## Payment states

| Status | Meaning |
|---|---|
| `initiated` | form built, player sent to PayU, no verdict yet |
| `pending` | PayU says in progress, or PayU was unreachable — settles later |
| `paid` | PayU confirmed success **and** the amount matched |
| `failed` | PayU confirmed failure — nothing granted, no money taken |
| `review` | success with an anomaly (amount mismatch, bad hash) — needs a human |

`paid` is terminal: settlement refuses to overwrite it, so a replayed callback
or a duplicate webhook cannot change or re-grant anything.

---

## Firestore

| Collection | Contents |
|---|---|
| `payments/{txnid}` | one document per attempt, including the raw callback and PayU's verify response |
| ↳ `payuEnv` | `test` or `live` — which merchant took the money. Not `payuMode`, which settlement uses for the instrument (UPI / NB / CC). They shared a field once and sandbox rupees became indistinguishable from real ones. |
| `paidEntries/{game__tournament__uid}` | the entitlement — a derived id, so granting twice is a no-op |
| `payuWebhookEvents` | every webhook delivery, stored before it is interpreted |

All three are server-only: `firestore.rules` denies unlisted collections by
default, so no rule changes were needed and none should be added.

---

## Open items

- **Two players are in Horizon without paying** — Aarush Kasarla
  (`discord_851805821620715524`) and Aarav Jaiswal (`discord_903863107267481620`).
  They registered before the gate shipped, so ₹1,000 is unbilled. Nothing has
  been done to them: they cannot be re-charged by asking them to register again,
  because the "already registered" guard stops them before payment. Grandfather
  them, or unregister and ask them to re-enter.
- **CS2 Prelims is set to ₹1**, left over from the live test. Restore to ₹500
  before that tournament is used for anything real.
- **Ask PayU to enable cards** on live MID 13716014, and UPI collect if you want
  "Enter UPI ID" alongside the app buttons.

Run `reconcile` after any paid tournament closes; it answers "did everyone who
paid get in, and is anyone in who didn't pay" in one command.

## What is not built

- **Refunds.** Issue them from the PayU dashboard; nothing in the app reverses a
  `paidEntries` grant, so also unregister the player manually.
- **Team-level pricing.** Every player pays for their own slot, including the
  captain. There is no "captain pays for five".
- **Auto-completion for team create/join.** After paying, the player returns and
  clicks through — their entitlement is already granted, so it just works. Only
  solo registration completes itself during settlement.
- **An admin payments view.** Reconciliation is via
  `payuTools.ts payments` for now. This is the most obvious next thing to build
  once real money is flowing.

---

## Rules of thumb

1. **PayU's `verify_payment` is the only authority.** The callback tells you
   *that* something happened; the verify call tells you *what*.
2. **A rejected callback and a forged callback look identical.** Which is why
   the hash mismatch path flags for review rather than failing the payment.
3. **Never take money for a registration that cannot succeed.** `initiate`
   re-checks deadline, slots and prior registration before charging.
4. **The amount comes from the database, never the request.**
5. **A correct write the player cannot see is a bug.** Money makes cache
   staleness a trust problem, not a cosmetic one — any page a player lands on
   straight after paying must bypass the CDN.
6. **Check a phone before believing the checkout is broken.** UPI intent, and
   therefore the app buttons players expect, only exist on mobile.
7. **Every screen between the player and paying costs conversions.** Ask for
   money once, on one screen, and put nothing hedging next to the amount.
