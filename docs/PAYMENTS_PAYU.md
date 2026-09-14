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

`initiate` checks deadline, capacity, prior registration and Discord before
creating a transaction, and reserves the slot (below) so the seat cannot be sold
twice.

**It deliberately does NOT check profile completeness.** The order is "seat
first, setup after" (`RegisterModal.tsx`): the player pays to hold a slot and
supplies name, phone and their game account afterwards, because four setup steps
in front of the money leaked intent at every hop. Discord is the only
prerequisite, since that is how we reach someone whose payment lands and whose
setup never finishes.

That ordering creates exactly one failure, and it is not hypothetical: on
11 Aug a player paid ₹500, the registration fired straight after settlement
failed with "Full name is required", and nobody told him for sixteen days. The
mechanisms that make the trade acceptable are therefore not optional:

- the slot is **held**, so what he paid for is still there;
- `/api/cron/payments-watch` **DMs him** once his profile has been incomplete for
  more than two hours, and again daily, with a link and "you will not be charged
  again";
- the tournament page shows him **"Details pending"** rather than "Register";
- `reconcile` separates `WAIT` (mid-setup) from `FIX` (paid, complete, still not
  in) so the report does not cry wolf on every player still filling in details.

If you ever move payment back in front of setup, delete the nudge cron with it.
Until then, a paid player who is not registered is on a clock.

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

## Slot holds — why capacity is not just `slotsBooked`

`slotsBooked` only moves when a registration completes. Under "seat first" the
money moves before that, so counting only registrations would sell the last slot
to everyone still in setup, and the ones who lost that race would already have
paid.

`initiate` therefore writes `slotHolds/{uid}` under the tournament, **inside a
transaction that counts the other live holds**:

```
capacity used = slotsBooked + live holds (excluding this player's own)
```

- an unpaid hold expires after 20 minutes, so an abandoned checkout hands the
  seat back on its own;
- settlement calls `markHoldPaid`, and a paid hold never expires: the seat is
  theirs until they register or withdraw;
- `claimSoloSlot` deletes the hold as it increments `slotsBooked`, so a player is
  never counted twice;
- withdrawing releases it.

The transaction is the point. Two players checking out for the last seat at the
same instant serialise, and the second is told the tournament is full while that
is still a free thing to say.

Anyone who paid before holds existed has an entitlement and no hold, and would be
invisible to this count. `scripts/dev-tools/backfillSlotHolds.ts` writes those
once; it has been run, and is safe to re-run.

## Withdrawals and refunds

The registration screen promises, next to the price: "Withdraw any time before
registration closes and you get the whole ₹500 back."

**The refund itself is manual**, issued from the PayU dashboard. What is
automatic is everything that stops it being forgotten. Unregistering a player who
holds a paid entitlement now:

1. releases the player document and the counter in one transaction;
2. **voids the entitlement** (`voided: true`, never deleted, so the history
   survives). Without this a refunded player keeps a free claim to a slot, since
   `requirePaidEntry` only ever asked whether the document existed;
3. releases the slot hold;
4. writes `refunds/{txnid}` as `owed`, keyed by transaction id so a repeat
   withdrawal cannot open two obligations for one payment;
5. DMs the player, and posts to the ops channel with the amount and UPI ID.

**Where the money goes.** We do not ask everyone for a UPI ID: an extra field in
front of registration costs entries, and most players never need one. It is asked
for at the two moments it is actually needed — the withdrawal screen, and prize
payouts — and saved to the account afterwards so it is asked once. It is written
only through `/api/account/upi` (validated, timestamped, with a `upiHistory`
audit trail) and `firestore.rules` locks the field against a direct client write,
because it is a payout destination.

**`reconcile` used to undo withdrawals.** A withdrawn player looks exactly like a
broken registration (paid, profile complete, not registered), so `--apply` would
put them back into the tournament and spend their refund on a slot they had left.
It now checks for an open refund first and reports them as `HOLD`.

## Authentication

Every route here verifies its caller. They take a `uid` and used to believe it,
which with PayU live meant an unauthenticated POST could unregister a player who
had paid ₹500, and `/api/payments/entitlement?uid=` would tell anyone whether a
given account had paid and what it was missing.

`lib/apiAuth.ts` accepts two callers:

| Caller | How |
|---|---|
| the player's browser | `Authorization: Bearer <Firebase ID token>`, and the token's uid must match the `uid` in the request |
| our own server | `x-iesports-internal: <secret>` — settlement and `payuTools` have no player token |

The secret is `INTERNAL_API_SECRET`, falling back to `ADMIN_SECRET`, which is
already set everywhere this runs. That fallback is deliberate: if the internal
path could be misconfigured into failing, a deploy without a new env var would
take money and never register anyone.

Browser callers go through `app/lib/authFetch.ts`; server callers through
`internalHeaders()`. Adding a new registration route means using one of them.

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

# Optional. Identifies our own server to the registration routes it calls during
# settlement. Falls back to ADMIN_SECRET, which is already set, so nothing
# breaks if this is never added.
INTERNAL_API_SECRET=

# Optional. Where the daily payments digest and refund alerts are posted.
# Falls back to LOBBY_CONTROL_CHANNEL_ID, then RESULTS_CHANNEL_ID.
OPS_CHANNEL_ID=
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

# Slot counters vs the actual roster (also part of reconcile, and of the cron)
npx tsx scripts/dev-tools/recountSlots.ts [--apply]

# Holds for anyone who paid before holds existed. Idempotent.
npx tsx scripts/dev-tools/backfillSlotHolds.ts [--apply]
```

`reconcile` also reports two things it used to miss: **slot counters that
disagree with the roster**, and **two paid live payments behind one seat** (a
genuine double charge, which every other check reads as fine because the second
registration answers "already registered" and is marked OK).

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
| ↳ `registration.inFlightAt` | the idempotency claim on the registration call. PayU delivers the same webhook more than once, seconds apart, and `registration.ok` is not written until the call returns, so every delivery used to read it as false and fire its own registration. Expires after 60s so a crash cannot lock a payment out forever. |
| `<tournament>/slotHolds/{uid}` | the seat, reserved at checkout. Unpaid holds expire; paid ones do not. |
| `refunds/{txnid}` | what a withdrawal owes. `owed` / `paid` / `cancelled`, with the UPI ID to send it to. |
| `users/{uid}.upiId` | payout destination. Server-written only; `upiHistory` subcollection records every change. |
| ↳ `payuEnv` | `test` or `live` — which merchant took the money. Not `payuMode`, which settlement uses for the instrument (UPI / NB / CC). They shared a field once and sandbox rupees became indistinguishable from real ones. |
| `paidEntries/{game__tournament__uid}` | the entitlement — a derived id, so granting twice is a no-op |
| `payuWebhookEvents` | every webhook delivery, stored before it is interpreted |

All three are server-only: `firestore.rules` denies unlisted collections by
default, so no rule changes were needed and none should be added.

---

## Open items

- **Harsh Chadha (`discord_336082463728205824`) has paid for Horizon and is not
  in it.** ₹500, txn `IEMSOFXIIF1C6BB0D6FB`, 11 Aug. His registration failed on
  "Full name is required" and nothing chased him for sixteen days. He has since
  added a name and phone but still no Riot ID. His slot is held and he was DMed
  on 27 Aug asking him to finish; the nudge cron takes it from here. If he never
  links Riot, that becomes a refund conversation, not a silence.
- **CS2 Prelims is set to ₹1**, left over from the live test. Restore to ₹500
  before that tournament is used for anything real.
- **Ask PayU to enable cards** on live MID 13716014, and UPI collect if you want
  "Enter UPI ID" alongside the app buttons.
- **No admin payments view yet.** `payuTools payments` and the daily ops digest
  cover it for now.

Run `reconcile` after any paid tournament closes; it answers "did everyone who
paid get in, and is anyone in who didn't pay" in one command.

## Fixed, 27 Aug 2026

Horizon reported 3/20 players with two on the roster. Found by counting, not by
an alert, which is why most of this work is about alerts.

- **The counter was double-incremented by a duplicate webhook.** PayU delivered
  the same success twice, 3 seconds apart. The money decision was
  transaction-guarded and settled once, correctly, but `ensureRegistered` was
  guarded only by `registration.ok`, which is not written until the registration
  call returns. Both deliveries read it as false, both called
  `/api/valorant/solo`, both passed its non-transactional "already registered?"
  read, both wrote the same player document (hence one name) and both
  incremented. Proof: two `seed` entries in that player's `rankHistory`, 0.9s
  apart. Registration is now one transaction, and settlement claims the attempt
  before making it.
- **Every `slotsBooked` write is now transactional** (`lib/registrationSlots.ts`).
  The counters were previously wrong in two different directions: solo routes
  used a bare `FieldValue.increment` guarded by a separate read (double counts),
  while `teams/solo`, `teams/create` and `teams/join` read the value and wrote it
  back (loses updates). `recountSlots.ts` repairs history; `reconcile` and the
  cron now check it.
- **The last slot can no longer be sold twice** (slot holds, above).
- **Withdrawals record what they owe** (refunds, above).
- **Registration, unregistration and payment routes authenticate** (above).
- **Nothing money-related waits to be remembered any more.**
  `/api/cron/payments-watch` runs daily: it DMs paid-but-unregistered players,
  and posts a digest of `review`, stale `pending`, refunds owed, paid-but-
  complete-and-still-out, and any slot counter that disagrees with its roster.

## Team registration — the captain pays once (Valorant)

Added 14 Sep 2026 when Horizon switched from ₹500 per player (shuffled on the
day) to ₹2000 per pre-formed team of 5. A tournament opts in with
`registrationMode: "team"`, plus `teamSize` and `totalTeams`; `entryFee` is then
the price of a **team**. `scripts/dev-tools/convertToTeamRegistration.ts` makes
the switch.

```
captain: Discord → name, phone, Riot ID → team name + pay (one screen)
      │  initiate: mode team_create, teamName stored on the payment,
      │  team seat + name reserved in teamHolds (transaction)
      ▼
settlement → grantTeamEntry (paidEntries/…__team) → POST /api/valorant/team/create
      │  team, code and captain's player doc created in ONE transaction,
      │  keyed on the payment so a duplicate webhook returns the same team
      ▼
captain gets the code on screen and in a Discord DM
teammates: Discord → setup → /api/valorant/team/join (free, transactional)
```

What is different from solo, and why:

- **Setup comes before the money.** The team is created at settlement with the
  captain as its first player, which needs a Riot ID. Taking ₹2000 first would
  strand a paid team with no code for the other four. `initiate` refuses a team
  checkout until the captain's profile is complete.
- **Teams live in `valorantTournaments/{id}/teams/team-N`**, the collection the
  shuffle writes, so fixtures, standings, brackets and the team page need no
  second code path. Each member is still a `soloPlayers` doc (with `teamId`), so
  `slotsBooked` keeps counting players and every existing check still holds.
  Team capacity is counted from the teams collection against `totalTeams`.
- **The code is never on the team doc.** Teams are readable by any signed-in
  user; codes live in `valorantTeamCodes/{CODE}`, which the rules deny.
- **Shuffle is disabled** on a team tournament — `deleteExisting` would erase
  paid teams.
- **Solo registration and solo checkout are refused** on a team tournament.

### Solo entries from before a switch — kept separate

Team registration has no notion of an earlier solo payment: no credit, no
discount, every captain pays the full `entryFee`. When Horizon switched (14 Sep
2026) the solo entries were cancelled outright by
`scripts/ad-hoc/_horizonCancelSoloEntries.ts`: players removed from the roster,
solo entitlements voided, `refunds/{txnid}` recorded as `owed` (method
`manual` — Sarthak collects UPI IDs by DM reply or phone and pays from the PayU
dashboard), DMs sent, and the change posted to #announcements.
`convertToTeamRegistration.ts` refuses to run while any solo entry is still live,
so the two never mix.

`reconcile` and the payments cron look up a team payment's entitlement by
`entitlementIdForPayment()` and treat it as done when `payment.team.teamId`
exists.
Not built for teams: a captain cannot disband or leave (admin conversation), and
there is no self-serve team refund. Teammates can leave before close.

## What is not built

- **Refunds.** Issue them from the PayU dashboard; nothing in the app reverses a
  `paidEntries` grant, so also unregister the player manually.
- **Team-level pricing outside Valorant.** Dota teams still charge every player
  for their own slot, including the captain.
- **Auto-completion for Dota team create/join.** After paying, the player
  returns and clicks through — their entitlement is already granted, so it just
  works. Valorant team creation completes itself during settlement.
- **An admin payments view.** Reconciliation is via
  `payuTools.ts payments` for now. This is the most obvious next thing to build
  once real money is flowing.

---

## Rules of thumb

1. **PayU's `verify_payment` is the only authority.** The callback tells you
   *that* something happened; the verify call tells you *what*.
2. **A rejected callback and a forged callback look identical.** Which is why
   the hash mismatch path flags for review rather than failing the payment.
3. **Never take money for a seat that cannot exist.** `initiate` re-checks
   deadline and prior registration, and reserves the slot in a transaction
   before charging. It does not check profile completeness: setup comes after
   the money on purpose, which is why the nudge cron is part of the payment
   system and not a nice-to-have.
4. **The amount comes from the database, never the request.**
5. **A correct write the player cannot see is a bug.** Money makes cache
   staleness a trust problem, not a cosmetic one — any page a player lands on
   straight after paying must bypass the CDN.
6. **Check a phone before believing the checkout is broken.** UPI intent, and
   therefore the app buttons players expect, only exist on mobile.
7. **Every screen between the player and paying costs conversions.** Ask for
   money once, on one screen, and put nothing hedging next to the amount.
8. **Anything that changes a count is a transaction.** Not a read-then-write,
   and not a bare increment guarded by a separate read. Every external delivery
   is at-least-once, so everything the money decision triggers has to be
   idempotent too, not just the money decision itself.
9. **Never show a player a derived counter you have not reconciled.**
   `slotsBooked` is a cache of the roster. The tournament page rendered the
   cache in its header and the truth in its Players tab, which is how a one
   document drift became a visible contradiction on a public page.
10. **A promise in the UI is a feature with an owner.** "Fully refundable" was
    for a while the only part of the refund system that existed.
11. **Every terminal-but-wrong state needs an owner and a clock.** `review`,
    `registration.ok: false` and a stale `pending` all used to wait for somebody
    to think of them.
