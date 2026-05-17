# IEsports WhatsApp Sender

Posts match-result messages to a WhatsApp group, mirroring the Discord flow.

## How it works

```
result fetch (web/bot)  ──►  whatsappOutbox/{id}  ──►  this service  ──►  WhatsApp group
   enqueueWhatsApp()          (Firestore)              (WhatsApp Web)
```

Same Firestore "message bus" pattern as the rest of the stack. Result code
calls `enqueueWhatsApp(text, dedupeKey)`; this persistent service is logged
into WhatsApp Web (once, via QR) and delivers anything pending. It never
blocks result writing — a WhatsApp outage just leaves messages queued.

> WhatsApp has **no official group API**. This drives WhatsApp Web
> (unofficial). Use a **dedicated phone number**, not anyone's personal one —
> automated numbers can get rate-limited or banned by WhatsApp.

## One-time setup

1. Get a dedicated number with WhatsApp installed; add it to the target group.
2. `cd whatsapp && npm install`
3. `cp .env.example .env` and fill in:
   - the three `FIREBASE_*` values (copy from `web/.env.local` or `bot/.env`)
   - `WHATSAPP_GROUP_NAME` = the group's exact name
4. `npm start` — a QR code prints in the terminal. On the dedicated phone:
   **WhatsApp → Settings → Linked Devices → Link a Device** → scan it.
5. On `ready` it logs the resolved group id, e.g.
   `resolved group "IEsports Tournament" -> 12036...@g.us`.
   Paste that into `.env` as `WHATSAPP_GROUP_ID` so renaming the group
   doesn't break delivery. Restart.

The session persists in `WWEBJS_DATA_PATH` (`./.wwebjs_auth`) — you only scan
the QR once. Keep that folder; don't commit it (gitignored).

## Running

- **LAN event:** run it on the admin machine during the tournament:
  `npm start`. Simplest, zero infra, no ban exposure between events.
- **Always-on:** run it as a service (pm2 / a small VM / a Railway service
  with a persistent volume mounted at `WWEBJS_DATA_PATH`). Needs Chromium —
  the puppeteer args are already set for headless/sandbox-less environments.

## Status / debugging

The service writes `whatsappStatus/state` in Firestore:
`state` = `init | qr | authenticated | ready | disconnected | auth_failure`,
plus `groupId`, `groupName`, `lastError`. Check there if messages aren't
arriving. Pending/sent/error/skipped is tracked per message on each
`whatsappOutbox` doc (`attempts`, `error`).

## Adding more producers

Any result/announcement point can post to the group with one line:

- **bot:** `import { enqueueWhatsApp } from "./services/firebase"` →
  `await enqueueWhatsApp(text, dedupeKey, "source")`
- **web (API routes):** `import { enqueueWhatsApp } from "@/lib/whatsapp"`

Already wired: bot Dota result resolver (`dota-results.ts`) and
`web/scripts/fetchDotaMatchResult.ts`. Valorant `match-fetch` can be wired the
same way at its Discord-post point.
