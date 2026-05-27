# Safety Rules — Read This Before You Touch Anything

> Production data matters. Real users are running real tournaments with real money on the line. This file lists the actions you must NEVER take without Sarthak explicitly approving them, and the actions that are safe.
>
> Read every line. If something is unclear, ask before acting.

---

## The five hard rules

These are non-negotiable. Breaking one of these would cause real damage that takes hours or days to recover from.

### 1. Never run any script in `web/scripts/ad-hoc/` without Sarthak telling you to

The `ad-hoc/` folder contains scripts that mutate production Firestore data. They are kept in the repo as a record of past operations, not as utilities you should run.

Examples of scripts there:
- `_rescheduleDota.ts` — changes scheduledTime on real tournament matches
- `_swapDotaSlots.ts` — swaps match times on real tournaments
- `_archiveAscensionWoS.ts` — archives real Wall-of-Shame entries
- `_perTeamValueAnalysis.ts` — read-only, but reads live data

**Even read-only scripts you should not run on your own initiative.** They consume API quota and could surprise Sarthak.

If you want to RUN one for some reason, Slack/text Sarthak: "Can I run `_xyz.ts` to do X?" and get explicit approval. He'll either say yes or run it himself.

### 2. Never push to `main` directly

Branch protection on `main` blocks this anyway, but the habit matters. Always:
```bash
git checkout -b sister/<task-name>
# work
git push -u origin sister/<task-name>
# open PR via GitHub UI
```

### 3. Never commit a file containing secrets

Secrets include:
- Firebase service account private keys (anything that looks like `-----BEGIN PRIVATE KEY-----`)
- API keys (Steam, Discord, Henrik, Razorpay, Anthropic, Riot)
- OAuth client secrets
- Admin secrets

The `.env`, `.env.local`, and `.env.example` files are gitignored. Don't change `.gitignore` to include them. Don't paste them into commit messages or PR descriptions. Don't print them via `console.log` in production code.

If you accidentally commit a secret: STOP, tell Sarthak immediately. He will rotate the secret and force-clean the git history. Don't try to fix it yourself.

### 4. Never touch the bot directory

The `bot/` folder contains the Discord/Dota Game Coordinator bot that runs on Railway. It is:
- Holding live Steam GC connection state
- Mid-tournament right now
- A trip-wire of subtle proto/protocol bugs

Any change to `bot/` requires Sarthak to redeploy and observe. Don't make even "obvious" changes there. If you have a suggestion for the bot, leave a comment in the PR for the related web change.

### 5. Never run anything against the Razorpay / payments code

`web/app/api/payments/` is gitignored (Razorpay WIP, not ready). If you somehow have payments code on your filesystem, leave it untouched. Razorpay integrations have real legal/compliance implications. Sarthak handles this.

---

## What you can safely change

These are areas where you have full latitude. Make changes, open PRs, iterate.

### Safe: Frontend pages and components

- `web/app/page.tsx` — landing page (UI polish, content updates)
- `web/app/about/page.tsx`, `web/app/privacy/page.tsx`, `web/app/terms/page.tsx` — public legal pages
- `web/app/valorant/tournament/[id]/page.tsx` — Valorant tournament detail (refactoring, mobile improvements)
- `web/app/valorant/tournament/[id]/team/[teamId]/page.tsx` — the new team detail page (lots of polish opportunities)
- `web/app/tournament/[id]/page.tsx` — Dota 5v5 tournament detail
- `web/app/cs2/tournament/[id]/page.tsx` — CS2 tournament detail
- `web/app/solo/[weekId]/page.tsx` — Dota solo week tournament
- Any file in `web/app/components/` (Navbar, DoubleBracket, WallOfShame, CommentSection, etc.)

### Safe: Pure-function library files

- `web/lib/valorantTeamAnalytics.ts` — pure analytics functions, no I/O, safe to refactor
- `web/lib/soloScoring.ts` — Dota solo scoring math
- `web/lib/types.ts` — add new types, never restructure existing ones
- `web/lib/types-additions.ts` — newer types, same rule
- `web/lib/elo.ts` — internal seeding math

### Safe: Public assets

- `web/public/` — images, logos, share-image backgrounds (UPDATE existing assets, ADD new ones)

### Safe: Documentation

- `docs/` folder — anything in here
- `README.md` (if it exists)
- This file (`docs/SAFETY_RULES.md`) — improvements welcome

---

## Things to be careful about (not banned, but ask first)

These require coordination with Sarthak but aren't outright forbidden.

### API routes

`web/app/api/*` contains backend code. Changes here can affect:
- Production data integrity
- Authentication flows
- Discord/Steam/Riot integrations

For frontend-only API changes (new fields in a response, new endpoints that don't mutate data), proceed with normal PR review. For anything that **writes** to Firestore, **calls external APIs**, or **changes authentication**, post in the PR description: "This touches X. Please review carefully."

### `web/lib/firebaseAdmin.ts`

This file uses a fragile lazy Proxy pattern to work around a Next.js build issue. Don't simplify it. Don't change its initialization shape. If you think it needs changing, post in PR description with the proposed change AND your reasoning. Sarthak will review carefully.

### `web/app/api/admin/*`

Admin routes are protected by `ADMIN_SECRET` checks. They can do destructive operations (delete tournament, reset match, recompute standings). Touching these is fine for read-only routes and adding new ones, but mutation routes need extra eyes.

### `web/app/api/auth/*`

Authentication routes. Touching these can lock users out or open security holes. Default: don't change these. Exceptions: minor logging cleanup, type fixes.

### Adding new dependencies (`npm install <package>`)

Dependencies add attack surface and increase deploy size. Before `npm install`-ing a new package:
1. Search the codebase to see if a similar utility already exists
2. Consider if you can write the helper yourself in 10 lines
3. If you must add a dep, post in the PR: "Added `<package>` because X. Considered alternatives: Y, Z."

Sarthak will reject deps that don't pull weight.

---

## Active tournaments (be extra careful)

These are running RIGHT NOW. Be extra cautious around their data.

| Tournament | Game | Firestore ID | Status |
|---|---|---|---|
| Domin8 Ultimate Tilt-Proof | Dota 2 | `tournaments/domin8-ultimate-tilt-proof-tournament` | Active group stage |
| League of Rising Stars: Ascension | Valorant | `valorantTournaments/league-of-rising-stars-ascension` | Playoffs scheduled |
| Dota Test (Major + Shrey) | Dota 2 | `tournaments/dota-test-major-shrey` | TEST ONLY — safe to break |

**Use the test tournament for ANY testing that touches Dota tournament logic.** Never run an ad-hoc script, admin action, or experimental query against the two active tournaments without Sarthak approving the exact action.

If you're building a new feature and want to test it end-to-end, ask Sarthak to give you a fresh test tournament for your feature. He can spin one up in a few minutes.

---

## What to do if you think you broke something

1. **Don't panic.** Most things are recoverable.
2. **Don't try to fix it silently.** Tell Sarthak immediately.
3. **Don't delete or revert without him knowing.** A revert might destroy evidence he needs to diagnose.
4. **Capture the state:** screenshot the error, copy any error messages, note the time.
5. **Send him:** "I was doing X, then Y happened. Here's the screenshot. What should I do?"

Time-to-fix scales with time-to-report. The earlier he knows, the faster it gets fixed.

### Specific recovery scenarios

**You accidentally pushed to a branch that already had work:**
- Don't force-push. Tell Sarthak. He'll resolve conflicts or merge appropriately.

**You committed a file with secrets:**
- Tell Sarthak in the next 5 minutes. He'll rotate the secret and clean git history.

**You ran a script that did something unexpected:**
- Tell Sarthak immediately. There's a daily Firestore backup; data can be restored.
- Don't run a "fix" script to clean up. You'll make it worse.

**Vercel deploy failed and you don't understand why:**
- Read the Vercel build logs (Vercel dashboard → Deployments → click the failed one → Build Logs)
- If the error mentions `firebaseAdmin`, `Proxy`, or `Collect page data` — see `docs/CLAUDE_CONTEXT.md` for the lazy-init pattern. Don't undo it.
- If you can't figure it out in 15 min, ask Sarthak.

---

## The "would Sarthak approve this" gut check

Before any non-trivial action, mentally simulate showing it to Sarthak. If you'd be nervous showing him, ask him first. Examples:

| Action | Should you ask? |
|---|---|
| "I'm going to make the team page slightly more rounded" | No, just do it |
| "I'm going to install `lodash` for one debounce helper" | Yes (deps need approval) |
| "I'm going to refactor the standings page to use a context provider" | Yes (architecture change) |
| "I'm going to run a script to clean up old test users" | Absolutely yes (data mutation) |
| "I'm going to fix a typo in the about page" | No, just do it |
| "I'm going to add a new field to the Tournament type" | Maybe (depends on if it's used by anything else) |
| "I'm going to add a comment explaining what isBracket means" | No, just do it |

When unsure: err on the side of asking. The cost of asking is 30 seconds. The cost of breaking something is hours.

---

## Where the bodies are buried (read once, don't memorize)

This is a quick tour of fragile parts of the system. Read once so you know they exist; don't memorize details.

- **`web/lib/firebaseAdmin.ts`** — lazy Proxy pattern. Fragile. Don't simplify.
- **`bot/src/services/bot-lobby.ts`** — heartbeat is diff-suppressed for write-budget reasons. Don't undo.
- **`bot/src/services/dota-gc.ts`** — CSODOTALobby proto field numbers are non-obvious. Members are at field 120, not 2.
- **Three sort sites** for Valorant standings (see `docs/CLAUDE_CONTEXT.md`). Touch one, touch all three.
- **`isBracket` guard** in any Swiss/standings-recompute logic. Forgetting this corrupts bracket state.
- **`team1.scheduledTime` vs `matchDay`** — both exist for historical reasons. New code should prefer `scheduledTime`. The Matches tab sorts by `scheduledTime` first.
- **Dual game data storage** — `match.game1` (new) vs `match.games.game1` (old). Read with the `??` fallback pattern.
- **Vercel project name** — `iesports`, not `web`. Don't run `vercel --prod` without linking first.

---

## When this document is wrong

If you read something here that contradicts the code, or seems out of date, tell Sarthak. Documents drift; code is truth. Updates to this file are welcome via PR.

Especially: if you discover a new landmine (something that bit you and would bite a future contributor), ADD IT to `docs/CLAUDE_CONTEXT.md` in the "Recent incident log" section as part of your fix PR.

---

## One last thing

Sarthak built this platform by himself. He cares about it more than is reasonable. He will be patient if you're learning. He will be frustrated if you skip safety steps that exist for documented reasons. Read the docs. Ask the questions. The platform is worth taking care of.

Welcome to the team.
