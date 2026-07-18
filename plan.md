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
