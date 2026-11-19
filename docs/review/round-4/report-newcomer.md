# Newcomer review — round 4

## Who I was and what I tried
A whist player who got a link from a friend and has never used a scorekeeping app, on a phone (390x844; also checked 320x568 and desktop).
Opened the sandbox signed out, read the landing and About pages, and created lior.r4new@example.com (tried a short password and a mismatched confirmation first).
Created "Lior's Table", added Avi, Ben and Carmel (also tried a duplicate "avi "), found the invite link, opened a session and played round 1 to the score sheet, then read "How scoring works".
Signed out, opened /join?code=NHUA1B as a new person (yossi.r4new@example.com), signed up and claimed the existing player יוסי.
Reset Lior's password through Forgot password, reused the link, and logged in with the old and then the new password.

## What works well (keep these)
- The landing page says in three lines what the app is. About explains who makes it, how to reach them, and what data goes where, in plain words (001, about text).
- Sign-up errors are inline and clear: "Use at least 8 characters.", "The two passwords are not the same."
- The empty state on the Groups page and the "Three steps to your first round" card after creating a group guided every step, including "(4 of 4)" progress (003, 005, 009).
- Add player explains unclaimed players before you meet the word. Adding a duplicate name gives a clear error ("A member named "avi" already exists in this group").
- Round entry is excellent. "Tap the 4 players in the order they sit — the first one bids first". The forbidden 13th bid is greyed out with the reason ("4 is blocked — the bids can't total 13"). DOWN · 12 shows live, and scores preview per player as you type tricks (014–018).
- "How scoring works" is complete and has examples. It covers made bids, misses, zeros, up/down, everyone falls, renege, trump, the standings and the awards (019).
- The invite flow carries you through sign-up ("One more step to join the group"). The claim dialog ("Has the group been keeping score for you? Pick your name…") and the confirmation ("Every round and score recorded for יוסי is now yours", plus how to undo a wrong choice) make claiming clear (027–029).
- Password reset is neutral about whether an account exists, says the link works once, and the old password really stops working.
- No console errors. The only failed requests were the expected 401 while signed out, the 409 for the duplicate name, and the 400s for a used reset link and a wrong password.

## Findings (most serious first)
I found no blockers or majors. All findings are minor polish, plus one idea.
1. Me page names you by the start of your e-mail address ("lior.r4new", "yossi.r4new"), not the player name you chose or claimed. There is no place to set an account name. (b-004-me.png, 031-yossi-me.png)
2. A used reset link still shows the full new-password form. You learn it is dead only after typing the new password twice. (b-003-reused-token.png)
3. Two words for one state: Admin says "Unclaimed" and the Players tab says "no account". The confirmation toast calls a person "it" ("you can score rounds for it now"). (008-toasts.png, 023-players.png)
4. Tapping "Trump" swaps the bid keypad for a suit picker. My next number tap missed, and I had to work out how to get the numbers back. (015-bids-entered.png)
5. On a small phone (320x568), the bidding screen shows only 2 of the 4 player rows above the keypad. (b-005-small-bidding.png)
6. A code-only invite link (/join?code=…) says "You're invited to join a whist group" without the group's name until after sign-up. (The link copied from Admin does add &name=.) (025-join-signedout.png)
7. Adding three players stacks three long "Added. … is an unclaimed player…" toasts over the member list. (008-toasts.png)
8. The New session screen mentions card orders ("Ace high, then 2 up to King") with no explanation there. A newcomer does not know what this is. It is explained only inside "How scoring works". (010-new-session.png)
9. Idea: in the claim dialog, show each player's history (rounds, last played) so a joiner picks the right name when names are similar.

## Verdict
PUBLISH: yes
Top three changes:
1. Show the player name on Me (or let people set an account name) instead of the e-mail prefix.
2. Check a reset link when the page opens and say at once if it was already used.
3. Use one word for unclaimed/no-account players, and keep the bid keypad reachable when you mark the trump winner.
