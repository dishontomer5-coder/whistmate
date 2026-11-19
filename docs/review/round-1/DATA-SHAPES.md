# Data the pages can use (from the stats implementer — already merged into main)

## `buildStandings(rows, nameById = {}, { sessions = [], deltaSessionId } = {})` — `src/lib/standings.js`
Rows, best total first:
```
{ player_id, player_name, total_score, avg_score, rounds_played,
  rank,                 // tied players share a rank: 1, 2, 2, 4
  gap_to_leader,
  wins, podiums, sessions_played,   // CLOSED sessions only
  win_ratio,            // null when no closed session
  leading,              // first (or level first) in an OPEN session
  session_delta,        // null if the player did not score in delta_session
  delta_session }       // { id, name, status } | null — the open session if it has scored rounds, else the last closed one; null inside a single session's own standings
```
`sessions` are the Session records; a session not listed, or not `closed`, gives no win.

## `computeAwardLeaders(rows, rounds = [], nameById = {})`
`{ greedy, coward, destroyer }`, each `{ value, holders: [{ player_id, name }] }` (every tied holder) or `null` when nobody has earned it. The second argument is the Game records.

## `computePlayerStats` (backend function) response
```
{ player,
  performance: { total_score, avg_score, rounds_played, sessions_played /* closed */, sessions_open, wins, podiums, win_ratio|null },
  strategy: { contract_accuracy|null, made_count, zero_bids, zero_bid_success, zero_bid_success_rate|null, bid_aggressiveness },
  awards: { greedy_loss, coward_loss, destroyer_count, held: ['greedy'|'coward'|'destroyer', …] },
  group_awards: { greedy, coward, destroyer },          // same shape as computeAwardLeaders
  sessions: [{ session_id, name, session_date, status, total, rank, players }],   // newest first
  best_session, worst_session,                           // entries of `sessions`, closed only; null when none
  timeline: [{ date, session_id, session_name, round_number, points, cumulative }] }
```
`computeGlobalStats`: same `performance` and `strategy`; `sessions` entries also carry `group_id` and `group_name`; no `awards.held`.

## `getGroupData` scope `player`
```
{ player, results /* latest 200 scored rows, newest first */, rounds,
  sessions: { [session_id]: { id, name, session_date, status } },
  total_rows, limit: 200 }
```
Other scopes are unchanged: `group` → `{ sessions, rounds, results }`, `session` → `{ session, rounds, results }`,
`round` → `{ round, session, results }`, `shared_sessions` → `{ sessions }`.

## Server behaviour the screens will now meet
- A group that is not active is read-only: every write function answers 403 `This group is archived — it is read-only` (deleted → 404 `Group not found`). Exceptions: un-archiving, leaving the group yourself, app-admin tools.
- `setGroupStatus`: archiving with an open session → 409 `Close the open session first`.
- `deleteRound`: any member may delete a round that is not yet scored (bidding / playing); a scored round needs a group admin (403 `Only a group admin can delete a scored round`).
- `startSession` accepts `game_limit` (1–99 or absent); name and place at most 60 characters; `session_date` a real `YYYY-MM-DD` between 2000 and 2100 (400 with a clear message otherwise). When the date is absent the server uses the UTC day — the form must always send the scorer's local date.
- `startRound` numbers a round highest-existing + 1.
- Player names are unique in a group regardless of case and surrounding spaces (add player, join as new, rename) — the existing duplicate-name message.
- `removeMember` on yourself = leave the group (allowed in an archived group too); the last admin with an account cannot leave/demote.
- `getActivityFeed`: the caller's own signed notes never count as unseen.
- Unknown ids answer 404 with `Session not found` / `Round not found` / `Member not found in this group` / `Group not found`.

## Still wrong on the pages (for their owners)
- `PlayerProfile.jsx` slices the history to 50 rows with no "Show more" (`total_rows`, `limit`, `sessions` are there to use).
- `EMPTY_STATS` in `Profile`, `PlayerProfile`, `GlobalProfile` hold `0` for the three rates; they should be `null`.
- `StatGrid` shows "N sessions" under Rounds — now closed sessions only (`sessions_open` is available).
- `Leaderboard` prints "0 wins" on every row of an open session's standings; use `leading`. The Home legend "▲ this session" should use `delta_session`.
- `ScoreChart` labels points "Game N"; `timeline[].session_name` is available.
