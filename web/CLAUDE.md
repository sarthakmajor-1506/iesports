# IEsports — Claude Code Context
> Place this file at: `web/CLAUDE.md` (inside the Next.js app root)
> Last refreshed: 14 April 2026

---

## Project Overview

**IEsports** (`iesports.in`) is an Indian esports tournament platform targeting serious-but-casual players who want fair, rank-verified competitive play. Founded and built by Sarthak Jain.

- **Live games:** Valorant, Dota 2, CS2 (Counter-Strike 2)
- **Coming next:** Call of Duty (Q3 2026)
- **Go-to-market:** Offline-first via Domin8 Esports Cafe LAN events; online platform runs between events
- **2026 goal:** 1,000+ registered users
- **In progress:** Riot Games Production API key application — mandatory legal pages, footer disclaimer, and `riot.txt` placeholder are now live; RSO integration to follow approval

---

## Repo Structure

```
/Users/sjain/Documents/iesports/iesports/
  web/                                       ← Next.js app (THIS is the working directory)
    app/
      api/
        admin/                                ← All admin routes (ADMIN_SECRET / verifyAdmin protected)
          adjust-rating, assign-tournament, create-tournament, delete-game-data,
          delete-tournament, list-tournaments, rebuild-player-snapshot, save-shuffle-video,
          set-cafe-admin, test-discord-dm, update-player, update-user, upload-share-bg, verify-riot
        auth/
          steam/route.ts                      ← initiates Steam OpenID login
          steam-callback/route.ts             ← verifies Steam, saves to Firestore
          discord-callback/route.ts           ← Discord link callback + auto server join
          discord/route.ts                    ← Discord link starter (existing users)
          discord-login/route.ts              ← Discord sign-in (new users)
          discord-login-callback/route.ts     ← Discord login → Firebase custom token
          link-from-discord/route.ts          ← link a phone account to a discord-only account
          verify-phone/route.ts               ← phone OTP verification
        comments/route.ts                     ← tournament/match comment threads
        cs2/
          solo/route.ts                       ← CS2 solo tournament registration
          unregister/route.ts                 ← CS2 unregister
        dota/unregister/route.ts              ← Dota unregister
        dota2/daily-matches/route.ts          ← daily Dota match aggregator
        featured-tournaments/route.ts         ← landing page tournaments
        player/[uid]/route.ts                 ← public player profile fetch
        rank-reports/route.ts                 ← player-vs-player rank dispute reports
        riot/
          lookup/route.ts                     ← Riot ID lookup + rank (interim third-party Valorant rank service)
          refresh/route.ts                    ← refresh stored Riot rank
          replace/route.ts                    ← swap a linked Riot ID
        solo/
          register/route.ts                   ← Dota solo tournament registration
          refresh/route.ts                    ← refresh solo score from OpenDota
        teams/
          create/route.ts                     ← Dota 5v5 team create
          join/route.ts                       ← Dota 5v5 team join by code
          solo/route.ts                       ← Dota 5v5 solo pool registration
        tournaments/
          list/route.ts                       ← unified tournament list
          detail/route.ts                     ← unified tournament detail
        valorant/
          generate-all-pairings, generate-brackets, list-users, manual-game-result,
          match-fetch, match-result, match-update, modify-roster, resolve-round,
          seed-dummy-data, share-image, shuffle-teams, solo, substitute,
          swiss-pairings, unregister, update-team-logo, update-team-name
        waitlist/route.ts, waitlist/list/route.ts
      auth/
        discord-success/page.tsx              ← Discord login success → signInWithCustomToken
        steam-success/page.tsx                ← Steam link success
      components/
        Navbar.tsx
        DotaTournaments.tsx
        ValorantTournaments.tsx
        CS2Tournaments.tsx
        SoloTournaments.tsx
        DoubleBracket.tsx                     ← SVG double elimination bracket visualization
        RegisterModal.tsx
        PhoneVerifyModal.tsx
        DailyMatches.tsx                      ← Dota 2 daily match feed widget
        CommentSection.tsx
        DiscordAccountsPrompt.tsx
        RankReportBadge.tsx
        ShareVideoCarousel.tsx
        ShuffleVideoPlayer.tsx
        TournamentLoader.tsx
        remotion/                             ← Remotion video templates (share videos)
      context/
        AuthContext.tsx                       ← Firebase auth + Steam/Discord/Riot checks + redirects
      about/page.tsx                          ← About page (public, reviewer-friendly)
      privacy/page.tsx                        ← Privacy Policy (Riot/DPDP compliance)
      terms/page.tsx                          ← Terms of Service (Riot/monetization compliance)
      cod/page.tsx                            ← CoD landing (coming soon)
      connect-steam/page.tsx
      connect-riot/page.tsx                   ← Riot ID search + screenshot upload (interim)
      dashboard/page.tsx                      ← redirect-only shim (auth → /valorant)
      dota2/page.tsx
      valorant/page.tsx
      valorant/tournament/[id]/page.tsx       ← Valorant tournament detail
      valorant/match/[tournamentId]/[matchId]/page.tsx
      cs2/page.tsx
      cs2/tournament/[id]/page.tsx            ← CS2 tournament detail
      tournament/[id]/page.tsx                ← Dota 5v5 tournament detail
      solo/[weekId]/page.tsx                  ← Dota solo week tournament
      player/[uid]/page.tsx
      login/page.tsx
      admin/page.tsx                          ← Admin panel
      layout.tsx                              ← Root layout + Vercel Analytics
      page.tsx                                ← Landing page (long, ~800 lines)
    lib/
      firebase.ts                             ← client Firebase SDK + getStorage export
      firebaseAdmin.ts                        ← Admin SDK singleton
      types.ts                                ← Core shared TypeScript types
      types-additions.ts                      ← Newer types (CS2, rank reports, etc.)
      opendota.ts                             ← OpenDota rank fetch + smurf scoring
      soloScoring.ts                          ← Dota solo tournament scoring engine
      soloTournaments.ts                      ← solo tournament helpers
      discord.ts                              ← Discord DM / channel helpers
      elo.ts                                  ← Elo rating math (Valorant)
      recalcTiers.ts                          ← S/A/B/C tier recalculation
      fetchAndSyncPlayer.ts                   ← player snapshot rebuild
      valorantPlayerSnapshot.ts               ← Valorant player aggregate snapshot
      checkAdmin.ts, verifyAdmin.ts           ← admin auth helpers
    scripts/
      seedTournaments.ts, seedValorantTournaments.ts, seedCS2Tournaments.ts,
      seedDota2Tournament.ts, seedSoloTournaments.ts, seedShuffleTournament.ts
      clearRegistrations.ts, clearLeaderboard.ts, clearShareBgs.ts
      refreshRanks.ts, recalcTiers (via lib), syncSoloPlayers.ts
      applyMatchElo.ts, buildDiscordMsg.ts, checkLeaderboard.ts, dumpGrandFinal.ts
      fixBracketAdvancement.ts, makeAscensionFree.ts, removePlayer.ts,
      resetLbFinal.ts, resetPrelims.ts, resetRatings.ts, restoreLbFinal.ts,
      sendAscensionDMs.ts, testToss.ts, unregDotaPlayer.ts
    public/
      riot.txt                                ← Riot domain verification (placeholder until approved)
      ielogo.png, riot-games.png, valorantlogo.png, dota2logo.png, cs2logo.png, codlogo.jpeg, ...
    .env.local                                ← NEVER commit this
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router, TypeScript) |
| Backend | Next.js API Routes |
| Database | Firebase Firestore (Blaze plan) |
| Auth | Firebase Auth — Phone OTP + Steam OpenID + Discord OAuth |
| Rank API (Dota) | OpenDota (2,000 req/month free) |
| Rank API (Valorant) | Interim third-party Valorant rank service (`HENRIK_API_KEY` env var) — to be replaced with official Riot endpoints after Production API approval |
| Rank API (CS2) | Steam profile data (no public CS2 rank API; verified via Steam OpenID) |
| Hosting | Vercel |
| Analytics | Vercel Analytics (`@vercel/analytics`) — wired in `app/layout.tsx` |
| Admin SDK | firebase-admin for all server-side Firestore reads/writes |
| Video | Remotion (share-video templates in `app/components/remotion/`) |

---

## Coding Rules (FOLLOW THESE STRICTLY)

### 1. Inline styles only
- **NO new CSS files, NO Tailwind classes, NO CSS modules**
- All styling is inline (`style={{ ... }}`) throughout the codebase
- Existing CSS class prefixes: `dt-*` (Dota), `vt-*` (Valorant), `cs2-*` / `cs-*` (CS2), `ie-*` (landing/shared), `pp-*` (player profile), `val-*` (Valorant secondary)

### 2. Additive changes to shared files
- `lib/types.ts` and `lib/types-additions.ts` — add new types, never restructure existing ones
- `AuthContext.tsx` — extend, never rewrite
- `Navbar.tsx` — add sections, never restructure
- When in doubt, extend existing patterns rather than creating new abstractions

### 3. Multi-game extensibility via constants
Adding a new game means ONLY adding entries to these objects:
```typescript
GAME_COLLECTIONS     // maps game slug → Firestore collection name
GAME_OPTIONS         // dropdown options for admin panel
FORMAT_OPTIONS       // tournament format options
```

### 4. `isBracketMatch` guard — CRITICAL
Swiss auto-resolve and standings logic MUST be gated at the top:
```typescript
if (existingMatch.isBracket === true) return; // prevent Swiss logic from corrupting bracket matches
```

### 5. Admin API routes pattern
All admin routes require `ADMIN_SECRET` (legacy) or `verifyAdmin()` from `lib/verifyAdmin.ts` (preferred for new routes):
```typescript
const secret = req.headers['x-admin-secret'] || req.nextUrl.searchParams.get('secret');
if (secret !== process.env.ADMIN_SECRET) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### 6. Server-side Firestore — always use Admin SDK
Client-side reads fail silently for unauthenticated users. In all API routes:
```typescript
import { adminDb } from '@/lib/firebaseAdmin'; // ✅ use this in API routes
// import { db } from '@/lib/firebase';         // ❌ client SDK only in client components
```

### 7. Valorant match data — dual storage path
```typescript
const game1 = match.game1 ?? match.games?.game1; // flat (new) with nested (old) fallback
```

### 8. ACS computation
```typescript
const acs = totalRoundsPlayed > 0 ? totalScore / totalRoundsPlayed : 1; // avoid div by zero
```

### 9. No debug console.logs in production routes
Remove all `console.log` from API routes before committing.
**Exception:** paired success/error operational logs in Discord-integration code (e.g. `match-update`, `match-fetch`, `match-result`) are allowed — they're not debug traces, they're production telemetry.
**Never** log raw OAuth token responses, client secrets, or other auth secrets.

### 10. Riot API compliance (NEW — Production application in progress)
- Never log, embed, or expose any Riot API key in client code.
- Always include the mandatory Riot disclaimer in any new public page footer (verbatim — see `app/privacy/page.tsx` for the exact wording).
- Never build an MMR/ELO calculator, alternative ranking system, or "true rank" estimator from Riot data — Riot policy forbids it. The internal Elo math in `lib/elo.ts` is for tournament seeding only and must never be surfaced as a parallel rank.
- Never de-anonymise other players (don't expose another user's PUUID/Riot ID without their consent).
- Use Data Dragon / Riot Press Kit for any Riot logos and assets; do not redistribute Riot IP.
- See "Riot API Production Application" section below.

### 11. Git workflow
```bash
git add -A && git commit -m "feat: ..."
```

---

## Firestore Collections

### `users/{uid}`
```
phone, fullName, steamId, steamName, steamAvatar, steamLinkedAt, createdAt
dotaRankTier, dotaBracket (herald_guardian | crusader_archon | legend_ancient | divine_immortal)
dotaMMR, recentMatches, smurfRiskScore, rankFetchedAt
discordId, discordUsername, discordAvatar, discordConnectedAt
riotGameName, riotTagLine, riotAvatar, riotRank, riotTier, riotPuuid
riotRegion, riotAccountLevel, riotVerified (unlinked | pending | verified)
riotScreenshotUrl, riotLinkedAt, riotVerificationNote
role (super_admin | cafe_admin)                ← admin gating
registeredTournaments: string[]                ← Dota 5v5
registeredSoloTournaments: string[]            ← Dota solo
registeredValorantTournaments: string[]        ← Valorant
registeredCS2Tournaments: string[]             ← CS2
```

### Dota 2
- `tournaments/{id}` — 5v5 team tournaments
- `teams/{id}` — 5v5 teams
- `soloPool/{id}` — 5v5 solo matchmaking pool
- `soloTournaments/{id}` — solo week tournaments
- `soloTournaments/{id}/players/{uid}` — solo player scores

### Valorant
- `valorantTournaments/{id}` — tournaments
- `valorantTournaments/{id}/soloPlayers/{uid}` — registered players (bracket null until computed)
- `valorantTournaments/{id}/matches/{id}` — match documents
- `valorantTeams/{id}` — teams
- `valorantPlayerSnapshots/{uid}` — aggregate per-player stats (Elo, ACS, K/D, etc.)

### CS2
- `cs2Tournaments/{id}` — tournaments
- `cs2Tournaments/{id}/soloPlayers/{uid}` — registered players
- `cs2Teams/{id}` — teams (where applicable)

### Shared
- `comments/{id}` — tournament/match comment threads
- `rankReports/{id}` — player-vs-player rank dispute submissions
- `waitlist/{id}` — pre-launch / event waitlist signups

---

## Auth Flows

### Phone OTP (primary)
Firebase Auth phone OTP → mandatory Steam link → dashboard

### Discord Login (new users)
`/api/auth/discord-login` → `/api/auth/discord-login-callback` → Firebase custom token → `/auth/discord-success` → signInWithCustomToken → game page
New user UIDs: `discord_{discordId}`

### Discord Link (existing users)
`/api/auth/discord?uid=XXX` → `/api/auth/discord-callback`

### Link phone → discord-only account
`/api/auth/link-from-discord` — merges a phone-verified account onto an existing discord-only account

### Riot ID (manual verification — interim)
`/connect-riot` → interim Valorant rank API lookup → optional screenshot upload → admin sets `riotVerified: "verified"` via `/api/admin/verify-riot`
**Will be replaced** with Riot Sign-On (RSO) immediately after Production API approval.

### AuthContext path rules
```typescript
PUBLIC_PATHS        // no auth required (landing, /about, /privacy, /terms, /cod, discord-success, etc.)
STEAM_EXEMPT_PATHS  // auth required but Steam not required (/connect-steam, /connect-riot)
// Everything else: auth + Steam required
```

---

## Game-Specific Patterns

### Valorant
- **Bracket assignment:** dynamic post-registration. Brackets (S/A/B/C) are NOT assigned at registration — only raw `riotTier` stored. After reg closes, admin runs bracket computation → quartile-based S/A/B/C. `bracketsComputed: boolean` flag tracks state.
- **Tournament formats:** `shuffle` (solo reg → snake-draft → Swiss → double elim), `auction` (captain picks with budget; S-tier cap = max 2 per team), `standard` (pre-formed teams, direct bracket).
- **DoubleBracket.tsx:** SVG visualization. Reads from flat `team1Name`/`team2Name` fields — NOT nested objects. 50/50 split: top seeds → Upper Bracket, bottom → Lower Bracket.
- **Interim Valorant rank API:** see `HENRIK_API_KEY` env var and `app/api/riot/lookup/route.ts` for endpoint and auth details. Rate-limited; will be replaced with official Riot endpoints after Production approval.
- **Elo (`lib/elo.ts`):** Internal tournament seeding only. Never expose as a "true rank" or parallel MMR.

### Dota 2
- **Solo scoring (`lib/soloScoring.ts`):**
  ```
  Score = (Kills × 3) + (Assists × 1) - (Deaths × 2) + (LastHits ÷ 10) + (GPM ÷ 100) + (XPM ÷ 100) + (Win ? 20 : 0)
  Player total = sum of top 5 match scores within tournament window
  ```
- **Daily matches widget:** `/api/dota2/daily-matches` aggregates recent matches across active solo players.
- **Rank source:** OpenDota — public match history + rank tier.

### CS2
- **Auth:** Steam OpenID only (no public CS2 rank API exists).
- **Registration:** `users/{uid}` must have `fullName`, phone, `discordId`, `steamId` before joining a CS2 tournament.
- **Storage:** `cs2Tournaments/{id}/soloPlayers/{uid}` for solo registrations.
- **Tier system:** No automated ranking — admins or community organisers manually balance CS2 rosters where needed.

---

## Naming Conventions

| Entity | Dota 2 | Valorant | CS2 |
|--------|--------|----------|-----|
| Firestore collection | `tournaments` | `valorantTournaments` | `cs2Tournaments` |
| Teams collection | `teams` | `valorantTeams` | `cs2Teams` |
| User registered array | `registeredTournaments` | `registeredValorantTournaments` | `registeredCS2Tournaments` |
| User rank field | `dotaRankTier` | `riotTier` | — (none) |
| Bracket type | `Bracket` (herald_guardian etc) | `RiotBracket` ("S"/"A"/"B"/"C") | — |
| TS tournament type | `Tournament` | `ValorantTournament` | `CS2Tournament` |
| TS team type | `Team` | `ValorantTeam` | `CS2Team` |
| CSS class prefix | `dt-*` | `vt-*` / `val-*` | `cs2-*` / `cs-*` |
| API routes | `/api/teams/*`, `/api/solo/*` | `/api/valorant/*` | `/api/cs2/*` |

---

## Environment Variables

```env
# Firebase Admin (server-side only)
FIREBASE_PROJECT_ID=iesports-auth
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@iesports-auth.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Firebase Client (NEXT_PUBLIC_ prefix)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Steam
STEAM_API_KEY=

# Discord
DISCORD_BOT_TOKEN=
DISCORD_SERVER_ID=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=

# Valorant (interim)
HENRIK_API_KEY=HDEV-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Riot (after Production API approval)
# RIOT_API_KEY=RGAPI-xxxxxxxx
# RIOT_RSO_CLIENT_ID=
# RIOT_RSO_CLIENT_SECRET=

# Admin routes
ADMIN_SECRET=

# App
NEXT_PUBLIC_APP_URL=https://iesports.in
```

---

## Useful Commands

```bash
# Dev (run from /web directory)
npm run dev

# Typecheck
npx tsc --noEmit

# Seed data
npx tsx scripts/seedTournaments.ts
npx tsx scripts/seedValorantTournaments.ts
npx tsx scripts/seedCS2Tournaments.ts
npx tsx scripts/seedDota2Tournament.ts
npx tsx scripts/seedSoloTournaments.ts
npx tsx scripts/clearRegistrations.ts

# Operational
npx tsx scripts/refreshRanks.ts
npx tsx scripts/applyMatchElo.ts
npx tsx scripts/syncSoloPlayers.ts

# Deploy
vercel --prod
```

---

## Riot API Production Application (in progress)

iesports is applying for a Riot Games Production API key to replace the interim third-party Valorant rank service and unlock Riot Sign-On (RSO).

### Hard requirements already in place
- ✅ `web/public/riot.txt` placeholder (paste verification string from Riot here after submitting)
- ✅ `app/privacy/page.tsx` — full DPDP-compliant Privacy Policy
- ✅ `app/terms/page.tsx` — full ToS with games-of-skill clause and 70%-to-prize-pool rule
- ✅ `app/about/page.tsx` — public about page reviewers can land on without login
- ✅ Mandatory Riot disclaimer in landing-page footer (`app/page.tsx`) and inside each legal page
- ✅ Footer links wired up (Contact → `iesportsbot@gmail.com`)
- ✅ Removed leaky debug logs from `api/auth/discord-callback/route.ts` (was leaking OAuth tokens)

### Still to do before submission
- [ ] Replace `public/riot-games.png` and `public/valorantlogo.png` with official Riot Press Kit / Data Dragon assets
- [ ] Record a 2-minute Loom of: signup → connect Riot → register Valorant tournament → see bracket
- [ ] Deploy so `iesports.in/{privacy,terms,about,riot.txt}` all return 200
- [ ] Submit application at developer.riotgames.com, paste Riot's verification string into `riot.txt`, redeploy

### Post-approval work
- [ ] Apply for RSO Client (separate review, ~1-2 weeks)
- [ ] Replace `/connect-riot` screenshot flow with RSO OAuth (kills the manual `verify-riot` admin path)
- [ ] Switch `/api/riot/lookup` from the interim third-party rank service to official Riot API endpoints
- [ ] Add `RIOT_API_KEY`, `RIOT_RSO_CLIENT_ID`, `RIOT_RSO_CLIENT_SECRET` to env

### Riot policy red lines (never violate)
- ❌ No crypto / NFT / blockchain integration
- ❌ No gambling, betting, wagering, or chance-based contests
- ❌ No MMR / ELO calculators or "true rank" estimators surfaced to users
- ❌ No de-anonymising other players (PUUIDs, Riot IDs)
- ❌ No storing Riot account passwords (we don't — keep it that way)
- ❌ No embedding the API key in client code (server-side only, always)
- ❌ At least 70% of net entry fees must go to prize pools

---

## Known Bugs / Tech Debt

- `smurfRiskScore` always returns 0 (OpenDota scoring logic broken)
- `app/dashboard/page.tsx` is a redirect-only shim — can be removed when nothing links there
- Mobile Navbar drawer missing Riot section
- Some Valorant operational `console.log`s (in `match-update`, `match-fetch`, `match-result`) are deliberately kept for production Discord-integration telemetry — see Coding Rule #9 exception
- CS2 has no automated rank verification — purely Steam-link-based trust

---

## What's Next (Priority Order)

### P0 — Riot Production API approval
- Complete the "Still to do before submission" checklist above
- Submit and respond to reviewer messages within the portal

### P1 — RSO integration (post-approval)
- Replace screenshot verification with RSO OAuth
- Switch from the interim third-party rank service to official Riot API endpoints

### P2 — Valorant Auction System polish
- Auction lobby UI (captain picks, budget tracking)
- Live auction (WebSocket or polling)
- S-tier cap enforcement (max 2 per team)

### P3 — Code Health
- Error boundaries on connect-riot and Valorant pages
- Loading skeletons for tournament lists
- Replace remaining `ADMIN_SECRET` checks with `verifyAdmin()` from `lib/verifyAdmin.ts`
- Fix `smurfRiskScore` calculation
- Remove `app/dashboard/page.tsx` once nothing links there
- Mobile Navbar: add Riot section in drawer

### P4 — Future
- Razorpay payment gateway (paid tournaments, Q3 2026)
- Call of Duty integration
- Riot LoL / TFT / 2XKO support (after Valorant production app is approved — same product, additional game applications)

---

## Strategic Context

- **Target segment:** Serious-but-casual players (NOT elite — small market, high prize expectations, low entry fee tolerance)
- **Revenue path:** Entry fees → local brand sponsorships → subscriptions → prize pool rake at scale
- **Valorant:** Acquisition engine (larger casual base)
- **Dota:** Retention engine (stickier community)
- **CS2:** Steam-anchored audience, complements Dota community, easier admin overhead (no automated rank API to maintain)
- **Valorant lobby creation:** Cannot be automated — Riot has no Tournament API for Valorant. Human must create lobby in client. Automation scope = registration, rank verification, bracket management, result polling, Discord integrations only.
- **Riot RSO:** P1, blocked on production API approval. Current Valorant rank lookup is via an interim third-party service.
- **Offline-first:** LAN events build trust and community; online platform maintains engagement between events.
- **Compliance:** Indian DPDP Act 2023 + Riot Developer Policies + games-of-skill positioning (not gambling). All three are now reflected in `/privacy` and `/terms`.
