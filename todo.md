# Israeli Whist Companion — Todo (WHAT / live state)

> The live execution checklist + session hand-off. Read this THIRD on boot (after design.md,
> plan.md). Numbered `P<phase>-<n>` tasks; done-lines are changelog entries; exactly one `🔄`
> in-progress marker and one `▶ RESUME HERE` bookmark across the file.
>
> ▶ RESUME HERE (Aug 3 2026): CANONICAL REPO = **tomerdi-blip/whistmate**, local clone
> **~/Personal/whistmate** (the old ~/whistmate and ~/israeli-whist clones are gone), two-way-synced to
> the Base44 app "WhistMate" (app id `6a5be77702d0c74b5a13cfea`, status ready).
> Phases 1–8 DONE + verified LIVE by owner. Phase 9 (AI rules chat) DONE + DEPLOYED + owner-tested.
> Phase 10 (trump winner tracking + suit-rank fix) DONE in code, NOT yet deployed/live-tested.
> Build GREEN + lint clean (0 errors) + scoring 36/36 + stats 5/5 + `rules:check` in sync.
> in_progress: none — awaiting next request.
> ✅ DEPLOYED Aug 3 2026: all 29 functions (incl. `askRules`) + entities + site are live at
> **https://whist-mate-pro.base44.app**. Only the owner's live smoke-test of /rules is outstanding.
> ✅ CLI IS AUTHENTICATED on this machine (`npx base44@latest whoami` → dishontomer5@gmail.com) — the old
> "not authed / whoami hangs" note was stale, an agent CAN deploy. `deploy` needs BOTH
> `--app-id 6a5be77702d0c74b5a13cfea` (no base44/.app.jsonc → not linked) AND `--yes` (it refuses to
> prompt non-interactively). Its PostHog telemetry errors in the output are harmless.
> ⚠️ Local `npm install` is BLOCKED and deliberately left alone (owner's call, Aug 3): the global registry
> is the internal mirror `npm.dev.wixpress.com`, which 404s on `axios@1.19.0` (transitive of
> @base44/sdk 0.8.41). Harmless — node_modules has sdk 0.8.39, build is green, and package-lock resolves
> every dep from registry.npmjs.org, which is why Base44's own cloud build installs 0.8.41 fine.
> Don't "fix" it with `--registry=https://registry.npmjs.org` without asking — the mirror is a
> supply-chain control. (Related: `.npmrc`'s `min-release-age=7` is NOT enforced — npm 11.9.0 reports it
> as `Unknown project config`. Unresolved; owner was told.)
> ⚠️ Base44 serves `index.html` with NO cache-control, so browsers heuristically cache it and keep loading
> the OLD hashed bundle after a deploy. A frontend change that "didn't ship" is usually this — verify with
> `curl -s <app-url> | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js'` against local `dist/` before debugging code.
> ⚠️ Reminder: `base44 deploy` is required after ANY change to base44/functions/** (sync deploys entities+site only).
> ⚠️ Two-way sync is ACTIVE + confirmed BOTH ways: Base44 pushes commits back — the Builder authored the whole
> `askRules` function + the RulesChat refactor and they arrived as "File changes" commits (Aug 3 2026).
> ALWAYS `git pull --rebase` before push, or you'll be rejected — and re-read files after pulling.
> ⚠️ Rules knowledge has ONE source: `docs/whist-rules.md` → `npm run rules:gen` → askRules/entry.ts.
> Never hand-edit `RULES_DOC`; `npm run rules:check` fails on drift (incl. drift pushed back by the Builder).
>
> ⚠️ This repo two-way-syncs with Base44: edits made in the Base44 Builder land here as commits — pull
> before starting a session, and keep changes here in sync (push after committing).

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

## Backlog

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
