# IEsports — Claude Code Context
> Place this file at: `web/CLAUDE.md` (inside the Next.js app root)

---

## Project Overview

**IEsports** (`iesports.in`) is an Indian esports tournament platform targeting serious-but-casual players who want fair, rank-verified competitive play. Founded and built by Sarthak Jain.

- **Current games:** Dota 2 (live), Valorant (live, growing)
- **Next games:** CS2, COD (Q3 2026)
- **Go-to-market:** Offline-first via Domin8 Esports Cafe LAN events; online platform runs between events
- **2026 goal:** 1,000+ registered users

---

## Repo Structure

```
/Users/sjain/Documents/iesports/iesports/
  web/                        ← Next.js app (THIS is the working directory)
    app/
      api/
        auth/
          steam/route.ts                   ← initiates Steam OpenID login
          steam-callback/route.ts          ← verifies Steam, saves to Firestore
          discord-callback/route.ts        ← Discord link callback + auto server join
          discord-login/route.ts           ← Discord sign-in (new users)
          discord-login-callback/route.ts  ← Discord login → Firebase custom token
        teams/
          create/route.ts                  ← Dota 5v5 team create
          join/route.ts                    ← Dota 5v5 team join by code
          solo/route.ts                    ← Dota 5v5 solo pool registration
        solo/
          register/route.ts                ← Dota solo tournament registration
          refresh/route.ts                 ← refresh solo score from OpenDota
        riot/
          lookup/route.ts                  ← Henrik Dev API: Riot ID lookup + rank
        featured-tournaments/route.ts      ← Landing page tournaments (Admin SDK)
        admin/                             ← All admin routes (ADMIN_SECRET protected)
      auth/
        discord-success/page.tsx           ← Discord login success → signInWithCustomToken
      components/
        Navbar.tsx
        DotaTournaments.tsx
        SoloTournaments.tsx
        ValorantTournaments.tsx
        RegisterModal.tsx
        DoubleBracket.tsx                  ← SVG double elimination bracket visualization
      context/
        AuthContext.tsx                    ← Firebase auth + Steam/Discord/Riot checks + redirects
      connect-steam/page.tsx
      connect-riot/page.tsx                ← Riot ID search + screenshot upload
      dota2/page.tsx
      valorant/page.tsx
      tournament/[id]/page.tsx             ← Dota 5v5 tournament detail
      valorant/match/[tournamentId]/[matchId]/page.tsx
      player/[uid]/page.tsx
      solo/[weekId]/page.tsx
    lib/
      firebase.ts                          ← client Firebase SDK + getStorage export
      firebaseAdmin.ts                     ← Admin SDK singleton
      types.ts                             ← ALL shared TypeScript types
      opendota.ts                          ← OpenDota rank fetch + smurf scoring
      soloScoring.ts                       ← Dota solo tournament scoring engine
    scripts/
      seedTournaments.ts
      seedValorantTournaments.ts
      clearRegistrations.ts
      checkTournaments.ts
    .env.local                             ← NEVER commit this
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (App Router, TypeScript) |
| Backend | Next.js API Routes |
| Database | Firebase Firestore (Blaze plan) |
| Auth | Firebase Auth — Phone OTP + Steam OpenID + Discord OAuth |
| Rank API (Dota) | OpenDota (2,000 req/month free) |
| Rank API (Valorant) | Henrik Dev API (`HENRIK_API_KEY`) — unofficial, 30 req/min |
| Hosting | Vercel |
| Admin SDK | firebase-admin for all server-side Firestore reads/writes |

---

## Coding Rules (FOLLOW THESE STRICTLY)

### 1. Inline styles only
- **NO new CSS files, NO Tailwind classes, NO CSS modules**
- All styling is inline (`style={{ ... }}`) throughout the codebase
- Existing CSS class prefixes: `dt-*` (Dota), `vt-*` (Valorant)

### 2. Additive changes to shared files
- `lib/types.ts` — add new types, never restructure existing ones
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
All admin routes require `ADMIN_SECRET` check:
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

### 7. Henrik API match data — dual storage path
```typescript
const game1 = match.game1 ?? match.games?.game1; // flat (new) with nested (old) fallback
```

### 8. ACS computation
```typescript
const acs = totalRoundsPlayed > 0 ? totalScore / totalRoundsPlayed : 1; // avoid div by zero
```

### 9. No debug console.logs in production routes
Remove all `console.log` from API routes before committing.

### 10. Git workflow
```bash
git add -A && git commit -m "feat: ..."
```

---

## Firestore Collections

### `users/{uid}`
```
phone, steamId, steamName, steamAvatar, steamLinkedAt, createdAt
dotaRankTier, dotaBracket (herald_guardian | crusader_archon | legend_ancient | divine_immortal)
dotaMMR, recentMatches, smurfRiskScore, rankFetchedAt
discordId, discordUsername, discordAvatar, discordConnectedAt
riotGameName, riotTagLine, riotAvatar, riotRank, riotTier, riotPuuid
riotRegion, riotAccountLevel, riotVerified (unlinked | pending | verified)
riotScreenshotUrl, riotLinkedAt, riotVerificationNote
registeredTournaments: string[]         ← Dota 5v5
registeredSoloTournaments: string[]     ← Dota solo
registeredValorantTournaments: string[] ← Valorant
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
- `valorantTeams/{id}` — teams

---

## Auth Flows

### Phone OTP (primary)
Firebase Auth phone OTP → mandatory Steam link → dashboard

### Discord Login (new users)
`/api/auth/discord-login` → `/api/auth/discord-login-callback` → Firebase custom token → `/auth/discord-success` → signInWithCustomToken → `/dota2`
New user UIDs: `discord_{discordId}`

### Discord Link (existing users)
`/api/auth/discord?uid=XXX` → `/api/auth/discord-callback`

### Riot ID (manual verification)
`/connect-riot` → Henrik Dev API lookup → screenshot upload → admin sets `riotVerified: "verified"` in Firestore console

### AuthContext path rules
```typescript
PUBLIC_PATHS        // no auth required (landing, discord-success, etc.)
STEAM_EXEMPT_PATHS  // auth required but Steam not required (/connect-steam, /connect-riot)
// Everything else: auth + Steam required
```

---

## Valorant-Specific Patterns

### Bracket assignment (dynamic, post-registration)
- Brackets (S/A/B/C) are NOT assigned at registration — only raw `riotTier` stored
- After reg closes: admin calls `computeValorantBrackets()` → sorts all players by riotTier → quartile-based S/A/B/C
- `bracketsComputed: boolean` flag on tournament doc tracks state

### Tournament formats
- **Shuffle:** solo reg → snake-draft balanced teams → Swiss group stage → double elimination
- **Auction:** captain picks players with budget; S-tier cap = max 2 per team
- **Standard:** pre-formed teams, direct bracket

### DoubleBracket.tsx
- SVG visualization
- Reads from flat `team1Name`/`team2Name` fields — NOT nested objects
- 50/50 split: top seeds → Upper Bracket, bottom → Lower Bracket

### Henrik API
- Base: `https://api.henrikdev.xyz`
- Auth: `api_key` query param + `Authorization: HDEV-xxx` header
- Rate limit: 30 req/min
- Endpoints: `v1/account/{name}/{tag}`, `v2/mmr/{region}/{name}/{tag}`

---

## Dota 2 Solo Scoring (`lib/soloScoring.ts`)
```
Score = (Kills × 3) + (Assists × 1) - (Deaths × 2) + (LastHits ÷ 10) + (GPM ÷ 100) + (XPM ÷ 100) + (Win ? 20 : 0)
Player total = sum of top 5 match scores within tournament window
```

---

## Naming Conventions

| Entity | Dota 2 | Valorant |
|--------|--------|----------|
| Firestore collection | `tournaments` | `valorantTournaments` |
| Teams collection | `teams` | `valorantTeams` |
| User registered array | `registeredTournaments` | `registeredValorantTournaments` |
| User rank field | `dotaRankTier` | `riotTier` |
| Bracket type | `Bracket` (herald_guardian etc) | `RiotBracket` ("S"/"A"/"B"/"C") |
| TS tournament type | `Tournament` | `ValorantTournament` |
| TS team type | `Team` | `ValorantTeam` |
| CSS class prefix | `dt-*` | `vt-*` |
| API routes | `/api/teams/*` | `/api/valorant/teams/*` |

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

# Valorant
HENRIK_API_KEY=HDEV-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

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

# Seed data
npx tsx scripts/seedTournaments.ts
npx tsx scripts/seedValorantTournaments.ts
npx tsx scripts/clearRegistrations.ts
npx tsx scripts/checkTournaments.ts

# Deploy
vercel --prod
```

---

## Known Bugs / Tech Debt

- `smurfRiskScore` always returns 0 (OpenDota scoring logic broken)
- `/tournament/solo/[weekId]/page.tsx` is a duplicate of `/solo/[weekId]/page.tsx` — delete it
- `/dashboard/page.tsx` just redirects to `/dota2` — can be removed
- Debug `console.log`s still in `/api/teams/solo/route.ts` and `discord-login-callback`
- Mobile Navbar drawer missing Riot section

---

## What's Next (Priority Order)

### P0 — Complete Valorant MVP
- Valorant API routes: `/api/valorant/teams/create`, `/api/valorant/teams/join`, `/api/valorant/solo`
- RegisterModal: `game="valorant"` prop (skip Steam check, use riotVerified)
- Valorant tournament detail page (`/valorant/tournament/[id]`)
- Admin bracket computation endpoint
- Mobile Navbar: Riot section in drawer

### P1 — Auction System
- Auction lobby UI (captain picks, budget tracking)
- Live auction (WebSocket or polling)
- S-tier cap enforcement (max 2 per team)

### P2 — Code Health
- Error boundaries on connect-riot and valorant pages
- Loading skeletons for ValorantTournaments
- Admin panel for Riot verification (replace manual Firestore edits)
- Remove duplicate solo page

### P3 — Future
- Razorpay payment gateway (paid tournaments, Q3 2026)
- CS2 integration (Valve/Faceit API)
- COD integration
- Riot RSO (replace Henrik Dev API — pending meaningful player base)

---

## Strategic Context

- **Target segment:** Serious-but-casual players (NOT elite — small market, high prize expectations, low entry fee tolerance)
- **Revenue path:** Entry fees → local brand sponsorships → subscriptions → prize pool rake at scale
- **Valorant:** Acquisition engine (larger casual base)
- **Dota:** Retention engine (stickier community)
- **Valorant lobby creation:** Cannot be automated — Riot has no Tournament API. Human must create lobby in client. Automation scope = registration, rank verification, bracket management, result polling, Discord integrations only.
- **Riot RSO:** P3, pending meaningful player base. Henrik Dev API is interim.
- **Offline-first:** LAN events build trust and community; online platform maintains engagement between events.