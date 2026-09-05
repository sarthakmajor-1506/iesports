# Draft Lab — product brief and open problem

**Status: built, playtested twice, not fun either time.** This document describes exactly what exists, what is measurably true, what has been ruled out and why, and what the actual unsolved problem is. It is written for someone with no prior context who is being asked to make it interesting.

Built 4 Sep 2026. Lives at `/draftlab` inside the IEsports web app (Next.js 16 / React 19 / Firestore / Vercel). Single developer. Audience is Indian Dota 2 players; IEsports already runs Dota/Valorant/CS2 tournaments and has Steam OpenID login and player rank data in production.

---

## 1. The original idea

A competitive web game about Dota 2 *drafting* — the pre-game phase where each team picks five heroes from ~127, and the matchup between those ten heroes partially determines who wins. The pitch was: make a decision, get a data-backed evaluation of that decision, learn why, improve, compete on a rating. Later expand from drafting into itemisation and other in-game decisions.

The intended framing was "Lichess puzzles, but the board is a Dota draft."

---

## 2. Hard constraints (any redesign must respect these)

These are not opinions. They are measured or structural.

**2.1 — Draft only explains ~60-65% of match outcomes.** This is a ceiling, not an engineering shortfall. Most of what decides a Dota match is played out over 40 minutes by ten people. No model of the draft alone can be much better than this. Published claims above ~65% generally leak post-game information.

**2.2 — The model we have is 58.0% accurate.** Trained on 2,566,078 Ranked All Pick matches from patch 7.41, evaluated on 227,862 strictly newer held-out matches:

| Model | Accuracy | Log loss (coin flip = 0.6931) |
|---|---|---|
| Coin flip / Radiant side bias | 52.7% | 0.6917 |
| Hero base win rates only | 55.7% | 0.6834 |
| Full: base + synergy + counters | **58.0%** | **0.6737** |

It is well calibrated — worst deviation between stated and actual win rate is **3.7 percentage points**.

**2.3 — The model has no authority.** This is the consequence of 2.1 and 2.2 combined, and it may be the core problem. A chess engine is vastly better than any human, so when it says you blundered, you blundered and you learn. Our model is barely better than raw hero win rates. When it disagrees with the player, neither the player nor we can tell who is right. Its worst calibration error (3.7pp) is comparable to the gap between the options it asks players to choose between.

**2.4 — The model does not transfer to professional matches.** Tested against 40 real pro matches: **42.5% outcome accuracy, log loss 0.7264 — worse than a coin flip.** It is a pub model. Professional drafting depends on player hero pools, opponent scouting, ban-baiting across a series, and strategies practised at bootcamp — none of which are in the data. This killed the originally planned "out-draft the pros" mode, which was by far the most marketable version of the idea.

**2.5 — What the model does NOT know:** roles, lanes, positions, items, ability builds, player identity or skill beyond a coarse bracket, whether a composition can physically break high ground, or anything that happens after minute zero.

---

## 3. What is actually built

Two modes, both drawing on 200 real held-out Ranked All Pick matches at Legend bracket or above.

### Mode A — "Draft a team" (`/draftlab/draft`)

- A real enemy five-hero line-up. Two heroes shown up front; one more revealed before each of your next three picks, so your fifth pick is made with their whole side visible.
- You pick all five of your heroes from ~118 available, with hero search and role-tag filters.
- A win-probability bar updates after every pick.
- On completion: your five vs. what those players actually ran, side by side with both probabilities, plus a pick-by-pick list showing what each pick cost against the best available *at that moment*.
- Each pick is graded only on information visible when it was made — never re-judged later using heroes that had not yet been revealed.
- The enemy five are fixed; they are not reacting to you. The UI states this.

### Mode B — "Quick calls" (`/draftlab`)

- Nine heroes on the board: all five enemies, four of yours. Choose the tenth.
- Four options offered, drawn from the model's 1st, 5th, 10th and 15th ranked heroes for that slot, shuffled.
- Ten rounds per run, progress dots, then a run-complete screen with score and a result strip.
- On reveal: all four options with their win probabilities, the best marked, a one-line explanation citing the strongest contributing matchup with its raw win rate and sample size, and what the real player picked plus whether they won.

### Shared

- Model is ~700KB of coefficients; **all inference runs in the browser**, so evaluating candidates is free and instant.
- Every response is logged anonymously to Firestore (`draftlabResponses`) in a shape a rating model could later consume: choice, the model's candidate values, regret, per-pick regret for drafts, time taken.
- No accounts, no rating, no leaderboard, no bot, no multiplayer.

---

## 4. How the model works (relevant to what explanations are possible)

Additive in log-odds, so every displayed contribution is the real arithmetic of the prediction rather than a post-hoc approximation:

```
P(win) = sigmoid( bias
                + Σ hero base strengths
                + Σ same-team pair terms      (synergy)
                + Σ cross-team pair terms )   (counters)
```

Pair terms are **residuals** — measured against what the two heroes' individual strengths already predict. Without this, "counter" degenerates into "strong hero", and the game becomes "pick the highest win-rate hero". With it, the top counter edges the model finds are textbook: Anti-Mage vs Medusa, Axe and Sven vs Phantom Lancer, Spectre vs Sniper.

This means explanations can cite specific hero pairs with real sample sizes, but **cannot** talk about lanes, roles, timings, damage types or composition concepts — those are not in the model.

---

## 5. What has already been ruled out, and why

| Idea | Why it's out |
|---|---|
| Out-draft the pros | Model is worse than a coin flip on pro matches (2.4) |
| Score against actual match outcome | One match is a coin flip; a good draft loses ~40% of the time |
| Bot opponent | Needs an imitation pick-policy model that does not exist yet |
| Rating / leaderboard / IRT | Deliberately deferred until the loop is proven fun |
| Itemisation mode | Far more data-hungry and conditional; out of scope until drafting works |

---

## 6. Playtest evidence

**Playtest 1** — single pick from all 118 heroes, no session structure, scored against the best of 118. Bored in 10 minutes.

Diagnosis given by the player, unprompted:
- **Did not care about the games.** Anonymous pub matches between strangers; no reason to be curious about any particular one.
- **No arc.** Isolated rounds, nothing accumulating, no ending.

Explicitly *not* the problems: too many options, and distrust of the model.

**Playtest 2** — after adding the five-pick draft mode (arc), the live probability meter, the four-option quick mode, and a ten-round session with an end screen. **Still not fun.**

This is the important data point. The arc problem was addressed directly and it did not fix the experience. That points at stakes — or at something more fundamental than either.

---

## 7. The open problem

> The evaluation layer is honest and works. The structural fixes (arc, session, constrained choice) were made and did not make it fun. Two playtests, both bored inside ~10 minutes.

The two live hypotheses:

1. **No stakes.** Nothing gives the player a reason to care about *this particular* draft. Real pro matches would supply that, but the model cannot score them (2.4). Human opponents would supply it, but that needs infrastructure that does not exist.

2. **The premise may be wrong.** A single drafting decision, graded by a 58%-accurate evaluator, may simply not be a game. Drafting in real Dota is compelling because it is embedded in a match you then play, with teammates, stakes and consequences. Extracted and isolated, it may have nothing left in it.

**What a useful answer would engage with:** how to create stakes without an authoritative model and without multiplayer infrastructure — or a clear argument that the premise should change, and to what.

**What would not help:** generic gamification (XP, streaks, badges, daily challenges, leaderboards). Those attach reward to a loop; they do not make the loop itself interesting, and the loop is what failed.

---

## 8. What is cheap vs. expensive to build

**Cheap** (hours):
- New scenario types — a local corpus of 4.5M matches, fully queryable
- Any amount of model evaluation — inference is client-side and free
- New UI modes, new scoring rules, new explanation formats
- Filtering scenarios by bracket, patch, hero, match length, comp shape

**Moderate** (days):
- An imitation pick-policy ("what would a Divine player pick here") — same data, same techniques; unlocks a human-like bot and better partial-draft evaluation
- Bracket-conditioned pair terms — the biggest available accuracy gain
- Role/position inference from replay-derived lane data (available via OpenDota)
- Daily shared scenario, share cards, Steam login (auth already in production)

**Expensive** (weeks, or blocked):
- Real-time multiplayer
- A model that works on professional matches
- Anything requiring items, timings, or in-game state
- Live Dota client integration (not possible in this form)

---

## 9. Data available but not yet used

OpenDota exposes, for parsed matches: item purchases and timings, ability/skill builds, lane assignments and role inference, gold/XP curves, per-minute state, and professional match history with teams, leagues and full pick/ban order. STRATZ offers similar via GraphQL (licence check needed for commercial use).

Roughly 4.5M raw public matches are already downloaded locally. Pro matches are available but number in the thousands, not millions — enough to *display*, not enough to *train* pair-level statistics on.
