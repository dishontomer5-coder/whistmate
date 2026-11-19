# Israeli Whist Companion — Plan (the WHY)

> Durable strategy & history: phases (with OPEN/CLOSED status), findings, execution order,
> and the dated decision log. Read this SECOND on boot (after design.md). Reasoning lives
> here; the live checklist lives in todo.md; constants live in design.md.

## §0 Overview & porting strategy

Building the Israeli Whist companion by **porting the EOS-Poker-Nights Base44 app** rather
than starting blank. The poker app already ships the hard, generic parts we need verbatim:
multi-tenant Groups, auth, admin/group-admin roles, ghost-player creation + profile claiming,
invite codes, RLS strategy, and an app-admin dashboard. We keep that platform, delete the
poker money/chip/settlement layer, insert a **Session** layer between Group and the game, and
replace the poker night with the whist **Round + scoring engine**.

Source spec: `~/Downloads/israeli_whist_gameapp_plan.md`. Reference code (read-only):
`~/Downloads/EOS-Poker-Nights-ref`.

### Reuse map (see the relevance analysis in the kickoff)

- **Reuse ~as-is:** Group, GroupMember, User, JoinAttempt entities; auth (AuthContext/AuthLayout,
  Login/Register/Forgot/Reset); group + member + admin backend functions; claim-by-code flow;
  AppAdminDashboard; Leaderboard/StatCard/StatGrid shells; all `components/ui/*`; `lib/{fetch-all,
  format,query-client,utils,app-params}`; Layout/HamburgerMenu/ActiveGroupContext.
- **Adapt:** poker `Game`→whist `Session`; `GamePlayer`→`RoundResult`; game-lifecycle functions
  → session+round lifecycle; stats functions → whist metrics.
- **Drop:** chips (chip_* fields, ChipCalculator/Calculator/PokerChip*/chips.js), money/settlement
  (Transaction, settlement.js, SettlementList, BankrollChart, buy-ins, debt settlement), and the
  deprecated Player/PlayerProfile/Setting entities.
- **New:** Session entity; scoring engine (`lib/scoring.js`); bidding flow (thumb-pad, Σ≠13 rule,
  UP/DOWN); results flow (Σtricks=13 gate); advanced rules (suit/hierarchy); whist metrics + awards.

## §1 Phase roadmap

| Phase | Title | Status | Gate / value |
|-------|-------|--------|--------------|
| 0 | Scaffold & baseline | OPEN (P0-2 build-verify blocked; deferred) | Repo builds green as a poker clone before we change anything. |
| 1 | Data model | CLOSED Jul 18 | Whist entities + RLS in place. |
| 2 | Scoring engine | CLOSED Jul 18 (36/36) | Pure, unit-tested scoring — the domain core, buildable in isolation. |
| 3 | Backend functions | CLOSED Jul 18 | Session/round lifecycle + stats, guarded server-side. |
| 4 | Frontend nav & shells | CLOSED Jul 18 | Group → Session → History navigation; poker components removed; build green. |
| 5 | Game logging flow | CLOSED Jul 18 | The mobile bid→play→results flow end to end (NewRound + RoundView). |
| 6 | Stats, leaderboard, awards | CORE done Jul 18 (P6-3 polish open) | Whist metrics UI + badges (Leaderboard + StatGrid). |
| 7 | Live Base44 backend + E2E | CLOSED Jul 19 (verified live) | Connect the repo to a Base44 app, push, cloud-build, verify a real session end to end. |
| 8 | Owner adjustments (frontend) | CLOSED Jul 19 | Profile score chart; same-players-as-last-round; standings overall score + session-over-session delta. |
| 9 | AI "Ask about the game" chat | CLOSED Aug 3 (deployed) | Rules assistant grounded in `docs/whist-rules.md`. Detail lives in todo.md (no plan section was written). |
| 10 | Trump winner tracking + suit-rank fix | CLOSED Aug 3 (deployed; live round test never recorded) | Record the auction winner instead of deriving it. Detail in todo.md. |
| 11 | Fix locked bids + phase colours | CLOSED Aug 3 in code (function deploy never recorded) | Edit bids after locking; bidding vs results visually distinct. Detail in todo.md. |
| 12 | Public-listing readiness (Clonitt) | OPEN — deployed + verified signed out Nov 18; owner's signed-in test and the submission remain | Close the open data API, name who is accountable, remove poker leftovers, so the app can be listed publicly. |
| 13 | Substantial UX improvement by an independent team | CLOSED Nov 19 — three review rounds, all fixes live | The owner is not convinced the app is clear enough to publish. Review → fix → re-review until independent reviewers find no blocker or major problem. |

Ordered by dependency and risk: scaffold → data → pure logic → server logic → UI shell → the
flow that depends on all of it → stats → deploy. Scoring (Phase 2) is sequenced early and
standalone because it's the highest-risk domain logic and fully testable without a backend.

---

## Phase 0: Scaffold & baseline — OPEN (v1 — Jul 2026, kickoff)

> Stand up `~/israeli-whist` as a verbatim copy of the poker code + config (no poker plan/todo,
> no git history), get `npm install` + `npm run build` + `npm run lint` green, and lay down the
> three phased-delivery docs. The point is a known-good starting line: any breakage after this
> is ours, not inherited.

### Findings & rationale (by priority)

| # | Finding | Root cause | Fix direction |
|---|---------|-----------|---------------|
| P0-2 | Local `npm install` fails — no `.bin`, then `ENOTCACHED`/`ENOTFOUND` | Wix registry (`npm.dev.wixpress.com`) needs VPN; public registry firewalled; cache incomplete | Defer build/lint verification to a VPN install or Base44 cloud build; verify scoring with plain `node` in the meantime. |

### Execution order

1. **Wave 0a:** P0-1 copy + git init → P0-3 write docs → (P0-2 build verification deferred, see below).

### Decisions

- **Decision (Jul 18 2026):** Port the poker code locally into `~/israeli-whist` (not the Base44
  AI builder, not inside base44-data-agents). — Full code reuse, reviewable diffs, phased-delivery
  docs in-repo; live backend provisioned via Base44 MCP afterward. Options considered: local port /
  fresh Base44 AI build from prompt / local-only no-backend. (User-confirmed via AskUserQuestion.)
- **Decision (Jul 18 2026):** Do NOT prune unused poker npm deps (stripe, three, leaflet, etc.) in
  Phase 0. — Keep the baseline build identical to poker first; unused deps are harmless. Pruning is
  a tracked cleanup task for a later phase. Options considered: prune now / defer.
- **Decision (Jul 18 2026):** Proceed with code authoring despite no local npm (registry unreachable
  without VPN). — All of Phases 1–6 are pure code/JSON authoring; the only thing blocked is running
  the build, which Base44's cloud build (Phase 7) or a later VPN install will do. Verify scoring
  (highest-risk logic) locally with a dependency-free `node` harness; validate entity JSONC with a
  `node` JSON parse. Build-green (P0-2) becomes a gate before Phase 7, not before Phase 1. Options
  considered: block on VPN / proceed with deferred verification.

---

## Phase 1: Data model — CLOSED Jul 18 2026 (v1 — Jul 2026)

> Replace the poker data layer with the whist hierarchy: keep Group/GroupMember/User/JoinAttempt
> (drop poker chip/buy-in fields on Group), add the **Session** entity, convert poker `Game` (a
> night) into the whist round `Game` under a session, convert `GamePlayer` into `RoundResult`, and
> delete Transaction/Player/PlayerProfile/Setting. Carry over the RLS patterns (group-scoped read,
> admin-guarded write). This is declarative `.jsonc` — it won't affect the frontend build, so it's
> safe to land before the UI is rethemed.

### Findings & rationale (by priority)

| # | Finding | Root cause | Fix direction |
|---|---------|-----------|---------------|
| P1-1 | Poker `Group` carries chip/buy-in money fields | Poker domain | Strip `default_buyin`, `chip_*`; add `advanced_rules_default`, `scoring_method_default`. |
| P1-2 | No Session layer | Whist needs Group>Session>Round | New `Session` entity (see design.md). |
| P1-3 | Poker `Game` is a whole night | Whist `Game` is one round | Repurpose `Game` as the round; add `session_id`, round/bidding/table_state/trump/hierarchy fields. |
| P1-4 | `GamePlayer` models chips/buy-ins | Poker money | Rename concept to `RoundResult`; drop money fields; add bid/tricks/reneged/points/bid_order. |
| P1-5 | Dead poker entities | Migration relics + money | Delete `Transaction`, `Player`, `PlayerProfile`, `Setting`. |

### Execution order

1. **Wave 1a:** P1-1 Group fields → P1-2 Session entity → P1-3 Game(round) → P1-4 RoundResult.
2. **Wave 1b:** P1-5 delete dead entities; sanity-check all RLS blocks + indexes.

### Decisions

- **Decision (Jul 18 2026):** Freeze `advanced_rules_enabled` + `scoring_method` on the Session at
  creation (copied from group defaults), rather than reading group settings live per round. — A
  session's scoring rules must not change mid-night; historical rounds must stay reproducible.
  Options considered: per-session frozen / live group setting / per-round.
- **Decision (Jul 18 2026):** Keep whist `Game` as the entity name for a round (not rename to
  `Round`). — Minimizes churn in ported code/queries that already reference `Game`; the round
  semantics are documented. Options considered: rename to Round / keep Game.
- **OPEN QUESTION (owner) — scoring interpretations to confirm before Phase 2 sign-off:**
  (a) does a **renege −100 stack** on top of the contract score, or replace it? (assumed: stacks);
  (b) does a renege penalty still apply in an **Everyone-Falls** (zeroed) round? (assumed: yes,
  penalty stands); (c) does a **0-bid success count as "made"** for the Everyone-Falls test?
  (assumed: yes). Implement per the assumptions; flag in-app/README for owner confirmation.

---

## Phase 2: Scoring engine — CLOSED Jul 18 2026 (v1 — Jul 2026) — 36/36 tests green

> Build the whist scoring as a **pure, dependency-free** module (`src/lib/scoring.js`) and prove it
> with a `node`-runnable test harness (no npm needed — this is how we get real verification while the
> registry is down). It's the single source of scoring truth: the frontend bid/result preview and the
> backend settle function both import it. Sequenced early + standalone because it's the highest-risk
> domain logic and fully testable without a backend or a build.

### Findings & rationale (by priority)

| # | Finding | Root cause | Fix direction |
|---|---------|-----------|---------------|
| P2-1 | No scoring logic exists | New domain | `scorePlayer()` per-rule + `scoreRound()` orchestrator (everyone-falls + renege) in `lib/scoring.js`. |
| P2-2 | Rules need validators too | UI + backend both gate on them | Export `tableState(bids)`, `isBidSumLegal`, `isTricksTotalLegal`, `illegalLastBid()` helpers. |
| P2-3 | Correctness must be provable offline | npm/build blocked | `scoring.test.mjs` harness (plain node assert) covering every worked example in design.md. |

### Execution order

1. **Wave 2a:** P2-1 core scoring + P2-2 validators (one module) → P2-3 test harness, run with `node`.

### Decisions

- **Decision (Jul 18 2026):** Author `lib/scoring.js` as ESM with zero imports and no I/O. — Must run
  identically in the Vite frontend and the Deno backend function, and be testable with bare `node`.
  Options considered: shared pure module / duplicate logic per side / backend-only.
- **Decision (Jul 18 2026):** Renege = additive `−100`, applied on top of contract points and
  **independent of** the everyone-falls zeroing (per the Phase 1 assumptions). A 0-bid success counts
  as "made" for the everyone-falls test. — Documented as owner-confirmable; encoded as explicit flags
  in `scoreRound()` so the interpretation is easy to flip if the owner rules otherwise.

---

## Phase 3: Backend functions — CLOSED Jul 18 2026 (v1 — Jul 2026)

> Replace the poker game/money server logic with the whist session→round lifecycle, and adapt the
> group/member/admin/stats functions that reference deleted entities. The reusable auth/membership
> functions (join/preview/regenerate code, ghost/claim/role, notes) carry over untouched. Server-side
> role guards + the resilient-membership-lookup pattern (from poker `startGame`/`settleGame`) are kept
> verbatim; RLS is the backstop. The two scoring functions **mirror** `src/lib/scoring.js` inline (Deno
> functions can't import from `src/`, same convention poker used for `settlement.js`) with a keep-in-sync note.

### Findings & rationale (by priority)

| # | Finding | Root cause | Fix direction |
|---|---------|-----------|---------------|
| P3-1 | No session/round lifecycle | New domain | New: `startSession`, `closeSession`, `startRound`, `submitBids`, `saveRoundResults`, `updateRound`, `deleteRound`. |
| P3-2 | Poker game/money functions obsolete | Poker domain | Delete `startGame`, `settleGame`, `unsettleGame`, `updateGame`, `deleteGame`, `addPlayerToGame`, `removePlayerFromGame`, `updateGamePlayer`, `migrateToMultiTenant`. |
| P3-3 | Group/admin fns reference deleted entities | Chips/GamePlayer/Transaction | Adapt `createGroup`, `updateGroupSettings`, `purgeGroup`, `renameMember`, `cleanupOrphans`, `getActivityFeed`, `listAllGroupsWithStats`. |
| P3-4 | Stats are poker (net/bankroll) | Poker metrics | Rewrite `computePlayerStats`/`computeGlobalStats` → avg score, win ratio, podiums, contract accuracy, 0-bid rate, bid aggressiveness, awards. |
| P3-5 | Pure-reuse fns | Auth/membership generic | Keep as-is: `joinGroupByCode`, `previewGroupByCode`, `regenerateInviteCode`, `setGroupStatus`, `addGhostMember`, `getGroupMembers`, `unclaimMember`, `updateMemberRole`, `getMyGroups`, `removeMember`, `createNote`, `deleteNote`. Touch only if they hit a deleted entity. |

### Execution order

1. **Wave 3a (lifecycle core):** P3-1 the 7 session/round functions (depend on scoring). Delete the
   9 obsolete poker functions (P3-2).
2. **Wave 3b (adapt shared):** P3-3 group/admin adaptations.
3. **Wave 3c (stats):** P3-4 whist stats rewrite.

### Decisions

- **Decision (Jul 18 2026):** Bidding and results are **two server steps** (`submitBids` then
  `saveRoundResults`) with the round resting in `playing` between them. — Mirrors the physical flow
  (contracts locked, hand played, results entered) and lets the phone display the contract during play.
  Options considered: one combined submit / two steps.
- **Decision (Jul 18 2026):** Everyone-falls round → `Game.status = 'cancelled'`, `everyone_falls = true`;
  it is excluded from `game_limit` (which counts only `complete` rounds) but its `RoundResult.points`
  still count in stats (0 for contract, −100 if reneged). — Makes "renege stands" real while keeping
  cancelled rounds out of the session cap. Stats sum `points` over ALL rounds; limits count `complete` only.
- **Decision (Jul 18 2026):** Backend scoring **mirrors** `src/lib/scoring.js` inline with a
  "keep in sync" header (poker's `settlement.js` convention). — Deno functions can't import from `src/`.
  Options considered: inline-mirror / relative import (unsupported) / shared package.

---

## Phase 4: Frontend nav & shells — CLOSED Jul 18 2026 (v1 — Jul 2026) — build+lint green

> Reshape the React app around Group → Session → Round. Keep the reusable infra verbatim
> (AuthContext, ActiveGroupContext — both fully game-agnostic; all `components/ui/*`; the Layout
> shell structure; Login/Register/Join/Forgot/Reset/Account). Rewrite the game-specific pages and
> delete the poker chip/money components. **Constraint:** vite/eslint can't run locally (npm/VPN block),
> so every wave must be kept import-consistent by `grep` and full build validation happens at Phase 7
> (Base44 cloud) — see the sequencing decision below.

### Findings & rationale (by priority)

| # | Finding | Root cause | Fix direction |
|---|---------|-----------|---------------|
| P4-1 | Poker-only components/pages | chips/money/settlement | Delete `ChipCalculator`, `ChipCounterControls`, `ChipRow`, `CountChipsSheet`, `PlayerChipCounter`, `PokerChip`, `PokerChipIcon`, `BankrollChart`, `SettlementList`, `lib/chips.js`, `lib/settlement.js`, `pages/Calculator.jsx`, `components/game/AddPlayerToGame.jsx`. |
| P4-2 | Deleting cascades to ~15 importers | tight coupling | Rewrite the game pages (Home, GameSession→SessionView, NewGame→NewSession/NewRound, History) + fix every importer; grep for dangling imports. |
| P4-3 | Poker branding in shell | EOS logo, "Games" tab, chip icon | Rewrite `Layout.jsx`: whist name/logo, nav Sessions/Standings/Profile/Admin. |
| P4-4 | Router is poker-shaped | routes to /game, /calculator | Rewrite `App.jsx`: /session/:id, /session/:id/round/new, /round/:id; drop /calculator. |
| P4-5 | Global/profile pages read poker stat shapes | financial/bankroll | Adapt HomeGlobal, PlayerProfile, Profile, GlobalProfile, StatGrid, GameCard to whist stat shapes (overlaps Phase 6). |

### Execution order

1. **Wave 4a:** router + Layout (branding/nav) + delete poker-only files, rewrite the group **Home**
   (active-session card, leaderboard, members) and **NewSession**.
2. **Wave 4b:** **SessionView** (round feed + start/resume round) + **History** (past sessions).
3. **Wave 4c:** adapt the profile/global/admin pages to whist stat shapes + fix all remaining imports.

### Decisions

- **Decision (Jul 18 2026):** Folded Phases 5 (round-logging flow) and 6-core (Leaderboard/StatGrid)
  into the same push as Phase 4. — The router needed the round pages to resolve, and the profile pages
  needed the whist StatGrid; building them together kept the build green in one coherent milestone
  rather than leaving dangling routes/imports. Verified: `npm run build` green + `eslint` clean.
- **Decision (Jul 18 2026):** History tab = the **session log** (all sessions), not a standings board;
  standings live on Home + SessionView. — Matches the plan's IA ("History: past closed sessions").

### Decisions

- **Decision (Jul 18 2026):** Sequencing = **(C)** owner connects Wix VPN so `npm install` +
  `npm run build`/`dev` work locally; the frontend is then ported against a real local build loop
  (verify each wave compiles + runs) and deployed via the `base44` CLI. — Highest confidence; avoids
  shipping an unverifiable blind port. Options considered: A (provision-first) / B (blind port) / C (VPN).
  Blocked until VPN is up: `npm install` must succeed (registry `npm.dev.wixpress.com` reachable) before
  Wave 4a starts.

---

## Phase 7: Live backend + E2E — CLOSED Jul 19 2026 (v1 — Jul 2026)

> The app is attached to Base44 via a **two-way-synced GitHub repo**, and verified end-to-end on real data.
> Owner ran `base44 deploy` (deploys functions — the sync alone doesn't) and confirmed group/session/games work live.

### Decisions

- **Decision (Jul 19 2026):** Canonical repo = **tomerdi-blip/whistmate** (owner-created, two-way synced to
  the Base44 app "WhistMate"). Migrated the full implementation onto it and retired the scratch repo
  `tomerdi-blip/israeli-whist`. — The Base44↔repo link is what matters; the scratch repo was never
  connected. Options considered: connect israeli-whist instead / consolidate onto whistmate.
- **Decision (Jul 19 2026):** On migration, preserved whistmate's `base44/config.jsonc` (`name: WhistMate`)
  and its `index.html` (Base44 favicon + manifest); kept our dark green/gold "felt table" theme
  (`src/index.css`) over whistmate's default gray; rebranded visible UI text to "WhistMate". `.app.jsonc`
  is gitignored (Base44 stores the link its side + `base44 link`), so nothing link-critical was in-repo.
- **Decision (Jul 19 2026):** Product name = **WhistMate**; "Israeli Whist" kept only as the descriptive
  game name (hero subtitle). — Matches the owner-chosen Base44 app name.

---

## Phase 8: Owner adjustments — CLOSED Jul 19 2026 (frontend-only)

> Three tweaks requested after the live E2E. All frontend-only — the GitHub two-way sync deploys the site,
> so no `base44 deploy` was needed.

### Decisions

- **Decision (Jul 19 2026):** Profile score chart plots x = games played (round index), y = cumulative
  total score — reuses the `timeline[].cumulative` the stats functions already return, so no backend change.
- **Decision (Jul 19 2026):** "Session-over-session" delta = a player's **net points in the most recent
  session that has scored rounds** (not a rank change). Computed client-side in `buildStandings` via a
  `latestSessionId` arg; shown as a ↑/↓ badge next to the overall (total) score. Chosen for being simple,
  live-updating during an open session, and directly answering "how much did my score move this session".
- **Decision (Jul 19 2026):** Home standings switched from avg-score to **total (overall) score** as the
  primary metric (avg kept in the subtitle) per owner request.

---

## Phase 12: Public-listing readiness — OPEN (v1 — Nov 2026; deployed and verified signed out Nov 18)

> The owner wants WhistMate listed on Clonitt, a hub where a person reviews each app against eight
> standards (v1.2). It is a web app, so the download standards do not apply. An audit on Nov 17 2026
> against the live site found the app is not fit to list as it stands: anyone, signed out, could read
> every group's data straight from the entity API. This phase makes the listing's claims true —
> lock the read path, say who is accountable, remove what is left of the poker app, and prove the
> access rules with a test — then deploys and re-checks the live site. Gate: nothing is submitted
> until the live site, probed signed out, returns no group data.

### Findings & rationale (by priority)

| # | Finding | Root cause | Fix direction |
|---|---------|-----------|---------------|
| P12-1 | **Signed-out visitors could read every group's data.** Verified on the live API Nov 17 and 18 2026: `Group` (with `invite_code`), `Session` (names, locations), `Game`, `RoundResult` (player names, scores) all returned rows with no login. With a leaked invite code anyone who signs up can join that group and claim an unclaimed player's history. | `"read": true` on five entities, carried over from the poker app ("group-scoping enforced in functions" — but the screens read the entities directly), plus app visibility `public_without_login`. | Read RLS → app admin only; every screen reads through a function that checks membership. |
| P12-1b | **Read functions accepted a forgeable membership.** `getGroupMembers` (roster, and emails for admins), `getActivityFeed` and `computePlayerStats` fell back to `user.groups` when the membership query came back empty. | That cache is written by `auth.updateMe` with the caller's own token, so a user can write it — including `role: 'admin'`. Reproduced in the test harness against the old code. | Treat the cache as a hint: re-read the hinted `GroupMember` row by id; it must belong to the caller. |
| P12-1c | `computePlayerStats` checked membership against the `group_id` in the request, not the player's group — a member of one group could fetch another group's player row (with `claim_token`). | Trusted client input. | Derive the group from the player row; mismatch → 404; never return `claim_token`. |
| P12-5 | Group-level reads silently stopped at 500 rows (Home standings/awards, History counts). | The entity store caps one `filter()` at 500; the screens asked for 5000–10000 and got 500. | `getGroupData` paginates by cursor (same loop as `fetch-all.js` / `computeGlobalStats`). Fixed as a side effect of P12-1. |
| P12-2 | The live `/join` page showed the poker app's logo and "track your poker nights"; "poker" also survived in `Activity.jsx`, `TableTalkCard.jsx`, `WriteNoteDialog.jsx`, and an unused `EditGameForm.jsx`. | Missed in the Phase 4 port. | Replace with WhistMate's own logo and wording; delete the unused form. |
| P12-3 | Nobody is named as accountable: README was the Base44 template, `package.json` had no author, the app had no About or contact screen. | Never written. | `/about` page (public), README, `package.json`, one source in `src/lib/app-info.js`. |
| P12-4 | Table talk's "link to game" list was always empty. | `WriteNoteDialog` queried `GamePlayer`, an entity deleted in Phase 1; `createNote` validated the link against `Game`, which in whist is a single round with no name or date. | Link notes to a **Session**; shared sessions come from `getGroupData`. |
| P12-6 | The git sync is not enough to ship a frontend change promptly. On Nov 18 2026 it applied the entity rules ~30 s after the push but had not published a site build 5 minutes later. | Unknown — the Builder may build lazily or need a publish. | Publish the site from the CLI (`site deploy --build --publish`) BEFORE pushing; order recorded in todo.md's resume block. |
| P12-9 | **Not fixed:** 18 write functions still trust `user.groups` for membership or admin role (`startRound`, `submitBids`, `saveRoundResults`, `updateRound`, `deleteRound`, `startSession`, `closeSession`, `createNote`, `deleteNote`, `addGhostMember`, `removeMember`, `renameMember`, `unclaimMember`, `updateMemberRole`, `updateGroupSettings`, `setGroupStatus`, `regenerateInviteCode`, `joinGroupByCode`). A signed-in user who knows a group id could forge membership, and a member could forge the admin role. | Same root cause as P12-1b. | Same hint-not-proof fix in each. Deferred — see the decision below. |

### Execution order

1. **Wave 12a (read path):** P12-1 entities + `getGroupData` + `getPlayerNotes` + the eight screens → P12-1b/1c
   the three older read functions → P12-5 access test. Gate: the access test passes on the new code and
   fails on the old code.
2. **Wave 12b (honesty + accountability):** P12-2 poker leftovers → P12-4 table-talk session link →
   P12-3 About page, README, manifest.
3. **Wave 12c (ship):** P12-6 deploy functions first, then push `main` (site + entities) → P12-7 re-probe
   the live site signed out → P12-8 owner's signed-in smoke test → submit the listing.

### Decisions

- **Decision (Nov 18 2026):** Lock reads with **functions + admin-only read RLS**, not membership-aware
  RLS rules. — Base44 RLS can compare a field to `{{user.id}}` / `{{user.data.*}}` and supports `$in`, but
  the docs do not cover "is this record's `group_id` in the caller's list of groups", and the only such
  list (`user.groups`) is user-writable, so it could not be trusted even if the rule worked. Every write
  already goes through a service-role function with a membership check; reads now follow the same shape.
  Options considered: membership-aware RLS / require login at the app level only (any signed-up stranger
  would still read everything) / functions.
- **Decision (Nov 18 2026):** Also set `Group.create` and `JoinAttempt.create` to app admin only. — Both
  were the literal `true`; every create already goes through a service-role function, so nothing
  legitimate used the open rule. Whether a signed-out caller could create rows was NOT tested (it would
  have written junk to the live app).
- **Decision (Nov 18 2026):** Keep app visibility `public_without_login`. — A listed web app must open for
  anyone; the landing, sign-up and `/about` pages need it. The data is now protected at the entity and
  function level instead.
- **Decision (Nov 18 2026):** A note's `game_id` / `game_name` / `game_date` now hold the **Session** it is
  pinned to, with no schema change. — In the poker app a "game" was a whole night, which is today's
  Session; a whist `Game` is one round. Nothing reads `game_id` back. Options considered: rename the fields
  (a migration for a low-priority feature) / reuse them.
- **Decision (Nov 18 2026):** **Defer P12-9** (the write functions' cache trust). — It is 18 privileged
  write paths that cannot be exercised without a signed-in test account, and after P12-1 a non-member has
  no way to learn a group id. What remains is a member promoting themselves inside their own group. It
  is real and is the next thing to fix, but not in a phase whose changes could only be verified by the
  owner clicking through every admin action. The owner was told.
- **Decision (Nov 18 2026):** Deploy order is **functions first, then push `main`**. — The git sync
  publishes the site and the entities but not functions; if the site went first every screen would call
  functions that do not exist yet, and if the entity rules went first the old site would read nothing.
- **Decision (Nov 18 2026, supersedes Jul 19):** Canonical repo = **dishontomer5-coder/whistmate** (the
  owner's personal GitHub). The local clone's `origin` points there; the old `tomerdi-blip` remote is kept
  as `old-blip` with pushing disabled. The owner allows pushing and deploying only on this repo.
- **Owner's answers (Nov 18 2026, via AskUserQuestion):** developer name **Tomer Dishon**; support contact
  the personal Gmail address (published in the app, README and listing); the jester app icon and the
  EOS Poker Nights app this was ported from are both the owner's own.
- **Decision (Nov 18 2026):** Published the site from this machine (`site deploy --build --publish`)
  when the synced build had not appeared five minutes after the push. — The entity rules were already
  live, so the old page was showing signed-in users empty lists; waiting longer only extended that. The
  local build uses the installed `@base44/sdk` 0.8.39 rather than the lockfile's 0.8.63, the same as the
  August CLI deploys. Options considered: keep waiting for the cloud build / publish locally.

---

## Phase 13: Substantial UX improvement by an independent team — CLOSED Nov 19 2026 (v1 — Nov 2026)

> After Phase 12 the owner opened the live app and was not convinced: "I am not sure the user
> experience and clarity of the web app is quite there." Nobody but the owner has ever used the
> signed-in app, and no one has reviewed it as a newcomer, as the person scoring at the table, or as a
> designer. This phase gathers an independent team of reviewers and doers and runs them back and forth
> — review, fix, verify, review again — until the app is substantially better in function, user
> experience, design and feel, then ships it. It also clears the P12-9 security debt and leaves behind
> a best-practices guide for future web apps. Gate: nothing is submitted to Clonitt (todo P12-10)
> before this phase closes.

### Findings so far

| # | Finding | Root cause | Fix direction |
|---|---------|-----------|---------------|
| P13-F1 | The group **"Sessions"** tab is really a group home — active session, standings, awards, recent sessions — while the session list lives under **"History"**, whose icon is a trophy, the icon for standings. (Owner, Nov 18 2026; confirmed in `Layout.jsx` `groupNavItems` and `Home.jsx`.) | The tab bar was ported from the poker shell in Phase 4 and never re-thought around what each screen shows. | Each tab's label and icon must say what is inside it. The Returning-player reviewer owns this. |
| P13-F2 | The signed-in app has never been reviewed by anyone but its owner: first run, the in-round flow, wording, visual consistency, edge cases. | No test account, no sandbox, no reviewers until now. | The team and the sandbox below. |
| P12-9 | 18 write functions trust the user-writable `user.groups` cache (see Phase 12). | — | Fix in this phase (owner approved Nov 18 2026) — todo P13-7. |

### The team

Reviewers are independent subagents. Each works alone, sees the app fresh, never sees another
reviewer's notes or the lead's opinions, and reports findings with screenshots and steps.

| Reviewer | Walks in as | Looks for |
|----------|-------------|-----------|
| Newcomer | Someone who just got an invite link | Sign-up, creating or joining a group, the first round with no guidance; where they get lost. |
| Scorekeeper | The person holding the phone at the table | Start session, pick players, bids, results, fixing a mistake, closing; taps, speed, one-handed use. |
| Returning player | Someone checking results a week later | Tabs, labels, icons, what lives where; finding standings, history, a profile (P13-F1). |
| Visual designer | A designer seeing it for the first time | Hierarchy, type, colour, spacing, consistency, contrast, tap sizes, phone and desktop. |
| Whist player | Someone who knows the game | Whether scoring and terms match how the game is played and talked about; every label and message; the rules assistant; Hebrew names in the layout. |
| QA tester | Someone trying to break it | Every feature and edge case (bids totalling 13, tricks not totalling 13, renege, everyone falls, edit and delete a round, claiming a player, archived group, game limit), with steps to reproduce. |

Doers: a **sandbox builder** (first), **implementers** working in separate git worktrees (structure and
navigation; screens, visuals and wording; backend), and the **QA tester again as the independent
verifier** of every change. The lead (the main session) triages, decides, merges, deploys and keeps
this trail.

### How it runs

1. **Sandbox.** Stand up a place where everyone can be signed in and nothing real is touched, seeded
   with realistic data: several groups, many sessions, 150+ rounds, Hebrew and English player names, a
   round in play, an open and several closed sessions, an archived group, table-talk notes.
2. **Review round.** All six reviewers, in parallel, independently.
3. **Triage.** The lead reproduces every finding, drops duplicates and anything not real, and rates
   each one **blocker / major / minor / idea**. The full list goes into todo.md as numbered tasks.
4. **Fix.** Every blocker and major, and the minors that are cheap. Ideas are logged, not built.
5. **Verify.** The verifier re-walks every changed flow, with before and after screenshots; build,
   lint and all tests green.
6. **Review again** with fresh reviewers. Repeat 3–6 until a round ends with **zero open blockers and
   zero open majors**, or three rounds are done.
7. **Ship.** Deploy in the recorded order, re-probe the live site, close the phase.

### Decisions

- **Owner's decisions (Nov 18 2026):**
  - **Where the team works:** wherever is easiest — a local sandbox, a fake backend, or a separate
    Base44 test app (creating one is allowed). Never the real groups on the live app.
  - **Authority:** the lead decides and changes without asking — navigation, layout, wording, visual
    design included. Ask only when genuinely unsure about something that is the owner's to decide.
  - **Shipping:** committing, pushing to `origin main` (dishontomer5-coder/whistmate only — never
    `old-blip`) and deploying to the live app are allowed, in the order todo.md's resume block records.
  - **Security fix (P12-9):** approved; do it in this phase.
  - **Best-practices guide:** wanted, to help future builds of this sort.
- **Decision (Nov 18 2026):** Keep the product's identity — the name WhistMate, the navy-and-gold look,
  the spade mark — and improve within it. — "Substantially better" means clearer and easier, not a
  different product; a repaint would also invalidate the listing's icon and screenshots. A reviewer may
  still challenge any part of it, and the lead may change it with a logged reason.
- **Decision (Nov 18 2026):** The guide lives at `docs/web-app-best-practices.md` — plain Markdown,
  written to be project-agnostic so it can be copied into the next project or turned into an agent
  skill. Each practice carries the WhistMate lesson behind it. Options considered: a doc in this repo /
  a shared online doc / a skill straight away.

- **Decision (Nov 18 2026):** The sandbox is a **fake backend running the real function code** —
  `sandbox/server.mjs` serves a build of the frontend and implements the Base44 REST API the app
  calls, executing the real `base44/functions/*/entry.ts` against a seeded in-memory store (the same
  stub technique as `scripts/functions-access.test.mjs`), honouring each entity's `rls` block. —
  `base44 dev` gives no control over sign-in, seeding or one-instance-per-reviewer; a separate Base44
  test app needs a verified e-mail per test user, which agents cannot receive. Reviewers drive it
  through `sandbox/browse.mjs`, a dependency-free headless-Chrome driver. What it cannot show: the
  real LLM (answers are simulated; real answers were sampled from the live `askRules` on Nov 18 2026
  for the Whist-player reviewer), e-mail delivery, Google sign-in, realtime updates, and whatever
  Base44's hosting injects. Options considered: `base44 dev` / a Base44 test app / fake backend.

- **Decision (Nov 19 2026):** Test platform guarantees instead of assuming them, on a **throwaway
  Base44 app** rather than the live one. — The whole access model rested on "a user cannot change
  their own `role`", which nobody had checked and the docs do not state. It was false (P13-B9). The
  test app let the agent's own account play the non-admin with no risk to real users; the one live
  check afterwards (demote the owner, try to self-promote, restore through privileged mode) was run
  only once the restore path had been proven on the test app.
- **Decision (Nov 19 2026):** Close the role hole at its root with a **field-level write rule on
  `User.role`** (app admin only), not with an app-admin allow-list in every function. — One rule, at the
  platform level, restores what all the functions already assume; an allow-list would be 30 functions
  plus a secret to keep in step. Kept as the fallback if the field rule ever proves to break sign-up.
- **Decision (Nov 19 2026):** Data entities are closed with the literal `false`, not "app admin only".
  — Nothing in the browser needs them (even the app-admin screens go through functions), and `false`
  does not depend on the `role` field. Verified on the live app: the owner's direct reads return 0 rows.
- **Decision (Nov 19 2026):** Ship the backend fixes ahead of the UX work (functions deploy +
  `entities push` on Nov 19 2026). — They close holes that were exploitable on the live app, and
  they are compatible with the frontend that is live. Note for the deploy order: this time the git
  sync did NOT apply the entity rules by itself; `entities push` did.

#### Round 1 — design decisions (Nov 19 2026)

Six reviewers reported 138 findings; an independent verifier reduced them to 86 real problems (0
false, 0 sandbox artifacts, 3 by design). The lead ruled on each (66 rulings; the working copy was in
the session scratchpad). The decisions that shape the product from here on:

- **Group tabs are Standings / Sessions / Players / Admin** (was Sessions / History / Profile /
  Admin, with a trophy on History). — Each label and icon now says what is inside; it was the owner's
  own complaint and four reviewers' top structural finding. Routes are unchanged (`/`, `/history`,
  `/profile`, `/admin`). Outer tabs: Groups / Activity / Me. Options considered: rename only /
  restructure the pages too (chosen: both, per the returning player's proposal).
- **The group comes from the page, not from memory.** A session, round or player page sets the
  active group from the data it loaded; leaving to the groups list no longer clears it. — Fixes one
  group's page under another group's header and the stuck Back button without putting the group id in
  the address, which would have broken existing links. Options considered: `/g/:groupId/...` URLs /
  page-derived group.
- **A win is a CLOSED session finished in first place.** Open sessions show who is leading. Tied
  players share a rank, and a tie for first is a shared win.
- **The Destroyer is "most everyone-falls rounds as the top bidder"**, naming every tied holder. — As
  "rounds a player sat in" it was always a four-way tie decided by row order. The trump winner counts
  as recorded only when the round has a trump suit (the stored `highest_bidder_player_id` alone is
  just the first of the highest bids); otherwise everyone level on the highest bid counts.
- **An everyone-falls round stays a round played** (average and accuracy include it). — The hand was
  played and scored zero; excluding it would make "rounds" disagree with the rounds a player sat in.
  Reported by the whist player; kept by design.
- **Round entry is a focused screen**: no tab bar, a sticky primary action, keys of at least 44 px,
  a reason shown whenever the action is disabled, the outcome (made / missed / points, everyone
  falls) shown BEFORE saving, and a help sheet whose numbers are computed from `scoring.js`.
- **Nothing typed is lost**: unlocked bids and unsaved tricks are kept per round in the browser and
  restored. — Options considered: warn on leaving / save drafts (chosen: drafts; a warning still
  loses work on a reload).
- **A started round can be discarded by any member; a scored round only by a group admin.** Closing
  a session with a round in play discards it, after saying so.
- **Bidding order**: the cursor moves to the next row after the one entered; "Same players" rotates
  the first bidder. — The app does not track the dealer or the auction (it records the outcome of a
  hand), but it must not fight the table's order.
- **Whoever the table marks as trump winner is accepted**, highest bid or not. — By design since
  Phase 10: the app cannot see the auction.
- **An invitation survives sign-in**, and the invite page names the group from a display-only `name`
  parameter in the link. — No new unauthenticated endpoint: a public "name for this code" lookup would
  have been a faster way to probe invite codes than the rate-limited join.
- **One confirmation dialog** for every destructive or hard-to-undo action; no browser confirm boxes.
- **Colour means one thing**: gained gold, zero muted, lost red; UP/DOWN neutral. Red TEXT uses a
  lighter red (#F87171, 5.3:1 on a card); the old red (3.5:1) stays for fills and borders.
- **User-written text keeps its direction** (`<bdi>` for names in sentences, `dir="auto"` for free
  text): four of the seven demo players have Hebrew names, as the real groups do.
- **The assistant keeps the owner's voice** ("IDK bro 🤷") but points somewhere useful, and answers in
  the language of the question.
- **Not done, on purpose:** group id in the address; a dealer marker or auction tracking; a desktop
  layout; side-by-side comparison; auto-filling the fourth player's tricks. **The store icon** (a
  painted jester, unlike the spade inside the app — reported as major) is the owner's artwork and the
  owner's decision.

### Must not change

- **Scoring results.** `src/lib/scoring.test.mjs` stays green with its assertions untouched.
- **Existing users' data**, and **existing links**: `/join?code=…`, `/session/:id`, `/round/:id`,
  `/player/:id`, `/about`. A renamed route keeps a redirect from the old one.
- **The single rulebook source** (`docs/whist-rules.md` → `npm run rules:gen`).
- **The truth of the data statements** on `/about` and in `README.md`; the read-path invariants in
  design.md; `scripts/functions-access.test.mjs` stays green.
- **No new npm dependencies** unless unavoidable — `npm install` is unreliable on the owner's machine
  (see todo.md's resume block).

### Done when

The lead's final message shows all of this as evidence:

- (a) the last review round's scorecard — each reviewer's verdict and the count of findings by
  rating, with **0 open blockers and 0 open majors** — plus what was deliberately left and why;
- (b) the output of `npm run build`, `npm run lint`, `npm run rules:check` and every `node` test
  file, all passing;
- (c) the access test's count of write functions it covers (all of them — P12-9);
- (d) the live site running the new build: the served bundle hash, signed-out entity reads returning
  0 rows, and the key pages rendering at 320, 390 and 1440 px with no horizontal overflow;
- (e) the table of contents of `docs/web-app-best-practices.md`;
- (f) todo.md Phase 13 closed, the decisions logged here, `git status` clean, `main` equal to
  `origin/main`;
- (g) an updated CLONITT LISTING block reflecting anything renamed or added — **not submitted**;
- (h) a short list of what only the owner can check.

Bound: stop after three review rounds, or 80 turns, and report exactly what remains.

#### Rounds 2 and 3 — decisions (Nov 19 2026)

- **Decision:** Players opens a LIST of the group's players (two reviewers independently); your own page is
  reached from your row; another player's page shows your value under each of their figures instead of a
  separate comparison screen (an idea kept for later).
- **Decision:** "Rules & scoring" is a page — the written guide first, the chat second; the guide is
  readable signed out.
- **Decision:** gold is rationed to the primary action, the brand mark and the active tab; gained scores
  are bold foreground; statuses and "You" are neutral outlines; selection is a gold outline.
- **Decision:** a session in which no round counted has no winner.
- **Decision:** an identical note within 10 seconds is the same note (server-side), not only a disabled button.
- **Decision (round 3 blocker):** every write that replaces a round's data carries the version the screen
  loaded (`expected_updated_date`), and the server refuses a stale one — optional, so an old cached site
  keeps working. Lesson for the guide: concurrency was found only in round 3; test two people at once.
- **Decision:** stop after three rounds as the goal set; round 3's blocker and majors were fixed and
  independently verified instead of a fourth review. The verifier's extra major (note hidden at 320 px)
  was fixed and checked at 320 px.
- **Decision:** the store icon stays the owner's choice; an alternative drawn from the in-app mark is in
  `docs/listing/`, and the round-2 and round-3 visual designers both recommended it.

#### Round 4 — decisions (Nov 19 2026)

- **Decision (owner):** run a fourth round after the three planned; then "fix the eight, verify, deploy,
  and stop". Round 4: 0 blockers, 8 majors, 47 minors, 10 ideas; all 8 majors and 4 cheap minors fixed,
  verified by the independent tester (12/12 fixed, no regression), deployed (`index-BjQCevZZ.js`).
- **Decision:** one player order for a round on every screen — seat order — with the trump winner and the
  first bidder marked, never moved. Supersedes the round-2 "results start from the trump winner", which
  made tricks typed in seat order land on the wrong players.
- **Decision:** a trump winner below the top bid gets a visible warning, not a block (the app records what
  the table decided).
- **Decision (owner):** the store icon is the jester; a flat jester mark for inside the app will be
  designed by the owner in Claude Design and then replace the spade mark everywhere.
- **Observation for the guide:** majors per round 39 → 13 → 4 → 8 — after the third round, fresh reviewers
  mostly find new edge cases at roughly the same rate; a "zero majors from fresh reviewers" bar is not a
  practical stopping rule beyond that point.
