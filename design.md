# Israeli Whist Companion — Design (Constants)

> The foundation: what's true regardless of phase. Read this FIRST on every boot.
> Change it ONLY when a foundational rule changes — a new dependency, a schema
> migration, an architecture shift, an invariant added/dropped — and log the
> change in the Change log below. If you're editing this file every session,
> that content isn't a constant; it belongs in plan.md.

## Purpose

A mobile-first, cloud-synced digital companion for **Israeli Whist**. It handles the
complex bidding/scoring math, manages player groups, and tracks long-term statistics.
Built by porting the **EOS-Poker-Nights** Base44 app (multi-tenant groups, auth, roles,
ghost-player claiming, admin tooling) and replacing the poker game/money layer with the
whist session → round → scoring model.

## Tech stack

| Layer | Choice | Version floor / pin (load-bearing) | Notes / why |
|-------|--------|-------------------------------------|-------------|
| Language | JavaScript (JSX) + some TS in backend | — | Frontend `.jsx`, backend functions `.ts`. Inherited from poker app. |
| Framework | React 18 + React Router 6 | react ^18.2, react-router-dom ^6.26 | SPA. |
| Build | Vite 6 + `@base44/vite-plugin` | vite ^6.1 | Plugin wires local `/api` → Base44 backend; HMR/nav/analytics notifiers. |
| Styling | Tailwind CSS 3 + shadcn/ui (Radix) | tailwindcss ^3.4 | Full `components/ui/*` set copied from poker. |
| Backend / data | Base44 (entities + serverless functions) | @base44/sdk ^0.8, @base44/vite-plugin ^1.0 | Entities = `base44/entities/*.jsonc` (JSON-schema + RLS). Functions = `base44/functions/<name>/entry.ts`. |
| Data fetching | @tanstack/react-query 5 | — | `lib/query-client.js`. |
| Deploy | Base44 (git-synced; `base44 dev` locally) | — | App source of truth is the repo; pushing reflects into the Base44 Builder. |

> Exact patch versions live in `package.json` / `package-lock.json`, not here.
> `.npmrc` enforces `min-release-age=7` (supply-chain cooldown) — expect installs to pick
> versions ≥7 days old.

## Architecture

```
React SPA (src/)
  main.jsx → App.jsx (router)
  AuthContext (who am I) → ActiveGroupContext (which group is active)
  pages/*  compose components/*  which call base44 SDK + backend functions
        │
        ▼  @base44/vite-plugin proxies /api → Base44
Base44 backend
  entities/*.jsonc   — data model + Row-Level Security (RLS)
  functions/*/entry.ts — privileged server logic (guards, multi-entity writes, stats)
```

- **Frontend never trusts the client for authorization.** Sensitive multi-entity writes
  (create group, start/settle round, member role changes, deletes) go through backend
  **functions** that re-check role server-side. Entity RLS is the second line of defense.
- **Game data is never read from the browser.** `Group`, `Session`, `Game`, `RoundResult` and
  `TableTalkNote` have entity read RLS = app admin only. Every screen reads through a backend function
  that checks group membership first: `getGroupData` (scopes `group` / `session` / `round` / `player` /
  `shared_sessions`), `getPlayerNotes`, and the older `getGroupMembers` / `getMyGroups` /
  `getActivityFeed` / `computePlayerStats` / `computeGlobalStats`. A signed-out visitor, or a signed-in
  user who is not in the group, gets nothing.
- **Entry points:** `src/main.jsx` (mount) → `src/App.jsx` (routes) → `src/components/Layout.jsx`
  (chrome/nav) → `src/pages/*`.
- **Base44 SDK client:** `src/api/base44Client.js` (+ `src/lib/app-params.js` for app id/token).

## Data models

**Hierarchy:** `App > Group > Session > Game(Round) > RoundResult (per player per round)`.

Ported from poker, the night-level poker `Game` becomes the whist **`Session`**, and a new
**`Game`** = a single round/hand inside a session.

| Entity | Grain | Key fields | Notes |
|--------|-------|-----------|-------|
| **User** | one per account | `role: admin \| user` | App-level admin flag. Base44-managed identity. |
| **Group** | a whist circle | `name`, `invite_code` (unique, indexed), `status: active\|archived\|deleted`, `advanced_rules_default`, `scoring_method_default: classic\|progressive` | Poker chip/buy-in fields DROPPED. |
| **GroupMember** | membership | `group_id`(idx), `user_id`(idx, nullable=ghost), `role: admin\|player`, `player_name`, `claimed`, `claim_token`(idx), `joined_date` | Ghost = unclaimed profile (`user_id` null). Reused ~verbatim from poker. |
| **Session** *(new)* | a meetup / night | `group_id`(idx), `name`, `status: open\|closed`, `session_date`, `location`, `advanced_rules_enabled`, `scoring_method: classic\|progressive`, `game_limit`(nullable), `created_by_id` | Advanced rules + scoring method are frozen per session at creation from group defaults. |
| **Game** *(round)* | one hand/round | `session_id`(idx), `group_id`(idx), `round_number`, `status: bidding\|playing\|complete\|cancelled`, `table_state: up\|down`, `total_bids`, `trump_suit`(nullable), `hierarchy`(nullable), `highest_bidder_player_id`, `everyone_falls` | `cancelled`/`everyone_falls` rounds don't count toward `game_limit`. |
| **RoundResult** *(was GamePlayer)* | player × round | `game_id`(idx), `session_id`, `group_id`(idx), `player_id`(FK GroupMember, idx), `player_name`, `bid_order`, `bid` (0–13), `tricks_won` (0–13), `reneged`, `points` | `points` = computed & persisted by the scoring engine on settle. |
| **JoinAttempt** | rate-limit row | `user_id`(idx), `invite_code` | Reused from poker. |
| **TableTalkNote** *(optional)* | a note on a player | `target_player_id`, `note`, `session_id`, `author_*`, `is_anonymous`, `group_id`(idx) | Ported social feature; low priority. |

**Dropped poker entities:** `Transaction` (money), `Player`/`PlayerProfile`/`Setting`
(poker's deprecated pre-multitenant relics — no history to preserve here).

## Scoring engine (the core domain logic — `src/lib/scoring.js`, pure & unit-tested)

Table state from the four bids: **sum ≥ 14 → UP**, **sum ≤ 12 → DOWN**. Sum = 13 is
forbidden (blocked at bid entry). Actual tricks across the 4 players must total exactly 13.

Per-player round score:

- **Exact contract** (bid > 0 and `tricks_won == bid`): `bid² + 10`.
- **Missed contract** (bid > 0 and `tricks_won != bid`), miss `m = |tricks_won − bid|`:
  - *Classic:* `−10 × m`.
  - *Progressive:* per-trick rate by miss size — `m∈1..4 → 5`, `m==5 → 10`, `m==6 → 15`,
    `m∈7..13 → 20`; score = `−rate(m) × m`.
- **Zero bid** (bid == 0):
  - *Success* (`tricks_won == 0`): **DOWN → +50**, **UP → +25**.
  - *Failure* (`tricks_won ≥ 1`): `−50 + 10 × (tricks_won − 1)`  (−50 first trick, +10 each further trick).
- **Everyone Falls:** if NO player made their contract in the round (a 0-bid success counts
  as "made"), the round is **cancelled** — all contract points zeroed, round excluded from
  `game_limit`.
- **Reneging** (failure to follow suit): `−100`, applied additively to that player's round
  score. Interpretation choices (renege stacking / renege inside an everyone-falls round /
  0-bid-success counting as "made") are recorded as decisions in plan.md — confirm with owner.

## External integrations

| Service | Purpose | Auth / access | Constraint |
|---------|---------|---------------|-----------|
| Base44 platform | Auth, entity storage, serverless functions, hosting | Base44 app id + token (`app-params.js`); managed via Base44 MCP / `base44 dev` | App source of truth is this git repo. |
| Base44 auth providers | Google or email + password login for registered users (the only two the login UI offers) | Handled by Base44 | Guest/ghost players have no account until they claim. |
| Base44 Core integration `InvokeLLM` | The rules assistant (`askRules`): the question + recent chat + the rulebook go to an LLM | Service role inside the function | Nothing is stored; every call spends integration credits; no rate limit yet (todo P9-4). |
| Base44 hosting | Serves the site; injects page-view logging, usage analytics and a 30-day referral cookie; serves the web manifest (name, icons, standalone) | Platform-managed | Not in this repo — check the PUBLISHED page, not `index.html`, for what a visitor gets. |
| npm registry | Installing deps for local build/dev | Wix internal `npm.dev.wixpress.com` (per `~/.npmrc`) — **requires Wix VPN** | Public `registry.npmjs.org` is firewalled on this machine; the local npm cache is incomplete. So `npm install` / `npm run build` / `base44 dev` only work on VPN. Code authoring needs none of them; build validation happens on VPN or Base44's cloud build. |

## Constraints & invariants (must always hold)

- **Bids:** four bids per round, each 0–13; their sum **must not equal 13** (blocked at entry).
- **Tricks:** the four `tricks_won` **must sum to exactly 13** before a round can be settled.
- **Authorization is server-side.** Every privileged mutation re-checks role in a backend
  function; RLS is the backstop, not the primary guard.
- **Tenant isolation:** every game/round/result/note row carries `group_id`; all reads are
  group-scoped and membership-checked on the server. A user only ever sees groups they're a member of.
- **No entity is open.** No `rls` rule is the literal `true` — every create/read/update/delete either
  names the app admin or compares a field to the caller. `scripts/functions-access.test.mjs` fails if
  one is, or if `src/` reads a game-data entity directly.
- **The membership cache is a hint, never proof.** `user.groups` (written by `getMyGroups`,
  `createGroup`, `joinGroupByCode`) exists to ride out read-after-write lag, but it is written with the
  caller's own token, so a user can write it. A read path may use it only to find a `GroupMember` row to
  re-read by id, and that row must belong to the caller. (The write functions still trust it — todo P12-9.)
- **Scoring is deterministic & pure.** `lib/scoring.js` has no I/O; given bids+tricks+options
  it returns the same points. It is the single source of scoring truth (frontend preview +
  backend settle both call it).
- **Ghost → claimed is non-destructive:** claiming a ghost transfers its entire history to
  the claiming user; IDs (`player_id` on RoundResult) stay stable.

## Conventions

- Entities: PascalCase `.jsonc` with JSON-schema `properties`, `required`, and an `rls` block.
  Index any FK used for filtering (`group_id`, `session_id`, `player_id`, `claim_token`).
- Backend functions: one folder per function, `entry.ts`; guard role first, then do the work.
- Frontend: pages in `src/pages`, reusable UI in `src/components` (shadcn primitives in
  `src/components/ui`), cross-cutting logic in `src/lib`. Path alias `@/` → `src/`.
- Who is accountable: the developer name and support contact live in `src/lib/app-info.js` (shown on
  `/about`); `README.md` and the store listing repeat them. The "Your data" statements on `/about` and
  in `README.md` must match what the code does — change them together.
- Mobile-first: the logging flow is one-handed/thumb-driven; prefer large tap targets, sheets,
  and number pads over typed input.
- Naming carried from poker where semantics match (Group, GroupMember, invite/claim flow); new
  whist concepts get new names (Session, RoundResult, scoring).

## Glossary

| Term | Meaning |
|------|---------|
| Group | A circle/league of players (tenant boundary). |
| Session | One meetup/night; contains many rounds. Poker's night-level "Game". |
| Game / Round | A single hand: bid → play → results. |
| RoundResult | One player's bid/tricks/points for one round. |
| Ghost / unclaimed player | A `GroupMember` with no `user_id`, created by an admin. |
| Claiming | A registered user taking over a ghost's identity + history. |
| Contract | A player's bid = number of tricks they commit to take. |
| UP / DOWN | Table over-booked (Σbids ≥ 14) / under-booked (Σbids ≤ 12). |
| Everyone Falls | No one made their contract → round cancelled/zeroed. |
| Renege | Failing to follow suit → −100 penalty. |

## Change log (constants only)

- **Jul 18 2026:** Initial design authored — ported stack/architecture from EOS-Poker-Nights;
  defined whist Session→Round→RoundResult model and the scoring engine spec. See plan.md §0–§2.
- **Nov 18 2026:** Read path became a constant (Phase 12): game-data entities are app-admin-read only and
  every screen reads through membership-checked functions (`getGroupData`, `getPlayerNotes`); added the
  "no open entity" and "cache is a hint" invariants; recorded the `InvokeLLM` and hosting integrations that
  were missing; corrected the sign-in methods (Google + email, no Apple); added the accountability
  convention (`src/lib/app-info.js`). See plan.md Phase 12.
