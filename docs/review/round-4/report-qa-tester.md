# QA tester — review round 4

## Who I was and what I tried
Methodical breaker, three browsers at once (q4 = Maya, q4-b = Dan / Noa / Root, q4-c = new user / Gal / Root), plus direct calls to the app's own API with each user's token.
Signed out: deep links, login, sign-up checks, password reset (incl. reusing the link), unknown URL. Groups: create (blank, 300-char Hebrew+emoji), add players (duplicates, triple-tap, 5 parallel calls), invite codes (regenerate, old link, lower case, brute force), claim race.
Sessions/rounds: limit 1, limit −5/0/1.5, fewer/more than 4 players, bids totalling 13, 0 and 13, progressive with 5 and 7 off, failed zero, double taps, reload/back, discard/close/delete while another phone is entering.
Two at once: two phones saving the same round, two admins editing, demoting each other, renaming, deleting a group under a member, app admins demoting each other, archive with a round in play.
Permissions: every write as Dan (player), Noa (other-group admin), Newbie (no group), in an archived group. Small (320) and desktop.

## What works well (keep these)
- Permissions hold everywhere I pushed: every direct write as a player, a different group's admin or an outsider was refused (403 for Game/Session/Group/RoundResult/GroupMember/User writes, updateRound, updateMemberRole, deleteNote, getGroupMembers of another group; archived group refuses addGhostMember/createNote/updateMemberRole). Non-members deep-linking to a session get "That page isn't available — you're not in its group."
- Round concurrency is excellent: second phone saving the same round → "Already saved from another phone — here is what was saved"; stale edit → "This round was changed on another phone. It has been reloaded"; saving into a discarded round or a closed session → a clear "This round was discarded — nothing to save" page.
- Races resolve to sane state: claiming the same player from two phones (one wins, the other's list drops that name), two admins demoting each other (one admin always remains, also for app admins), 5 parallel adds of the same name (one created), double-tap Start round (one round).
- Scores checked by hand are right: classic made bids (bid²+10), −10 per trick; progressive −50 for 5 off, −140 for 7 off; zero +25 up / +50 down; failed zero per the stated rule; standings, ties (three #1s) and all-groups totals add up.
- Guards: bids can't total 13 ("0 is blocked — the bids can't total 13"), round limit reached page, archive blocked while a session is open, a player in a round in play can't be removed, last admin can't change own role, typed-name confirmation for delete/purge, rate limit on invite codes (429 after a few wrong tries), reset link works once with a clear message, deep link → login → back to the page.
- Layout holds at 320 px and desktop; 500-char unbroken Hebrew note wraps.

## Findings (most serious first)
No blockers found.

1. **major — qa-tester-1** Two phones start a round at once: the second phone is dropped into the other phone's round (different four players) with no notice. `shots/start-round-race.png`
2. **major — qa-tester-2** An anonymous note can never be deleted by its author (no button; API 403), and the toggle doesn't warn. `shots/anon-note-no-delete.png`
3. **major — qa-tester-3** Admin deletes a group: a member inside it is stuck on "Group not found / Try again"; after reload the group and its points vanish from Groups with no notice. `shots/deleted-group-stuck.png`
4. minor — qa-tester-4 Concurrent renames: last save wins silently; first admin still sees "Renamed to Yossi."
5. minor — qa-tester-5 Editing a round another admin deleted: bare "Round not found", Save stays enabled. `shots/edit-deleted-round.png`
6. minor — qa-tester-6 Demoted admin keeps a full admin page; actions fail one by one. `shots/stale-admin-after-demote.png`
7. minor — qa-tester-7 App-admin Archive confirms, then says "Close the open session first".
8. minor — qa-tester-8 Same-instant double Lock bids → false "changed on another phone" message. `shots/double-lock-bids.png`
9. minor — qa-tester-9 App admins demoting each other: loser sees "Permission denied: you may not update this User".
10. minor — qa-tester-10 Same-table shortcut has three labels.
11. idea — qa-tester-11 No Leave group / delete account in the app.

## Verdict
PUBLISH: yes, after fixes
1. Tell the second phone when it lands in a round someone else started with a different table.
2. Let authors delete their anonymous notes (or warn before posting).
3. Handle a deleted active group: clear message, then a one-time notice on Groups.
