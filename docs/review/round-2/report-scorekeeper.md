# Scorekeeper review — round 2 (Maya, admin of Thursday Whist)

**Who / what I tried.** Maya on game night, phone in one hand (phone 390x844; also 375x667 and desktop 1440x900). Resumed "Midweek special" with round 4 in play and entered its results, then played rounds 5–10: up and down tables, the last bidder trying to make 13, zero bids (on a down and an up table), a renege, an "everyone fell" round, trump winner + suit (♠, ♥, ♣, NT), "same table" and a changed table.
Mistakes and recovery: edited locked bids, edited a saved round's tricks, started a round with the wrong four players and discarded it, browser Back mid-round, reload mid-round, left via Groups and came back, and saved the same round from two devices (s2 and s2-b, both Maya).
Closed the session (final standings: Maya +213). Then started "Late game" at "Dan's balcony" with Progressive scoring, Advanced rules and a round limit of 2, and played two rounds until the limit was reached.
Scoring was checked by hand every round (classic, progressive, zero bids +50 down/+25 up, renege −100, everyone fell = 0). It was right every time.

## What works well (keep these)
- **Few taps.** Results for the round already in play took 7 taps from the group home (session card, "Enter the results", 4 trick numbers, Save). A "Same table" round takes 11 taps on 2 screens: Same table, 4 bids, Lock bids, 4 tricks, Save round. A new table adds 5 taps (Start round, 4 players).
- **The keypad moves on by itself** to the next empty player for both bids and tricks. Big 0–13 keys sit in the thumb zone and fit at 375x667 without scrolling (shots/018-small-bids.png, shots/019-small-results.png).
- **The bid that would make 13 is struck out**, with a plain reason: "3 is blocked — the bids can't total 13" (shots/008-bids-last.png). Tricks must total 13: the header pill turns red ("15 / 13 tricks", "Tricks must total 13 — now 15") and Save stays disabled.
- **Live per-player feedback while entering tricks:** "bid 2 · 1 off −10", "bid 5 · made +35". The renege toggle turns red and the score updates (shots/009-renege.png).
- **Recovery is solid.** Reload mid-round kept the tricks ("Restored: tricks for 2 players."). Back went to the session, and "Resume round 5" returned with tricks intact. Leaving through Groups and coming back also restored. "Edit bids" says "the tricks entered are kept". "Edit round" on a saved round recalculated the standings correctly. Discard asks first ("Discard round 6? … Nobody scores anything for it.").
- **The session page answers "what is the score?" between rounds** without leaving it. It shows the last round's breakdown, live standings with "behind" gaps, and an "EVERYONE FELL" badge. "How scoring works" explains every rule clearly, including the cancelled round.
- **Advanced rules:** the trump winner is required. The top bidder is pre-selected as winner, then suit, then card order. The session header shows "Round limit 2 · 1 counted". At the limit it says "Round limit reached — 2 of 2 rounds counted." and offers only Close session.
- **Two devices saving one round:** the second save was refused ("This round has already been scored", http 409). There was no silent overwrite.

## Findings (most serious first)
1. **major — Saving from a second device leaves you stuck and unsure** (shots/016-conflict.png). Device B saved round 7. Device A had a full sheet with different tricks and tapped Save round. It got a red "This round has already been scored", but stayed on the editable sheet with an active Save round button. Nothing showed what was actually saved or offered to open it or to replace it with this version. Unsaved tricks also live only on one device: device B opened the same round at "0 / 13 tricks" while A had 2 entered.
2. **minor — The results sheet is in seat order, but bidding started with the trump winner.** In round 9 Omer won the trump and was the first to bid, but the results sheet started with Dan (seat 1). I typed tricks in the order people had bid, and Omer's 7 landed on Dan, which showed "Omer bid 7 · 7 off −70". The total-13 check caught it only because the sum was wrong.
3. **minor — Corrections don't move on to the next player.** Once every row has a number, tapping keys keeps overwriting the same player. While fixing a 37/13 sheet I typed 3, 4, 3, 3 and all four went to Omer. You have to tap each row first.
4. **minor — "Edit round" is 12px grey text** (58x44 target), hard to read at arm's length on a dark card. Fixing a wrong round is common on game night (shots/020-small-session.png).
5. **minor — Groups list doesn't show a live game.** The Thursday Whist card says only "Admin · 136 rounds" (shots/015-groups.png). Getting back into the round from Groups takes 3 taps: group, session card, "Resume round 7".
6. **minor — Two controls do the same thing on the in-play card.** "Resume round 4" (big yellow) and "Enter the results →" both open /round/e43f… (shots/002-session.png).
7. **minor — The session page's back link changes its name.** The same page shows "← Standings", "← Back" or "← Sessions" depending on how you arrived.
8. **idea — A trump winner can bid below 5** without any hint. A mis-tapped 2 was accepted for Omer as trump winner ("1. Omer 2"). A gentle warning would catch slips.
9. **idea — Changing the four players after starting means discard and re-pick** (Discard, confirm, Start round, 4 players, Start = 8 taps). A "change players" link on step 1 would be quicker.

Errors seen: only the expected 409 from finding 1. No console errors.

## Verdict
PUBLISH: yes
Top three changes: (1) give the "already scored" conflict a way out (show the saved round, offer to open it or replace it); (2) start the results sheet with the first bidder, or label the order clearly; (3) make "Edit round" larger and easier to see.
