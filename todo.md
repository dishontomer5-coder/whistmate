# Israeli Whist Companion — Todo (WHAT / live state)

> The live execution checklist + session hand-off. Read this THIRD on boot (after design.md,
> plan.md). Numbered `P<phase>-<n>` tasks; done-lines are changelog entries; exactly one `🔄`
> in-progress marker and one `▶ RESUME HERE` bookmark across the file.
>
> ▶ RESUME HERE (Nov 19 2026): **Phase 13 is CLOSED.** Three review rounds, three fix rounds, all
> deployed: live bundle `index-CKd8aPs4.js` (= local build), signed-out entity reads `[]`, public pages
> clean at 320/390/1440 px. Review record in `docs/review/round-{1,2,3}/`; guide in
> `docs/web-app-best-practices.md`. Next is the owner's: choose the store icon, a signed-in look on a
> real phone, then submit the Clonitt listing (P12-10). Open minors and ideas are listed in each round's
> RULINGS.md for a later phase.
> in_progress: none.
> CANONICAL REPO = **dishontomer5-coder/whistmate** (private; the owner's personal GitHub), local clone
> **~/Personal/whistmate**, `origin` → it. The old `tomerdi-blip` remote survives as `old-blip` with push
> disabled — never push there. The owner allows pushing and deploying on this repo only. Two-way-synced
> to the Base44 app "WhistMate" (app id `6a5be77702d0c74b5a13cfea`), live at
> **https://whist-mate-pro.base44.app**.
> Phases 1–11 are done (10 and 11 never had their live round test recorded — P12-8 covers it).
> Checks at `main` (Nov 18 2026): build GREEN, lint clean, scoring 38/38, stats 5/5,
> **functions-access 89/89**, `rules:check` in sync. `main` = `origin/main`; branch
> `p12-clonitt-readiness` is merged and can be deleted.
> ⚠️ DEPLOY ORDER that works (learned Nov 18 2026): (1) `functions deploy`, (2)
> `site deploy --build --publish --yes`, (3) `git push origin main` — all CLI calls with
> `--app-id 6a5be77702d0c74b5a13cfea`. The git sync applied the new ENTITY RULES about 30 seconds after
> the push but had NOT published a new SITE build five minutes later, so for those minutes the old page
> ran against locked entities and showed empty lists. Publishing the site from the CLI fixed it. After
> any push that changes the frontend, check the served bundle hash and publish the site yourself if it
> has not moved.
> ⚠️ `node_modules` is behind `package.json`: installed `@base44/sdk` 0.8.39 / `@base44/vite-plugin` 1.0.30,
> wanted ^0.8.63 / ^1.0.52 since the Builder's Nov 17 "Update base44 packages" commit. The build is green
> anyway (nothing imports the new auth boilerplate). Local `npm install` was blocked in August (the
> global registry is an internal mirror) and deliberately left alone — owner's call; don't "fix" it with
> `--registry` without asking. So prefer Base44's cloud build for the site (push `main`) over
> `deploy --build` from this machine. (`.npmrc`'s `min-release-age=7` is still not enforced by npm 11.)
> ⚠️ **When `npx base44@latest …` hangs**, the npm registry (the internal mirror) is unreachable — npx
> stalls looking up "latest" before the CLI starts. Run the cached copy directly instead, e.g.
> `~/.npm/_npx/<hash>/node_modules/.bin/base44` (pick the newest: `ls ~/.npm/_npx/*/node_modules/base44`,
> v0.3.6 on Nov 19 2026). Same commands, same login.
> ⚠️ CLI facts (base44@latest, Nov 18 2026): `--app-id <id>` is a GLOBAL option and is required (no
> `base44/.app.jsonc` → not linked); `deploy` needs `--yes` when non-interactive and builds only with
> `--build`; `functions deploy [names...]`, `functions list`, `entities push`, `site deploy` exist;
> `exec` runs a script as the signed-in CLI user. Its PostHog telemetry errors are harmless.
> ⚠️ `base44 deploy` (or `functions deploy`) is required after ANY change to base44/functions/** — the
> git sync deploys entities + site only.
> ⚠️ Base44 now serves `index.html` with `cache-control: private, no-store` (checked Nov 17 2026), so the
> August "browser keeps the old bundle" gotcha should be gone. Still verify a deploy with
> `curl -s <app-url> | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js'`.
> ⚠️ Two-way sync is ACTIVE: the Builder pushes commits here (Nov 17 2026: package update + unused auth
> boilerplate — `Mfa*.jsx`, `OAuthConsent.jsx`, `ProtectedRoute.jsx`, `lib/authMfa*.js`; nothing imports
> them, left alone). ALWAYS `git pull --rebase` before push, and re-read files after pulling.
> ⚠️ Rules knowledge has ONE source: `docs/whist-rules.md` → `npm run rules:gen` → askRules/entry.ts.
> Never hand-edit `RULES_DOC`; `npm run rules:check` fails on drift (incl. drift pushed back by the Builder).
> ⚠️ What `/about` and `README.md` say about data must stay true — change them with the code.

## Phase 0: Scaffold & baseline (Jul 2026 — kickoff)

> Stand up a known-good poker clone before changing anything. See plan.md §Phase 0.

### 0a. Scaffold

- [x] **P0-1:** Copied poker code+config into `~/israeli-whist` via rsync (excluded `.git`,
  poker `plan.md`/`todo.md`, `node_modules`, `dist`, `.env*`, `.DS_Store`); `git init` fresh
  *(done Jul 18 2026)*
- [x] **P0-2:** verified on VPN — `npm install` (626 pkgs), `npm run build` **green** (2547 modules, 1.87s).
  Lint: 4 trivial unused-import errors, all in files slated for Wave 4a rewrite/deletion (Layout, Calculator,
  GameSession, HomeGlobal) — cleared as those files are reworked *(done Jul 18 2026 — VPN connected)*
- [x] **P0-3:** Wrote `design.md` (constants: stack, architecture, whist data model, scoring
  engine spec, npm/VPN constraint) and `plan.md` (phase roadmap §0–§1, findings, decisions) and this
  `todo.md` *(done Jul 18 2026)*

> **Wave 0a verification (Jul 18 2026):** scaffold + git init confirmed (16 files tracked-able,
> poker code/config copied, no poker plan/todo/history). Build/lint (P0-2) deferred — see above.
> Phase 0 closed except the blocked P0-2 gate.

### 0b. Cleanup (deferred)

- [ ] **P0-4** *(new, deferred to a later phase)*: prune unused poker npm deps (stripe, three,
  react-leaflet, canvas-confetti?, jspdf/html2canvas?) once the whist surface is known — see plan.md §Phase 0 decision.

## Phase 1: Data model (Jul 2026)

> Whist entities + RLS. See plan.md §Phase 1 for findings & decisions. Execution: 1a → 1b.

### 1a. Whist entities

- [x] **P1-1:** `Group` — stripped `default_buyin` + all `chip_*`; added `advanced_rules_default`
  (bool, default false) + `scoring_method_default` (classic|progressive, default classic). RLS unchanged
  (create/read true, update/delete by created_by_id) *(done Jul 18 2026)*
- [x] **P1-2:** Created `Session` entity — group_id (idx), name, status open|closed (default open),
  session_date, location, advanced_rules_enabled, scoring_method, game_limit (nullable). RLS mirrors
  poker Game (admin-lockdown writes + read:true; group-scoping enforced in functions) *(done Jul 18 2026)*
- [x] **P1-3:** Repurposed `Game` as a round — added session_id (idx), group_id (idx), round_number,
  table_state (up|down), total_bids, trump_suit, hierarchy, highest_bidder_player_id, everyone_falls;
  status enum → bidding|playing|complete|cancelled; dropped name/default_buyin/game_date/location *(done Jul 18 2026)*
- [x] **P1-4:** Created `RoundResult` (replaces GamePlayer) — game_id (idx), session_id (idx), group_id
  (idx), player_id (idx), player_name, bid_order, bid, tricks_won, reneged, points; dropped
  buyins/cash_out/chip_counts *(done Jul 18 2026)*

### 1b. Remove dead entities

- [x] **P1-5:** Deleted `GamePlayer`, `Transaction`, `Player`, `PlayerProfile`, `Setting` entity files.
  8 entities remain (Game, Group, GroupMember, JoinAttempt, RoundResult, Session, TableTalkNote, User);
  all parse OK. Code refs to deleted entities remain only in poker functions (15) + frontend — those are
  the planned scope of Phases 3–4, not stragglers *(done Jul 18 2026)*

> **Wave 1a+1b verification (Jul 18 2026):** all 8 remaining entity `.jsonc` files parse (node JSON.parse
> after comment-strip). Deleted-entity references catalogued: `base44/functions/*` (addPlayerToGame,
> cleanupOrphans, compute*Stats, deleteGame, listAllGroupsWithStats, migrateToMultiTenant, purgeGroup,
> remove/rename Member, removePlayerFromGame, settle/unsettle/startGame, updateGamePlayer) and ~30 src
> files (chips/settlement/bankroll/calculator) — all to be handled in Phases 3 (functions) & 4 (frontend).

> **🎉 PHASE 1 COMPLETE (Jul 18 2026):** whist data model in place — Group (whist defaults), Session
> (new night layer), Game (round), RoundResult (per-player scoring row); poker money/chip/relic entities
> removed. Entity JSONC validated. Full build validation still deferred (P0-2, needs VPN).

## Phase 2: Scoring engine (Jul 2026)

> Pure scoring module + offline test harness. See plan.md §Phase 2.

### 2a. Engine + validators + tests

- [x] **P2-1:** `src/lib/scoring.js` — pure ESM, zero imports: `contractPoints` (exact / classic /
  progressive / 0-bid up-down success+failure), `scoreRound` (everyone-falls zeroing + additive
  renege), `madeContract`, `progressiveRate`, `highestBidderIndex` *(done Jul 18 2026)*
- [x] **P2-2:** validators in same module — `tableState`, `bidSum`, `isValidBid`, `isBidSumLegal`,
  `illegalLastBids` (blocks the last bidder's Σ=13 value), `isTricksTotalLegal` (Σ=13 gate) *(done Jul 18 2026)*
- [x] **P2-3:** `src/lib/scoring.test.mjs` — 36 dependency-free `node` assertions covering every
  worked example in design.md (all rule branches, everyone-falls ± renege independence, guards) *(done Jul 18 2026)*

> **Wave 2a verification (Jul 18 2026):** `node src/lib/scoring.test.mjs` → **36 passed, 0 failed**.
> Real correctness verified offline despite the npm/build block.

> **🎉 PHASE 2 COMPLETE (Jul 18 2026):** whist scoring engine implemented + proven against 36 tests.
> Single source of scoring truth for both the frontend preview and the backend settle.

## Phase 3: Backend functions (Jul 2026)

> Session/round lifecycle + adapt shared fns + whist stats. See plan.md §Phase 3. Waves 3a → 3b → 3c.

### 3a. Session/round lifecycle (the core)

- [x] **P3-1a:** `startSession` — create Session in an active group; membership guard; one-open-session
  guard; freezes advanced_rules_enabled + scoring_method from group defaults *(done Jul 18 2026)*
- [x] **P3-1b:** `closeSession` — close a session; blocks while a round is mid-play; idempotent *(done Jul 18 2026)*
- [x] **P3-1c:** `startRound` — seat exactly 4 distinct group members (array order = bid order), create
  blank RoundResult rows; one-open-round guard; game_limit check (counts 'complete' only) *(done Jul 18 2026)*
- [x] **P3-1d:** `submitBids` — validate 4 bids (0–13, Σ≠13), derive table_state + highest bidder,
  record advanced trump/hierarchy when enabled; bidding→playing *(done Jul 18 2026)*
- [x] **P3-1e:** `saveRoundResults` — validate tricks (Σ=13), score via inline mirror of scoring.js,
  persist points + everyone_falls; playing→complete/cancelled *(done Jul 18 2026)*
- [x] **P3-1f:** `updateRound` — group-admin re-edit of a past round (bids/tricks/reneges/advanced),
  re-validate + re-score *(done Jul 18 2026)*
- [x] **P3-1g:** `deleteRound` — delete a round + its RoundResults (member/admin) *(done Jul 18 2026)*
- [x] **P3-2:** Deleted 9 obsolete poker fns (startGame, settleGame, unsettleGame, updateGame,
  deleteGame, addPlayerToGame, removePlayerFromGame, updateGamePlayer, migrateToMultiTenant); 28 fns remain *(done Jul 18 2026)*

> **Wave 3a verification (Jul 18 2026):** backend scoring mirror cross-checked vs canonical
> `src/lib/scoring.js` over all 784 (bid×tricks×table×method) combos → **0 mismatches**. Full
> Deno-runtime verification of the functions is deferred to Phase 7 (live backend) — can't run Deno/deploy offline.

### 3b. Adapt shared group/member/admin functions

- [x] **P3-3:** Adapted the 6 fns that referenced deleted entities: `createGroup` (whist defaults,
  dropped chip/buyin), `updateGroupSettings` (ALLOWED_FIELDS → advanced_rules_default/
  scoring_method_default), `purgeGroup` (cascade RoundResult→Game→Session→notes→members→Group),
  `renameMember` (sweep RoundResult.player_name, dropped Transaction sweeps), `removeMember`
  (history check on RoundResult), `cleanupOrphans` (orphan rounds+results+sessions+notes),
  `listAllGroupsWithStats` (sessions/rounds counts, dropped money). `getActivityFeed` needed
  **no change** (only touches TableTalkNote, which is unchanged) *(done Jul 18 2026)*
- [x] **P3-5:** Confirmed pure-reuse fns need no changes (join/preview/regen code, addGhostMember,
  getGroupMembers, unclaimMember, updateMemberRole, getMyGroups, createNote, deleteNote) *(done Jul 18 2026)*

### 3c. Whist stats rewrite

- [x] **P3-4:** Extracted `src/lib/whist-stats.js` (pure: `playerMetrics`, `rankSession`,
  `winPodiumTally`) + 5-test node harness; rewrote `computePlayerStats` + `computeGlobalStats` to
  aggregate RoundResult with inline mirrors → performance (total/avg score, rounds, sessions, wins,
  podiums, win_ratio), strategy (contract accuracy, 0-bid success, bid aggressiveness), awards
  (greedy/coward loss, destroyer), per-group breakdown + timeline *(done Jul 18 2026)*

> **Wave 3b+3c verification (Jul 18 2026):** grep confirms ZERO refs to deleted entities or
> chip/buyin/cash_out across all 28 functions. Offline suites green: scoring 36/36, whist-stats 5/5,
> scoring-mirror 784/784. Deno-runtime verification of functions deferred to Phase 7 (live backend).

> **🎉 PHASE 3 COMPLETE (Jul 18 2026):** whist backend done — 7 session/round lifecycle fns
> (start/close session, start/submit/save/update/delete round) + 6 adapted shared fns + 2 rewritten
> stats fns; 9 obsolete poker fns deleted. 28 functions total. Scoring/stats logic proven offline.

## Phase 4: Frontend nav & shells (Jul 2026)

> Reshape the app around Group → Session → Round. See plan.md §Phase 4. Waves 4a → 4b → 4c.
> ⚠️ SEQUENCING DECISION PENDING (plan.md §Phase 4 Decisions): local build is blocked (npm/VPN), so a
> big blind port can't be verified pre-deploy. Awaiting owner: (A) provision backend first for a build
> loop, (B) continue blind port, (C) connect VPN for a local loop. Reusable infra confirmed: AuthContext +
> ActiveGroupContext are fully game-agnostic; all components/ui/*; Layout shell; auth/account pages.

### 4a. Router + shell + delete poker-only + Home/NewSession

- [x] **P4-1:** Rewrote `App.jsx` router → whist routes (/session/new, /session/:id,
  /session/:sessionId/round/new, /round/:id); dropped /calculator; loading screen uses whist Logo *(done Jul 18 2026)*
- [x] **P4-2:** Rewrote `Layout.jsx` → whist branding (♠ + "Israeli Whist") + nav (Sessions / History /
  Profile / Admin); dropped PokerChipIcon + /calculator. `HamburgerMenu` Calculator link removed *(done Jul 18 2026)*
- [x] **P4-3:** Deleted 17 poker-only files (all chip/settlement/bankroll components, Calculator/NewGame/
  GameSession pages, lib/chips.js, lib/settlement.js, game/AddPlayerToGame) — grep confirms zero refs *(done Jul 18 2026)*
- [x] **P4-4:** Rewrote group `Home` (active-session card + standings + recent sessions) + new `NewSession`
  (name/date/location, shows frozen rules); new `SessionCard`, whist `Leaderboard`, `lib/standings.js` *(done Jul 18 2026)*

### 4b. Session + history

- [x] **P4-5:** `SessionView` — round feed (per-player bid/tricks/points, UP/DOWN, everyone-fell badge),
  cumulative standings, Start/Resume round, Close Session *(done Jul 18 2026)*
- [x] **P4-6:** `History` rewritten as the session log (all sessions + round counts via `SessionCard`) *(done Jul 18 2026)*

### 4c. Adapt profile/global/admin pages

- [x] **P4-7:** Adapted `HomeGlobal` (whist hero + all-time score), `Profile`/`PlayerProfile`/`GlobalProfile`
  (whist StatGrid + round history), `StatGrid` (Performance/Strategy/Awards), `AppAdminDashboard`
  (sessions/rounds counts + cleanup message), `GroupSettings` + `CreateGroupDialog` (scoring method +
  advanced-rules toggles, dropped chips). All imports grep-clean *(done Jul 18 2026)*

> **Wave 4 verification (Jul 18 2026):** `npm run build` GREEN (1916 modules, 1.37s); `eslint .` exit 0
> (clean). Zero references to deleted poker modules/symbols across src. Runtime E2E deferred to Phase 7 (needs live backend).

> **🎉 PHASE 4 COMPLETE (Jul 18 2026):** app reshaped around Group → Session → Round; poker UI removed; build+lint green.

## Phase 5: Game logging flow (Jul 2026) — done alongside Phase 4

- [x] **P5-1:** `NewRound` — table-select exactly 4 players (tap order = bid order) → `startRound` *(done Jul 18 2026)*
- [x] **P5-2:** `RoundView` bidding — 0–13 `NumberPad`, blocks the last bidder's Σ=13 value (scoring
  `illegalLastBids` logic), live UP/DOWN + total; advanced: highest bidder picks trump suit + hierarchy → `submitBids` *(done Jul 18 2026)*
- [x] **P5-3:** `RoundView` results — tricks `NumberPad` gated on Σ=13, per-player renege toggle →
  `saveRoundResults` (scores via backend mirror) *(done Jul 18 2026)*
- [x] **P5-4:** `RoundView` summary — complete/cancelled round view + admin Delete (`deleteRound`) *(done Jul 18 2026)*

> **🎉 PHASE 5 COMPLETE (Jul 18 2026):** full bid→play→results mobile flow with rule enforcement, in the build.

## Phase 6: Stats, leaderboard, awards (Jul 2026) — core done alongside Phase 4

- [x] **P6-1:** Whist `Leaderboard` + `lib/standings.js` (avg/total score, wins) — shown on Home & SessionView *(done Jul 18 2026)*
- [x] **P6-2:** `StatGrid` Performance (total/avg score, rounds, win rate, podiums) + Strategy (contract
  accuracy, 0-bid success, aggressiveness) + Awards (Greedy/Coward/Destroyer) *(done Jul 18 2026)*
- [x] **P6-3** *(done Jul 19 2026)*: group **Awards showcase** on Home (`AwardsShowcase` + `computeAwardLeaders`
  in standings.js — Greedy/Coward/Destroyer leaders, tap → player); score-over-time chart shipped in P8-1;
  admin **edit-past-round** UI wired in `RoundView` (`renderEdit` → `updateRound`, with bid Σ≠13 + tricks Σ=13
  validation, renege toggles, advanced trump/hierarchy). Frontend-only (updateRound already deployed). Build 2535 modules green, lint clean.

## Phase 7: Live backend + E2E (Jul 2026) — needs owner's Base44 login

> The repo is a complete Base44 app definition (base44/entities + base44/functions + config.jsonc) with
> a green-building frontend. It just needs to be attached to a Base44 app and pushed. `base44` CLI is NOT
> globally installed; use `npx base44@latest <cmd>` (reachable on VPN). Login is interactive (owner only).

- [x] **P7-0:** Repo pushed to GitHub: `github.com/tomerdi-blip/israeli-whist` (private) — **superseded** by whistmate *(done Jul 18 2026)*
- [ ] **P7-1b** *(BLOCKER — owner action)*: functions return 404 "not found or not deployed". CONFIRMED via
  MCP: the GitHub two-way sync deploys **entities** (all 8 live with correct schemas) + **site** (frontend
  updates land) but does **NOT** deploy `base44/functions/**`. Fix: `cd ~/whistmate` →
  `npx base44@latest login` (browser, owner only) → `npx base44@latest deploy --app-id 6a5be77702d0c74b5a13cfea`
  (deploys entities+functions+site; `--app-id` avoids `link`). This machine's CLI is NOT authed (whoami hangs),
  so I can run `deploy` only AFTER the owner does `login` once. **Re-run `deploy` after every functions change** —
  sync won't auto-deploy functions. No function-deploy MCP tool exists; `edit_base44_app` (AI builder) avoided to not risk the hand-built code.
- [x] **P7-1:** Owner created Base44 app "WhistMate" with **two-way GitHub sync** to `tomerdi-blip/whistmate`.
  Migrated the full implementation onto that repo (kept its `base44/config.jsonc` name "WhistMate" + Base44
  index.html favicon/manifest; kept our green/gold theme; rebranded visible UI to "WhistMate"). Verified in
  ~/whistmate: build green (1916 modules), eslint clean, scoring 36/36, stats 5/5. Pushed → Base44 cloud-builds *(done Jul 19 2026)*
- [x] **P7-2:** E2E verified LIVE by owner (Jul 19 2026) — created a group, a session, and several games;
  all worked after `base44 deploy`. Phase 7 CLOSED.

## Phase 8: Owner adjustments (Jul 2026) — frontend-only

> Requested after the live E2E. All frontend-only → auto-sync deploys on push; no `base44 deploy` needed.

- [x] **P8-1:** Profile score line chart — new `components/ScoreChart.jsx` (recharts): x = games played,
  y = cumulative total score, 0 reference line, dark/gold theme. Added to Profile, PlayerProfile,
  GlobalProfile (all consume the stats `timeline[].cumulative`) *(done Jul 19 2026)*
- [x] **P8-2:** `NewRound` "Same players as last round" — loads the session's most-recent round, pre-fills
  the 4 players in their original bid order (filtered to current roster); button shows only when a prior
  4-player round exists *(done Jul 19 2026)*
- [x] **P8-3:** Standings show OVERALL (total) score + session-over-session delta — `buildStandings` now
  takes `latestSessionId` and returns per-player `session_delta` (net points in the most recent scored
  session); `Leaderboard` renders a ↑/↓ badge next to the score; Home standings switched to `sortBy="total"`
  (avg shown in subtitle) with the latest-session delta *(done Jul 19 2026)*

> **Wave 8 verification (Jul 19 2026):** `npm run build` GREEN (2534 modules; recharts bundled), `eslint` clean.

> **🎉 PHASE 8 COMPLETE (Jul 19 2026):** three owner adjustments shipped; frontend-only, auto-syncs on push.

## Phase 9: AI "Ask about the game" chat (Aug 2026)

> The Jul 19 backlog item, now built. Note the unusual provenance: **the Base44 Builder authored P9-1**
> and it reached this repo through the two-way sync as "File changes" commits — not written here.

- [x] **P9-1** *(built in the Base44 Builder; pulled Aug 3 2026)*: `base44/functions/askRules` — Deno fn,
  auth-gated (401 without a user), inlines the rulebook as the LLM's ONLY knowledge, `SYSTEM_PROMPT`
  forces the exact refusal line "IDK bro 🤷 — that's not in the WhistMate rulebook." for anything
  off-book, last-8-message history window, calls `asServiceRole.integrations.Core.InvokeLLM`.
  `src/pages/RulesChat.jsx` = full-screen chat UI (suggestion chips, typing dots) calling
  `base44.functions.invoke("askRules")`. An earlier draft built the prompt client-side; the refactor moved
  the rules + prompt server-side (right call — the rulebook is no longer shipped in the JS bundle).
- [x] **P9-2** *(done Aug 3 2026)*: **nav entry** — `/rules` was registered but unreachable (no link
  anywhere) AND was inside the `Layout` shell, which both nested a second header and, because `/rules`
  wasn't in `GLOBAL_ROUTES`, bounced group-less users to /home. Fixed: route moved OUT of `Layout`
  (it's full-screen with its own safe-area header/composer), `HamburgerMenu` gained an "Ask About the
  Game" item (group-agnostic → belongs there, not in either bottom nav; visible in both the global and
  group shells), and `RulesChat` gained a back arrow (`history.length > 1 ? -1 : '/home'`) plus its own
  signed-out guard → /login, since it no longer inherits the shell's.
- [x] **P9-3** *(done Aug 3 2026)*: **single-source rules pipeline** — the rulebook existed TWICE
  (docs/whist-rules.md + inlined `RULES_DOC`, with a "keep this in sync by hand" comment) and the
  behavior prompt existed a THIRD time as a stale "ready-to-paste" block in doc §0. Now:
  `docs/whist-rules.md` is the only source; `scripts/gen-rules-doc.mjs` splices §1–§7 into
  `askRules/entry.ts` between `BEGIN/END GENERATED RULES_DOC` markers (§0 stripped — it's maintainer
  notes, not game knowledge; template-literal chars escaped). `npm run rules:gen` regenerates,
  `npm run rules:check` exits 1 on drift. Doc §0 rewritten to describe the pipeline and point at
  `SYSTEM_PROMPT` in the function as the prompt's only home. Verified: the generator reproduced the
  existing inline text byte-for-byte (the two copies were still in sync), and a round-trip test confirmed
  a doc edit propagates and `--check` catches staleness.

> **Wave 9 verification (Aug 3 2026):** `npm run build` GREEN, `eslint --quiet` exit 0, scoring 36/36,
> whist-stats 5/5, `npm run rules:check` in sync, no new typecheck errors (239 before and after — that
> script is broadly failing at HEAD on pre-existing shadcn JSX prop typing; effectively dead).
> DEPLOYED + verified live at the bundle level: the served `assets/index-*.js` is byte-identical to the
> local build and contains both the `/rules` route and the "Ask About the Game" menu string. Still owed:
> the owner asking a real question in the UI, including one off-book question to confirm the exact
> "IDK bro 🤷" refusal survives in production.

## Phase 10: Trump winner tracking + the suit-rank rule fix (Aug 2026)

> Found by the owner smoke-testing the rules chat: it answered that a 5♥/5♠ tie goes to whoever bid
> first. The assistant was faithful to the rulebook — **the rulebook and the code were both wrong.**

- [x] **P10-0** *(owner ruling, Aug 3 2026)*: real auction suit rank, low → high:
  **♣ clubs < ♦ diamonds < ♥ hearts < ♠ spades < no-trump**. So 5♠ beats 5♥ and 5NT beats 5♠; it is
  never settled by bid order. Pinned in `SUIT_RANK` (src/lib/scoring.js) + 2 tests so it can't regress.
- [x] **P10-1** *(done Aug 3 2026)*: **record the auction, don't derive it.** The app only ever sees each
  player's FINAL bid number, so it structurally cannot know who won an auction decided by suit — the
  old `highestBidderIndex` bid-order tie-break was guessing. The table now marks the winner:
  `submitBids` + `updateRound` accept `trump_owner_player_id` (validated ∈ the round's 4 players) and
  store it as `Game.highest_bidder_player_id`; the bid-number max survives only as a fallback for
  callers that send nothing. No entity migration — the field already existed; only its meaning is now
  honest (descriptions updated). No scores affected: `highest_bidder_player_id` never fed scoring.
- [x] **P10-2** *(done Aug 3 2026)*: **trump UI per the owner's mockup** — a trump cell on each player
  row in `RoundView` (bidding AND admin-edit); tap it to mark the winner, then pick the suit in the
  shared `renderTrumpPanel`. Suit glyph shows inline, ♥/♦ in red. Trump is now recordable in **every**
  session (optional), not just advanced ones — gating it behind Advanced would have left the group's
  non-advanced sessions with no trump history, which is the thing that was asked for. Advanced still
  requires trump + hierarchy before locking bids, and pre-selects the top bidder as a one-tap default;
  hierarchy stays advanced-only. Winner + suit now surface on the results header, the round summary
  (glyph next to the winner's name), and the SessionView round feed.
- [x] **P10-3** *(done Aug 3 2026)*: **rulebook corrected** — §2 now teaches the suit ranking and
  explains that WhistMate records the auction's outcome rather than computing it; §3 splits "strongest
  suit" into during-play (trump) vs during-the-auction (fixed rank); new FAQ entry for the 5♥-vs-5♠
  question the owner actually asked; glossary gained a Suit rank row. Regenerated into `askRules`.

> **Wave 10 verification (Aug 3 2026):** build GREEN, `eslint --quiet` exit 0, scoring **38/38** (2 new
> SUIT_RANK tests), whist-stats 5/5, `rules:check` in sync, Game.jsonc parses, typecheck unchanged (239).
> ⚠️ NOT verified at runtime: `submitBids`/`updateRound` are Deno and can't run locally, so the
> trump_owner round-trip needs a live round after deploy. Functions changed → `base44 deploy` required.

## Phase 11: Fix locked bids + tell the two in-round phases apart (Aug 2026)

- [x] **P11-1** *(done Aug 3 2026)*: **edit bids after locking.** Bids are typed in *after* the table's
  real auction, so typos surface once play starts — and there was no way back: the bidding screen was
  gone at `status='playing'`, and admin Edit Round only exists on scored rounds. Now `submitBids` also
  accepts a round in `playing` (re-locking recomputes table_state + the trump record), the Results screen
  has an "Edit bids" button, and `RoundView` re-renders the bidding UI with Save/Cancel. Any member can
  do it, same as locking — scored rounds still refuse and route to admin Edit Round (409). Cancel reloads
  from the server; typed-but-unsaved tricks are untouched (they only persist via saveRoundResults).
  Also: an illegal Σ=13 total now explains itself instead of silently grey-ing the button, and once all
  four bids are in, the pad says rows are tappable (pre-lock editing worked but wasn't discoverable).
- [x] **P11-2** *(done Aug 3 2026)*: **phases are now distinguishable.** Bidding and Results were the
  same layout (4 rows + number pad) with only the title differing. Added `PHASE` (one config, so a
  screen can't drift from its own accent) + `PhaseBanner`: gold + gavel + "step 1 of 2" for bidding,
  emerald + clipboard + "step 2 of 2" for results, carrying the existing up/down and tricks badges. The
  accent also drives the active row border and the number pad's selected key, so the colour reads even
  when the banner is scrolled off. Deliberately reused existing palette colours (gold = primary CTA,
  emerald = the tricks-complete badge already on that screen) rather than inventing new ones.

> **Wave 11 verification (Aug 3 2026):** build GREEN, `eslint --quiet` exit 0, scoring 38/38,
> whist-stats 5/5, `rules:check` in sync. ⚠️ Visual result NOT screenshot-verified, and the re-lock path
> needs a live round (Deno can't run locally). `submitBids` changed → `base44 deploy` required.

## Phase 12: Public-listing readiness for Clonitt (Nov 2026)

> Make the app fit to list publicly: close the open data API, name who is accountable, remove the
> poker leftovers. Findings, decisions and the deploy order are in plan.md Phase 12.

### 12a. Read path

- [x] **P12-1** *(done Nov 18 2026)*: **game data is no longer readable from the browser.** Entity read
  RLS on `Group`, `Session`, `Game`, `RoundResult`, `TableTalkNote` went from `true` to app-admin only
  (`Group.create` and `JoinAttempt.create` too — no rule is the literal `true` any more). Two new
  functions carry the reads and check group membership first: `getGroupData` (scopes `group`,
  `session`, `round`, `player`, `shared_sessions`) and `getPlayerNotes`. Rewired onto them: `Home`,
  `History`, `SessionView`, `NewRound`, `RoundView`, `PlayerProfile`, `TableTalkFeed`,
  `WriteNoteDialog` — `src/` now has no direct read of a game-data entity. `getPlayerNotes` never sends
  an author's user id; the feed gets `is_mine` instead. A soft-deleted group is 404 for its members.
- [x] **P12-1b** *(new, found during Wave 12a; done Nov 18 2026)*: **read functions no longer accept a
  forged membership.** `getGroupMembers`, `getActivityFeed` and `computePlayerStats` used the
  user-writable `user.groups` cache as proof; they now re-read the hinted `GroupMember` row by id and it
  must belong to the caller (role comes from the row, not the cache). The two new functions do the same.
- [x] **P12-1c** *(new, found during Wave 12a; done Nov 18 2026)*: `computePlayerStats` derives the
  group from the player row instead of trusting the request's `group_id` (mismatch → 404) and no longer
  returns `claim_token`.
- [x] **P12-5** *(done Nov 18 2026)*: `scripts/functions-access.test.mjs` — loads the REAL `entry.ts`
  files under plain `node` with a stub in place of `npm:@base44/sdk` and an in-memory backend, and checks
  who can read what: signed out, in no group, in another group, five kinds of forged cache, honest
  read-after-write lag, app admin, deleted group, pagination past 500 rows, anonymous-author stripping.
  Also two static guards: no entity rule is `true`, and `src/` never reads a game-data entity directly.
  Side effect of `getGroupData`'s cursor pagination: group-level reads no longer stop at 500 rows
  (Home standings and awards were silently truncated past ~125 rounds).

> **Wave 12a verification (Nov 18 2026):** `node scripts/functions-access.test.mjs` → **89 passed, 0
> failed**; the same test run against the pre-change code (scratch copy) → **14 failed**, each one a hole
> listed in plan.md (forged cache on the three read functions, the `group_id` bypass, the open entity
> rules, the direct entity reads). Build GREEN, `eslint --quiet` exit 0, scoring 38/38, stats 5/5,
> `rules:check` in sync. ⚠️ NOT verified against the real backend — that is P12-7 and P12-8.

### 12b. Honesty and accountability

- [x] **P12-2** *(done Nov 18 2026)*: **poker leftovers removed.** `/join` (signed out) showed the poker
  app's logo and "track your poker nights" on the live site; it now uses WhistMate's own `Logo` and says
  whist. Also: `Activity.jsx` "poker groups" → "whist groups"; `TableTalkCard` no longer labels every
  note "Poker Night" (shows the pinned session's name, or "General note"); deleted the unused
  `EditGameForm.jsx`. `grep -ri poker src` is empty.
- [x] **P12-4** *(done Nov 18 2026)*: **table-talk notes can be pinned to a whist night again.** The
  dialog's list queried the deleted `GamePlayer` entity and was always empty; it now lists the sessions
  both players sat at (`getGroupData` scope `shared_sessions`), and `createNote` takes `session_id` and
  stores the session's id, name and date in the note's inherited `game_*` fields — see plan.md Phase 12.
- [x] **P12-3** *(done Nov 18 2026)*: **someone is accountable.** New public `/about` page (reachable
  signed out; linked from the landing page and the hamburger menu): what the app is, made by Tomer
  Dishon, the support address, and what happens to your data. One source for the name and contact:
  `src/lib/app-info.js`. `README.md` rewritten from the Base44 template to say the same, with the dev
  instructions kept underneath; `package.json` gained `description` / `author` / `homepage` / `bugs`.

> **Wave 12b verification (Nov 18 2026):** ran the frontend locally against the live backend
> (`VITE_BASE44_APP_BASE_URL` proxy) in a clean headless Chrome, signed out: `/about` renders with the
> name, the address and the six data statements at 320, 390 and 1440 px wide with no horizontal overflow;
> `/join?code=…` shows the spade logo + "track your whist nights"; the landing page links to `/about`.
> ⚠️ Signed-in screens were NOT rendered (no test account) — P12-8.

### 12c. Ship

- [x] **P12-6** *(done Nov 18 2026)*: **deployed.** The owner logged the CLI in as the owning account;
  then `functions deploy` (all 31: **9 deployed, 22 unchanged** — `getGroupData` and `getPlayerNotes`
  new, and `submitBids` + `updateRound` were among the changed ones, so the August P10/P11 function
  changes had never reached the live app until now); fast-forwarded `main` and pushed `27be6de` to
  `origin` (dishontomer5-coder/whistmate); the sync applied the entity rules within about 30 seconds;
  the site did not follow within five minutes, so `site deploy --build --publish --yes` published the
  local build. That build uses the installed `@base44/sdk` 0.8.39, like the August CLI deploys.
- [x] **P12-7** *(done Nov 18 2026)*: **live site re-probed signed out — passes.** With no token, the
  entity API returns **0 records** for `Group`, `Session`, `Game`, `RoundResult`, `TableTalkNote`,
  `GroupMember`, `JoinAttempt` (and 401 for `User`); a get-by-id is 404; the two new functions refuse
  a signed-out caller with no data. The served bundle (`index-GWOfqBiz.js`) contains the About link,
  the developer name and address, "track your whist nights", and no "poker", no `GamePlayer`, no direct
  `entities.Session` read. In a clean headless Chrome: landing, `/about`, `/join`, `/register` render
  at 320 / 390 / 1440 px with no horizontal overflow; only console error is the expected signed-out 401;
  requests go only to the app's own address and `media.base44.com`; the web manifest is still served
  (standalone, 192 + 512 icons). Also ran a read-only script as the signed-in owner through
  `base44 exec`: every `getGroupData` scope, `getPlayerNotes`, `getGroupMembers`,
  `computePlayerStats` and `getActivityFeed` answer on the real backend with no rows from another
  group, and unknown ids / a mismatched `group_id` are refused with 404 (unknown scope 400).
- [ ] **P12-8** *(owner; partly confirmed Nov 18 2026 — the owner opened the live app signed in and
  Home (standings) and History (sessions) loaded with data; the rest is folded into Phase 13's QA
  and the owner's final check, P13-11)*: signed-in smoke test on the live site — sign up with a fresh email in a
  private window, create a group, start a session, play a full round including **Edit bids**, open
  History / a player profile / the Activity tab, leave a note pinned to a session, and Add to Home
  Screen on a phone. This is also the P10/P11 live test that was never recorded.
- [ ] **P12-10:** submit the Clonitt listing (the owner pastes the block; no Clonitt connector is
  attached to the agent). Needs a square icon ≥ 256 px; screenshots are optional but must be real.

> **Wave 12c verification (Nov 18 2026):** see P12-7 — signed-out probe, bundle contents, rendered
> pages and a signed-in read-only run as the owner all pass on the live site. ⚠️ NOT verified: a
> signed-in user who is neither app admin nor a member being refused on the REAL backend (the owner is
> both; it is covered only by the local access test and by the documented RLS behaviour), and every
> signed-in SCREEN (P12-8).

## Phase 13: Substantial UX improvement by an independent team (Nov 2026)

> Review → fix → verify → review again, by independent reviewers and doers, until no blocker or major
> problem is left; then ship. The team, the loop, the owner's decisions, what must not change and the
> "Done when" list are in plan.md Phase 13. Findings from each review round become numbered tasks
> here (`P13-R<round>-<n>`), rated blocker / major / minor / idea.

### 13a. Sandbox

- [x] **P13-1** *(done Nov 19 2026)*: **the sandbox.** `sandbox/server.mjs` serves a build of the
  frontend and implements the Base44 REST API the app calls, running the REAL `base44/functions`
  against a seeded in-memory store and honouring every entity's `rls` block; `sandbox/seed.mjs` seeds
  through the real functions (Thursday Whist: 7 members incl. two unclaimed Hebrew-named players, 14
  closed sessions + one open with a round in play, 164 rounds, both scoring methods, advanced rules,
  zero bids, reneges, everyone-falls, notes; Family Table; an archived and a soft-deleted group; 8
  users, password `whist123`, tokens `sbx-<name>`); `sandbox/smoke.mjs` checks it over HTTP;
  `sandbox/browse.mjs` is a dependency-free headless-Chrome driver for the reviewers. Start:
  `node sandbox/server.mjs --port 4600`; sign in via the form or `/?access_token=sbx-maya`; everything
  else is in `sandbox/README.md` and `GET /__sandbox/info`. Simulated: the LLM, e-mail, Google,
  realtime, hosting extras. — why this design: plan.md Phase 13.

> **Wave 13a verification (Nov 19 2026):** `node sandbox/smoke.mjs` → **28 passed, 0 failed** (own
> run, after the backend merge and the entity change below); the lead opened the sandbox signed in as
> the demo admin in headless Chrome — groups list, group home, history, session, round in play all
> render seeded data at 390 px with no console errors and no horizontal overflow.

### 13b. Review and fix rounds

- [x] **P13-2** *(done Nov 19 2026)*: **review round 1.** Six independent reviewers, each alone in a
  private sandbox instance, driving the app through `sandbox/browse.mjs` (150–340 browser commands
  each), none reading the source or each other. Every verdict: **"PUBLISH: yes, after fixes"**.

  | Reviewer | Blocker | Major | Minor | Idea |
  |---|---|---|---|---|
  | Newcomer | 0 | 5 | 13 | 1 |
  | Scorekeeper | 0 | 6 | 10 | 3 |
  | Returning player | 0 | 9 | 13 | 3 |
  | Visual designer | 0 | 7 | 18 | 3 |
  | Whist player | 0 | 7 | 12 | 2 |
  | QA tester | 0 | 5 | 18 | 3 |
  | **Total (138)** | **0** | **39** | **84** | **15** |

  What held up: scoring (the Whist player checked 100 player scores over 25 rounds against the
  rulebook — no difference), server-side permissions, double-tap safety, validation messages, the
  landing and About pages. The two defects already known were both found independently (the
  Sessions/History tabs — P13-F1; the invite link lost through sign-in), which says the reviewers'
  recall is good. Raw findings (outside the repo, temporary): the session scratchpad,
  `review/r1/<reviewer>/findings.json`.
- [x] **P13-3** *(done Nov 19 2026)*: **triage of round 1.** An independent reproducer re-ran the
  findings on a reset sandbox and traced each to file and line: the 138 findings are **86 distinct
  problems** — 30 with a major member, 47 minor, 9 ideas; verdicts: 80 confirmed, 3
  confirmed with a correction, 3 by design, 0 not reproduced, 0 sandbox artifacts; 29 of the 30 major
  clusters reproduced in the browser (the 30th is the store icon). It also found eight things no
  reviewer reported. The lead's 66 rulings assign every cluster an owner; the list below is the
  work. Owners: foundation (shared pieces, wave 1), stats/backend (wave 1), then structure, round
  flow and onboarding/admin in parallel (wave 2).

- [ ] **P13-R1-C01** *(major · onboarding/admin · ruling 28, 47)*: Sign-in and sign-up never return to where the person was going (invite link, deep links)
- [ ] **P13-R1-C02** *(major · onboarding/admin · ruling 29)*: The invite page (/join) is bare: no group name, only 'Sign In'; signed in it is a dialog over an empty screen
- [ ] **P13-R1-C03** *(major · onboarding/admin · ruling 30, 33)*: A new group gives no lead to adding players; Members is the last block in Admin, below the Danger Zone
- [ ] **P13-R1-C04** *(major · round flow · ruling 26)*: Scores and table terms are not explained where they are shown (points, UP/DOWN, renege, everyone falls, hierar
- [ ] **P13-R1-C05** *(minor · round flow · ruling 25)*: 'Progressive' is described as escalating, but misses of 1-4 tricks cost a flat 5 each (half of Classic)
- [ ] **P13-R1-C06** *(major · round flow · ruling 20)*: RENEGE: one tap on a small unexplained pill costs a player 100 points, with no confirmation
- [ ] **P13-R1-C07** *(idea · round flow · ruling 19)*: Idea: show made / missed, the points and an everyone-falls warning before Save Round
- [ ] **P13-R1-C08** *(major · stats/backend · ruling 9)*: Wins, win rate and podiums count the session that is still open
- [ ] **P13-R1-C09** *(major · round flow · ruling 16)*: A started round cannot be discarded or re-seated, and it silently removes Close Session
- [ ] **P13-R1-C10** *(major · round flow · ruling 14)*: Round entry does not fit: Lock Bids lands exactly behind the tab bar once a trump winner is marked; short phon
- [ ] **P13-R1-C11** *(minor · round flow · ruling 14)*: At 320 px: step title cut to 'R…', number pad below the fold, action rows past the gutter, History line wraps 
- [ ] **P13-R1-C12** *(minor · round flow · ruling 21, 22)*: Advanced rules: Lock Bids stays disabled with no reason, the card-order choice has no heading, and it is not s
- [ ] **P13-R1-C13** *(major · round flow · ruling 17)*: 'Edit bids' wipes the tricks (and renege marks) already typed, although the notice says they are untouched
- [ ] **P13-R1-C14** *(major · round flow · ruling 17)*: Unlocked bids and unsaved tricks vanish without warning when the round screen is left or reloaded
- [ ] **P13-R1-C15** *(major · round flow · ruling 18)*: Bidding order: the app assumes row 1 bids first, the cursor jumps to the first empty row, and 'Same players' r
- [ ] **P13-R1-C16** *(idea · round flow · ruling 18)*: Idea: one tap to start a round with an unchanged table
- [ ] **P13-R1-C17** *(major · structure · ruling 3, 44)*: A page from one group is shown under another group's header, with that group's admin buttons and 'Player Not F
- [ ] **P13-R1-C18** *(major · structure · ruling 3)*: After leaving a group, the browser Back button is stuck on Your Groups
- [ ] **P13-R1-C19** *(major · structure · ruling 1)*: Group tabs: label and icon do not match the content ('Sessions' = standings and awards, trophy = the session l
- [ ] **P13-R1-C20** *(major · structure · ruling 4)*: On phones the header arrow leaves the group, has no label, and sits above a second back arrow
- [ ] **P13-R1-C21** *(major · structure · ruling 4)*: In-page Back links are fixed destinations: player -> History, session -> group home, About -> Your Groups
- [ ] **P13-R1-C22** *(major · structure + stats/backend · ruling 5, 13)*: 'My best night' and 'who won' cannot be found: History and closed sessions do not name a winner, a profile has
- [ ] **P13-R1-C23** *(minor · round flow · ruling 24)*: Closing a session: button at the very bottom, browser confirm box, no closing summary, no way to reopen
- [ ] **P13-R1-C24** *(major · structure + stats/backend · ruling 6, 13)*: Round history: only on a second 'me' page, cut at 50 rows without saying so, and no row names its session
- [ ] **P13-R1-C25** *(major · structure · ruling 6)*: Notes are buried: a note tapped in Activity opens the top of a long player page; the note box sits below 50 ro
- [ ] **P13-R1-C26** *(minor · structure · ruling 6)*: Profile tiles: the explanation bubble covers the number it explains; 5/3/3 tiles leave holes in the two-column
- [ ] **P13-R1-C27** *(minor · structure · ruling 6)*: 'View another player' is a blank box at the bottom of the profile
- [ ] **P13-R1-C28** *(minor · structure · ruling 6)*: One note, two dates (Activity prints the day it was written next to the session's name); round rows dated diff
- [ ] **P13-R1-C29** *(minor · stats/backend · ruling 66)*: Activity: my own note raises the 'new' badge; Activity exists only outside a group and lists notes only
- [ ] **P13-R1-C30** *(minor · structure + onboarding/admin · ruling 2, 32)*: Account and identity: sign-up never asks a name, My Account shows 'User' with nothing to edit; three pages cal
- [ ] **P13-R1-C31** *(minor · onboarding/admin · ruling 31)*: After claiming a player nothing confirms who you are now, and the joiner is told no way to undo it
- [ ] **P13-R1-C32** *(minor · onboarding/admin · ruling 32)*: Password reset: success is not confirmed, and a used link leads nowhere
- [ ] **P13-R1-C33** *(minor · every implementer · ruling Words)*: Names drift: WHIST / WhistMate / Israeli Whist; 'games' for rounds and for sessions; three names for a note
- [ ] **P13-R1-C34** *(minor · round flow · ruling Words)*: Developer wording on the game screens (Σ=13, 're-derives', 'Table UP · trump No-Trump', 'Network Error')
- [ ] **P13-R1-C35** *(minor · onboarding/admin · ruling 51)*: Members: 'Remove' does three different things and explains none; 'Unclaimed', 'ghost', 'soft-deletes' wording
- [ ] **P13-R1-C36** *(minor · round flow · ruling 25)*: No game-limit option when starting a session, although the server and the rulebook have one
- [ ] **P13-R1-C37** *(major · stats/backend + structure · ruling 10)*: Awards: a profile shows a number under every award whether or not the player holds it; The Destroyer names one
- [ ] **P13-R1-C38** *(minor · structure + stats/backend · ruling 7)*: The small ▲ number in the standings: 'this session' is whichever session last had a scored round, open or clos
- [ ] **P13-R1-C39** *(minor · stats/backend + structure · ruling 12)*: 0-BID SUCCESS shows 0% for a player who never bid zero
- [ ] **P13-R1-C40** *(major · foundation · ruling 38)*: Hebrew free text (notes, session names, locations) is laid out left-to-right
- [ ] **P13-R1-C41** *(major · foundation · ruling 38, 65)*: A Hebrew name inside an English line is reordered: 'Bid for 4 · נועה blocked', and row labels read 'יוסי .1'
- [ ] **P13-R1-C42** *(major · foundation + round flow · ruling 15, 39)*: Tap targets are under 44 px (keypad 42, main buttons 36 high, RENEGE 19 high, header arrow 16)
- [ ] **P13-R1-C43** *(major · foundation · ruling 37)*: Colour meanings collide: UP is red and DOWN green beside ↑ green / ↓ red; gold is used for positive, zero and 
- [ ] **P13-R1-C44** *(minor · foundation · ruling 22)*: Suit symbols: picker order differs from the rulebook's ranking, and red suits lose their colour in places
- [ ] **P13-R1-C45** *(major · foundation · ruling 37)*: Red text is too dim on navy (about 3.0-3.9:1)
- [ ] **P13-R1-C46** *(major · onboarding/admin · ruling 34)*: Group Admin breaks sideways: 364 px wide at 320 px, and Remove -> Confirm / Cancel pushes Cancel off a 390 px 
- [ ] **P13-R1-C47** *(major · onboarding/admin + round flow · ruling 35, 48)*: Destructive actions are confirmed in four different ways, and Archive, Regenerate Code and app-level Make Admi
- [ ] **P13-R1-C48** *(owner decision (reported as major) — NOT fixing: the owner's artwork and the owner's decision; an alternative icon drawn from the in-app mark will be offered)*: The store icon (painted jester, 'Whist' ribbon) and the app (flat yellow spade tile, 'WHISTMATE') do not look 
- [ ] **P13-R1-C49** *(minor · foundation · ruling 39)*: Dialogs on phones are a square edge-to-edge band with touching buttons; claim rows 4 px narrower than 'I'm a n
- [ ] **P13-R1-C50** *(minor · foundation · ruling 8)*: The 'page not found' screen is a white generic template
- [ ] **P13-R1-C51** *(minor · foundation · ruling 40)*: Type: many sizes with real information at 9-11 px, and three page-title styles
- [ ] **P13-R1-C52** *(minor · foundation · ruling 39)*: Gold is used for everything at once (logo, buttons, selected options, scores, badges, links, status)
- [ ] **P13-R1-C53** *(minor · foundation · ruling 39)*: Form controls: near-invisible input outline, two input heights, three label styles, invisible off-switch, blac
- [ ] **P13-R1-C54** *(minor · foundation · ruling 39)*: Buttons: three heights and casings; a touched 'Regenerate Code' stays white-on-gold; Save Settings gives no co
- [ ] **P13-R1-C55** *(minor · foundation · ruling 42)*: One player, three avatar styles; a Hebrew yod initial looks like an empty circle
- [ ] **P13-R1-C56** *(minor · foundation · ruling 41)*: Two card styles and three badge styles on one screen
- [ ] **P13-R1-C57** *(minor · foundation · ruling 41)*: Empty and error states come in several looks; a new session shows two at once; a missing session offers 'Try A
- [ ] **P13-R1-C58** *(minor · onboarding/admin · ruling 32)*: Sign-in screens have no breathing room on short screens
- [ ] **P13-R1-C59** *(minor — NOT fixing: the app is made for phones; the desktop column works and nothing breaks)*: Desktop: a 640 px phone column with the tab bar stretched across the window; the rules page alone is full widt
- [ ] **P13-R1-C60** *(idea — NOT fixing: idea — a restyle beyond "improve within the identity")*: Idea: a little more 'card table' in the look
- [ ] **P13-R1-C61** *(minor · round flow · ruling 22)*: Trump control is a faint dot; a winner marked without a suit is dropped silently
- [ ] **P13-R1-C62** *(minor — NOT fixing: BY DESIGN — the app records what the table decided; it cannot see the auction)*: The trump record accepts a winner who did not bid highest, and pre-fills the first of several tied bidders
- [ ] **P13-R1-C63** *(minor · round flow · ruling 23)*: Fixing a saved round is a detour: two 'Edit round' taps, keyboard fields instead of the pad, no return to the 
- [ ] **P13-R1-C64** *(minor · round flow · ruling 59)*: A plain player cannot fix a wrongly scored round and is not told who can
- [ ] **P13-R1-C65** *(minor — NOT fixing: BY DESIGN — an everyone-falls round was played and scored zero; it stays a round played)*: Cancelled ('everyone falls') rounds still count as rounds played and lower the average and contract accuracy
- [ ] **P13-R1-C66** *(minor · onboarding/admin · ruling 43)*: The real assistant answered a Hebrew question in English
- [ ] **P13-R1-C67** *(minor · onboarding/admin · ruling 43)*: The assistant's refusal is 'IDK bro' and a dead end; one answer left out the other progressive tiers
- [ ] **P13-R1-C68** *(minor · round flow · ruling 25)*: Every new session is named 'Whist Night', and the session card shows 'Advanced' but not the scoring method
- [ ] **P13-R1-C69** *(idea — NOT fixing: idea)*: Idea: fill in the fourth player's tricks automatically and dim impossible numbers
- [ ] **P13-R1-C70** *(idea · round flow · ruling 27)*: Idea: show what the last round did to each player without scrolling
- [ ] **P13-R1-C71** *(idea — NOT fixing: idea)*: Idea: compare two players side by side
- [ ] **P13-R1-C72** *(idea — NOT fixing: idea)*: Idea: a 'podium' of three means little at a table of four
- [ ] **P13-R1-C73** *(major · round flow · ruling 45)*: New Session ignores the group's default scoring and Advanced setting after a reload or direct open
- [ ] **P13-R1-C74** *(major · onboarding/admin · ruling 46)*: Admin errors appear far from the control that caused them, and a successful save shows nothing
- [ ] **P13-R1-C75** *(minor · stats/backend · ruling 50)*: Two players can have the same name in different letter case
- [ ] **P13-R1-C76** *(minor · round flow · ruling 49)*: Starting a session while one is open throws the form away and jumps to the open session without a word
- [ ] **P13-R1-C77** *(minor · round flow · ruling 52)*: After a round is deleted the Start Round button shows the wrong number
- [ ] **P13-R1-C78** *(minor · round flow + stats/backend · ruling 54, 63)*: Session name, location and date accept anything; a blank date is saved as the day before (shortly after midnig
- [ ] **P13-R1-C79** *(minor · every implementer · ruling 53)*: An archived group still offers every write action; they fail only at the last step
- [ ] **P13-R1-C80** *(minor · onboarding/admin · ruling 55)*: After deleting a group the admin stays on /admin and sees 'ADMINS ONLY' for a different group
- [ ] **P13-R1-C81** *(minor · onboarding/admin · ruling 56)*: The App Admin dashboard frame is drawn for signed-out visitors and ordinary users
- [ ] **P13-R1-C82** *(minor · onboarding/admin · ruling 57)*: Admin list keeps a member's e-mail after Unclaim; deleting a note that is already gone fails silently
- [ ] **P13-R1-C83** *(minor · every implementer · ruling 60)*: Controls with no accessible name; toggles that expose no state
- [ ] **P13-R1-C84** *(minor · stats/backend · ruling 58)*: Tied players are given different ranks - and two tied leaders are both credited with a win
- [ ] **P13-R1-C85** *(idea — NOT fixing: idea — needs live updates to matter)*: Idea: Save Round does not notice that the bids were changed by someone else
- [ ] **P13-R1-C86** *(idea — NOT fixing: idea — a real double tap is already safe)*: Idea: Create Group has no server-side guard against a duplicate request

- [x] **P13-4** *(done Nov 19 2026 — four implementers in worktrees: foundation + stats (wave 1), structure & navigation, round flow, onboarding & admin (wave 2), all merged on main; every check green)*: fix every blocker and major from round 1, and the cheap minors.
- [x] **P13-5** *(done Nov 19 2026 — the QA tester, as independent verifier, replayed every fixed cluster on fresh builds of main: **69 fixed, 5 partly, 0 not fixed, 0 regressed, 12 skipped as ruled**; none of the 30 major clusters fails (C42 touch targets partly — four controls under 44 px); cross-cutting checks clean on 19 screens at 320/390/1440 px; 8 new minor findings. Record: `docs/review/round-1/verification/`. A polish pass is clearing C42/C54/C57 and verify-1…8 before the deploy)*: verify round 1's fixes — the QA tester re-walks each changed flow, before and after
  screenshots; build, lint and all tests green.
- [x] **P13-6a** *(done Nov 19 2026)*: **review round 2** — six fresh reviewers on the code of the live build.
  Scorecard: Newcomer 0/1/9/2 · Scorekeeper **PUBLISH: yes** 0/1/6/2 · Returning player 0/5/9/1 ·
  Visual designer 0/3/17/1 · Whist player 0/1/11/1 · QA tester 0/2/7/1 (blocker/major/minor/idea);
  total **0 blockers, 13 majors, 59 minors, 8 ideas** (round 1: 0 / 39 / 84 / 15). Rulings in
  `docs/review/round-2/RULINGS.md`: 11 majors fixed in fix round 2 (three implementers A/B/C), 2 not as
  stated (store icon — owner's; results feed in Activity — idea, reachability fixed).
- [x] **P13-6b** *(done Nov 19 2026)*: **fix round 2** (implementers A structure, B round flow, C stats/backend + a
  polish pass) → **verified** by the QA tester (53 fixed, 1 partly, 0 regressed; record in
  `docs/review/round-2/verification/`) → **deployed** (bundle `index-B8tlGwc_.js`; signed-out reads `[]`).
- [x] **P13-6c** *(done Nov 19 2026)*: **review round 3** — the last allowed. Six fresh reviewers. Scorecard:
  Newcomer **PUBLISH: yes** 0/0/8/1 · Scorekeeper **PUBLISH: yes** 0/0/8/1 · Returning player 0/1/8/1 ·
  Visual designer 0/2/14/2 · Whist player **PUBLISH: yes** 0/0/6/1 · QA tester 1/1/6/0
  (blocker/major/minor/idea); total **1 blocker, 4 majors, 50 minors, 6 ideas** (round 2: 0/13/59/8; round 1:
  0/39/84/15). The blocker: two people editing the same round silently overwrite each other.
  Rulings: `docs/review/round-3/RULINGS.md`.
- [x] **P13-6d** *(done Nov 19 2026)*: **fix round 3** — no silent overwrite (a version check on `updateRound`
  and `submitBids`, refused with "This round was changed on another phone"), a one-time notice for a
  detached player, "Trump not recorded", a labelled Renege, "Tonight · Last session" with the date, five
  cheap minors. **Verified** by the QA tester: all six items fixed, no regression; it found one more major
  (at 320 px the refusal note hid under the header) — fixed and re-checked in the sandbox at 320 px (note
  at y=96, header ends at y=69). **Deployed** (functions 4 deployed / 27 unchanged; entities pushed; site
  `index-CKd8aPs4.js`). Record: `docs/review/round-3/verification/`.
- [x] **P13-6** *(done — see P13-6a…d)*: review round 2 with fresh reviewers; repeat P13-3 to P13-5 as round 2, and a round 3
  if needed, until a round ends with 0 open blockers and 0 open majors (at most three rounds).

### 13c. Security and the guide

- [x] **P13-7** *(done Nov 19 2026 — closes P12-9)*: **no backend function trusts the user-writable
  membership cache.** The 18 write functions each carry `hintedMemberRow`: the cache only points at a
  `GroupMember` row, which is re-read by id and counts only if it is the caller's, in that group; role
  and name come from the row. The access test went from 89 to 383 checks, 114 of which fail against the
  old code; it now classifies every function folder as read or write and fails on an unclassified one.
- [x] **P13-8** *(done Nov 19 2026; written, then updated with the three rounds' outcomes and "test two people at once" — — 14 sections, 50 practices, each with a check and the WhistMate
  lesson; ~5,000 words. Reports round 1 as "found / ruled"; needs one final pass after review round 2 to
  state outcomes)*: `docs/web-app-best-practices.md` — a project-agnostic guide for future builds of this
  kind (structure and navigation, flows, states, wording, visual design, phones, accessibility, data
  access and privacy, accountability, testing, shipping), each practice with the WhistMate lesson
  behind it.

### 13e. Backend findings (new, found by the backend implementer while doing P13-7, Nov 18 2026)

> Reproduced in the access-test harness on the P13-7 branch. Rulings are the lead's; the same
> implementer is fixing them on that branch with tests.

- [x] **P13-B1** *(done Nov 19 2026 — the target must be in `group_id` for every role change (404, no row returned); no demotion, removal or unclaim may leave a group without an admin who has an account.)* *(blocker)*: `updateMemberRole` checks that the target belongs to the group only when
  promoting — any signed-in user can demote a member of ANOTHER group whose id they know, and a plain
  member can leave their own group with no admin. Fix: target must be in `group_id` for every change;
  the last-admin guard covers every demotion.
- [x] **P13-B2** *(done Nov 19 2026 — an unscored round can be deleted by any member; a scored one only by a group admin or app admin (403 "Only a group admin can delete a scored round").)* *(major)*: `deleteRound` lets any member delete any round, scored ones in closed
  sessions included, while the UI offers it to admins only. Ruling: an unscored round (bidding /
  playing) — any member; a scored round — group admin or app admin.
- [x] **P13-B3** *(done Nov 19 2026 — one rule in 18 write functions — archived → 403 "This group is archived — it is read-only", deleted → 404 — checked after membership; exceptions: un-archiving, the app-admin tools, leaving an archived group yourself, app-admin note moderation.)* *(major)*: archived and soft-deleted groups are still writable through most write
  functions. Ruling: not `active` = read-only everywhere (403 "This group is archived — it is
  read-only"; deleted → 404), except un-archiving, the app-admin tools, leaving the group yourself,
  and app-admin note moderation.
- [x] **P13-B4** *(done Nov 19 2026 — `cleanupOrphans` and `listAllGroupsWithStats` page every "all rows" read by cursor and refuse (500) rather than guess if a read cannot be completed.)* *(major, data loss at scale)*: `cleanupOrphans` decides from one 500-row page of
  members, so past 500 member rows it deletes valid notes; `listAllGroupsWithStats` undercounts the
  same way. Fix: cursor pagination.
- [x] **P13-B5** *(done Nov 19 2026 — `renameMember` pages its name sweep; the same single-page assumption was removed from the last-admin guards, `startRound`, `previewGroupByCode`, `getGroupMembers`, `getActivityFeed`.)* *(minor)*: `renameMember` renames only the first 500 results of a player.
- [x] **P13-B6** *(done Nov 19 2026 — unknown ids are 404 with a specific message in every write function.)* *(minor)*: unknown ids give 500 instead of 404 in eleven write functions.
- [x] **P13-B7** *(done Nov 19 2026 — `round_number` is the highest existing number plus one.)* *(minor)*: `startRound` numbers a round `rounds.length + 1`, so deleting a round makes
  the next number repeat.
- [x] **P13-B8** *(done Nov 19 2026 — at most five hinted rows are re-read per call, in all 24 functions that read the cache.)* *(minor, hardening)*: the cache-hint loop re-reads one row per cache entry — bound it
  to five hinted ids per call.
- [x] **P13-B10** *(major, new — found by the sandbox builder; done Nov 19 2026)*: profile stats
  undercounted once a player's sessions held more than one page of results (`computePlayerStats`,
  `computeGlobalStats` asked for thousands of rows in one query) — so a profile disagreed with the group
  home. Both now page by cursor.
- [x] **P13-B11** *(major, new — found by the sandbox builder; backend done Nov 19 2026)*: a session's
  game limit could never be set (`startSession` always stored null) although `startRound` enforces it
  and the rulebook describes it. `startSession` now accepts `game_limit` (1–99, or none). The New
  Session screen does not offer it yet — that is a frontend task for the fix round.
- [x] **P13-B12** *(done Nov 19 2026)*: data entities are closed to EVERY browser caller. `Group`,
  `Session`, `Game`, `RoundResult`, `TableTalkNote`, `JoinAttempt`: every rule is the literal `false`
  (was "app admin only", and `Group` update/delete was "its creator"); `GroupMember`: read your own
  rows, write nothing. Only service-role functions touch them, so no entity rule rests on `user.role`.
- [x] **P13-B9** *(BLOCKER, found and closed Nov 19 2026)*: **any signed-in user could make
  themselves app admin.** The platform accepts `auth.updateMe({ role: 'admin' })` from a plain user
  (the SDK's own typings show it as an example; the docs do not say who may). Proven on a throwaway
  Base44 app (`whistmate-role-test`, id `6afe27651d1ab7327046506d`): demoted to `user`, then
  self-promotion was accepted. That would have unlocked every app-admin path — reading any group,
  `purgeGroup`, the user list. Fix: a field-level rule in `base44/entities/User.jsonc` —
  `role` may be written only by an app admin. Verified on the test app and then ON THE LIVE APP with the
  owner's account: demoted, self-promotion refused (403 "You're not allowed to modify the following
  fields: data.role"), other self-updates (the `groups` cache) still accepted, admin restored through
  `exec --privileged`. The live app had 6 users and exactly 1 app admin, so the hole had not been used.
  A guard in the access test fails if the field rule is ever removed.
- [x] **P13-B13** *(done Nov 19 2026 — by the owner)*: sign-up still works on the live app with the
  role field rule in place. The owner created a fresh account ("it felt normal") and reached the
  create-or-join-a-group screen; the server then showed 7 users, 1 app admin, 6 plain users.

### 13d. Ship

- [x] **P13-9** *(done Nov 19 2026 — after every fix round: functions → entities → site, then a signed-out re-probe of the live site)*: deploy in the recorded order (functions → site → push) and re-probe the live site
  signed out; key pages at 320 / 390 / 1440 px.
- [x] **P13-10** *(done Nov 19 2026 — the block in the closing report)*: refresh the CLONITT LISTING block for anything renamed or added. Do not submit.
- [ ] **P13-11** *(owner)*: final signed-in look at the live app, then P12-10.

> **🎉 PHASE 13 CLOSED (Nov 19 2026):** three independent review rounds — majors 39 → 13 → 4, minors 84 → 59 → 50
> (round 3: 1 blocker, found and fixed); every round's blocker and majors fixed, verified by an independent
> tester and deployed. 24 of 24 write functions under the access test (522 checks). Left on purpose: the minors and
> ideas listed in each round's RULINGS.md; the store icon (owner's choice).

## Backlog

- [ ] **P12-9** *(found Nov 18 2026; owner approved the fix Nov 18 2026 — now scheduled as **P13-7**)*: the 18 WRITE functions still
  trust the user-writable `user.groups` cache for membership or admin role. Apply the same
  hint-not-proof check the read functions got in P12-1b (re-read the hinted `GroupMember` row by id; it
  must be the caller's; take the role from the row), and extend `scripts/functions-access.test.mjs` to
  cover them. Needs a signed-in test account to verify the admin actions live afterwards.
- [ ] **P10-4** *(offered, not built)*: now that the trump winner is recorded per round, a "trumps won"
  stat / award becomes possible in `computePlayerStats` + `StatGrid` (e.g. who takes the most auctions,
  and their contract accuracy when they do). Nothing consumes `highest_bidder_player_id` in stats yet.
- [ ] **P9-4** *(optional polish)*: `askRules` has no rate limiting, and every question is a fresh
  InvokeLLM call carrying the full ~210-line rulebook in the prompt. Fine for a friends' group; revisit
  if usage (or cost) grows — cheapest wins would be a client-side answer for the canned suggestion chips,
  or caching identical questions.
- [ ] **P0-4** *(carried from Phase 0)*: prune unused poker npm deps (stripe, three, react-leaflet,
  jspdf/html2canvas, react-quill?) — the whist surface is now known, so this is finally actionable.
  The bundle is ~1.04 MB (305 kB gzip) and trips vite's chunk-size warning.
