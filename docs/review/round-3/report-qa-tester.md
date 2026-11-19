# QA tester — round 3

## Who I was and what I tried
I was a methodical QA tester using three browsers at once: Maya (group admin), Dan (player, and admin of the archived Old Crew), and Nir/Omer/root in turn.
- Signed out: deep links, sign-up edges, wrong password, a full password reset including reusing the link, and an unknown address.
- Groups: create (Hebrew, emoji, long names), join (dead code, lower-case code, 10 wrong codes, a duplicate name), claim, leave.
- Group admin: add, rename, role changes, remove, detach, regenerate the code, archive, delete. Dan's access was checked through the UI, direct URLs and raw API writes.
- Rounds: bids totalling 13, bids of 0 and 13, tricks not totalling 13, triple-tapped saves, reload and Back, two phones on one round, closing a session with a round in play, a round limit of 1, edits and deletes.
- Notes (500 characters, Hebrew, anonymous, admin delete), the app admin (purge, role), 320 px and desktop.

## What works well (keep these)
- **Permissions hold.** The server refused every admin write I tried as a player:
  - entity PUT/DELETE: "Permission denied: you may not update this Group"
  - updateGroupSettings, updateMemberRole and regenerateInviteCode returned 403 even from a stale admin page
  - "Only app admins can change a role"
  - direct `?edit=1` shows "Only a group admin can change a scored round."
- **Signed out, deep links come back to the page after login** (`from_url`), including for /admin.
- **Conflicts on a new round are handled very well.**
  - Triple-tapping Save gave one save and two 409s.
  - A second phone saving the same round shows "Already saved from another phone — here is what was saved. What you typed on this phone was not used."
  - Saving after the session was closed was refused cleanly.
- **Bid rules are enforced live.** The bid that would make 13 is disabled with a reason, also when you change an earlier bid. Tricks must total 13 ("Tricks must total 13 — now 14").
- **Scores checked by hand are right:**
  - 13 made = +179; zeros on an up table = +25; everyone falls = 0
  - progressive misses; session and profile totals; round counts summing to 4 × rounds
  - all-groups totals after a group was deleted
- **Invite codes are solid.** The old code dies after a regenerate. Lower-case is accepted. After 10 wrong codes: "Too many attempts. Please try again in a few minutes."
- **Duplicate names are refused** case-insensitively and trimmed, in add, rename and join.
- **Archived groups are clearly read-only**, even through the /round/new URL.
- **Destructive actions ask for the right confirmation:** typing the exact name to delete or purge, and closing a session warns that the round in play will be discarded.
- **Reset links work once and say so.** Unsaved bids survive a reload ("Restored: 4 bids.").
- **No console errors or exceptions** in any session.
- **320 px and desktop layouts held up** on every screen I shot.

## Findings (most serious first)
1. **Blocker – two admins editing the same scored round: the later save silently overwrites the earlier one** (qa-tester-1, shots/edit-overwrite.png).
   - Dan saved Maya 2 / Dan 4 / Rachel 2 / נועה 5. Then Maya saved from her stale form.
   - Dan's edit vanished, including rows Maya never touched, and the closed session's final standings changed. No warning, no 409.
   - The new-round flow already detects this conflict; the edit flow does not.
2. **Major – a detached player gets no explanation** (qa-tester-2, shots/omer-nogroups.png). Omer just sees "No groups yet" and no activity.
3. **Minor – a round page doesn't say its scoring method.** A progressive "-15" looks wrong next to help that starts with "Classic −10" (qa-tester-3).
4. **Minor – notes linked to a session don't appear on that session** (qa-tester-4).
5. **Minor – "Round limit reached — 2 of 1 rounds counted."** after an edit (qa-tester-5).
6. **Minor – a demoted admin's stale admin page keeps its controls**, and the 403 toasts stack up (qa-tester-6).
7. **Minor – the discarded-round message says "Another player discarded it"** when the admin actually closed the session (qa-tester-7).
8. **Minor – Hebrew and emoji group names break the reading order** in English sentences (qa-tester-8).

## Verdict
PUBLISH: yes, after fixes
1. Add a version check to scored-round edits, so a stale form can't overwrite a newer save (qa-tester-1).
2. Tell a detached or removed player what happened on their next visit (qa-tester-2).
3. Show the scoring method on the round page and open the help at that method (qa-tester-3).
