# WhistMate review, round 4: the Whist player (sessions wp4 / wp4-b)

## Who I was and what I tried
I played as the person at the table who knows the rules, signed in as Maya (admin of Thursday Whist). The rulebook was docs/whist-rules.md.
I finished the seeded round in play and played four more rounds in the open Classic session, then edited one of them. I closed that session and played a Progressive + Advanced session with a Hebrew name, a round limit of 5 and an everyone-falls round. I then started a third session with a new Hebrew player, "שלומי 2".
Between them those rounds hit every scoring branch the brief asks for. I also checked one player's stats by hand against the round history, posted a Hebrew note, added a Hebrew player, used the rules chat and read the real-answer transcript.
About 165 browser commands, phone preset mostly, desktop once. `errors` reported nothing: "no console errors, exceptions, failed requests or dialogs".

## Scoring: every branch, app vs rulebook (no differences)
| # | Session / round | Bids (total) | Tricks | App showed | Rulebook gives |
|---|---|---|---|---|---|
| 1 | Midweek R4, Classic, UP 14 | נועה 5, יוסי 4, Maya 3, Dan 2 | 5, 2, 3, 3 | +35, -20, **-81** (made 3 + renege), -10 | 5²+10=35; 2 off=-20; 19-100=-81; 1 off=-10 |
| 2 | Midweek R5, UP 14, everyone falls + renege | Maya 4, Dan 4, נועה 3, יוסי 3 | 5, 3, 4, 1 | 0, **-100**, 0, 0, "Everyone fell" | §4.4 + §4.5: all 0, the reneger -100 |
| 3 | Midweek R6, DOWN 9, two failed zeros | Dan 0, נועה 0, יוסי 5, Maya 4 | 1, 3, 5, 4 | **-50, -30**, +35, +26 | -50; -50+10×2=-30; 35; 26 |
| 4 | Midweek R7, UP 14, made zero | נועה 0, יוסי 5, Maya 5, Dan 4 | 0, 5, 3, 5 | **+25**, +35, -20, -10 | +25 on an up table |
| 5 | Midweek R8, DOWN 11, made zero, classic 5-off | יוסי 0, Maya 7, Dan 3, נועה 1 | 0, 2, 5, 6 | **+50**, -50, -20, -50 | +50 on a down table; -10×5 |
| 5e | R8 edited, Maya's bid 7→10, now UP 14 | 0, 10, 3, 1 | same | zero re-scored **+25**, Maya -80 | +25; 8 off = -80 |
| 6 | Progressive R1, DOWN 10 | Maya 6, אבי 1, Rachel 3, Omer 0 | 5, 6, 2, 0 | **-5, -50**, -5, +50 | 1 off -5; 5 off -10×5=-50 |
| 7 | Progressive R2, UP 16 | אבי 8, Rachel 0, Omer 7, Maya 1 | 2, 0, 0, 11 | **-90**, +25, **-140, -200** | 6 off -15×6; 7 off -20×7; 10 off -20×10 |
| 8 | Progressive R3, UP 14, NT | Rachel 13, Omer 0, Maya 0, אבי 1 | 13, 0, 0, 0 | **+179**, **-75** (made zero + renege), +25, -5 | 13²+10=179; 25-100=-75 |
| 9 | Progressive R4, DOWN 12, everyone falls | 3, 3, 3, 3 | 4, 4, 4, 1 | 0, 0, 0, 0; "Round limit 5 · 3 counted" | §4.4: cancelled, does not count toward the limit |
| 10 | Progressive R5 / R6 | 5,2,4,4 / 4,4,4,4 | 1,2,4,6 / 4,4,4,1 | -20 (4 off), +14, +26, -10 / +26×3, -15 | correct |
| 11 | New session R1, UP 14 | שלומי 2 2, יוסי 11, נועה 0, אבי 1 | 2, 11, 0, 0 | +14, **+131**, +25, -10 | 11²+10=131 |

The session totals, averages, "behind" figures, the tie (two players at #2) and the all-time standings all added up. Maya's +1586 became +1257, which is 1586 - 35 + (-120) + (-174).
The 13 block is applied to whoever bids last ("2 is blocked — the bids can't total 13"), including when the table starts bidding from the third seat.
**Hand check of stats** (Maya in Family Table, all 20 rounds listed): contract accuracy 11 of 20; points lost taking too few = -5-50-5-10-5 = -75; points lost taking too many = -10-15-15 = -40; average bid 72/20 = 3.6; total +110. All of these match the profile and the awards. The Destroyer went from 2 to 4 after my two everyone-falls rounds with Maya as trump winner, which is also correct.

## What works well (keep these)
- **Scores are right on every branch**, and the results screen previews each line as you type ("bid 3 · made +19 − 100 renege = −81", "zero bid failed (3 tricks) −30", "everyone fell 0 − 100 renege = −100"). An arbiter can check the arithmetic before saving.
- **The 13 rule** is enforced by disabling the one forbidden number, with the reason on screen.
- **UP / DOWN is shown** as a badge ("▲ UP · 14") with a "How scoring works" link. Editing the bids re-scores a made zero from +50 to +25 when the table flips.
- **Trump is handled well.** A tie on the top bid asks "Tie on the top bid — tap who won the auction". A single top bidder is pre-marked as trump winner in Advanced sessions. The card order is offered when Advanced rules are on.
- **The flow fits a real table.** The order is: pick four in seat order, then bids, then trump, then results. "Same table — X bids first" rotates the seat each round, "Same players as last round" handles a fifth player sitting out, and after a discard the button reads "Redeal — same table, יוסי bids first".
- **The round limit** correctly leaves out the everyone-falls round ("Round limit reached — 5 of 5 rounds counted" after six rounds).
- **The "How scoring works" help is accurate and rulebook-faithful**, with correct worked examples, including "Bid 8, took 2 (6 off): −60 with Classic, −90 with Progressive". Every stat tile has a definition when tapped.
- **Hebrew displays correctly** in lists, session names, standings, the session card, notes mixed with English and ♠ (shots/025-note-heb.png), and the profile header.
- **The real assistant answers in the transcript are all correct** against the rulebook: 0-bid, everyone falls, progressive miss of 5 = -50, the 5♥ vs 5♠ question, renege inside everyone falls, made 7 = 59, and bid 4 took 6 = -20 Classic / -10 Progressive. They are clear and short. The Hebrew question got a correct answer, but in English. The refusal "IDK bro 🤷" is flippant, but the transcript predates the prompt change, so I did not count it.

## Findings (most serious first)
1. **MAJOR: The results screen lists the players in a different order than the bidding screen and the session card.** The results list starts from the trump winner, so tricks typed in seat order land on the wrong players.
   - What I saw: bidding was Maya, אבי, Rachel, Omer. The results list was Rachel, Omer, Maya, אבי (shots/019-prog-r1.png).
   - I typed the tricks 5, 6, 2, 0 in seat order. The app showed "everyone fell 0" for all four, a wrong round I only caught by reading the names.
   - The saved session card then lists the round in seat order again.
2. **MAJOR: The trump winner can be marked on a player who did not make the top bid, with no warning.**
   - What I saw: Maya bid 6 and Rachel bid 3, and "Rachel won the trump: Hearts" was accepted and saved (shots/018-adv-trump.png).
   - Rulebook §2: "the player with the highest bid … sets the trump suit". The Destroyer award is counted from this mark.
3. **MINOR: A Hebrew name ending in a digit fuses with the seat number** on the bidding rows: "1. 2 שלומי" on phone (shots/027-heb-bidding.png) and "4. 2 שלומי" on desktop (shots/034-desk-bid.png). On its own the name renders correctly (shots/029-heb-session.png).
4. **MINOR: Contract bidding cannot start with the trump winner unless you know to tap them.**
   - What I saw: "Same table — X bids first" rotates the first bidder by seat, without regard to the trump winner, who in a real hand declares first after the auction.
   - The workaround works: tapping that player first moves the 13-block to the right person.
   - The only hint is the small "· or tap whoever bids first".
5. **MINOR: The card-order names differ from the rulebook.** The app says "Ace high" / "Ace high, then 2 up to King". The rulebook and the assistant say "Standard" / "Down-Up".
6. **IDEA: Record the winning auction call** (number + suit, e.g. 6♠). The app could then check that the trump winner's final bid is at least the call and show "contract 6♠" on the round.

## Verdict
PUBLISH: yes, after fixes
1. Keep one player order on the bidding and results screens (or clearly mark that results start from the trump winner).
2. Warn when the marked trump winner did not make the top bid.
3. Isolate player names (dir=auto / bdi) next to seat numbers.
