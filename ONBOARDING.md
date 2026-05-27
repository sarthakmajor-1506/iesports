# iesports — Onboarding Guide

> Welcome. You are joining the build team for **iesports.in**, India's most serious-but-casual esports tournament platform. Sarthak is the founder + tech lead. This document is your first 30 minutes. After reading it you will be able to make safe, useful changes.
>
> If you are using Claude Code, it has already read this file. Ask it questions in plain English. Read this once yourself anyway — you should understand the codebase, not just delegate to Claude.

---

## What iesports is (60 seconds)

- **Live games:** Valorant, Dota 2, CS2
- **Audience:** Serious-but-casual Indian players
- **Where you'll spend most of your time:** the `web/` directory (the website)
- **Brand:** lowercase **`iesports`**, always. Never "IESports", "IEsports", or "Iesports". This is non-negotiable in every user-facing string (page text, Discord messages, footers, headers, emails).
- **Tone:** confident, direct, never overhyped. India-first. We are not a startup pretending to be Western.

The platform runs real money tournaments. Production data matters. Be careful.

---

## Your environment (one-time setup, already mostly done)

You are working out of a **GitHub Codespace** based on the repo `sarthakmajor-1506/iesports`. Sarthak added you as a collaborator with Write access. Your Codespace has:

- Node.js + npm installed
- Repo already cloned (you don't run `git clone`)
- `CLAUDE_CODE_OAUTH_TOKEN` set as a Codespace secret so `claude` works without re-auth
- Some `NEXT_PUBLIC_FIREBASE_*` env vars set so the frontend builds

**You do NOT have** the Firebase Admin SDK private key or any prod secrets. That means:
- You can develop UI freely
- You can read public Firestore data via the client SDK
- You **cannot** run server-side scripts that touch production Firestore directly
- For any backend task that needs prod credentials, you write the code, push the PR, and Sarthak runs it from his machine

This is intentional. It is the single most important safety guard. We will lift this restriction over time as you build trust with destructive operations.

---

## The repo, at a glance

```
iesports/
├── web/                    ← Next.js 16 app (this is 90% of your work)
│   ├── app/
│   │   ├── api/            ← Backend routes (admin/, valorant/, dota/, etc.)
│   │   ├── components/     ← Shared React components
│   │   ├── valorant/       ← Valorant pages (tournament/[id]/, match/, team/)
│   │   ├── tournament/     ← Dota 2 5v5 tournament pages
│   │   ├── cs2/            ← CS2 pages
│   │   ├── solo/           ← Dota solo tournaments
│   │   └── page.tsx        ← Landing page (long, ~800 lines)
│   ├── lib/                ← Shared TypeScript (types, helpers, scoring)
│   ├── scripts/
│   │   ├── ad-hoc/         ← One-off scripts. Don't run these yourself.
│   │   └── dev-tools/      ← Reusable utilities
│   ├── public/             ← Static assets
│   ├── CLAUDE.md           ← The deep technical context (read it next)
│   └── package.json
├── bot/                    ← Discord/Dota bot (Railway-deployed). DON'T TOUCH without asking.
├── docs/
│   ├── CLAUDE_CONTEXT.md   ← Memory/knowledge from prior sessions (read this)
│   └── SAFETY_RULES.md     ← Strict do/don't list (READ THIS)
└── ONBOARDING.md           ← You are here
```

**Required reading after this file, in order:**
1. `docs/SAFETY_RULES.md` — what you must never do
2. `web/CLAUDE.md` — deep technical context (Sarthak wrote this carefully)
3. `docs/CLAUDE_CONTEXT.md` — accumulated lessons from prior incidents

That's about 90 minutes of reading total. Worth it.

---

## Your daily workflow

Every change you make follows this exact loop:

```bash
# 1. Sync your main branch with Sarthak's latest
git checkout main
git pull origin main

# 2. Make a new branch for your task. Naming: sister/<short-description>
git checkout -b sister/fix-roster-mobile

# 3. Make changes inside web/. Open files in VS Code.
#    Optionally: run "claude" in the web/ directory for AI help

# 4. Run the dev server to check what you built
cd web && npm install   # only first time, or when package.json changes
npm run dev             # Codespace forwards the port automatically; click the popup

# 5. When happy, commit
git add -A
git commit -m "fix: roster cards overflowing on mobile"

# 6. Push your branch
git push -u origin sister/fix-roster-mobile

# 7. Open the PR
#    GitHub shows a banner: "sister/fix-roster-mobile had recent pushes. Compare & pull request"
#    Click it, fill in title + description, click "Create pull request"

# 8. Wait for Sarthak to review and merge
#    He approves → merges → Vercel auto-deploys to iesports.in
```

**Never** push directly to `main`. Branch protection blocks this anyway, but the habit matters.

**One PR = one logical change.** Don't bundle "fix mobile + add new feature + refactor stuff" into one PR. Sarthak will reject it. Smaller PRs get merged faster.

---

## The 10 critical rules

If you remember nothing else, remember these.

### 1. Brand is `iesports` (lowercase, always)
Never write "IEsports", "IESports", "Iesports". This shows up in Discord embeds, page footers, video thumbnails, emails. Every user-facing surface uses **lowercase iesports**.

### 2. Inline styles only. No new CSS files. No Tailwind classes.
This is the entire codebase's convention. Don't fight it. Look at any existing component (`web/app/components/Navbar.tsx`, `web/app/valorant/tournament/[id]/page.tsx`) for the pattern.

```tsx
// ✅ Correct
<div style={{ background: "#0A0F2A", padding: 18, borderRadius: 12 }}>

// ❌ Wrong (will be rejected in review)
<div className="bg-blue-900 p-4 rounded-xl">
```

CSS class prefixes you'll see in the codebase: `dt-*` (Dota), `vt-*` / `vtd-*` (Valorant), `cs2-*` (CS2), `ie-*` (landing / shared). These are inline `<style>` tags inside the component, not separate files.

### 3. The `isBracket` guard is sacred
In any Swiss-tournament logic or standings recompute, the very first thing you do is:

```ts
if (existingMatch.isBracket === true) return; // never apply Swiss logic to bracket matches
```

Forgetting this caused real bugs that took hours to fix. If you write any function that touches a match document, ask yourself "what happens if this is a bracket match" first.

### 4. `adminDb` server-side, `db` client-side
```ts
// In API routes (web/app/api/...):
import { adminDb } from "@/lib/firebaseAdmin";   // ✅

// In page components (web/app/.../page.tsx):
import { db } from "@/lib/firebase";              // ✅
```

Never use the client SDK in an API route — it silently fails for unauthenticated users.

### 5. Valorant per-game data has two storage paths
Reading game data must handle both old and new format:
```ts
const game1 = match.game1 ?? match.games?.game1;  // flat (new) with nested (old) fallback
```

### 6. ACS calculation must avoid division by zero
```ts
const acs = totalRoundsPlayed > 0 ? totalScore / totalRoundsPlayed : 1;
```

### 7. Never commit `.env`, `.env.local`, or any file with secrets
These are gitignored already. Don't change `.gitignore` to include them. Don't print secrets to logs. Don't paste them into Slack/Discord.

### 8. No em-dashes or double-hyphens in anything you write for Sarthak
He has a strong stylistic preference. Use commas, colons, parentheses, or split sentences instead. Applies to:
- PR descriptions
- Commit messages
- Comments in code
- Code text shown in UI

Compound words like `diff-suppress` and CLI flags like `--apply` are fine — those aren't prose.

### 9. Three sort sites for Valorant standings must stay in sync
The seed-to-team mapping is computed in three places:
- `web/app/valorant/tournament/[id]/page.tsx` (standings table render)
- `web/app/api/valorant/generate-brackets/route.ts` (bracket generator)
- `web/scripts/dev-tools/resolveBracketPlaceholders.ts` (resolver)

All three MUST use the same tiebreaker: `points desc → roundsWon-roundsLost desc → mapsWon-mapsLost desc → wins desc`. If you touch one, touch all three.

### 10. The bot's heartbeat is a Firestore write budget time-bomb
`bot/src/services/bot-lobby.ts` publishes lobby state every 1.5s. It's currently diff-suppressed — only writes when the payload changes, with a 5-minute liveness floor. **Do not** undo this optimization. A naive 1.5s heartbeat = 57,000 Firestore writes/day = paid-tier overage. (See `project_iesports_firestore_write_budget.md` in CLAUDE_CONTEXT.md.)

---

## Active tournaments (situational awareness)

These are running on the platform RIGHT NOW. Be extra careful around their data:

| Tournament | Game | Status | Firestore ID |
|---|---|---|---|
| Domin8 Ultimate Tilt-Proof | Dota 2 | Active (R2 closing, R3 round-robin in progress) | `tournaments/domin8-ultimate-tilt-proof-tournament` |
| League of Rising Stars: Ascension | Valorant | Active (group stage done, playoffs scheduled Sun May 31) | `valorantTournaments/league-of-rising-stars-ascension` |
| Dota Test (Major + Shrey) | Dota 2 | Test only — safe to break | `tournaments/dota-test-major-shrey` |

**If you need to test something against real-feeling data, use the test tournament.** Never run a script or admin action against the two active tournaments without Sarthak approving the exact command first.

---

## What you can confidently touch

- Anything in `web/app/components/` (shared React components)
- Any page in `web/app/*/page.tsx` (UI work, layout, styling)
- `web/app/valorant/tournament/[id]/team/[teamId]/page.tsx` (the new team detail page — lots of polish opportunities here)
- `web/lib/valorantTeamAnalytics.ts` (pure functions, no I/O, easy to extend)
- Adding new entries to `web/lib/types.ts` (extend, don't restructure)
- Public assets in `web/public/` (logos, images)
- Documentation files in `docs/`

## What you must NEVER touch without explicit approval

- `web/lib/firebaseAdmin.ts` (one bad change took the site down for hours; uses a lazy Proxy pattern that is fragile)
- `bot/` directory (Railway-deployed; breaking this breaks live tournament operations)
- `web/scripts/ad-hoc/` (one-off scripts that mutate production data)
- `web/scripts/seedTournaments.ts` and other root-level seed scripts
- `web/app/api/payments/` (Razorpay WIP, gitignored anyway)
- Anything that has `Razorpay`, `prizeMoney`, or `payout` in its name or comments
- `.env`, `.env.local`, `.env.example` (secrets)
- The contents of `bot/src/services/dota-gc.ts` (Steam Game Coordinator protocol; broken changes here break Dota lobby creation across all tournaments)

If you're unsure whether something is in this list, ASK FIRST.

---

## Architecture you need to know

### The web ↔ bot message bus

The Next.js website and the Discord/Dota bot communicate **only** via Firestore. No HTTP. No webhooks. Just shared collections:

| Collection | Direction | Purpose |
|---|---|---|
| `botLobbyCommands` | web → bot | "Create a Dota lobby with these settings" |
| `botLobbyControl/state` | bot → web | Live lobby status (members, match ID, GC connection state) |
| `botDiscordCommands` | web → bot | "Move these users out of this VC" |
| `dotaResultJobs` | web → bot | "Fetch match result for matchId X" |
| `botQueues` | bidirectional | Per-match queue state (which players are in lobby, captured matchId, etc.) |
| `whatsappOutbox` | web → external | WhatsApp notification queue |

Latency: ~1-2 seconds via Firestore onSnapshot listeners (replaced polling earlier this month — `iesports-firestore-write-budget` memory).

### Game data Firestore shapes

```
tournaments/{tid}                    ← Dota 5v5 tournaments
  matches/{mid}                      ← per-match data (BO1 typically)
  teams/{teamId}                     ← roster + members array
  standings/{teamId}                 ← computed standings

valorantTournaments/{tid}            ← Valorant tournaments
  matches/{mid}                      ← per-match data (BO2 typically)
    game1, game2 fields with playerStats, roundResults, etc.
  teams/{teamId}                     ← roster + members array with riotPuuid
  standings/{teamId}                 ← computed standings
  soloPlayers/{uid}                  ← solo registrations before team shuffle

cs2Tournaments/{tid}                 ← CS2 tournaments (no rank API; Steam-anchored)
```

### Authentication flows

Three ways users can sign in:
1. **Phone OTP** (Firebase Auth) — primary path, mandatory Steam link follow-up
2. **Discord OAuth** — both for linking and standalone sign-in
3. **Steam OpenID** — for Dota/CS2 verification

Some user UIDs start with `discord_` (Discord-only signup) or `steam_` (Steam-anchored). Don't assume `user.uid` is a phone-number-derived ID.

### Vercel + Railway

- **Vercel** auto-deploys the Next.js app on every push to `main`. The Vercel project is named `iesports` (not `web` — there was a deploy incident from creating the wrong project name).
- **Railway** auto-deploys the bot on every push to `main`. The bot service runs 24/7 and holds the Steam Game Coordinator connection.
- Both deploy in ~90 seconds after merge.

---

## Recent landmines (incidents from the last 30 days)

These are real bugs that took hours to fix. Read them so you don't repeat them.

### Firestore write quota blowout
The bot heartbeat was writing every 1.5 seconds, 24/7 = 57K writes/day, blowing past the 20K free tier and racking up paid-tier costs. Fixed by diff-suppressing the heartbeat (only write when payload changes). See `bot/src/services/bot-lobby.ts:publishLobbyState`.

### Bracket seeds drifting from standings
The Valorant playoff bracket was showing CHOOZE in seed #3 while the standings page showed MUTH at #3. Root cause: three different code paths sorted the standings with three different tiebreakers. Fixed by unifying them. See Rule #9 above.

### Vercel build failing for hours due to Firebase Admin SDK eager init
The Admin SDK was throwing during Next.js's static-page-data collection step (because env vars aren't available in worker processes). Fixed with a Proxy-based lazy initializer. Don't undo this pattern in `web/lib/firebaseAdmin.ts`.

### CSODOTALobby proto field number wrong
The Dota Game Coordinator protocol stores lobby members at field 120, not field 2 (which is what the old code assumed). The fix took weeks because matches looked empty when they weren't. See `reference_dota_csodotalobby_proto.md` if you ever need to touch the bot.

### Two Vercel projects accidentally
Someone ran `vercel --prod --yes` without `vercel link`, which created a new "web" project instead of using the existing "iesports" project. Result: deployment confusion. Fix: always `vercel link --project iesports --yes` first if relinking. Better: just let git pushes auto-deploy.

### `_cleanWrongMatchIds.ts` script wiped match data
A cleanup script for stale match IDs over-matched and wiped status/winner/completedAt on completed Domin8 matches. Required a manual restore script. Lesson: cleanup scripts that touch production data MUST narrow their query as tightly as possible AND do a dry-run first. See `scripts/ad-hoc/_perTeamValueAnalysis.ts` for the "dry-run by default, --apply to commit" pattern that every ad-hoc script should follow.

---

## When to ask who

| Question | Ask |
|---|---|
| "How do I do X with git / Codespace / Codespace secrets?" | Sarthak |
| "Can I run this script against production?" | Sarthak. Always. |
| "Is it safe to delete this file?" | Sarthak |
| "How does the bot work?" | Sarthak (then read `docs/CLAUDE_CONTEXT.md`) |
| "How is this React component structured?" | Claude (it reads CLAUDE.md) |
| "What does this Firestore field mean?" | Claude (then verify with Sarthak if unsure) |
| "Help me fix this bug" | Claude first, then Sarthak if stuck for more than 30 min |
| "I want to add a new feature, where should it live?" | Sarthak first, then build with Claude |

---

## Day-1 checklist

Once you finish reading this and the two referenced docs:

- [ ] Codespace is open, `claude` command works in terminal
- [ ] Read `docs/SAFETY_RULES.md` (15 min)
- [ ] Skim `web/CLAUDE.md` (30 min)
- [ ] Skim `docs/CLAUDE_CONTEXT.md` (30 min)
- [ ] Cd into web/, run `npm install`, then `npm run dev`. Codespace forwards the port; click the popup to see the site in your browser. Confirm it loads.
- [ ] Open `web/app/valorant/tournament/[id]/team/[teamId]/page.tsx` in your editor. Skim it. This is a recent, well-commented file — good orientation.
- [ ] Make a tiny test change: add your name to a comment somewhere in `ONBOARDING.md`, commit on a branch `sister/handshake-test`, push, open a PR titled "test: handshake PR — please ignore". Goal: prove the workflow works end-to-end. Sarthak closes it without merging.
- [ ] Tell Sarthak the handshake PR is up. He confirms and you're off.

---

## Final note

You are not expected to know everything on day one. You are expected to:
- Read the docs we've given you
- Ask questions when in doubt
- Keep PRs small
- Treat production data as if it cost real money (it does)
- Be honest about what you don't understand

The platform serves real users running real tournaments with real prize pools. We don't move fast and break things. We move with care and ship things that work.

Welcome to the team.

— iesports build
