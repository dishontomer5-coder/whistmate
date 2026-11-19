# Newcomer review — round 2

## Who I was and what I tried
A whist player who got a link from a friend, on a phone, with no one explaining the app. Working signed out, I read the landing and About pages. Then I signed up as lior.newbie@example.org, created "Sunday Spades", added Gal, Noam and Shira (no accounts) and found the invite link. I played round 1 (a down table, NT, one missed bid) and round 2 (everyone fell), then closed the session. I signed out, joined "Thursday Whist" as a new user through `/join?code=NHUA1B` and claimed the player יוסי. In a second browser an existing account claimed Gal through my own invite link. Last, I reset my password from "Forgot password?". Mostly at phone size; I also checked 320px and desktop.

## What works well (keep these)
- The landing page says what the app is in one screen. About is plain and honest: who makes it, a contact e-mail, what is stored and where, "no ads and no third-party trackers", no permissions asked (shots/002-about.png).
- The empty home ("No groups yet … Create a group … or join with an invite code") and the new-group card "Three steps to your first round" took me from zero to round 1 without guessing. It counts players ("Add players (1 of 4)") and explains a session as "one night of whist" (shots/006-group-new.png).
- "Add player" says what an unclaimed player is ("they do not need an account … claim this player and keep its history"). The Admin page explains Claimed and Unclaimed.
- Round entry is excellent. "Tap the 4 players in the order they sit", big number pads, a live UP/DOWN chip, "3 is blocked — the bids can't total 13", "Tricks must total 13 — now 14" with Save disabled, live per-row scoring ("bid 5 · made +35"), and an everyone-falls banner (shots/014, 016, 018, 036). The scores matched the rules shown in the help: 5 made = +35, 2 made = +14, 1 off = −10.
- "How scoring works" is clear, with worked examples. It also opens from the UP/DOWN chip and from "What is a renege?".
- Claiming is clear. The question "Has the group been keeping score for you? Pick your name and its rounds and scores become yours" is followed by a confirmation that also says how to undo a wrong pick (shots/027-claim.png, 029-joined.png). After the claim, יוסי's 71 rounds became mine.
- The password reset is complete and reassuring. Its message doesn't reveal whether an account exists ("If … has an account"), it says the link "can be used once", and the login page then shows "Password changed" (shots/032, 033, 034).
- Leaving a group as its only admin is blocked with a clear reason. Closing a session asks for confirmation and warns that it "cannot be reopened".
- No console errors. The only failed requests were the expected 401s while signed out and the 400s from my deliberately wrong passwords.

## Findings (most serious first)
1. **major — the standings numbers are never explained.** Standings shows "+35 avg", "21 behind", "9 wins" and awards ("The Coward"). The "?" on Standings opens only the round-scoring help (sections: Making/Missing your bid, Bidding zero, Up and down tables, Everyone falls, Renege, Trump and card order). Nothing says what "avg" is an average of, what a "win" is, or how awards are chosen. I only learned "AVG / ROUND" on a player page and "0 wins in 7 sessions" on a profile. (shots/021-standings.png, 030-tw-standings.png)
2. **minor — the "Players" tab opens my own profile, not a list of players.** Its heading is "Player | Lior (you)", with a "Switch player" dropdown. I expected a roster. (Players tab listing)
3. **minor — an invite link with only a code doesn't name the group.** `/join?code=NHUA1B` shows "You're invited to join a whist group". A link carrying `&name=` shows "Sunday Spades". The group name appears only after sign-up (shots/026-join-signedout.png).
4. **minor — my account has no name.** Sign-up never asks for one. "Me" shows "# lior.newbie" (from my e-mail address) while the group calls me "Lior", and the menu shows only the e-mail.
5. **minor — group admins see members' e-mail addresses, and About doesn't say so.** Admin › Members shows "Gal | Claimed / yossi.new@example.net" once someone claims. About lists the account e-mail under "Your account" but doesn't mention that group admins can see it.
6. **minor — "Renege −100" sits on every results row next to the tricks.** It is a one-tap −100 control beside the field you tap most, and a beginner can hit it by mistake (shots/017-tricks.png).
7. **minor — the trump winner's bid isn't checked.** After I marked Lior as the trump winner (NT), a bid of 2 was accepted ("1. Lior | 2 | NT") with no hint about a winning-bid minimum or how the trump winner's bid relates to the others'. A newcomer who isn't sure of the rule gets no guard. (I fixed it before locking.)
8. **minor — "avg" differs between screens.** Standings shows "+2.7 avg" for יוסי, and his profile shows "AVG / ROUND +2.66". After an everyone-fell round my avg dropped from +35 to +17.5, so cancelled rounds count toward the average. That surprised me, since the help says a cancelled round "doesn't count toward the round limit".
9. **minor — the wording is inconsistent in places:**
   - The Create group dialog says "You'll pick the scoring rules when you start each session", but Admin has a "Default scoring method".
   - The toast says "you can score rounds for it now, and its owner claims it": "it" for a person.
   - Negative scores use a hyphen ("-10") while the help uses a minus sign ("−10").
   - The About back link reads "← Groups" when signed out, yet it goes to the landing page.
10. **minor — at 320px the round screen opens scrolled down,** hiding the "Bidding · Round 2" header. The "TRUMP WINNER (OPTIONAL)" label is clipped under the top bar (shots/035-small-bidding.png).
11. **idea — tell the admin when a player is claimed.** Gal was claimed by another account and Activity still said "No activity yet". Nothing told me which of my unclaimed players had become real people.
12. **idea — show a little history next to each name in the claim picker** (e.g. "71 rounds, last played Aug 27"). It would help people pick the right name, especially where two names look alike.

## Verdict
PUBLISH: yes, after fixes
Top three changes:
1. Explain the standings: avg (per round), wins (sessions won), "behind", and how awards are chosen, through the Standings "?".
2. Make the Players tab a roster of the group, or rename it.
3. Show the group name on every invite page, and ask for a display name at sign-up so "Me" doesn't use the e-mail prefix.
