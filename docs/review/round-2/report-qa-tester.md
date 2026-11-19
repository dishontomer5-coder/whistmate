# QA tester — review round 2

## Who I was and what I tried
- A methodical QA tester trying to break WhistMate in the sandbox (http://localhost:4706), using three browser sessions (q2 = Maya, group admin; q2-b = Dan, plain player; q2-c = signed out / Nir / Gal / Root).
- Signed-out flows: landing, deep links, 404, login (wrong password), sign-up (mismatch, short, existing e-mail, bad code), password reset (including reusing a link).
- Groups: create (blank, 200-char, Hebrew+emoji), join (11 wrong codes, lower-case, already a member, duplicate name), claim, leave and rejoin, delete. Admin: add, rename, role changes, detach, remove, regenerate code, settings, archive and unarchive. Every admin action was also tried as Dan, both in the UI and by calling the API directly.
- Sessions and rounds: bids totalling 13, bids of 0 and 13, tricks not totalling 13, renege, editing and deleting rounds, two people on the same round, closing with a round in play, a round limit of 1, everyone-falls rounds, double taps, reload and Back.
- Notes (empty, 500+ chars, Hebrew, anonymous, pinned to a session, deleting), app-admin (role changes, purge), the 320 px and desktop sizes, and console/network errors.

## What works well (keep these)
- Permissions hold on the server. As Dan, the entity API returned "Permission denied: you may not update this Group / GroupMember" and so on. The functions returned "Only group admins can regenerate invite codes", "Only a group admin can delete a scored round", "Only a group admin can edit a past round" and "You can only delete your own notes, or notes in a group you admin". A non-member gets "That page isn't available — you're not in its group." /admin and /app-admin show clean "Admins only" / "This page isn't available" screens.
- Concurrency is handled well. Two people saving the same round: the second gets "This round has already been scored" (409). Locking bids on a round another player discarded gives a clear "This round was discarded — nothing to save" screen. A triple-tapped "Start round" makes one round, because the server returns 409 "A round is already in progress".
- Scoring matches the in-app "How scoring works" text in every case I checked: classic and progressive misses, made bids (bid² + 10), zero made up (+25) and down (+50), failed zero (-50 then +10 back for each extra trick), renege (-100), everyone falls (0).
- The bids-can't-total-13 block is clear: "3 — not allowed: the bids can't total 13". Bids survive a reload. "Save round" stays disabled until the tricks total 13.
- Invite security works. After 10 wrong codes: "Too many attempts. Please try again in a few minutes." (429). A regenerated code kills the old one ("Invalid invite code"). Lower-case codes are upper-cased. Duplicate names are refused case-insensitively ("A member named \"dan\" already exists").
- The last admin cannot demote themselves or leave. Archive makes the whole group read-only, both in the UI and on the server ("This group is archived — it is read-only"), and it explains why.
- The deep-link return after login works (/round/... → login → back on /round/...). Reset links are single-use.
- No horizontal overflow at 320 px on any of 13 main screens (scrollWidth equalled 320). The desktop column layout is clean.

## Findings (most serious first)

### 1. A session with no counted rounds declares all four players winners and adds to their win stats (major)
Maya, round limit 1, played one everyone-falls round, then closed the session. The session page says "Dan, Maya, Rachel and נועה won together · 0 … 1 round played · 1 cancelled (everyone fell)". History shows "You won". Rachel's profile went from "WIN RATE 0% 0 wins in 9 sessions" to "WIN RATE 10% 1 win in 10 sessions". Maya went from 9 to 11 wins on Standings. The app's own text says an everyone-falls round "doesn't count", yet four wins came from it. Shots: /private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/qa-tester/shots/005-zero-session-winners.png, /private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/qa-tester/shots/006-small-history.png

### 2. Double-tapping "Post note" posts the note twice (major)
Two taps 120 ms apart on "Post note" created two identical notes, both for a named note ("QA timing test" appears twice after reload) and for an anonymous one. getActivityFeed shows two "QA note: בדיקה anonymous" with created_date 09:07:37.581Z and 09:07:37.582Z. Other submit buttons are protected (create group, add player, start round, save round), so this one stands out. Shot: /private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/qa-tester/shots/004-dup-note.png

### 3. A plain player cannot delete their own anonymous note, and is not warned before posting (minor)
Dan posted "Dan anon test" anonymously. His view of the page has no "Delete note" button for it (0 found), and only an admin can remove it. The post dialog only says "Your name is not stored with the note." Shot: /private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/qa-tester/shots/002-dan-anon-nodelete.png

### 4. Long names without spaces push the page wider than the phone screen (minor)
- A group named "🃏קבוצה xxxx…" (the 60-char cap): the Standings onboarding card overflows and the page becomes 407 px wide on a 390 px phone.
- A 60-char Hebrew session name ("ערב ששש…"): the round page becomes 621 px wide.
- On the app-admin card, the truncated title shows only the x's, so the start of the name is lost.

Shots: /private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/qa-tester/shots/001-longname.png, /private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/qa-tester/shots/003-longsession-round.png, /private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/qa-tester/shots/001-appadmin.png

### 5. A far-future session date is accepted silently and then sorts first everywhere (minor)
A session dated 2030-01-01 was accepted without a warning. It sits at the top of Sessions and the player's round history. App-admin shows the group's last activity as "Jan 1, 2030", and the Standings "tonight" column took that session's name. Shot: /private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/qa-tester/shots/006-small-history.png

### 6. After leaving a group, Back shows a raw error screen under another group's header (minor)
Dan left the group, then pressed Back. He landed on /player/... showing "Couldn't load this player / You are not a member of this group / Try again". Pressing "Try again" switched the header to "OLD CREW ARCHIVED" with an Admin tab. The console logged "AxiosError: Request failed with status code 403" (the same AxiosError appears with 404 on /player/zzz). A non-member opening the same link is redirected cleanly instead. Shot: /private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/qa-tester/shots/003-after-leave-back.png

### 7. When the round limit is reached, the "pick the table" screen still opens (minor)
Opening /session/<id>/round/new after "Round limit reached — 1 of 1 rounds counted" still shows "Pick the table". The limit only shows up after tapping Start ("This session has reached its round limit (1)", 409). Shot: /private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/qa-tester/shots/002-limit-newround.png

### 8. Hebrew names in the bidding list show their seat number on the wrong side (minor)
Seat labels read "1. Maya / 2. Omer" but "אבי .3" and "יוסי .4". Shot: /private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/qa-tester/shots/007-small-bidding.png

### 9. Small form inconsistencies (minor)
- The verification-code field accepts letters (it held "12ab").
- A used reset link shows the new-password form, and only says "This link can't be used" after you submit.
- Create group leaves "Your display name" empty, while Join pre-fills it with the account name.
- The purge dialog mentions "Base44 support", and app-admin says "1 players".

### 10. When the tricks are already decided, the app still asks for each one (idea)
After one player takes 13, the app still asks for each of the others ("Enter the tricks — 3 to go"). Filling in the remaining zeros, or the last player's count, would save taps.

## Verdict
PUBLISH: yes, after fixes
1. Don't count a session with zero counted rounds as a win for anyone, and recheck the existing win stats.
2. Block a second "Post note" tap while the first is saving, or remove duplicates on the server.
3. Wrap long names without spaces (overflow-wrap: anywhere) on the round, standings and admin cards. Also handle a non-member landing on a group page after Back the same way as a non-member deep link.
