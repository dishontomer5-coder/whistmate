# WhistMate review, round 2: the Whist player (rules arbiter)

## Who I was and what I tried
I'm a long-time Israeli Whist player, signed in as Maya (group admin of Thursday Whist), mostly at phone width with a check at desktop and small widths.
I finished the open "Midweek special" (Classic), then started a new Progressive + Advanced session with a Hebrew name and place and a 5-round limit. Between them I played 11 scored rounds, which cover every scoring branch in the rulebook.
I checked every number against `docs/whist-rules.md`. I also checked the stats and awards by hand, edited a round in a closed session, and discarded and restored draft rounds.
I typed Hebrew into a session name, a place, a note and a new player name ("רונית ב."), and checked how it displays.
I used the in-app rules chat (the answers there are simulated) and judged the real transcript against the rulebook.

## Scoring audit: every branch matches the rulebook (0 differences)
| # | Session / round | Bids → tricks | App showed | Rulebook gives |
|---|---|---|---|---|
| 1 | Classic, UP 14 | יוסי 4→4, Maya 3→3 + renege, Dan 2→1, נועה 5→5 | +26, **−81**, −10, +35 | 26, 19−100=−81, −10, 35 ✓ |
| 2 | Classic, UP 15 | Maya 7→7, Dan 0→3, נועה 6→2, יוסי 2→1 | +59, −30, −40, −10 | 59, −50+20=−30, −40, −10 ✓ |
| 3 | Classic, UP 15, everyone falls + renege | Dan 5→4, נועה 4→5, יוסי 3→2 (renege), Maya 3→2 | 0, 0, −100, 0 | 0, 0, −100, 0 ✓ |
| 4 | Progressive, DOWN 12 | Maya 0→0, Dan 6→1 (5 off), אבי 1→7 (6 off), Rachel 5→5 | +50, −50, −90, +35 | 50, −50, −90, 35 ✓ |
| 5 | Progressive, UP 14 | Dan 9→0 (9 off), אבי 0→1, Rachel 5→12 (7 off), Maya 0→0 | −180, −50, −140, +25 | −180, −50, −140, 25 ✓ |
| 6 | Progressive, UP 14 | אבי 2→3, Rachel 4→4, Maya 3→0, Dan 5→6 | −5, +26, −15, −5 | ✓ |
| 7 | Progressive, UP 14, everyone falls (tie on top bid) | Rachel 5→4, Maya 5→6, Dan 2→3, אבי 2→0 | 0 ×4 | ✓ (and not counted toward the round limit: "3 counted") |
| 8 | Progressive, UP 14 | Maya 13→13, Dan 0→0, אבי 0→0, Rachel 1→0 | +179, +25, +25, −5 | ✓ (0 was blocked for the last bidder after 13,0,0) |
| 9 | Progressive, DOWN 12, renege on a made bid | Dan 4→4 + renege, אבי 3→3, נועה 2→2, Maya 3→4 | −74, +19, +14, −5 | 26−100=−74 ✓ |
Session totals, averages (an everyone-falls round counts as a round played), group totals, "tonight" deltas, wins, and The Greedy / The Coward / The Destroyer all moved exactly as I worked them out by hand (for example, Dan's Greedy total went from −610 to −840 = −50 − 180).

## What works well (keep these)
- **Scoring is right in every branch**, including the edge cases (failed zero, 7+ progressive, a made 13, a renege inside everyone-falls). The running "bid 5 · 4 off −40" line under each player shows the score before you save, and that gives a scorekeeper confidence.
- **The rule that the bids can't total 13 is handled well.** The blocked number is disabled and the reason is spelled out: "0 is blocked — the bids can't total 13". It follows whoever actually bids last, wrapping around the seats: when I started the bidding at seat 3, seat 2 was the one blocked.
- **Pick the table in seat order, the first bidder rotates, "Same table — Dan bids first", draft bids come back after leaving ("Restored: 3 bids.")**: this matches the table well. A fifth player sitting out works by picking a different four.
- The **"How scoring works" sheet is excellent**: it is accurate, its worked examples check out (bids 5,4,3,3 / tricks 4,5,2,2; "after 4,3,4 the fourth can't bid 2"), it gives the reason for +50 vs +25 on a zero, and it explains renege and suit rank. The UP/DOWN chips are buttons that open it.
- The **stat cards have plain definitions**. For example, "Rounds where everyone fell and this player was the top bidder: the trump winner, or the highest bid when no trump winner was marked." Avg/round (1798/142 = 12.66) and win rate (10/15 = 67%) are correct.
- **Hebrew displays correctly everywhere I looked**: the session title, the place (isolated `dir=auto`), "1. רונית ב." in the bidding rows, standings, notes that mix Hebrew, English and numbers, and the session picker in the note dialog.
- The transcript of real assistant answers is **correct on every rules question** (strongest suit, zero bid, progressive miss of 5 = −50, the 13-total ban, 5♠ vs 5♥, renege inside everyone-falls, a made 7 = 59, a miss of 2 in both schemes).

## Findings, most serious first
1. **(major) In Advanced rules, a tie on the top bid automatically marks the first-seated player as trump winner.** With Rachel 5 (seat 1) and Maya 5 (seat 2), the screen said "Trump won by Rachel" before anyone chose. The rulebook says "the suit decides it, not who spoke first" and "the app cannot work out who won the auction on its own". This records the wrong winner unless someone notices, and The Destroyer award depends on it. (shots/021-tie-autopick.png)
2. **(minor) The trump winner can be anyone, including a player who bid 0.** In a non-Advanced session I marked Dan (bid 0) as trump winner, with clubs, while Maya bid 7. There was no warning. (shots/007-trump-dan-zero.png)
3. **(minor) The result line says "made −81" for a made bid with a renege.** The renege is not shown in the line itself. The same applies to "1 off −100" in an everyone-falls round and "made −74". (shots/004-round4-filled.png, shots/009-ef-renege.png)
4. **(minor) A failed zero reads "bid 0 · 3 off −30" and "1 off −50".** "Off" suggests the per-trick miss scale, but a failed zero is −50 then +10 back for each trick after the first. (shots/008-round5-filled.png)
5. **(minor) Editing a round in a closed session can change the winner with no warning.** Removing a renege in "Midweek special" moved the win from נועה to Maya: wins went 9→11 for Maya (counting the session I had just closed) and 4→3 for נועה. Nothing said "this session is closed, this changes who won". (shots/036-standings-after-flip.png)
6. **(minor) "Enter the tricks — 3 to go" appears next to "13 / 13 tricks".** "To go" counts players, while the badge counts tricks. Also, once all 13 tricks are given out, the rest could be filled with 0. (shots/023-togo-confusion.png)
7. **(minor) The card-order names differ between the app and the rules assistant.** The app says "Ace high" / "Ace high, then 2 up to King"; the rulebook and assistant say Standard / Down-Up. The help sheet also says the trump winner chooses the order "for that round", while the rulebook calls it a session setting.
8. **(minor) The phone session standings hide how many rounds each player played.** A fifth player who played 1 round (נועה +14) ranks #2 above players with 5–6 rounds. Desktop shows "· 1 round"; phone doesn't. (shots/024-prog-session.png vs shots/033-desktop-session.png)
9. **(minor) The sessions list says "1 round" for an open session that has only a bidding draft.** The session page says "No scores yet". (shots/037-history-hebrew.png)
10. **(minor) "Trump No trump · Dan" reads awkwardly.** "No trump · Dan" would be clearer.
11. **(minor) Discard round (a redeal) throws away the table.** Starting again means picking the same four players and seat order again, which is the common case after a redeal.
12. **(minor) The rules assistant: in the transcript, the Hebrew question was answered in English, and the refusal line is "IDK bro 🤷".** The welcome line says "Ask in any language". The in-app (simulated) refusal still shows "IDK bro 🤷", which is flippant for an arbiter, although its "Open About & privacy" link is helpful. (shots/032-rules-long.png)
13. **(idea) Who deals is not shown.** The app rotates who bids first but never names the dealer. A real table would like "Dealer: X", and a "redeal (same dealer)" button.

## Verdict
PUBLISH: yes, after fixes. Top three changes:
1. Don't pre-mark a trump winner when two players tie on the top bid; ask for one. Warn when the marked winner isn't among the top bidders.
2. Spell out the renege and failed-zero math in the result line (for example "made +19 · renege −100 = −81", "zero failed: −50 +20 = −30").
3. Warn before an edit changes a closed session's result, and show rounds played in the phone session standings.
