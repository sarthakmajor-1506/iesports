# Registration flow redesign — prompt for Claude

Paste everything in the fenced block below into a new Claude conversation
(claude.ai, Artifacts enabled). It is written to produce visual options only —
it explicitly forbids changing any API contract, because the backend is working
and paying customers depend on it.

Keep this file updated if the flow changes, so the prompt never describes a
version of the product that no longer exists.

---

```
You are designing the registration flow for IEsports (iesports.in), an Indian
esports tournament platform for Valorant, CS2 and Dota 2. I want design
options, not code changes to my backend.

## The problem

Registration is a modal that works but converts badly and looks utilitarian.
Today it forces a player through a linear checklist before they can pay:

  1. Full Name          — typed into a text field
  2. Phone Number       — OTP verification, 6-digit code
  3. Steam or Riot ID   — OAuth redirect away to another site and back
                          (Riot for Valorant, Steam for CS2 and Dota 2)
  4. Discord            — OAuth redirect away and back
  5. Confirm entry      — pay the entry fee (e.g. ₹500) via PayU

Each step is a full-width card with a number badge, a progress bar of thin
segments at the top, and one "Continue →" button. It reads like a form, not
like entering a tournament. Two of the five steps navigate the player away to a
third-party site, and if they drop off there they come back to the start of the
flow.

Most of my players are on mobile.

## What I want from you

Produce 3 distinct design directions as self-contained HTML artifacts I can
click through — not descriptions. Each should show, at minimum:
  - the entry point (a "Register" button in context on a tournament page)
  - every required step
  - the payment confirmation
  - the success state
  - what a returning player sees when some steps are already done

Make them genuinely different from each other in structure, not three colour
variations of the same wizard. Directions worth exploring:
  - collapse the checklist so the player sees one thing at a time with no
    visible backlog of remaining work
  - front-load the payment so the commitment happens while intent is highest,
    and gather account links afterwards
  - make the account links feel like unlocking/earning rather than admin
  - a single-screen form rather than a wizard
  - progressive: let them into the tournament page immediately and fill gaps
    only when needed

For each direction, tell me in two or three sentences what you are optimising
for and what you are trading away. I care most about drop-off between opening
the modal and completing payment.

## Hard constraints — do not design around these, design within them

DATA I MUST COLLECT. These are not negotiable; they are needed to run matches
and pay out prizes. You may reorder or reframe them, not remove them:
  - Full name (prize payouts)
  - Phone number, OTP-verified (match reminders, prize claims)
  - Discord account (all tournament comms happen there)
  - Riot ID for Valorant / Steam ID for CS2 and Dota 2 (rank verification and
    match tracking)

THE TWO OAUTH HOPS ARE UNAVOIDABLE. Discord and Steam/Riot linking must send
the player to another site and back. I cannot collect those credentials myself
and would not want to. Design for the round trip: make leaving feel safe and
returning feel like resuming, not restarting.

PAYMENT. Paid tournaments hand off to PayU, which opens in a second tab. The
player pays by UPI or Net Banking. Card payments are not available. The page
that launched it stays open and updates itself when payment clears. Show the
fee once, clearly, with nothing hedging next to the amount.

NO BACKEND CHANGES. The API contract is fixed and live with real money. Design
purely at the presentation layer.

## Technical constraints for anything you hand me

  - Next.js 15 App Router, React, TypeScript
  - INLINE STYLES ONLY. No Tailwind, no CSS files, no CSS modules, no styled
    components. The entire codebase styles with style={{ ... }} objects.
  - Mobile-first. Assume a 390px-wide phone is the primary target; the modal
    already becomes a bottom sheet under 480px.
  - No new dependencies.

## Visual language to stay within

  - Dark UI. Page background #080808, surfaces #0e0e0e, borders #1a1a1a,
    inputs #111 with #222 borders.
  - Body text #fff, secondary #888, muted #555, disabled #444.
  - Per-game accent, used for the primary action and highlights:
      Valorant #3CCBFF   CS2 #f0a500   Dota 2 #A12B1F
  - Success #4ade80, warning #fbbf24, error #ef4444.
  - Rounded corners 8–16px. Primary buttons are a gradient of the accent to a
    darker shade, 700 weight, ~14–15px.
  - Emoji are used as iconography today. Feel free to replace that with
    something more considered, but no icon-font or SVG-library dependencies.

## Deliverable

Three clickable HTML artifacts, each self-contained, each demonstrating the
full flow including the mobile layout. Then a short recommendation: which one
you would ship and why, and what you would measure to prove it worked.
```

---

## Notes for whoever applies the winning design

- The component is `web/app/components/RegisterModal.tsx`. It is shared by the
  Valorant, CS2 and Dota tournament pages, which pass `game` and `tournament`.
- The payment states it must preserve: a 402 from a registration route means
  "fee outstanding", and `startPayuCheckout()` in `web/app/lib/payuCheckout.ts`
  must keep opening its tab **synchronously inside the click** — see
  `docs/PAYMENTS_PAYU.md`.
- `onSuccess()` must still fire on completion; the tournament pages use it to
  refetch with the CDN bypassed.
