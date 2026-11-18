# Israeli Whist Companion — Todo (WHAT / live state)

> The live execution checklist + session hand-off. Read this THIRD on boot (after design.md,
> plan.md). Numbered `P<phase>-<n>` tasks; done-lines are changelog entries; exactly one `🔄`
> in-progress marker and one `▶ RESUME HERE` bookmark across the file.
>
> ▶ RESUME HERE (Nov 18 2026): **Phase 13 (substantial UX improvement by an independent team) is
> PLANNED and not started.** Next action = **P13-1** (build the sandbox). Read plan.md Phase 13 first:
> it holds the team, the loop, the owner's decisions (full authority to decide and change; may push and
> deploy), what must not change, and the "Done when" list. The owner starts the run with a `/goal`
> that points at that section.
> Phase 12 (Clonitt listing readiness) is DEPLOYED and verified on the live site signed out; the owner
> then opened the live app signed in and Home and History loaded with data (Nov 18 2026). The listing
> is NOT to be submitted (P12-10) until Phase 13 closes — the owner's call.
> The Base44 CLI on this machine is logged in as **dishontomer5@gmail.com**, the account that owns the
> app (the owner logged in on Nov 18 2026; the work account `tomerdi@base44.com` is refused by the app).
> CANONICAL REPO = **dishontomer5-coder/whistmate** (private; the owner's personal GitHub), local clone
> **~/Personal/whistmate**, `origin` → it. The old `tomerdi-blip` remote survives as `old-blip` with push
> disabled — never push there. The owner allows pushing and deploying on this repo only. Two-way-synced
> to the Base44 app "WhistMate" (app id `6a5be77702d0c74b5a13cfea`), live at
> **https://whist-mate-pro.base44.app**.
> Phases 1–11 are done (10 and 11 never had their live round test recorded — P12-8 covers it).
> Checks at `main` (Nov 18 2026): build GREEN, lint clean, scoring 38/38, stats 5/5,
> **functions-access 89/89**, `rules:check` in sync. `main` = `origin/main`; branch
> `p12-clonitt-readiness` is merged and can be deleted.
> in_progress: P13-1.
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

- [ ] 🔄 **P13-1:** a place where every reviewer can be signed in and nothing real is touched — a local
  sandbox, a fake backend, or a separate Base44 test app, whichever is easiest — seeded with realistic
  data (several groups, many sessions, 150+ rounds, Hebrew and English names, a round in play, an
  archived group, notes). Record how to start it and how to sign in.

### 13b. Review and fix rounds

- [ ] **P13-2:** review round 1 — the six reviewers, independently, with screenshots.
- [ ] **P13-3:** triage round 1 — reproduce, de-duplicate, rate; list every finding here as a task.
  P13-F1 (the Sessions / History tabs and the trophy icon) is already known.
- [ ] **P13-4:** fix every blocker and major from round 1, and the cheap minors.
- [ ] **P13-5:** verify round 1's fixes — the QA tester re-walks each changed flow, before and after
  screenshots; build, lint and all tests green.
- [ ] **P13-6:** review round 2 with fresh reviewers; repeat P13-3 to P13-5 as round 2, and a round 3
  if needed, until a round ends with 0 open blockers and 0 open majors (at most three rounds).

### 13c. Security and the guide

- [ ] **P13-7:** P12-9 — no backend function trusts the user-writable `user.groups` cache: apply the
  hint-not-proof check to the 18 write functions and extend `scripts/functions-access.test.mjs` to
  cover every one of them.
- [ ] **P13-8:** `docs/web-app-best-practices.md` — a project-agnostic guide for future builds of this
  kind (structure and navigation, flows, states, wording, visual design, phones, accessibility, data
  access and privacy, accountability, testing, shipping), each practice with the WhistMate lesson
  behind it.

### 13d. Ship

- [ ] **P13-9:** deploy in the recorded order (functions → site → push) and re-probe the live site
  signed out; key pages at 320 / 390 / 1440 px.
- [ ] **P13-10:** refresh the CLONITT LISTING block for anything renamed or added. Do not submit.
- [ ] **P13-11** *(owner)*: final signed-in look at the live app, then P12-10.

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
